/**
 * 📍 إثبات التسليم — منطق الحكم وحده، بلا مسار ولا قاعدة بيانات.
 *
 * كان الكابتن يُعلن التسليم من أي مكان وفي أي وقت فتُخصم العمولة ويُغلق الطلب
 * بلا أي دليل. هذه الاختبارات تثبّت الحدود: من يُعدّ قريباً، ومتى يُمنع فعلاً،
 * وأي نقص في البيانات لا يجوز أن يُحمَّل على الكابتن.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { evaluateDeliveryProof, REASONS } = require('../utils/deliveryProof.js');

const NOW = Date.parse('2026-08-30T12:00:00Z');
const DROPOFF = { lat: 15.5007, lng: 32.5599 }; // الخرطوم

// نقطة شمال نقطة التسليم بمسافة دقيقة. تستعمل نفس نصف القطر الذي تستعمله
// haversineKm (6371 كم) — التقريب الشائع 111 كم/درجة يزيح 500م إلى 501م
// فيسقط اختبار الحدّ لسبب لا علاقة له بالمنطق المفحوص.
const EARTH_RADIUS_M = 6371000;
function north(meters) {
    const deg = (meters / EARTH_RADIUS_M) * (180 / Math.PI);
    return { lat: DROPOFF.lat + deg, lng: DROPOFF.lng };
}

function at(location, ageSec = 30) {
    return { ...location, updatedAt: new Date(NOW - ageSec * 1000) };
}

function evaluate(overrides = {}) {
    return evaluateDeliveryProof({
        captainLocation: at(north(100)),
        dropoff: DROPOFF,
        mode: 'enforce',
        radiusMeters: 500,
        maxLocationAgeSec: 600,
        now: NOW,
        ...overrides
    });
}

describe('المسافة', () => {
    it('✅ داخل نصف القطر ⇒ مُثبَت ولا منع', () => {
        const r = evaluate({ captainLocation: at(north(100)) });
        expect(r.verified).toBe(true);
        expect(r.blocked).toBe(false);
        expect(r.reason).toBe(REASONS.OK);
        expect(r.distanceM).toBeGreaterThan(90);
        expect(r.distanceM).toBeLessThan(110);
    });

    it('✅ عند الحدّ تماماً يُقبل — الحدّ شامل', () => {
        const r = evaluate({ captainLocation: at(north(500)), radiusMeters: 500 });
        expect(r.blocked).toBe(false);
        expect(r.verified).toBe(true);
    });

    it('🔒 خارج نصف القطر ⇒ منع مع رسالة', () => {
        const r = evaluate({ captainLocation: at(north(3000)) });
        expect(r.verified).toBe(false);
        expect(r.blocked).toBe(true);
        expect(r.reason).toBe(REASONS.TOO_FAR);
        expect(r.message).toMatch(/بعيد عن نقطة التسليم/);
        expect(r.distanceM).toBeGreaterThan(2900);
    });

    it('نصف القطر قابل للضبط', () => {
        expect(evaluate({ captainLocation: at(north(1500)), radiusMeters: 2000 }).blocked).toBe(false);
        expect(evaluate({ captainLocation: at(north(1500)), radiusMeters: 1000 }).blocked).toBe(true);
    });
});

describe('الأوضاع', () => {
    it('off ⇒ لا حساب ولا منع مهما بعُد', () => {
        const r = evaluate({ mode: 'off', captainLocation: at(north(50000)) });
        expect(r.blocked).toBe(false);
        expect(r.verified).toBe(false);
        expect(r.reason).toBe(REASONS.DISABLED);
        expect(r.distanceM).toBeNull();
    });

    it('observe ⇒ يحسب ويُشخّص لكن لا يمنع أبداً', () => {
        const r = evaluate({ mode: 'observe', captainLocation: at(north(50000)) });
        expect(r.blocked).toBe(false);
        expect(r.reason).toBe(REASONS.TOO_FAR); // التشخيص محفوظ
        expect(r.message).toBeNull();
        expect(r.distanceM).toBeGreaterThan(49000);
    });

    it('observe يُثبّت القريب كما يفعل enforce', () => {
        const r = evaluate({ mode: 'observe', captainLocation: at(north(100)) });
        expect(r.verified).toBe(true);
        expect(r.blocked).toBe(false);
    });

    it('وضع غير معروف يسقط إلى observe لا إلى منع', () => {
        const r = evaluate({ mode: 'nonsense', captainLocation: at(north(50000)) });
        expect(r.blocked).toBe(false);
        expect(r.reason).toBe(REASONS.TOO_FAR);
    });
});

describe('قِدَم الموقع', () => {
    it('🔒 موقع أقدم من الحدّ ⇒ منع', () => {
        const r = evaluate({ captainLocation: at(north(100), 3600), maxLocationAgeSec: 600 });
        expect(r.blocked).toBe(true);
        expect(r.reason).toBe(REASONS.STALE_LOCATION);
        expect(r.locationAgeSec).toBe(3600);
    });

    it('🔒 موقع بلا ختم زمني يُعامَل كقديم', () => {
        const r = evaluate({ captainLocation: north(100) });
        expect(r.blocked).toBe(true);
        expect(r.reason).toBe(REASONS.STALE_LOCATION);
    });

    it('✅ موقع طازج يمرّ', () => {
        expect(evaluate({ captainLocation: at(north(100), 5) }).verified).toBe(true);
    });
});

describe('نقص البيانات لا يُحمَّل على الكابتن', () => {
    it('طلب بلا إحداثيات تسليم ⇒ لا منع حتى في وضع الفرض', () => {
        const r = evaluate({ dropoff: { lat: null, lng: null } });
        expect(r.blocked).toBe(false);
        expect(r.reason).toBe(REASONS.NO_DROPOFF_COORDS);
    });

    it('نقطة تسليم غائبة كلياً ⇒ لا منع', () => {
        const r = evaluate({ dropoff: undefined });
        expect(r.blocked).toBe(false);
        expect(r.reason).toBe(REASONS.NO_DROPOFF_COORDS);
    });

    it('🔒 لكن غياب موقع الكابتن يمنع في وضع الفرض — وإلا صار إطفاء GPS تحايلاً', () => {
        const r = evaluate({ captainLocation: null });
        expect(r.blocked).toBe(true);
        expect(r.reason).toBe(REASONS.NO_CAPTAIN_LOCATION);
        expect(r.message).toMatch(/تعذّر تحديد موقعك/);
    });

    it('(0,0) ليس موقعاً صالحاً — خليج غينيا لا الخرطوم', () => {
        const r = evaluate({ captainLocation: at({ lat: 0, lng: 0 }) });
        expect(r.reason).toBe(REASONS.NO_CAPTAIN_LOCATION);
    });

    it('غياب موقع الكابتن في وضع المراقبة لا يمنع', () => {
        const r = evaluate({ mode: 'observe', captainLocation: null });
        expect(r.blocked).toBe(false);
        expect(r.message).toBeNull();
    });
});
