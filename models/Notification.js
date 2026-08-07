const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: { // تأكدنا أن الاسم هنا message
        type: String,
        required: true
    },
    // ⚠️ أي نوع خارج هذه القائمة يُسقِط الإشعار بالكامل: sendNotification يبدأ
    // بـ Notification.create، فيرمي validation error يبتلعه try/catch الخارجي —
    // فلا يُحفظ سجل، ولا يُبثّ socket، ولا تُرسل دفعة FCM. الصمت تام.
    // أي نوع جديد يُستخدم في الكود يجب أن يُضاف هنا وفي utils/pushRouting.js.
    type: {
        type: String,
        enum: [
            'system',
            'order_accepted', 'order_completed', 'order_update',
            'chat', 'chat_message',
            // 📦 دورة حياة الطلب
            'order_searching', 'order_delayed', 'order_cancelled', 'order_expired',
            'errand_quote',
            // 💬 طلب رأي العميل بعد أول توصيلة
            'feedback_request',
            // 🛍️ Shop order notifications
            'shop_order_update', 'new_shop_order', 'shop_order',
            'payment_receipt', 'payment_confirmed', 'payment_reminder',
            // 💰 المحفظة والمدفوعات والتسويات
            'wallet_update', 'payment_request', 'payment_approved', 'payment_rejected',
            'settlement_approved', 'settlement_rejected', 'shop_ledger',
            // 🏪 التاجر
            'low_stock', 'tier_change',
            // 🚚 عروض الكابتن
            'offer_expired', 'offer_expiry_reminder', 'negotiation_accepted',
            // 🚨 Emergency SOS
            'emergency'
        ],
        default: 'system'
    },
    relatedId: { // حقل اختياري لربط الإشعار بالطلب
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 🚀 Performance Index
NotificationSchema.index({ user: 1, createdAt: -1 });
// 🔑 Compound index for upsert deduplication: one unread chat_message per (user, relatedId)
NotificationSchema.index({ user: 1, type: 1, relatedId: 1, isRead: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);