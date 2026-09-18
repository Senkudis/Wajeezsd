/**
 * 💰 تسعير الرحلة — مصدرٌ واحد لكل من يحسب سعر مشوار.
 *
 * لماذا وُجد هذا الملف: الحساب كان مكتوباً **داخل مسار إنشاء الطلب نفسه**،
 * سطوراً متتابعة لا دالّة. وأيّ شاشة جديدة تحتاج السعر — تعديل مسار الرحلة
 * عند الأدمن مثلاً — كانت ستنسخه. ونسختان تعنيان أن يُغيَّر رسمُ النقطة
 * الإضافية في الإعدادات فيتبعه أحدهما ولا يتبعه الآخر، فيصير للمشوار الواحد
 * سعران بحسب من أنشأه.
 *
 * وليست فرضيةً: هذا المشروع وقع فيها من قبل — في إنشاء طلب التوصيل، حتى
 * جُمع في utils/shopDelivery.js للسبب نفسه.
 *
 * القاعدة: لا يحسب أحدٌ سعراً خارج هذا الملف.
 */

const { haversineKm } = require('./geofence');

/**
 * 📏 طول الرحلة بالكيلومتر.
 *
 * في الرحلة متعدّدة النقاط يُجمع كل قطاعٍ بين محطّتين متتاليتين — لا المسافة
 * بين الأولى والأخيرة، فالكابتن يمرّ بها كلّها.
 *
 * @param {{stops?: Array, pickup?: object, dropoff?: object}} trip
 * @returns {number} المسافة بالكيلومتر (0 إن تعذّر الحساب)
 */
function tripDistanceKm(trip) {
    const stops = Array.isArray(trip && trip.stops) ? trip.stops : null;

    if (stops && stops.length >= 2) {
        let total = 0;
        for (let i = 1; i < stops.length; i++) {
            const seg = haversineKm(stops[i - 1], stops[i]);
            if (typeof seg === 'number' && Number.isFinite(seg)) total += seg;
        }
        return total;
    }

    if (trip && trip.pickup && trip.dropoff) {
        const d = haversineKm(trip.pickup, trip.dropoff);
        return (typeof d === 'number' && Number.isFinite(d)) ? d : 0;
    }
    return 0;
}

/** عدد النقاط الإضافية التي تُحتسب رسماً — ما زاد عن نقطتين */
function extraStopCount(stops) {
    if (!Array.isArray(stops)) return 0;
    return Math.max(0, stops.length - 2);
}

/**
 * 💵 تسعيرة التطبيق وحدودها.
 *
 * التقريب إلى أعلى مئة مقصود ويُطبَّق على السعر والحدّين معاً: أسعارٌ مثل
 * 1737 ج.س لا تُقال في السوق، والتقريب في موضعٍ دون آخر يجعل حدّاً يرفض
 * سعراً يساويه.
 *
 * @param {object} settings إعدادات المدينة (Settings)
 * @param {object} trip     {stops} أو {pickup, dropoff}
 * @returns {{distanceKm, extraStops, calculatedPrice, minAllowedPrice, maxAllowedPrice, maxDiscountPercent, maxPriceSurgePercent}}
 */
function calculateTripPricing(settings, trip) {
    settings = settings || {};

    const base         = settings.baseFare  || 1000;
    const costPerKm    = settings.costPerKm || 200;
    const extraStopFee = settings.extraStopFee || 0;

    const distanceKm = tripDistanceKm(trip);
    const extraStops = extraStopCount(trip && trip.stops);

    const round100 = (n) => Math.ceil(n / 100) * 100;

    const calculatedPrice = round100(base + (distanceKm * costPerKm) + (extraStopFee * extraStops));

    const maxDiscountPercent = typeof settings.maxDiscountPercent === 'number' ? settings.maxDiscountPercent : 10;
    const maxPriceSurgePercent = typeof settings.maxPriceSurgePercent === 'number' ? settings.maxPriceSurgePercent : 100;

    // 🔒 أرضيّتان: الأجرة الأساسية زائد رسوم النقاط لا يُنزَل عنها مهما بلغ
    //    التخفيض النسبي — وإلا صار مشوارٌ بخمس نقاط أرخص من أجرة الركوب.
    const minPriceFloor   = base + (extraStopFee * extraStops);
    const relativeMinPrice = round100(calculatedPrice * (1 - (maxDiscountPercent / 100)));
    const minAllowedPrice = Math.max(minPriceFloor, relativeMinPrice);
    const maxAllowedPrice = round100(calculatedPrice * (1 + (maxPriceSurgePercent / 100)));

    return {
        distanceKm, extraStops, calculatedPrice,
        minAllowedPrice, maxAllowedPrice,
        maxDiscountPercent, maxPriceSurgePercent
    };
}

/**
 * 🧹 تعقيم قائمة المحطات القادمة من العميل أو الأدمن.
 *
 * @param {Array} rawStops
 * @param {boolean} [keepProgress] احفظ done/doneAt (تعديل رحلةٍ جارية) أم صفّرها (إنشاء)
 */
function sanitizeStops(rawStops, keepProgress) {
    if (!Array.isArray(rawStops)) return null;
    return rawStops.map(s => ({
        type: s.type === 'pickup' ? 'pickup' : 'dropoff',
        address: String(s.address || '').slice(0, 300),
        contactName: String(s.contactName || '').slice(0, 100),
        contactPhone: String(s.contactPhone || '').slice(0, 20),
        lat: Number(s.lat), lng: Number(s.lng),
        note: String(s.note || '').slice(0, 200),
        done: keepProgress ? !!s.done : false,
        doneAt: keepProgress ? (s.doneAt || null) : null
    }));
}

module.exports = { tripDistanceKm, extraStopCount, calculateTripPricing, sanitizeStops };
