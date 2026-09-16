/**
 * 🏍️ قبول الطلب — بقاعدة بيانات حقيقية.
 *
 * الطلب يُعرض على كل الكباتن المتاحين في المدينة معاً، والقبول سباق. ما
 * يمنع كابتنين من أخذ الطلب نفسه ليس شرطاً في جافاسكربت بل
 * `findOneAndUpdate({ status: 'pending' })` — الشرط والتعديل في عمليةٍ
 * واحدة داخل القاعدة. اختبارٌ يقرأ نصّ المصدر يرى الاستدعاء ولا يرى
 * نتيجته حين يقع السباق فعلاً.
 *
 * وما يُفحص هنا أيضاً: أن الرفض يقع **قبل** أي أثر جانبي — كابتن من مدينةٍ
 * أخرى، أو موقوف، أو لم يُعتمد بعد، يجب أن يخرج بلا أن يلمس الطلب.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo, clearMongo, assertRanInCI } = require('./helpers/mongo');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-anywhere-else';

const User = require('../models/User');
const Order = require('../models/Order');
const { signUserToken } = require('../utils/authToken');

// ⚠️ في المستوى الأعلى لا في beforeAll — انظر التعليق في ledger.db.test.js:
// القرار بتشغيل المجموعة يُتَّخذ وقت الجمع، قبل beforeAll.
const db = await startMongo();
assertRanInCI(db);

let app = null;
if (db.ok) {
    app = express();
    app.use(express.json());
    // io مزيَّف: لا يُفتح مقبس، ولا يُرسَل شيء خارج العملية
    app.set('io', { to: () => ({ emit: () => {} }) });
    app.use('/api/orders', require('../routes/orders'));
}

afterAll(async () => { if (db.ok) await stopMongo(); });
beforeEach(async () => { if (db.ok) await clearMongo(); });

const maybe = () => (db.ok ? describe : describe.skip);

let seq = 0;
async function makeCaptain(over = {}) {
    const user = await User.create({
        name: 'كابتن',
        phone: `09000000${String(++seq).padStart(3, '0')}`,
        password: 'x'.repeat(60),
        role: 'captain',
        city: 'Khartoum',
        isActive: true,
        isAvailableForWork: true,
        approvalStatus: 'approved',
        ...over
    });
    return { user, token: signUserToken(user) };
}

async function makeClient() {
    return User.create({
        name: 'عميل',
        phone: `09111111${String(++seq).padStart(3, '0')}`,
        password: 'x'.repeat(60),
        role: 'client',
        city: 'Khartoum',
        isActive: true
    });
}

async function makeOrder(client, over = {}) {
    return Order.create({
        client: client._id,
        pickup: { address: 'أم درمان', contactName: 'أ', contactPhone: '0900000000' },
        dropoff: { address: 'بحري', receiverName: 'ب', receiverPhone: '0900000001' },
        distanceType: 'short',
        price: 2000,
        status: 'pending',
        city: 'Khartoum',
        ...over
    });
}

const accept = (token, id) =>
    request(app).put(`/api/orders/${id}/accept`).set('Authorization', `Bearer ${token}`);

maybe()('كابتن واحد يفوز بالطلب', () => {
    it('القبول ينجح ويُسند الطلب', async () => {
        const client = await makeClient();
        const { user, token } = await makeCaptain();
        const order = await makeOrder(client);

        const res = await accept(token, order._id);
        expect(res.status).toBe(200);

        const fresh = await Order.findById(order._id);
        expect(fresh.status).toBe('accepted');
        expect(fresh.captain.toString()).toBe(user._id.toString());
        expect(fresh.acceptedAt).toBeInstanceOf(Date);
    });

    it('⚡ كابتنان يقبلان في اللحظة نفسها: واحدٌ فقط يفوز', async () => {
        const client = await makeClient();
        const a = await makeCaptain();
        const b = await makeCaptain();
        const order = await makeOrder(client);

        const [ra, rb] = await Promise.all([accept(a.token, order._id), accept(b.token, order._id)]);

        const codes = [ra.status, rb.status].sort();
        expect(codes).toEqual([200, 400]);

        const fresh = await Order.findById(order._id);
        expect(fresh.status).toBe('accepted');
        // والفائز هو من ردّ عليه بـ 200، لا الآخر
        const winner = ra.status === 200 ? a : b;
        expect(fresh.captain.toString()).toBe(winner.user._id.toString());
    });

    it('⚡ وخمسة كباتن: واحدٌ فقط', async () => {
        const client = await makeClient();
        const caps = await Promise.all(Array.from({ length: 5 }, () => makeCaptain()));
        const order = await makeOrder(client);

        const res = await Promise.all(caps.map(c => accept(c.token, order._id)));
        expect(res.filter(r => r.status === 200)).toHaveLength(1);
        expect(res.filter(r => r.status === 400)).toHaveLength(4);
        expect((await Order.findById(order._id)).status).toBe('accepted');
    });

    it('وطلبٌ مقبولٌ سلفاً لا يُقبل مرّة أخرى', async () => {
        const client = await makeClient();
        const a = await makeCaptain();
        const b = await makeCaptain();
        const order = await makeOrder(client);

        expect((await accept(a.token, order._id)).status).toBe(200);
        expect((await accept(b.token, order._id)).status).toBe(400);

        const fresh = await Order.findById(order._id);
        expect(fresh.captain.toString()).toBe(a.user._id.toString());
    });
});

maybe()('من لا يحقّ له لا يلمس الطلب', () => {
    it('كابتن من مدينةٍ أخرى يُرفض والطلب يبقى معروضاً', async () => {
        const client = await makeClient();
        const { token } = await makeCaptain({ city: 'PortSudan' });
        const order = await makeOrder(client, { city: 'Khartoum' });

        expect((await accept(token, order._id)).status).toBe(400);
        const fresh = await Order.findById(order._id);
        expect(fresh.status).toBe('pending');
        expect(fresh.captain).toBeFalsy();
    });

    it('وكابتن في وضع «غير متاح» يُرفض', async () => {
        const client = await makeClient();
        const { token } = await makeCaptain({ isAvailableForWork: false });
        const order = await makeOrder(client);

        const res = await accept(token, order._id);
        expect(res.status).toBe(403);
        expect((await Order.findById(order._id)).status).toBe('pending');
    });

    it('وكابتن محجوب يُرفض', async () => {
        const client = await makeClient();
        const { token } = await makeCaptain({ is_blocked: true });
        const order = await makeOrder(client);

        expect((await accept(token, order._id)).status).toBe(403);
        expect((await Order.findById(order._id)).status).toBe('pending');
    });

    it('وكابتن لم يُعتمد بعد يُرفض', async () => {
        const client = await makeClient();
        const { token } = await makeCaptain({ approvalStatus: 'pending' });
        const order = await makeOrder(client);

        expect((await accept(token, order._id)).status).toBe(403);
        expect((await Order.findById(order._id)).status).toBe('pending');
    });

    it('وعميلٌ لا يستطيع قبول طلبٍ أصلاً', async () => {
        const client = await makeClient();
        const order = await makeOrder(client);
        const token = signUserToken(client);

        expect((await accept(token, order._id)).status).toBe(403);
        expect((await Order.findById(order._id)).status).toBe('pending');
    });

    it('وبلا توكن: 401', async () => {
        const client = await makeClient();
        const order = await makeOrder(client);
        const res = await request(app).put(`/api/orders/${order._id}/accept`);
        expect(res.status).toBe(401);
    });

    it('وحسابٌ موقوف: 403 — ولو كان توكنه سليماً', async () => {
        const client = await makeClient();
        const { user, token } = await makeCaptain();
        await User.findByIdAndUpdate(user._id, { isActive: false });
        const order = await makeOrder(client);

        expect((await accept(token, order._id)).status).toBe(403);
    });

    it('🔒 وتوكنٌ صدر قبل إبطال الجلسات يسقط', async () => {
        const client = await makeClient();
        const { user, token } = await makeCaptain();
        // تغيير كلمة المرور يرفع tokenVersion — الجلسات القائمة تسقط
        await User.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } });
        const order = await makeOrder(client);

        expect((await accept(token, order._id)).status).toBe(401);
        expect((await Order.findById(order._id)).status).toBe('pending');
    });
});

maybe()('العروض المعلّقة تُحسم بالقبول المباشر', () => {
    it('عرض كابتن آخر يصير «مرفوضاً» لا يبقى معلّقاً', async () => {
        const client = await makeClient();
        const winner = await makeCaptain();
        const loser = await makeCaptain();
        const order = await makeOrder(client, {
            negotiations: [{ captainId: loser.user._id, price: 1800, status: 'pending' }]
        });

        expect((await accept(winner.token, order._id)).status).toBe(200);

        const fresh = await Order.findById(order._id);
        expect(fresh.negotiations[0].status).toBe('rejected');
        expect(fresh.negotiation.isActive).toBe(false);
    });

    it('وعرض الفائز نفسه لا يُرفض معه', async () => {
        const client = await makeClient();
        const winner = await makeCaptain();
        const order = await makeOrder(client, {
            negotiations: [{ captainId: winner.user._id, price: 1800, status: 'pending' }]
        });

        expect((await accept(winner.token, order._id)).status).toBe(200);
        const fresh = await Order.findById(order._id);
        expect(fresh.negotiations[0].status).toBe('pending');
    });
});

maybe()('معرّفٌ غير صالح لا يُسقط الخادم', () => {
    it('معرّف مشوّه يردّ خطأ عميل لا 500', async () => {
        const { token } = await makeCaptain();
        const res = await accept(token, 'ليس-معرّفاً');
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
    });

    it('ومعرّفٌ صالح لطلبٍ غير موجود يردّ 400', async () => {
        const { token } = await makeCaptain();
        const res = await accept(token, new mongoose.Types.ObjectId());
        expect(res.status).toBe(400);
    });
});
