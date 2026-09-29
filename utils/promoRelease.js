/**
 * 🎟️ إعادة الكوبون حين يُلغى الطلب قبل أن يكتمل.
 *
 * الاستخدام يُسجَّل لحظة **إنشاء** الطلب (usedCount + سطرٌ في usedBy)، ولم
 * يكن شيءٌ يعيده عند الإلغاء. فعميلٌ استعمل كوبوناً لمرّة واحدة ثم ألغى
 * قبل أن يقبل أحدٌ طلبه — أو ألغاه النظام بعد ستّ ساعات بلا كابتن — خسر
 * الكوبون ولم يستفد منه شيئاً، ونقص الحدّ العام بلا طلبٍ حقيقيّ.
 *
 * آمنٌ للتكرار: الشرط أن يكون الطلب ما زال في usedBy، فالاستدعاء الثاني لا
 * يجد شيئاً ولا ينقص العدّاد مرّتين. ولا يرمي — فشل الإعادة لا يُفشل الإلغاء.
 *
 * @param {Array<string|ObjectId>} orderIds معرّفات Order أو ShopOrder
 */
const logger = require('./logger');

async function releasePromoUsage(orderIds) {
    const PromoCode = require('../models/PromoCode');
    const ids = (orderIds || []).filter(Boolean);
    let released = 0;
    for (const orderId of ids) {
        try {
            const r = await PromoCode.updateOne(
                { 'usedBy.orderId': orderId, usedCount: { $gt: 0 } },
                { $inc: { usedCount: -1 }, $pull: { usedBy: { orderId } } }
            );
            if (r.modifiedCount) {
                released++;
                logger.info({ orderId: String(orderId) }, 'Promo usage released on cancellation');
            }
        } catch (err) {
            logger.warn({ err: err.message, orderId: String(orderId) }, 'Promo release failed (non-critical)');
        }
    }
    return released;
}

module.exports = { releasePromoUsage };
