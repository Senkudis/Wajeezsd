// routes/admin/notifications.js — مُولّد من تقسيم admin.js الأصلي.
// كل وحدة Router مستقلة تُركّب على /api/admin عبر routes/admin.js.
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../../models/User');
const Order = require('../../models/Order');
const Settings = require('../../models/Settings');
const AdminLog = require('../../models/AdminLog');
const PromoCode = require('../../models/PromoCode');
const Rating = require('../../models/Rating');
const Banner = require('../../models/Banner');
const { protect, adminOnly, superAdminOnly, requirePermission } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const { normalizePhone } = require('../../utils/phoneNormalizer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');

const SessionRequest = require('../../models/SessionRequest');

router.post('/send-notification', protect, requirePermission('send_notifications'), async (req, res) => {
    try {
        const { userId, title, message, target } = req.body;
        // target: 'user' (single), 'all' (everyone), 'clients', 'captains'

        if (!title || !message) {
            return res.status(400).json({ message: 'العنوان والرسالة مطلوبان' });
        }

        const { sendNotification } = require('../../utils/notificationHelper');
        const { sendPushToMany } = require('../../utils/firebasePush');
        const Notification = require('../../models/Notification');

        if (target === 'user' && userId) {
            // Send to single user
            await sendNotification(req.app, {
                userId,
                title,
                message,
                type: 'system',
                relatedId: null
            });
            return res.json({ message: 'تم إرسال الإشعار بنجاح', sentTo: 1 });
        }

        // Broadcast: find target users
        let query = {};
        if (target === 'clients') query = { role: 'client' };
        else if (target === 'captains') query = { role: 'captain' };
        // else 'all' — no filter

        const users = await User.find(query).select('_id fcmToken role');

        // 1. Send via Socket.IO to online users (Non-blocking)
        const io = req.app.get('io');
        if (io) {
            users.forEach(u => {
                io.to(u._id.toString()).emit('new_notification', { title, message, type: 'system' });
            });
        }

        // 🚀 BATCH PROCESSING: Save to DB and Send Push efficiently
        const batchSize = 500;
        let totalInserted = 0;
        let pushTokens = [];
        // 🧭 تجميع التوكنات حسب الدور — نقرة الإشعار تفتح صفحة إشعارات الدور الصحيح
        const tokensByRole = {};

        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);

            // Collect tokens for push
            batch.forEach(u => {
                if (u.fcmToken) {
                    pushTokens.push(u.fcmToken);
                    const role = u.role || 'client';
                    if (!tokensByRole[role]) tokensByRole[role] = [];
                    tokensByRole[role].push(u.fcmToken);
                }
            });

            // Prepare DB notifications
            const notificationsCount = batch.map(u => ({
                user: u._id,
                title,
                message,
                type: 'system',
                isRead: false
            }));

            // Insert to DB in batches
            await Notification.insertMany(notificationsCount);
            totalInserted += notificationsCount.length;
        }

        // sendPushToMany يقسّم التوكنات داخلياً إلى دفعات ≤500 (حد FCM) ويرسلها بالتوازي،
        // ثم ينظّف التوكنات الميتة من قاعدة البيانات تلقائياً.
        // 🧭 إرسال لكل دور على حدة مع رابط صفحة إشعاراته الصحيحة
        if (pushTokens.length > 0) {
            const { resolvePushUrl } = require('../../utils/pushRouting');
            for (const [role, tokens] of Object.entries(tokensByRole)) {
                await sendPushToMany(tokens, title, message, {
                    type: 'broadcast',
                    url: resolvePushUrl(role, 'broadcast', null)
                });
            }
        }

        res.json({
            message: 'تم إرسال الإشعار بنجاح',
            sentTo: totalInserted,
            pushSent: pushTokens.length
        });

    } catch (error) {
        logger.error('Send Notification Error:', error);
        res.status(500).json({ message: 'فشل في إرسال الإشعار' });
    }
});


// =========================================================
// 💳 إدارة طلبات سداد المديونية (Payment Requests)
// =========================================================

// @route   GET /api/admin/payment-requests
// @desc    جلب جميع طلبات السداد المعلقة

router.post('/broadcast', protect, requirePermission('send_notifications'), async (req, res) => {
    try {
        const { target, userId, title, message } = req.body;
        if (!title || !message) return res.status(400).json({ message: 'العنوان والرسالة مطلوبان' });

        const { sendPush, sendPushToMany } = require('../../utils/firebasePush');
        const { sendNotification } = require('../../utils/notificationHelper');
        const Notification = require('../../models/Notification');

        let users = [];

        if (target === 'user') {
            if (!userId) return res.status(400).json({ message: 'userId مطلوب لإرسال إشعار محدد' });
            const user = await User.findById(userId).select('name phone role fcmToken');
            if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
            users = [user];

        } else if (target === 'clients') {
            users = await User.find({ role: 'client', fcmToken: { $exists: true, $ne: '' } }).select('_id fcmToken role');
        } else if (target === 'captains') {
            users = await User.find({ role: 'captain', fcmToken: { $exists: true, $ne: '' } }).select('_id fcmToken role');
        } else if (target === 'merchants') {
            users = await User.find({ role: 'merchant', fcmToken: { $exists: true, $ne: '' } }).select('_id fcmToken role');
        } else { // 'all'
            users = await User.find({
                role: { $in: ['client', 'captain', 'merchant'] },
                fcmToken: { $exists: true, $ne: '' }
            }).select('_id fcmToken role');
        }

        if (users.length === 0) {
            return res.json({ success: 0, failure: 0, total: 0, message: 'لا يوجد مستخدمون مؤهلون للإرسال' });
        }

        // 1. Save in-app notifications in bulk
        const notifDocs = users.map(u => ({
            user: u._id,
            title,
            message,
            type: 'system',
            isRead: false
        }));
        await Notification.insertMany(notifDocs);

        // 2. Emit via socket
        const io = req.app.get('io');
        if (io) {
            users.forEach(u => {
                io.to(u._id.toString()).emit('new_notification', { title, message });
            });
        }

        // 3. Send FCM push — 🧭 لكل دور رابط صفحة إشعاراته الصحيحة
        let pushResult = { success: 0, failure: 0, errors: [] };
        {
            const { resolvePushUrl } = require('../../utils/pushRouting');
            const tokensByRole = {};
            users.forEach(u => {
                if (u.fcmToken) {
                    const role = u.role || 'client';
                    if (!tokensByRole[role]) tokensByRole[role] = [];
                    tokensByRole[role].push(u.fcmToken);
                }
            });
            for (const [role, tokens] of Object.entries(tokensByRole)) {
                const r = await sendPushToMany(tokens, title, message, {
                    type: 'broadcast',
                    url: resolvePushUrl(role, 'broadcast', null)
                });
                pushResult.success += r.success || 0;
                pushResult.failure += r.failure || 0;
                pushResult.cleaned = (pushResult.cleaned || 0) + (r.cleaned || 0);
            }
        }

        logger.info(`📣 Broadcast [${target}]: ${pushResult.success} sent, ${pushResult.failure} failed, ${users.length} total, ${pushResult.cleaned || 0} dead tokens cleaned`);
        res.json({
            success: pushResult.success,
            failure: pushResult.failure,
            total: users.length,
            cleaned: pushResult.cleaned || 0,
            errors: pushResult.errors
        });

    } catch (err) {
        logger.error('Broadcast Error:', err);
        res.status(500).json({ message: 'Server error: ' + err.message });
    }
});

// =========================================================
// 🌍 ONE-TIME MIGRATION: Add `city` field to legacy records
// =========================================================
// @route   GET /api/admin/migrate-cities-legacy-data
// @desc    One-time script: Assign 'Khartoum' to all existing users/places without a city.
// @access  Public (Temporary for easy execution)

module.exports = router;
