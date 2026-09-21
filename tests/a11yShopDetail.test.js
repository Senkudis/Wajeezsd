/**
 * ♿ الإتاحة في صفحة المتجر — تسعُ سماتٍ في 2445 سطراً، وفيها أربعةُ
 *    أعطابٍ تمنع الشراء لا تُجمّله:
 *
 *   ١. **تصفية المنتجات بالتصنيف** كانت `<div class="cat-tab" onclick>` —
 *      في الترميز الساكن وفي `createElement('div')` معاً. متجرٌ بعشرين
 *      تصنيفاً يصير قائمةً واحدةً طويلة أمام من لا يستعمل الفأرة.
 *
 *   ٢. **فتح تفاصيل المنتج**: اسم المنتج `<div class="product-name
 *      product-tap" onclick>`. وزرّ «التفاصيل والوصف كاملاً» لا يظهر إلا
 *      للمنتجات التي لها وصف — فالمنتج بلا وصفٍ لم يكن له أيّ طريقٍ
 *      بالكيبورد إلى تفاصيله.
 *
 *   ٣. **تكبير صورة المنتج** `<img onclick="openProductImage(...)">` في
 *      البطاقة وفي ورقة التفاصيل معاً.
 *
 *   ٤. **اختيار عنوان التوصيل من نتائج البحث** `<div onclick=
 *      "_selectShopSearch(...)">` — آخر خطوةٍ قبل إتمام الطلب.
 *
 *   وستّ تسمياتٍ في نموذج إتمام الطلب بلا `for` — منها «رقم هاتفه»،
 *   وهي تسميةٌ لا تدلّ على صاحبها حين تُقرأ وحدها.
 *
 *   ملاحظةٌ على الأنماط: الزرّ لا يرث الخطّ ولا اللون ولا محاذاة النصّ،
 *   وحاوية صورة البطاقة `flex` بارتفاع 120px والصورة كانت عنصرها المباشر
 *   بـ `height:100%` — فلولا `align-self: stretch` على الزرّ الجديد
 *   لانهارت النسبة المئوية على ارتفاعٍ تلقائيّ.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public_html/shop-detail.html'), 'utf8');

const near = (anchor, span = 300) => {
    const i = html.indexOf(anchor);
    expect(i, 'لم يُعثر على ' + anchor).toBeGreaterThan(-1);
    return html.slice(i, i + span);
};

describe('التصفية بالتصنيف صارت ممكنة بالكيبورد', () => {
    it('التبويب الساكن زرٌّ لا div', () => {
        expect(html).toContain('<button type="button" class="cat-tab active" data-cat="all" aria-pressed="true"');
        expect(html).not.toContain('<div class="cat-tab active"');
    });

    it('والتبويبات المبنيّة من التصنيفات كذلك', () => {
        const i = html.indexOf('cats.forEach(cat =>');
        const blk = html.slice(i, i + 500);
        expect(blk).toContain("createElement('button')");
        expect(blk).toContain("el.setAttribute('aria-pressed', 'false')");
        expect(blk).not.toContain("createElement('div')");
    });

    it('والشريط مجموعةٌ مسمّاة', () => {
        expect(html).toContain('id="catTabs" role="group" aria-label="تصنيفات المنتجات"');
    });

    it('و filterCat تنقل الاختيار في الحالتين معاً', () => {
        const i = html.indexOf('function filterCat(cat, el)');
        const blk = html.slice(i, i + 500);
        expect(blk).toContain("t.setAttribute('aria-pressed', 'false')");
        expect(blk).toContain("el.setAttribute('aria-pressed', 'true')");
    });
});

describe('تفاصيل المنتج وصورته', () => {
    it('اسم المنتج زرٌّ — وهو الطريق الوحيد لمنتجٍ بلا وصف', () => {
        expect(html).toContain('<button type="button" class="product-name product-tap" onclick="openProductDetails(');
        expect(html).not.toContain('<div class="product-name product-tap"');
    });

    it('وصورة البطاقة داخل زرٍّ مسمّى باسم المنتج', () => {
        expect(html).toContain('class="product-img-btn" aria-label="تكبير صورة ${escapeHtml(p.name)}"');
    });

    it('وصورة ورقة التفاصيل كذلك', () => {
        expect(html).toContain('class="pd-img-btn" aria-label="تكبير صورة ${escapeHtml(p.name)}"');
    });

    it('ولم يبقَ img بـ onclick في الصفحة', () => {
        expect(html).not.toMatch(/<img[^>]*onclick="openProductImage/);
    });
});

describe('الأنماط تُبقي الشكل كما كان', () => {
    it('الأزرار الجديدة ترث الخطّ واللون والمحاذاة', () => {
        expect(html).toContain('.cat-tab, .product-name.product-tap {');
        const i = html.indexOf('.pd-img-btn, .product-img-btn {');
        const blk = html.slice(i, i + 220);
        expect(blk).toContain('font: inherit');
        expect(blk).toContain('color: inherit');
    });

    it('وزرّ صورة البطاقة يمتدّ لارتفاع حاويته — وإلا انكمشت الصورة', () => {
        expect(html).toContain('.product-card-img .product-img-btn { height: 100%; align-self: stretch; }');
    });

    it('ولكلٍّ تركيزٌ مرئيّ', () => {
        const i = html.indexOf('.cat-tab:focus-visible');
        const blk = html.slice(i, i + 320);
        expect(blk).toContain('.product-name.product-tap:focus-visible');
        expect(blk).toContain('.pd-img-btn:focus-visible');
        expect(blk).toContain('.product-img-btn:focus-visible');
        expect(blk).toContain('outline:');
    });
});

describe('اختيار عنوان التوصيل', () => {
    it('صفّ النتيجة زرٌّ في قائمة اختيار لا div', () => {
        const i = html.indexOf("window._selectShopSearch('${p.place_id}')");
        expect(i).toBeGreaterThan(-1);
        const blk = html.slice(Math.max(0, i - 200), i + 200);
        expect(blk).toContain('role="option"');
        expect(blk).toContain('aria-selected="false"');
        expect(html).not.toContain(`<div onclick="window._selectShopSearch(`);
    });
});

describe('نموذج إتمام الطلب', () => {
    it('التسميات الستّ مربوطةٌ بحقولها', () => {
        for (const id of ['deliveryAddress', 'deliveryFee', 'receiverName',
                          'receiverPhone', 'orderNotes', 'promoCodeInput']) {
            expect(html, 'تسمية ' + id + ' غير مربوطة').toContain('for="' + id + '"');
        }
    });

    it('و«رقم هاتفه» صارت تدلّ على صاحبها', () => {
        expect(html).toContain('for="receiverPhone">رقم هاتف المستلم *</label>');
    });

    it('ونتيجة الكوبون تُعلَن — قبولاً أو رفضاً', () => {
        expect(near('id="promoResult"', 120)).toContain('aria-live="polite"');
    });

    it('وحقل البحث في المتجر مسمّى', () => {
        expect(near('id="storeProductSearch"', 300)).toContain('aria-label="ابحث في منتجات هذا المتجر"');
    });
});

describe('السلة ونوافذها', () => {
    it('درج السلة نافذةٌ حاجبة مسمّاة', () => {
        const tag = near('id="cartDrawer"', 200);
        expect(tag).toContain('role="dialog"');
        expect(tag).toContain('aria-modal="true"');
        expect(tag).toContain('aria-label="سلة مشترياتك"');
    });

    it('وأزرار الإغلاق الثلاثة لها أسماء تصف ما تُغلق', () => {
        expect(html).toContain('aria-label="إغلاق تفاصيل المنتج"');
        expect(html).toContain('aria-label="إغلاق التقييمات"');
        expect(html).toContain('aria-label="تجاهل استرجاع السلة"');
    });
});
