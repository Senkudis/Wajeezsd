/**
 * إثراء كائن طلب ببيانات محسوبة للعرض: الخط الزمني و ETA.
 * مصدر واحد يُستخدم في GET /:id و /my-orders و مسارات الكابتن — فلا تكرار.
 *
 * آمن على أي شكل طلب: الحقول الناقصة تُنتج نتائج جزئية لا أخطاء
 * (طلب متجر بلا إحداثيات استلام ⇒ بلا eta؛ بلا طوابع ⇒ خط زمني منقوص).
 */
const { buildTimeline } = require('./orderTimeline');
const { haversineKm } = require('./geofence');
const { estimateEtaMinutes, formatEta } = require('./eta');

/**
 * @param {object} order كائن lean قابل للتعديل
 * @returns {object} نفس الكائن بعد إضافة timeline و(اختيارياً) eta
 */
function enrichOrder(order) {
    if (!order) return order;

    order.timeline = buildTimeline(order);

    // ETA للطلبات الجارية فقط (قبل التسليم/الإلغاء) وعند توفّر الإحداثيات
    if (!['delivered', 'cancelled'].includes(order.status)) {
        const km = haversineKm(order.pickup, order.dropoff);
        if (km != null) {
            const extraStops = order.isMultiStop && Array.isArray(order.stops)
                ? Math.max(0, order.stops.length - 2) : 0;
            const minutes = estimateEtaMinutes(km, { extraStops });
            const f = formatEta(minutes);
            if (f) order.eta = { distanceKm: Math.round(km * 10) / 10, ...f };
        }
    }
    return order;
}

module.exports = { enrichOrder };
