/**
 * POST /api/beacon
 * Endpoint خاص لـ navigator.sendBeacon — يقبل _token في الـ body بدل Authorization header.
 * sendBeacon لا يدعم custom headers، لذا البديل هو إرسال التوكن في الـ body.
 */
const express = require('express');
const router = express.Router();
const { verifySocketToken } = require('../utils/socketAuth');
const { authorizeChatMessage } = require('../utils/chatAuth');
const logger = require('../utils/logger');
const Message = require('../models/Message');
const User = require('../models/User');
const Order = require('../models/Order');
const ShopOrder = require('../models/ShopOrder');

router.post('/', async (req, res) => {
    try {
        // ContentType من sendBeacon: 'application/json' أو 'text/plain'
        // لو وصل كـ text نحوّله manually
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (_) { body = {}; }
        }

        const { receiver, order, tempId, _token } = body;
        let { text } = body;

        if (!_token || !receiver || !order || !text) {
            return res.status(400).json({ message: 'بيانات ناقصة' });
        }

        // 🔒 المرسِل يُشتق من التوكن الموقّع حصراً (نفس منطق السوكت، مع دعم LEGACY)
        const decoded = verifySocketToken(_token);
        if (!decoded || !decoded.userId) {
            return res.status(401).json({ message: 'توكن غير صالح' });
        }
        // التوكنات المقيّدة (upload_only) لا تُرسل رسائل
        if (decoded.scope && decoded.scope !== 'full') {
            return res.status(403).json({ message: 'توكن مقيّد' });
        }
        const sender = String(decoded.userId).trim();

        // ✅ حدّ الطول — مطابقة لـ POST /api/chat (كان غائباً تماماً هنا)
        if (typeof text !== 'string') {
            return res.status(400).json({ message: 'نص غير صالح' });
        }
        if (text.length > 1000) {
            return res.status(400).json({ message: 'الرسالة طويلة جداً (الحد الأقصى 1000 حرف)' });
        }

        // 🔒 التفويض: كان /api/beacon يحفظ أي رسالة لأي مستخدم بلا أي فحص.
        // الآن نفس فحوصات send_message وPOST /api/chat: طرفا الطلب، الحجب، الإغلاق.
        const authz = await authorizeChatMessage(
            { sender, receiver, order },
            { User, Order, ShopOrder }
        );
        if (!authz.ok) {
            return res.status(authz.status || 403).json({ message: authz.error });
        }

        // التحقق من أن الرسالة لم تُحفظ مسبقاً (منع التكرار إذا جاء sendBeacon بعد Socket ACK)
        if (tempId) {
            const existing = await Message.findOne({ tempId });
            if (existing) {
                logger.info(`[Beacon] Message with tempId=${tempId} already saved, skipping.`);
                return res.status(200).json({ message: 'already saved' });
            }
        }

        const mongoose = require('mongoose');
        const orderDocId = mongoose.Types.ObjectId.isValid(order)
            ? new mongoose.Types.ObjectId(order) : order;

        await Message.create({
            sender, receiver, order: orderDocId,
            text, tempId: tempId || null, isRead: false
        });

        logger.info(`[Beacon] Message saved via sendBeacon: sender=${sender}, order=${order}`);
        res.status(200).json({ message: 'ok' });

    } catch (err) {
        logger.error('[Beacon] Error:', err.message);
        res.status(500).json({ message: 'خطأ في السيرفر' });
    }
});

module.exports = router;
