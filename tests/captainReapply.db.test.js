/**
 * 🔁 إعادة تقديم الكابتن المرفوض — على خادمٍ حقيقيّ وقاعدةٍ حقيقية.
 *
 * ⚠️ حدّ otpLimiter: خمسة طلبات register-captain في خمس دقائق من العنوان
 *    نفسه. هذا الملف يستدعيه أربع مرّاتٍ فقط، عمداً — انظر
 *    captainRegistrationLock.db.test.js.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
const express = require('express');
const request = require('supertest');
const { startMongo, stopMongo, clearMongo, assertRanInCI } = require('./helpers/mongo');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-anywhere-else';

const User = require('../models/User');
const Settings = require('../models/Settings');
const { normalizePhone } = require('../utils/phoneNormalizer');

const db = await startMongo();
assertRanInCI(db);

let app = null;
if (db.ok) {
    app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/auth'));
}

afterAll(async () => { if (db.ok) await stopMongo(); });
beforeEach(async () => {
    if (!db.ok) return;
    await clearMongo();
    await Settings.findOneAndUpdate({ city: 'Khartoum' }, { $set: { captainRegistrationOpen: true } }, { upsert: true, new: true });
});

const maybe = () => (db.ok ? describe : describe.skip);

let seq = 0;
const PASSWORD = 'Test@1234';
const REASON = 'صورة الهوية غير واضحة';

/** يُعيد الحساب ورقمه كما يكتبه صاحبه (المخزَّن مُطبَّع 249…) */
async function rejectedCaptain(app = {}) {
    const n = ++seq;
    const local = `091234${String(n).padStart(4, '0')}`;
    const user = await User.create({
        name: 'كابتن مرفوض', email: `rej${n}@example.com`, phone: normalizePhone(local),
        password: PASSWORD, role: 'captain', city: 'Khartoum', vehicleType: 'motorcycle',
        approvalStatus: 'rejected', isActive: false, rejectionReason: REASON,
        captainApplication: { nationalId: `777${String(n).padStart(8, '0')}`, rejectionReason: REASON, ...app }
    });
    return { u: user, local };
}

/** ملفّ تسجيلٍ كامل — بهاتف الحساب المرفوض ما لم يُعطَ غيره */
const body = (phone, over = {}) => ({
    name: 'كابتن مرفوض', email: `new${++seq}@example.com`, phone, password: PASSWORD, city: 'Khartoum',
    vehicleType: 'motorcycle', nationalId: `666${String(seq).padStart(8, '0')}`,
    address: 'الخرطوم — الرياض', whatsapp: '0912345678',
    emergencyContactName: 'أخ', emergencyPhone: '0912345679', emergencyRelation: 'أخ',
    pledgeText: 'أتعهد بالالتزام', ...over
});
const register = (b) => request(app).post('/api/auth/register-captain').send(b);
const login = (phone, password = PASSWORD) => request(app).post('/api/auth/login').send({ email: phone, password });

maybe()('الكابتن المرفوض', () => {
    it('🔑 الدخول يقول «مرفوض» بسببه ويدلّه على إعادة التقديم — لا «حسابك موقوف»', async () => {
        const { u, local } = await rejectedCaptain();
        const res = await login(local);
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ rejected: true, canReapply: true });
        expect(res.body.message).toContain(REASON);
        expect(res.body.message).not.toContain('موقوف');
    });

    it('بكلمة مرورٍ غير التي سجّل بها ← 409 ولا يُمسّ الحساب', async () => {
        const { u, local } = await rejectedCaptain();
        const res = await register(body(local, { password: 'Other@9999' }));
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ wrongPassword: true, canReapply: true });
        const after = await User.findById(u._id).lean();
        expect(after.approvalStatus).toBe('rejected');
    });

    it('🔑 بنفس الرقم وكلمة المرور ← يعود «قيد المراجعة» على حسابه نفسه', async () => {
        const { u, local } = await rejectedCaptain();
        const before = await User.countDocuments();
        const res = await register(body(local, { vehicleType: 'car' }));
        expect(res.status).toBe(201);
        expect(res.body.reapplied).toBe(true);
        expect(res.body.uploadToken).toBeTruthy();
        expect(await User.countDocuments()).toBe(before);   // لا حساب ثانٍ

        const after = await User.findById(u._id).lean();
        expect(after.approvalStatus).toBe('pending');
        expect(after.isActive).toBe(true);
        expect(after.vehicleType).toBe('car');
        expect(after.email).toBe(u.email);                 // الهويّة لا تتغيّر من مسارٍ غير مُصادَق
        expect(after.captainApplication).toMatchObject({
            status: 'pending', reapplyCount: 1, previousRejectionReason: REASON, reapplyBlocked: false
        });

        // عاد معلّقاً بلا وثائق ⇒ يُوجَّه لرفعها، لا «مرفوض» ولا «موقوف»
        const again = await login(local);
        expect(again.status).toBe(403);
        expect(again.body.needsDocs).toBe(true);
        expect(again.body.rejected).toBeUndefined();
        expect(again.body.message).not.toContain('موقوف');

        // وبعد اكتمالها ⇒ «قيد المراجعة»
        await User.updateOne({ _id: u._id }, { $set: {
            'documents.idImage': 'x.jpg', 'documents.selfieImage': 'x.jpg',
            'documents.profilePhoto': 'x.jpg', 'documents.vehiclePhoto': 'x.jpg'
        } });
        const ready = await login(local);
        expect(ready.status).toBe(403);
        expect(ready.body.message).toContain('قيد المراجعة');
    });

    it('🔒 المرفوض نهائياً ← 409 ولا إعادة', async () => {
        const { u, local } = await rejectedCaptain({ reapplyBlocked: true });
        const res = await register(body(local));
        expect(res.status).toBe(409);
        expect(res.body.reapplyBlocked).toBe(true);
        expect((await User.findById(u._id).lean()).approvalStatus).toBe('rejected');
        const l = await login(local);
        expect(l.body.canReapply).toBe(false);
    });

    it('برقم هاتفٍ جديد والرقم الوطني نفسه ← يُدَلّ على حسابه القديم، ولا حساب ثانٍ', async () => {
        const { u, local } = await rejectedCaptain();
        const before = await User.countDocuments();
        const res = await register(body('0999888777', { nationalId: u.captainApplication.nationalId }));
        expect(res.status).toBe(409);
        expect(res.body.canReapply).toBe(true);
        expect(await User.countDocuments()).toBe(before);
    });
});
