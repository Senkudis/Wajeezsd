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
// المدينتان متباعدتان جداً (~500كم) فالصناديق الفضفاضة آمنة تماماً.
const CITY_BOUNDS = {
    Khartoum:  { minLat: 15.0, maxLat: 16.4, minLng: 32.0, maxLng: 33.2 },
    PortSudan: { minLat: 19.2, maxLat: 20.1, minLng: 36.8, maxLng: 37.7 }
};

/**
 * استنتاج المدينة من الإحداثيات.
 * يضمن أن متجر التاجر يظهر في مدينته الصحيحة حتى لو كانت مدينة حسابه خاطئة.
 * @param {number} lat
 * @param {number} lng
 * @returns {'Khartoum'|'PortSudan'|null} null إذا كانت الإحداثيات خارج المدينتين
 */
function cityFromCoords(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return null;
    for (const [city, b] of Object.entries(CITY_BOUNDS)) {
        if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) return city;
    }
    return null;
}

module.exports = { isInsideSudan, validateOrderLocations, cityFromCoords, CITY_BOUNDS };
