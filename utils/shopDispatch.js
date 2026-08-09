/**
 * 🛒 قواعد إرسال طلب المتجر للكباتن — منطق نقيّ قابل للاختبار.
 *
 * فُصل عن المسارات لأن دلالته حسّاسة: خطأٌ في مهلة التذكير يعني إمّا إزعاج
 * كل كباتن المدينة بإشعارٍ كل ثانية (زرٌّ يضغطه تاجرٌ متلهّف)، أو منع تذكيرٍ
 * مشروع عن طلبٍ واقفٍ منذ ساعة.
 */

/** أقلّ زمن بين تذكيرين للكباتن — بالدقائق */
const NUDGE_COOLDOWN_MIN = 5;

/**
 * هل يجوز تذكير الكباتن بهذا الطلب الآن؟
 *
 * @param {object} p
 * @param {Date|number|null} [p.lastNudgeAt] وقت آخر تذكير (null = لم يُذكَّر بعد)
 * @param {number} [p.cooldownMin] المهلة بالدقائق
 * @param {number} [p.now] الآن (ms) — للاختبار
 * @returns {{allowed:boolean, waitSec:number}} waitSec = كم يتبقّى إن مُنع
 */
function canNudgeCaptains({ lastNudgeAt, cooldownMin = NUDGE_COOLDOWN_MIN, now = Date.now() } = {}) {
    const cd = Number(cooldownMin);
    // مهلة صفرية أو غير صالحة ⇒ لا تقييد (إعدادٌ صريح من الإدارة)
    if (!Number.isFinite(cd) || cd <= 0) return { allowed: true, waitSec: 0 };

    // ⚠️ null قبل Number(): Number(null) = 0 أي «١٩٧٠»، فيبدو كل طلبٍ لم
    // يُذكَّر قط وكأنه ذُكِّر قبل نصف قرن — وهو ما نريده هنا فعلاً (يُسمح)،
    // لكن الاعتماد على ذلك صدفةٌ لا قاعدة. نصرّح به.
    if (lastNudgeAt == null || lastNudgeAt === '') return { allowed: true, waitSec: 0 };

    const at = lastNudgeAt instanceof Date ? lastNudgeAt.getTime() : Number(lastNudgeAt);
    if (!Number.isFinite(at)) return { allowed: true, waitSec: 0 };

    const elapsedMs = now - at;
    const cooldownMs = cd * 60000;
    if (elapsedMs >= cooldownMs) return { allowed: true, waitSec: 0 };

    return { allowed: false, waitSec: Math.ceil((cooldownMs - elapsedMs) / 1000) };
}

/**
 * هل هذا الطلب ما زال ينتظر كابتناً؟
 * تُقرأ من حالة ShopOrder لا من حالة Order: الأخيرة قد تكون أُلغيت إدارياً
 * بينما طلب المتجر حيّ (وهو بالضبط العطل الذي جعل التاجر يرى «جاري البحث»
 * إلى الأبد بعد إلغاء المجدول لطلب التوصيل).
 */
function isAwaitingCaptain(shopOrderStatus) {
    return shopOrderStatus === 'ready_for_pickup';
}

/**
 * ⏳ هل يجوز الإلغاء التلقائي لهذا الطلب لانتهاء المهلة؟
 *
 * ⚠️ طلبات المتاجر مستثناة صراحةً: العميل **دفع ثمن البضاعة** والتاجر جهّزها
 * وأخرجها من مخزونه. إلغاؤه لأن كابتناً لم يلتقطه خلال ست ساعات يُضيع مال
 * العميل وبضاعة التاجر معاً لسببٍ لا يد لأيٍّ منهما فيه. الصحيح تصعيدُه
 * للإدارة وإعادةُ بثّه، لا إعدامه.
 *
 * @param {object} order وثيقة الطلب (orderType, shopOrderId)
 * @returns {boolean}
 */
function mayAutoExpire(order) {
    if (!order) return false;
    if (order.orderType === 'shop') return false;
    if (order.shopOrderId) return false;   // مرتبطٌ بطلب متجر ولو لم يُوسم بنوعه
    return true;
}

module.exports = {
    canNudgeCaptains, isAwaitingCaptain, mayAutoExpire, NUDGE_COOLDOWN_MIN
};
