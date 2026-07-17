/**
 * تقدير وقت الوصول المتوقّع (ETA) لطلبات التوصيل.
 *
 * نموذج بسيط وقابل للضبط: مسافة الطريق ≈ المسافة الهوائية × معامل التفاف الطرق،
 * ثم الزمن = المسافة / متوسط السرعة، مضافاً إليه زمن مناولة ثابت (استلام/تسليم).
 * لا يعتمد على خدمة خرائط خارجية (بلا تكلفة ولا مفتاح) — تقدير كافٍ للعرض.
 *
 * القيم مبنية على واقع مدن مثل الخرطوم (ازدحام متوسط، دراجات نارية غالباً).
 */

const DEFAULTS = {
    avgSpeedKmh: 22,      // متوسط سرعة فعلي داخل المدينة (يشمل التوقفات)
    roadFactor: 1.3,      // الطرق ليست خطاً مستقيماً — التفاف تقريبي
    handlingMinutes: 8,   // زمن الاستلام + التسليم الثابت
    minMinutes: 5,        // حدّ أدنى معقول
    perStopMinutes: 4     // زمن إضافي لكل محطة في التوصيل متعدد النقاط
};

/**
 * @param {number} distanceKm المسافة الهوائية بالكم
 * @param {object} [opts] تجاوز القيم الافتراضية (avgSpeedKmh, extraStops, ...)
 * @returns {number|null} الدقائق المقدّرة (مقرّبة)، أو null لمدخل غير صالح
 */
function estimateEtaMinutes(distanceKm, opts = {}) {
    // ملاحظة: Number(null) و Number('') = 0 في JS — نرفضهما صراحةً كمدخل مفقود
    if (distanceKm == null || distanceKm === '') return null;
    const km = Number(distanceKm);
    if (!Number.isFinite(km) || km < 0) return null;

    const cfg = { ...DEFAULTS, ...opts };
    const roadKm = km * cfg.roadFactor;
    const travelMinutes = (roadKm / cfg.avgSpeedKmh) * 60;
    const extraStops = Math.max(0, Number(opts.extraStops) || 0);
    const total = travelMinutes + cfg.handlingMinutes + (extraStops * cfg.perStopMinutes);

    return Math.max(cfg.minMinutes, Math.round(total));
}

/**
 * يبني وصفاً جاهزاً للعرض من الدقائق: قيمة + نطاق ودّي + نص عربي.
 * نعرض نطاقاً (±25%) لأن التقدير ليس دقيقاً — أصدق للمستخدم من رقم قاطع.
 * @param {number|null} minutes
 * @returns {{minutes:number, min:number, max:number, text:string}|null}
 */
function formatEta(minutes) {
    if (minutes == null || !Number.isFinite(minutes)) return null;
    const min = Math.max(1, Math.round(minutes * 0.85));
    const max = Math.round(minutes * 1.2);
    return {
        minutes,
        min,
        max,
        text: min === max ? `${min} دقيقة` : `${min}–${max} دقيقة`
    };
}

module.exports = { estimateEtaMinutes, formatEta, DEFAULTS };
