/**
 * ♿ الإتاحة في مسار الطلب — أهمّ شاشةٍ في التطبيق كانت أقلَّها إتاحةً.
 *
 *   `client-order.html` فيها أربع سمات `aria-` فقط في 1436 سطراً، بينما
 *   هي الشاشة التي يمرّ منها كل طلبٍ من المتاجر. والعيوب لم تكن تجميلية:
 *
 *   ١. **أزرارٌ أيقونيةٌ صامتة.** زرّ الرجوع من قائمة المحلات أيقونة سهمٍ
 *      وحدها، وإغلاق نافذة تفاصيل المحل `<i class="bi bi-x-lg">` وحده،
 *      وإغلاق منتقي «اشترِ لي» رمز `✕` خام. قارئ الشاشة ينطق «زر» بلا
 *      اسم — فلا يُعرَف ما الذي يفعله إلا بالضغط عليه.
 *
 *   ٢. **`placeholder` بديلاً عن التسمية.** حقل البحث الرئيسي وحقل البحث
 *      على الخريطة بلا `aria-label`. الـ `placeholder` يختفي عند أول حرف،
 *      فيبقى الحقل بلا اسمٍ أثناء الكتابة نفسها.
 *
 *   ٣. **نتائجُ تتبدّل بصمت.** قائمة المحلات وعدّادها يُملآن من الشبكة بعد
 *      اختيار تصنيف، بلا `aria-live` — فلا شيء يُعلَن، والشاشة تبدو جامدة.
 *      وبانر «خارج منطقة التوصيل» يظهر فوق الخريطة بلا `role="alert"`،
 *      وهو تحذيرٌ يمنع إتمام الطلب.
 *
 *   ٤. **حقول بلا `for`.** هاتف المستلم وسعر التوصيل لهما `<label>` مرئيّ
 *      غير مربوطٍ بالحقل، فالنقر على التسمية لا يُركّز الحقل ولا يُنطَق
 *      اسمه معه.
 *
 *   ٥. **طبقة الخريطة ملء الشاشة** بلا `role="dialog"`، فما خلفها يبقى في
 *      شجرة القراءة رغم أنه محجوب بصرياً.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public_html/client-order.html'), 'utf8');

describe('الأزرار الأيقونية لها أسماء', () => {
    it('زرّ الرجوع من قائمة المحلات', () => {
        expect(html).toContain('onclick="showCategories()" aria-label="رجوع إلى التصنيفات"');
    });

    it('إغلاق نافذة تفاصيل المحل', () => {
        expect(html).toContain('data-bs-dismiss="modal" aria-label="إغلاق تفاصيل المحل"');
    });

    it('إغلاق منتقي «اشترِ لي» — ورمز ✕ نفسه مخفيٌّ عن القارئ', () => {
        expect(html).toContain('aria-label="إغلاق منتقي المحل"');
        expect(html).toContain('<span aria-hidden="true">&#x2715;</span>');
    });
});

describe('حقول الإدخال مسمّاة', () => {
    it('البحث الرئيسي — لا يعتمد على placeholder وحده', () => {
        const i = html.indexOf('id="globalSearchInput"');
        expect(html.slice(i, i + 200)).toContain('aria-label="ابحث عن منتج أو متجر أو قسم"');
    });

    it('البحث على الخريطة', () => {
        const i = html.indexOf('id="shopMapSearchInput"');
        expect(html.slice(i, i + 200)).toContain('aria-label="ابحث عن حي أو شارع"');
    });

    it('هاتف المستلم وسعر التوصيل مربوطان بتسميتيهما', () => {
        expect(html).toContain('<label for="shopOverlayPhone"');
        expect(html).toContain('<label for="shopOverlayPrice"');
    });
});

describe('ما يتبدّل يُعلَن', () => {
    it('قائمة المحلات منطقةٌ حيّة', () => {
        const i = html.indexOf('id="places-list"');
        const tag = html.slice(i, i + 160);
        expect(tag).toContain('aria-live="polite"');
        expect(tag).toContain('aria-label="قائمة المحلات"');
    });

    it('عدّاد المحلات يُعلَن عند تغيّره', () => {
        const i = html.indexOf('id="places-count-badge"');
        expect(html.slice(i, i + 160)).toContain('aria-live="polite"');
    });

    it('تحذير «خارج منطقة التوصيل» تنبيهٌ فوريّ لا نصٌّ صامت', () => {
        const i = html.indexOf('id="shop-geofence-banner"');
        expect(html.slice(i, i + 80)).toContain('role="alert"');
    });
});

describe('الحاويات المُركَّبة لها أدوارها', () => {
    it('طبقة الخريطة نافذةٌ حاجبة', () => {
        const i = html.indexOf('id="shop-map-overlay"');
        const tag = html.slice(i, i + 220);
        expect(tag).toContain('role="dialog"');
        expect(tag).toContain('aria-modal="true"');
        expect(tag).toContain('aria-label="تحديد موقع التوصيل"');
    });

    it('نافذة تفاصيل المحل تحمل اسم المحل عنواناً لها', () => {
        const i = html.indexOf('id="placeDetailsModal"');
        expect(html.slice(i, i + 200)).toContain('aria-labelledby="placeModalName"');
    });

    it('شريط التنقل مسمّى والصفحة الحالية معلَّمة', () => {
        expect(html).toContain('<nav class="mobile-nav-glass" aria-label="التنقل الرئيسي">');
        expect(html).toContain('class="nav-item-link active" aria-current="page"');
    });

    it('أيقونات شريط التنقل الأربع مخفيةٌ عن القارئ — النصّ تحتها يكفي', () => {
        const i = html.indexOf('<nav class="mobile-nav-glass"');
        const nav = html.slice(i, html.indexOf('</nav>', i));
        const icons = nav.match(/<i class="bi [^"]+"/g) || [];
        expect(icons.length).toBe(4);
        expect(nav.match(/aria-hidden="true"/g) || []).toHaveLength(4);
    });
});
