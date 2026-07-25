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
        const results = await callGoogle('searchText', {
            textQuery: 'بقالة',
            languageCode: 'ar',
            regionCode: 'SD',
            maxResultCount: 3,
            locationBias: { circle: { center: { latitude: CITY_CENTERS.Khartoum.lat, longitude: CITY_CENTERS.Khartoum.lng }, radius: 20000 } }
        });
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
    // موقع العميل الفعلي أدقّ من مركز المدينة عند توفّره
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng, radius: 15000 };
    }
    return CITY_CENTERS[city] || CITY_CENTERS.Khartoum;
}

/** يحوّل مكان جوجل إلى الشكل الذي تفهمه الواجهة */
function mapPlace(p) {
    return {
        externalId: p.id || '',
        name: (p.displayName && p.displayName.text) || '',
        address: p.formattedAddress || '',
        lat: p.location ? p.location.latitude : null,
        lng: p.location ? p.location.longitude : null,
        category: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || '',
        openNow: p.currentOpeningHours ? !!p.currentOpeningHours.openNow : null,
        source: 'google'
    };
}

const FIELD_MASK = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.primaryTypeDisplayName',
    'places.businessStatus',
    'places.currentOpeningHours.openNow'
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

    const c = centerFor(city, lat, lng);
    // إحداثيات مقرَّبة في المفتاح: عميلان في نفس الحي يتشاركان نتيجة واحدة.
    // المدينة جزء من المفتاح لأن الحصر صار مرتبطاً بها.
    const key = `t:${city}:${q}:${c.lat.toFixed(2)},${c.lng.toFixed(2)}`;
    let data = await cacheGet(key);
    const cached = !!data;

    if (!data) {
        data = await callGoogle('searchText', {
            textQuery: q,
            languageCode: 'ar',
            regionCode: 'SD',
            maxResultCount: 15,
            // الحصر يمنع تسرّب نتائج من خارج المدينة، والترجيح يقرّب الأنسب داخلها
            locationRestriction: { rectangle: cityRectangle(city) },
            locationBias: { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: c.radius } }
        });
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
        data = await callGoogle('searchNearby', {
            includedTypes: cat.types,
            languageCode: 'ar',
            regionCode: 'SD',
            maxResultCount: 20,
            rankPreference: 'DISTANCE',
            // نصف قطر أصغر للتصنيفات: «أقرب بقالة» لا «كل بقالات الخرطوم»
            locationRestriction: { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: Math.min(c.radius, 12000) } }
        });
        await cacheSet(key, data);
    }

    return { results: clampToCity(data, city, zone), cached };
}

module.exports = { searchText, searchByCategory, diagnose, clampToCity, normalizeQuery, ERRAND_CATEGORIES, CITY_CENTERS };
