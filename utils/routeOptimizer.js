/**
 * 🧭 محرّك ترتيب محطات الرحلة متعددة النقاط.
 *
 * الهدف: أقصر مسار يزور كل المحطات غير المكتملة، انطلاقاً من موقع الكابتن الفعلي.
 *
 * القيود (مفروضة من نموذج الطلب — models/Order.js):
 *   1. كل الاستلامات (pickup) قبل أي تسليم (dropoff). لا يمكن تسليم طرد لم يُستلم بعد.
 *   2. المحطات المكتملة (done) لا تتحرّك — تبقى في مواضعها كسجلّ لما حدث فعلاً.
 *
 * الخوارزمية: nearest-neighbour لبناء مسار أوّلي، ثم 2-opt لفكّ التقاطعات.
 * تُطبَّق داخل كل مقطع (الاستلامات وحدها، ثم التسليمات وحدها) فلا تخرق القيد الأول أبداً.
 *
 * المسافة: haversine (خط مستقيم). تقريب كافٍ لاختيار الترتيب — المسافة والزمن الحقيقيان
 * على الطرق يحسبهما Directions API في الواجهة عند رسم المسار.
 */

const R_EARTH_KM = 6371;

function toRad(deg) { return (deg * Math.PI) / 180; }

/** المسافة بالكيلومترات بين نقطتين على سطح الأرض. */
function haversineKm(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const h = Math.sin(dLat / 2) ** 2 +
              Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R_EARTH_KM * Math.asin(Math.sqrt(h));
}

/** الطول الكلي لمسار يبدأ من origin ويمرّ بالنقاط بالترتيب المعطى. */
function routeLengthKm(origin, points) {
    let total = 0;
    let prev = origin;
    for (const p of points) {
        total += haversineKm(prev, p);
        prev = p;
    }
    return total;
}

/** يبني مساراً أوّلياً: من الحالي، اقفز دائماً لأقرب نقطة لم تُزَر. */
function nearestNeighbour(origin, points) {
    const remaining = points.slice();
    const path = [];
    let current = origin;

    while (remaining.length) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const d = haversineKm(current, remaining[i]);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        current = remaining[bestIdx];
        path.push(current);
        remaining.splice(bestIdx, 1);
    }
    return path;
}

/**
 * 2-opt: يعكس المقاطع التي تُنتج تقاطعاً حتى لا يعود أي عكس بفائدة.
 * nearest-neighbour وحدها تترك مسارات متقاطعة بوضوح؛ هذه تنظّفها.
 * المسار يبدأ دائماً من origin الثابت، فلا نعكس أبداً حول نقطة البداية.
 */
function twoOpt(origin, points) {
    if (points.length < 3) return points;

    let best = points.slice();
    let bestLen = routeLengthKm(origin, best);
    let improved = true;
    let guard = 0;   // حارس ضد أي دوران غير متوقع في حالات حدّية

    while (improved && guard++ < 50) {
        improved = false;
        for (let i = 0; i < best.length - 1; i++) {
            for (let k = i + 1; k < best.length; k++) {
                const candidate = best.slice(0, i)
                    .concat(best.slice(i, k + 1).reverse())
                    .concat(best.slice(k + 1));
                const len = routeLengthKm(origin, candidate);
                if (len < bestLen - 1e-9) {
                    best = candidate;
                    bestLen = len;
                    improved = true;
                }
            }
        }
    }
    return best;
}

/** يرتّب مجموعة نقاط واحدة (كلها من نفس النوع) انطلاقاً من origin. */
function optimizeSegment(origin, points) {
    if (points.length <= 1) return points.slice();
    return twoOpt(origin, nearestNeighbour(origin, points));
}

/**
 * يقترح ترتيباً أفضل لمحطات الطلب.
 *
 * @param {Array} stops   محطات الطلب كما هي مخزّنة (بترتيبها الحالي).
 * @param {{lat:number,lng:number}} origin  موقع الكابتن الفعلي — نقطة البداية.
 * @returns {{
 *   order: number[],          الترتيب المقترح كفهارس في مصفوفة stops الأصلية
 *   currentKm: number,        طول المسار بالترتيب الحالي
 *   optimizedKm: number,      طول المسار بالترتيب المقترح
 *   savedKm: number,          الفرق (≥ 0)
 *   changed: boolean          هل يختلف المقترح عن الحالي أصلاً؟
 * }}
 * @throws إذا كانت المحطات غير صالحة (بلا إحداثيات).
 */
function optimizeStops(stops, origin) {
    if (!Array.isArray(stops) || stops.length === 0) {
        throw new Error('لا توجد محطات لترتيبها');
    }
    if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
        throw new Error('موقع الانطلاق غير صالح');
    }

    // احمل الفهرس الأصلي مع كل محطة — هو ما سنعيده في النهاية
    const indexed = stops.map((s, i) => ({ i, s }));

    const done   = indexed.filter(x => x.s.done);
    const undone = indexed.filter(x => !x.s.done);

    // المحطات المكتملة تبقى في مقدّمة الترتيب بترتيبها الزمني — لا تُعاد جدولتها
    const doneOrder = done.map(x => x.i);

    if (undone.length <= 1) {
        return {
            order: doneOrder.concat(undone.map(x => x.i)),
            currentKm: 0, optimizedKm: 0, savedKm: 0, changed: false
        };
    }

    const missingCoords = undone.find(x => !Number.isFinite(x.s.lat) || !Number.isFinite(x.s.lng));
    if (missingCoords) {
        throw new Error('بعض المحطات بلا إحداثيات — تعذّر حساب أفضل مسار');
    }

    // 🔒 القيد: كل الاستلامات قبل أي تسليم. نرتّب كل مقطع على حدة، فيستحيل خرقه.
    const pickups  = undone.filter(x => x.s.type === 'pickup');
    const dropoffs = undone.filter(x => x.s.type !== 'pickup');

    const optPickups = optimizeSegment(origin, pickups.map(x => x.s));
    // التسليمات تبدأ من آخر استلام (أو من موقع الكابتن إن لم تبقَ استلامات)
    const dropOrigin = optPickups.length ? optPickups[optPickups.length - 1] : origin;
    const optDropoffs = optimizeSegment(dropOrigin, dropoffs.map(x => x.s));

    // أعِد ربط كل نقطة مُرتَّبة بفهرسها الأصلي (بالمرجع — نفس كائنات stops)
    const toIndex = (arr, pool) => arr.map(p => pool.find(x => x.s === p).i);
    const optimizedIdx = toIndex(optPickups, pickups).concat(toIndex(optDropoffs, dropoffs));

    const currentPts   = undone.map(x => x.s);
    const optimizedPts = optPickups.concat(optDropoffs);

    const currentKm   = routeLengthKm(origin, currentPts);
    const optimizedKm = routeLengthKm(origin, optimizedPts);

    const currentIdx = undone.map(x => x.i);

    // 🛡️ 2-opt يبدأ من nearest-neighbour لا من الترتيب الحالي، فقد يخرج — نظرياً — أسوأ منه.
    // في تلك الحالة لا نقترح شيئاً: اقتراحُ مسارٍ أطول أسوأ من عدم الاقتراح.
    if (optimizedKm >= currentKm) {
        return {
            order: doneOrder.concat(currentIdx),
            currentKm:   Math.round(currentKm * 100) / 100,
            optimizedKm: Math.round(currentKm * 100) / 100,
            savedKm: 0,
            changed: false
        };
    }

    const changed = optimizedIdx.some((v, i) => v !== currentIdx[i]);

    return {
        order: doneOrder.concat(optimizedIdx),
        currentKm:   Math.round(currentKm   * 100) / 100,
        optimizedKm: Math.round(optimizedKm * 100) / 100,
        savedKm: Math.round((currentKm - optimizedKm) * 100) / 100,
        changed
    };
}

module.exports = { optimizeStops, haversineKm, routeLengthKm };
