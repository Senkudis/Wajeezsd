/**
 * 🔎 صفحة التعريف ومحرّكات البحث — الاسم المعتمد «وجيز - wajeezsd».
 *
 * ما كان ينقص: الاسم «وجيز» وحده (بحث wajeezsd لا يطابق شيئاً)، وصورة
 * المشاركة أيقونةٌ مربّعة تُقصّ، وبطاقات التجّار والكباتن تُرسم بالسكربت
 * فلا تراها محرّكات البحث، ولا robots.txt ولا sitemap.xml.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const page = read('public_html/lande.html');

describe('الاسم المعتمد', () => {
    it('🔑 في العنوان والوصف واسم الموقع', () => {
        expect(page).toMatch(/<title>وجيز - wajeezsd \| تطبيق توصيل في أم درمان وبورتسودان<\/title>/);
        expect(page).toMatch(/<meta name="description"\s+content="وجيز - wajeezsd:/);
        expect(page).toContain('<meta property="og:site_name" content="وجيز - wajeezsd">');
    });

    it('🔑 WebSite في البيانات المنظّمة — منه يأخذ جوجل «اسم الموقع»', () => {
        const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
            .map(m => JSON.parse(m[1]));
        const graph = blocks.find(b => b['@graph'])['@graph'];
        const site = graph.find(x => x['@type'] === 'WebSite');
        expect(site.name).toBe('وجيز - wajeezsd');
        expect(site.alternateName).toEqual(expect.arrayContaining(['وجيز', 'wajeezsd', 'Wajeez']));
        const org = graph.find(x => x['@type'] === 'Organization');
        expect(org.sameAs).toEqual(expect.arrayContaining(['https://facebook.com/wajeezsd']));
        const app = graph.find(x => x['@type'] === 'MobileApplication');
        expect(app.name).toBe('وجيز - wajeezsd');
    });

    it('والعنوان الأوّل يقول ما يُقدَّم', () => {
        expect(page).toMatch(/<h1 data-i18n="hero_h1">تطبيق التوصيل وجيز/);
        expect((page.match(/<h1\b/g) || []).length).toBe(1);
    });

    it('والصفحات العامة الأخرى بالاسم نفسه', () => {
        for (const p of ['pricing.html', 'privacy-policy.html', 'captain-signup.html', 'client-register-shop.html',
            'tutorial-app-order.html', 'tutorial-shop-order.html', 'tutorial-merchant-register.html']) {
            expect(read(`public_html/${p}`), p).toMatch(/<title>[^<]*\| وجيز - wajeezsd<\/title>/);
        }
    });
});

describe('المشاركة والتثبيت', () => {
    it('🔑 صورة مشاركة مستطيلة 1200×630 — لا الأيقونة المربّعة', () => {
        expect(page).toContain('<meta property="og:image" content="https://wajeezsd.com/og-image.jpg">');
        expect(page).toContain('<meta property="og:image:width" content="1200">');
        expect(page).not.toContain('og:image" content="https://wajeezsd.com/icons/icon-512x512.png');
        const buf = fs.readFileSync(path.join(__dirname, '..', 'public_html/og-image.jpg'));
        expect(buf.length).toBeLessThan(300 * 1024);   // معاينة واتساب تتجاهل الأثقل
        // أبعاد JPEG من مقطع SOF0/SOF2
        let i = 2, dims = null;
        while (i < buf.length) {
            const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
            if (marker === 0xC0 || marker === 0xC2) { dims = [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; break; }
            i += 2 + len;
        }
        expect(dims).toEqual([1200, 630]);
    });

    it('شريط التطبيق في Safari على آيفون', () => {
        expect(page).toContain('<meta name="apple-itunes-app" content="app-id=6807840888">');
    });
});

describe('المحتوى مقروءٌ بلا سكربت', () => {
    it('🔑 بطاقات الجماهير الثلاثة في HTML — لا تُرسم بعد التحميل وحدها', () => {
        for (const key of ['client', 'merchant', 'captain']) {
            const i = page.indexOf(`id="feat-${key}"`);
            expect(i, key).toBeGreaterThan(-1);
            const panel = page.slice(i, page.indexOf('\n                </div>', i));
            expect((panel.match(/<article class="card">/g) || []).length, key).toBe(6);
        }
        expect(page).toContain('متجر إلكتروني مجاني');   // من بطاقات التاجر
        expect(page).toContain('دخل يومي');              // من بطاقات الكابتن
    });

    it('قسم الخدمات بالكلمات التي يُبحث بها، ولكل مدينةٍ فقرة', () => {
        expect(page).toContain('id="services"');
        for (const t of ['توصيل الطلبات والمشاوير', 'اشترِ لي', 'توصيل لأكثر من عنوان', 'توصيل في أم درمان', 'توصيل في بورتسودان']) {
            expect(page).toContain(t);
        }
    });

    it('والمظهر يُضبط قبل أول رسم', () => {
        const head = page.slice(0, page.indexOf('</head>'));
        expect(head).toContain("document.documentElement.setAttribute('data-theme', t)");
    });
});

describe('robots.txt و sitemap.xml', () => {
    const robots = read('public_html/robots.txt');
    const sitemap = read('public_html/sitemap.xml');

    it('🔑 لوحات التحكّم وملفات المستخدمين خارج الفهرسة', () => {
        for (const d of ['Disallow: /admin-*.html', 'Disallow: /api/', 'Disallow: /uploads/documents/', 'Disallow: /uploads/proofs/', 'Disallow: /uploads/chat/']) {
            expect(robots).toContain(d);
        }
        expect(robots).toContain('Sitemap: https://wajeezsd.com/sitemap.xml');
    });

    it('وصفحتا الانضمام مفتوحتان رغم حجب لوحات الكباتن والعملاء', () => {
        expect(robots).toContain('Allow: /captain-signup.html');
        expect(robots).toContain('Allow: /client-register-shop.html');
    });

    it('الخريطة بالصفحات العامة وحدها', () => {
        expect(sitemap).toContain('<loc>https://wajeezsd.com/</loc>');
        expect(sitemap).not.toMatch(/\.com\/(admin|merchant-|captain-(?!signup)|client-(?!register-shop))/);
    });
});
