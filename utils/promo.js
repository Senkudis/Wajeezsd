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
 * أسطر الطلب المؤهَّلة لهذا الكوبون.
 *
 * قائمة products فارغة ⇒ كل الأسطر (السلوك القديم حرفياً). غير فارغة ⇒
 * الأسطر المذكورة وحدها — وهي التي يُحسب منها الخصم لاحقاً.
 *
 * @param {object} promo
 * @param {Array<{productId:*, price:number, quantity:number}>} items
 */
function eligibleLines(promo, items) {
    const lines = Array.isArray(items) ? items : [];
    const only = (Array.isArray(promo && promo.products) ? promo.products : [])
        .map(p => String(p && p._id ? p._id : p));
    if (!only.length) return lines;
    return lines.filter(l => l && only.includes(String(l.productId)));
}

/** مجموع كمية الأسطر. */
function totalQuantity(lines) {
    return (lines || []).reduce((n, l) => n + (Number(l && l.quantity) || 0), 0);
}

/** مجموع قيمة الأسطر (سعر × كمية). */
function linesTotal(lines) {
    return (lines || []).reduce(
        (s, l) => s + (Number(l && l.price) || 0) * (Number(l && l.quantity) || 0), 0);
}

/**
 * قيمة القطع المجانية في عرض «اشترِ N واحصل على M مجاناً».
 *
 * القاعدة: تُفرَد الأسطر إلى قطعٍ مفردة، وتُرتَّب تصاعدياً، ثم تُمجَّن الأرخص.
 * تمجينُ الأغلى يفتح باباً واضحاً للاستغلال (يضيف العميل قطعةً رخيصة ليُمجَّن
 * أغلى ما في السلة)، وهو أيضاً ليس ما يقصده التاجر حين يكتب «اشترِ ٣ خذ ١».
 *
 * عدد المجموعات = ⌊إجمالي الكمية ÷ (N+M)⌋ — أي أن العميل يجب أن يحمل N+M
 * قطعة ليأخذ M مجاناً، لا N فقط. هذا هو المعنى التجاري: «اشترِ ٣ واحصل على
 * واحد» تعني أربع قطع في السلة تُحاسَب على ثلاث.
 */
function computeBogoDiscount(promo, lines) {
    const buy  = Math.max(1, Number(promo && promo.bogo && promo.bogo.buyQuantity)  || 1);
    const free = Math.max(1, Number(promo && promo.bogo && promo.bogo.freeQuantity) || 1);
    const groupSize = buy + free;

    const units = [];
    for (const l of (lines || [])) {
        const qty = Math.max(0, Math.floor(Number(l && l.quantity) || 0));
        const price = Number(l && l.price) || 0;
        for (let i = 0; i < qty; i++) units.push(price);
    }
    if (units.length < groupSize) return 0;

    units.sort((a, b) => a - b);
    const freeCount = Math.floor(units.length / groupSize) * free;
    let discount = 0;
    for (let i = 0; i < freeCount && i < units.length; i++) discount += units[i];
    return Math.round(discount * 100) / 100;
}

/**
 * يتحقق من صلاحية الكوبون لهذا المستخدم وقيمة الطلب.
 * @param {object} promo    مستند PromoCode (أو lean)
 * @param {object} ctx      { userId, userCity, fullOrderValue, placeId, items }
 *                          items اختيارية — تُمرَّر من مسار طلب المتجر حيث
 *                          تُعرف الأسطر. غيابها يعني «لا أسطر معروفة».
 * @returns {{ok:boolean, error?:string}}
 */
function validatePromo(promo, { userId, userCity, fullOrderValue, placeId, items }) {
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

    // 📦 حصر المنتجات — نفس منطق حصر المتاجر: قائمةٌ غير فارغة تعني قائمة
    //    بيضاء صارمة. وبلا أسطر معروفة (طلب توصيل عادي مثلاً) لا سبيل
    //    لمطابقتها، فيُرفض — كما يُرفض الكود المحصور بمتجر على طلبٍ بلا متجر.
    const onlyProducts = Array.isArray(promo.products) ? promo.products : [];
    const lines = eligibleLines(promo, items);
    if (onlyProducts.length > 0) {
        if (!Array.isArray(items)) {
            return { ok: false, error: 'هذا الكود يُستخدم على منتجات محدّدة فقط' };
        }
        if (lines.length === 0) {
            return { ok: false, error: 'هذا الكود يخصّ منتجات غير موجودة في طلبك' };
        }
    }

    // 🔢 الحد الأدنى للكمية — يُقاس على المؤهَّل لا على السلة كلها، وإلا
    //    لأمكن بلوغ «اشترِ ٣ من العصير» بثلاث وجبات وعصيرٍ واحد.
    const minQty = Number(promo.minQuantity) || 0;
    if (minQty > 0) {
        if (!Array.isArray(items)) {
            return { ok: false, error: 'هذا الكود يتطلّب حدّاً أدنى من الكمية' };
        }
        const have = totalQuantity(lines);
        if (have < minQty) {
            return { ok: false, error: `هذا الكود يتطلّب ${minQty} قطعة على الأقل من المنتجات المشمولة` };
        }
    }

    // 🎁 عرض «اشترِ N خذ M» بلا أسطر لا يُحسب أصلاً — يُرفض هنا بدل أن
    //    يمرّ ويُنتج خصم صفر صامتاً.
    if (promo.type === 'bogo') {
        const buy  = Math.max(1, Number(promo.bogo && promo.bogo.buyQuantity)  || 1);
        const free = Math.max(1, Number(promo.bogo && promo.bogo.freeQuantity) || 1);
        if (!Array.isArray(items)) {
            return { ok: false, error: 'هذا الكود يُستخدم على منتجات المتجر فقط' };
        }
        if (totalQuantity(lines) < buy + free) {
            return { ok: false, error: `اشترِ ${buy + free} قطع من المنتجات المشمولة لتحصل على ${free} مجاناً` };
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
function computeDiscount(promo, { productsTotal = 0, deliveryFee = 0, fullOrderValue = 0, items }) {
    const scope = promo.appliesTo || 'total';

    // 🎁 عرض «اشترِ N خذ M» لا يمرّ بحساب النسبة/المبلغ إطلاقاً: قيمته هي
    //    أسعار القطع الممجَّنة نفسها، فلا معنى لـ value ولا لـ maxDiscount.
    if (promo.type === 'bogo') {
        const lines = eligibleLines(promo, items);
        const discount = computeBogoDiscount(promo, lines);
        return { discount, scope: 'products' };
    }

    let base;
    if (scope === 'products') {
        // 📦 الكود المحصور بمنتجات يُحسب من أسطرها وحدها. بلا هذا كان
        //    «خصم ٥٠٪ على العصير» يخصم نصف قيمة الوجبات معه.
        const onlyProducts = Array.isArray(promo.products) ? promo.products : [];
        base = (onlyProducts.length > 0 && Array.isArray(items))
            ? linesTotal(eligibleLines(promo, items))
            : Number(productsTotal);

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

module.exports = {
    validatePromo,
    computeDiscount,
    // مُصدَّرة للاختبار ولمسارات تحتاج المؤهَّل وحده
    eligibleLines,
    totalQuantity,
    linesTotal,
    computeBogoDiscount
};
