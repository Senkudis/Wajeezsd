/**
 * 🗺️ «ميزة التتبّع في الإدارة: الخريطة ما بتظهر».
 *
 * السبب: Google يكتب على حاوية الخريطة position:relative كنمطٍ مضمَّن، فكانت
 * قاعدة الصفحة `#tmMap { position: fixed; inset: 0 }` تسقط وتنهار الحاوية إلى
 * ارتفاع 0 — قيس في المتصفّح: 1280×0. ومعها أخطاء منطقٍ في الخريطة الحيّة
 * ولوحة التتبّع، كلٌّ باختباره هنا.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const T = require('../utils/tripTracking');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const strip = (src) => src.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

describe('خريطة الرحلة تظهر', () => {
    const page = read('public_html/admin-trip-map.html');
    const css = page.slice(page.indexOf('<style>'), page.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');

    it('التموضع على غلافٍ لا على الحاوية التي يكتب عليها Google', () => {
        expect(css).not.toMatch(/#tmMap\s*\{[^}]*position:\s*fixed/);
        expect(css).toMatch(/\.tm-map-wrap\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0/);
        expect(css).toMatch(/#tmMap\s*\{[^}]*height:\s*100%/);
        expect(page).toMatch(/<div class="tm-map-wrap"><div id="tmMap"/);
    });

    it('حافّة اللوحة على الهاتف تُطبَّق على الغلاف', () => {
        expect(css).toMatch(/@media \(max-width: 899px\)\s*\{\s*\.tm-map-wrap\s*\{\s*bottom:/);
    });

    it('رفض مفتاح الخرائط يُكتب داخل الخريطة لا يبقى رمادياً صامتاً', () => {
        expect(page).toMatch(/id="tmMap" data-map-container/);
        expect(read('public_html/js/maps-loader.js')).toContain('[data-map-container]');
    });

    it('بلا إحداثيات: مدينة الطلب، ولا حركة على دبّوسٍ أُزيل', () => {
        const js = read('public_html/js/admin-trip-map.js');
        expect(js).toContain('CITY_CENTER[data.trip.city]');
        expect(js).toContain('if (mover && mover.stop) mover.stop();');
    });
});

describe('لوحة التتبّع: «التتبّع متوقّف» يشمل من لم يُرسل موقعاً', () => {
    const trip = (state) => ({ captain: { gps: { state } } });

    it('gpsLost: قديم، ولا موقع، وبلا وقت — كلّها مفقودة', () => {
        expect(T.gpsLost(trip('stale'))).toBe(true);
        expect(T.gpsLost(trip('none'))).toBe(true);
        expect(T.gpsLost(trip('unknown'))).toBe(true);
        expect(T.gpsLost(trip('fresh'))).toBe(false);
        expect(T.gpsLost({ captain: null })).toBe(false);
    });

    it('الخادم يعدّ بها، والصفحة تصفّي بالحكم نفسه', () => {
        expect(read('routes/admin/tracking.js')).toContain('gpsStale: count(t => running(t) && T.gpsLost(t))');
        const js = read('public_html/js/admin-tracking.js');
        expect(js).toContain("t.captain.gps.state !== 'fresh'");
        expect(js).not.toContain("t.captain.gps.state === 'stale',");
    });
});

describe('الأحداث المباشرة لكل ما يغيّر الرحلة', () => {
    it('نقل الطلب لكابتنٍ آخر', () => {
        const src = read('routes/admin/orders.js');
        const body = src.slice(src.indexOf("'/orders/:id/reassign-captain'"), src.indexOf('// PUT /api/admin/orders/:id/release/approve'));
        expect(body).toContain("io.to('admin_room').emit('admin_order_update'");
    });

    it('إكمال محطّة، وإعادة ترتيب المحطّات', () => {
        const src = read('routes/orders.js');
        const done = src.slice(src.indexOf("'/:id/stops/:stopRef/done'"), src.indexOf("'/:id/stops/suggest-route'"));
        expect(done).toContain("io.to('admin_room').emit('admin_order_update'");
        const reorder = src.slice(src.indexOf("router.put('/:id/stops/reorder'"), src.indexOf("router.put('/:id/deliver'"));
        expect(reorder).toContain("io.to('admin_room').emit('admin_order_update'");
    });
});

describe('الخريطة الحيّة: الحالة والعدّادات والمدينة', () => {
    const js = read('public_html/js/admin-live-map.js');
    const code = strip(js);
    const route = read('routes/admin/dashboard.js');

    it('الخادم يرسل «متاح للعمل» و«مشغول» ووقت القياس', () => {
        const body = route.slice(route.indexOf("'/active-captains'"));
        expect(body).toContain('isAvailableForWork');
        expect(body).toContain("Order.distinct('captain'");
        expect(body).toContain('busy: busy.has(String(captain._id))');
        expect(body).toContain('locationAt:');
    });

    it('الحالة لا تُقرأ من isActive (حالة الحساب)', () => {
        expect(code).not.toMatch(/c\.isActive \? 'available'/);
        // statusOf: مشغول، أو متاحٌ بموقعٍ حديث، وإلا غير متصل
        const src = js.slice(js.indexOf('const STALE_MIN'), js.indexOf('function hasLocation'));
        const statusOf = new Function(src + '; return statusOf;')();
        const now = new Date().toISOString();
        const old = new Date(Date.now() - 3 * 3600e3).toISOString();
        expect(statusOf({ busy: true, available: false, locationAt: old })).toBe('busy');
        expect(statusOf({ available: true, locationAt: now })).toBe('available');
        expect(statusOf({ available: true, locationAt: old })).toBe('offline');
        expect(statusOf({ available: false, locationAt: now })).toBe('offline');
        expect(statusOf({ available: true, locationAt: null })).toBe('offline');
    });

    it('«آخر تحديث» وقت القياس لا ساعة الجهاز الآن', () => {
        expect(code).not.toContain("آخر تحديث: ${new Date().toLocaleTimeString");
        expect(code).toContain('آخر موقع: ${agoText(d.locationAt)}');
    });

    it('تستمع لتغيّر الحالة والطلبات، لا لأحداثٍ لا يبثّها الخادم', () => {
        expect(code).toContain("socket.on('captain_status_changed'");
        expect(code).toContain("socket.on('admin_order_update'");
        expect(code).not.toContain("socket.on('captain_online'");
    });

    it('الأسماء تُهرَّب، ولا نداءات مضمَّنة تُبنى من الاسم', () => {
        expect(code).not.toMatch(/onclick="selectCaptain\(/);
        expect(code).toContain('data-id="${esc(c.id)}"');
        expect(code).toContain('${esc(d.name || \'كابتن\')}');
        expect(code).toContain('«<b>${esc(query)}</b>»');
    });

    it('الأدمن المساعد على مدينته — وإلا أسقطت الصفحة بثّ كباتنه', () => {
        expect(code).toContain("userObj.adminRole === 'sub_admin'");
        expect(code).toContain('setupCities();');
        expect(read('routes/admin/auth.js')).toContain('cities: adminCities(user)');
    });

    it('التوستات تعمل — Swal محمَّلة في الصفحة', () => {
        expect(read('public_html/admin-live-map.html')).toContain('vendor/sweetalert2/sweetalert2.all.min.js');
    });
});
