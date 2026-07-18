/**
 * توزيع إشعارات الطلب الجديد على الكباتن — الأقرب أولاً، مع ضمان الوصول للكل.
 *
 * القاعدة (بطلب المستخدم): لا نحصر الإشعار في الأقرب فقط (قد تضيع إشعارات فلا
 * يراها أحد)، بل نُشعر الأقرب فوراً ثم نُشعر البقية بعد مهلة قصيرة إن ظلّ الطلب
 * معلّقاً — فالأقرب يأخذ الأولوية والوصول للجميع مضمون كشبكة أمان.
 */
const { haversineKm } = require('./geofence');

/**
 * يقسّم الكباتن إلى موجتين حسب القرب من نقطة الاستلام.
 * @param {Array<{fcmToken:string, currentLocation?:{lat:number,lng:number}}>} captains
 * @param {{lat:number,lng:number}} pickup إحداثيات الاستلام
 * @param {object} [opts] { nearCount = 8 }
 * @returns {{ near: string[], rest: string[] }} توكنات كل موجة
 */
function planDispatch(captains, pickup, opts = {}) {
    const nearCount = opts.nearCount || 8;

    const withDist = (captains || [])
        .filter(c => c && c.fcmToken)
        .map(c => {
            const loc = c.currentLocation;
            let dist = Infinity; // بلا موقع (أو بلا إحداثيات طلب) ⇒ يُعامَل كبعيد
            if (loc && loc.lat != null && loc.lng != null && pickup && pickup.lat != null && pickup.lng != null) {
                const d = haversineKm({ lat: loc.lat, lng: loc.lng }, { lat: pickup.lat, lng: pickup.lng });
                if (d != null) dist = d;
            }
            return { token: c.fcmToken, dist };
        });

    // إزالة التكرار في التوكنات (جهاز واحد قد يظهر مرتين) — نُبقي الأقرب
    const seen = new Set();
    const unique = [];
    withDist.sort((a, b) => a.dist - b.dist);
    for (const x of withDist) {
        if (seen.has(x.token)) continue;
        seen.add(x.token);
        unique.push(x);
    }

    const tokens = unique.map(x => x.token);
    if (tokens.length <= nearCount) return { near: tokens, rest: [] };
    return { near: tokens.slice(0, nearCount), rest: tokens.slice(nearCount) };
}

module.exports = { planDispatch };
