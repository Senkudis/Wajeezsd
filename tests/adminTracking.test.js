/**
 * 🛰️ لوحة التتبّع — الكباتن الذين يحملون طلباً، ومراحل كلّ رحلة، وتنبيه المتأخّر.
 *
 * ما طُلب:
 *   • تُظهر الكابتن الذي يحمل طلباً فقط — لا كل الكباتن، ولا طلباتٍ لم
 *     يقبلها أحد بعد.
 *   • أيقونةٌ لكل مرحلة: قَبِل ← استلم الطلب ← في الطريق ← استلم العميل.
 *   • كم تأخّر، ومنذ متى.
 *   • زرّ تنبيهٍ من اللوحة («تأخّرت — تحرّك الآن» وغيرها).
 *
 * والتأخّر بعتبات المدينة التي يُنبّه بها المُجدوِل آلياً — لا أرقامٍ ثانية.
 * هذا الملف بلا قاعدة (يعمل محلياً)، والمسار الحقيقيّ في adminTracking.db.test.js.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const T = require('../utils/tripTracking');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const N = { captainPickup1: 15, captainPickup2: 40, captainDeliver1: 30, captainDeliver2: 75, gpsStale: 12, clientDelay1: 30, clientDelay2: 120 };
const now = new Date('2026-09-28T12:00:00Z');
const ago = (m) => new Date(now.getTime() - m * 60000);
const cap = (over = {}) => ({ _id: 'c1', name: 'أحمد', phone: '0911', vehicleType: 'motorcycle',
    currentLocation: { lat: 15.6, lng: 32.5, fixedAt: ago(1) }, ...over });

describe('مراحل الرحلة — الأيقونات الأربع', () => {
    it('قَبِل ولم يستلم: الأولى تمّت والثانية جارية', () => {
        const s = T.stepsOf({ status: 'accepted', acceptedAt: ago(5) });
        expect(s.map(x => x.key)).toEqual(['accepted', 'picked_up', 'on_way', 'delivered']);
        expect(s.map(x => x.done)).toEqual([true, false, false, false]);
        expect(s[1].current).toBe(true);
    });

    it('استلم الطلب: في الطريق للعميل هي الجارية', () => {
        const s = T.stepsOf({ status: 'picked_up', acceptedAt: ago(20), pickedUpAt: ago(10) });
        expect(s.map(x => x.done)).toEqual([true, true, false, false]);
        expect(s[2].current).toBe(true);
    });

    it('استلم العميل: الأربع تمّت، بتوقيت التسليم', () => {
        const s = T.stepsOf({ status: 'delivered', acceptedAt: ago(40), pickedUpAt: ago(30), deliveredAt: ago(5) });
        expect(s.every(x => x.done)).toBe(true);
        expect(s[3].at).toEqual(ago(5));
    });
});

describe('التأخّر — بعتبات المدينة نفسها', () => {
    it('في الطريق للاستلام: يُقاس من القبول', () => {
        expect(T.latenessOf({ status: 'accepted', acceptedAt: ago(10) }, N, now).level).toBe('ok');
        const w = T.latenessOf({ status: 'accepted', acceptedAt: ago(22) }, N, now);
        expect(w.level).toBe('warn');
        expect(w.lateBy).toBe(7);     // بعد العتبة الأولى (15)
        expect(T.latenessOf({ status: 'accepted', acceptedAt: ago(45) }, N, now).level).toBe('late');
    });

    it('استلم وفي الطريق للعميل: يُقاس من الاستلام لا من القبول', () => {
        // قُبل قبل 80 د لكنه استلم قبل 20 — في الوقت
        const r = T.latenessOf({ status: 'picked_up', acceptedAt: ago(80), pickedUpAt: ago(20) }, N, now);
        expect(r.level).toBe('ok');
        expect(r.elapsed).toBe(20);
    });

    it('العتبات من الإعدادات لا ثابتة في الكود', () => {
        const strict = { ...N, captainPickup1: 5, captainPickup2: 10 };
        expect(T.latenessOf({ status: 'accepted', acceptedAt: ago(12) }, strict, now).level).toBe('late');
    });

    it('المُسلَّمة لا تُعدّ متأخّرة', () => {
        expect(T.latenessOf({ status: 'delivered', deliveredAt: ago(3) }, N, now).level).toBe('ok');
    });
});

describe('موقع الكابتن', () => {
    it('fixedAt (متى قيس) أصدق من updatedAt (متى وصلنا)', () => {
        const g = T.gpsOf(cap({ currentLocation: { lat: 15.6, lng: 32.5, fixedAt: ago(20), updatedAt: ago(0) } }), N, now);
        expect(g.state).toBe('stale');
        expect(g.ageMin).toBe(20);
    });
    it('بلا موقع', () => {
        expect(T.gpsOf(cap({ currentLocation: undefined }), N, now).state).toBe('none');
    });
});

describe('الترتيب — الأخطر أولاً', () => {
    it('متأخّر ← قارب ← في الوقت ← المُسلَّمة آخراً', () => {
        const mk = (id, o) => T.buildTrip({ _id: id.padStart(24, '0'), captain: cap(), ...o }, N, now);
        const trips = [
            mk('1', { status: 'delivered', acceptedAt: ago(50), deliveredAt: ago(2) }),
            mk('2', { status: 'accepted', acceptedAt: ago(5) }),
            mk('3', { status: 'picked_up', pickedUpAt: ago(90) }),
            mk('4', { status: 'accepted', acceptedAt: ago(20) })
        ].sort(T.compareTrips);
        expect(trips.map(t => t.id.slice(-1))).toEqual(['3', '4', '2', '1']);
    });
});

describe('نصّ التنبيه — يُبنى في الخادم', () => {
    const trip = T.buildTrip({ _id: '64f0000000000000000000a1', status: 'accepted', acceptedAt: ago(30), captain: cap(), client: { _id: 'u1', name: 'سارة' } }, N, now);

    it('نصٌّ جاهز: يحمل رقم الطلب في العنوان', () => {
        const r = T.buildNudge({ to: 'captain', template: 'move_now' }, trip);
        expect(r.ok).toBe(true);
        expect(r.title).toContain('تأخّرت — تحرّك الآن');
        expect(r.title).toContain(`#${trip.ref}`);
    });

    it('نوعٌ غير معروف يُرفض — لا يُرسل ما لم يُعرّف', () => {
        expect(T.buildNudge({ to: 'captain', template: 'hack' }, trip).ok).toBe(false);
    });

    it('المخصّص بسقف طول', () => {
        expect(T.buildNudge({ to: 'captain', template: 'custom', message: 'x'.repeat(301) }, trip).ok).toBe(false);
        expect(T.buildNudge({ to: 'captain', template: 'custom', message: 'تحرّك من فضلك' }, trip).ok).toBe(true);
    });

    it('الطلب المنتهي لا يُنبَّه عليه', () => {
        const done = T.buildTrip({ _id: '64f0000000000000000000a2', status: 'delivered', deliveredAt: ago(1), captain: cap() }, N, now);
        expect(T.buildNudge({ to: 'captain', template: 'move_now' }, done).ok).toBe(false);
    });

    it('لا تكرار خلال دقيقتين لنفس المستلم', () => {
        expect(T.cooldownLeft([{ to: 'captain', at: ago(1) }], 'captain', now)).toBeGreaterThan(0);
        expect(T.cooldownLeft([{ to: 'captain', at: ago(1) }], 'client', now)).toBe(0);
        expect(T.cooldownLeft([{ to: 'captain', at: ago(3) }], 'captain', now)).toBe(0);
    });

    it('بلا إيموجي في النصوص', () => {
        const all = JSON.stringify(T.NUDGE_TEMPLATES);
        expect(all).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });
});

describe('الإثبات — صورة الاستلام وموقع التسليم', () => {
    const delivered = (dp, over = {}) => T.proofOf({ status: 'delivered', proofOfPickupImage: '/uploads/p.jpg', deliveryProof: dp, ...over });

    it('استلم بصورة: رابطها يصل البطاقة', () => {
        const p = T.proofOf({ status: 'picked_up', proofOfPickupImage: '/uploads/p.jpg' });
        expect(p.pickupPhoto).toBe('/uploads/p.jpg');
        expect(p.pickupPhotoMissing).toBe(false);
        expect(p.suspicious).toBe(false);
    });

    it('🔑 استلم بلا صورة: مشكوكٌ فيه', () => {
        const p = T.proofOf({ status: 'picked_up' });
        expect(p.pickupPhotoMissing).toBe(true);
        expect(p.suspicious).toBe(true);
    });

    it('لم يستلم بعد: غياب الصورة طبيعيّ', () => {
        const p = T.proofOf({ status: 'accepted' });
        expect(p.pickupPhotoMissing).toBe(false);
        expect(p.delivery).toBe(null);
        expect(p.suspicious).toBe(false);
    });

    it('«اشترِ لي»: الفاتورة هي صورة الاستلام', () => {
        const p = T.proofOf({ status: 'picked_up', orderType: 'errand', errand: { receiptImage: '/uploads/r.jpg' } });
        expect(p.pickupPhoto).toBe('/uploads/r.jpg');
        expect(p.suspicious).toBe(false);
    });

    it('سُلِّم عند العميل: سليم، بالمسافة', () => {
        const p = delivered({ verified: true, reason: 'ok', distanceM: 40, locationAgeSec: 30 });
        expect(p.delivery).toEqual({ state: 'ok', distanceM: 40, locationAgeMin: 1 });
        expect(p.suspicious).toBe(false);
    });

    it('🔑 أُعلن بعيداً عن العميل: مشكوكٌ فيه', () => {
        const p = delivered({ verified: false, reason: 'too_far', distanceM: 1200 });
        expect(p.delivery.state).toBe('far');
        expect(p.delivery.distanceM).toBe(1200);
        expect(p.suspicious).toBe(true);
    });

    it('بلا موقعٍ حديث للكابتن: مشكوكٌ فيه', () => {
        expect(delivered({ verified: false, reason: 'no_captain_location' }).delivery.state).toBe('no_location');
        expect(delivered({ verified: false, reason: 'stale_location' }).suspicious).toBe(true);
    });

    it('ما لا يمكن الحكم عليه لا يُتّهم به الكابتن', () => {
        // عنوان العميل بلا إحداثيات، أو الفحص معطّل، أو طلبٌ قديم قبل الميزة
        expect(delivered({ verified: false, reason: 'no_dropoff_coords' }).delivery.state).toBe('no_address');
        expect(delivered({ verified: false, reason: 'disabled' }).delivery.state).toBe('unchecked');
        expect(delivered(undefined).delivery.state).toBe('unchecked');
        for (const r of ['no_dropoff_coords', 'disabled']) {
            expect(delivered({ verified: false, reason: r }).suspicious).toBe(false);
        }
        expect(delivered(undefined).suspicious).toBe(false);
    });

    it('والبطاقة تحمله', () => {
        const t = T.buildTrip({ _id: '64f0000000000000000000b1', status: 'picked_up', pickedUpAt: ago(5), captain: cap() }, N, now);
        expect(t.proof.suspicious).toBe(true);
    });
});

describe('المسار في الخادم', () => {
    const src = read('routes/admin/tracking.js');

    it('🔑 الكباتن الذين يحملون طلباً فقط — لا كل الكباتن', () => {
        expect(src).toContain("status: { $in: ['accepted', 'picked_up'] }, captain: { $ne: null }");
        expect(src).not.toContain("'pending'");
        expect(src).not.toMatch(/User\.(find|countDocuments)\(/);
    });

    it('مقيّدٌ بصلاحيةٍ وبمدن الأدمن المساعد', () => {
        expect(src).toContain("requireAnyPermission(['view_map', 'view_orders'])");
        expect(src).toContain('getAdminCityFilter(req)');
        expect(src).toContain('adminCoversCity(req.user');
    });

    it('التنبيه يُحفظ على الطلب ويُسجَّل ويُحدّ', () => {
        expect(src).toContain("type: 'admin_nudge'");
        expect(src).toContain('$push: { adminNudges: { $each: [entry], $slice: -20 } }');
        expect(src).toContain("logAdminAction(req, 'nudge_user'");
        expect(src).toContain('T.cooldownLeft(order.adminNudges, to)');
        expect(src).toContain('nudgeLimiter');
    });

    it('يجلب حقول الإثبات ويعدّ المشكوك فيه ويعطي نصف القطر', () => {
        for (const f of ['proofOfPickupImage', 'errand.receiptImage', 'deliveryProof']) expect(src).toContain(f);
        expect(src).toContain('suspicious: count(t => t.proof.suspicious)');
        expect(src).toContain('deliveryProofRadiusMeters');
    });

    it('ومركّب تحت /api/admin', () => {
        expect(read('routes/admin.js')).toContain("router.use(require('./admin/tracking'))");
    });

    it('النوع والفعل معرّفان — وإلا ضاع الإشعار والسجلّ بصمت', () => {
        expect(require('../models/Notification').schema.path('type').enumValues).toContain('admin_nudge');
        expect(require('../models/AdminLog').schema.path('action').enumValues).toContain('nudge_user');
        expect(require('../models/Order').schema.path('adminNudges')).toBeTruthy();
    });

    it('ونقرة الإشعار توصل كلاً لشاشته', () => {
        const { resolvePushUrl } = require('../utils/pushRouting');
        expect(resolvePushUrl('captain', 'admin_nudge', 'abc')).toBe('/captain-missions.html');
        expect(resolvePushUrl('client', 'admin_nudge', 'abc')).toBe('/tracking.html?orderId=abc');
    });
});

describe('الصفحة', () => {
    const html = read('public_html/admin-tracking.html');
    const js = read('public_html/js/admin-tracking.js');

    it('محروسة بأيٍّ من الصلاحيتين كالخادم', () => {
        expect(html).toMatch(/admin-guard\.js[^"]*" data-perm="view_map,view_orders"/);
        const guard = read('public_html/js/admin-guard.js');
        expect(guard).toContain("required.split(',')");
    });

    it('ومدخلها في القائمة الجانبية ولوحة الأوامر', () => {
        expect(read('public_html/admin.html')).toContain("location.href='admin-tracking.html'");
        expect(read('public_html/js/admin-palette.js')).toContain("url: 'admin-tracking.html'");
    });

    it('أيقونات المراحل الأربع', () => {
        for (const i of ['fa-handshake', 'fa-box-open', 'fa-motorcycle', 'fa-house-circle-check']) {
            expect(js).toContain(i);
        }
    });

    it('زرّا التنبيه والطمأنة، والخريطة مركّزة على الكابتن', () => {
        expect(js).toContain('data-to="captain"');
        expect(js).toContain('data-to="client"');
        expect(js).toContain('admin-live-map.html?focus=');
        expect(read('public_html/js/admin-live-map.js')).toContain("get('focus')");
    });

    it('فلتر «إثبات مشكوك فيه» وعارض صورة الاستلام', () => {
        expect(js).toContain("key: 'suspicious'");
        expect(js).toContain('t.proof.suspicious');
        expect(js).toContain('data-photo=');
        expect(html).toContain('id="photoModal"');
        expect(html).toMatch(/id="photoModal"[^>]*>\s*<div[^>]*role="dialog" aria-modal="true" aria-labelledby="photoTitle"/);
        // الصورة مرفوعة على خادم الـ API لا على الواجهة
        expect(js).toContain('getFullImageUrl');
    });

    it('التركيز يعود لنظير الزرّ إن أعاد التحديث رسم البطاقات', () => {
        expect(js).toContain('el.isConnected');
        expect(js).toContain('backTo(photoFocus');
        expect(js).toContain('backTo(lastFocus');
    });

    it('النصوص تُهرَّب قبل الحقن', () => {
        expect(js).toContain('${esc(c.name)}');
        expect(js).toContain('${esc(t.pickup.address');
    });

    it('بلا إيموجي في ما يُعرض (التعليقات ليست واجهة)', () => {
        const shown = (html.replace(/<!--[\s\S]*?-->/g, '') + js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));
        expect(shown).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });
});
