/**
 * 🌍 المدينة: «حوّل لبورتسودان ليطلب لقريبه، ونسي يرجع لأم درمان».
 *
 * كان اختيار المدينة في التطبيق يغيّر مدينة الحساب، والطلب يُختم بمدينة
 * الحساب — فطلبٌ من أم درمان بعد النسيان يُبثّ لكباتن بورتسودان ولا يصله
 * أحد. الآن:
 *   ١. الخادم يختم الطلب بمدينة مكانه، والتوصيل بين المدينتين مرفوض حتى
 *      تُضاف خدمة الإرساليات.
 *   ٢. التطبيق ينبّه إن كان موقعك في مدينةٍ غير المعروضة.
 *   ٣. المدينة ظاهرة: شريحةٌ باسمها، وسطرٌ فوق «اطلب الكابتن».
 *   ٤. غير مدينتك تبديلٌ مؤقت يعود بعد إرسال الطلب.
 *   ٥. لوحة تبديلٍ صغيرة لا نافذة الفتح الأول الكاملة.
 */
import { describe, it, expect, beforeEach } from 'vitest';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolveOrderCity, cityFromCoords, CROSS_CITY_MESSAGE } = require('../utils/geofence');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const OMDURMAN = { lat: 15.6445, lng: 32.4777 };
const KHARTOUM2 = { lat: 15.5800, lng: 32.5400 };
const PORTSUDAN = { lat: 19.6151, lng: 37.2164 };
const NOWHERE = { lat: 13.0, lng: 30.0 };   // داخل السودان، خارج المدينتين

describe('١. الخادم: مدينة الطلب من مكانه', () => {
    it('استلامٌ في أم درمان = الخرطوم، ولو كان الحساب على بورتسودان', () => {
        expect(resolveOrderCity([OMDURMAN, KHARTOUM2], 'PortSudan')).toEqual({ ok: true, city: 'Khartoum' });
    });

    it('طلبٌ لقريبٍ في بورتسودان من حسابٍ في الخرطوم = بورتسودان', () => {
        expect(resolveOrderCity([PORTSUDAN, { lat: 19.6, lng: 37.2 }], 'Khartoum')).toEqual({ ok: true, city: 'PortSudan' });
    });

    it('التوصيل بين المدينتين مرفوض — في الاتجاهين', () => {
        const a = resolveOrderCity([OMDURMAN, PORTSUDAN], 'Khartoum');
        const b = resolveOrderCity([PORTSUDAN, OMDURMAN], 'PortSudan');
        expect(a.ok).toBe(false);
        expect(b.ok).toBe(false);
        expect(a.message).toBe(CROSS_CITY_MESSAGE);
        // متعدّد النقاط: محطّةٌ واحدة في الأخرى تكفي للرفض
        expect(resolveOrderCity([OMDURMAN, KHARTOUM2, PORTSUDAN], 'Khartoum').ok).toBe(false);
    });

    it('بلا نقطةٍ داخل مدينةٍ معروفة: مدينة الحساب احتياطاً', () => {
        expect(resolveOrderCity([NOWHERE, NOWHERE], 'PortSudan')).toEqual({ ok: true, city: 'PortSudan' });
        expect(resolveOrderCity([NOWHERE, OMDURMAN], 'PortSudan')).toEqual({ ok: true, city: 'Khartoum' });
        expect(resolveOrderCity([], null)).toEqual({ ok: true, city: 'Khartoum' });
    });

    it('إنشاء الطلب يستعمل مدينة المكان في الختم والتسعير والكوبون والمهلة', () => {
        const src = read('routes/orders.js');
        const body = src.slice(src.indexOf("router.post('/', protect, requireCity"), src.indexOf('const order = await Order.create(orderData);'));
        expect(body).toContain('resolveOrderCity(');
        expect(body).toContain("code: 'CROSS_CITY'");
        expect(body).toContain('city: orderCity,');
        expect(body).toContain('getCachedSettings(orderCity)');
        expect(body).toContain('userCity: orderCity');
        expect(body).toContain('getNudgeSettings(orderCity)');
        // الحساب احتياطٌ فقط — مرّة واحدة، داخل resolveOrderCity
        expect(body.split('req.userCity').length - 1).toBe(1);
    });

    it('طلب المتجر: يُرفض بين مدينتين، وتوصيله يُختم بمكان المتجر', () => {
        const m = read('routes/merchant.js');
        const route = m.slice(m.indexOf("router.post('/shop/:placeId/order'"));
        expect(route.slice(0, 6000)).toContain('resolveOrderCity([place.location, dropoff], place.city)');
        const d = read('utils/shopDelivery.js');
        expect(d).toContain('resolveOrderCity([place.location, shopOrder.dropoff]');
        expect(d).not.toMatch(/const orderCity = clientDoc && clientDoc\.city \? clientDoc\.city : 'Khartoum'/);
    });

    it('التسعيرة للمدينة المعروضة (?city=) — تطابق تسعير الطلب', () => {
        const src = read('routes/orders.js');
        const r = src.slice(src.indexOf("router.get('/price-config'"), src.indexOf("router.get('/:id', protect"));
        expect(r).toContain('VALID_CITIES.includes(req.query.city) ? req.query.city : req.userCity');
    });

});

// ─── CityService في بيئةٍ مصغّرة ───────────────────────────────────────
function loadCityService() {
    const store = {}, session = {};
    const mkStore = (o) => ({
        getItem: (k) => (k in o ? o[k] : null),
        setItem: (k, v) => { o[k] = String(v); },
        removeItem: (k) => { delete o[k]; }
    });
    const events = [];
    const nodes = [];
    const fakeEl = () => {
        const el = {
            className: '', textContent: '', innerHTML: '', style: {},
            attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
            querySelector: () => ({ addEventListener() {} }),
            addEventListener() {}, remove() { const i = nodes.indexOf(el); if (i >= 0) nodes.splice(i, 1); }
        };
        return el;
    };
    const document = {
        getElementById: () => null,
        querySelector: (sel) => nodes.find(n => sel === '.' + n.className) || null,
        createElement: () => fakeEl(),
        head: { appendChild() {} },
        body: { appendChild: (n) => nodes.push(n) },
        addEventListener() {}, removeEventListener() {}
    };
    const window = {
        dispatchEvent: (e) => events.push(e),
        location: { hostname: 'wajeezsd.com', protocol: 'https:', origin: 'https://wajeezsd.com' }
    };
    const ctx = {
        window, document, localStorage: mkStore(store), sessionStorage: mkStore(session),
        CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
        console: { log() {}, warn() {} }, fetch: () => Promise.resolve({ ok: true, json: () => ({}) }),
        setTimeout: () => 0, Promise
    };
    vm.createContext(ctx);
    // كما في الصفحات: config.js (WajeezCities — المدن) قبل city-service.js
    ctx.URL = URL;
    vm.runInContext(read('public_html/js/config.js'), ctx);
    vm.runInContext(read('public_html/js/city-service.js'), ctx);
    return { CS: ctx.window.CityService, store, session, events, nodes };
}

describe('٤. غير مدينتك تبديلٌ مؤقت يعود بعد الطلب', () => {
    let env;
    beforeEach(() => { env = loadCityService(); });

    it('setCity: مدينتك الدائمة — تُحفظ ولا تُعدّ «بعيداً»', () => {
        env.CS.setCity('Khartoum');
        expect(env.CS.getHomeCity()).toBe('Khartoum');
        expect(env.CS.isAway()).toBe(false);
    });

    it('setTempCity: المعروضة تتغيّر ومدينتك لا — بلا مزامنةٍ للحساب', () => {
        env.CS.setCity('Khartoum');
        let synced = 0;
        env.CS.setCity = () => { synced++; };
        env.CS.setTempCity('PortSudan');
        expect(env.CS.getCity()).toBe('PortSudan');
        expect(env.CS.getHomeCity()).toBe('Khartoum');
        expect(env.CS.isAway()).toBe(true);
        expect(synced).toBe(0);
        expect(env.events.pop().detail).toEqual({ city: 'PortSudan', temporary: true });
    });

    it('حسابٌ قديم بلا home_city: أوّل تبديلٍ يثبّت مدينته الحالية «مدينتك»', () => {
        env.store.selected_city = 'Khartoum';
        env.CS.setTempCity('PortSudan');
        expect(env.CS.getHomeCity()).toBe('Khartoum');
    });

    it('بعد إرسال الطلب: يعود لمدينتك ويقول أين', () => {
        env.CS.setCity('Khartoum');
        env.CS.setTempCity('PortSudan');
        expect(env.CS.returnHomeAfterOrder()).toBe('أم درمان');
        expect(env.CS.getCity()).toBe('Khartoum');
        expect(env.CS.isAway()).toBe(false);
        // في مدينته أصلاً: لا شيء يُقال
        expect(env.CS.returnHomeAfterOrder()).toBe(null);
    });

    it('نسخة الواجهة من الحدود = نسخة الخادم', () => {
        const { CITY_BOUNDS } = require('../utils/geofence');
        expect(JSON.parse(JSON.stringify(env.CS.CITY_BOUNDS))).toEqual(CITY_BOUNDS);
        expect(env.CS.cityAt(OMDURMAN.lat, OMDURMAN.lng)).toBe(cityFromCoords(OMDURMAN.lat, OMDURMAN.lng));
    });

    it('crossCityProblem: نفس حكم الخادم قبل الإرسال', () => {
        expect(env.CS.crossCityProblem([OMDURMAN, PORTSUDAN])).toBe(CROSS_CITY_MESSAGE);
        expect(env.CS.crossCityProblem([OMDURMAN, KHARTOUM2])).toBe(null);
        expect(env.CS.crossCityProblem([NOWHERE, PORTSUDAN])).toBe(null);
    });
});

describe('٢. «إنت في أم درمان والتطبيق على بورتسودان»', () => {
    let env;
    beforeEach(() => { env = loadCityService(); env.CS.setCity('Khartoum'); });
    const banner = () => env.nodes.find(n => n.className === 'wj-city-banner');

    it('نسيها من جلسةٍ سابقة: تظهر اللافتة', () => {
        env.CS.setTempCity('PortSudan', { silent: true });
        env.CS.noticeLocation(OMDURMAN.lat, OMDURMAN.lng);
        expect(banner()).toBeTruthy();
        expect(banner().innerHTML).toContain('إنت في أم درمان والتطبيق على بورتسودان');
    });

    it('اختارها بنفسه في هذه الجلسة: لا نُزعجه', () => {
        env.CS.setTempCity('PortSudan');
        env.CS.noticeLocation(OMDURMAN.lat, OMDURMAN.lng);
        expect(banner()).toBeFalsy();
    });

    it('أخفاها: لا تعود لنفس الحال في الجلسة', () => {
        env.CS.setTempCity('PortSudan', { silent: true });
        env.session.city_banner_dismissed = 'Khartoum>PortSudan';
        env.CS.noticeLocation(OMDURMAN.lat, OMDURMAN.lng);
        expect(banner()).toBeFalsy();
    });

    it('موقعه في المدينة المعروضة، أو خارج المدينتين: لا لافتة', () => {
        env.CS.noticeLocation(OMDURMAN.lat, OMDURMAN.lng);
        env.CS.noticeLocation(NOWHERE.lat, NOWHERE.lng);
        expect(banner()).toBeFalsy();
    });

    it('الخريطة لا تُسحب لموقعه إن كان في مدينةٍ غير المعروضة', () => {
        const h = read('public_html/js/home.js');
        expect(h).toContain('CityService.inCurrentCity(window.userLocation)');
        expect(h).toContain('if (_locHere) {');
        expect(h.match(/CityService\.noticeLocation\(/g).length).toBeGreaterThanOrEqual(3);
    });
});

describe('٣ و٥. المدينة ظاهرة، والتبديل لوحةٌ صغيرة', () => {
    const idx = read('public_html/index.html');
    const home = read('public_html/js/home.js');
    const css = read('public_html/css/map-ui.css');

    it('الشريحة: دبّوس واسم المدينة وسهم، وتتلوّن بعيداً عن مدينتك', () => {
        expect(idx).toMatch(/id="map-city-btn"[\s\S]{0,400}bi-geo-alt-fill[\s\S]{0,120}id="map-city-label"[\s\S]{0,120}wj-city-caret/);
        expect(idx).toContain("btn.classList.toggle('is-away', away)");
        expect(css).toContain('.wj-chip-city.is-away');
    });

    it('سطر «الطلب في …» فوق زرّ الطلب، بزرّ «تغيير»', () => {
        expect(idx).toMatch(/id="order-city-line"[\s\S]{0,200}id="submit-btn"/);
        expect(idx).toContain('الطلب في <b>');
        expect(css).toContain('.wj-order-city.is-away');
    });

    it('زرّ التبديل يفتح اللوحة — ولا تعريف ثانٍ يغلبه', () => {
        expect(home).toContain('await CityService.showCitySheet();');
        expect(idx).not.toMatch(/window\.chooseMapCity = async function/);
    });

    it('التسعيرة تُعاد عند تبديل المدينة', () => {
        const l = home.slice(home.indexOf("window.addEventListener('city-changed'"));
        expect(l.slice(0, 2500)).toContain('fetchPricingConfig()');
    });

    it('الطلبات الثلاثة: فحص «بين مدينتين» قبل الإرسال، والرجوع لمدينتك بعده', () => {
        const of = read('public_html/js/order-feature.js');
        const sd = read('public_html/shop-detail.html');
        for (const [name, src] of [['home', home], ['order-feature', of], ['shop-detail', sd]]) {
            expect(src, name).toContain('CityService.crossCityProblem(');
            expect(src, name).toContain('CityService.returnHomeAfterOrder()');
        }
        expect(sd).toContain('src="js/city-service.js');
    });

    it('اللوحة والتوستات فوق الخريطة (طبقتها أقصى z-index)', () => {
        const cs = read('public_html/js/city-service.js');
        expect(cs).toMatch(/\.wj-city-backdrop \{[^}]*z-index: 2147483647/);
        expect(cs).toMatch(/\.wj-city-banner \{[^}]*z-index: 2147483647/);
        expect(cs).toMatch(/\.wj-city-toast \{[^}]*z-index: 2147483647/);
    });

    it('بلا رموز تعبيرية في الواجهة الجديدة', () => {
        const cs = read('public_html/js/city-service.js');
        const ui = cs.slice(cs.indexOf('_styles()'));
        expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ui.replace(/\/\/.*$/gm, ''))).toBe(false);
    });
});
