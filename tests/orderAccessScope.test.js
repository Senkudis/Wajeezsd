/**
 * 🌍 نطاق الوصول إلى تفاصيل الطلب — GET /api/orders/:id
 *
 * قائمة الطلبات المعروضة (GET /) محميّة بـ requireCity فيرى الكابتن طلبات
 * مدينته وحدها. لكن مسار التفاصيل كان بلا نطاق مدينة: أي كابتن في أي مدينة
 * يقرأ اسم العميل وهاتفه وعنوان التسليم لأي طلب معلّق بمجرد معرفة المعرّف
 * (والمعرّفات متسلسلة زمنياً في ObjectId فتخمينها ليس بعيداً).
 */

import { vi, describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

mongoose.set('bufferCommands', false);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';

const { signUserToken } = await import('../utils/authToken.js');
const ordersRouter = (await import('../routes/orders.js')).default;
const User = mongoose.models.User;
const Order = mongoose.models.Order;

const ORDER_ID = '507f1f77bcf86cd799439099';
const CAPTAIN_ID = '507f1f77bcf86cd799439011';
const CLIENT_ID = '507f1f77bcf86cd799439012';

function app() {
    const instance = express();
    instance.use(express.json());
    instance.use('/api/orders', ordersRouter);
    return instance;
}

function captain(city) {
    return {
        _id: CAPTAIN_ID, id: CAPTAIN_ID, name: 'كابتن', role: 'captain',
        isActive: true, tokenVersion: 0, is_blocked: false, city
    };
}

function pendingOrder(city) {
    return {
        _id: ORDER_ID,
        status: 'pending',
        captain: null,
        city,
        client: { _id: CLIENT_ID, name: 'عميل سرّي', phone: '0912345678' },
        price: 100,
        pickup: { address: 'شارع الستين' },
        dropoff: { address: 'بيت العميل', receiverPhone: '0999999999' },
        createdAt: new Date()
    };
}

// الكابتن يُحمَّل عبر protect، والطلب عبر findById(...).populate(...).lean()
function stub(user, order) {
    vi.spyOn(User, 'findById').mockReturnValue({ select: async () => user });
    vi.spyOn(Order, 'findById').mockReturnValue({
        populate: function () { return this; },
        lean: async () => order
    });
}

function get(user) {
    return request(app())
        .get(`/api/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${signUserToken(user)}`);
}

afterEach(() => vi.restoreAllMocks());

describe('GET /api/orders/:id — معاينة الطلبات المعلّقة', () => {
    it('✅ كابتن من نفس مدينة الطلب يعاينه قبل قبوله', async () => {
        const user = captain('Khartoum');
        stub(user, pendingOrder('Khartoum'));

        const res = await get(user);
        expect(res.status).toBe(200);
        expect(res.body.client.name).toBe('عميل سرّي');
    });

    it('🔒 كابتن من مدينة أخرى ⇒ 403 ولا تتسرّب بيانات العميل', async () => {
        const user = captain('PortSudan');
        stub(user, pendingOrder('Khartoum'));

        const res = await get(user);
        expect(res.status).toBe(403);
        // الأهم: لا اسم ولا هاتف في الجسم مهما كان شكل الرد
        expect(JSON.stringify(res.body)).not.toMatch(/عميل سرّي/);
        expect(JSON.stringify(res.body)).not.toMatch(/0912345678/);
    });

    it('🔒 كابتن بلا مدينة محدّدة ⇒ 403', async () => {
        const user = captain(undefined);
        stub(user, pendingOrder('Khartoum'));

        expect((await get(user)).status).toBe(403);
    });

    it('🔒 طلب بلا مدينة مختومة ⇒ 403 ولو طابقت الصدفة', async () => {
        const user = captain('Khartoum');
        stub(user, pendingOrder(undefined));

        expect((await get(user)).status).toBe(403);
    });

    it('🔒 كابتن محجوب من نفس المدينة ⇒ 403', async () => {
        const user = { ...captain('Khartoum'), is_blocked: true };
        stub(user, pendingOrder('Khartoum'));

        expect((await get(user)).status).toBe(403);
    });
});

describe('GET /api/orders/:id — الأطراف المعنيّة لا يقيّدها نطاق المدينة', () => {
    it('✅ الكابتن المُسنَد يرى طلبه أياً كانت المدينة المسجّلة له', async () => {
        const user = captain('PortSudan');
        const order = { ...pendingOrder('Khartoum'), status: 'accepted', captain: { _id: CAPTAIN_ID } };
        stub(user, order);

        expect((await get(user)).status).toBe(200);
    });

    it('✅ صاحب الطلب يراه دائماً', async () => {
        const client = {
            _id: CLIENT_ID, id: CLIENT_ID, name: 'عميل', role: 'client',
            isActive: true, tokenVersion: 0, city: 'PortSudan'
        };
        stub(client, pendingOrder('Khartoum'));

        expect((await get(client)).status).toBe(200);
    });

    it('✅ الأدمن يرى أي طلب', async () => {
        const admin = {
            _id: '507f1f77bcf86cd799439013', id: '507f1f77bcf86cd799439013',
            name: 'أدمن', role: 'admin', isActive: true, tokenVersion: 0
        };
        stub(admin, pendingOrder('Khartoum'));

        expect((await get(admin)).status).toBe(200);
    });
});
