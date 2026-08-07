const express = require('express');
const router = express.Router();
const validateObjectId = require('../middleware/validateObjectId');
// 🆔 أي :id ليس ObjectId ⇒ 404 لا 500 (انظر الملف للسبب)
router.param('id', validateObjectId);
const Notification = require('../models/Notification');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

// @route   GET /api/notifications
// @desc    جلب جميع إشعارات المستخدم الحالي
router.get('/', protect, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Notification.countDocuments({ user: req.user.id });

        // 🧭 وجهة النقر تُحسب هنا لا في الواجهة: utils/pushRouting.js هو
        // المصدر الوحيد لتوجيه الإشعارات (تستخدمه دفعات FCM أصلاً). حسابها
        // في الصفحة يعني نسختين تتباعدان مع كل نوع جديد.
        const { resolvePushUrl } = require('../utils/pushRouting');
        const withUrl = notifications.map(n => ({
            ...n,
            url: resolvePushUrl(req.user.role, n.type || 'system', n.relatedId)
        }));

        res.json({
            notifications: withUrl,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalNotifications: total
        });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error fetching notifications' });
    }
});

// @route   GET /api/notifications/unread-count
// @desc    جلب عدد الإشعارات غير المقروءة
router.get('/unread-count', protect, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ user: req.user.id, isRead: false });
        res.json({ unreadCount: count });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error fetching unread count' });
    }
});

// @route   POST /api/notifications
// @desc    إنشاء إشعار جديد وإرساله فوراً (للأدمن فقط)
router.post('/', protect, adminOnly, async (req, res) => {
    try {
        const { userId, title, message, type } = req.body;

        // 1. حفظ الإشعار في قاعدة البيانات
        const notification = await Notification.create({
            user: userId, // الشخص اللي حيوصله الإشعار
            title: title,
            message: message, // ✅ FIX: was 'body' — model field is 'message'
            type: type || 'system', // نوع الإشعار (نظام، طلب، شات...)
            isRead: false
        });

        // 2. إرسال الإشعار فوراً عبر Socket.io
        const io = req.app.get('io');
        if (io) {
            io.to(userId).emit('new_notification', notification);
            logger.info(`🔔 Notification sent to user ${userId}`);
        }

        res.status(201).json(notification);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error creating notification' });
    }
});

// @route   PUT /api/notifications/mark-all-read
// @desc    تعليم جميع إشعارات المستخدم كمقروءة دفعةً واحدة
// ⚠️ يجب أن يكون قبل /:id/read وإلا Express يعتبر 'mark-all-read' كـ id
router.put('/mark-all-read', protect, async (req, res) => {
    try {
        await Notification.updateMany(
            { user: req.user.id, isRead: false },
            { $set: { isRead: true } }
        );
        res.json({ message: 'تم تحديد جميع الإشعارات كمقروءة', success: true });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/notifications/:id/read
// @desc    تعليم إشعار واحد كمقروء
router.put('/:id/read', protect, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        if (!notification) return res.status(404).json({ message: 'Not found' });

        if (notification.user.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        notification.isRead = true;
        await notification.save();
        res.json(notification);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;