/**
 * 📏 ارتفاع الشريط السفلي — يُقاس ولا يُخمَّن.
 *
 * العطل الذي شكا منه التجّار: زرّ إضافة المنتج لا يظهر على بعض الهواتف،
 * وعلى بعضها «تحت شديد». السبب أن ارتفاع الشريط كان مكتوباً رقماً ثابتاً
 * (80px في .m-fab وحشوة body، و84/78px في captain-ui) — وهو تخمينٌ صحيح
 * على جهاز المطوّر وحده. ارتفاع الشريط محكومٌ بمحتواه، وأندرويد يسمح
 * للمستخدم بتكبير خط النظام وحجم العرض (DPI) من الإعدادات. عند التكبير
 * يتجاوز الشريط 80px فيقع الزرّ **خلفه** (z-index الشريط 1000 والزر 999)
 * فيختفي تماماً.
 *
 * الحلّ نصفان يحرسهما هذا الملف معاً: وحدةٌ تقيس الشريط وتُصدّر
 * --wj-nav-h، وقواعدُ CSS تستهلكه. نصفٌ بلا الآخر لا يفعل شيئاً.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('وحدة القياس (js/safe-area.js)', () => {
    const src = read('public_html/js/safe-area.js');

    it('تقيس الشريط الفعلي لا رقماً ثابتاً', () => {
        expect(src).toContain('measureBottomNav');
        expect(src).toContain('getBoundingClientRect().height');
    });

    it('تشمل أشرطة التاجر والكابتن معاً', () => {
        expect(src).toMatch(/NAV_SELECTOR\s*=\s*'[^']*\.merchant-nav[^']*\.captain-nav/);
    });

    it('تُصدّر --wj-nav-h على الجذر', () => {
        expect(src).toContain("setProperty('--wj-nav-h'");
    });

    it('تعيد القياس عند تغيّر حجم الشريط (تكبير خط النظام/الدوران)', () => {
        // الحدث الذي يسبق تغيّر الارتفاع غير معروف مسبقاً — المراقب يغني
        // عن تعداد الأحداث ويلتقطها كلها
        expect(src).toContain('ResizeObserver');
        expect(src).toContain('_navObserver.observe(nav)');
    });

    it('حشوة body تُشتقّ من القياس لا من 80px', () => {
        const i = src.indexOf('wj-safe-area-merchant');
        const block = src.slice(i, i + 600);
        expect(block).toContain('var(--wj-nav-h');
        // الرقم القديم يبقى **احتياطياً داخل var() فقط** لا قيمةً أساسية
        expect(block).not.toMatch(/padding-bottom:\s*calc\(80px/);
    });
});

describe('مستهلكو القياس (CSS)', () => {
    const merchant = read('public_html/css/merchant-ui.css');
    const captain  = read('public_html/css/captain-ui.css');

    const ruleOf = (css, sel) => {
        const i = css.indexOf(sel + ' {');
        return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
    };

    it('زرّ الإضافة يتموضع بالقياس', () => {
        const fab = ruleOf(merchant, '.m-fab');
        expect(fab).toContain('var(--wj-nav-h');
        expect(fab).not.toMatch(/bottom:\s*calc\(var\(--sab[^)]*\)[^)]*\)\s*\+\s*80px\)/);
    });

    it('زرّ الإضافة فوق الشريط في التكديس — الفشل يعني تراكباً لا اختفاءً', () => {
        // الشريط z-index: 1000. لو بقي الزر 999 لعاد يختفي كلياً عند أي خلل قياس.
        const fab = ruleOf(merchant, '.m-fab');
        expect(fab).toMatch(/z-index:\s*100[1-9]/);
    });

    it('خلوص محتوى الكابتن يتموضع بالقياس', () => {
        expect(ruleOf(captain, '.cap-nav-clearance')).toContain('var(--wj-nav-h');
    });

    it('زرّا النجدة والوضع الليلي فوق شريط الكابتن بالقياس', () => {
        // كلاهما عائمٌ فوق الشريط بنفس التخمين القديم (78px)
        const hits = captain.match(/bottom:\s*calc\(var\(--wj-nav-h/g) || [];
        expect(hits.length).toBeGreaterThanOrEqual(2);
    });

    it('الاحتياطي يبقي السلوك القديم لو تعذّر القياس', () => {
        // var(--wj-nav-h, <القديم>) — لا نترك الأجهزة بلا خلوص إطلاقاً
        expect(ruleOf(merchant, '.m-fab')).toMatch(/var\(--wj-nav-h,\s*calc\(/);
        expect(ruleOf(captain, '.cap-nav-clearance')).toMatch(/var\(--wj-nav-h,\s*calc\(/);
    });
});

describe('قاعدة CSS مكسورة في صفحة المنتجات', () => {
    const page = read('public_html/merchant-products.html');

    it('لم تعد هناك قاعدة .fab بلا قوس إغلاق تبتلع .category-badge', () => {
        // كانت `.fab {` تُفتح ولا تُغلق، فيتخطّى المحلّل كل شيء حتى أول `}`
        // ⇒ أنماط .category-badge تُهمَل بالكامل في هذه الصفحة.
        expect(page).not.toMatch(/\.fab\s*\{[^}]*\.category-badge/);
    });

    it('شارة التصنيف ما زالت معرَّفة', () => {
        expect(page).toMatch(/\.category-badge\s*\{[^}]*font-size/);
    });
});
