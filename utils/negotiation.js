/**
 * 💬 ثوابت ومساعدات نظام المفاوضة (عروض الكباتن على سعر الطلب).
 *
 * لماذا ملف مستقل: مدة صلاحية العرض كانت مكتوبة رقماً في ثلاثة مواضع —
 * إنشاء العرض في routes/orders.js، ومهلة تذكير الكابتن، ونص "لديك 5 دقائق"
 * في واجهة الكابتن. تغيير واحد منها ينسى الباقي، فيرى الكابتن مدة لا تطابق
 * ما ينفّذه السيرفر فعلاً. المصدر الآن هنا وحده.
 */

// مدة صلاحية عرض الكابتن. رُفعت من 5 إلى 10 دقائق: خمس دقائق لم تكن تكفي
// ليفتح العميل التطبيق ويقارن العروض، فتنتهي العروض قبل أن يراها.
const NEGOTIATION_TTL_MINUTES = 10;
const NEGOTIATION_TTL_MS = NEGOTIATION_TTL_MINUTES * 60 * 1000;

// كم قبل الانتهاء يُذكَّر الكابتن بأن عرضه على وشك الانتهاء
const NEGOTIATION_REMINDER_BEFORE_MS = 2 * 60 * 1000;

/**
 * ملخّص مضغوط لعروض طلبٍ واحد — للوحة الإدارة.
 *
 * لماذا ملخّص لا المصفوفة كاملة: قائمة طلبات الأدمن تُرجع 200 طلباً، وإرسال
 * مصفوفة العروض بلقطات بيانات كل كابتن (صورة، تقييم، مركبة) يضخّم الحمولة
 * أضعافاً بلا فائدة في جدول. الشاشة تحتاج: كم عرضاً مفتوحاً وأرخصها.
 *
 * @param {Array} negotiations مصفوفة negotiations من مستند الطلب
 * @param {Date}  [now] لحقن الوقت في الاختبارات
 * @returns {{count:number, lowestPrice:number|null, nextExpiresAt:Date|null}}
 */
function summarizeNegotiations(negotiations, now = new Date()) {
    const empty = { count: 0, lowestPrice: null, nextExpiresAt: null };
    if (!Array.isArray(negotiations) || negotiations.length === 0) return empty;

    // العرض المفتوح = حالته pending ولم تنتهِ صلاحيته. المنتهي زمنياً يظل
    // pending في قاعدة البيانات حتى يمرّ عليه المجدول كل 5 دقائق، فلا يصحّ
    // الاعتماد على الحالة وحدها وإلا عدّ الأدمن عروضاً ميتة.
    const open = negotiations.filter((n) => {
        if (!n || n.status !== 'pending') return false;
        if (n.expiresAt && new Date(n.expiresAt) <= now) return false;
        return true;
    });
    if (open.length === 0) return empty;

    // ⚠️ Number(null) = 0 وهو رقم صحيح المظهر: عرضٌ بسعر مفقود كان يظهر للإدارة
    // كأرخص عرض بصفر جنيه. نستبعد الفراغ صراحةً ونشترط سعراً أكبر من صفر.
    const prices = open
        .map((n) => (n.proposedPrice === null || n.proposedPrice === undefined || n.proposedPrice === ''
            ? NaN : Number(n.proposedPrice)))
        .filter((p) => Number.isFinite(p) && p > 0);
    const expiries = open
        .map((n) => (n.expiresAt ? new Date(n.expiresAt).getTime() : null))
        .filter((t) => Number.isFinite(t));

    return {
        count: open.length,
        lowestPrice: prices.length ? Math.min(...prices) : null,
        nextExpiresAt: expiries.length ? new Date(Math.min(...expiries)) : null
    };
}

module.exports = {
    NEGOTIATION_TTL_MINUTES,
    NEGOTIATION_TTL_MS,
    NEGOTIATION_REMINDER_BEFORE_MS,
    summarizeNegotiations
};
