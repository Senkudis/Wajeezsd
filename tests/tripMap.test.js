/**
 * 🗺️ خريطة الرحلة — «الخريطة تُظهر كل الكباتن، لا الكابتن الماسك الطلب».
 *
 * زرّ «على الخريطة» في لوحة التتبّع كان يفتح الخريطة الحيّة العامة
 * (admin-live-map.html?focus=) فيرى الأدمن كل كباتن المدينة ويبحث بينهم.
 * الآن: صفحةٌ لرحلةٍ واحدة — كابتنها وحده، ونقطتا الاستلام والتسليم،
 * وخطٌّ إلى وجهته، ويتحرّك مباشرةً. وتعمل على الهاتف (إصبعٌ واحد يسحب).
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const T = require('../utils/tripTracking');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const route = read('routes/admin/tracking.js');
const page = read('public_html/admin-trip-map.html');
const js = read('public_html/js/admin-trip-map.js');
const live = read('public_html/admin-live-map.html');
const liveJs = read('public_html/js/admin-live-map.js');

describe('المسار GET /api/admin/tracking/:id/map', () => {
    it('موجود، بصلاحية العرض، وفي نطاق مدينة الأدمن', () => {
        expect(route).toContain("router.get('/tracking/:id/map', protect, CAN_VIEW");
        const body = route.slice(route.indexOf("'/tracking/:id/map'"), route.indexOf('/tracking/:id/notify'));
        expect(body).toContain('adminCoversCity(req.user');
        expect(body).toContain('403');
    });

    it('يجلب الإحداثيات التي لا تحتاجها اللوحة', () => {
        expect(route).toMatch(/MAP_ORDER_FIELDS = ORDER_FIELDS \+ ' pickup\.lat pickup\.lng dropoff\.lat dropoff\.lng/);
    });

    it('الوجهة الآن من targetOf — نفس ما يحكم به «متوقّف»', () => {
        expect(route).toContain('T.targetOf(order, trip.stage)');
        // الوجهة في المتعدّد: أوّل محطّة لم تكتمل
        const o = { isMultiStop: true, stops: [
            { type: 'dropoff', lat: 1, lng: 1, done: true },
            { type: 'dropoff', lat: 2, lng: 2 }
        ] };
        expect(T.targetOf(o, 'to_dropoff')).toEqual({ kind: 'dropoff', lat: 2, lng: 2 });
    });

    it('المُسلَّمة: موقع إعلان التسليم، ولا وجهة', () => {
        const body = route.slice(route.indexOf("'/tracking/:id/map'"), route.indexOf('/tracking/:id/notify'));
        expect(body).toContain("order.status === 'delivered'");
        expect(body).toContain('target: running ?');
    });
});

describe('الصفحة', () => {
    it('خلف حارس الإدارة بصلاحية الخريطة أو الطلبات', () => {
        expect(page).toMatch(/admin-guard\.js[^"]*" data-perm="view_map,view_orders"/);
    });

    it('تأخذ من بثّ المواقع كابتن هذا الطلب وحده', () => {
        expect(js).toContain("sock.on('captain_location_update'");
        expect(js).toContain('String(d.captainId || d.userId) !== String(cap.id)');
    });

    it('لا تُظهر موقع الكابتن بعد انتهاء الرحلة أو نقلها لغيره', () => {
        expect(js).toContain('(prevCap && prevCap !== cap) || !data.running');
    });

    it('تعمل باللمس على الهاتف', () => {
        expect(js).toContain("gestureHandling: 'greedy'");
        // لا غطاء فوق الخريطة يبتلع اللمس: الفراغ في الشريط العلويّ يمرّره
        expect(page).toContain('pointer-events: none;   /* الفراغ بين الأزرار');
        expect(page).not.toContain('user-scalable=no');
        expect(page).toContain('var(--sab, 0px)');
    });

    it('السحب اليدويّ يوقف المتابعة التلقائية', () => {
        expect(js).toContain("map.addListener('dragstart', () => setFollow(false))");
    });

    it('بلا رموز تعبيرية', () => {
        expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(page.replace(/<!--[\s\S]*?-->/g, ''))).toBe(false);
    });
});

describe('الخريطة الحيّة العامة على الهاتف', () => {
    it('اللوحات لا تتراكب على شاشةٍ ضيّقة', () => {
        expect(live).toContain('@media (max-width: 900px)');
        expect(live).not.toContain('user-scalable=no');
    });

    it('غطاء التحميل لا يحجب اللمس، ويختفي إن فشل التحميل', () => {
        expect(live).toContain('#mapLoader { pointer-events: none; }');
        expect(liveJs).toContain('function hideLoader()');
        expect(liveJs).toContain("gestureHandling:   'greedy'");
    });
});

describe('مراجعة المنطق — البثّ', () => {
    const { nextLocation, isOlderReading } = require('../utils/locationMotion');
    const now = new Date('2026-09-29T12:00:00Z');
    const prev = { lat: 15.6, lng: 32.5, fixedAt: new Date(now - 10000), updatedAt: new Date(now - 10000) };

    it('قراءةٌ أقدم من المحفوظة تُعرَف — ولا تغيّر الموقع', () => {
        // قيست قبل دقيقة (طابورٌ أُفرغ) والمحفوظ قيس قبل عشر ثوانٍ
        expect(isOlderReading(prev, { now, fixAge: 60000 })).toBe(true);
        const loc = nextLocation(prev, { lat: 15.7, lng: 32.7, now, fixAge: 60000 });
        expect(loc.lat).toBe(15.6);
        expect(isOlderReading(prev, { now, fixAge: 0 })).toBe(false);
        expect(isOlderReading(null, { now, fixAge: 60000 })).toBe(false);
    });

    it('المساران لا يبثّان القراءة الأقدم — لا قفز للخلف على الخرائط', () => {
        const cap = read('routes/captain.js');
        expect(cap).toContain('const older = isOlderReading(prevLoc, { now, fixAge })');
        expect(cap).toContain('if (io && !older)');
        const idx = read('index.js');
        expect(idx).toMatch(/if \(isOlderReading\(prevLoc && prevLoc\.currentLocation, \{ now: locNow, fixAge: data\.fixAge \}\)\) return;/);
    });

    it('بثّ الإدارة يحمل وقت القياس والمدينة في المسارين', () => {
        const cap = read('routes/captain.js');
        const e = cap.slice(cap.indexOf(".emit('captain_location_update'"));
        expect(e.slice(0, 600)).toContain('fixedAt: loc.fixedAt');
        expect(e.slice(0, 600)).toContain("city: req.user.city || 'Khartoum'");
        const idx = read('index.js');
        const e2 = idx.slice(idx.indexOf(".emit('captain_location_update'"));
        expect(e2.slice(0, 400)).toContain('fixedAt: loc.fixedAt');
        expect(e2.slice(0, 400)).toContain('city:');
    });
});

describe('مراجعة المنطق — الصفحة', () => {
    it('ردٌّ أقدم لا يكتب فوق أحدث', () => {
        expect(js).toContain('const seq = ++loadSeq;');
        expect(js).toContain('if (seq !== loadSeq) return;');
    });

    it('الأعمار بساعة الخادم لا ساعة الجهاز', () => {
        expect(js).toContain('skew = new Date(body.now).getTime() - Date.now()');
        expect(js).not.toMatch(/Date\.now\(\) - new Date\((at|capAt)\)/);
    });

    it('عطلٌ عابر لا يمحو الرحلة المعروضة', () => {
        expect(js).toContain('if (!data || res.status < 500)');
    });

    it('البثّ: وقت القياس، والأقدم لا يُرجع الكابتن', () => {
        expect(js).toContain('d.fixedAt ? new Date(d.fixedAt).toISOString()');
        expect(js).toContain('if (capAt && new Date(at) < new Date(capAt)) return;');
    });

    it('لا وقت وصول من موقعٍ قديم، ولا «متوقّف» بعد أن تحرّك', () => {
        expect(js).toContain('if (m > 150 && !stale)');
        expect(js).toContain("mo.state === 'stopped' && !movedSince");
    });

    it('لا إعادة رسمٍ بلا تغيّر، ولا طلبات والصفحة في الخلفية', () => {
        expect(js).toContain('if (html !== lastSheet)');
        expect(js).toContain('if (routeChanged)');
        expect(js).toContain('if (!document.hidden) load();');
    });

    it('شارة التسليم للمُسلَّمة وحدها — لا للملغاة والمنتظرة', () => {
        expect(js).toContain("t.stage === 'delivered' ? '<span class=\"tm-pill done\">");
    });

    it('رقم الاتصال دوليّ', () => {
        const src = js.slice(js.indexOf('function telHref'), js.indexOf('function photoUrl'));
        const telHref = new Function(src + '; return telHref;')();
        expect(telHref('249912345678')).toBe('tel:+249912345678');
        expect(telHref('+249912345678')).toBe('tel:+249912345678');
        expect(telHref('')).toBe('tel:');
    });
});
