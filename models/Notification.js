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
    type: {
        type: String,
        enum: [
            'system',
            'order_accepted', 'order_completed', 'order_update',
            'chat', 'chat_message',
            // 🛍️ Shop order notifications
            'shop_order_update', 'new_shop_order',
            'payment_receipt', 'payment_confirmed', 'payment_reminder',
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