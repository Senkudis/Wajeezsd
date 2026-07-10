const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendPush } = require('./firebasePush');
const logger = require('./logger');

/**
 * دالة مساعدة لإرسال الإشعارات وحفظها
 * تدعم: حفظ في DB + Socket.IO (داخل التطبيق) + FCM Push (خارج التطبيق)
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

        // 2. إرسال عبر Socket.io (للمستخدم المتصل حالياً)
        const io = app.get('io');
        if (io) {
            io.to(userId.toString()).emit('new_notification', notification);
            logger.debug({ type, userId }, 'Notification sent to user');
        }

        // 3. إرسال FCM Push (للمستخدم حتى لو التطبيق مغلق)
        try {
            const user = await User.findById(userId).select('fcmToken role');
            if (user && user.fcmToken) {
                // 🧭 حساب وجهة النقرة حسب دور المستقبِل — النوع وحده لا يكفي
                // (order_update مثلاً يصل لعميل وكابتن وتاجر، ولكلٍّ صفحته)
                const { resolvePushUrl } = require('./pushRouting');
                const targetUrl = resolvePushUrl(user.role, type || 'system', relatedId);

                await sendPush(user.fcmToken, title, message, {
                    type: type || 'system',
                    url: targetUrl,
                    relatedId: relatedId ? relatedId.toString() : '',
                    // ✅ Deep-link fix: the click handlers (service-worker.js, native-notifications.js)
                    // read data.orderId to build the target URL — without this, tapping a push
                    // notification opened the correct page but never the specific order/record.
                    orderId: relatedId ? relatedId.toString() : '',
                    notificationId: notification._id.toString()
                });
            }
        } catch (pushErr) {
            logger.error({ err: pushErr }, 'FCM push failed (non-critical)');
        }

        return notification;
    } catch (error) {
        logger.error({ err: error }, 'Error in sendNotification helper');
    }
};

/**
 * إشعار كل الأدمن بحدث مهم — يحفظ إشعاراً لكل أدمن (سجلّ دائم) + socket فوري + FCM push.
 * يعالج مشكلة "خانة الإشعارات صنم": الإشعارات تُحفظ فتظهر عند فتح اللوحة وتبقى بعد التحديث.
 * @param {Object} app
 * @param {Object} data - { title, message, type, relatedId }
 */
const notifyAdmins = async (app, { title, message, type, relatedId }) => {
    try {
        const admins = await User.find({ role: 'admin' }).select('_id fcmToken');
        if (!admins.length) return;

        // 1. حفظ إشعار لكل أدمن (سجلّ دائم يُحمَّل عند فتح اللوحة)
        const docs = admins.map(a => ({
            user: a._id, title, message,
            type: type || 'admin_alert', relatedId, isRead: false
        }));
        await Notification.insertMany(docs);

        // 2. socket فوري لغرفة الأدمن (تظهر مباشرة في اللوحة المفتوحة)
        const io = app.get('io');
        if (io) {
            io.to('admin_room').emit('new_notification', { title, message, type: type || 'admin_alert', relatedId });
        }

        // 3. FCM push لكل الأدمن بقناة الأدمن المميّزة (حتى لو اللوحة مغلقة)
        try {
            const { sendAdminPushToMany } = require('./firebasePush');
            const tokens = admins.map(a => a.fcmToken).filter(t => t && t.length > 10);
            if (tokens.length) {
                // 🧭 وجهة النقرة لدور الأدمن
                const { resolvePushUrl } = require('./pushRouting');
                await sendAdminPushToMany(tokens, title, message, {
                    type: type || 'admin_alert',
                    url: resolvePushUrl('admin', type || 'admin_alert', relatedId),
                    relatedId: relatedId ? relatedId.toString() : '',
                    orderId: relatedId ? relatedId.toString() : ''
                });
            }
        } catch (pushErr) {
            logger.error({ err: pushErr }, 'notifyAdmins push failed (non-critical)');
        }
    } catch (error) {
        logger.error({ err: error }, 'Error in notifyAdmins helper');
    }
};

module.exports = { sendNotification, notifyAdmins };
