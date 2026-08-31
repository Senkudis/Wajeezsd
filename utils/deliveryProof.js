const { haversineKm } = require('./geofence');
const { isUsableCoord } = require('./coords');

/**
 * 📍 إثبات التسليم — هل كان الكابتن فعلاً عند نقطة التسليم لحظة إعلانه؟
 *
 * المشكلة: `PUT /:id/deliver` كان يقبل الإعلان من أي مكان وفي أي وقت، فتُخصم
 * العمولة ويُغلق الطلب بلا أي دليل. لا فحص قرب رغم وجود haversine جاهزاً،
 * ولا رمز تأكيد من العميل.
 *
 * لماذا فحص المسافة لا رمز التأكيد: الرمز يفرض خطوة على العميل في كل طلب،
 * وموقع الكابتن محفوظ خادمياً أصلاً (سوكت كل ثلاث ثوانٍ + PUT update-location)
 * فالفحص لا يحتاج أي تغيير في التطبيق المنشور.
 *
 * الأوضاع الثلاثة — لأن التفعيل المباشر يوقف كل كابتن غلَط موقعه أو أطفأ GPS:
 *   off      — لا فحص إطلاقاً.
 *   observe  — يحسب ويُسجّل على الطلب ولا يمنع أبداً (الافتراضي). يتيح رؤية
 *              التوزيع الحقيقي للمسافات قبل اتخاذ قرار المنع.
 *   enforce  — يمنع البعيد، ويمنع أيضاً من لا موقع صالحاً له.
 */

const MODES = ['off', 'observe', 'enforce'];

const REASONS = {
    OK: 'ok',
    DISABLED: 'disabled',
    TOO_FAR: 'too_far',
    NO_DROPOFF_COORDS: 'no_dropoff_coords',
    NO_CAPTAIN_LOCATION: 'no_captain_location',
    STALE_LOCATION: 'stale_location'
};

// رسائل عربية للحالات المانعة وحدها
const BLOCK_MESSAGES = {
    [REASONS.TOO_FAR]: 'يبدو أنك بعيد عن نقطة التسليم. اقترب منها ثم أكّد التسليم.',
    [REASONS.NO_CAPTAIN_LOCATION]: 'تعذّر تحديد موقعك. فعّل خدمة الموقع ثم أعد المحاولة.',
    [REASONS.STALE_LOCATION]: 'موقعك المسجّل قديم. افتح التطبيق لحظة لتحديثه ثم أعد المحاولة.'
};

/**
 * @param {object} params
 * @param {{lat:number,lng:number,updatedAt?:Date}} [params.captainLocation] موقع الكابتن
 * @param {{lat:number,lng:number}} [params.dropoff] نقطة التسليم
 * @param {string} [params.mode] off | observe | enforce
 * @param {number} [params.radiusMeters] نصف القطر المقبول
 * @param {number} [params.maxLocationAgeSec] أقصى عمر مقبول للموقع المحفوظ
 * @param {number} [params.now] الزمن المرجعي (للاختبار)
 * @returns {{verified:boolean, blocked:boolean, reason:string, message:string|null,
 *            distanceM:number|null, locationAgeSec:number|null,
 *            lat:number|null, lng:number|null}}
 */
function evaluateDeliveryProof({
    captainLocation,
    dropoff,
    mode = 'observe',
    radiusMeters = 500,
    maxLocationAgeSec = 600,
    now = Date.now()
} = {}) {
    const base = {
        verified: false,
        blocked: false,
        reason: REASONS.OK,
        message: null,
        distanceM: null,
        locationAgeSec: null,
        lat: null,
        lng: null
    };

    const effectiveMode = MODES.includes(mode) ? mode : 'observe';
    if (effectiveMode === 'off') {
        return { ...base, reason: REASONS.DISABLED };
    }

    const enforcing = effectiveMode === 'enforce';
    const decide = (reason) => ({
        ...base,
        reason,
        // لا يمنع إلا في وضع الفرض، ولا يمنع أصلاً إلا ما له رسالة منع.
        blocked: enforcing && !!BLOCK_MESSAGES[reason],
        message: enforcing ? (BLOCK_MESSAGES[reason] || null) : null
    });

    // نقطة تسليم بلا إحداثيات: لا يمكن الحكم — لا نمنع حتى في وضع الفرض،
    // فالنقص في بيانات الطلب لا ذنب للكابتن فيه.
    if (!dropoff || !isUsableCoord(dropoff.lat, dropoff.lng)) {
        return decide(REASONS.NO_DROPOFF_COORDS);
    }

    if (!captainLocation || !isUsableCoord(captainLocation.lat, captainLocation.lng)) {
        return decide(REASONS.NO_CAPTAIN_LOCATION);
    }

    const lat = Number(captainLocation.lat);
    const lng = Number(captainLocation.lng);

    let locationAgeSec = null;
    if (captainLocation.updatedAt) {
        const stamp = new Date(captainLocation.updatedAt).getTime();
        if (Number.isFinite(stamp)) {
            locationAgeSec = Math.max(0, Math.round((now - stamp) / 1000));
        }
    }

    // موقع بلا ختم زمني يُعامَل كقديم: لا سبيل للتأكد أنه يخصّ هذه اللحظة.
    if (locationAgeSec === null || locationAgeSec > maxLocationAgeSec) {
        return { ...decide(REASONS.STALE_LOCATION), lat, lng, locationAgeSec };
    }

    const km = haversineKm({ lat, lng }, { lat: dropoff.lat, lng: dropoff.lng });
    if (km === null) {
        return { ...decide(REASONS.NO_DROPOFF_COORDS), lat, lng, locationAgeSec };
    }

    const distanceM = Math.round(km * 1000);
    if (distanceM > radiusMeters) {
        return { ...decide(REASONS.TOO_FAR), lat, lng, locationAgeSec, distanceM };
    }

    return { ...base, verified: true, reason: REASONS.OK, lat, lng, locationAgeSec, distanceM };
}

module.exports = { evaluateDeliveryProof, MODES, REASONS, BLOCK_MESSAGES };
