/**
 * خدمة "اشترِ لي" (errand) — منطق نقي قابل للاختبار: تحقّق الإدخال وآلة حالة عرض السعر.
 *
 * الفكرة: العميل يطلب من محل غير مسجّل (قائمة منسّقة أو دبوس مخصّص) بأصناف نصية حرة.
 * سعر البضاعة مجهول حتى يصل الكابتن المحل، فيُدخله (quote) ويؤكّده العميل قبل الشراء.
 * price في الطلب = أجرة الخدمة (عليها العمولة) لا البضاعة.
 */

const OID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * يتحقق من مدخلات إنشاء طلب errand.
 * يجب: (محل منسّق shopId) أو (اسم + دبوس pickup)، وصنف واحد على الأقل.
 * @returns {{valid:boolean, message?:string, items?:string[]}}
 */
function validateErrandInput({ shopId, shopName, pickup, items } = {}) {
    const hasCurated = shopId && OID_RE.test(String(shopId));
    const lat = pickup && Number(pickup.lat);
    const lng = pickup && Number(pickup.lng);
    const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
    const hasName = shopName && String(shopName).trim().length > 0;
    const hasCustom = hasName && hasPin;

    if (!hasCurated && !hasCustom) {
        return { valid: false, message: 'حدّد المحل من القائمة أو ضع دبوساً مع اسمه' };
    }

    const clean = Array.isArray(items)
        ? items.map(s => String(s == null ? '' : s).trim()).filter(Boolean)
        : (typeof items === 'string' && items.trim() ? [items.trim()] : []);
    if (clean.length === 0) {
        return { valid: false, message: 'اكتب تفاصيل طلبك (صنف واحد على الأقل)' };
    }

    return { valid: true, items: clean };
}

/** هل يمكن للكابتن إدخال/تحديث سعر البضاعة الآن؟ */
function canSubmitQuote(order) {
    if (!order || order.orderType !== 'errand') return { ok: false, message: 'ليس طلب خدمة شراء' };
    if (order.status !== 'accepted') return { ok: false, message: 'يجب قبول الطلب أولاً قبل إدخال السعر' };
    if (order.errand && order.errand.quoteStatus === 'confirmed') {
        return { ok: false, message: 'تم تأكيد السعر مسبقاً' };
    }
    return { ok: true };
}

/** هل يمكن للعميل الرد (موافقة/رفض) على السعر الآن؟ */
function canRespondQuote(order) {
    if (!order || order.orderType !== 'errand') return { ok: false, message: 'ليس طلب خدمة شراء' };
    // يجب أن يكون الطلب جارياً (مقبولاً) — يمنع الرد على طلب أُلغي إدارياً وسعره ما زال 'quoted'
    if (order.status !== 'accepted') return { ok: false, message: 'الطلب لم يعد متاحاً للرد' };
    if (!order.errand || order.errand.quoteStatus !== 'quoted') {
        return { ok: false, message: 'لا يوجد سعر بانتظار تأكيدك' };
    }
    return { ok: true };
}

/** هل يمكن للكابتن تأكيد الشراء (pickup) الآن؟ يشترط تأكيد العميل للسعر. */
function canMarkPurchased(order) {
    if (!order || order.orderType !== 'errand') return { ok: true }; // غير errand: لا قيد إضافي
    if (!order.errand || order.errand.quoteStatus !== 'confirmed') {
        return { ok: false, message: 'أدخِل سعر البضاعة وانتظر تأكيد العميل قبل الشراء' };
    }
    return { ok: true };
}

/** يتحقق من مبلغ السعر: رقم موجب ضمن حد معقول. */
function validateQuoteAmount(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return { valid: false, message: 'أدخل سعراً صحيحاً أكبر من صفر' };
    if (n > 10000000) return { valid: false, message: 'المبلغ مبالغ فيه' };
    return { valid: true, amount: Math.round(n * 100) / 100 };
}

/**
 * 💰 يقيس السعر المعروض على ميزانية العميل.
 *
 * كان حقل budget يُملأ من العميل ويُحفظ في القاعدة ثم **لا يُقرأ في أي مكان** —
 * سؤالٌ نطرحه على العميل ثم نتجاهل جوابه. هنا يصير له أثران:
 *   1. الكابتن يعرف أنه تجاوز التوقّع قبل أن يُرسل، فيراجع أو يشرح.
 *   2. الموافقة المسبقة: ما دام ضمن الميزانية فلا داعي لجولة سؤال — الكابتن
 *      يشتري فوراً. الجولة الضائعة هي أطول لحظة في المسار كله: الكابتن واقف
 *      في المحل ينتظر إشعاراً قد لا يراه العميل أصلاً.
 *
 * @param {object} p
 * @param {?number} p.budget سقف العميل التقديري (null/0 = بلا سقف)
 * @param {boolean} p.autoApprove هل أذِن العميل بالشراء ضمن سقفه بلا سؤال؟
 * @param {number} p.amount السعر الذي أدخله الكابتن
 * @returns {{hasBudget:boolean, overBudget:boolean, overBy:number, autoConfirm:boolean}}
 */
function evaluateQuote({ budget, autoApprove, amount } = {}) {
    const b = Number(budget);
    const a = Number(amount);
    const hasBudget = Number.isFinite(b) && b > 0;
    const validAmount = Number.isFinite(a) && a > 0;

    if (!hasBudget || !validAmount) {
        return { hasBudget: false, overBudget: false, overBy: 0, autoConfirm: false };
    }
    const overBudget = a > b;
    return {
        hasBudget: true,
        overBudget,
        overBy: overBudget ? Math.round((a - b) * 100) / 100 : 0,
        // ⚠️ الإذن لا يمتدّ فوق السقف أبداً: العميل أذن بمبلغٍ محدّد لا بالثقة
        // المطلقة. تجاوزُه يعني إنفاق ماله بما لم يوافق عليه.
        autoConfirm: !!autoApprove && !overBudget
    };
}

/**
 * ⏱️ ماذا يجب أن يحدث لعرض سعرٍ معلّق الآن؟
 *
 * دالة نقية لأن دلالتها حسّاسة: خطأٌ في الحدود يعني إمّا إزعاج العميل بتذكيرٍ
 * كل دقيقة، أو إلغاء طلبٍ حيّ لأن الحساب أخطأ بدقيقة.
 *
 * @param {object} p
 * @param {Date|number} p.quotedAt وقت إرسال السعر
 * @param {Date|number} [p.reminderSentAt] وقت التذكير إن أُرسل — يمنع تكراره
 * @param {number} p.reminderMin دقائق حتى التذكير (0 = بلا تذكير)
 * @param {number} p.expiryMin دقائق حتى انتهاء الصلاحية (0 = بلا انتهاء)
 * @param {number} [p.now] الآن (ms) — للاختبار
 * @returns {'none'|'remind'|'expire'}
 */
function quoteTimeoutState({ quotedAt, reminderSentAt, reminderMin, expiryMin, now = Date.now() } = {}) {
    // ⚠️ null صراحةً قبل Number(): Number(null) = 0، أي «١٩٧٠» — فيبدو كل طلبٍ بلا
    // وقت عرضٍ منتهيَ الصلاحية منذ نصف قرن، ويُلغى طلبٌ حيّ بحسابٍ على قيمة غائبة.
    if (quotedAt == null || quotedAt === '') return 'none';
    const at = quotedAt instanceof Date ? quotedAt.getTime() : Number(quotedAt);
    if (!Number.isFinite(at)) return 'none';
    const elapsedMin = (now - at) / 60000;

    // الانتهاء يسبق التذكير في الفحص: طلبٌ مضى عليه ما يفوق المهلتين معاً
    // (سيرفر كان متوقّفاً مثلاً) يجب أن ينتهي لا أن يُذكَّر ثم ينتظر دورة أخرى
    const exp = Number(expiryMin);
    if (Number.isFinite(exp) && exp > 0 && elapsedMin >= exp) return 'expire';

    const rem = Number(reminderMin);
    if (Number.isFinite(rem) && rem > 0 && elapsedMin >= rem && !reminderSentAt) return 'remind';

    return 'none';
}

module.exports = {
    validateErrandInput, canSubmitQuote, canRespondQuote, canMarkPurchased, validateQuoteAmount,
    evaluateQuote, quoteTimeoutState
};
