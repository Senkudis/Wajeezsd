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

/**
 * يسجّل ويتأكّد أن التسجيل وقع فعلاً.
 *
 * ⚠️ `await register(...)` بلا فحصٍ يبتلع الفشل: الملف يسجّل سبع مرّات
 *    و otpLimiter يسمح بخمسٍ في خمس دقائق من نفس العنوان، فالسادسة
 *    والسابعة تُردّان بـ 429 — ثم تفشل اختبارات الدخول بـ 400 لأن
 *    المستخدم لم يُنشأ أصلاً، فيبدو العطل في الدخول وهو في التسجيل.
 *    (سقط البناء في CI مرّتين بسبب هذا.)
 */
async function registerOk(body) {
    const res = await register(body);
    if (res.status !== 201) {
        throw new Error(`تعذّر التسجيل (${res.status}): ${JSON.stringify(res.body)}`);
    }
    return res;
}

maybe()('التسجيل يُنشئ طلباً قابلاً للمراجعة', () => {
    // 🧮 الفحوص مجموعةٌ في اختبارٍ واحد عمداً.
    //
    //    otpLimiter يسمح بخمس تسجيلات في خمس دقائق من نفس العنوان، وكل
    //    `it` يحتاج تسجيلاً لأن beforeEach يمسح القاعدة. فتفريقها على
    //    ثلاثة اختبارات يستهلك الحدّ ويجعل ما بعدها يفشل لسببٍ لا علاقة
    //    له بما تفحصه. والحدّ حمايةٌ حقيقية لا تُخفَّض من أجل الاختبار.
    it('يُعيد توكن رفعٍ لا توكن دخول، ولا يَعِد بشاشة OTP، والحساب يبدأ معلّقاً', async () => {
        const body = application();
        const res = await registerOk(body);

        expect(res.body.uploadToken).toBeTruthy();
        expect(res.body.token).toBeUndefined();        // لا دخول قبل القبول
        expect(res.body.requiresOtp).toBeUndefined();  // لا شاشةَ OTP موجودة

        const u = await User.findOne({ email: body.email }).lean();
        expect(u.role).toBe('captain');
        expect(u.approvalStatus).toBe('pending');
        expect(u.isVerified).toBe(false);
        expect(u.captainApplication.nationalId).toBe(body.nationalId);
    });
});

maybe()('🔴 توكن الرفع يصل إلى مسار الوثائق', () => {
    it('يُقبل على /api/upload/captain-docs ويبقى مقيّداً عمّا سواه', async () => {
        // العطل بعينه: قائمة المسموح كانت تحوي مساراً غير موجود، فيُحجب
        // الرفع الحقيقي دائماً ولا تصل الإدارة وثيقةٌ واحدة.
        const res = await registerOk(application());
        const token = res.body.uploadToken;

        const up = await request(app).post('/api/upload/captain-docs')
            .set('Authorization', `Bearer ${token}`)
            .attach('idImage', Buffer.from('fake-image-bytes'), 'id.jpg');
        expect(up.status).not.toBe(403);
        expect(String(up.body.message || '')).not.toContain('مقيّد');

        // ⚡ ولا يفتح بقيّة التطبيق
        const me = await request(app).get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`);
        expect(me.status).toBe(403);
    });
});

maybe()('الدخول قبل القبول يقول الحقيقة', () => {
    it('«قيد المراجعة» لا «فعّل حسابك»', async () => {
        const body = application();
        await registerOk(body);
        const res = await request(app).post('/api/auth/login')
            .send({ email: body.email, password: body.password });

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('قيد المراجعة');
        expect(res.body.code).not.toBe('ACCOUNT_NOT_VERIFIED');
    });

    it('وبعد القبول يدخل', async () => {
        const body = application();
        await registerOk(body);
        await User.updateOne({ email: body.email },
            { $set: { approvalStatus: 'approved', isVerified: true, isActive: true } });

        const res = await request(app).post('/api/auth/login')
            .send({ email: body.email, password: body.password });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
    });
});
