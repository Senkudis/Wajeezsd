/**
 * منطق الكوبونات — مصدر واحد للحقيقة.
 *
 * كان إنشاء الطلب (POST /api/orders) يثق بـ discountAmount القادم من العميل
 * ويخزّنه كما هو، ويحسب serverDiscount لكنه لا يستخدمه (كود ميت)، ولا يفحص
 * المدينة/الحد الأدنى/حد المستخدم إطلاقاً — بينما /apply-promo يفحصها كلها.
 * النتيجة: تخزين خصم مفبرك وتسجيل استخدام كوبونات وهمية أو منتهية.
 *
 * الدوال هنا نقية (بلا قاعدة بيانات) لتكون قابلة للاختبار، ويستدعيها المساران.
 */

/**
 * يتحقق من صلاحية الكوبون لهذا المستخدم وقيمة الطلب.
 * @param {object} promo    مستند PromoCode (أو lean)
 * @param {object} ctx      { userId, userCity, fullOrderValue, placeId }
 * @returns {{ok:boolean, error?:string}}
 */
function validatePromo(promo, { userId, userCity, fullOrderValue, placeId }) {
    if (!promo) return { ok: false, error: 'كود الخصم غير صحيح أو منتهي الصلاحية' };

    // الحد الإجمالي للاستخدام
    if (promo.usageLimit !== null && promo.usageLimit !== undefined &&
        promo.usedCount >= promo.usageLimit) {
        return { ok: false, error: 'عذراً! لقد وصل هذا الكود لحده الأقصى من الاستخدام' };
    }

    // حد استخدام نفس المستخدم
    const userUsages = (promo.usedBy || [])
        .filter(u => u.user && String(u.user) === String(userId)).length;
    if (userUsages >= (promo.userUsageLimit ?? 1)) {
        return { ok: false, error: 'لقد استخدمت هذا الكود الحد المسموح لك' };
    }

    // الحد الأدنى لقيمة الطلب
    if (fullOrderValue < (promo.minOrderValue || 0)) {
        return { ok: false, error: `الحد الأدنى لاستخدام هذا الكود هو ${promo.minOrderValue} ج.س` };
    }

    // المدينة — تُقارن بمدينة المستخدم/المتجر لا بما يرسله العميل.
    // userCity فارغ ⇒ يُتخطّى الفحص (متجر قديم بلا مدينة — تساهلٌ مقصود).
    if (userCity && promo.city && promo.city !== 'all' && promo.city !== userCity) {
        return { ok: false, error: 'هذا الكود غير متاح في مدينتك' };
    }

    // 🏪 حصر المتاجر — قائمة بيضاء صارمة متى كانت غير فارغة.
    //
    // نفحصه هنا لا في كل مسار على حدة: المسارات الثلاثة (إنشاء الطلب، طلب
    // المتجر، ومعاينة /apply-promo) كانت ستحتاج نسخة من المنطق نفسه، ونسخةٌ
    // تُنسى في أحدها تعني كوبوناً «محصوراً» يمرّ من الباب الخلفي.
    const limitedTo = Array.isArray(promo.places) ? promo.places : [];
    if (limitedTo.length > 0) {
        if (!placeId) {
            return { ok: false, error: 'هذا الكود يُستخدم في متاجر محدّدة فقط' };
        }
        const allowed = limitedTo.some(p => String(p && p._id ? p._id : p) === String(placeId));
        if (!allowed) {
            return { ok: false, error: 'هذا الكود غير متاح في هذا المتجر' };
        }
    }

    return { ok: true };
}

/**
 * يحسب قيمة الخصم على المبلغ الأساس حسب نوع الكوبون ونطاقه.
 * @param {object} promo
 * @param {object} amounts { productsTotal, deliveryFee, fullOrderValue }
 * @returns {{discount:number, scope:string, error?:string}}
 */
function computeDiscount(promo, { productsTotal = 0, deliveryFee = 0, fullOrderValue = 0 }) {
    const scope = promo.appliesTo || 'total';
    let base;
    if (scope === 'products') {
        base = Number(productsTotal);
        if (!base || isNaN(base) || base <= 0) {
            return { discount: 0, scope, error: 'هذا الكود يُطبَّق على المنتجات فقط، ولا توجد منتجات في الطلب' };
        }
    } else if (scope === 'delivery') {
        base = Number(deliveryFee) || Number(fullOrderValue) || 0;
        if (!base || isNaN(base) || base <= 0) {
            return { discount: 0, scope, error: 'هذا الكود يُطبَّق على التوصيل فقط، ولا يوجد سعر توصيل صالح' };
        }
    } else {
        base = Number(fullOrderValue) || 0;
    }

    let discount = 0;
    if (promo.type === 'percentage') {
        discount = (base * promo.value) / 100;
        if (promo.maxDiscount !== null && promo.maxDiscount !== undefined) {
            discount = Math.min(discount, promo.maxDiscount);
        }
    } else {
        discount = Math.min(promo.value, base);
    }
    // لا يتجاوز الخصم المبلغ الأساس ولا يكون سالباً
    discount = Math.max(0, Math.min(discount, base));
    discount = Math.round(discount * 100) / 100;
    return { discount, scope };
}

module.exports = { validatePromo, computeDiscount };
