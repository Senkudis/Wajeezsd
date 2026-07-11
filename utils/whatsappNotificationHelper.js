const { sendWhatsAppNotification } = require('../services/whatsappService');
const User = require('../models/User');
const axios = require('axios');
const logger = require('./logger');

// مسار البوت المحلي (للتطوير) أو من متغير البيئة (للإنتاج)
const BOT_API_URL = process.env.WHATSAPP_BOT_URL || 'http://localhost:3000';
const BOT_API_KEY = 'scrt_whatsapp_api_key_2026';

/**
 * التحقق من اشتراك المستخدم في البوت
 */
async function checkBotSubscription(phone) {
    try {
        const response = await axios.get(`${BOT_API_URL}/check-subscription/${phone}`, {
            headers: { 'x-api-key': BOT_API_KEY }
        });
        return response.data.subscribed === true;
    } catch (error) {
        logger.info(`⚠️ Could not check subscription for ${phone}`);
        return false;
    }
}

/**
 * إرسال إشعار WhatsApp للمستخدم إذا كان مشتركاً
 * @param {string} userId - معرف المستخدم
 * @param {string} message - نص الرسالة
 */
async function sendWhatsAppIfSubscribed(userId, message) {
    try {
        const user = await User.findById(userId);

        if (!user) {
            logger.info(`⚠️ User ${userId} not found`);
            return false;
        }

        // التحقق من وجود رقم هاتف
        if (!user.phone) {
            logger.info(`⚠️ User ${user.name} has no phone number`);
            return false;
        }

        // التحقق من الاشتراك في البوت
        const isSubscribed = await checkBotSubscription(user.phone);

        if (!isSubscribed) {
            logger.info(`ℹ️ User ${user.name} (${user.phone}) is not subscribed. Ask them to send "اشتراك" to WhatsApp bot.`);
            return false;
        }

        // إرسال الرسالة
        const result = await sendWhatsAppNotification(user.phone, message);

        if (result) {
            logger.info(`✅ WhatsApp sent to ${user.name} (${user.phone})`);
            return true;
        } else {
            logger.info(`❌ Failed to send WhatsApp to ${user.name}`);
            return false;
        }
    } catch (error) {
        logger.error(`❌ WhatsApp Helper Error:`, error.message);
        return false;
    }
}

/**
 * رسائل WhatsApp للطلبات
 */
const OrderMessages = {
    // عند قبول الطلب من الكابتن
    orderAccepted: (captainName, orderId) =>
        `🎉 *تم قبول طلبك!*\n\nالكابتن *${captainName}* وافق على طلبك #${orderId.slice(-6)} وهو في الطريق إليك الآن.\n\nشكراً لاستخدامك وجيز 🚗`,

    // عند استلام الطلب من موقع الاستلام
    orderPickedUp: (captainName, orderId) =>
        `📦 *تم استلام الطلب*\n\nالكابتن *${captainName}* استلم طلبك #${orderId.slice(-6)} وهو الآن في طريقه للتوصيل.\n\nوجيز 🚗`,

    // عند التوصيل
    orderDelivered: (orderId) =>
        `✅ *تم التوصيل بنجاح!*\n\nتم توصيل طلبك #${orderId.slice(-6)} بنجاح.\n\nشكراً لاستخدامك وجيز! لا تنسى تقييم الكابتن ⭐\n\nوجيز 🚗`,

    // للكابتن عند تعيين طلب له
    captainAssigned: (clientName, orderId, pickup, dropoff, price) =>
        `🚀 *طلب جديد!*\n\nالعميل: *${clientName}*\nرقم الطلب: #${orderId.slice(-6)}\n\n📍 من: ${pickup}\n🏁 إلى: ${dropoff}\n\n💰 المبلغ: ${price} ج.س\n\nوجيز 🚗`,

    // عند إلغاء الطلب
    orderCancelled: (orderId) =>
        `⚠️ *تم إلغاء الطلب*\n\nتم إلغاء الطلب #${orderId.slice(-6)}.\n\nوجيز 🚗`
};

module.exports = {
    sendWhatsAppIfSubscribed,
    OrderMessages
};
