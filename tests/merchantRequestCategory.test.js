/**
 * 🏷️ تصنيف المتجر في طلب انضمام التاجر — «في الإدارة ما بجيني شي».
 *
 * السبب: النموذج يرسل **معرّف** التصنيف (`c._id`)، واللوحة كانت تبني قائمتها
 * بالقيمة = **الاسم**، ثم:
 *
 *     if (options.some(o => o.value === req.category)) select.value = req.category;
 *     else select.value = '';
 *
 * والمعرّف لا يساوي اسماً أبداً ⇒ القائمة تفرغ في كل مرة، فيبدو كأن التاجر
 * لم يختر تصنيفاً. وما اقترحه التاجر ("أخرى - مخبوزات") كان يضيع كلياً: لا
 * يظهر في القائمة ولا في النافذة ولا في الجدول.
 *
 * والأسوأ في الخادم: عند غياب تصنيفٍ صالح كان يضع المتجر في **أول تصنيف
 * نشط** — فمخبزٌ يُحفظ تحت الصيدليات بلا أن يعلم أحد، ولا يجده العميل حيث
 * يبحث عنه.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const readPub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public_html', f), 'utf8');

const page = readPub('admin-merchant-requests.html');
const form = readPub('client-register-shop.html');
const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'merchantRequests.js'), 'utf8');

describe('اللوحة تقرأ ما يرسله النموذج فعلاً', () => {
    it('النموذج يرسل المعرّف — وهذا ما تُبنى عليه القائمة', () => {
        expect(form).toContain('<option value="${c._id || c.name}">');
        expect(page).toContain('<option value="${c._id}">');
    });

    it('مفسّرٌ واحد يفهم الصيغ الثلاث: معرّف، واقتراح، واسمٌ قديم', () => {
        expect(page).toContain('function readRequestCategory');
        expect(page).toContain('allCats.find(c => String(c._id) === v)');
        expect(page).toContain('/^أخرى\\s*-\\s*(.+)$/');
        expect(page).toContain('allCats.find(c => c.name === (suggested || v))');
    });

    it('ما اختاره التاجر يُختار في القائمة لا تُفرَّغ', () => {
        expect(page).toContain('catSelect.value = cat.id');
        expect(page).not.toContain('catSelect.value = req.category;');
    });
});

describe('اقتراح التاجر يصل الإدارة', () => {
    it('يُعرض نصّاً في النافذة مع تمييزه كاقتراح', () => {
        expect(page).toContain('التاجر اقترح تصنيفاً جديداً');
        expect(page).toContain('id="dCategoryOrigin"');
    });

    it('ويُعرض في الجدول — إخفاؤه داخل النافذة يعني ألّا يراه أحد', () => {
        expect(page).toContain('<th>التصنيف</th>');
        expect(page).toContain('cat-chip new');
        expect(page).toContain('const rc = readRequestCategory(req.category);');
    });

    it('وما اختاره من القائمة يُعرض كذلك — لا صمت', () => {
        expect(page).toContain('اختاره التاجر:');
        expect(page).toContain('لم يصل تصنيف مع الطلب');
    });

    it('زرٌّ ينشئ التصنيف المقترَح ويختاره في مكانه', () => {
        // البديل: يترك الطلب، يفتح صفحة المحلات، ينشئ، ثم يعود — فلا يفعل
        expect(page).toContain('function createSuggestedCategory');
        expect(page).toContain("method: 'POST'");
        expect(page).toContain('await loadCategories();');
    });

    it('ولا يُنشئ تصنيفاً مكرّراً إن كان الاسم موجوداً', () => {
        const i = page.indexOf('function createSuggestedCategory');
        expect(page.slice(i, i + 600)).toContain('allCats.find(c => c.name === clean)');
    });

    it('عدد الأعمدة في صفوف الحالات الفارغة يطابق الترويسة', () => {
        expect(page).not.toContain('colspan="6"');
        expect((page.match(/colspan="7"/g) || []).length).toBeGreaterThanOrEqual(3);
    });
});

describe('لا موافقة بلا تصنيف — لا في الواجهة ولا في الخادم', () => {
    it('النافذة تمنع الموافقة والقائمة فارغة', () => {
        expect(page).toContain('اختر التصنيف أولاً');
    });

    it('والقبول السريع يوجّه لفتح الطلب بدل تمرير اقتراحٍ لا يقابله تصنيف', () => {
        const i = page.indexOf('function quickApprove');
        const blk = page.slice(i, i + 1000);
        expect(blk).toContain('readRequestCategory');
        expect(blk).toContain('viewRequest(id)');
    });

    it('والخادم لا يخمّن: لا «أول تصنيف نشط» ولا اختلاق «أخرى»', () => {
        const i = route.indexOf("if (status === 'approved')");
        const blk = route.slice(i, i + 4000);
        expect(blk).not.toContain('PlaceCategory.findOne({ isActive: true })');
        expect(blk).not.toContain("new PlaceCategory({ name: 'أخرى'");
        expect(blk).toContain('لا يمكن الموافقة: تصنيف المتجر غير محدَّد أو غير موجود');
    });

    it('والفحوص قبل الحفظ — لا طلبٌ «مقبول» بلا متجر', () => {
        // كانت الحالة تُحفظ approved ثم يُردّ 400، فيختفي الطلب من «قيد
        // المراجعة» ولا متجر أُنشئ ولا أحد يعود إليه
        const i = route.indexOf("if (status === 'approved')");
        const blk = route.slice(i, i + 4000);
        expect(blk.indexOf('لا يمكن الموافقة: تصنيف المتجر'))
            .toBeLessThan(blk.indexOf("request.status = 'approved';"));
        expect(blk.indexOf('لا يمكن الموافقة: موقع المتجر'))
            .toBeLessThan(blk.indexOf("request.status = 'approved';"));
    });
});
