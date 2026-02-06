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
        // ضفنا هنا الأنواع الجديدة عشان يقبلها (order_accepted, order_completed)
        enum: ['system', 'order_accepted', 'order_completed', 'order_update', 'chat'],
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

module.exports = mongoose.model('Notification', NotificationSchema);