/**
 * 📍 PUT /api/orders/:id/deliver — إثبات التسليم داخل المسار نفسه.
 *
 * اختبارات utils/deliveryProof تفحص الحكم مجرّداً. هذه تفحص ما لا يظهر إلا
 * في المسار: أن التقييم يسبق تغيير الحالة (وإلا خُصمت العمولة ثم مُنع
 * التسليم)، وأن الأثر يُكتب على الطلب، وأن الوضع يُقرأ من إعدادات المدينة.
 */

import { vi, describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

mongoose.set('bufferCommands', false);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';

const { signUserToken } = await import('../utils/authToken.js');
const ordersModule = await import('../routes/orders.js');
const ordersRouter = ordersModule.default;
// المسار يخزّن الإعدادات لكل مدينة 60 ثانية؛ بلا مسحه تقرأ الاختبارات
// التالية قيم الاختبار الأول ويصير الوضع/نصف القطر بلا أثر.
const invalidateSettingsCache = ordersModule.invalidateSettingsCache
    || ordersRouter.invalidateSettingsCache;
const User = mongoose.models.User;
const Order = mongoose.models.Order;
const Settings = mongoose.models.Settings;

const ORDER_ID = '507f1f77bcf86cd799439099';
const CAPTAIN_ID = '507f1f77bcf86cd799439011';

const DROPOFF = { lat: 15.5007, lng: 32.5599, address: 'ش', receiverName: 'م', receiverPhone: '09' };
const EARTH_RADIUS_M = 6371000;

function north(meters) {
    return {
        lat: DROPOFF.lat + (meters / EARTH_RADIUS_M) * (180 / Math.PI),
        lng: DROPOFF.lng
    };
}

function captainAt(meters, ageSec = 30) {
    return {
        _id: CAPTAIN_ID, id: CAPTAIN_ID, name: 'كابتن', role: 'captain',
        isActive: true, tokenVersion: 0, city: 'Khartoum',
        currentLocation: { ...north(meters), updatedAt: new Date(Date.now() - ageSec * 1000) }
    };
}

function app() {
    const instance = express();
    instance.use(express.json());
    instance.use('/api/orders', ordersRouter);
    return instance;
}

/**
 * @returns {{updates: object|null}} ما كُتب فعلاً في تحديث الحالة الذرّي
 */
function stub({ captain, mode = 'enforce', radiusMeters = 500 }) {
    const captured = { updates: null, statusUpdateCalled: false };

    vi.spyOn(User, 'findById').mockReturnValue({ select: async () => captain });
    vi.spyOn(User, 'updateOne').mockResolvedValue({});

    // فحص متعدد النقاط + مصدر dropoff/city
    vi.spyOn(Order, 'findOne').mockReturnValue({
        select: async () => ({
            _id: ORDER_ID, isMultiStop: false, stops: [], status: 'picked_up',
            dropoff: DROPOFF, city: 'Khartoum'
        })
    });

    invalidateSettingsCache();
    vi.spyOn(Settings, 'getSettings').mockResolvedValue({
        deliveryProofMode: mode,
        deliveryProofRadiusMeters: radiusMeters,
        deliveryProofMaxLocationAgeMin: 10,
        commissionRate: 0.15
    });

    vi.spyOn(Order, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
        captured.statusUpdateCalled = true;
        captured.updates = update.$set;
        return null; // نوقف التدفّق هنا: ما بعده منطق مال لا يخصّ هذا الاختبار
    });

    return captured;
}

function deliver(captain) {
    return request(app())
        .put(`/api/orders/${ORDER_ID}/deliver`)
        .set('Authorization', `Bearer ${signUserToken(captain)}`)
        .send({});
}

afterEach(() => {
    vi.restoreAllMocks();
    invalidateSettingsCache();
});

describe('وضع الفرض', () => {
    it('🔒 كابتن بعيد ⇒ 409 ولا يُلمس تغيير الحالة إطلاقاً', async () => {
        const captain = captainAt(3000);
        const captured = stub({ captain, mode: 'enforce' });

        const res = await deliver(captain);

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('delivery_proof_too_far');
        expect(res.body.distanceM).toBeGreaterThan(2900);
        // جوهر الترتيب: لو جرى التحديث أولاً لخُصمت العمولة ثم مُنع التسليم
        expect(captured.statusUpdateCalled).toBe(false);
    });

    it('🔒 موقع قديم ⇒ 409 برمز مميّز', async () => {
        const captain = captainAt(100, 3600);
        const captured = stub({ captain, mode: 'enforce' });

        const res = await deliver(captain);

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('delivery_proof_stale_location');
        expect(captured.statusUpdateCalled).toBe(false);
    });

    it('🔒 كابتن بلا موقع محفوظ ⇒ 409', async () => {
        const captain = { ...captainAt(100), currentLocation: undefined };
        const captured = stub({ captain, mode: 'enforce' });

        const res = await deliver(captain);

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('delivery_proof_no_captain_location');
        expect(captured.statusUpdateCalled).toBe(false);
    });

    it('✅ كابتن قريب ⇒ يمرّ ويُكتب الأثر مُثبَتاً', async () => {
        const captain = captainAt(120);
        const captured = stub({ captain, mode: 'enforce' });

        await deliver(captain);

        expect(captured.statusUpdateCalled).toBe(true);
        expect(captured.updates.status).toBe('delivered');
        expect(captured.updates.deliveryProof.verified).toBe(true);
        expect(captured.updates.deliveryProof.reason).toBe('ok');
        expect(captured.updates.deliveryProof.distanceM).toBeLessThan(140);
        expect(captured.updates.deliveryProof.at).toBeInstanceOf(Date);
    });

    it('نصف القطر يُقرأ من الإعدادات', async () => {
        const captain = captainAt(1200);
        const wide = stub({ captain, mode: 'enforce', radiusMeters: 2000 });
        expect((await deliver(captain)).status).not.toBe(409);
        expect(wide.statusUpdateCalled).toBe(true);

        vi.restoreAllMocks();
        const narrow = stub({ captain, mode: 'enforce', radiusMeters: 1000 });
        expect((await deliver(captain)).status).toBe(409);
        expect(narrow.statusUpdateCalled).toBe(false);
    });
});

describe('وضع المراقبة والإيقاف', () => {
    it('observe ⇒ البعيد يمرّ لكن الأثر يُسجَّل غير مُثبَت', async () => {
        const captain = captainAt(9000);
        const captured = stub({ captain, mode: 'observe' });

        const res = await deliver(captain);

        expect(res.status).not.toBe(409);
        expect(captured.statusUpdateCalled).toBe(true);
        expect(captured.updates.deliveryProof.verified).toBe(false);
        expect(captured.updates.deliveryProof.reason).toBe('too_far');
        expect(captured.updates.deliveryProof.distanceM).toBeGreaterThan(8900);
    });

    it('off ⇒ لا أثر يُكتب على الطلب أصلاً', async () => {
        const captain = captainAt(9000);
        const captured = stub({ captain, mode: 'off' });

        await deliver(captain);

        expect(captured.statusUpdateCalled).toBe(true);
        expect(captured.updates.status).toBe('delivered');
        expect(captured.updates.deliveryProof).toBeUndefined();
    });
});

describe('نقص بيانات الطلب لا يمنع الكابتن', () => {
    it('طلب بلا إحداثيات تسليم ⇒ يمرّ حتى في وضع الفرض', async () => {
        const captain = captainAt(9000);
        const captured = { updates: null, statusUpdateCalled: false };

        vi.spyOn(User, 'findById').mockReturnValue({ select: async () => captain });
        vi.spyOn(User, 'updateOne').mockResolvedValue({});
        vi.spyOn(Order, 'findOne').mockReturnValue({
            select: async () => ({
                _id: ORDER_ID, isMultiStop: false, stops: [], status: 'picked_up',
                dropoff: { address: 'ش', receiverName: 'م', receiverPhone: '09' }, // بلا lat/lng
                city: 'Khartoum'
            })
        });
        invalidateSettingsCache();
        vi.spyOn(Settings, 'getSettings').mockResolvedValue({
            deliveryProofMode: 'enforce', deliveryProofRadiusMeters: 500,
            deliveryProofMaxLocationAgeMin: 10
        });
        vi.spyOn(Order, 'findOneAndUpdate').mockImplementation(async (f, u) => {
            captured.statusUpdateCalled = true;
            captured.updates = u.$set;
            return null;
        });

        const res = await deliver(captain);

        expect(res.status).not.toBe(409);
        expect(captured.statusUpdateCalled).toBe(true);
        expect(captured.updates.deliveryProof.reason).toBe('no_dropoff_coords');
        expect(captured.updates.deliveryProof.verified).toBe(false);
    });
});
