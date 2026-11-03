/**
 * 🎯 ترتيب نتائج البحث وحراستها جغرافياً — يتشاركه بحث المتاجر (routes/places)
 * وبحث «اشترِ لي» (utils/errandSearch) فلا يفترق ترتيبهما.
 *
 * لماذا: كان البحث يرتّب بالمسافة وحدها، فكلمة «بيتزا» تُظهر محلاً في وصف
 * منتجه «بيتزا» قبل محلٍّ اسمه «بيتزا هت» لأنه أقرب بمئتي متر. والعميل يقرأ
 * أوّل سطرٍ ويحكم أن البحث «ما دقيق».
 */

const { cityFromCoords } = require('./geofence');

/** يوحّد رسم الحروف ويحذف التشكيل — نفس تكافؤات arabicFlexibleRegex */
function normalizeArabic(s) {
    return String(s || '')
        .replace(/[ً-ْٰـ]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/[ىئ]/g, 'ي')
        .replace(/ؤ/g, 'و')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * قوّة مطابقة الاسم للكلمة: 100 تطابق تام، 80 يبدأ بها، 60 تبدأ بها كلمةٌ
 * داخله، 40 تقع في وسطه، 0 لا مطابقة (طابق الوصف أو القسم فقط).
 */
function nameScore(name, term) {
    const n = normalizeArabic(name);
    const t = normalizeArabic(term);
    if (!n || !t) return 0;
    if (n === t) return 100;
    if (n.startsWith(t)) return 80;
    if (n.includes(' ' + t)) return 60;
    if (n.includes(t)) return 40;
    return 0;
}

/**
 * متجرٌ دبّوسه داخل مدينةٍ أخرى — مسجّلٌ بمدينةٍ خاطئة.
 * عرضه لعميل عطبرة يعني طلباً لن يقبله كابتن عطبرة. الدبوس هو الحقيقة لأنه
 * ما يذهب إليه الكابتن؛ وحقل المدينة كتبه إنسان. موقعٌ خارج كل المدن لا نحكم
 * عليه (قد تكون حدود المدينة أضيق من منطقة خدمتها).
 */
function pinInOtherCity(location, city) {
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') return false;
    const at = cityFromCoords(location.lat, location.lng);
    return at !== null && at !== city;
}

/** ترتيب: الأقوى مطابقةً أولاً، ثم الأقرب، ثم الاسم الأقصر (أدقّ) */
function byRelevance(a, b) {
    if ((b._score || 0) !== (a._score || 0)) return (b._score || 0) - (a._score || 0);
    const da = a.distanceKm ?? 1e9, db = b.distanceKm ?? 1e9;
    if (da !== db) return da - db;
    return String(a.name || '').length - String(b.name || '').length;
}

module.exports = { normalizeArabic, nameScore, pinInOtherCity, byRelevance };
