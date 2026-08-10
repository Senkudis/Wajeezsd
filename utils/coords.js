/**
 * 🧭 صلاحية الإحداثيات — مصدرٌ واحد للخادم والواجهات.
 *
 * سبب وجوده: الفحص كان مكتوباً يدوياً في كل موضع بصيغة مختلفة، وكلٌّ منها
 * يُخطئ بطريقته:
 *   • `lat != null`      يمرّر الصفر ولا يفحص lng إطلاقاً  ← يرسم دبوساً في المحيط
 *   • `lat && lng`       يرفض الصفر مصادفةً فيُخفي العطل بدل أن يكشفه
 *   • `Number.isFinite`  صحيح لكنه لا يستبعد (0, 0)
 *
 * والنتيجة الفعلية في الإنتاج: طلبٌ تسليمه في بورتسودان يُرسم في خليج غينيا
 * للأدمن، ويبدو سليماً للكابتن — فلا أحد يُبلّغ عن العطل وهو قائم.
 *
 * ⚠️ لماذا يُرفض (0, 0) تحديداً: إنها إحداثيات صالحة رياضياً لنقطة في المحيط
 * الأطلسي، ولا مدينة نخدمها تقترب منها. حين تظهر فهي دائماً «قيمة افتراضية
 * لم تُملأ» لا موقعاً قصده أحد.
 */

/**
 * @param {*} lat
 * @param {*} lng
 * @returns {boolean} هل يصلحان كموقع حقيقي؟
 */
function isUsableCoord(lat, lng) {
    // ⚠️ الرفض الصريح قبل Number(): `Number(null)` و`Number('')` و`Number([])`
    // كلها تساوي **صفراً** لا NaN. فقيمة مفقودة كانت تمرّ كخط طولٍ صفر — أي
    // تُوضع النقطة على خطّ غرينتش، وهو بالضبط نوع الخطأ الذي يعالجه هذا الملف.
    // (كشفه اختبار الحالة [15.5, null] فور كتابته.)
    if (lat === null || lat === undefined || lat === '' ||
        lng === null || lng === undefined || lng === '') return false;
    if (typeof lat === 'object' || typeof lng === 'object') return false;

    const a = Number(lat);
    const b = Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (a === 0 && b === 0) return false;              // «بلا موقع» لا موقعٌ في المحيط
    return Math.abs(a) <= 90 && Math.abs(b) <= 180;
}

/**
 * يُرجع نسخة من نقطة (pickup/dropoff/stop) بإحداثيات مطبَّعة:
 * أرقاماً حين تصلح، و null صراحةً حين لا تصلح.
 * لا يمسّ بقية الحقول (العنوان، الاسم، الهاتف).
 */
function normalizePoint(point) {
    if (!point || typeof point !== 'object') return point;
    const ok = isUsableCoord(point.lat, point.lng);
    return {
        ...point,
        lat: ok ? Number(point.lat) : null,
        lng: ok ? Number(point.lng) : null
    };
}

module.exports = { isUsableCoord, normalizePoint };
