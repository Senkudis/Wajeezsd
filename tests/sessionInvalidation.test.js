/**
 * 🔒 إبطال الجلسات (tokenVersion) وفحص بريد Google المؤكَّد.
 *
 * لماذا: لم يكن هناك أي وسيلة لإسقاط توكن صادر. تغيير كلمة المرور لا يُنهي
 * الجلسات القائمة، ولا يوجد "خروج من كل الأجهزة" — فتوكن مسروق واحد يبقى
 * صالحاً سبعة أيام مهما فعل صاحب الحساب. و`/refresh` يجدّده بلا سقف مطلق.
 *
 * وفي دخول Google كان البريد يُؤخذ من الحمولة بلا فحص `email_verified`،
 * والبريد هو مفتاح مطابقة الحساب الموجود ⇒ هوية غير مؤكَّدة تُطابق حساب غيرها.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

mongoose.set('bufferCommands', false);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';

const { signUserToken } = await import('../utils/authToken.js');
const authMiddleware = await import('../middleware/authMiddleware.js');
const authRouter = (await import('../routes/auth.js')).default;
const { OAuth2Client } = await import('google-auth-library');
const User = mongoose.models.User;

function authApp() {
    const instance = express();
    instance.use(express.json());
    instance.use('/api/auth', authRouter);
    return instance;
}

const USER_ID = '507f1f77bcf86cd799439011';

function baseUser(overrides = {}) {
    return {
        _id: USER_ID,
        name: 'عميل',
        role: 'client',
        isActive: true,
        tokenVersion: 0,
        ...overrides
    };
}

// تطبيق صغير محميّ بالوسيط وحده — يعزل سلوك الحراسة عن أي مسار
function guardedApp() {
    const app = express();
    app.use(express.json());
    app.get('/protected', authMiddleware.protect, (req, res) => res.json({ ok: true }));
    return app;
}

afterEach(() => vi.restoreAllMocks());

describe('signUserToken', () => {
    it('يُدرج نسخة الجلسة في كل توكن', () => {
        const decoded = jwt.verify(signUserToken(baseUser({ tokenVersion: 3 })), process.env.JWT_SECRET);
        expect(decoded.tv).toBe(3);
        expect(decoded.userId).toBe(USER_ID);
        expect(decoded.role).toBe('client');
    });

    it('يعامل المستخدم بلا نسخة كـ 0', () => {
        const user = baseUser();
        delete user.tokenVersion;
        expect(jwt.verify(signUserToken(user), process.env.JWT_SECRET).tv).toBe(0);
    });

    it('يقبل تجاوز الدور والمدة والحقول الإضافية', () => {
        const token = signUserToken(baseUser(), {
            role: 'captain',
            expiresIn: '1h',
            claims: { scope: 'upload_only' }
        });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        expect(decoded.role).toBe('captain');
        expect(decoded.scope).toBe('upload_only');
        // ساعة واحدة لا سبعة أيام
        expect(decoded.exp - decoded.iat).toBe(3600);
    });
});

describe('protect — فحص نسخة الجلسة', () => {
    function call(token) {
        return request(guardedApp()).get('/protected').set('Authorization', `Bearer ${token}`);
    }

    it('✅ نسخة مطابقة ⇒ يمرّ', async () => {
        const user = baseUser({ tokenVersion: 2 });
        vi.spyOn(User, 'findById').mockReturnValue({ select: async () => user });

        const res = await call(signUserToken(user));
        expect(res.status).toBe(200);
    });

    it('🔒 توكن صادر قبل رفع النسخة ⇒ 401', async () => {
        const before = baseUser({ tokenVersion: 2 });
        const staleToken = signUserToken(before);

        // رُفعت النسخة بعد إصدار التوكن (تغيير كلمة مرور مثلاً)
        vi.spyOn(User, 'findById').mockReturnValue({ select: async () => baseUser({ tokenVersion: 3 }) });

        const res = await call(staleToken);
        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(/انتهت صلاحية الجلسة/);
    });

    it('🔄 توكن قديم بلا حقل tv يبقى صالحاً ما دامت النسخة 0', async () => {
        // توكنات ما قبل هذا التغيير — رفضها كان سيُخرج كل المستخدمين عند النشر
        const legacyToken = jwt.sign(
            { userId: USER_ID, role: 'client' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        vi.spyOn(User, 'findById').mockReturnValue({ select: async () => baseUser({ tokenVersion: 0 }) });

        expect((await call(legacyToken)).status).toBe(200);
    });

    it('🔒 لكنه يسقط فور أول رفع للنسخة', async () => {
        const legacyToken = jwt.sign(
            { userId: USER_ID, role: 'client' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        vi.spyOn(User, 'findById').mockReturnValue({ select: async () => baseUser({ tokenVersion: 1 }) });

        expect((await call(legacyToken)).status).toBe(401);
    });

    it('🔒 الحساب الموقوف يُرفض قبل فحص النسخة', async () => {
        const user = baseUser({ isActive: false });
        vi.spyOn(User, 'findById').mockReturnValue({ select: async () => user });

        const res = await call(signUserToken(user));
        expect(res.status).toBe(403);
    });

    it('🔒 مستخدم محذوف من القاعدة ⇒ 401', async () => {
        vi.spyOn(User, 'findById').mockReturnValue({ select: async () => null });
        expect((await call(signUserToken(baseUser()))).status).toBe(401);
    });
});

describe('POST /api/auth/logout-all', () => {
    it('🔒 بلا توكن ⇒ 401', async () => {
        expect((await request(authApp()).post('/api/auth/logout-all')).status).toBe(401);
    });

    it('✅ يرفع نسخة الجلسة للمستخدم', async () => {
        const user = baseUser({ tokenVersion: 1 });
        vi.spyOn(User, 'findById').mockReturnValue({ select: async () => user });

        let update = null;
        vi.spyOn(User, 'findByIdAndUpdate').mockImplementation(async (id, u) => {
            update = u;
            return { tokenVersion: 2 };
        });

        const res = await request(authApp())
            .post('/api/auth/logout-all')
            .set('Authorization', `Bearer ${signUserToken(user)}`);

        expect(res.status).toBe(200);
        expect(update).toEqual({ $inc: { tokenVersion: 1 } });
    });
});

describe('isVerifiedGoogleEmail — عبر مسار /api/auth/google', () => {
    it('🔒 هوية Google ببريد غير مؤكَّد تُرفض بـ 403 ولا تُطابق أي حساب', async () => {
        vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
            getPayload: () => ({ email: 'victim@example.com', email_verified: false, name: 'م', picture: '' })
        });
        const findOne = vi.spyOn(User, 'findOne').mockResolvedValue(baseUser());

        const res = await request(authApp()).post('/api/auth/google').send({ idToken: 'x' });

        expect(res.status).toBe(403);
        expect(res.body.token).toBeUndefined();
        // الأهم: لم يُبحث عن الحساب أصلاً — الرفض قبل أي مطابقة بالبريد
        expect(findOne).not.toHaveBeenCalled();
    });

    it('🔒 حمولة بلا حقل email_verified إطلاقاً تُرفض أيضاً', async () => {
        vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
            getPayload: () => ({ email: 'victim@example.com', name: 'م' })
        });
        vi.spyOn(User, 'findOne').mockResolvedValue(baseUser());

        expect((await request(authApp()).post('/api/auth/google').send({ idToken: 'x' })).status).toBe(403);
    });

    it('✅ بريد مؤكَّد يمرّ إلى مطابقة الحساب', async () => {
        vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
            getPayload: () => ({ email: 'real@example.com', email_verified: true, name: 'م', picture: '' })
        });
        const findOne = vi.spyOn(User, 'findOne').mockResolvedValue(
            baseUser({ isVerified: true, email: 'real@example.com' })
        );

        const res = await request(authApp()).post('/api/auth/google').send({ idToken: 'x' });

        expect(findOne).toHaveBeenCalled();
        expect(res.status).toBe(200);
        expect(res.body.token).toMatch(/^eyJ/);
    });
});
