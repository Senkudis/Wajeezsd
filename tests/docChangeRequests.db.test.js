/**
 * 🪪 طلب تحديث وثيقة: من رفع الكابتن المعتمد إلى قرار الإدارة — قاعدةٌ حقيقية (CI).
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
const express = require('express');
const request = require('supertest');
const { startMongo, stopMongo, clearMongo, assertRanInCI } = require('./helpers/mongo');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-anywhere-else';

const User = require('../models/User');
const { signUserToken } = require('../utils/authToken');

const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const db = await startMongo();
assertRanInCI(db);

let app = null;
if (db.ok) {
    app = express();
    app.use(express.json());
    app.use('/api/upload', require('../routes/upload'));
    app.use('/api/admin', require('../routes/admin/users'));
}
afterAll(async () => { if (db.ok) await stopMongo(); });
beforeEach(async () => { if (db.ok) await clearMongo(); });

const maybe = () => (db.ok ? describe : describe.skip);

let seq = 0;
async function mk(over) {
    const n = ++seq;
    const user = await User.create({
        name: 'مستخدم ' + n, email: `u${n}@example.com`, phone: `24991200${String(n).padStart(4, '0')}`,
        password: 'Test@1234', city: 'Khartoum', isActive: true, isVerified: true, ...over
    });
    return { user, token: signUserToken(user) };
}
const uploadVehicle = (token) => request(app).post('/api/upload/captain-docs')
    .set('Authorization', `Bearer ${token}`).attach('vehiclePhoto', PNG, 'v.png');

maybe()('الكابتن المعتمد يطلب تحديث صورة مركبته', () => {
    it('🔑 الوثيقة المقبولة لا تتغيّر — يُنشأ طلبٌ معلّق', async () => {
        const { user, token } = await mk({
            role: 'captain', approvalStatus: 'approved', documents: { vehiclePhoto: '/uploads/documents/old.jpg' }
        });
        const res = await uploadVehicle(token);
        expect(res.status).toBeLessThan(300);
        expect(res.body.pendingReview).toEqual(['vehiclePhoto']);

        const u = await User.findById(user._id).select('+docChangeRequests').lean();
        expect(u.documents.vehiclePhoto).toBe('/uploads/documents/old.jpg');
        expect(u.docChangeRequests).toHaveLength(1);
        expect(u.docChangeRequests[0]).toMatchObject({ field: 'vehiclePhoto', status: 'pending' });
    });

    it('رفعٌ ثانٍ قبل القرار يحلّ محلّ المعلّق ولا يتراكم', async () => {
        const { user, token } = await mk({ role: 'captain', approvalStatus: 'approved', documents: { vehiclePhoto: '/o.jpg' } });
        await uploadVehicle(token);
        await uploadVehicle(token);
        const u = await User.findById(user._id).select('+docChangeRequests').lean();
        expect(u.docChangeRequests.filter(r => r.status === 'pending')).toHaveLength(1);
    });

    it('🔑 قبول الإدارة يستبدل ويُؤرشف السابقة؛ والقرار الثاني يُرفض', async () => {
        const { user, token } = await mk({ role: 'captain', approvalStatus: 'approved', documents: { vehiclePhoto: '/o.jpg' } });
        await uploadVehicle(token);
        const { token: adminToken } = await mk({ role: 'admin', adminRole: 'super_admin' });
        const reqId = (await User.findById(user._id).select('+docChangeRequests').lean()).docChangeRequests[0]._id;

        const ok = await request(app).put(`/api/admin/captains/${user._id}/doc-requests/${reqId}`)
            .set('Authorization', `Bearer ${adminToken}`).send({ action: 'approve' });
        expect(ok.status).toBe(200);

        const u = await User.findById(user._id).select('+docChangeRequests +documentsHistory').lean();
        expect(u.documents.vehiclePhoto).not.toBe('/o.jpg');
        expect(u.docChangeRequests[0].status).toBe('approved');
        expect(u.documentsHistory[0]).toMatchObject({ field: 'vehiclePhoto', value: '/o.jpg', source: 'change_request' });

        const again = await request(app).put(`/api/admin/captains/${user._id}/doc-requests/${reqId}`)
            .set('Authorization', `Bearer ${adminToken}`).send({ action: 'approve' });
        expect(again.status).toBe(409);
    });

    it('الرفض بلا سبب ⇒ 400، وبسببٍ ⇒ الوثيقة باقية والسبب محفوظ', async () => {
        const { user, token } = await mk({ role: 'captain', approvalStatus: 'approved', documents: { vehiclePhoto: '/o.jpg' } });
        await uploadVehicle(token);
        const { token: adminToken } = await mk({ role: 'admin', adminRole: 'super_admin' });
        const reqId = (await User.findById(user._id).select('+docChangeRequests').lean()).docChangeRequests[0]._id;
        const url = `/api/admin/captains/${user._id}/doc-requests/${reqId}`;

        expect((await request(app).put(url).set('Authorization', `Bearer ${adminToken}`).send({ action: 'reject' })).status).toBe(400);
        const no = await request(app).put(url).set('Authorization', `Bearer ${adminToken}`)
            .send({ action: 'reject', reason: 'ليست المركبة المسجّلة' });
        expect(no.status).toBe(200);

        const u = await User.findById(user._id).select('+docChangeRequests').lean();
        expect(u.documents.vehiclePhoto).toBe('/o.jpg');
        expect(u.docChangeRequests[0]).toMatchObject({ status: 'rejected', reason: 'ليست المركبة المسجّلة' });
    });
});

maybe()('ما لا يمرّ بالمراجعة', () => {
    it('كابتنٌ لم يُعتمد بعد يرفع مباشرة', async () => {
        const { user, token } = await mk({ role: 'captain', approvalStatus: 'pending' });
        const res = await uploadVehicle(token);
        expect(res.body.pendingReview).toEqual([]);
        const u = await User.findById(user._id).lean();
        expect(u.documents.vehiclePhoto).toBeTruthy();
    });
});
