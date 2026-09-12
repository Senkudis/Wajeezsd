/**
 * 🚫 لا صيدليات في التطبيق — ولا في أي مسارٍ خلفيّ.
 *
 * بيع الأدوية وتوصيلها مجالٌ منظَّم (Apple 5.1.1(ix))، ويشترط أن يقدّم
 * التطبيقَ الكيانُ المرخَّص لا مطوّرٌ فرد. وما دام النظام لم يُضبَط بعد،
 * القرار أن يخرج القسم كلّه.
 *
 * والحذف من لوحة الإدارة وحده لا يكفي، وهذا ما تحرسه هذه الاختبارات:
 *
 *   • شريحة «صيدليات» في منتقي «اشترِ لي» كانت تأتي من قائمةٍ في الخادم.
 *   • والبحث النصّي الحرّ يمرّ على جوجل — فمن يكتب «صيدلية» كان يجدها ولو
 *     أُزيلت الشريحة.
 *   • والأماكن المتعلَّمة من طلباتٍ سابقة محفوظةٌ عندنا، فتظهر من الطبقة
 *     المجانية ما مُنع من المدفوعة.
 *
 * ⚠️ وهذا ليس تجميلاً للمراجعة: ردّنا لآبل يقول إن التطبيق لا يعمل في مجال
 *    منظَّم. فأي صيدلية تظهر في أي مسار تجعل ذلك الردّ غير صحيح.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const { ERRAND_CATEGORIES, BLOCKED_TYPES } = require('../utils/placesSearch');

describe('لا تصنيف صيدليات معروضاً', () => {
    it('ليس في تصنيفات «اشترِ لي» التي يخدمها الخادم', () => {
        expect(ERRAND_CATEGORIES.map(c => c.key)).not.toContain('pharmacy');
        expect(ERRAND_CATEGORIES.map(c => c.label)).not.toContain('صيدليات');
    });

    it('ولا في البيانات التجريبية التي يزرعها الأدمن', () => {
        const places = read('routes/places.js');
        const i = places.indexOf("router.post('/seed-demo'");
        const blk = places.slice(i, i + 3000);
        expect(blk).not.toContain("name: 'صيدليات'");
        expect(blk).not.toContain('صيدلية النيل');
    });
});

describe('الحجب عند المصدر لا عند العرض', () => {
    it('أنواع جوجل الدوائية محجوبة', () => {
        expect([...BLOCKED_TYPES].sort()).toEqual(['drugstore', 'pharmacy']);
    });

    it('والحجب يقع على نتائج جوجل قبل تحويلها للواجهة', () => {
        const src = read('utils/placesSearch.js');
        expect(src).toContain('function isBlockedType');
        expect(src).toContain('.filter(p => !isBlockedType(p))');
        // يفحص النوع الأساسي وقائمة الأنواع معاً — مكانٌ قد يحمل النوع ثانوياً
        const i = src.indexOf('function isBlockedType');
        const blk = src.slice(i, i + 260);
        expect(blk).toContain('p.primaryType');
        expect(blk).toContain('(p.types || [])');
    });

    it('والأماكن المتعلَّمة قبل الحجب تُستثنى كذلك', () => {
        const src = read('utils/errandSearch.js');
        expect(src).toContain("categoryKey: { $ne: 'pharmacy' }");
    });
});

describe('لا ذكر للصيدليات في ما يراه المستخدم', () => {
    const files = [
        'public_html/js/smart-search.js',
        'public_html/js/tour-pages.js',
        'public_html/client-register-shop.html',
        'public_html/tutorial-app-order.html',
        'public_html/tutorial-shop-order.html',
        'public_html/all-features-promo.html',
        'public_html/_promo.html'
    ];

    it('لا نصّ «صيدلية/صيدليات» في أي سطرٍ معروض', () => {
        const offenders = [];
        for (const f of files) {
            read(f).split(/\r?\n/).forEach((line, n) => {
                const t = line.trim();
                // التعليقات تشرح سبب الحذف — ليست معروضة
                if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')) return;
                if (/صيدل/.test(line)) offenders.push(`${f}:${n + 1}`);
            });
        }
        expect(offenders).toEqual([]);
    });

    it('ولا أيقونة الكبسولة الدوائية', () => {
        for (const f of files) {
            expect(read(f)).not.toContain('💊');
        }
    });
});

/**
 * 🔒 إخفاء القسم من اللوحة يجب أن يُخفي ما تحته.
 *
 * «حذف» القسم في لوحة الإدارة ليس حذفاً: يضبط isActive:false ولا يمسّ
 * محلّاته. وقائمة «المحلات القريبة منك» تُجلب **بلا تصنيف** — فمحلّات قسمٍ
 * أُخفي عمداً كانت تبقى ظاهرة فيها، وفي البحث بالاسم، وعبر الرابط المباشر.
 *
 * أي أن حذف قسم «صيدليات» من اللوحة ما كان ليُخرج الصيدليات من التطبيق.
 */
describe('محلّات الأقسام المخفيّة لا تُعرض', () => {
    const places = read('routes/places.js');
    const merchant = read('routes/merchant.js');

    it('قائمة المحلات تُحصر في الأقسام الظاهرة', () => {
        const i = places.indexOf("router.get('/', async");
        const blk = places.slice(i, places.indexOf("router.get('/search'"));
        expect(blk).toContain('PlaceCategory.find({ isActive: true })');
        expect(blk).toContain('query.category = category_id');
    });

    it('ولوحة الإدارة تبقى ترى كل شيء (city=all)', () => {
        const i = places.indexOf("router.get('/', async");
        const blk = places.slice(i, places.indexOf("router.get('/search'"));
        expect(blk).toContain("if (city !== 'all') {");
    });

    it('والبحث بالاسم لا ينفذ من حول الإخفاء', () => {
        const i = places.indexOf("router.get('/search'");
        const blk = places.slice(i, i + 2500);
        expect(blk).toContain('category: { $in: activeCatIds }');
    });

    it('والرابط المباشر لصفحة المحل مغلق كذلك', () => {
        const i = places.indexOf("router.get('/:id', async");
        const blk = places.slice(i, i + 900);
        expect(blk).toContain("place.category.isActive === false");
    });

    it('ومنتجاته لا تُخدَم عبر مسارها العام', () => {
        const i = merchant.indexOf("router.get('/shop/:placeId/products'");
        const blk = merchant.slice(i, i + 1800);
        expect(blk).toContain("place.category.isActive === false");
    });
});
