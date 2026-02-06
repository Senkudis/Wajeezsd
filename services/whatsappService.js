const axios = require('axios');

const BOT_API_URL = 'http://localhost:3000';

// Configure Axios instance
const botApi = axios.create({
    baseURL: BOT_API_URL,
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'scrt_whatsapp_api_key_2026' // API Key from bot .env
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
        console.log(`✅ MongoDB-Bot: OTP sent to ${phone}`);
        return response.data;
    } catch (error) {
        console.error(`❌ MongoDB-Bot Error (OTP):`, error.message);
        // We generally don't want to crash the main app if bot is down, 
        // so we might return null or false, or rethrow depending on strictness.
        return null;
    }
};

/**
 * Send Notification via WhatsApp
 * @param {string} phone - The user's phone number
 * @param {string} message - The notification content
 */
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
                console.log(`✅ MongoDB-Bot: Resolved ${phone} -> ${targetId}`);
            } else {
                console.log(`⚠️ MongoDB-Bot: No subscription found for ${phone}, trying fallback to phone.`);
                // Fallback for legacy or direct @c.us usage
                // If it's a normalized number 249..., appended @c.us usually works if they don't have LID enabled
            }
        }

        // 2. Send using the Resolved Target ID
        const response = await botApi.post('/send-notification', {
            phone: targetId,
            message: message
        });
        console.log(`✅ MongoDB-Bot: Notification sent to ${targetId} (User: ${phone})`);
        return response.data;
    } catch (error) {
        console.error(`❌ MongoDB-Bot Error (Notification):`, error.message);
        return null;
    }
};

module.exports = {
    sendWhatsAppOTP,
    sendWhatsAppNotification
};
