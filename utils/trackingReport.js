/**
 * 📊 تقرير الكباتن — البطاقات تُري الرحلة، وهذا يُري الكابتن.
 *
 * رحلةٌ متأخّرة واحدة قد تكون زحاماً. كابتنٌ تأخّر في ثمانٍ من عشر، أو أعلن
 * التسليم بعيداً عن العميل ثلاث مرّات هذا الأسبوع — هذا نمط، ولا تكشفه لوحة
 * الرحلات الجارية لأن كل رحلةٍ تختفي منها بعد ساعات.
 *
 * الأحكام نفسها التي تستعملها اللوحة (utils/tripTracking) — لا تعريفٌ ثانٍ
 * للتأخّر ولا للإثبات المشكوك فيه:
 *   late       تجاوز العتبة **الثانية** للمدينة في الاستلام أو في التوصيل
 *              (الأولى «قارب» — لا تُحسب على الكابتن)
 *   far        أعلن التسليم بعيداً عن العميل
 *   noLocation أعلن التسليم بلا موقعٍ حديث
 *   noPhoto    استلم بلا صورة إثبات
 */
const T = require('./tripTracking');

function captainReport(orders, nudgesFor) {
    const byCap = new Map();

    for (const o of orders || []) {
        const cap = o.captain && typeof o.captain === 'object' ? o.captain : null;
        if (!cap || !cap._id) continue;
        const id = String(cap._id);
        if (!byCap.has(id)) {
            byCap.set(id, {
                id, name: cap.name || 'كابتن', phone: cap.phone || '',
                trips: 0, late: 0, far: 0, noLocation: 0, noPhoto: 0,
                nudged: 0, acked: 0, _totalMin: 0, _timed: 0
            });
        }
        const r = byCap.get(id);
        const n = nudgesFor(o.city || 'Khartoum') || {};
        r.trips++;

        const pickupMin = T.minutesBetween(T.clockStart(o, 'accepted'), o.pickedUpAt);
        const deliverMin = T.minutesBetween(T.clockStart(o, 'picked_up'), o.deliveredAt);
        const lateP = pickupMin !== null && Number.isFinite(Number(n.captainPickup2)) && pickupMin >= Number(n.captainPickup2);
        const lateD = deliverMin !== null && Number.isFinite(Number(n.captainDeliver2)) && deliverMin >= Number(n.captainDeliver2);
        if (lateP || lateD) r.late++;

        const p = T.proofOf(o);
        if (p.pickupPhotoMissing) r.noPhoto++;
        if (p.delivery && p.delivery.state === 'far') r.far++;
        if (p.delivery && p.delivery.state === 'no_location') r.noLocation++;

        // تنبيهات الإدارة للكابتن **الحاليّ** على هذا الطلب، وكم ردّ منها
        for (const x of T.currentNudges(o)) {
            if (x.to !== 'captain') continue;
            r.nudged++;
            if (x.ackAt) r.acked++;
        }

        const total = T.minutesBetween(T.clockStart(o, 'accepted'), o.deliveredAt);
        if (total !== null) { r._totalMin += total; r._timed++; }
    }

    return [...byCap.values()].map(r => {
        const issues = r.late + r.far + r.noLocation + r.noPhoto;
        const { _totalMin, _timed, ...rest } = r;
        return {
            ...rest,
            avgMin: _timed ? Math.round(_totalMin / _timed) : null,
            issues,
            // نسبة الرحلات التي فيها ملاحظةٌ واحدة على الأقل لا تُعرف من
            // المجموع (رحلةٌ متأخّرة وبعيدة معاً)؛ هذه نسبة التأخّر وحدها
            lateRate: r.trips ? Math.round((r.late / r.trips) * 100) : 0
        };
    }).sort((a, b) => (b.issues - a.issues) || (b.lateRate - a.lateRate) || (b.trips - a.trips));
}

module.exports = { captainReport };
