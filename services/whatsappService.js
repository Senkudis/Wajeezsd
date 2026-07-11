const axios = require('axios');
const logger = require('../utils/logger');

// ✅ يقرأ من .env — غيّر WHATSAPP_BOT_URL في السيرفر لرابط Render
const BOT_API_URL = process.env.WHATSAPP_BOT_URL || 'http://localhost:3000';
const BOT_API_KEY = process.env.WHATSAPP_API_KEY || 'scrt_whatsapp_api_key_2026';

// Configure Axios instance
const botApi = axios.create({
    baseURL: BOT_API_URL,
    timeout: 15000, // 15 ثانية timeout
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': BOT_API_KEY
    }
});

/**
 * Send OTP Message via WhatsApp
 * @param {string} phone - The user's phone number
 * @param {string} message - The message content (containing the OTP)
 */
const sendWhatsAppOTP = async (phone, message) => {
    try {
        const response = await botApi.post('/send-message', {
            number: phone,
            message: message
        });
        logger.info({ phone }, 'WhatsApp OTP sent');
        return response.data;
    } catch (error) {
        logger.error({ err: error.message }, 'WhatsApp OTP send error');
        // We generally don't want to crash the main app if bot is down, 
        // so we might return null or false, or rethrow depending on strictness.
        return null;
    }
};

const mongoose = require('mongoose');

/**
 * Send Notification via WhatsApp
 * @param {string} phone - The user's phone number (Real Phone)
 * @param {string} message - The notification content
 */
const sendWhatsAppNotification = async (phone, message) => {
    try {
        let targetId = phone; // Default fallback

        // 1. Try to find the correct WhatsApp ID from subscriptions
        // We use mongoose.connection directly since we don't have a separated Subscription model file yet
        if (mongoose.connection.readyState === 1) {
            const subscription = await mongoose.connection.db.collection('subscriptions').findOne({ phone: phone });

            if (subscription && subscription.whatsappId) {
                targetId = subscription.whatsappId;
                logger.debug({ phone, targetId }, 'Resolved WhatsApp ID from subscription');
            } else {
                logger.debug({ phone }, 'No subscription found, using phone as fallback');
            }
        }

        // 2. Send using the Resolved Target ID
        const response = await botApi.post('/send-notification', {
            phone: targetId,
            message: message
        });
        logger.info({ targetId, phone }, 'WhatsApp notification sent');
        return response.data;
    } catch (error) {
        logger.error({ err: error.message }, 'WhatsApp notification send error');
        return null;
    }
};

module.exports = {
    sendWhatsAppOTP,
    sendWhatsAppNotification
};
