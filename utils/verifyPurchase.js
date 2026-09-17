/**
 * 🧾 التحقّق من أن المُقيِّم اشترى فعلاً.
 *
 * العطل: مسارا تقييم المتجر والمنتج كانا يقبلان `orderId` **اختيارياً** ولا
 * يتحقّقان منه إطلاقاً — لا مِلكية، ولا ارتباطاً بالمتجر، ولا تسليماً.
 *
 * وفحصُ التكرار الوحيد كان مقيّداً بـ `client: req.user._id`، فيكفي أن
 * يُمرّر المستخدم معرّفاً عشوائياً في كل مرّة ليمرّ الفحص ويُنشأ تقييمٌ
 * جديد. أي أن أي حسابٍ يستطيع رفع متجرٍ أو خفضه بلا حدّ، بلا أن يطلب منه
 * مرّةً واحدة — ونجومُ المتجر تُحسب من هذه التقييمات مباشرة.
 *
 * القاعدة الآن: لا تقييم بلا طلبٍ **مُسلَّم** يخصّ المُقيِّم ويخصّ المتجر.
 */

/**
 * @returns {{ok: true, order: object} | {ok: false, status: number, message: string}}
 */
async function verifyShopPurchase({ clientId, placeId, orderId, productId = null }) {
    const mongoose = require('mongoose');
    const ShopOrder = require('../models/ShopOrder');

    if (!orderId || !mongoose.Types.ObjectId.isValid(String(orderId))) {
        return { ok: false, status: 400, message: 'التقييم متاح بعد استلام طلبك من هذا المتجر.' };
    }

    // المِلكية والمتجر في الاستعلام نفسه: لا يكفي وجود الطلب، بل أن يكون
    // **طلبَه هو** من **هذا المتجر**.
    const order = await ShopOrder.findOne({
        _id: orderId,
        client: clientId,
        place: placeId
    }).select('status items').lean();

    if (!order) {
        return { ok: false, status: 403, message: 'لا يمكنك تقييم متجرٍ لم تطلب منه.' };
    }

    if (order.status !== 'delivered') {
        return { ok: false, status: 400, message: 'يمكنك التقييم بعد اكتمال التوصيل.' };
    }

    // تقييم منتج: لا بدّ أن يكون ضمن ما اشتراه في هذا الطلب
    if (productId) {
        const bought = (order.items || []).some(
            it => String(it.productId) === String(productId)
        );
        if (!bought) {
            return { ok: false, status: 403, message: 'لم تطلب هذا المنتج في هذه الطلبية.' };
        }
    }

    return { ok: true, order };
}

module.exports = { verifyShopPurchase };
