/**
 * 🔎 بحث الأماكن الخارجي (Google Places API New) — لخدمة "اشترِ لي".
 *
 * لماذا سيرفر لا متصفح: كل نداء بحث مدفوع. البروكسي يمنحنا كاشاً مشتركاً بين كل
 * العملاء (بحث «كشة» يُدفع ثمنه مرة واحدة لكل المدينة)، وسقفاً للاستهلاك، ويُبقي
 * مفتاح السيرفر مقيّداً بالـ IP بدل مفتاح المتصفح المكشوف.
 *
 * المفتاح: GOOGLE_PLACES_API_KEY إن وُجد، وإلا GOOGLE_MAPS_API_KEY.
 * ⚠️ مفتاح المتصفح المقيَّد بـ HTTP referrers يُرفض من السيرفر — يلزم مفتاح
 * منفصل مقيّد بالـ IP ومفعّل عليه "Places API (New)".
 */

const logger = require('./logger');

// مراكز المدن المدعومة — يتمركز حولها البحث حتى لا تأتي نتائج من خارج السودان
const CITY_CENTERS = {
    Khartoum:  { lat: 15.5007, lng: 32.5599, radius: 40000 },
    PortSudan: { lat: 19.6158, lng: 37.2164, radius: 30000 }
};

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

// ── كاش في الذاكرة: نفس البحث لا يُشترى مرتين خلال 12 ساعة ──
// المحلات لا تنتقل، فمدة طويلة آمنة. سقف للحجم حتى لا تتضخّم الذاكرة.
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map();   // key → { at, data }

function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > TTL_MS) { cache.delete(key); return null; }
    // LRU خفيف: إعادة الإدخال تجعله الأحدث
    cache.delete(key); cache.set(key, hit);
    return hit.data;
}

function cacheSet(key, data) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), data });
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
 * @returns {Promise<Array>} قائمة أماكن مطبَّعة
 */
async function searchText({ query, city, lat, lng }) {
    const q = normalizeQuery(query);
    if (q.length < 2) return [];

    const c = centerFor(city, lat, lng);
    // إحداثيات مقرَّبة في المفتاح: عميلان في نفس الحي يتشاركان نتيجة واحدة
    const key = `t:${q}:${c.lat.toFixed(2)},${c.lng.toFixed(2)}`;
    const cached = cacheGet(key);
    if (cached) return cached;

    const data = await callGoogle('searchText', {
        textQuery: q,
        languageCode: 'ar',
        regionCode: 'SD',
        maxResultCount: 15,
        locationBias: { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: c.radius } }
    });

    cacheSet(key, data);
    return data;
}

/**
 * بحث بالتصنيف حول العميل — مرتّب بالأقرب.
 * @returns {Promise<Array>} قائمة أماكن مطبَّعة
 */
async function searchByCategory({ categoryKey, city, lat, lng }) {
    const cat = CATEGORY_BY_KEY[categoryKey];
    if (!cat) return [];

    const c = centerFor(city, lat, lng);
    const key = `c:${categoryKey}:${c.lat.toFixed(2)},${c.lng.toFixed(2)}`;
    const cached = cacheGet(key);
    if (cached) return cached;

    const data = await callGoogle('searchNearby', {
        includedTypes: cat.types,
        languageCode: 'ar',
        regionCode: 'SD',
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        // نصف قطر أصغر للتصنيفات: «أقرب بقالة» لا «كل بقالات الخرطوم»
        locationRestriction: { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: Math.min(c.radius, 12000) } }
    });

    cacheSet(key, data);
    return data;
}

module.exports = { searchText, searchByCategory, diagnose, ERRAND_CATEGORIES, CITY_CENTERS };
