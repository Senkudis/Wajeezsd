/**
 * ♿ الإتاحة في الصفحة الرئيسية — نموذج طلب التوصيل نفسه.
 *
 *   `index.html` هي الشاشة التي يُنشأ منها كل طلب توصيل، وفيها 12 سمةً في
 *   1832 سطراً. والعيب الأثقل فيها ليس أيقونةً صامتة بل النموذج كلّه:
 *
 *   ١. **ستّة حقولٍ بـ `placeholder` وحده.** عنوانا الاستلام والتسليم،
 *      واسما المرسل والمستلم، وهاتفاهما — كلّها بلا تسمية. والتسميتان
 *      المرئيتان («من وين؟» و«لوين؟») عنوانا قسمَين لا تسميتا حقل، فلا
 *      `for` عليهما. ومن يملأ هاتف المستلم لا يعرف أيّ هاتفٍ يملأ: الحقلان
 *      متطابقان نصّاً («رقم الهاتف») ويختلفان معنى. صارا مجموعتين
 *      مسمّاتين ولكل حقلٍ اسمه.
 *
 *   ٢. **ثلاث تسمياتٍ يتيمة في «اشترِ لي»** — اسم المحل والأصناف
 *      والميزانية: `<label>` مرئيّ غير مربوطٍ بحقله.
 *
 *   ٣. **العنوان تحت الدبوس يتبدّل مع كل تحريكٍ للخريطة** بلا `aria-live`،
 *      وهو النصّ الوحيد الذي يقول للمستخدم أين سيصل الكابتن. وبانر «الدبوس
 *      خارج منطقة التوصيل» يظهر بلا `role="alert"` رغم أنه يمنع التأكيد.
 *
 *   ٤. **أزرار الخريطة العائمة** بـ `title` وحده — تلميحٌ للفأرة لا اسمٌ
 *      موثوق، وزرّ البحث أيقونةٌ صرفة.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public_html/index.html'), 'utf8');

const near = (anchor, span = 300) => {
    const i = html.indexOf(anchor);
    expect(i, 'لم يُعثر على ' + anchor).toBeGreaterThan(-1);
    return html.slice(i, i + span);
};

describe('نموذج طلب التوصيل — كل حقلٍ له اسم', () => {
    it('قسما الاستلام والتسليم مجموعتان مسمّاتان', () => {
        expect(html).toContain('id="pickup-block" role="group" aria-labelledby="pickup-section-label"');
        expect(html).toContain('role="group" aria-labelledby="dropoff-section-label"');
        expect(html).toContain('id="dropoff-section-label">لوين؟ (موقع التسليم)</label>');
    });

    it('عنوانا الاستلام والتسليم', () => {
        expect(near('id="pickup-addr"')).toContain('aria-label="عنوان الاستلام — يُحدَّد من الخريطة"');
        expect(near('id="dropoff-addr"')).toContain('aria-label="عنوان التسليم — يُحدَّد من الخريطة"');
    });

    it('واسما المرسل والمستلم', () => {
        expect(near('id="pickup-name"')).toContain('aria-label="اسم المرسل أو المحل"');
        expect(near('id="dropoff-name"')).toContain('aria-label="اسم المستلم أو المحل"');
    });

    it('والهاتفان يتمايزان — كانا نصّاً واحداً ومعنيين', () => {
        expect(near('id="pickup-phone"')).toContain('aria-label="هاتف المرسل"');
        expect(near('id="dropoff-phone"')).toContain('aria-label="هاتف المستلم"');
    });

    it('ووصف الأغراض وحقل السعر', () => {
        expect(near('id="details"')).toContain('aria-label="وصف الأغراض (اختياري)"');
        expect(html).toContain('class="section-title text-success mb-2" for="price"');
    });
});

describe('«اشترِ لي» — التسميات اليتيمة رُبطت', () => {
    it('اسم المحل', () => {
        expect(html).toContain('for="errand-shop-input">اسم المحل</label>');
    });
    it('الأصناف', () => {
        expect(html).toContain('for="errand-items">ماذا تريد أن يشتري لك الكابتن؟</label>');
    });
    it('الميزانية', () => {
        expect(html).toContain('for="errand-budget">ميزانية تقديرية للبضاعة (اختياري)</label>');
    });
});

describe('الخريطة تقول ما تفعل', () => {
    it('العنوان تحت الدبوس يُعلَن مع كل تحريك', () => {
        expect(near('id="map-address-preview"', 120)).toContain('aria-live="polite"');
    });

    it('و«خارج منطقة التوصيل» تنبيهٌ فوريّ — يمنع التأكيد', () => {
        expect(near('id="geofence-warning-banner"', 80)).toContain('role="alert"');
        expect(near('id="shop-geofence-banner"', 80)).toContain('role="alert"');
    });

    it('حقلا البحث مسمّيان وزرّ البحث له اسم', () => {
        expect(near('id="map-search-input"', 200)).toContain('aria-label="ابحث عن مكان أو عنوان"');
        expect(near('id="shopMapSearchInput"', 200)).toContain('aria-label="ابحث عن حي أو شارع"');
        expect(near('id="map-search-btn"', 120)).toContain('aria-label="بحث"');
    });

    it('ونتائج البحث قائمةُ اختيار', () => {
        expect(near('id="map-search-results"', 140)).toContain('role="listbox"');
        expect(near('id="shopMapSearchResults"', 140)).toContain('role="listbox"');
    });

    it('والأزرار العائمة لها أسماء لا تلميحاتُ فأرةٍ وحدها', () => {
        for (const [id, label] of [
            ['id="locate-me-btn"', 'aria-label="تحديد موقعي"'],
            ['id="map-layer-btn"', 'aria-label="تبديل طبقة الخريطة'],
            ['id="map-theme-btn"', 'aria-label="تبديل ثيم الخريطة"'],
            ['id="map-city-btn"', 'aria-label="تغيير المدينة"'],
        ]) expect(near(id, 260)).toContain(label);
    });

    it('وطبقة خريطة المتجر نافذةٌ حاجبة', () => {
        const tag = near('id="shop-map-overlay"', 220);
        expect(tag).toContain('role="dialog"');
        expect(tag).toContain('aria-modal="true"');
    });
});

describe('ما بقي', () => {
    it('شريط التنقل مسمّى وصفحته معلَّمة وأيقوناته الأربع صامتة', () => {
        expect(html).toContain('<nav class="mobile-nav-glass" aria-label="التنقل الرئيسي">');
        expect(html).toContain('onclick="showHomeSection()" aria-current="page"');
        const i = html.indexOf('<nav class="mobile-nav-glass"');
        const nav = html.slice(i, html.indexOf('</nav>', i));
        expect(nav.match(/<i class="bi /g) || []).toHaveLength(4);
        expect(nav.match(/aria-hidden="true"/g) || []).toHaveLength(4);
    });

    it('نافذة تفاصيل المحل مسمّاة وزرّ إغلاقها كذلك', () => {
        expect(near('id="placeDetailsModal"', 200)).toContain('aria-labelledby="placeModalName"');
        expect(html).toContain('aria-label="إغلاق تفاصيل المحل"');
    });

    it('وصورة الطرد لها بديلٌ نصّي وزرُّ حذفها اسم', () => {
        expect(html).toContain('alt="معاينة صورة الطرد"');
        expect(html).toContain('aria-label="حذف صورة الطرد"');
        expect(html).toContain('<span aria-hidden="true">×</span>');
    });

    it('وتسميتا هاتف المستلم وسعر التوصيل في ورقة المتجر مربوطتان', () => {
        expect(html).toContain('<label for="shopOverlayPhone"');
        expect(html).toContain('<label for="shopOverlayPrice"');
    });
});
