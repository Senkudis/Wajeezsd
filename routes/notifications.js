const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/authMiddleware');

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
            .limit(limit);

        const total = await Notification.countDocuments({ user: req.user.id });

        res.json({
            notifications,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalNotifications: total
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error fetching notifications' });
    }
});

// @route   POST /api/notifications
// @desc    إنشاء إشعار جديد وإرساله فوراً (للتجربة أو من الأدمن)
router.post('/', protect, async (req, res) => {
    try {
        const { userId, title, body, type } = req.body;

        // 1. حفظ الإشعار في قاعدة البيانات
        const notification = await Notification.create({
            user: userId, // الشخص اللي حيوصله الإشعار
            title: title,
            body: body,
            type: type || 'system', // نوع الإشعار (نظام، طلب، شات...)
            isRead: false
        });

        // 2. إرسال الإشعار فوراً عبر Socket.io
        // بنجيب الـ io اللي عرفناه في index.js
        const io = req.app.get('io');

        // نرسل الإشعار لغرفة المستخدم (باستخدام الـ ID حقه)
        if (io) {
            io.to(userId).emit('new_notification', notification);
            console.log(`🔔 Notification sent to user ${userId}`);
        }

        res.status(201).json(notification);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error creating notification' });
    }
});

// @route   PUT /api/notifications/:id/read
// @desc    تعليم الإشعار كمقروء
router.put('/:id/read', protect, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        if (!notification) return res.status(404).json({ message: 'Not found' });

        // التأكد من أن المستخدم هو صاحب الإشعار
        if (notification.user.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        notification.isRead = true;
        await notification.save();
        res.json(notification);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;