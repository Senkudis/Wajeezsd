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
        const blk = page.slice(i, page.indexOf('</script>', i));
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
        const i = page.indexOf('@media (prefers-reduced-motion: reduce)');
        expect(page.slice(i, i + 300)).toContain('.ticker-track { animation: none; }');
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

describe('الهاتف أولاً — كانت ١٢ شاشة تمرير', () => {
    it('شريط تحميلٍ ثابت على الجوال، بمتجر الجهاز نفسه، وبالمنطقة الآمنة', () => {
        expect(page).toContain('id="getbar"');
        expect(page).toMatch(/\.getbar \{[\s\S]*?var\(--sab, env\(safe-area-inset-bottom/);
        expect(page).toContain("getbarBtn.href = 'https://apps.apple.com/app/id6807840888'");
        expect(page).toContain("getbarBtn.href = 'https://play.google.com/store/apps/details?id=com.wajeezsd.app'");
        // يختفي عند نداء التحميل — لا زرّان للشيء نفسه فوق بعضهما
        expect(page).toContain('.observe(download)');
    });

    it('الأقسام المتقاربة مدموجة: الشروحات مع الأسئلة، والتواصل مع التحميل', () => {
        const faq = page.slice(page.indexOf('<section id="faq"'), page.indexOf('</section>', page.indexOf('<section id="faq"')));
        expect(faq).toContain('id="tutorials"');
        const dl = page.slice(page.indexOf('<section id="download"'), page.indexOf('</section>', page.indexOf('<section id="download"')));
        expect(dl).toContain('id="contact"');
        expect((page.match(/<section/g) || []).length).toBeLessThanOrEqual(7);
    });

    it('صورة البطل محدودة الارتفاع على الجوال — لا جهازٌ بطول شاشة', () => {
        expect(page).toMatch(/\.hero-shot \{[\s\S]*?height: clamp\(300px, 70vw, 560px\)/);
    });

    it('زرّا المتجرين بعرضٍ متساوٍ على الجوال، ولا يلتفّ اسم المتجر', () => {
        expect(page).toContain('.stores { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))');
        expect(page).toMatch(/\.btn-lines \.t2 \{[^}]*white-space: nowrap/);
    });

    it('اللقطات شريطٌ أفقي بالتقاط على الجوال', () => {
        expect(page).toMatch(/\.shots \{[^}]*scroll-snap-type: x mandatory/);
        expect(page).toMatch(/\.shot \{[^}]*scroll-snap-align: start/);
    });
});

describe('خطوط الهوية وحدها', () => {
    it('Alarabiya وArabic Modern وIntro مستضافة هنا — لا Cairo ولا Google Fonts', () => {
        for (const fam of ['Alarabiya', 'ArabicModern', 'Intro']) expect(page).toContain(`font-family: '${fam}'`);
        // الملفات نفسها خارج git (مرخّصة، والمستودع عام) — يُفحص المرجع لا الوجود
        for (const f of ['alarabiya.woff2', 'arabic-modern-bold.woff2', 'intro-regular.woff2', 'intro-bold.woff2']) {
            expect(page).toContain('/assets/fonts/brand/' + f);
        }
        expect(page).not.toContain('Cairo');
        expect(page).not.toContain('fonts.googleapis.com');
    });

    it('«؟» لا تُؤخذ من Alarabiya — ترسمها «١»', () => {
        const i = page.indexOf("font-family: 'Alarabiya'");
        expect(page.slice(i, i + 260)).toContain('unicode-range: U+0000-061E, U+0620-10FFFF');
    });

    it('بلا عريضٍ مزيّف — الخطوط بوزنٍ واحد', () => {
        expect(page).toContain('font-synthesis: none');
    });
});

describe('لا زخارف القوالب المولّدة', () => {
    it('لا توهّج ولا شبكة نقطية ولا نصّ متدرّج لامع', () => {
        expect(code).not.toContain('body::before');
        expect(code).not.toContain('body::after');
        expect(code).not.toContain('background-clip: text');
        expect(code).not.toContain('shimmer');
    });

    it('لا شارات فوق كل عنوان، ولا ظهور تدريجي لكل كتلة، ولا شريط تقدّم', () => {
        expect(code).not.toContain('eyebrow');
        expect(code).not.toContain('class="reveal');
        expect(code).not.toContain('id="progress"');
    });

    it('ولا شاراتٌ عائمة ولا مسارٌ متحرّك ولا ميلان', () => {
        expect(code).not.toContain('float-chip');
        expect(code).not.toContain('animateMotion');
        expect(code).not.toContain('perspective(');
    });
});

describe('حسابات التواصل', () => {
    it('قناة اليوتيوب في التذييل وفي البيانات المنظّمة', () => {
        expect(page).toContain('href="https://www.youtube.com/@wajeezsd"');
        const i = page.indexOf('"sameAs"');
        expect(page.slice(i, i + 400)).toContain('"https://www.youtube.com/@wajeezsd"');
    });

    it('وطريقة الدفع كما هي فعلاً: التوصيل كاش، والمتجر تحويل مباشر', () => {
        expect(page).not.toContain('لا بطاقة ولا محفظة إلكترونية');
        expect(page).toContain('تحوّل قيمتها للمتجر مباشرةً');
    });
});
