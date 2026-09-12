/**
 * 🏪 شبكة المحلات في لوحة الإدارة — شكوى: «العرض قبيح وصعب».
 *
 * أسوأ ما فيه لم يكن الشكل: **الترويسة لا تطابق خلاياها**. الأعمدة كانت
 * (# | المنشأة | الفئة | الحالة | إدارة) بينما الصفّ يضع الاسم أولاً ثم
 * التصنيف ثم الهاتف — أي أن اسم المحل يقع تحت «#»، والتصنيف تحت «المنشأة»،
 * والهاتف تحت «الفئة». فقراءة الجدول كانت تخميناً.
 *
 * ثم: جدولٌ بخمسة أعمدة محشور في ثلثي الشاشة بجانب قائمة التصنيفات، وخمسة
 * أزرار بأحجام وألوان مختلفة تلتفّ على سطرين فيختلف موضع كل زرّ بين صفٍّ
 * وآخر — والضغط الخاطئ (حذف بدل تعديل) مسألة وقت.
 *
 * وDataTables كانت تجلب نصوصها العربية من CDN خارجي بشكل غير متزامن، فتظهر
 * اللوحة بالإنجليزية ريثما يصل الملف — وبالإنجليزية دائماً إن تعذّر.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public_html', f), 'utf8');

const page = read('admin-places.html');
const js = read('js/admin-places.js');

describe('الترويسة تطابق الخلايا', () => {
    const headers = [...page.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map(m => m[1].trim());

    it('الأعمدة الخمسة بأسمائها الصحيحة', () => {
        expect(headers.slice(0, 5)).toEqual(['المنشأة', 'التصنيف', 'الهاتف', 'الحالة', 'إدارة']);
        expect(headers).not.toContain('#');
        expect(headers).not.toContain('الفئة');
    });

    it('كل خليّة تحمل اسم عمودها — وهو ما يُقرأ على الهاتف', () => {
        for (const h of ['المنشأة', 'التصنيف', 'الهاتف', 'الحالة', 'إدارة']) {
            expect(js).toContain(`data-label="${h}"`);
        }
    });

    it('ترتيب الخلايا كترتيب الترويسة', () => {
        const order = [...js.matchAll(/data-label="([^"]+)"/g)].map(m => m[1]);
        expect(order.slice(0, 5)).toEqual(['المنشأة', 'التصنيف', 'الهاتف', 'الحالة', 'إدارة']);
    });
});

describe('الجدول يأخذ عرض الشاشة', () => {
    it('لم يعد محشوراً في ثلثين بجانب التصنيفات', () => {
        expect(page).not.toContain('<div class="col-lg-8">');
        expect(page).toContain('places-table-wrap');
    });

    it('والتصنيفات أسفله — قائمة قصيرة نادرة التعديل', () => {
        expect(page.indexOf('id="placesTable"')).toBeLessThan(page.indexOf('id="adminCategoriesList"'));
        expect(page).toContain('admin-cats-grid');
    });
});

describe('شريط التصفية يجيب أسئلة الإدارة', () => {
    it('بحثٌ ومرشّحات مدينة ونوع وحالة وترتيب', () => {
        for (const id of ['placeSearch', 'placeCityFilter', 'placeKindFilter',
                          'placeStatusFilter', 'placeSort']) {
            expect(page).toContain(`id="${id}"`);
        }
    });

    it('البحث يشمل الهاتف والتصنيف لا الاسم وحده', () => {
        const i = js.indexOf('function filterAdminPlaces');
        const blk = js.slice(i, i + 900);
        expect(blk).toContain('p.phone');
        expect(blk).toContain('p.category && p.category.name');
    });

    it('التصفية بالنوع تميّز بين المالك والخدمة والباقة', () => {
        expect(js).toContain("f.kind === 'merchant'");
        expect(js).toContain("f.kind === 'noowner'");
        expect(js).toContain("f.kind === 'errand'");
        expect(js).toContain("f.kind === 'pro'");
    });

    it('الباقة تخصّ متجر التاجر — لا تُعرض ولا يُصفّى بها محلٌّ بلا مالك', () => {
        expect(js).toContain("p.tier === 'pro' && p.ownerId");
        expect(js).toContain('(isPro && owned)');
    });

    it('ترتيب الحالة يضع المغلق أولاً — هو ما يحتاج تدخّلاً', () => {
        const i = js.indexOf('status:   (a, b)');
        expect(js.slice(i, i + 90)).toContain('(a.is_open ? 1 : 0) - (b.is_open ? 1 : 0)');
    });

    it('زرّ التفريغ يظهر عند وجود تصفية فقط', () => {
        expect(js).toContain("resetBtn.classList.toggle('d-none', !hasFilter)");
    });

    it('البحث مؤجَّل — إعادة رسمٍ كاملة على كل حرف تُثقل الكتابة', () => {
        const i = js.indexOf('function bindPlaceFilters');
        expect(js.slice(i, i + 700)).toContain('setTimeout');
    });

    it('العدّ يقول كم من كم', () => {
        expect(js).toContain('من ${_allAdminPlaces.length} محل');
    });
});

describe('الصفّ مقروء والأزرار ثابتة', () => {
    it('الهوية: صورة واسم وشارات المدينة والنوع', () => {
        expect(js).toContain('pl-identity');
        expect(js).toContain('pl-name');
        expect(js).toContain('pl-tags');
        expect(js).toContain('PLACE_CITY_AR');
    });

    it('أزرار بمقاسٍ واحد لا تلتفّ فيختلف موضعها بين صفٍّ وآخر', () => {
        expect(page).toMatch(/\.pl-actions \{[^}]*flex-wrap: nowrap/);
        expect(page).toMatch(/\.pl-btn \{[^}]*width: 34px; height: 34px/);
    });

    it('لكل زرّ عنوانٌ يشرحه — أيقونةٌ وحدها تخمين', () => {
        const i = js.indexOf('class="pl-actions"');
        const blk = js.slice(i, i + 1800);
        expect((blk.match(/title="/g) || []).length).toBeGreaterThanOrEqual(4);
    });

    it('اسم المحل مهرَّب — يكتبه الأدمن ويُحقن في innerHTML وفي onclick', () => {
        expect(js).toContain('function escAttr');
        expect(js).toContain('${escAttr(p.name)}');
        expect(js).toContain("safeName.replace(/'/g, '')");
    });

    it('الهاتف معزول — أرقام لاتينية داخل نصّ عربي تنعكس بلا عزل', () => {
        expect(page).toContain('unicode-bidi: isolate');
        expect(js).toContain('<span class="pl-phone" dir="ltr">');
    });

    it('حالة الفراغ تدلّ على الخطوة التالية', () => {
        expect(js).toContain('أضف أول محل من الأزرار أعلاه');
        expect(js).toContain('لا محلات تطابق هذه التصفية');
    });

    it('قصٌّ مبدئي مع زرّ عرض الكل — مئات الصفوف دفعةً تُبطئ الصفحة', () => {
        expect(js).toContain('PLACES_PAGE_SIZE');
        expect(js).toContain('showAllAdminPlaces');
    });
});

describe('على الهاتف بطاقات لا جدولٌ يُمرَّر جانبياً', () => {
    it('الترويسة تُخفى والخلايا تصير أسطراً', () => {
        expect(page).toContain('@media (max-width: 991.98px)');
        expect(page).toContain('.places-table thead { display: none; }');
        expect(page).toContain('content: attr(data-label)');
    });
});

describe('بلا اعتماد على شبكة خارجية', () => {
    it('DataTables لم تعد تُستعمل هنا — نصوصها العربية كانت من CDN', () => {
        expect(js).not.toContain('cdn.datatables.net');
        expect(js).not.toContain('DataTable(');
        expect(js).not.toContain('placesDataTable');
    });
});
