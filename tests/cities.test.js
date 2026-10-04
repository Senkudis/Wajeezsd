/**
 * 🌍 المدن — إضافة عطبرة، وحارسٌ لكل مدينةٍ بعدها.
 *
 * كانت ['Khartoum', 'PortSudan'] مكتوبةً في نحو ثلاثين موضعاً في الخادم،
 * و«بورتسودان وإلا الخرطوم» في عشرات المواضع في الواجهة. فمدينةٌ ثالثة تُنسى
 * في موضعٍ واحد = تُرفض في مسارٍ وتُقبل في آخر، أو تُعرض باسم بورتسودان،
 * أو يُختم طلبها بمدينةٍ لا يُبثّ لكباتنها.
 *
 * الآن مصدران متطابقان: config/cities.js (الخادم) و WajeezCities في
 * public_html/js/config.js (الواجهة). هذا الملف يفرض:
 *   - تطابقهما، وصحّة الحدود (لا تتداخل، والمراكز داخلها)
 *   - أن عطبرة (والدامر) تُعرف من إحداثياتها
 *   - ألّا تعود قائمةٌ مكتوبة باليد في الخادم، ولا «بورتسودان وإلا الخرطوم» في الواجهة
 *   - أن كل قائمة اختيار مدينة في الصفحات تعرض كل المدن
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const C = require('../config/cities');
const { cityFromCoords, resolveOrderCity } = require('../utils/geofence');

/** يشغّل public_html/js/config.js في بيئةٍ مصغّرة ويعيد WajeezCities */
function loadClientCities() {
    const window = { location: { hostname: 'wajeezsd.com', protocol: 'https:', origin: 'https://wajeezsd.com' } };
    const ctx = { window, console: { log() {}, warn() {} }, URL };
    vm.createContext(ctx);
    vm.runInContext(read('public_html/js/config.js'), ctx);
    return ctx.window.WajeezCities;
}
const WC = loadClientCities();
const SHARED = ['key', 'label', 'appLabel', 'shortLabel', 'adminLabel', 'desc', 'bounds', 'center', 'search'];
const plain = (o) => JSON.parse(JSON.stringify(o));

const ATBARA = { lat: 17.7022, lng: 33.9864 };
const ED_DAMER = { lat: 17.5928, lng: 33.9592 };

describe('المصدر الواحد: الخادم والواجهة متطابقان', () => {
    it('عطبرة مدينةٌ ثالثة بمفتاح Atbara', () => {
        expect(C.CITY_KEYS).toEqual(['Khartoum', 'PortSudan', 'Atbara']);
        expect(C.cityLabel('Atbara')).toBe('عطبرة');
        expect(C.CITIES.Atbara.adminLabel).toBe('نهر النيل - عطبرة');
    });

    it('نسخة الواجهة = نسخة الخادم، حقلاً حقلاً', () => {
        expect(WC.KEYS).toEqual(C.CITY_KEYS);
        for (const k of C.CITY_KEYS) {
            for (const f of SHARED) expect(plain(WC.CITIES[k][f]), `${k}.${f}`).toEqual(plain(C.CITIES[k][f]));
            // واجهةٌ فقط: أيقونة ولون لكل مدينة
            expect(WC.CITIES[k].icon, k).toMatch(/^fa-/);
            expect(WC.CITIES[k].color, k).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });

    it('أدوات الواجهة', () => {
        expect(WC.label('Atbara')).toBe('عطبرة');
        expect(WC.label('Atbara', 'adminLabel')).toBe('نهر النيل - عطبرة');
        expect(WC.label('Mars')).toBe('Mars');
        expect(WC.center('Atbara')).toEqual(ATBARA);
        expect(WC.center('nope')).toEqual(plain(C.CITIES.Khartoum.center));
        expect(WC.cityAt(ED_DAMER.lat, ED_DAMER.lng)).toBe('Atbara');
        const html = WC.optionsHtml({ selected: 'Atbara', kind: 'adminLabel', all: 'كل المدن' });
        expect(html).toContain('<option value="">كل المدن</option>');
        expect(html).toContain('<option value="Atbara" selected>نهر النيل - عطبرة</option>');
        expect((html.match(/<option /g) || []).length).toBe(C.CITY_KEYS.length + 1);
    });
});

describe('الحدود', () => {
    const boxes = C.CITY_KEYS.map(k => [k, C.CITIES[k].bounds]);

    it('لا تتداخل حدود مدينتين — وإلا خُتم طلبٌ بمدينتين', () => {
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const [a, A] = boxes[i], [b, B] = boxes[j];
                const overlap = A.minLat < B.maxLat && B.minLat < A.maxLat && A.minLng < B.maxLng && B.minLng < A.maxLng;
                expect(overlap, `${a} × ${b}`).toBe(false);
            }
        }
    });

    it('مركز كل مدينة ومركز بحثها داخل حدودها', () => {
        for (const k of C.CITY_KEYS) {
            expect(cityFromCoords(C.CITIES[k].center.lat, C.CITIES[k].center.lng), k).toBe(k);
            expect(cityFromCoords(C.CITIES[k].search.lat, C.CITIES[k].search.lng), k).toBe(k);
        }
    });

    it('عطبرة والدامر = عطبرة، والمدينتان الأُخريان كما كانتا', () => {
        expect(cityFromCoords(ATBARA.lat, ATBARA.lng)).toBe('Atbara');
        expect(cityFromCoords(ED_DAMER.lat, ED_DAMER.lng)).toBe('Atbara');
        expect(cityFromCoords(15.6445, 32.4777)).toBe('Khartoum');   // أم درمان
        expect(cityFromCoords(19.6151, 37.2164)).toBe('PortSudan');
        expect(cityFromCoords(16.6, 33.4)).toBe(null);               // شندي — خارج كل المدن
    });

    it('التوصيل بين عطبرة وغيرها مرفوض، وداخلها مقبول', () => {
        expect(resolveOrderCity([ATBARA, ED_DAMER], 'Khartoum')).toEqual({ ok: true, city: 'Atbara' });
        expect(resolveOrderCity([ATBARA, { lat: 15.6445, lng: 32.4777 }], 'Atbara').ok).toBe(false);
        expect(resolveOrderCity([{ lat: 19.6151, lng: 37.2164 }, ATBARA], 'PortSudan').ok).toBe(false);
    });
});

describe('الخادم: لا قائمة مدنٍ مكتوبة باليد', () => {
    const SERVER = ['middleware', 'models', 'routes', 'utils'].flatMap(function walk(d) {
        return fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e =>
            e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
    }).concat(['scheduler.js', 'index.js']);
    const code = (f) => read(f).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

    it('[\'Khartoum\', \'PortSudan\'] لم يعد في أيّ ملف', () => {
        for (const f of SERVER) expect(code(f), f).not.toMatch(/\[\s*'Khartoum'\s*,\s*'PortSudan'\s*\]/);
    });

    it('ولا «بورتسودان وإلا الخرطوم»', () => {
        for (const f of SERVER) {
            expect(code(f), f).not.toMatch(/=== 'PortSudan' \?/);
            expect(code(f), f).not.toMatch(/=== 'Khartoum' \? 'الخرطوم' : 'بورتسودان'/);
        }
    });

    it('كل مخطّطٍ بحقل مدينةٍ مقيّد يقبل عطبرة', () => {
        const paths = [
            ['Order', 'city'], ['User', 'city'], ['User', 'cities'], ['Settings', 'city'],
            ['Complaint', 'city'], ['EmergencyAlert', 'city'], ['MerchantRequest', 'city'], ['ClientError', 'city']
        ];
        for (const [model, p] of paths) {
            const m = require(`../models/${model}`);
            let sp = m.schema.path(p);
            if (!sp) {
                // حقلٌ داخل كائنٍ متداخل (Complaint.context.city مثلاً)
                const hit = Object.keys(m.schema.paths).find(k => k === p || k.endsWith('.' + p));
                sp = hit && m.schema.path(hit);
            }
            expect(sp, `${model}.${p}`).toBeTruthy();
            const values = (sp.caster || sp).enumValues;
            expect(values, `${model}.${p}`).toEqual(C.CITY_KEYS);
        }
    });

    it('المُجدوِل والتحليلات وباب التسجيل وبحث الأماكن تعرف عطبرة', () => {
        expect(read('scheduler.js')).toContain("require('./config/cities').CITY_KEYS");
        expect(require('../utils/analytics').CITIES).toEqual(C.CITY_KEYS);
        expect(require('../utils/analytics').normalizeCity('Atbara')).toBe('Atbara');
        expect(require('../utils/captainRegistration').CITY_LABEL.Atbara).toBe('عطبرة');
        expect(require('../utils/placesSearch').CITY_CENTERS.Atbara).toEqual(plain(C.CITIES.Atbara.search));
        const { VALID_CITIES } = require('../middleware/authMiddleware');
        expect(VALID_CITIES).toEqual(C.CITY_KEYS);
        expect(require('../middleware/cityMiddleware').VALID_CITIES).toEqual(C.CITY_KEYS);
    });
});

describe('الواجهة: كل المدن في كل مكان', () => {
    const PUB = path.join(ROOT, 'public_html');
    const pages = fs.readdirSync(PUB).filter(f => f.endsWith('.html') && !f.startsWith('_') && f !== 'lande.html');
    const scripts = fs.readdirSync(path.join(PUB, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f);
    const src = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
    const code = (s) => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|<!--)/.test(l)).join('\n');

    it('كل قائمة مدنٍ في الصفحات تعرض المدن كلّها', () => {
        for (const f of pages) {
            const s = src(f);
            const n = (k) => (s.match(new RegExp(`value="${k}"`, 'g')) || []).length;
            const k = n('Khartoum');
            if (!k) continue;
            for (const c of C.CITY_KEYS) expect(n(c), `${f}: ${c}`).toBe(k);
        }
    });

    it('لا «بورتسودان وإلا الخرطوم» في الواجهة', () => {
        for (const f of pages.concat(scripts)) {
            const s = code(src(f));
            expect(s, f).not.toMatch(/=== ?'PortSudan' \?/);
            expect(s, f).not.toMatch(/\[\s*'Khartoum'\s*,\s*'PortSudan'\s*\]/);
            expect(s, f).not.toMatch(/isKhartoum \?/);
        }
    });

    it('بطاقات الفتح الأول تُبنى من المدن لا تُكتب باليد', () => {
        const cs = src('js/city-service.js');
        expect(cs).toContain('VALID_CITIES: _WC.KEYS.slice()');
        expect(cs).toContain('${_WC.KEYS.map(k => `');
        expect(cs).not.toContain('data-city="PortSudan"');
        expect(cs).toContain('Atbara: _SVG(');
        // ثلاث بطاقات تطول على هاتفٍ قصير — تتمرّر
        expect(cs).toMatch(/#city-picker-overlay \{[^}]*overflow-y: auto/);
    });

    it('صفحة تسجيل المتجر تقرأ المدينة المحفوظة (لا تحمّل city-service)', () => {
        const s = src('client-register-shop.html');
        expect(s).toContain("localStorage.getItem('selected_city')");
        expect(s).toContain('WajeezCities.center(currentCity)');
    });

    it('أزرار مدن الخريطة في لوحة الإدارة: صنف active لكل مدينة', () => {
        const p = src('js/admin-panel.js');
        expect(p).toContain("b.classList.toggle('active', k === city)");
        expect(src('admin.html')).toContain('id="miniMapCityAtbara"');
        expect(src('admin.html')).toContain('id="fullMapCityAtbara"');
        expect(src('admin-finance.html')).toContain('id="cityBtn-Atbara"');
        expect(src('admin-sub-admins.html')).toContain('value="Atbara" id="city_Atbara"');
    });
});
