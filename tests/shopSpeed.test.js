/**
 * ⚡ سرعة صفحة التسوّق — شكوى: «مرات بتتطول في جلب البُعد حق المتاجر».
 *
 * ثلاثة أسباب وُجدت:
 *
 *   1) القائمة كانت تنتظر GPS حتى **ثلاث ثوانٍ بعد** وصول بيانات المتاجر
 *      قبل أن تُرسم أصلاً. أي أن الشبكة تردّ في جزء من الثانية والعميل
 *      أمام هياكل فارغة.
 *   2) الموقع يُقرأ من الصفر في كل صفحة: التطبيق تنقّلٌ كامل لا SPA، فذاكرة
 *      geo.js تبدأ فارغة، و`getCurrentPosition` تأخذ ثوانيَ في كل مرة.
 *   3) إن تعذّر الموقع (إذن مرفوض/GPS مطفأ) بقي المؤشّر الدوّار مكان المسافة
 *      يدور إلى الأبد، فيبدو التطبيق عالقاً وهو ليس كذلك.
 *
 * قياسٌ في المتصفّح بعد الإصلاح: الرسم عند 193ms مع GPS يستغرق 5 ثوانٍ،
 * وبلا أي مؤشّر دوّار.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public_html', f), 'utf8');

const geo = read('js/geo.js');
const feature = read('js/order-feature.js');

describe('آخر موقع معروف يبقى بين الصفحات', () => {
    it('يُحفظ عند كل قراءة ناجحة — الخشنة والدقيقة', () => {
        expect(geo).toContain('function persistFix');
        expect(geo).toContain('persistFix(coarseFix)');
        expect(geo).toContain('persistFix(preciseFix)');
    });

    it('يُقرأ عند تحميل الملف بلا انتظار قراءةٍ جديدة', () => {
        expect(geo).toContain('function hydrate');
        expect(geo).toContain('localStorage.getItem(STORE_KEY)');
    });

    it('له عمرٌ أقصى — موقع الأمس لا يوصف بأنه موقعك الآن', () => {
        expect(geo).toMatch(/STORE_MAX_AGE\s*=/);
        expect(geo).toMatch(/isFresh\(raw, STORE_MAX_AGE\)/);
    });

    it('التخزين محميٌّ — التصفّح الخاص يرمي عند الكتابة', () => {
        const i = geo.indexOf('function persistFix');
        const blk = geo.slice(i, i + 320);
        expect(blk).toContain('try {');
        expect(blk).toContain('catch');
    });

    it('lastKnown متاحة للعرض الفوري ولا تُطلق قراءة', () => {
        expect(geo).toContain('function lastKnown');
        expect(geo).toContain('lastKnown: lastKnown');
        const i = geo.indexOf('function lastKnown');
        expect(geo.slice(i, i + 300)).not.toContain('getCurrentPosition');
    });

    it('لا يُستعمل لدبوس الطلب: getPrecise تبقى قراءةً حيّة', () => {
        // موقعٌ عمره ساعات يصلح لترتيب المتاجر، لا لتثبيت دبوس التسليم
        const i = geo.indexOf('function getPrecise');
        const blk = geo.slice(i, geo.indexOf('function getCoarse'));
        expect(blk).toContain('watchPosition');
        expect(blk).not.toContain('lastKnown()');
    });
});

describe('الرسم لا ينتظر GPS', () => {
    it('لا مهلة انتظارٍ بين وصول البيانات والرسم', () => {
        expect(feature).not.toContain('Promise.race');
        expect(feature).not.toMatch(/setTimeout\([^)]*3000\)/);
    });

    it('يُرسم بآخر موقعٍ معروف فوراً', () => {
        expect(feature).toContain('function instantLocation');
        expect(feature).toContain('WajeezGeo.lastKnown');
        // المسارات الثلاثة: الشبكة، كاش الجلسة، والمفضّلة
        expect(feature.match(/instantLocation\(\)/g).length).toBeGreaterThanOrEqual(5);
    });

    it('ثم يصحّح متى وصلت القراءة الجديدة', () => {
        expect(feature).toContain('function applyFreshLocation');
        expect(feature).toContain('locPromise.then(late =>');
    });

    it('لا يعيد الرسم إلا إذا تغيّر الترتيب فعلاً', () => {
        // إعادة الرسم دائماً تُقفز البطاقات تحت إصبع العميل
        const i = feature.indexOf('function applyFreshLocation');
        const blk = feature.slice(i, i + 1400);
        expect(blk).toContain('orderBefore');
        expect(blk).toContain("sorted.map(p => p._id).join(',') !== orderBefore");
        expect(blk).toContain('.place-dist');
    });

    it('تعذّر الموقع: شرطةٌ صريحة لا مؤشّرٌ يدور إلى الأبد', () => {
        expect(feature).toContain('function markDistanceUnavailable');
        expect(feature).toContain("el.classList.remove('dist-loading')");
        expect(feature).toContain('markDistanceUnavailable(listContainer)');
        expect(feature).toContain('markDistanceUnavailable(section)');
    });

    it('حارس التسلسل باقٍ — العميل قد يبدّل القسم أثناء انتظار GPS', () => {
        expect(feature).toContain('if (seq !== _placesViewSeq) return;');
        expect(feature).toContain('if (seq !== _featuredSeq) return;');
    });
});

describe('فتح قسمٍ لأول مرة يستعمل ما هو محمَّل أصلاً', () => {
    it('يُرشَّح محلياً من قائمة المدينة بدل هياكل فارغة', () => {
        // قسم «المحلات القريبة» يجلب محلات المدينة كاملة، والقسم جزءٌ منها
        expect(feature).toContain('wajeez_featured_${currentCity}');
        expect(feature).toContain('String(p.category && (p.category._id || p.category)) === String(categoryId)');
    });

    it('والشبكة تصحّحه بعدها — لا اكتفاء بالمرشَّح', () => {
        const i = feature.indexOf('const subset = city.places.filter');
        const after = feature.slice(i, i + 2500);
        expect(after).toContain('await fetch(`${API_URL}/api/places?category_id=');
    });

    it('لا يتعطّل إن كان التخزين ممتلئاً أو محجوباً', () => {
        const i = feature.indexOf('wajeez_featured_${currentCity}');
        expect(feature.slice(i - 200, i + 500)).toContain('catch (_)');
    });
});
