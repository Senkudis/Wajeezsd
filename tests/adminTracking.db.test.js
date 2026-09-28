/**
 * 🛰️ لوحة التتبّع على قاعدةٍ حقيقية — ما لا يُثبته الفحص النصّيّ:
 * أنّ الاستعلام يأتي بالكابتن الذي يحمل طلباً وحده، وأنّ التنبيه يصل فعلاً
 * (إشعارٌ محفوظ، أثرٌ على الطلب، سطرٌ في السجلّ)، وأنّ نطاق المدينة يُحترم.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
const express = require('express');
const request = require('supertest');
const { startMongo, stopMongo, clearMongo, assertRanInCI } = require('./helpers/mongo');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-anywhere-else';

const User = require('../models/User');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const AdminLog = require('../models/AdminLog');
const { signUserToken } = require('../utils/authToken');

const db = await startMongo();
assertRanInCI(db);

let app = null;
if (db.ok) {
    app = express();
    app.use(express.json());
    app.use('/api/admin', require('../routes/admin/tracking'));
}

afterAll(async () => { if (db.ok) await stopMongo(); });
beforeEach(async () => { if (db.ok) await clearMongo(); });

const maybe = () => (db.ok ? describe : describe.skip);
const ago = (m) => new Date(Date.now() - m * 60000);

let seq = 0;
async function mkUser(over = {}) {
    const user = await User.create({
        name: 'مستخدم', phone: `09771${String(++seq).padStart(5, '0')}`,
        password: 'x'.repeat(60), city: 'Khartoum', isActive: true, ...over
    });
    return { user, token: signUserToken(user) };
}
const mkOrder = (over) => Order.create({
    pickup: { address: 'مخبز الأمين', contactName: 'أ', contactPhone: '0900000000' },
    dropoff: { address: 'الرياض', receiverName: 'ب', receiverPhone: '0900000001' },
    distanceType: 'short', price: 1500, city: 'Khartoum', ...over
});

async function scene() {
    const { token: adminToken } = await mkUser({ role: 'admin', name: 'مدير' });
    const { user: client } = await mkUser({ role: 'client', name: 'سارة' });
    const { user: late } = await mkUser({ role: 'captain', name: 'متأخّر', approvalStatus: 'approved', isAvailableForWork: true });
    const { user: fine } = await mkUser({ role: 'captain', name: 'منضبط', approvalStatus: 'approved', isAvailableForWork: true });
    const { user: idle } = await mkUser({ role: 'captain', name: 'متاحٌ بلا طلب', approvalStatus: 'approved', isAvailableForWork: true });
    const lateOrder = await mkOrder({ client: client._id, captain: late._id, status: 'accepted', acceptedAt: ago(50) });
    const fineOrder = await mkOrder({ client: client._id, captain: fine._id, status: 'picked_up', acceptedAt: ago(15), pickedUpAt: ago(5) });
    const pending = await mkOrder({ client: client._id, status: 'pending' });
    const done = await mkOrder({ client: client._id, captain: fine._id, status: 'delivered', acceptedAt: ago(60), pickedUpAt: ago(50), deliveredAt: ago(20) });
    return { adminToken, client, late, fine, idle, lateOrder, fineOrder, pending, done };
}

maybe()('GET /api/admin/tracking', () => {
    it('🔑 الكابتن الذي يحمل طلباً وحده — لا المتاح بلا طلب، ولا طلبٌ بلا كابتن', async () => {
        const s = await scene();
        const res = await request(app).get('/api/admin/tracking').set('Authorization', `Bearer ${s.adminToken}`);
        expect(res.status).toBe(200);
        const names = res.body.trips.map(t => t.captain.name);
        expect(names).toContain('متأخّر');
        expect(names).toContain('منضبط');
        expect(names).not.toContain('متاحٌ بلا طلب');
        expect(res.body.trips.map(t => t.id)).not.toContain(String(s.pending._id));
    });

    it('المتأخّر أولاً بمرحلته وتأخّره، والمُسلَّمة آخراً', async () => {
        const s = await scene();
        const { body } = await request(app).get('/api/admin/tracking').set('Authorization', `Bearer ${s.adminToken}`);
        const first = body.trips[0];
        expect(first.id).toBe(String(s.lateOrder._id));
        expect(first.stage).toBe('to_pickup');
        expect(first.late.level).toBe('late');             // 50 د > 40 (الافتراضيّ)
        expect(body.trips[body.trips.length - 1].stage).toBe('delivered');
        expect(body.summary).toMatchObject({ carrying: 2, active: 2, late: 1, delivered: 1 });
    });

    it('🔑 الإثبات: صورة الاستلام تصل البطاقة، والبعيد والمُستلَم بلا صورة يُعدّان', async () => {
        const s = await scene();
        await Order.updateOne({ _id: s.fineOrder._id }, { proofOfPickupImage: '/uploads/proofs/p1.jpg' });
        await Order.updateOne({ _id: s.done._id }, {
            proofOfPickupImage: '/uploads/proofs/p2.jpg',
            deliveryProof: { verified: false, reason: 'too_far', distanceM: 1200, at: ago(20) }
        });
        const { body } = await request(app).get('/api/admin/tracking').set('Authorization', `Bearer ${s.adminToken}`);
        const byId = Object.fromEntries(body.trips.map(t => [t.id, t]));
        expect(byId[String(s.fineOrder._id)].proof).toMatchObject({ pickupPhoto: '/uploads/proofs/p1.jpg', suspicious: false });
        expect(byId[String(s.done._id)].proof.delivery).toMatchObject({ state: 'far', distanceM: 1200 });
        // المتأخّر لم يستلم بعد — غياب صورته ليس شبهة
        expect(byId[String(s.lateOrder._id)].proof.suspicious).toBe(false);
        expect(body.summary.suspicious).toBe(1);
        expect(body.deliveryRadius).toMatchObject({ Khartoum: expect.any(Number), PortSudan: expect.any(Number) });
    });

    it('🌍 الأدمن المساعد لبورتسودان لا يرى الخرطوم', async () => {
        await scene();
        const { token } = await mkUser({ role: 'admin', adminRole: 'sub_admin', city: 'PortSudan', permissions: ['view_map'] });
        const { body } = await request(app).get('/api/admin/tracking').set('Authorization', `Bearer ${token}`);
        expect(body.trips).toHaveLength(0);
    });

    it('🔒 بلا صلاحية ← 403', async () => {
        const { token } = await mkUser({ role: 'admin', adminRole: 'sub_admin', permissions: ['view_finance'] });
        const res = await request(app).get('/api/admin/tracking').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
    });
});

maybe()('POST /api/admin/tracking/:id/notify', () => {
    it('🔑 «تأخّرت — تحرّك» يصل الكابتن: إشعارٌ محفوظ، أثرٌ على الطلب، سطرٌ في السجلّ', async () => {
        const s = await scene();
        const res = await request(app).post(`/api/admin/tracking/${s.lateOrder._id}/notify`)
            .set('Authorization', `Bearer ${s.adminToken}`).send({ to: 'captain', template: 'move_now' });
        expect(res.status).toBe(200);

        const n = await Notification.findOne({ user: s.late._id }).lean();
        expect(n.type).toBe('admin_nudge');
        expect(n.title).toContain('تأخّرت — تحرّك الآن');

        const o = await Order.findById(s.lateOrder._id).lean();
        expect(o.adminNudges).toHaveLength(1);
        expect(o.adminNudges[0]).toMatchObject({ to: 'captain', template: 'move_now', byName: 'مدير' });

        const log = await AdminLog.findOne({ action: 'nudge_user' }).lean();
        expect(log).toBeTruthy();
        expect(log.description).toContain('متأخّر');
    });

    it('ويظهر على البطاقة: «نُبِّه الكابتن قبل…»', async () => {
        const s = await scene();
        await request(app).post(`/api/admin/tracking/${s.lateOrder._id}/notify`)
            .set('Authorization', `Bearer ${s.adminToken}`).send({ to: 'captain', template: 'move_now' });
        const { body } = await request(app).get('/api/admin/tracking').set('Authorization', `Bearer ${s.adminToken}`);
        const t = body.trips.find(x => x.id === String(s.lateOrder._id));
        expect(t.lastNudge).toMatchObject({ to: 'captain', byName: 'مدير' });
    });

    it('ضغطةٌ ثانية خلال دقيقتين ← 429 لا إشعارٌ مكرّر', async () => {
        const s = await scene();
        const send = () => request(app).post(`/api/admin/tracking/${s.lateOrder._id}/notify`)
            .set('Authorization', `Bearer ${s.adminToken}`).send({ to: 'captain', template: 'move_now' });
        expect((await send()).status).toBe(200);
        expect((await send()).status).toBe(429);
        expect(await Notification.countDocuments({ user: s.late._id })).toBe(1);
    });

    it('طمأنة العميل تصله هو', async () => {
        const s = await scene();
        const res = await request(app).post(`/api/admin/tracking/${s.fineOrder._id}/notify`)
            .set('Authorization', `Bearer ${s.adminToken}`).send({ to: 'client', template: 'on_the_way' });
        expect(res.status).toBe(200);
        expect(await Notification.countDocuments({ user: s.client._id, type: 'admin_nudge' })).toBe(1);
    });

    it('الطلب المُسلَّم ← 400', async () => {
        const s = await scene();
        const res = await request(app).post(`/api/admin/tracking/${s.done._id}/notify`)
            .set('Authorization', `Bearer ${s.adminToken}`).send({ to: 'captain', template: 'move_now' });
        expect(res.status).toBe(400);
    });

    it('🌍 أدمن مدينةٍ أخرى ← 403 ولو عرف المعرّف', async () => {
        const s = await scene();
        const { token } = await mkUser({ role: 'admin', adminRole: 'sub_admin', city: 'PortSudan', permissions: ['view_map'] });
        const res = await request(app).post(`/api/admin/tracking/${s.lateOrder._id}/notify`)
            .set('Authorization', `Bearer ${token}`).send({ to: 'captain', template: 'move_now' });
        expect(res.status).toBe(403);
        expect(await Notification.countDocuments({})).toBe(0);
    });
});
