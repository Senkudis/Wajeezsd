/**
 * 🔎 نطاقٌ واحد في البحث، وصفحات التطبيق خارج الفهرس — utils/seoRouting.js
 */
const fs = require('fs');
const path = require('path');
const { wwwRedirectTarget } = require('../utils/seoRouting');

const go = (o) => wwwRedirectTarget({ method: 'GET', host: 'www.wajeezsd.com', originalUrl: '/', ...o });

describe('www ⇒ wajeezsd.com', () => {
    it('تحويلٌ دائم يحفظ المسار والاستعلام', () => {
        expect(go({})).toBe('https://wajeezsd.com/');
        expect(go({ originalUrl: '/pricing.html?x=1' })).toBe('https://wajeezsd.com/pricing.html?x=1');
        expect(go({ host: 'WWW.wajeezsd.com:443' })).toBe('https://wajeezsd.com/');
    });

    it('لا يُحوَّل: النطاق الرئيسي، وغير GET، والـ API، و.well-known', () => {
        expect(go({ host: 'wajeezsd.com' })).toBeNull();
        expect(go({ host: 'team.wajeezsd.com' })).toBeNull();
        expect(go({ method: 'POST' })).toBeNull();
        expect(go({ originalUrl: '/api/auth/login' })).toBeNull();
        // مُتحقّق App Links لا يتبع التحويل — روابط www في التطبيق تعتمد عليه
        expect(go({ originalUrl: '/.well-known/assetlinks.json' })).toBeNull();
    });
});

describe('موصولٌ في الخادم والأيقونات', () => {
    const root = path.join(__dirname, '..');
    it('الوسيط يعمل قبل أي مسار', () => {
        const idx = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
        const mw = idx.indexOf("require('./utils/seoRouting')");
        expect(mw).toBeGreaterThan(-1);
        expect(mw).toBeLessThan(idx.indexOf("app.get('/',"));
        expect(mw).toBeLessThan(idx.indexOf('app.use(express.static('));
        expect(idx).toContain("res.setHeader('X-Robots-Tag', 'noindex, nofollow')");
    });

    it('🔑 الأيقونات مربّعة بمقاساتها الحقيقية — كانت كلّها 744×658 بيضاء شفّافة', () => {
        const png = (f) => {
            const b = fs.readFileSync(path.join(root, 'public_html', f));
            return [b.readUInt32BE(16), b.readUInt32BE(20)];
        };
        expect(png('icons/icon-192x192.png')).toEqual([192, 192]);
        expect(png('icons/icon-512x512.png')).toEqual([512, 512]);
        expect(png('icons/apple-touch-icon.png')).toEqual([180, 180]);
        expect(png('icons/favicon-48.png')).toEqual([48, 48]);
        // ICO حقيقي: 00 00 01 00 لا توقيع PNG
        const ico = fs.readFileSync(path.join(root, 'public_html', 'favicon.ico'));
        expect([...ico.slice(0, 4)]).toEqual([0, 0, 1, 0]);
    });

    it('وصفحة الهبوط تُعلنها لجوجل', () => {
        const page = fs.readFileSync(path.join(root, 'public_html', 'lande.html'), 'utf8');
        expect(page).toContain('<link rel="icon" href="/favicon.ico" sizes="any">');
        expect(page).toContain('sizes="48x48" href="/icons/favicon-48.png"');
    });
});
