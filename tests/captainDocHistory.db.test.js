/**
 * 🗄️ وثيقةٌ تُستبدل لا تضيع — على خادمٍ حقيقيّ وقاعدةٍ حقيقية (CI).
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
const express = require('express');
const request = require('supertest');
const { startMongo, stopMongo, clearMongo, assertRanInCI } = require('./helpers/mongo');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-anywhere-else';

const User = require('../models/User');
const { signUserToken } = require('../utils/authToken');

// صورة PNG حقيقية 1×1 — فحص «صورةٌ فعلاً» يقرأ البايتات لا الامتداد
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const db = await startMongo();
assertRanInCI(db);

let app = null;
if (db.ok) {
    app = express();
    app.use(express.json());
    app.use('/api/upload', require('../routes/upload'));
}
afterAll(async () => { if (db.ok) await stopMongo(); });
beforeEach(async () => { if (db.ok) await clearMongo(); });

const maybe = () => (db.ok ? describe : describe.skip);

maybe()('الكابتن المعتمد يحدّث وثيقته', () => {
    it('🔑 النسخة السابقة تبقى في الأرشيف بتاريخها', async () => {
        const user = await User.create({
            name: 'كابتن', email: 'hist@example.com', phone: '249912000001', password: 'Test@1234',
            role: 'captain', city: 'Khartoum', vehicleType: 'motorcycle',
            approvalStatus: 'approved', isActive: true, isVerified: true
        });
        const token = signUserToken(user);
        const up = () => request(app).post('/api/upload/captain-docs')
            .set('Authorization', `Bearer ${token}`)
            .attach('vehiclePhoto', PNG, 'v.png');

        const first = await up();
        expect(first.status).toBeLessThan(300);
        const afterFirst = await User.findById(user._id).select('+documentsHistory').lean();
        const firstUrl = afterFirst.documents.vehiclePhoto;
        expect(firstUrl).toBeTruthy();
        expect(afterFirst.documentsHistory || []).toHaveLength(0);   // أول رفعٍ لا يستبدل شيئاً

        const second = await up();
        expect(second.status).toBeLessThan(300);
        const afterSecond = await User.findById(user._id).select('+documentsHistory').lean();
        expect(afterSecond.documents.vehiclePhoto).not.toBe(firstUrl);
        expect(afterSecond.documentsHistory).toHaveLength(1);
        expect(afterSecond.documentsHistory[0]).toMatchObject({
            field: 'vehiclePhoto', value: firstUrl, source: 'captain_upload'
        });
    });

    it('والأرشيف لا يخرج في القراءة العادية', async () => {
        await User.create({
            name: 'ك', email: 'h2@example.com', phone: '249912000002', password: 'Test@1234', role: 'captain',
            documentsHistory: [{ field: 'idImage', value: '/api/files/documents/a.jpg', replacedAt: new Date(), source: 'captain_upload' }]
        });
        const u = await User.findOne({ email: 'h2@example.com' }).lean();
        expect(u.documentsHistory).toBeUndefined();
    });
});
