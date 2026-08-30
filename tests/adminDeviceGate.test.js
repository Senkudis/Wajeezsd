/**
 * 🔐 بوابة الأجهزة الموثوقة للأدمن المساعد.
 *
 * لماذا هذه الاختبارات: البوابة كانت واجهةً فقط. رد `202 requiresApproval`
 * كان يحمل التوكن الكامل الصالح سبعة أيام، فمن يعرف كلمة مرور أدمن مساعد
 * يتجاهل شاشة الانتظار ويستعمل التوكن مباشرةً. وكان `GET /session-requests/:id`
 * مكشوفاً يُظهر حالة أي طلب لمن يعرف المعرّف وحده.
 *
 * ما يُثبَّت هنا: لا توكن في رد 202 إطلاقاً، ولا يُسلَّم إلا للجهاز صاحب
 * الطلب، بعد الموافقة، ومرة واحدة.
 *
 * ⚠️ ملاحظة على أسلوب المحاكاة: `vi.mock` لا يعمل هنا. المسار وحدة CommonJS
 *    و `require('../../models/User')` داخله يُحمّل نسخة مستقلة تماماً عن أي
 *    `import` في هذا الملف (والدليل: استيراد النموذج هنا يرمي
 *    OverwriteModelError عند تحميل المسار). لذا نأخذ الكائن المفرد من سجلّ
 *    mongoose **بعد** تحميل المسار — وهو بعينه ما يمسكه المسار — ونتجسّس عليه.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

// أي استعلام يفلت من التجسّس يفشل فوراً بدل انتظار مهلة التخزين المؤقت
mongoose.set('bufferCommands', false);

const adminAuthRouter = (await import('../routes/admin/auth.js')).default;
const User = mongoose.models.User;
const SessionRequest = mongoose.models.SessionRequest;

const bcryptMod = await import('bcryptjs');
const bcrypt = bcryptMod.default || bcryptMod;

const ADMIN_ID = '507f1f77bcf86cd799439011';
const REQ_ID = '507f1f77bcf86cd799439012';
const DEVICE = 'device-abc';
const PASSWORD = 'correct-horse';

// تجزئة حقيقية بدل محاكاة bcrypt — أبسط وأقرب للواقع
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 8);

function app() {
    const instance = express();
    instance.use(express.json());
    instance.use('/api/admin', adminAuthRouter);
    return instance;
}

function subAdmin(overrides = {}) {
    return {
        _id: ADMIN_ID,
        name: 'أدمن مساعد',
        role: 'admin',
        adminRole: 'sub_admin',
        email: 'sub@wajeezsd.com',
        phone: '0912345678',
        password: PASSWORD_HASH,
        isActive: true,
        permissions: ['view_orders'],
        city: 'Khartoum',
        // جهاز موثوق سابق ⇒ لا يُعدّ أول دخول (وإلا مُنح الثقة تلقائياً)
        trustedDevices: [{ deviceId: 'old-device', deviceInfo: 'قديم' }],
        ...overrides
    };
}

function login(body) {
    return request(app()).post('/api/admin/login').send(body);
}

function claim(body, id = REQ_ID) {
    return request(app()).post(`/api/admin/session-requests/${id}/claim`).send(body);
}

beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';
    vi.spyOn(SessionRequest, 'deleteMany').mockResolvedValue({});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('POST /api/admin/login — جهاز جديد', () => {
    let created;

    beforeEach(() => {
        created = null;
        vi.spyOn(User, 'findOne').mockResolvedValue(subAdmin());
        vi.spyOn(SessionRequest, 'create').mockImplementation(async (doc) => {
            created = doc;
            return { ...doc, _id: REQ_ID };
        });
    });

    it('🔒 رد 202 لا يحمل التوكن ولا بيانات المستخدم', async () => {
        const res = await login({ email: 'sub@wajeezsd.com', password: PASSWORD, deviceId: DEVICE, deviceInfo: 'Chrome' });

        expect(res.status).toBe(202);
        expect(res.body.requiresApproval).toBe(true);
        expect(res.body.requestId).toBeTruthy();

        // جوهر الإصلاح — أي تسريب هنا يُعيد الثغرة
        expect(res.body.token).toBeUndefined();
        expect(res.body.user).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toMatch(/eyJ/); // لا JWT في أي حقل مهما كان اسمه
    });

    it('التوكن يُحفَظ في السجل بانتظار الموافقة', async () => {
        await login({ email: 'sub@wajeezsd.com', password: PASSWORD, deviceId: DEVICE, deviceInfo: 'Chrome' });

        expect(created).toBeTruthy();
        expect(created.status).toBe('pending');
        expect(created.tempToken).toMatch(/^eyJ/);
        expect(created.deviceId).toBe(DEVICE);
    });

    it('كلمة مرور خاطئة لا تُنشئ طلب جهاز أصلاً', async () => {
        const res = await login({ email: 'sub@wajeezsd.com', password: 'wrong', deviceId: DEVICE });

        expect(res.status).toBe(400);
        expect(created).toBeNull();
    });
});

describe('POST /api/admin/session-requests/:id/claim', () => {
    it('🔒 بلا معرّف جهاز ⇒ 400', async () => {
        const res = await claim({});
        expect(res.status).toBe(400);
        expect(res.body.token).toBeUndefined();
    });

    it('🔒 جهاز غير مطابق ⇒ 404 بنفس رد الطلب غير الموجود', async () => {
        vi.spyOn(SessionRequest, 'findById').mockResolvedValue({
            _id: REQ_ID, deviceId: DEVICE, status: 'approved', tempToken: 'eyJsecret'
        });
        const wrongDevice = await claim({ deviceId: 'someone-elses-device' });

        expect(wrongDevice.status).toBe(404);
        expect(wrongDevice.body.token).toBeUndefined();

        // لا يُميَّز عن الطلب غير الموجود — وإلا صار المسار أداة تعداد
        SessionRequest.findById.mockResolvedValue(null);
        const missing = await claim({ deviceId: DEVICE });
        expect(missing.status).toBe(404);
        expect(missing.body.message).toBe(wrongDevice.body.message);
    });

    it('🔒 طلب معلّق ⇒ الحالة فقط بلا توكن', async () => {
        vi.spyOn(SessionRequest, 'findById').mockResolvedValue({
            _id: REQ_ID, deviceId: DEVICE, status: 'pending', tempToken: 'eyJsecret', expiresAt: new Date()
        });
        const res = await claim({ deviceId: DEVICE });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('pending');
        expect(res.body.token).toBeUndefined();
    });

    it('🔒 طلب مرفوض ⇒ الحالة فقط بلا توكن', async () => {
        vi.spyOn(SessionRequest, 'findById').mockResolvedValue({
            _id: REQ_ID, deviceId: DEVICE, status: 'rejected', tempToken: 'eyJsecret'
        });
        const res = await claim({ deviceId: DEVICE });

        expect(res.body.status).toBe('rejected');
        expect(res.body.token).toBeUndefined();
    });

    it('✅ بعد الموافقة ⇒ التوكن يُسلَّم مع بيانات المستخدم بلا كلمة المرور', async () => {
        vi.spyOn(SessionRequest, 'findById').mockResolvedValue({
            _id: REQ_ID, admin: ADMIN_ID, deviceId: DEVICE, status: 'approved', tempToken: 'eyJsecret'
        });
        // المستند كما كان قبل محو التوكن ذرّياً
        vi.spyOn(SessionRequest, 'findOneAndUpdate').mockResolvedValue({ tempToken: 'eyJsecret' });
        vi.spyOn(User, 'findById').mockReturnValue({
            select: () => ({ lean: async () => subAdmin() })
        });

        const res = await claim({ deviceId: DEVICE });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('approved');
        expect(res.body.token).toBe('eyJsecret');
        expect(res.body.user.adminRole).toBe('sub_admin');
        expect(res.body.user.password).toBeUndefined();
    });

    it('🔒 مرة واحدة فقط — الاستلام الثاني ⇒ 410 بلا توكن', async () => {
        vi.spyOn(SessionRequest, 'findById').mockResolvedValue({
            _id: REQ_ID, admin: ADMIN_ID, deviceId: DEVICE, status: 'approved', tempToken: null
        });
        // المحو الذرّي لم يجد توكناً ⇒ سُلِّم في نداء سابق
        vi.spyOn(SessionRequest, 'findOneAndUpdate').mockResolvedValue(null);

        const res = await claim({ deviceId: DEVICE });

        expect(res.status).toBe(410);
        expect(res.body.token).toBeUndefined();
    });
});

describe('POST /api/admin/login — المسارات التي لم تتغيّر', () => {
    it('super_admin يدخل مباشرةً بتوكن', async () => {
        vi.spyOn(User, 'findOne').mockResolvedValue(subAdmin({ adminRole: 'super_admin' }));
        const res = await login({ email: 'boss@wajeezsd.com', password: PASSWORD, deviceId: DEVICE });

        expect(res.status).toBe(200);
        expect(res.body.token).toMatch(/^eyJ/);
    });

    it('جهاز موثوق سابقاً يدخل مباشرةً', async () => {
        vi.spyOn(User, 'findOne').mockResolvedValue(subAdmin());
        const res = await login({ email: 'sub@wajeezsd.com', password: PASSWORD, deviceId: 'old-device' });

        expect(res.status).toBe(200);
        expect(res.body.token).toMatch(/^eyJ/);
    });

    it('أول دخول للأدمن المساعد يُوثّق الجهاز تلقائياً بلا انتظار', async () => {
        vi.spyOn(User, 'findOne').mockResolvedValue(subAdmin({ trustedDevices: [] }));
        vi.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({});
        const res = await login({ email: 'sub@wajeezsd.com', password: PASSWORD, deviceId: 'first-device' });

        expect(res.status).toBe(200);
        expect(res.body.token).toMatch(/^eyJ/);
    });

    it('حساب موقوف يُرفض قبل أي فحص جهاز', async () => {
        vi.spyOn(User, 'findOne').mockResolvedValue(subAdmin({ isActive: false }));
        const res = await login({ email: 'sub@wajeezsd.com', password: PASSWORD, deviceId: DEVICE });

        expect(res.status).toBe(403);
        expect(res.body.token).toBeUndefined();
    });
});
