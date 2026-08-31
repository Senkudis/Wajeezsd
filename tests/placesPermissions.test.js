/**
 * 🔑 صلاحيات الأدمن المساعد على مسارات المتاجر والأقسام والمنتجات.
 *
 * كانت كل هذه المسارات محروسة بـ `protect` وحده، والدور يُفحص داخل المعالج
 * بـ `req.user.role !== 'admin'`. ذلك يمنع غير الأدمن، لكنه يتجاوز نظام
 * الصلاحيات كلياً: أدمن مساعد بقائمة صلاحيات فارغة كان يُنشئ متجراً، ويحذف
 * قسماً، ويعدّل منتجات أي متجر.
 *
 * وثلاث صلاحيات كانت معروضة في شاشة المنح ومخزَّنة في قاعدة البيانات بلا أي
 * فحص يقابلها: view_stats و manage_categories (و view_categories التي لا
 * مسار خادمياً لها أصلاً لأن قائمة الأقسام عامة).
 */

import { vi, describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

mongoose.set('bufferCommands', false);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';

const { signUserToken } = await import('../utils/authToken.js');
const placesRouter = (await import('../routes/places.js')).default;
const User = mongoose.models.User;

const ADMIN_ID = '507f1f77bcf86cd799439011';
const PLACE_ID = '507f1f77bcf86cd799439022';
const PRODUCT_ID = '507f1f77bcf86cd799439033';

function app() {
    const instance = express();
    instance.use(express.json());
    instance.use('/api/places', placesRouter);
    return instance;
}

function admin({ adminRole = 'sub_admin', permissions = [] } = {}) {
    return {
        _id: ADMIN_ID, id: ADMIN_ID, name: 'أدمن',
        role: 'admin', adminRole, permissions,
        isActive: true, tokenVersion: 0, city: 'Khartoum'
    };
}

function as(user) {
    vi.spyOn(User, 'findById').mockReturnValue({ select: async () => user });
    return `Bearer ${signUserToken(user)}`;
}

// كل مسار إداري مع الصلاحية التي تحرسه
const GUARDED = [
    ['get',    '/api/places/errand-stats',                              'view_stats'],
    ['get',    '/api/places/errand-diagnose',                           'view_stats'],
    ['post',   '/api/places/categories',                                'manage_categories'],
    ['put',    `/api/places/categories/${PLACE_ID}`,                    'manage_categories'],
    ['delete', `/api/places/categories/${PLACE_ID}`,                    'manage_categories'],
    ['post',   '/api/places',                                           'manage_stores'],
    ['put',    `/api/places/${PLACE_ID}`,                               'manage_stores'],
    ['delete', `/api/places/${PLACE_ID}`,                               'manage_stores'],
    ['get',    `/api/places/${PLACE_ID}/products/admin`,                'view_stores'],
    ['post',   `/api/places/${PLACE_ID}/products`,                      'manage_stores'],
    ['put',    `/api/places/${PLACE_ID}/products/${PRODUCT_ID}`,        'manage_stores'],
    ['delete', `/api/places/${PLACE_ID}/products/${PRODUCT_ID}`,        'manage_stores']
];

afterEach(() => vi.restoreAllMocks());

describe('🔒 أدمن مساعد بلا صلاحيات — يُمنع من كل مسار إداري', () => {
    it.each(GUARDED)('%s %s ⇒ 403', async (method, path) => {
        const auth = as(admin({ permissions: [] }));
        const res = await request(app())[method](path).set('Authorization', auth).send({ name: 'x' });

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/تحتاج صلاحية|غير مصرح/);
    });
});

describe('🔒 الصلاحية الخطأ لا تفتح المسار', () => {
    it.each(GUARDED)('%s %s لا تكفيه view_orders', async (method, path) => {
        const auth = as(admin({ permissions: ['view_orders', 'view_captains'] }));
        const res = await request(app())[method](path).set('Authorization', auth).send({ name: 'x' });

        expect(res.status).toBe(403);
    });
});

describe('✅ الصلاحية الصحيحة تتجاوز البوابة', () => {
    it.each(GUARDED)('%s %s مع %s', async (method, path, perm) => {
        const auth = as(admin({ permissions: [perm] }));
        const res = await request(app())[method](path).set('Authorization', auth).send({ name: 'x' });

        // ما بعد البوابة يضرب قاعدة البيانات (غير متصلة) أو يتحقّق من المدخلات،
        // فالمهم هنا أن الرد لم يعد 403 — أي أن الحارس مرّره.
        expect(res.status).not.toBe(403);
    });
});

describe('✅ المسؤول الرئيسي يمرّ دائماً', () => {
    it.each(GUARDED)('%s %s', async (method, path) => {
        const auth = as(admin({ adminRole: 'super_admin', permissions: [] }));
        const res = await request(app())[method](path).set('Authorization', auth).send({ name: 'x' });

        expect(res.status).not.toBe(403);
    });

    it('الأدمن القديم (adminRole = null) يُعامَل كمسؤول رئيسي', async () => {
        const auth = as(admin({ adminRole: null, permissions: [] }));
        const res = await request(app()).post('/api/places/categories')
            .set('Authorization', auth).send({ name: 'قسم' });

        expect(res.status).not.toBe(403);
    });
});

describe('🔒 seed-demo للمسؤول الرئيسي وحده', () => {
    it('أدمن مساعد ولو بكل الصلاحيات ⇒ 403', async () => {
        const auth = as(admin({ permissions: ['manage_stores', 'manage_categories', 'view_stats'] }));
        const res = await request(app()).post('/api/places/seed-demo')
            .set('Authorization', auth).send({});

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/مسؤول الرئيسي/);
    });

    it('المسؤول الرئيسي يمرّ', async () => {
        const auth = as(admin({ adminRole: 'super_admin' }));
        const res = await request(app()).post('/api/places/seed-demo')
            .set('Authorization', auth).send({});

        expect(res.status).not.toBe(403);
    });
});

describe('🔒 غير الأدمن لا يصل أصلاً', () => {
    it('كابتن يُمنع من إنشاء متجر', async () => {
        const auth = as({
            _id: ADMIN_ID, id: ADMIN_ID, role: 'captain',
            isActive: true, tokenVersion: 0, permissions: ['manage_stores']
        });
        const res = await request(app()).post('/api/places')
            .set('Authorization', auth).send({ name: 'متجر' });

        // حتى لو حُشرت الصلاحية في مستنده — الدور يُفحص أولاً
        expect(res.status).toBe(403);
    });

    it('بلا توكن ⇒ 401', async () => {
        expect((await request(app()).post('/api/places').send({})).status).toBe(401);
    });
});
