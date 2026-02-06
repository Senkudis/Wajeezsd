const Notification = require('../models/Notification');

/**
 * دالة مساعدة لإرسال الإشعارات وحفظها
 * @param {Object} app - تطبيق Express للحصول على io
 * @param {Object} data - بيانات الإشعار (userId, title, message, type, relatedId)
 */
const sendNotification = async (app, { userId, title, message, type, relatedId }) => {
    try {
        // 1. حفظ في قاعدة البيانات
        const notification = await Notification.create({
            user: userId,
            title,
            message,
            type: type || 'system',
            relatedId,
            isRead: false
        });

        // 2. إرسال عبر Socket.io
        const io = app.get('io');
        if (io) {
            io.to(userId.toString()).emit('new_notification', notification);
            console.log(`🔔 Notification [${type}] sent to user ${userId}`);
        }

        return notification;
    } catch (error) {
        console.error('❌ Error in sendNotification helper:', error.message);
    }
};

module.exports = { sendNotification };
