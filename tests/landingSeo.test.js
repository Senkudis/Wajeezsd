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
        expect(page).toMatch(/<title>وجيز - wajeezsd \| تطبيق توصيل في أم درمان وبورتسودان وعطبرة<\/title>/);
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
        for (const t of ['توصيل الطلبات والمشاوير', 'اشترِ لي', 'توصيل لأكثر من عنوان', 'توصيل في أم درمان', 'توصيل في بورتسودان', 'توصيل في عطبرة']) {
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

describe('عطبرة على الصفحة العامة', () => {
    it('في العنوان والوصف والمشاركة والبيانات المنظّمة', () => {
        expect(page).toMatch(/<meta name="description"\s+content="[^"]*أم درمان وبورتسودان وعطبرة/);
        expect(page).toContain('<meta property="og:title" content="وجيز - wajeezsd | تطبيق توصيل في أم درمان وبورتسودان وعطبرة">');
        const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
        const org = blocks[0]['@graph'].find(n => n['@type'] === 'Organization');
        expect(org.areaServed.map(c => c.name)).toEqual(['أم درمان', 'بورتسودان', 'عطبرة']);
        const faq = blocks[1].mainEntity.find(q => q.name.includes('كل السودان'));
        expect(faq.acceptedAnswer.text).toContain('عطبرة');
    });

    it('ولا جملةٌ بقيت على مدينتين', () => {
        const body = page.replace(/<!--[\s\S]*?-->/g, '');
        expect(body).not.toMatch(/أم درمان وبورتسودان(?!\s*و?عطبرة)[^و]/);
        expect(body).not.toContain("in Omdurman and Port Sudan");
        expect(body).toContain('أم درمان · بورتسودان · عطبرة');
    });

    it('بطاقة المدينة الجديدة، وخبرها في البطل يقود إليها', () => {
        expect(page).toContain('class="city city--new reveal"');
        expect(page).toContain('href="#cities"');
        expect(page).toContain('id="cities"');
    });

    it('المدن المتبدّلة زينة — الجملة كاملةً للقارئ الآلي', () => {
        expect(page).toContain('<span class="sr-only" data-i18n="ticker_sr">نوصّل الآن في أم درمان وبورتسودان وعطبرة</span>');
        expect(page).toMatch(/<span class="ticker" aria-hidden="true">/);
    });

    it('والحركة الجديدة تتوقّف لمن طلب تقليلها — حتى مسار SMIL', () => {
        const reduced = page.slice(page.indexOf('@media (prefers-reduced-motion: reduce)'));
        expect(reduced.slice(0, 900)).toContain('.ticker-track { animation: none; }');
        expect(page).toContain('art.pauseAnimations()');
        // والميلان للحاسوب بفأرة وحده
        expect(page).toContain("matchMedia('(hover: hover) and (pointer: fine)').matches");
    });

    it('صورة المشاركة بالمدن الثلاث', () => {
        expect(read('scripts/gen-og-image.js')).toContain("'تطبيق التوصيل في أم درمان وبورتسودان وعطبرة'");
    });
});
