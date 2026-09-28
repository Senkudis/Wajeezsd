/**
 * 🧭 موقع الكابتن: متى قيس، ومتى تحرّك آخر مرة.
 *
 * مصدرٌ واحد لكاتبَي الموقع (PUT /api/captain/update-location، وحدث
 * update_location على الـ socket). كان الثاني يكتب { lat, lng, updatedAt }
 * وحده فيمحو fixedAt الذي كتبه الأول — فيصير الحكم على حداثة الموقع بوقت
 * **وصوله** لا وقت **قياسه**، وإعادة إرسال آخر قراءة بعد انقطاع تبدو حيّة.
 *
 * والحركة: اهتزاز GPS في المكان نفسه يقفز عشرات الأمتار، فلا تُعدّ كل قراءةٍ
 * مختلفة «حركة». نحفظ «نقطة ثبات» (anchor) ولا نقول «تحرّك» إلا إن ابتعد
 * عنها بأكثر من MOVE_THRESHOLD_M — وعندها تصير القراءة الجديدة نقطة الثبات.
 * movedAt هو ما تبني عليه لوحة التتبّع «متوقّف منذ ١٢ د».
 */
const { haversineKm } = require('./geofence');

const MOVE_THRESHOLD_M = 80;
const MAX_FIX_AGE_MS = 24 * 60 * 60 * 1000;

/** عمر القراءة من الجهاز بالمللي ثانية — 0 للغائب (نسخٌ قديمة من التطبيق) */
function clampFixAge(raw) {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_FIX_AGE_MS) : 0;
}

/**
 * الموقع الجديد كما يُحفظ على الكابتن.
 * @param {object|null} prev  currentLocation الحاليّ
 * @param {{lat:number,lng:number,now?:Date,fixAge?:number}} next
 */
function nextLocation(prev, { lat, lng, now = new Date(), fixAge = 0 }) {
    const fixedAt = new Date(now.getTime() - clampFixAge(fixAge));

    // قراءةٌ أقدم ممّا عندنا (طابورٌ أُفرغ بعد انقطاع) لا تُرجع الكابتن
    // لمكانٍ غادره ولا الساعة للوراء
    const prevFixed = prev && prev.fixedAt ? new Date(prev.fixedAt) : null;
    if (prevFixed && fixedAt < prevFixed && Number.isFinite(prev.lat)) {
        return { ...prev, updatedAt: now };
    }

    const hasAnchor = prev && Number.isFinite(prev.anchorLat) && Number.isFinite(prev.anchorLng) && prev.movedAt;
    const drift = hasAnchor
        ? haversineKm({ lat: prev.anchorLat, lng: prev.anchorLng }, { lat, lng }) * 1000
        : null;
    const stayed = drift !== null && drift < MOVE_THRESHOLD_M;

    return {
        lat, lng,
        updatedAt: now,
        fixedAt,
        anchorLat: stayed ? prev.anchorLat : lat,
        anchorLng: stayed ? prev.anchorLng : lng,
        movedAt: stayed ? prev.movedAt : fixedAt
    };
}

module.exports = { nextLocation, clampFixAge, MOVE_THRESHOLD_M };
