/**
 * ⏱️🧭 ساعة الكابتن الحاليّ، وحركته، وحداثة موقعه.
 *
 * أخطاءٌ وُجدت في لوحة التتبّع:
 *   ١) التعيين اليدويّ لم يضبط acceptedAt ← «متأخّر» لحظة التعيين، والمُجدوِل
 *      لا يُنبّه هذا الكابتن أبداً.
 *   ٢) نقل الطلب يُورث الجديد ساعة القديم وتنبيهاته.
 *   ٣) المُجدوِل يحكم على GPS بوقت الوصول، واللوحة بوقت القياس.
 *   ٤) كاتب الموقع عبر الـ socket يمحو fixedAt.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const T = require('../utils/tripTracking');
const M = require('../utils/locationMotion');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const N = { captainPickup1: 15, captainPickup2: 40, captainDeliver1: 30, captainDeliver2: 75, gpsStale: 12, clientDelay1: 30, clientDelay2: 120 };
const now = new Date('2026-09-28T12:00:00Z');
const ago = (m) => new Date(now.getTime() - m * 60000);

describe('ساعة الكابتن الحاليّ', () => {
    it('🔑 بعد النقل تبدأ من الإسناد لا من قبول من قبله', () => {
        const o = { status: 'accepted', acceptedAt: ago(50), captainAssignedAt: ago(3) };
        expect(T.clockStart(o, 'accepted')).toEqual(ago(3));
        expect(T.latenessOf(o, N, now)).toMatchObject({ level: 'ok', elapsed: 3 });
    });
    it('بلا نقل: من القبول كما كانت', () => {
        expect(T.clockStart({ acceptedAt: ago(20) }, 'accepted')).toEqual(ago(20));
    });
    it('نقلٌ قبل الاستلام لا يمسّ ساعة التوصيل', () => {
        const o = { status: 'picked_up', acceptedAt: ago(60), captainAssignedAt: ago(50), pickedUpAt: ago(10) };
        expect(T.clockStart(o, 'picked_up')).toEqual(ago(10));
    });
    it('ونقلٌ أثناء التوصيل يبدأ ساعة الجديد', () => {
        const o = { status: 'picked_up', pickedUpAt: ago(60), captainAssignedAt: ago(4) };
        expect(T.latenessOf(o, N, now).elapsed).toBe(4);
    });
});

describe('تنبيهات الكابتن السابق', () => {
    const order = {
        captainAssignedAt: ago(3),
        adminNudges: [
            { to: 'captain', at: ago(5), template: 'move_now' },
            { to: 'client', at: ago(4), template: 'on_the_way' }
        ]
    };
    it('🔑 لا تُعرض على بطاقة الجديد ولا تمنع تنبيهه', () => {
        const cur = T.currentNudges(order);
        expect(cur.map(x => x.to)).toEqual(['client']);
        expect(T.cooldownLeft(cur, 'captain', now)).toBe(0);
    });
    it('بلا نقل: كلها كما هي', () => {
        expect(T.currentNudges({ adminNudges: order.adminNudges })).toHaveLength(2);
    });
});

describe('الحركة والمسافة', () => {
    // المحلّ عند (15.60, 32.50) والعميل بعده بنحو ٢ كم شمالاً
    const order = (over = {}) => ({
        _id: '64f0000000000000000000c1', status: 'accepted', acceptedAt: ago(30),
        pickup: { lat: 15.60, lng: 32.50 }, dropoff: { lat: 15.62, lng: 32.50 }, ...over
    });
    const cap = (loc) => ({ _id: 'c1', name: 'أحمد', currentLocation: { fixedAt: ago(1), ...loc } });
    const trip = (o, c) => T.buildTrip({ ...o, captain: c }, N, now);

    it('🔑 واقفٌ بعيداً عن المحلّ ١٥ د: «متوقّف»، بمسافته', () => {
        const m = trip(order(), cap({ lat: 15.61, lng: 32.50, movedAt: ago(15) })).motion;
        expect(m.state).toBe('stopped');
        expect(m.stoppedMin).toBe(15);
        expect(m.target).toBe('pickup');
        expect(m.distanceM).toBeGreaterThan(1000);
        expect(m.distanceM).toBeLessThan(1200);
    });
    it('عند المحلّ ينتظر التجهيز: «عند الهدف» لا «متوقّف»', () => {
        expect(trip(order(), cap({ lat: 15.6005, lng: 32.50, movedAt: ago(15) })).motion.state).toBe('at_target');
    });
    it('تحرّك قبل دقيقتين: «يتحرّك»', () => {
        expect(trip(order(), cap({ lat: 15.61, lng: 32.50, movedAt: ago(2) })).motion.state).toBe('moving');
    });
    it('بعد الاستلام الوجهة العميل، والتوقّف لا يسبق بداية المرحلة', () => {
        const o = order({ status: 'picked_up', pickedUpAt: ago(4) });
        const m = trip(o, cap({ lat: 15.60, lng: 32.50, movedAt: ago(20) })).motion;
        expect(m.target).toBe('dropoff');
        expect(m.stoppedMin).toBe(4);           // انتظر عند المحلّ ٢٠ د — لم يتوقّف في الطريق ٢٠ د
        expect(m.state).toBe('moving');
    });
    it('متعدّد النقاط: أوّل محطّةٍ لم تكتمل', () => {
        const o = order({ status: 'picked_up', pickedUpAt: ago(5), isMultiStop: true, stops: [
            { type: 'pickup', lat: 15.60, lng: 32.50, done: true },
            { type: 'dropoff', lat: 15.61, lng: 32.50, done: true },
            { type: 'dropoff', lat: 15.65, lng: 32.50, done: false }
        ] });
        expect(T.targetOf(o, 'to_dropoff')).toMatchObject({ kind: 'dropoff', lat: 15.65 });
    });
    it('موقعٌ قديم: لا حكم — حالة GPS تقول ذلك وحدها', () => {
        const m = trip(order(), cap({ lat: 15.61, lng: 32.50, fixedAt: ago(30), movedAt: ago(40) })).motion;
        expect(m.state).toBe('unknown');
        expect(m.distanceM).toBe(null);
    });
    it('المُسلَّمة بلا حركة', () => {
        expect(trip(order({ status: 'delivered', deliveredAt: ago(1) }), cap({ lat: 15.6, lng: 32.5 })).motion).toBe(null);
    });
});

describe('كاتب الموقع', () => {
    const t0 = new Date('2026-09-28T12:00:00Z');
    const at = (s) => new Date(t0.getTime() + s * 1000);

    it('🔑 اهتزاز GPS في المكان ليس حركة', () => {
        const a = M.nextLocation(null, { lat: 15.6, lng: 32.5, now: t0 });
        const b = M.nextLocation(a, { lat: 15.6003, lng: 32.5, now: at(300) });   // ~٣٣ م
        expect(b.movedAt).toEqual(a.movedAt);
        expect(b.anchorLat).toBe(15.6);
        expect(b.lat).toBe(15.6003);
    });
    it('الابتعاد عن نقطة الثبات حركة — ويصير هو نقطة الثبات', () => {
        const a = M.nextLocation(null, { lat: 15.6, lng: 32.5, now: t0 });
        const b = M.nextLocation(a, { lat: 15.602, lng: 32.5, now: at(60) });    // ~٢٢٠ م
        expect(b.movedAt).toEqual(at(60));
        expect(b.anchorLat).toBe(15.602);
    });
    it('fixedAt من عمر القراءة لا من وقت الوصول', () => {
        const a = M.nextLocation(null, { lat: 15.6, lng: 32.5, now: t0, fixAge: 90000 });
        expect(a.fixedAt).toEqual(at(-90));
        expect(a.updatedAt).toEqual(t0);
    });
    it('قراءةٌ أقدم ممّا عندنا لا تُرجع الكابتن لمكانٍ غادره', () => {
        const a = M.nextLocation(null, { lat: 15.7, lng: 32.5, now: t0 });
        const b = M.nextLocation(a, { lat: 15.6, lng: 32.5, now: at(10), fixAge: 60000 });
        expect(b.lat).toBe(15.7);
        expect(b.fixedAt).toEqual(t0);
    });
    it('عمرٌ عبثيّ أو غائب', () => {
        expect(M.clampFixAge(undefined)).toBe(0);
        expect(M.clampFixAge(-5)).toBe(0);
        expect(M.clampFixAge(1e12)).toBe(24 * 60 * 60 * 1000);
    });
});

describe('في الشيفرة', () => {
    it('🔑 الإسناد اليدويّ يبدأ ساعة الجديد ويمسح تنبيهات القديم', () => {
        const src = read('routes/admin/orders.js');
        const r = src.slice(src.indexOf("'/orders/:id/reassign-captain'"), src.indexOf("'/orders/:id/remind-captains'"));
        expect(r).toContain('if (isManualAssign) order.acceptedAt = assignedAt');
        expect(r).toContain('order.captainAssignedAt = assignedAt');
        expect(r).toContain('order.captainNudges = []');
    });
    it('المُجدوِل بساعة اللوحة نفسها وبوقت القياس', () => {
        const s = read('scheduler.js');
        expect(s).toContain("const { clockStart } = require('./utils/tripTracking')");
        expect(s).toContain('const stamp = clockStart(order, stage)');
        expect(s).toContain('c.currentLocation?.fixedAt || c.currentLocation?.updatedAt');
    });
    it('🔑 كاتبا الموقع كلاهما عبر nextLocation — لا يُمحى fixedAt', () => {
        const idx = read('index.js');
        expect(idx).toContain('const loc = nextLocation(prevLoc && prevLoc.currentLocation');
        expect(idx).toContain('{ currentLocation: loc }');
        expect(idx).not.toContain('currentLocation: { lat, lng, updatedAt: new Date() }');
        const cap = read('routes/captain.js');
        expect(cap).toContain('const loc = nextLocation(prevLoc, { lat, lng, fixAge, now })');
        expect(cap).toContain('{ currentLocation: loc }');
    });
    it('والتطبيق يرسل عمر القراءة في كل طريق', () => {
        const cs = read('public_html/js/captain-service.js');
        expect(cs).toContain("emit('update_location', { userId, lat, lng, fixAge: CaptainService._fixAge() })");
        expect(cs).toContain('fixAge: Math.max(0, Date.now() - last.timestamp)');
        expect(read('public_html/captain-dashboard.html')).toContain('fixAge: window.CaptainService._fixAge()');
    });
    it('الحقول معرّفة', () => {
        expect(require('../models/Order').schema.path('captainAssignedAt')).toBeTruthy();
        const u = require('../models/User').schema;
        for (const p of ['anchorLat', 'anchorLng', 'movedAt']) expect(u.path(`currentLocation.${p}`)).toBeTruthy();
    });
});
