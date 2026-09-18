/**
 * 🔗 استخراج الموقع من روابط خرائط جوجل.
 *
 * الحاجة: كثيرٌ من الناس لا يُحسنون وضع الدبوس، لكنّهم يُحسنون مشاركة
 * الموقع. فالرابط أقصر طريقٍ بينهم وبين عنوانٍ صحيح — وأدقّه، لأنه مأخوذ
 * من مكانهم لا من تخمينهم.
 *
 * ⚠️ وأشيعُ الأشكال أصعبُها: ما يُشارَك اليوم هو maps.app.goo.gl — رابطٌ
 *    لا يحوي إحداثيات، ولا يفكّه المتصفّح (CORS). ولذلك وُجد المسار
 *    الخادميّ. وهو نفسه نقطة الخطر: مسارٌ يجلب رابطاً يرسله المستخدم هو
 *    تعريف ثغرة SSRF.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const M = require('../public_html/js/maps-link.js');

describe('🧭 تحليل الأشكال', () => {
    const cases = [
        ['الرابط الطويل بـ data',   'https://www.google.com/maps/place/X/@15.5007,32.5599,17z/data=!3m1!8m2!3d15.51!4d32.56', 15.51, 32.56],
        ['مركز الكاميرا @',         'https://www.google.com/maps/@15.6,32.53,17z', 15.6, 32.53],
        ['q=',                      'https://maps.google.com/?q=15.61,32.54', 15.61, 32.54],
        ['q=loc:',                  'https://maps.google.com/maps?q=loc:15.62,32.55', 15.62, 32.55],
        ['search api',              'https://www.google.com/maps/search/?api=1&query=15.63,32.56', 15.63, 32.56],
        ['dir api',                 'https://www.google.com/maps/dir/?api=1&destination=15.64,32.57', 15.64, 32.57],
        ['geo:',                    'geo:15.65,32.58', 15.65, 32.58],
        ['إحداثيات ملصوقة',         '15.66, 32.59', 15.66, 32.59]
    ];

    for (const [label, url, lat, lng] of cases) {
        it(label, () => {
            const r = M.parse(url);
            expect(r, url).toBeTruthy();
            expect(r.lat).toBeCloseTo(lat, 5);
            expect(r.lng).toBeCloseTo(lng, 5);
        });
    }

    it('🔑 يُفضّل إحداثيات المكان (!3d!4d) على مركز الكاميرا (@)', () => {
        // @ يتبع ما يراه المستخدم وقت النسخ وقد يبعد عشرات الأمتار عن المكان
        const r = M.parse('https://www.google.com/maps/place/X/@15.5007,32.5599,17z/data=!8m2!3d15.51!4d32.56');
        expect(r.lat).toBe(15.51);
        expect(r.source).toBe('place');
    });

    it('🔒 يرفض (0,0) — دائماً خطأ إدخال لا موقعاً', () => {
        expect(M.parse('https://maps.google.com/?q=0,0')).toBeNull();
        expect(M.validCoords(0, 0)).toBe(false);
    });

    it('ولا يخترع إحداثيات من نصٍّ ليس فيها', () => {
        expect(M.parse('https://example.com/abc')).toBeNull();
        expect(M.parse('مرحبا')).toBeNull();
        expect(M.parse('')).toBeNull();
    });
});

describe('🔗 الروابط المختصرة', () => {
    it('🔑 تُكشف لتُحال إلى الخادم — المتصفّح لا يفكّها', () => {
        expect(M.isShortLink('https://maps.app.goo.gl/AbCd')).toBe(true);
        expect(M.isShortLink('https://goo.gl/maps/xyz')).toBe(true);
    });

    it('والرابط الطويل لا يُحال بلا داعٍ', () => {
        expect(M.isShortLink('https://www.google.com/maps/@15.6,32.5,17z')).toBe(false);
    });
});

describe('🛡️ قائمة المضيفات — حارس SSRF', () => {
    it('تقبل نطاقات جوجل وقُطرياتها', () => {
        for (const h of ['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'www.google.com', 'google.com.eg', 'maps.google.de']) {
            expect(M.hostAllowed(h), h).toBe(true);
        }
    });

    it('🔑 وترفض هجوم اللاحقة — goo.gl.evil.com ليس goo.gl', () => {
        for (const h of ['goo.gl.evil.com', 'evil.com', 'notgoogle.com', 'google.com.attacker.net', '']) {
            expect(M.hostAllowed(h), h).toBe(false);
        }
    });
});

describe('🛡️ المسار الخادميّ', () => {
    const src = read('routes/maps.js');

    it('🔑 يفحص المضيف عند **كل** قفزة لا عند الأولى', () => {
        // رابطٌ مسموح قد يُحوّل إلى ممنوع — وهذا هو مربط الهجوم
        const loop = src.slice(src.indexOf('for (let hop'));
        expect(loop).toContain('MapsLink.hostAllowed(nextUrl.hostname)');
        expect(loop).toContain('maxRedirects: 0');
    });

    it('🔒 https فقط', () => {
        expect(src).toMatch(/\^https:\\\/\\\//);
        expect(src).toMatch(/\/\^https:\$\/i\.test\(nextUrl\.protocol\)/);
    });

    it('🔒 بحدّ قفزات ومهلة وحجم', () => {
        expect(src).toMatch(/MAX_HOPS\s*=\s*\d+/);
        expect(src).toMatch(/TIMEOUT_MS\s*=\s*\d+/);
        expect(src).toContain('maxContentLength');
    });

    it('🔒 مُصادَق ومحدود المعدّل', () => {
        expect(src).toMatch(/router\.post\('\/resolve', protect, resolveLimiter/);
    });

    it('ولا يُجري طلب شبكة إن حمل الرابط إحداثياته', () => {
        const idx = src.indexOf('const direct = MapsLink.parse(raw)');
        expect(idx).toBeGreaterThan(-1);
        expect(idx).toBeLessThan(src.indexOf('axios.get'));
    });

    it('🔗 ومركّب على /api/maps', () => {
        expect(read('index.js')).toContain("apiRoutes.use('/maps', require('./routes/maps'))");
    });
});

describe('🖥️ المكوّن في الواجهة', () => {
    const w = read('public_html/js/maps-link-input.js');

    it('🔑 لا يحلّل بنفسه — يستدعي الوحدة المشتركة', () => {
        // نسختان تفترقان تعنيان رابطاً يُقبل هنا ويُرفض في الخادم
        expect(w).toContain('MapsLink.parse(raw)');
        expect(w).toContain('MapsLink.isShortLink(raw)');
        expect(w).toContain('/api/maps/resolve');
    });

    it('يعرض معاينة قبل التأكيد — لا يعتمد الموقع بلا رؤية', () => {
        expect(w).toContain('function showPreview');
        expect(w).toContain('mli-confirm');
        expect(w).toContain('reverseGeocode');
    });

    it('واللصق يفحص تلقائياً — خطوةٌ أقلّ على من لا يعرف', () => {
        expect(w).toMatch(/addEventListener\('paste'/);
    });

    it('🔗 ومركَّب في الصفحات الثلاث', () => {
        for (const f of ['public_html/index.html', 'public_html/shop-detail.html', 'public_html/admin-places.html']) {
            expect(read(f), f).toContain('js/maps-link-input.js');
        }
    });

    it('🔑 وفي طلب العميل يُحرّك الخريطة لا يتجاوزها', () => {
        // بهذا يمرّ الموقع بفحص النطاق ومعاينة العنوان كالموقع اليدويّ
        const idx = read('public_html/index.html');
        const boot = idx.slice(idx.indexOf("MapsLinkInput.mount('#mapLinkHost'"));
        expect(boot.slice(0, 700)).toContain('window.map.panTo');
        expect(boot.slice(0, 700)).toContain('checkDeliveryZone');
    });
});
