/**
 * 🔎 بحث الأماكن الخارجي (Google Places API New) — لخدمة "اشترِ لي".
 *
 * لماذا سيرفر لا متصفح: كل نداء بحث مدفوع. البروكسي يمنحنا كاشاً مشتركاً بين كل
 * العملاء (بحث «كشة» يُدفع ثمنه مرة واحدة لكل المدينة)، وسقفاً للاستهلاك، ويُبقي
 * مفتاح السيرفر مقيّداً بالـ IP بدل مفتاح المتصفح المكشوف.
 *
 * المفتاح: GOOGLE_PLACES_API_KEY وحده.
 * ⚠️ مفتاح المتصفح المقيَّد بـ HTTP referrers يُرفض من السيرفر — يلزم مفتاح
 * منفصل مقيّد بالـ IP ومفعّل عليه "Places API (New)".
 */

const logger = require('./logger');
const { CITY_BOUNDS, isInsidePolygon } = require('./geofence');

// مراكز المدن المدعومة — يتمركز حولها البحث
const CITY_CENTERS = {
    Khartoum:  { lat: 15.5007, lng: 32.5599, radius: 40000 },
    PortSudan: { lat: 19.6158, lng: 37.2164, radius: 30000 }
};

// ⚠️ locationBias ترجيحٌ لا حصر: بحث "الحرمين" كان يُرجع المسجد النبوي والحرام من
// السعودية لأن جوجل يتوسّع خارج النطاق حين تقلّ النتائج القريبة. الحصر الحقيقي
// يحتاج locationRestriction، وهي في Text Search مستطيل فقط (لا دائرة).
function cityRectangle(city) {
    const b = CITY_BOUNDS[city] || CITY_BOUNDS.Khartoum;
    return {
        low:  { latitude: b.minLat, longitude: b.minLng },
        high: { latitude: b.maxLat, longitude: b.maxLng }
    };
}

/**
 * جسم طلب البحث النصّي.
 *
 * ⚠️ locationBias و locationRestriction متنافيان في Places API — إرسالهما معاً
 * يُرجع INVALID_ARGUMENT، فيفشل كل بحث نصّي بينما يبدو المفتاح والإعداد سليمين
 * (التشخيص يمرّ لأنه يرسل واحداً فقط). حدث هذا فعلاً: أُضيف الحصر ونُسي حذف
 * الترجيح. نرسل الحصر وحده — وهو المطلوب: نتائج داخل المدينة لا مجرّد قريبة منها.
 *
 * مفصولة عن النداء لتُختبر: هذا الخطأ لا يظهر إلا بنداء حقيقي مدفوع.
 */
function textSearchBody(query, city) {
    return {
        textQuery: query,
        languageCode: 'ar',
        regionCode: 'SD',
        maxResultCount: 15,
        locationRestriction: { rectangle: cityRectangle(city) }
    };
}

/**
 * جسم طلب البحث بالتصنيف — الأقرب أولاً حول مركز البحث.
 * searchNearby لا تقبل locationBias أصلاً، فالحصر هنا هو الوسيلة الوحيدة.
 */
function nearbySearchBody(cat, center) {
    return {
        includedTypes: cat.types,
        languageCode: 'ar',
        regionCode: 'SD',
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        // نصف قطر أصغر للتصنيفات: «أقرب بقالة» لا «كل بقالات الخرطوم»
        locationRestriction: {
            circle: {
                center: { latitude: center.lat, longitude: center.lng },
                radius: Math.min(center.radius, 12000)
            }
        }
    };
}

/**
 * حصر النتائج داخل منطقة التوصيل الفعلية للمدينة.
 * يُطبَّق بعد الكاش لا قبله: تعديل المنطقة من لوحة الأدمن يسري فوراً بلا انتظار
 * انتهاء صلاحية الكاش، ولأن النتائج الخام صالحة لأي منطقة.
 * @param {Array} places نتائج مطبَّعة
 * @param {string} city
 * @param {Array<{lat:number,lng:number}>} [zone] مضلّع التوصيل من إعدادات المدينة
 */
function clampToCity(places, city, zone) {
    const b = CITY_BOUNDS[city] || CITY_BOUNDS.Khartoum;
    const hasZone = Array.isArray(zone) && zone.length >= 3;

    return places.filter(p => {
        // صندوق المدينة أولاً: حارس صلب ضد نتائج خارج البلد مهما كانت المنطقة
        if (p.lat < b.minLat || p.lat > b.maxLat || p.lng < b.minLng || p.lng > b.maxLng) return false;
        // ثم منطقة التوصيل المرسومة إن وُجدت — لا فائدة من محلٍّ لا نوصّل منه
        return hasZone ? isInsidePolygon(p.lat, p.lng, zone) : true;
    });
}

// 🏷️ التصنيفات المعروضة للعميل ← أنواع أماكن جوجل.
// قائمة ثابتة مقصودة: أنواع جوجل محدودة ومعرّفة مسبقاً، وربطها من لوحة الأدمن
// يعني حقلاً إضافياً يملؤه الأدمن يدوياً بلا فائدة تُذكر.
const ERRAND_CATEGORIES = [
    { key: 'grocery',   label: 'بقالات',     icon: 'bi-basket-fill',      types: ['grocery_store', 'supermarket', 'convenience_store'] },
    { key: 'restaurant',label: 'مطاعم',      icon: 'bi-egg-fried',        types: ['restaurant', 'meal_takeaway'] },
    { key: 'cafe',      label: 'كافيهات',    icon: 'bi-cup-hot-fill',     types: ['cafe', 'coffee_shop'] },
    { key: 'pharmacy',  label: 'صيدليات',    icon: 'bi-capsule',          types: ['pharmacy', 'drugstore'] },
    { key: 'bakery',    label: 'مخابز',      icon: 'bi-cake2-fill',       types: ['bakery'] },
    { key: 'store',     label: 'متاجر',      icon: 'bi-shop',             types: ['store', 'department_store'] },
    { key: 'butcher',   label: 'لحوم وخضار', icon: 'bi-cart4',            types: ['butcher_shop', 'market'] },
    { key: 'electronics',label: 'إلكترونيات',icon: 'bi-phone-fill',       types: ['electronics_store', 'cell_phone_store'] },
    { key: 'hardware',  label: 'مواد بناء',  icon: 'bi-tools',            types: ['hardware_store', 'home_improvement_store'] },
    { key: 'gas',       label: 'محطات وقود', icon: 'bi-fuel-pump-fill',   types: ['gas_station'] }
];

const CATEGORY_BY_KEY = Object.fromEntries(ERRAND_CATEGORIES.map(c => [c.key, c]));

// ⚠️ لا رجوع لـ GOOGLE_MAPS_API_KEY: مفتاح المتصفح مقيَّد بـ HTTP referrers فيرفضه
// جوجل من السيرفر دائماً. الرجوع إليه كان يحوّل حالة «لا مفتاح» الواضحة إلى خطأ
// 403 غامض، فيبدو الإعداد صحيحاً والبحث فاشلاً بلا سبب ظاهر.
function apiKey() {
    return process.env.GOOGLE_PLACES_API_KEY || '';
}

/**
 * 🩺 تشخيص: أيّ مفتاح يُستعمل فعلاً، وماذا يقول جوجل بالضبط.
 * سببه: رسالة العميل عامة عمداً، ورسالة جوجل الحقيقية تبقى في سجلّ السيرفر وحده —
 * فيصير تشخيص الإعداد مستحيلاً بلا SSH. هذا يُخرجها للأدمن بلا كشف المفتاح.
 */
async function diagnose() {
    const used = process.env.GOOGLE_PLACES_API_KEY || '';

    const info = {
        keyFound: !!used,
        keyLength: used.length,
        keyTail: used ? '…' + used.slice(-6) : '',
        // الأشيع: أُضيف المفتاح للـ .env بلا إعادة تشغيل، فتبقى العملية على البيئة القديمة
        mapsKeyFound: !!process.env.GOOGLE_MAPS_API_KEY,
        // أسماء كل متغيّرات البيئة المشابهة — يكشف خطأ الكتابة في الاسم فوراً
        similarEnvNames: Object.keys(process.env).filter(k => /GOOGLE|PLACES|MAPS/i.test(k))
    };

    if (!used) return { ...info, ok: false, googleError: 'PLACES_KEY_MISSING' };

    try {
        // ⚠️ نفس جسم الطلب الحقيقي بالضبط. كان التشخيص يبني جسماً مبسّطاً خاصاً به،
        // فمرّ بنجاح بينما كان كل بحث حقيقي يفشل — أعطى طمأنينة كاذبة وأضاع وقتاً
        // في مطاردة المفتاح والـ IP. تشخيصٌ لا يختبر المسار الحقيقي لا قيمة له.
        const results = await callGoogle('searchText', textSearchBody('بقالة', 'Khartoum'));
        return { ...info, ok: true, resultCount: results.length, sample: results.slice(0, 2).map(r => r.name) };
    } catch (e) {
        return { ...info, ok: false, googleError: e.message };
    }
}

// ── كاش على طبقتين: نفس البحث لا يُشترى مرتين خلال 12 ساعة ──
// المحلات لا تنتقل، فمدة طويلة آمنة.
// L1 في الذاكرة: يوفّر رحلة للقاعدة في الطلبات المتتالية.
// L2 في مونجو: يعيش عبر إعادة التشغيل والنشر، ومشترك بين نسخ التطبيق — بدونه كان
// كل نشر يعني إعادة شراء كل النتائج من جوجل من الصفر.
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const memCache = new Map();   // key → { at, data }

function memGet(key) {
    const hit = memCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > TTL_MS) { memCache.delete(key); return null; }
    // LRU خفيف: إعادة الإدخال تجعله الأحدث
    memCache.delete(key); memCache.set(key, hit);
    return hit.data;
}

function memSet(key, data) {
    if (memCache.size >= MAX_ENTRIES) memCache.delete(memCache.keys().next().value);
    memCache.set(key, { at: Date.now(), data });
}

async function cacheGet(key) {
    const local = memGet(key);
    if (local) return local;
    try {
        const PlaceSearchCache = require('../models/PlaceSearchCache');
        const doc = await PlaceSearchCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
        if (!doc) return null;
        memSet(key, doc.results);
        return doc.results;
    } catch (e) {
        // فشل القاعدة لا يمنع البحث — أسوأ ما يحدث نداء إضافي لجوجل
        logger.warn({ err: e.message }, 'place search cache read failed');
        return null;
    }
}

async function cacheSet(key, data) {
    memSet(key, data);
    try {
        const PlaceSearchCache = require('../models/PlaceSearchCache');
        await PlaceSearchCache.updateOne(
            { key },
            { $set: { results: data, expiresAt: new Date(Date.now() + TTL_MS) } },
            { upsert: true }
        );
    } catch (e) {
        logger.warn({ err: e.message }, 'place search cache write failed');
    }
}

/** تطبيع نص البحث لمفتاح الكاش: المسافات والحالة والتشكيل لا تصنع بحثاً جديداً */
function normalizeQuery(q) {
    return String(q || '')
        .replace(/[ً-ْٰـ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function centerFor(city, lat, lng) {
    const fallback = CITY_CENTERS[city] || CITY_CENTERS.Khartoum;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fallback;

    // ⚠️ موقع GPS خارج المدينة المختارة يُهمَل، ولا يُتّبع.
    // يحدث فعلاً: عميل مدينته "الخرطوم" وGPS يقول بورتسودان (سفر، أو مدينة لم
    // يحدّثها في حسابه). اتّباعه كان يعني البحث حول بورتسودان ثم حجب كل نتيجة
    // بصندوق الخرطوم في clampToCity ⇒ نتائج فارغة دائماً بلا سبب ظاهر للعميل.
    const b = CITY_BOUNDS[city] || CITY_BOUNDS.Khartoum;
    const inside = lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
    if (!inside) return fallback;

    // داخل المدينة: موقعه الفعلي أدقّ من مركزها
    return { lat, lng, radius: 15000 };
}

// نوع جوجل الآلي ← تصنيفنا. يُبنى من نفس جدول التصنيفات فلا يفترقان أبداً.
const TYPE_TO_CATEGORY = {};
for (const c of ERRAND_CATEGORIES) for (const t of c.types) TYPE_TO_CATEGORY[t] = c.key;

/**
 * تصنيفنا لمكان من جوجل: من نوعه الأساسي، وإلا فأول نوع نعرفه من قائمة أنواعه.
 * لماذا يهمّ: بلا تصنيف تظهر كل النتائج ككتلة واحدة لا يميّز فيها العميل المطعم
 * من البقالة، والأسماء المتشابهة كثيرة — فيختار الخطأ ويمشي الكابتن لمكان آخر.
 */
function categoryKeyOf(p) {
    if (p.primaryType && TYPE_TO_CATEGORY[p.primaryType]) return TYPE_TO_CATEGORY[p.primaryType];
    for (const t of (p.types || [])) if (TYPE_TO_CATEGORY[t]) return TYPE_TO_CATEGORY[t];
    return '';
}

/** يحوّل مكان جوجل إلى الشكل الذي تفهمه الواجهة */
function mapPlace(p) {
    return {
        externalId: p.id || '',
        name: (p.displayName && p.displayName.text) || '',
        address: p.formattedAddress || '',
        lat: p.location ? p.location.latitude : null,
        lng: p.location ? p.location.longitude : null,
        // النص للعرض، والمفتاح للفرز والأيقونة
        category: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || '',
        categoryKey: categoryKeyOf(p),
        source: 'google'
    };
}

const FIELD_MASK = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.primaryTypeDisplayName',   // نص للعرض («مطعم»)
    'places.primaryType',              // نوع آلي — عليه يقوم الفرز والأيقونة
    'places.types',                    // احتياط حين يغيب النوع الأساسي
    'places.businessStatus'
    // ⚠️ لا currentOpeningHours: النتائج تُخزَّن 12 ساعة، فشارة "مفتوح الآن" المخزَّنة
    // تكذب أكثر مما تصدق. وهي فوق ذلك تنقل كل بحث إلى فئة تسعير أعلى عند جوجل.
    // بديلها الصادق: المسافة والعنوان والتصنيف — وكلها في فئة أرخص.
].join(',');

async function callGoogle(endpoint, body) {
    const key = apiKey();
    if (!key) throw new Error('PLACES_KEY_MISSING');

    const res = await fetch(`https://places.googleapis.com/v1/places:${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': FIELD_MASK
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000)
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = (json.error && json.error.message) || `HTTP ${res.status}`;
        logger.error({ endpoint, status: res.status, msg }, 'places search failed');
        throw new Error(msg);
    }

    return (json.places || [])
        // الأماكن المغلقة نهائياً ضوضاء تُربك العميل والكابتن
        .filter(p => p.businessStatus !== 'CLOSED_PERMANENTLY')
        .map(mapPlace)
        .filter(p => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/**
 * بحث نصّي حر عن محل بالاسم (زي خرايط جوجل).
 * @returns {Promise<{results: Array, cached: boolean}>}
 *          cached=true يعني أن هذا البحث لم يكلّف نداءً مدفوعاً — تقرأه العدّادات.
 */
async function searchText({ query, city, lat, lng, zone }) {
    const q = normalizeQuery(query);
    if (q.length < 2) return { results: [], cached: true };

    // الطلب صار يعتمد على المدينة وحدها (الحصر بمستطيلها، بلا ترجيح بموقع العميل)،
    // فالمفتاح كذلك: كل عملاء المدينة يتشاركون نتيجة واحدة بدل نتيجة لكل حي —
    // إصابات كاش أكثر ونداءات مدفوعة أقل.
    const key = `t:${city}:${q}`;
    let data = await cacheGet(key);
    const cached = !!data;

    if (!data) {
        data = await callGoogle('searchText', textSearchBody(q, city));
        await cacheSet(key, data);
    }

    return { results: clampToCity(data, city, zone), cached };
}

/**
 * بحث بالتصنيف حول العميل — مرتّب بالأقرب.
 * @returns {Promise<{results: Array, cached: boolean}>}
 */
async function searchByCategory({ categoryKey, city, lat, lng, zone }) {
    const cat = CATEGORY_BY_KEY[categoryKey];
    if (!cat) return { results: [], cached: true };

    const c = centerFor(city, lat, lng);
    const key = `c:${city}:${categoryKey}:${c.lat.toFixed(2)},${c.lng.toFixed(2)}`;
    let data = await cacheGet(key);
    const cached = !!data;

    if (!data) {
        data = await callGoogle('searchNearby', nearbySearchBody(cat, c));
        await cacheSet(key, data);
    }

    return { results: clampToCity(data, city, zone), cached };
}

module.exports = { searchText, searchByCategory, diagnose, clampToCity, centerFor, normalizeQuery, textSearchBody, nearbySearchBody, ERRAND_CATEGORIES, CITY_CENTERS };
