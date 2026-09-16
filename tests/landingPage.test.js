/**
 * 🌐 صفحة الهبوط — أُعيد بناؤها.
 *
 * ما حُذف، ولماذا الحذف هو الإصلاح:
 *
 *   ١. **حاسبة السعر**: كانت تعطي رقماً من جدولٍ مكتوبٍ في الصفحة لا علاقة
 *      له بما يحسبه التطبيق — والتطبيق أصلاً لا يسعّر: الكابتن يقدّم عرضاً.
 *      أي أنها تَعِد الزائر برقمٍ لن يراه، وهذا أسوأ من غياب الحاسبة.
 *   ٢. **آراء عملاء منسوبة لأسماء وصور** لم يقلها أحد. شهادات مختلَقة —
 *      وسياسات المتجرين تمنعها، والثقة التي تبنيها زائفة.
 *   ٣. **عدّاد نشاطٍ حيّ** («تم توصيل طرد قبل دقيقتين») كان نصّاً يدور في
 *      حلقة، لا بيانات.
 *
 * وما أُضيف: رابط App Store (التطبيق نُشر فعلاً)، وقسم الفريق، ولقطات
 * حقيقية من النسخة المنشورة بدل محاكاةٍ مرسومة بالـCSS.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, '..', 'public_html');
const page = fs.readFileSync(path.join(PUB, 'lande.html'), 'utf8');
// التعليقات تشرح ما حُذف ولماذا، فتذكر أسماء المحذوف — تُنزع قبل أي فحصِ غياب
const code = page
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).map(l => l.split('//')[0]).join('\n');

describe('لا محتوى مُختلَق', () => {
    it('لا حاسبة سعر — التطبيق لا يسعّر، الكابتن يعرض', () => {
        expect(code).not.toContain('calculateFare');
        expect(code).not.toContain('calc-form-grid');
        expect(code).not.toContain('حاسبة');
    });

    it('لا شهادات منسوبة لأسماء لم تقلها', () => {
        expect(code).not.toContain('testimonial');
        expect(page).not.toContain('★★★★★');
        for (const n of ['محمد أحمد', 'سارة عمر', 'علي محمود']) {
            expect(page).not.toContain(n);
        }
    });

    it('ولا عدّاد نشاطٍ يدور في حلقة', () => {
        expect(code).not.toContain('activity-toast');
        expect(code).not.toContain('showActivityToast');
    });
});

describe('المتجران معاً — التطبيق نُشر على آبل', () => {
    it('رابط App Store الحقيقي في البطل وفي نداء التحميل', () => {
        const links = page.match(/https:\/\/apps\.apple\.com\/app\/id6807840888/g) || [];
        expect(links.length).toBeGreaterThanOrEqual(2);
    });

    it('ورابط جوجل بلاي كذلك', () => {
        const links = page.match(/play\.google\.com\/store\/apps\/details\?id=com\.wajeezsd\.app/g) || [];
        expect(links.length).toBeGreaterThanOrEqual(2);
    });

    it('ولا أثر لـ«قريباً» على آيفون — الوعد القديم صار خبراً قديماً', () => {
        expect(page).not.toContain('قريباً على iPhone');
        expect(page).not.toContain('متوفر قريباً على');
        expect(page).not.toContain('Coming soon');
        expect(page).not.toContain('pill-tag-soon');
    });

    it('والبيانات المنظَّمة تذكر المتجرين', () => {
        const i = page.indexOf('"@type": "MobileApplication"');
        const blk = page.slice(i, i + 700);
        expect(blk).toContain('apps.apple.com');
        expect(blk).toContain('play.google.com');
    });
});

describe('قسم الفريق', () => {
    it('في التنقّل وفي الصفحة', () => {
        expect(page).toContain('id="team"');
        expect(page).toContain('data-i18n="nav_team"');
    });

    it('ويقود إلى صفحة الفريق الفعلية', () => {
        expect(page).toContain('href="/team"');
    });

    it('ويشرح فائدته: التحقّق من هوية من يقول إنه من وجيز', () => {
        expect(page).toContain('QR');
        expect(page).toContain('تأكّد من بطاقته');
    });
});

describe('التجاوب ينشأ من التخطيط لا من نقاط توقّف مرقّعة', () => {
    it('مقاييس سائلة بـ clamp لا أحجام ثابتة للعناوين', () => {
        expect(page).toContain('--step-4: clamp(');
        expect(page).toMatch(/h2\.sec-title \{ font-size: var\(--step-3\)/);
    });

    it('وشبكات auto-fit تُعيد التوزيع عند أي عرض', () => {
        const autofit = page.match(/repeat\(auto-fit, minmax\(/g) || [];
        expect(autofit.length).toBeGreaterThanOrEqual(6);
    });

    it('ونتوء الشارتين بالبكسل لا بالنسبة — النسبة تكبر فتخرج عن الشاشة', () => {
        expect(page).toContain('.chip-live { inset-block-start: 7%; inset-inline-end: -22px; }');
        expect(page).toMatch(/\.stage \{[^}]*padding-inline: 26px/);
    });

    it('ومنطقيّة الاتجاه (inline) لا يمين/يسار — الصفحة تنقلب مع اللغة', () => {
        expect(page).not.toMatch(/\[dir="ltr"\]/);
        expect(page).toContain('inset-inline');
    });
});

describe('الوصول والأداء', () => {
    it('رابط تخطٍّ ومَعالم دلالية', () => {
        expect(page).toContain('class="skip-link"');
        expect(page).toContain('<main id="main">');
        expect(page).toContain('aria-label="التنقّل الرئيسي"');
    });

    it('التبويبات مُعلَنة كتبويبات وتُدار بلوحة المفاتيح', () => {
        expect(page).toContain('role="tablist"');
        expect(page).toContain('aria-selected');
        expect(page).toContain("e.key === fwd");
    });

    it('والقائمة تُعلن حالتها وتُغلق بـ Escape', () => {
        expect(page).toContain('aria-expanded');
        expect(page).toContain("e.key === 'Escape'");
    });

    it('الحركة تتوقّف لمن طلب تقليلها', () => {
        expect(page).toContain('@media (prefers-reduced-motion: reduce)');
        expect(page).toContain("matchMedia('(prefers-reduced-motion: reduce)').matches");
    });

    it('الصور بأبعادٍ معلنة وتحميلٍ كسول — لا قفزٌ في التخطيط', () => {
        const imgs = page.match(/<img[^>]*>/g) || [];
        const sized = imgs.filter(t => /width="/.test(t) && /height="/.test(t));
        expect(sized.length).toBe(imgs.length);
        expect(page).toContain('loading="lazy"');
        expect(page).toContain('fetchpriority="high"');
    });

    it('واللقطات من النسخة المنشورة موجودة فعلاً', () => {
        for (const f of ['home.jpg', 'shop.jpg', 'store.jpg']) {
            expect(fs.existsSync(path.join(PUB, 'assets', 'app', f)), f).toBe(true);
            expect(page).toContain(`/assets/app/${f}`);
        }
    });
});

describe('الترجمة', () => {
    it('العربية تُقرأ من الماركب فلا تُكتب مرّتين', () => {
        expect(page).toContain('ar: {},');
        expect(page).toContain("T.ar[el.dataset.i18n] = el.innerHTML");
    });

    it('وكل مفتاح إنجليزي له مقابلٌ في الصفحة', () => {
        const enBlock = page.slice(page.indexOf('en: {'), page.indexOf('const PERSONAS'));
        const enKeys = [...enBlock.matchAll(/^\s{16}([a-z0-9_]+):/gm)].map(m => m[1]);
        const domKeys = new Set([...page.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]));
        const orphans = enKeys.filter(k => !domKeys.has(k));
        expect(orphans).toEqual([]);
    });

    it('وكل مفتاح في الصفحة له ترجمة إنجليزية', () => {
        const enBlock = page.slice(page.indexOf('en: {'), page.indexOf('const PERSONAS'));
        const domKeys = [...new Set([...page.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]))];
        const missing = domKeys.filter(k => !new RegExp('\\b' + k + ':').test(enBlock));
        expect(missing).toEqual([]);
    });
});

describe('نظامٌ بصري واحد، لا أقسامٌ متجاورة', () => {
    it('حقل ضوءٍ ثابت تحت الصفحة كلها — لا في البطل وحده', () => {
        expect(page).toContain('body::before');
        expect(page).toMatch(/body::before \{[\s\S]*?position: fixed/);
    });

    it('وشبكة نقطية تتلاشى نزولاً', () => {
        expect(page).toContain('body::after');
        expect(page).toContain('mask-image: radial-gradient(ellipse 130% 70% at 50% 0%');
    });

    it('والأقسام تتناوب: ثلاثة فصولٍ مُشرَّطة', () => {
        const bands = page.match(/<section id="[^"]+" class="band">/g) || [];
        expect(bands.length).toBe(3);
        expect(page).toContain('.band::before, .band::after');
    });

    it('وإطار الجهاز واحدٌ في البطل والمعرض — لا إطارَين مختلفَين', () => {
        expect(page).toContain('.shot .phone {');
        expect(page).not.toContain('.shot .frame');
        const shots = page.match(/<div class="phone"><img src="\/assets\/app\//g) || [];
        expect(shots.length).toBe(3);
    });
});

describe('المعرض لا يبتلع الشاشة', () => {
    it('ثلاثة أجهزةٍ بعرضٍ محكوم لا ثلاث صورٍ بعرض العمود', () => {
        const i = page.indexOf('.shots {');
        const blk = page.slice(i, i + 260);
        expect(blk).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
        expect(blk).toContain('max-width: 760px');
    });

    it('وعلى الجوال شريطٌ أفقي بالتقاط لا ثلاث شاشاتٍ فوق بعضها', () => {
        const i = page.indexOf('@media (max-width: 660px)');
        expect(i).toBeGreaterThan(-1);
        const blk = page.slice(i, i + 600);
        expect(blk).toContain('scroll-snap-type: x mandatory');
        expect(blk).toContain('scroll-snap-align: center');
    });
});

describe('بلاطاتٌ متفاوتة لا ستّ نسخٍ متطابقة', () => {
    it('١ و٤ و٥ تأخذ عمودين فتمتلئ الصفوف الثلاثة بلا فجوة', () => {
        expect(page).toContain('#featGrid > .card:nth-child(1),');
        expect(page).toMatch(/nth-child\(5\) \{ grid-column: span 2; \}/);
    });

    it('وكل جمهورٍ ستّ مزايا بالضبط — البلاطات محسوبة على هذا العدد', () => {
        const i = page.indexOf('const PERSONAS');
        const blk = page.slice(i, page.indexOf('};', i));
        // حدود كل جمهور: من مفتاحه إلى مفتاح الذي يليه — بلا تعابير نمطية
        const arBlk = blk.slice(blk.indexOf('ar: {'), blk.indexOf('en: {'));
        for (const [key, next] of [['client', 'merchant'], ['merchant', 'captain'], ['captain', null]]) {
            const a = arBlk.indexOf(key + ': [');
            expect(a, key).toBeGreaterThan(-1);
            const b = next ? arBlk.indexOf(next + ': [') : arBlk.length;
            expect(arBlk.slice(a, b).split("['bi-").length - 1, key).toBe(6);
        }
        expect((blk.match(/(client|merchant|captain): \[/g) || []).length).toBe(6);
    });

    it('والخطوات يصلها خيطٌ فتُقرأ مساراً', () => {
        expect(page).toContain('.steps::before');
        expect(page).toContain('repeating-linear-gradient(90deg, var(--line)');
    });
});

describe('لا تجاوز أفقي مصدره التوهّج', () => {
    it('هالة الجهاز لا تتجاوز حشو المسرح الجانبي', () => {
        // ‎-30% من عرض الحاوية كان يوسّع المستند 36px على جوالٍ ضيّق
        const i = page.indexOf('.phone-wrap::before');
        const blk = page.slice(i, i + 220);
        const m = blk.match(/inset: -\d+% -(\d+)%/);
        expect(m).not.toBeNull();
        expect(Number(m[1])).toBeLessThanOrEqual(9);
    });

    it('والجهاز الخلفي يظهر حيث يتّسع العمود وحده', () => {
        expect(page).toContain('.phone-back { display: none; }');
        expect(page).toMatch(/@media \(min-width: 980px\) \{[\s\S]{0,240}\.phone-back \{/);
    });
});
