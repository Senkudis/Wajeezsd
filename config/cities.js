/**
 * 🌍 المدن — مصدرٌ واحد لكل ما في الخادم.
 *
 * كانت القائمة ['Khartoum', 'PortSudan'] مكتوبةً في نحو ثلاثين موضعاً:
 * مخطّطات Mongoose، والتحقّق في المسارات، والمُجدوِل، والتحليلات، وتسميات
 * الرسائل… فإضافة مدينة تعني ثلاثين تعديلاً — ونسيان واحدٍ منها يعني مدينةً
 * تُرفض في مسارٍ وتُقبل في آخر، أو طلباً يُختم بمدينةٍ لا يُبثّ لكباتنها.
 *
 * الآن: مدينةٌ جديدة = سطرٌ هنا، وسطرٌ مطابق في public_html/js/config.js
 * (WajeezCities — نسخة الواجهة). اختبار tests/cities.test.js يفرض تطابقهما.
 *
 * المفتاح (key) يُحفظ في القاعدة ولا يتغيّر أبداً بعد الإطلاق.
 * الحدود (bounds) مستطيلٌ يحدّد «في أيّ مدينةٍ تقع هذه النقطة» — يختم الطلب
 * بمدينة مكانه (utils/geofence.resolveOrderCity). يجب ألّا تتداخل حدود مدينتين.
 * أمّا منطقة التوصيل الفعلية فمضلّعٌ ترسمه الإدارة لكل مدينة (admin-zone-builder).
 */

const CITIES = Object.freeze({
    Khartoum: Object.freeze({
        key: 'Khartoum',
        label: 'الخرطوم',                    // التسمية العامة
        appLabel: 'الخرطوم (أم درمان)',       // بطاقة الاختيار في التطبيق
        shortLabel: 'أم درمان',               // الشرائح والرسائل القصيرة
        adminLabel: 'الخرطوم - أم درمان',     // قوائم الإدارة
        desc: 'الخرطوم · أم درمان · بحري',
        bounds: Object.freeze({ minLat: 15.0, maxLat: 16.4, minLng: 32.0, maxLng: 33.2 }),
        center: Object.freeze({ lat: 15.6445, lng: 32.4777 }),
        // مركز بحث الأماكن (اشترِ لي) ونصف قطره بالأمتار
        search: Object.freeze({ lat: 15.5007, lng: 32.5599, radius: 40000 })
    }),
    PortSudan: Object.freeze({
        key: 'PortSudan',
        label: 'بورتسودان',
        appLabel: 'بورتسودان',
        shortLabel: 'بورتسودان',
        adminLabel: 'البحر الأحمر - بورتسودان',
        desc: 'ولاية البحر الأحمر',
        bounds: Object.freeze({ minLat: 19.2, maxLat: 20.1, minLng: 36.8, maxLng: 37.7 }),
        center: Object.freeze({ lat: 19.6151, lng: 37.2164 }),
        search: Object.freeze({ lat: 19.6158, lng: 37.2164, radius: 30000 })
    }),
    // عطبرة — والدامر معها (١٢ كم جنوبها، منطقة خدمةٍ واحدة):
    //   عطبرة 17.70°N 33.99°E — الدامر 17.59°N 33.96°E
    Atbara: Object.freeze({
        key: 'Atbara',
        label: 'عطبرة',
        appLabel: 'عطبرة',
        shortLabel: 'عطبرة',
        adminLabel: 'نهر النيل - عطبرة',
        desc: 'ولاية نهر النيل · عطبرة · الدامر',
        bounds: Object.freeze({ minLat: 17.45, maxLat: 17.9, minLng: 33.75, maxLng: 34.2 }),
        center: Object.freeze({ lat: 17.7022, lng: 33.9864 }),
        search: Object.freeze({ lat: 17.66, lng: 33.98, radius: 20000 })
    })
});

/** المفاتيح بترتيب العرض — enum المخطّطات وكل فحص «مدينة صالحة؟» */
const CITY_KEYS = Object.freeze(Object.keys(CITIES));

const DEFAULT_CITY = 'Khartoum';

function isValidCity(c) {
    return typeof c === 'string' && Object.prototype.hasOwnProperty.call(CITIES, c);
}

/** مدينةٌ صالحة أو الافتراضية — لمن يحتاج قيمةً دائماً */
function resolveCity(c, fallback = DEFAULT_CITY) {
    return isValidCity(c) ? c : fallback;
}

/** «الخرطوم» / «بورتسودان» / «عطبرة» — والمفتاح المجهول كما هو */
function cityLabel(c, kind = 'label') {
    return isValidCity(c) ? CITIES[c][kind] : (c || '');
}

/** { Khartoum: 'الخرطوم', … } */
const CITY_LABELS = Object.freeze(Object.fromEntries(CITY_KEYS.map(k => [k, CITIES[k].label])));

/** { Khartoum: { minLat… }, … } — utils/geofence */
const CITY_BOUNDS = Object.freeze(Object.fromEntries(CITY_KEYS.map(k => [k, CITIES[k].bounds])));

module.exports = { CITIES, CITY_KEYS, DEFAULT_CITY, CITY_LABELS, CITY_BOUNDS, isValidCity, resolveCity, cityLabel };
