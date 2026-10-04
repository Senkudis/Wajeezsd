// utils/geofence.js
// Restricts service area to Sudan (and specific cities if needed)

// Sudan bounding box
const SUDAN_BOUNDS = {
    minLat: 3.5,
    maxLat: 22.2,
    minLng: 21.8,
    maxLng: 38.6
};

/**
 * Check if coordinates are inside Sudan
 * @param {number} lat
 * @param {number} lng
 * @returns {boolean}
 */
function isInsideSudan(lat, lng) {
    if (!lat || !lng) return false;
    return (
        lat >= SUDAN_BOUNDS.minLat && lat <= SUDAN_BOUNDS.maxLat &&
        lng >= SUDAN_BOUNDS.minLng && lng <= SUDAN_BOUNDS.maxLng
    );
}

/**
 * Validate that both pickup and dropoff are inside Sudan
 * @param {object} pickup - { lat, lng }
 * @param {object} dropoff - { lat, lng }
 * @returns {{ valid: boolean, message: string }}
 */
function validateOrderLocations(pickup, dropoff) {
    if (!pickup || !pickup.lat || !pickup.lng) {
        return { valid: false, message: 'يرجى تحديد موقع الاستلام على الخريطة' };
    }
    if (!dropoff || !dropoff.lat || !dropoff.lng) {
        return { valid: false, message: 'يرجى تحديد موقع التسليم على الخريطة' };
    }
    if (!isInsideSudan(pickup.lat, pickup.lng)) {
        return { valid: false, message: 'موقع الاستلام خارج نطاق الخدمة (السودان فقط)' };
    }
    if (!isInsideSudan(dropoff.lat, dropoff.lng)) {
        return { valid: false, message: 'موقع التسليم خارج نطاق الخدمة (السودان فقط)' };
    }
    return { valid: true };
}

// 🌍 صناديق حدود المدن المدعومة — تُستخدم لاستنتاج المدينة من الإحداثيات.
// من config/cities.js (مصدرٌ واحد). المدن متباعدة (أقربها الخرطوم وعطبرة
// ~٢٨٠ كم) فالصناديق الفضفاضة آمنة — واختبار tests/cities.test.js يمنع تداخلها.
const { CITY_BOUNDS } = require('../config/cities');

/**
 * استنتاج المدينة من الإحداثيات.
 * يضمن أن متجر التاجر يظهر في مدينته الصحيحة حتى لو كانت مدينة حسابه خاطئة.
 * @param {number} lat
 * @param {number} lng
 * @returns {string|null} مفتاح المدينة (config/cities)، أو null خارج كل المدن
 */
function cityFromCoords(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return null;
    for (const [city, b] of Object.entries(CITY_BOUNDS)) {
        if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) return city;
    }
    return null;
}

/**
 * 🧭 التحقق من مواقع محطات التوصيل متعدد النقاط.
 * كل محطة يجب أن تحمل إحداثيات داخل السودان، وأن تضم القائمة استلاماً وتسليماً على الأقل.
 * @param {Array<{type:string, lat:number, lng:number, address:string}>} stops
 * @returns {{ valid: boolean, message?: string }}
 */
function validateStopsLocations(stops) {
    if (!Array.isArray(stops) || stops.length < 2) {
        return { valid: false, message: 'رحلة النقاط المتعددة تحتاج نقطتين على الأقل' };
    }
    const hasPickup = stops.some(s => s && s.type === 'pickup');
    const hasDropoff = stops.some(s => s && s.type === 'dropoff');
    if (!hasPickup || !hasDropoff) {
        return { valid: false, message: 'يجب أن تحتوي الرحلة على نقطة استلام ونقطة تسليم على الأقل' };
    }

    // 🔒 كل الاستلامات قبل أي تسليم — لا يُسلَّم طرد قبل استلامه.
    // (نفس القيد الذي تفرضه إعادة الترتيب والمُحسِّن — يُفرض هنا عند الإنشاء أيضاً.)
    // غير 'pickup' يُعامَل تسليماً، مطابقةً لتعقيم الإنشاء.
    let seenDropoff = false;
    for (const s of stops) {
        const isPickup = s && s.type === 'pickup';
        if (!isPickup) seenDropoff = true;
        else if (seenDropoff) {
            return { valid: false, message: 'رتّب كل نقاط الاستلام قبل نقاط التسليم' };
        }
    }

    for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        if (!s || !s.address) {
            return { valid: false, message: `النقطة رقم ${i + 1} تحتاج عنواناً` };
        }
        if (!isInsideSudan(s.lat, s.lng)) {
            return { valid: false, message: `موقع النقطة رقم ${i + 1} خارج نطاق الخدمة (السودان فقط)` };
        }
    }
    return { valid: true };
}

/**
 * 📏 المسافة بين نقطتين بالكيلومترات (صيغة Haversine).
 * @param {{lat:number,lng:number}} a
 * @param {{lat:number,lng:number}} b
 * @returns {number|null} المسافة بالكم، أو null إذا نقصت إحداثيات
 */
function haversineKm(a, b) {
    if (!a || !b) return null;
    const lat1 = Number(a.lat), lng1 = Number(a.lng);
    const lat2 = Number(b.lat), lng2 = Number(b.lng);
    if ([lat1, lng1, lat2, lng2].some(v => !Number.isFinite(v))) return null;
    const R = 6371; // نصف قطر الأرض بالكم
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const s = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * 🔷 هل تقع النقطة داخل مضلّع؟ (ray casting)
 * يُستعمل لحصر النتائج داخل منطقة التوصيل المرسومة في إعدادات المدينة.
 * @param {number} lat
 * @param {number} lng
 * @param {Array<{lat:number,lng:number}>} polygon رؤوس المضلّع بالترتيب
 * @returns {boolean} false إذا كان المضلّع ناقصاً (أقل من 3 رؤوس)
 */
function isInsidePolygon(lat, lng, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng, yi = polygon[i].lat;
        const xj = polygon[j].lng, yj = polygon[j].lat;
        // يتقاطع الشعاع الأفقي المار بالنقطة مع هذه الضلع؟
        const intersects = ((yi > lat) !== (yj > lat)) &&
            (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (intersects) inside = !inside;
    }
    return inside;
}

const CROSS_CITY_MESSAGE =
    'التوصيل بين المدن غير متاح حالياً — الاستلام والتسليم لازم يكونوا في نفس المدينة';

/**
 * 🌍 مدينة الطلب من **مكانه** لا من حساب العميل.
 *
 * كانت تُختم من مدينة الحساب، والحساب يتبع آخر مدينةٍ اختارها العميل في
 * التطبيق. فعميلٌ حوّل لبورتسودان ليطلب لقريبه ونسي الرجوع، يطلب بعدها من
 * أم درمان فيُختم الطلب «بورتسودان» ويُبثّ لكباتنها — ولا يراه أحدٌ يستطيع
 * توصيله. المكان لا يُنسى: استلامٌ في أم درمان طلبٌ للخرطوم دائماً.
 *
 * والتوصيل بين المدينتين غير متاح حتى تُضاف خدمة الإرساليات: نقطتان في
 * مدينتين مختلفتين تُرفضان.
 *
 * @param {Array<{lat:number,lng:number}>} points كل نقاط الطلب (الاستلام أولاً)
 * @param {string} fallback مدينة الحساب — حين لا تقع أيّ نقطة داخل مدينةٍ معروفة
 * @returns {{ ok: true, city: string } | { ok: false, message: string, cities: string[] }}
 */
function resolveOrderCity(points, fallback) {
    const cities = [];
    for (const p of points || []) {
        if (!p) continue;
        const c = cityFromCoords(Number(p.lat), Number(p.lng));
        if (c && !cities.includes(c)) cities.push(c);
    }
    if (cities.length > 1) return { ok: false, message: CROSS_CITY_MESSAGE, cities };
    return { ok: true, city: cities[0] || fallback || 'Khartoum' };
}

module.exports = {
    isInsideSudan, validateOrderLocations, validateStopsLocations, cityFromCoords, haversineKm, isInsidePolygon,
    resolveOrderCity, CROSS_CITY_MESSAGE, CITY_BOUNDS
};
