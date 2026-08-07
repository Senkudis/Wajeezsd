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
 *
 * حجم الموجة الأولى يُحسب بنصف القطر لا بعدد ثابت: عدد ثابت كبير (كان 50)
 * يضع كل الأسطول في الموجة الأولى فيتعطّل نظام الموجتين عملياً، وعدد ثابت صغير
 * يهمل كباتن قريبين فعلاً حين يكون الحيّ مزدحماً. minNear يضمن ألا تفرغ الموجة
 * الأولى في منطقة متفرقة، وmaxNear يمنع تحوّلها إلى بثّ شامل.
 *
 * @param {Array<{fcmToken:string, currentLocation?:{lat:number,lng:number}}>} captains
 * @param {{lat:number,lng:number}} pickup إحداثيات الاستلام
 * @param {object} [opts] { nearRadiusKm = 5, minNear = 8, maxNear = 25, nearCount }
 *                        nearCount يتجاوز الحساب كلّه (عدد ثابت صريح)
 * @returns {{ near: string[], rest: string[] }} توكنات كل موجة
 */
function planDispatch(captains, pickup, opts = {}) {
    const nearRadiusKm = opts.nearRadiusKm ?? 5;
    const minNear      = opts.minNear ?? 8;
    const maxNear      = opts.maxNear ?? 25;

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

    // عدد صريح ⇒ يُستخدم كما هو. وإلا: من هم داخل نصف القطر، ضمن حدّي min/max.
    // الكباتن بلا موقع مسافتهم Infinity فلا يدخلون الموجة الأولى إلا عبر minNear.
    let cut;
    if (opts.nearCount != null) {
        cut = opts.nearCount;
    } else {
        const withinRadius = unique.filter(x => x.dist <= nearRadiusKm).length;
        cut = Math.min(maxNear, Math.max(minNear, withinRadius));
    }

    if (tokens.length <= cut) return { near: tokens, rest: [] };
    return { near: tokens.slice(0, cut), rest: tokens.slice(cut) };
}

module.exports = { planDispatch };
