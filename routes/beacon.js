/**
 * POST /api/beacon
 * Endpoint خاص لـ navigator.sendBeacon — يقبل _token في الـ body بدل Authorization header.
 * sendBeacon لا يدعم custom headers، لذا البديل هو إرسال التوكن في الـ body.
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const Message = require('../models/Message');

router.post('/', async (req, res) => {
    try {
        // ContentType من sendBeacon: 'application/json' أو 'text/plain'
        // لو وصل كـ text نحوّله manually
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (_) { body = {}; }
        }

        const { receiver, order, text, tempId, _token } = body;

        if (!_token || !receiver || !order || !text) {
            return res.status(400).json({ message: 'بيانات ناقصة' });
        }

        // التحقق من التوكن يدوياً (لأن protect middleware يستخدم Authorization header)
        let decoded;
        try {
            decoded = jwt.verify(_token, process.env.JWT_SECRET);
        } catch (primaryErr) {
            // 🛟 Fallback: accept legacy-signed tokens from old mobile apps
            const legacy = process.env.JWT_SECRET_LEGACY;
            if (legacy && legacy.length > 0) {
                try {
                    decoded = jwt.verify(_token, legacy);
                } catch (_) {
                    return res.status(401).json({ message: 'توكن غير صالح' });
                }
            } else {
                return res.status(401).json({ message: 'توكن غير صالح' });
            }
        }

        const sender = String(decoded.userId).trim();

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
