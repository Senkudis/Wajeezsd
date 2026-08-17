const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendPush } = require('./firebasePush');
const logger = require('./logger');

// الأنواع المقبولة في المخطّط — تُقرأ منه مباشرة فلا تتباعد النسختان
const ALLOWED_TYPES = new Set(Notification.schema.path('type').enumValues);

/**
 * يضمن أن النوع موجود في المخطّط، وإلا هبط إلى بديل صالح مع صرخة في السجلّ.
 *
 * ⚠️ هذا ليس احتياطاً نظرياً. نوعٌ خارج الـ enum يجعل `create`/`insertMany` يرمي
 * خطأ تحقّق يبتلعه try/catch الخارجي، فيسقط الإشعار كاملاً وبصمت: لا سجل، ولا
 * socket، ولا دفعة FCM. حدث هذا فعلاً في notifyAdmins — الذي كان بلا حارس —
 * فلم يصل الإدارة أيّ تنبيه من أنواع admin_order_alert وmerchant_request
 * وsettlement_request وlegacy_order منذ إطلاق النظام، بينما كانت إشعارات
 * الكباتن تصل لأن sendNotification وحده كان يحمل هذا الحارس.
 *
 * @param {string} type النوع المطلوب
 * @param {string} fallback بديل صالح إن لم يكن معروفاً
 * @param {object} ctx بيانات للسجلّ تساعد على تحديد مصدر النوع المجهول
 */
function safeNotificationType(type, fallback, ctx) {
    const wanted = type || fallback;
    if (ALLOWED_TYPES.has(wanted)) return wanted;

    logger.error(
        Object.assign({ invalidType: wanted, fallback }, ctx || {}),
        'Notification type not in schema enum — delivered as fallback. Add it to models/Notification.js and utils/pushRouting.js'
    );
    return fallback;
}

/**
 * دالة مساعدة لإرسال الإشعارات وحفظها
 * تدعم: حفظ في DB + Socket.IO (داخل التطبيق) + FCM Push (خارج التطبيق)
 * @param {Object} app - تطبيق Express للحصول على io
 * @param {Object} data - بيانات الإشعار (userId, title, message, type, relatedId)
 */
const sendNotification = async (app, { userId, title, message, type, relatedId }) => {
    try {
        const safeType = safeNotificationType(type, 'system', { userId, title });

        // 1. حفظ في قاعدة البيانات
        const notification = await Notification.create({
            user: userId,
            title,
            message,
            type: safeType,
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

        // 🛡️ نفس حارس sendNotification — غيابه هنا هو سبب ضياع كل تنبيهات
        // الإدارة السابقة (انظر safeNotificationType)
        const safeType = safeNotificationType(type, 'admin_alert', { title, scope: 'notifyAdmins' });

        // 1. حفظ إشعار لكل أدمن (سجلّ دائم يُحمَّل عند فتح اللوحة)
        const docs = admins.map(a => ({
            user: a._id, title, message,
            type: safeType, relatedId, isRead: false
        }));
        // ⚠️ كل قناة في بلوك مستقل. كانت الثلاث في بلوك واحد، فأي فشل في الكتابة
        // يقفز فوق البثّ والدفعة معاً — وتنبيه الإدارة حسّاس للوقت: خسارته لأن
        // قاعدة البيانات تعثّرت لحظةً أسوأ من خسارة سجلّه.
        try {
            // ordered:false — سجلٌّ واحد معطوب لا يمنع بقية الأدمن من تلقّي التنبيه
            await Notification.insertMany(docs, { ordered: false });
        } catch (dbErr) {
            logger.error({ err: dbErr, type: safeType }, 'notifyAdmins: تعذّر حفظ سجل الإشعار — يستمر البثّ والدفعة');
        }

        // 2. socket فوري لغرفة الأدمن (تظهر مباشرة في اللوحة المفتوحة)
        try {
            const io = app.get('io');
            if (io) {
                io.to('admin_room').emit('new_notification', { title, message, type: safeType, relatedId });
            }
        } catch (ioErr) {
            logger.error({ err: ioErr }, 'notifyAdmins socket failed (non-critical)');
        }

        // 3. FCM push لكل الأدمن بقناة الأدمن المميّزة (حتى لو اللوحة مغلقة)
        try {
            const { sendAdminPushToMany } = require('./firebasePush');
            const tokens = admins.map(a => a.fcmToken).filter(t => t && t.length > 10);
            if (!tokens.length) {
                // بلا هذا السطر يبدو الصمت كأن الدفعة أُرسلت ونجحت
                logger.warn({ adminCount: admins.length, type: safeType }, 'notifyAdmins: لا يوجد أي أدمن بتوكن FCM — لن تصل دفعة');
            } else {
                // 🧭 وجهة النقرة لدور الأدمن
                const { resolvePushUrl } = require('./pushRouting');
                await sendAdminPushToMany(tokens, title, message, {
                    type: safeType,
                    url: resolvePushUrl('admin', safeType, relatedId),
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
