/**
 * 🙋 طلب تنازل الكابتن — الطلب والقرار وإعادة البثّ.
 *
 * الكابتن يطلب بسببٍ مكتوب (PUT /api/orders/:id/release)، والطلب يبقى معه.
 * الإدارة تقبل (PUT /api/admin/orders/:id/release/approve) فيعود متاحاً
 * ويُبلَّغ الكباتن المؤهّلون، أو ترفض (…/reject) فيُبلَّغ بأن يُكمل.
 */
const Order = require('../models/Order');
const User = require('../models/User');
const logger = require('./logger');

const REASON_MIN = 5;
const REASON_MAX = 300;
/** أقصى طلبات تنازلٍ للكابتن نفسه على الطلب نفسه — الرفض لا يُفتح بلا نهاية */
const MAX_REQUESTS_PER_ORDER = 3;

function cleanReason(v) {
    if (typeof v !== 'string') return '';
    return v.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, REASON_MAX);
}

/** ما يُصفَّر حين يعود الطلب للسوق — من يقبل بعده يبدأ نظيفاً */
const CLEAN_SLATE = {
    status: 'pending', captain: null,
    captainNudges: [],
    captainAssignedAt: null,
    'errand.goodsQuote': null,
    'errand.quoteStatus': 'none',
    'errand.quotedAt': null,
    'errand.reminderSentAt': null,
    'errand.respondedAt': null,
    'errand.finalGoodsCost': null
};

/**
 * يُعيد بثّ الطلب لكباتن مدينته **المؤهّلين**: معتمدون، نشطون، غير محظورين
 * (تجاوز حدّ الديون)، متاحون للعمل — لا الكابتن الذي تنازل. كان البثّ لكل
 * كابتنٍ نشطٍ بتوكن، فيصل المعلّق والمحظور إشعارٌ بطلبٍ لا يستطيع قبوله.
 */
async function rebroadcast(app, order, excludeCaptainId) {
    try {
        const io = app.get('io');
        const captains = await User.find({
            role: 'captain',
            city: order.city,
            approvalStatus: 'approved',
            isActive: true,
            is_blocked: { $ne: true },
            isAvailableForWork: true,
            fcmToken: { $exists: true, $ne: null },
            _id: { $ne: excludeCaptainId }
        }).select('fcmToken').lean();

        const kind = order.orderType === 'shop' ? 'طلب متجر' : order.orderType === 'errand' ? 'طلب شراء' : 'طلب توصيل';
        const tokens = captains.map(c => c.fcmToken).filter(Boolean);
        if (tokens.length) {
            const { sendPushToMany } = require('./firebasePush');
            await sendPushToMany(tokens, `${kind} متاح من جديد`,
                `عاد ${kind} للكباتن بسعر ${order.price} ج.س — سارع بقبوله.`,
                {
                    type: order.orderType === 'shop' ? 'shop_order' : order.orderType === 'errand' ? 'errand' : 'new_order',
                    orderId: String(order._id),
                    url: `/captain-orders.html?highlight=${order._id}`
                });
        }
        if (io && order.city) {
            io.to(`room_${order.city}`).emit(order.orderType === 'shop' ? 'shop_order_available' : 'new_order_available', {
                orderId: order._id,
                shopName: order.shopName || '',
                pickup: order.pickup ? order.pickup.address : '',
                price: order.price,
                city: order.city
            });
        }
        return tokens.length;
    } catch (err) {
        logger.error({ err: err.message }, 'rebroadcast released order failed');
        return 0;
    }
}

module.exports = { REASON_MIN, REASON_MAX, MAX_REQUESTS_PER_ORDER, cleanReason, CLEAN_SLATE, rebroadcast };
