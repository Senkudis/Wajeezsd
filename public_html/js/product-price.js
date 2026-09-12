/**
 * 💸 السعر الفعّال للمنتج — نسخة الواجهة من utils/productPricing.js.
 *
 * القواعد نفسها حرفياً: تخفيضٌ صالح يجب أن يكون رقماً ≥ 0 وأقل من السعر
 * الأصلي، وداخل نافذته الزمنية إن وُجدت. أي افتراقٍ عن الخادم يعني سعراً
 * معروضاً لا يساوي السعر المحسوب — وهو ما وقع فعلاً في نقطة البيع: الشاشة
 * تعرض السعر الأصلي بينما التخفيض ساري.
 *
 * ⚠️ الخادم وحده يقرّر السعر المحصَّل. هذه للعرض والحساب المبدئي فقط.
 */
(function () {
    'use strict';

    /**
     * @param {object} product منتج فيه price/salePrice/saleStartsAt/saleEndsAt
     * @param {Date}   [now]
     * @returns {{price:number, listPrice:number, onSale:boolean, percent:number}}
     */
    function effectivePrice(product, now) {
        now = now || new Date();
        var listPrice = Number(product && product.price) || 0;
        var raw = product ? product.salePrice : null;
        var sale = Number(raw);

        var onSale = raw !== null && raw !== undefined && raw !== ''
            && isFinite(sale) && sale >= 0 && sale < listPrice;

        if (onSale) {
            var t = now.getTime();
            if (product.saleStartsAt && t < new Date(product.saleStartsAt).getTime()) onSale = false;
            if (onSale && product.saleEndsAt && t > new Date(product.saleEndsAt).getTime()) onSale = false;
        }

        var price = onSale ? sale : listPrice;
        var percent = (onSale && listPrice > 0) ? Math.round((1 - price / listPrice) * 100) : 0;

        return { price: price, listPrice: listPrice, onSale: onSale, percent: percent };
    }

    /** السعر الذي يُحسب به فعلاً — اختصارٌ لأكثر الاستعمالات. */
    function priceOf(product, now) {
        return effectivePrice(product, now).price;
    }

    window.ProductPrice = { effective: effectivePrice, priceOf: priceOf };
})();
