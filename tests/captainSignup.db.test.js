/**
 * 🪪 انتساب الكابتن — الطريق كاملاً على خادمٍ حقيقي.
 *
 * الاختبار النصّي (captainSignupFlow) يحرس الشيفرة من الرجوع، وهذا يمشي
 * الطريق فعلاً: يسجّل، يأخذ التوكن، يرفع به، ويحاول الدخول.
 *
 * وما يقيسه تحديداً هو ما انكسر في الإنتاج: توكن الرفع كان يُرفض على كل
 * مسار لأن قائمة المسموح تشير إلى مسارٍ لا وجود له، فوصلت الإدارة طلباتٌ
 * بلا وثيقةٍ واحدة ثم رُفضت لنقصها.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
const express = require('express');
const request = require('supertest');
const { startMongo, stopMongo, clearMongo, assertRanInCI } = require('./helpers/mongo');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-anywhere-else';

const User = require('../models/User');

const db = await startMongo();
assertRanInCI(db);

let app = null;
if (db.ok) {
    app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/auth'));
    app.use('/api/upload', require('../routes/upload'));
}

afterAll(async () => { if (db.ok) await stopMongo(); });
beforeEach(async () => { if (db.ok) await clearMongo(); });

const maybe = () => (db.ok ? describe : describe.skip);

let seq = 0;
const application = () => {
    const n = ++seq;
    return {
        name: 'كابتن تجربة', email: `cap${n}@example.com`, phone: `09123456${String(n).padStart(2,'0')}`,
        password: 'Test@1234', vehicleType: 'motorcycle', city: 'Khartoum',
        // 🪪 أحد عشر رقماً بالضبط — ما دون ذلك يردّه المُتحقِّق بـ 400.
        //    (أخطأتُ فيه أوّلاً فسقط البناء في CI: الاختبار لا يُشغَّل محلياً
        //     لأن تنزيل mongod محجوب، فلا يُكتشف إلا هناك.)
        nationalId: `999${String(n).padStart(8, '0')}`, address: 'الخرطوم — الرياض',
        whatsapp: '0912345678', emergencyContactName: 'أخ', emergencyPhone: '0912345679',
        emergencyRelation: 'أخ', pledgeText: 'أتعهد بالالتزام'
    };
};
const register = body => request(app).post('/api/auth/register-captain').send(body);

maybe()('التسجيل يُنشئ طلباً قابلاً للمراجعة', () => {
    it('ينجح ويُعيد توكن رفعٍ لا توكن دخول', async () => {
        const res = await register(application());
        expect(res.status).toBe(201);
        expect(res.body.uploadToken).toBeTruthy();
        expect(res.body.token).toBeUndefined();   // لا دخول قبل القبول
    });

    it('ولا يَعِد بشاشة OTP غير موجودة', async () => {
        const res = await register(application());
        expect(res.body.requiresOtp).toBeUndefined();
    });

    it('والحساب يبدأ معلّقاً غير مفعّل', async () => {
        const body = application();
        await register(body);
        const u = await User.findOne({ email: body.email }).lean();
        expect(u.role).toBe('captain');
        expect(u.approvalStatus).toBe('pending');
        expect(u.isVerified).toBe(false);
        expect(u.captainApplication.nationalId).toBe(body.nationalId);
    });
});

maybe()('🔴 توكن الرفع يصل إلى مسار الوثائق', () => {
    it('لا يُردّ بـ 403 «توكن مقيّد» على /api/upload/captain-docs', async () => {
        // هذا هو العطل بعينه: كانت قائمة المسموح تحوي مساراً غير موجود،
        // فيُحجب الرفع الحقيقي دائماً ولا تصل الإدارة وثيقةٌ واحدة.
        const res = await register(application());
        const up = await request(app).post('/api/upload/captain-docs')
            .set('Authorization', `Bearer ${res.body.uploadToken}`)
            .attach('idImage', Buffer.from('fake-image-bytes'), 'id.jpg');

        expect(up.status).not.toBe(403);
        expect(String(up.body.message || '')).not.toContain('مقيّد');
    });

    it('⚡ لكنه يبقى مقيّداً — لا يفتح بقيّة التطبيق', async () => {
        const res = await register(application());
        const me = await request(app).get('/api/auth/me')
            .set('Authorization', `Bearer ${res.body.uploadToken}`);
        expect(me.status).toBe(403);
    });
});

maybe()('الدخول قبل القبول يقول الحقيقة', () => {
    it('«قيد المراجعة» لا «فعّل حسابك»', async () => {
        const body = application();
        await register(body);
        const res = await request(app).post('/api/auth/login')
            .send({ email: body.email, password: body.password });

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('قيد المراجعة');
        expect(res.body.code).not.toBe('ACCOUNT_NOT_VERIFIED');
    });

    it('وبعد القبول يدخل', async () => {
        const body = application();
        await register(body);
        await User.updateOne({ email: body.email },
            { $set: { approvalStatus: 'approved', isVerified: true, isActive: true } });

        const res = await request(app).post('/api/auth/login')
            .send({ email: body.email, password: body.password });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
    });
});
