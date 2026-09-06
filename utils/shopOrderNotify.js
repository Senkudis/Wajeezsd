const logger = require('./logger');

/**
 * 🏪 إبلاغ التاجر بتقدّم طلب متجره.
 *
 * العطل الذي وُضع هذا الملف لسدّه: دورة حياة طلب المتجر كانت تُبلّغ العميل
 * والكابتن والإدارة عند كل خطوة — إسناد الكابتن، الاستلام، التسليم — ولا
 * تُبلّغ **التاجر** في أيٍّ منها. كانت نقاط المزامنة تكتب حالة ShopOrder
 * (`captain_assigned` ثم `picked_up`) وتمضي، فلا إشعار يصل ولا شاشة طلبات
 * التاجر تتحرّك: يرى التاجر الطلب مرّة عند وصوله ثم ينقطع عنه الخبر تماماً.
 *
 * لماذا هنا لا داخل المسارات: النقاط ثلاث ومتباعدة في routes/orders.js،
 * وكلٌّ منها يحتاج نفس الخطوات (جلب ShopOrder ⇒ جلب Place ⇒ ownerId ⇒ إشعار
 * + socket). تكرارها ثلاثاً هو ما يجعل رابعةً تُنسى.
 *
 * ⚠️ لا يرمي أبداً: فشلُ إشعارٍ لا يجوز أن يُفشل استلاماً أو تسليماً — الحدث
 *    الأصلي أهمّ من الإخبار به.
 */
async function notifyMerchantOfShopOrder(app, { shopOrderId, title, message, type = 'shop_order_update', socketEvent = 'merchant_order_update', socketPayload = {} }) {
    try {
        if (!shopOrderId) return;

        const ShopOrder = require('../models/ShopOrder');
        const Place = require('../models/Place');

        const shopOrder = await ShopOrder.findById(shopOrderId).select('place status').lean();
        if (!shopOrder || !shopOrder.place) return;

        const place = await Place.findById(shopOrder.place).select('ownerId').lean();
        if (!place || !place.ownerId) return;

        const io = app.get('io');
        if (io) {
            io.to(place.ownerId.toString()).emit(socketEvent, {
                orderId: String(shopOrder._id),
                status: shopOrder.status,
                ...socketPayload
            });
        }

        const { sendNotification } = require('./notificationHelper');
        await sendNotification(app, {
            userId: place.ownerId,
            title,
            message,
            type,
            relatedId: shopOrder._id
        });
    } catch (err) {
        logger.error({ err: err.message, shopOrderId }, 'notifyMerchantOfShopOrder failed');
    }
}

module.exports = { notifyMerchantOfShopOrder };
