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

module.exports = {
    validateErrandInput, canSubmitQuote, canRespondQuote, canMarkPurchased, validateQuoteAmount
};
