const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/authMiddleware');
const EmergencyAlert = require('../models/EmergencyAlert');
const { sendWhatsAppNotification } = require('../services/whatsappService');
const logger = require('../utils/logger');

// 🔒 SECURITY: Rate Limiter for SOS (Max 3 alerts per 5 minutes)
const sosLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 3, // Max 3 SOS alerts per 5 minutes per IP
    message: { message: 'تم تجاوز الحد الأقصى لتنبيهات الطوارئ. انتظر 5 دقائق.' },
    standardHeaders: true,
    legacyHeaders: false,

    // ✅ FIX: Disable the IPv6 validation check to prevent the error
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false }
});

// @route   POST /api/emergency/alert
// @desc    Create SOS emergency alert
router.post('/alert', protect, sosLimiter, async (req, res) => {
    try {
        const { lat, lng } = req.body;
        const captain = req.user;

        if (!lat || !lng) {
            return res.status(400).json({ message: 'الموقع مطلوب' });
        }

        // Validate coordinates
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ message: 'إحداثيات غير صحيحة' });
        }

        // Create emergency alert FIRST (critical - must succeed)
        const alert = await EmergencyAlert.create({
            captain: captain._id,
            location: { lat, lng },
            city: captain.city || 'Khartoum',
            status: 'pending'
        });

        // ✅ FIX: Corrected Google Maps Link (Standard Clickable URL)
        const googleMapsLink = `https://www.google.com/maps?q=${lat},${lng}`;

        // 🎯 توجيه التنبيه: الأدمن الرئيسي (دائماً) + الأدمن المساعد المسؤول عن مدينة الكابتن
        try {
            const User = require('../models/User');
            const { sendNotification } = require('../utils/notificationHelper');

            const targetAdmins = await User.find({
                role: 'admin',
                isActive: true,
                $or: [
                    { adminRole: { $ne: 'sub_admin' } },                 // super_admin + الأدمن القديم (null)
                    { adminRole: 'sub_admin', city: captain.city }        // المساعد المسؤول عن مدينة الكابتن
                ]
            }).select('_id');

            const title = '🚨 نجدة! تنبيه طوارئ';
            const body  = `الكابتن ${captain.name} طلب النجدة — اضغط لعرض الموقع`;

            // إشعار داخل التطبيق + Push لكل أدمن مستهدف (غير حاجب)
            await Promise.allSettled(targetAdmins.map(a => sendNotification(req.app, {
                userId: a._id, title, message: body, type: 'emergency', relatedId: alert._id
            })));

            // 🔊 بث لحظي للوحة الإدارة لتشغيل صفّارة النجدة وعرض التنبيه فوراً
            const io = req.app.get('io');
            if (io) {
                io.to('admin_room').emit('emergency_alert', {
                    alertId: alert._id,
                    captainId: captain._id,
                    captainName: captain.name,
                    captainPhone: captain.phone,
                    lat, lng,
                    city: captain.city || 'Khartoum',
                    mapsLink: googleMapsLink,
                    createdAt: alert.createdAt
                });
            }
        } catch (notifyErr) {
            logger.error('Emergency admin notification failed (non-critical):', notifyErr.message);
            // التنبيه محفوظ في DB للمتابعة اليدوية
        }

        // Get admin phone from settings
        const Settings = require('../models/Settings');
        // Handle case where getSettings might fail or return null
        let adminPhone = process.env.ADMIN_EMERGENCY_PHONE || '249112046348';
        try {
            const settings = await Settings.getSettings();
            if (settings && settings.adminPhone) {
                adminPhone = settings.adminPhone;
            }
        } catch (settingsError) {
            logger.error('Error fetching settings, using default phone:', settingsError.message);
        }

        // Format WhatsApp message
        const message = `🚨 *تنبيه طوارئ SOS!*\n\nالكابتن *${captain.name}* في حالة طوارئ!\n\n📍 الموقع: ${googleMapsLink}\n📞 الهاتف: ${captain.phone}\n\n⚠️ يرجى الاستجابة فوراً!`;

        // 🔒 SECURITY FIX: Send WhatsApp notification NON-BLOCKING
        sendWhatsAppNotification(adminPhone, message)
            .then(() => {
                logger.info(`✅ WhatsApp SOS sent for Captain ${captain.name}`);
            })
            .catch(err => {
                logger.error('❌ WhatsApp notification failed for SOS:', err.message);
                // Alert is still in DB for manual follow-up
            });

        logger.info(`🚨 SOS Alert created for Captain ${captain.name} at ${lat},${lng}`);

        // Always return success if alert was created
        res.json({
            success: true,
            message: 'تم إرسال تنبيه الطوارئ بنجاح',
            alert
        });
    } catch (error) {
        logger.error('Error creating emergency alert:', error);
        res.status(500).json({ message: 'خطأ في إرسال تنبيه الطوارئ' });
    }
});

module.exports = router;