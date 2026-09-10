/**
 * 💸 السعر الفعّال للمنتج — مصدر واحد للحقيقة.
 *
 * لماذا دالة لا حقل محسوب: السعر الفعّال يعتمد على الوقت (نافذة العرض)، فأي
 * قيمة تُخزَّن تصير خاطئة بمرور الدقائق. والأهمّ أن ثلاثة مواضع تحتاج الجواب
 * نفسه — بناء الطلب في الخادم، وعرض البطاقة للعميل، وتقارير التاجر — ونسخةٌ
 * تفترق في أحدها تعني سعراً معروضاً لا يساوي السعر المحسوب.
 *
 * ⚠️ الخادم وحده يقرّر السعر. `routes/merchant.js` يجلب المنتج من القاعدة ولا
 * يثق بأي سعر يرسله العميل — هذه الدالة تُستدعى هناك، فالعرض والحساب من منبع
 * واحد ولا يمكن للعميل شراء منتج بسعر تخفيضٍ منتهٍ.
 */

/**
 * @param {object} product مستند Product (أو lean) — يكفي price/salePrice/saleStartsAt/saleEndsAt
 * @param {Date}   [now]   لحظة التقييم (تُمرَّر في الاختبارات)
 * @returns {{price:number, listPrice:number, onSale:boolean, percent:number}}
 *          price     = ما يدفعه العميل فعلاً
 *          listPrice = السعر قبل التخفيض (يُعرض مشطوباً)
 *          percent   = نسبة التخفيض مقرَّبة، صفر إن لا تخفيض
 */
function effectivePrice(product, now = new Date()) {
    const listPrice = Number(product && product.price) || 0;
    const raw = product ? product.salePrice : null;
    const sale = Number(raw);

    // شروط الصلاحية مجتمعة. تخفيضٌ مساوٍ للسعر أو أعلى منه ليس تخفيضاً —
    // يُتجاهل بهدوء بدل عرض «-0%» أو نسبة سالبة.
    let onSale = raw !== null && raw !== undefined && raw !== ''
        && Number.isFinite(sale) && sale >= 0 && sale < listPrice;

    if (onSale) {
        const t = now.getTime();
        if (product.saleStartsAt && t < new Date(product.saleStartsAt).getTime()) onSale = false;
        if (onSale && product.saleEndsAt && t > new Date(product.saleEndsAt).getTime()) onSale = false;
    }

    const price = onSale ? sale : listPrice;
    const percent = onSale && listPrice > 0
        ? Math.round((1 - price / listPrice) * 100)
        : 0;

    return { price, listPrice, onSale, percent };
}

/**
 * يُلحق حقول العرض بمنتج ذاهب إلى العميل، بلا تعديل السعر الأصلي.
 * الواجهة تقرأ effectivePrice/onSale/discountPercent ولا تعيد حساب شيء.
 */
function decorateProduct(product, now = new Date()) {
    const obj = (product && typeof product.toObject === 'function') ? product.toObject() : { ...product };
    const p = effectivePrice(obj, now);
    obj.effectivePrice = p.price;
    obj.listPrice = p.listPrice;
    obj.onSale = p.onSale;
    obj.discountPercent = p.percent;
    // التخفيض المنتهي أو غير المبدوء لا يُرسل إطلاقاً: إرساله يغري الواجهة
    // بعرضه، وهو ما لا يُحصَّل عند الطلب.
    if (!p.onSale) {
        obj.salePrice = null;
        obj.saleStartsAt = null;
        obj.saleEndsAt = null;
    }
    return obj;
}

/**
 * يتحقّق من حقول العرض القادمة من التاجر ويطبّعها.
 *
 * يعيش هنا لا في المسار لأن الإنشاء والتعديل يحتاجانه معاً — ونسخةٌ تفترق
 * تعني عرضاً يُرفض عند الإنشاء ويُقبل عند التعديل.
 *
 * @param {object} body   الحقول الواردة (salePrice/saleStartsAt/saleEndsAt)
 * @param {number} price  السعر الأصلي بعد التحقق منه
 * @returns {{ok:true, values:object}|{ok:false, error:string}}
 */
function validateSaleFields(body, price) {
    const values = {};
    const blank = (v) => v === null || v === undefined || v === '';

    if ('salePrice' in body) {
        if (blank(body.salePrice)) {
            // إلغاء العرض يمسح نافذته أيضاً — تواريخ معلّقة بلا سعر تُربك
            // الواجهة لاحقاً وتوحي بعرضٍ قادم لا وجود له.
            values.salePrice = null;
            values.saleStartsAt = null;
            values.saleEndsAt = null;
        } else {
            const sale = Number(body.salePrice);
            if (!Number.isFinite(sale) || sale < 0) {
                return { ok: false, error: 'سعر العرض يجب أن يكون رقماً موجباً أو صفراً' };
            }
            if (Number.isFinite(price) && sale >= price) {
                return { ok: false, error: 'سعر العرض يجب أن يكون أقل من السعر الأصلي' };
            }
            values.salePrice = sale;
        }
    }

    for (const key of ['saleStartsAt', 'saleEndsAt']) {
        if (!(key in body) || key in values) continue;
        if (blank(body[key])) { values[key] = null; continue; }
        const d = new Date(body[key]);
        if (isNaN(d.getTime())) {
            return { ok: false, error: 'تاريخ العرض غير صالح' };
        }
        values[key] = d;
    }

    if (values.saleStartsAt && values.saleEndsAt && values.saleEndsAt <= values.saleStartsAt) {
        return { ok: false, error: 'نهاية العرض يجب أن تكون بعد بدايته' };
    }

    return { ok: true, values };
}

module.exports = { effectivePrice, decorateProduct, validateSaleFields };
