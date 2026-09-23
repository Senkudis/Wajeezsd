/**
 * 🔒 باب تسجيل الكباتن — على خادمٍ حقيقيّ وقاعدةٍ حقيقية.
 *
 * الاختبار النصّيّ (captainRegistrationLock.test.js) يحرس الشيفرة، وهذا
 * يمشي الطريق فعلاً: قاعدةٌ فارغة ← الباب مغلق ← الإدارة تفتحه ← يمرّ
 * التسجيل — ومن البابين كليهما.
 *
 * ⚠️ حدّ otpLimiter: خمس تسجيلاتٍ في خمس دقائق من العنوان نفسه، وكل طلبٍ
 *    يُحتسب — المرفوض بالإغلاق أيضاً. هذا الملف يستدعي register-captain
 *    ثلاث مرّاتٍ فقط، عمداً. (سقط CI مرّتين من قبل بتجاوز الحدّ في ملف
 *    captainSignup.db.test.js، ولذلك هذه الاختبارات في ملفٍّ مستقلّ:
 *    Vitest يعزل الملفات، فلكلٍّ محدِّدٌ جديد وقاعدةٌ مستقلّة.)
 *    captain-application لا يمرّ بهذا الحدّ.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
const express = require('express');
const request = require('supertest');
const { startMongo, stopMongo, clearMongo, assertRanInCI } = require('./helpers/mongo');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-anywhere-else';

const User = require('../models/User');
const Settings = require('../models/Settings');
const AdminLog = require('../models/AdminLog');
const { signUserToken } = require('../utils/authToken');

const db = await startMongo();
assertRanInCI(db);

let app = null;
if (db.ok) {
    app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/auth'));
    app.use('/api/admin', require('../routes/admin/settings'));
}

afterAll(async () => { if (db.ok) await stopMongo(); });
beforeEach(async () => { if (db.ok) await clearMongo(); });

const maybe = () => (db.ok ? describe : describe.skip);

// ─── أدوات ───────────────────────────────────────────────────────────────
let seq = 0;

/** ملفّ انتسابٍ صالح — الحقول نفسها التي يقبلها captainApplicationSchema */
const applicationFields = () => {
    const n = ++seq;
    return {
        vehicleType: 'motorcycle',
        // 🪪 أحد عشر رقماً بالضبط — ما دون ذلك يردّه المُتحقِّق بـ 400
        nationalId: `888${String(n).padStart(8, '0')}`,
        address: 'الخرطوم — الرياض',
        whatsapp: '0912345678',
        emergencyContactName: 'أخ', emergencyPhone: '0912345679', emergencyRelation: 'أخ',
        pledgeText: 'أتعهد بالالتزام'
    };
};

/** طلب تسجيلٍ جديد كامل لمدينةٍ بعينها */
const newCaptain = (city = 'Khartoum') => {
    const n = ++seq;
    return {
        name: 'كابتن تجربة', email: `lock${n}@example.com`,
        phone: `09223344${String(n).padStart(2, '0')}`,
        password: 'Test@1234', city,
        ...applicationFields()
    };
};

async function openCity(city, open = true) {
    await Settings.findOneAndUpdate(
        { city }, { $set: { captainRegistrationOpen: open } }, { upsert: true, new: true }
    );
}

async function makeUser(over = {}) {
    const user = await User.create({
        name: 'مستخدم', phone: `09556677${String(++seq).padStart(3, '0')}`,
        password: 'x'.repeat(60), city: 'Khartoum', isActive: true,
        ...over
    });
    return { user, token: signUserToken(user) };
}

const status = () => request(app).get('/api/auth/captain-registration-status');
const register = (body) => request(app).post('/api/auth/register-captain').send(body);
const applyAs = (token, body) => request(app).post('/api/auth/captain-application')
    .set('Authorization', `Bearer ${token}`).send(body);
const adminPut = (token, body) => request(app).put('/api/admin/settings')
    .set('Authorization', `Bearer ${token}`).send(body);

// ─── ١. مغلقٌ افتراضياً ──────────────────────────────────────────────────
maybe()('الباب مغلقٌ على قاعدةٍ لم يُفتح فيها', () => {
    it('الحالة: المدينتان مغلقتان', async () => {
        const res = await status();
        expect(res.status).toBe(200);
        expect(res.body.open).toEqual({ Khartoum: false, PortSudan: false });
        expect(res.headers['cache-control']).toContain('no-store');
    });

    it('register-captain يُردّ بـ 403 ولا يُنشئ حساباً', async () => {   // تسجيل ١
        const body = newCaptain('Khartoum');
        const res = await register(body);
        expect(res.status).toBe(403);
        expect(res.body.registrationClosed).toBe(true);
        expect(res.body.message).toContain('الخرطوم');
        expect(await User.countDocuments({ email: body.email })).toBe(0);
    });
});

// ─── ٢. الإدارة تفتحه ────────────────────────────────────────────────────
maybe()('الإدارة تفتح الباب لمدينة', () => {
    it('المسؤول الرئيسي يفتح الخرطوم ← يُسجَّل الاتجاه ← يمرّ التسجيل', async () => {   // تسجيل ٢
        const { token } = await makeUser({ role: 'admin' });

        const put = await adminPut(token, { city: 'Khartoum', captainRegistrationOpen: true });
        expect(put.status).toBe(200);
        expect(put.body.settings.captainRegistrationOpen).toBe(true);

        expect((await status()).body.open).toEqual({ Khartoum: true, PortSudan: false });

        // الأثر في سجلّ النشاط — لو لم يكن الفعل معرَّفاً في AdminLog لرُفض
        // وابتلع adminLogger الخطأ، فلا يوجد سطرٌ هنا.
        const log = await AdminLog.findOne({ action: 'captain_registration_toggle' }).lean();
        expect(log).toBeTruthy();
        expect(log.description).toContain('فُتح');
        expect(log.description).toContain('الخرطوم');

        const res = await register(newCaptain('Khartoum'));
        expect(res.status).toBe(201);
    });

    it('كل مدينةٍ بابها — فتح الخرطوم لا يفتح بورتسودان', async () => {   // تسجيل ٣
        await openCity('Khartoum', true);
        const res = await register(newCaptain('PortSudan'));
        expect(res.status).toBe(403);
        expect(res.body.message).toContain('بورتسودان');
    });

    it('قيمةٌ غير منطقية تُرفض بـ 400 ولا تفتح شيئاً', async () => {
        const { token } = await makeUser({ role: 'admin' });
        const put = await adminPut(token, { city: 'Khartoum', captainRegistrationOpen: 'yes' });
        expect(put.status).toBe(400);
        expect((await status()).body.open.Khartoum).toBe(false);
    });

    it('والأدمن المساعد لا يستطيع', async () => {
        const { token } = await makeUser({ role: 'admin', adminRole: 'sub_admin' });
        const put = await adminPut(token, { city: 'Khartoum', captainRegistrationOpen: true });
        expect(put.status).toBe(403);
        expect((await status()).body.open.Khartoum).toBe(false);
    });

    it('والإغلاق يُسجَّل بـ «أُغلق»', async () => {
        await openCity('PortSudan', true);
        const { token } = await makeUser({ role: 'admin' });
        const put = await adminPut(token, { city: 'PortSudan', captainRegistrationOpen: false });
        expect(put.status).toBe(200);
        const log = await AdminLog.findOne({ action: 'captain_registration_toggle' }).lean();
        expect(log.description).toContain('أُغلق');
        expect(log.description).toContain('بورتسودان');
    });
});

// ─── ٣. الباب الثاني: ترقية عميلٍ قائم ──────────────────────────────────
maybe()('ترقية العميل إلى كابتن تمرّ بالباب نفسه', () => {
    it('مغلق ← 403، ولا يُحفظ ملفّ الانتساب', async () => {
        const { user, token } = await makeUser({ role: 'client', city: 'Khartoum' });
        const res = await applyAs(token, applicationFields());
        expect(res.status).toBe(403);
        expect(res.body.registrationClosed).toBe(true);

        // الحالة الافتراضية في النموذج 'none' لا غياب — فيُفحص أنها لم تصر
        // 'pending' ولم يُكتب شيءٌ من الملفّ (toBeFalsy كانت ستسقط على 'none').
        const fresh = await User.findById(user._id).lean();
        expect(fresh.captainApplication.status).toBe('none');
        expect(fresh.captainApplication.nationalId).toBeFalsy();
        expect(fresh.role).toBe('client');
    });

    it('يُفحص باب مدينة الحساب — لا ما يُرسَل في الطلب', async () => {
        await openCity('Khartoum', true);
        const { token } = await makeUser({ role: 'client', city: 'PortSudan' });
        const res = await applyAs(token, { ...applicationFields(), city: 'Khartoum' });
        expect(res.status).toBe(403);
        expect(res.body.message).toContain('بورتسودان');
    });

    it('مفتوح ← 201 والطلب معلّقٌ للمراجعة', async () => {
        await openCity('Khartoum', true);
        const { user, token } = await makeUser({ role: 'client', city: 'Khartoum' });
        const res = await applyAs(token, applicationFields());
        expect(res.status).toBe(201);
        const fresh = await User.findById(user._id).lean();
        expect(fresh.captainApplication.status).toBe('pending');
        expect(fresh.role).toBe('client');   // الترقية عند القبول وحده
    });

    it('صاحب الطلب المعلّق يرى حالة طلبه لا «مغلق»', async () => {
        const { token } = await makeUser({
            role: 'client', city: 'Khartoum',
            captainApplication: { status: 'pending', nationalId: '77700000001' }
        });
        const res = await applyAs(token, applicationFields());
        expect(res.status).toBe(409);
        expect(res.body.applicationStatus).toBe('pending');
    });
});
