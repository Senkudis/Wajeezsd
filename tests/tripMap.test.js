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
        expect(live).toContain('@media (max-width: 640px)');
        expect(live).not.toContain('user-scalable=no');
    });

    it('غطاء التحميل لا يحجب اللمس، ويختفي إن فشل التحميل', () => {
        expect(live).toContain('#mapLoader { pointer-events: none; }');
        expect(liveJs).toContain('function hideLoader()');
        expect(liveJs).toContain("gestureHandling:   'greedy'");
    });
});
