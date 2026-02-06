const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/authMiddleware');
const { sendNotification } = require('../utils/notificationHelper');

// @route   POST /api/chat
// @desc    Send a message (Fallback for HTTP)
router.post('/', protect, async (req, res) => {
    try {
        // نستقبل البيانات بالأسماء الجديدة المتوافقة مع الفرونت إند
        const { receiver, order, text } = req.body;
        
        if (!receiver || !order || !text) {
            return res.status(400).json({ message: 'البيانات ناقصة (المستقبل، الطلب، أو النص)' });
        }

        const message = await Message.create({
            sender: req.user.id, // ✅ المرسل يؤخذ من التوكن للأمان
            receiver,
            order,
            text,
            isRead: false
        });

        // جلب بيانات المرسل كاملة لإعادتها للواجهة
        await message.populate('sender', 'name role');

        // استخدام المساعد الجديد لإرسال إشعار الرسالة الجديدة
        await sendNotification(req.app, {
            userId: receiver,
            title: '💬 رسالة جديدة',
            message: `${req.user.name}: ${text.length > 30 ? text.substring(0, 30) + '...' : text}`,
            type: 'chat',
            relatedId: order
        });

        res.status(201).json(message);
    } catch (error) {
        console.error('Chat API Error:', error);
        res.status(500).json({ message: 'حدث خطأ في السيرفر أثناء إرسال الرسالة' });
    }
});

// @route   GET /api/chat/:orderId
// @desc    Get messages for an order
router.get('/:orderId', protect, async (req, res) => {
    try {
        const messages = await Message.find({ order: req.params.orderId })
            .populate('sender', 'name role') // تأكدنا من جلب البيانات المهمة فقط
            .sort({ createdAt: 1 });

        // تحديث حالة القراءة للرسائل الواردة للمستخدم الحالي
        await Message.updateMany(
            { 
                order: req.params.orderId, 
                receiver: req.user.id, 
                isRead: false 
            },
            { isRead: true }
        );

        res.json(messages);
    } catch (error) {
        console.error('Get Messages Error:', error);
        res.status(500).json({ message: 'فشل في جلب الرسائل' });
    }
});

// @route   GET /api/chat/unread-count/:userId
// @desc    Get unread message count
router.get('/unread-count', protect, async (req, res) => { // تعديل الرابط ليكون أبسط
    try {
        const unreadCount = await Message.countDocuments({
            receiver: req.user.id, // نستخدم التوكن لمعرفة المستخدم
            isRead: false
        });

        res.json({ unreadCount });
    } catch (error) {
        console.error('Unread count error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;