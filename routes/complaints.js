const express = require('express');
const router = express.Router();
const validateObjectId = require('../middleware/validateObjectId');
// 🆔 أي :id ليس ObjectId ⇒ 404 لا 500 (انظر الملف للسبب)
router.param('id', validateObjectId);
const Complaint = require('../models/Complaint');
const Order = require('../models/Order');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { sendNotification } = require('../utils/notificationHelper');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════
// 📱 Client Routes
// ═══════════════════════════════════════════════

// @route  POST /api/complaints
// @desc   فتح تذكرة دعم فني جديدة
// @access Client
router.post('/', protect, async (req, res) => {
    try {
        const { orderId, subject, category, reason, description, images } = req.body;

        let orderModel = 'Order';

        // التحقق من الطلب إذا كان موجوداً
        if (orderId) {
            let order = await Order.findOne({ _id: orderId, client: req.user._id });
            if (!order) {
                const ShopOrder = require('../models/ShopOrder');
                order = await ShopOrder.findOne({ _id: orderId, client: req.user._id });
                if (order) orderModel = 'ShopOrder';
            }
            if (!order) {
                return res.status(404).json({ message: 'الطلب غير موجود أو لا ينتمي لحسابك' });
            }
        }

        const complaint = await Complaint.create({
            orderId:     orderId    || null,
            orderModel:  orderModel,
            client:      req.user._id,
            subject:     subject    || 'شكوى جديدة',
            category:    category   || 'other',
            reason:      reason     || '',
            description,
            images:      images     || [],
            status:      'open',
            priority:    'medium',
            lastReplyAt: new Date()
        });

        // إشعار الأدمن
        const admins = await User.find({ role: 'admin', isActive: true });
        for (const admin of admins) {
            await sendNotification(req.app, {
                userId:    admin._id,
                title:     'تذكرة دعم جديدة',
                message:   `${req.user.name || 'عميل'}: ${subject || description.substring(0, 50)}`,
                type:      'system',
                relatedId: complaint._id
            }).catch(() => {});
        }

        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('new_complaint', {
                id:      complaint._id,
                subject: complaint.subject,
                client:  req.user.name
            });
        }

        res.status(201).json({ message: 'تم إرسال تذكرة الدعم بنجاح', complaint });
    } catch (error) {
        logger.error('Complaint create error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  GET /api/complaints/mine
// @desc   شكاوى العميل الحالي
// @access Client
router.get('/mine', protect, async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const skip  = (page - 1) * limit;

        const [complaints, total] = await Promise.all([
            Complaint.find({ client: req.user._id })
                .sort({ lastReplyAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('-replies.sender'),
            Complaint.countDocuments({ client: req.user._id })
        ]);

        res.json({ complaints, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        logger.error('Complaints mine error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  GET /api/complaints/:id
// @desc   تفاصيل تذكرة واحدة (للعميل أو الأدمن)
// @access Client | Admin
router.get('/:id', protect, async (req, res) => {
    try {
        const query = req.user.role === 'admin'
            ? { _id: req.params.id }
            : { _id: req.params.id, client: req.user._id };

        const complaint = await Complaint.findOne(query)
            .populate('client',     'name phone')
            .populate('assignedTo', 'name')
            .populate('replies.sender', 'name role');

        if (!complaint) return res.status(404).json({ message: 'التذكرة غير موجودة' });

        res.json(complaint);
    } catch (error) {
        logger.error('Complaint detail error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  POST /api/complaints/:id/reply
// @desc   إضافة رد على تذكرة (من العميل أو الأدمن)
// @access Client | Admin
router.post('/:id/reply', protect, async (req, res) => {
    try {
        const { message, images } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ message: 'نص الرد مطلوب' });
        }

        const query = req.user.role === 'admin'
            ? { _id: req.params.id }
            : { _id: req.params.id, client: req.user._id };

        const complaint = await Complaint.findOne(query);
        if (!complaint) return res.status(404).json({ message: 'التذكرة غير موجودة' });

        if (['resolved', 'dismissed'].includes(complaint.status)) {
            return res.status(400).json({ message: 'التذكرة مغلقة ولا يمكن الرد عليها' });
        }

        const reply = {
            sender:     req.user._id,
            senderRole: req.user.role === 'admin' ? 'admin' : 'client',
            message:    message.trim(),
            images:     images || []
        };

        complaint.replies.push(reply);
        complaint.lastReplyAt = new Date();
        if (req.user.role === 'admin' && complaint.status === 'open') {
            complaint.status = 'in_progress';
        }
        await complaint.save();

        // إشعار الطرف الآخر
        if (req.user.role === 'admin') {
            await sendNotification(req.app, {
                userId:    complaint.client,
                title:     'رد على تذكرتك',
                message:   `ردّ فريق الدعم: ${message.substring(0, 80)}`,
                type:      'system',
                relatedId: complaint._id
            }).catch(() => {});
        } else {
            const admins = await User.find({ role: 'admin', isActive: true });
            for (const admin of admins) {
                await sendNotification(req.app, {
                    userId:    admin._id,
                    title:     'رد عميل على تذكرة',
                    message:   `${req.user.name}: ${message.substring(0, 80)}`,
                    type:      'system',
                    relatedId: complaint._id
                }).catch(() => {});
            }
        }

        res.json({ message: 'تم إضافة الرد بنجاح', reply });
    } catch (error) {
        logger.error('Complaint reply error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════
// 🔐 Admin-Only Routes
// ═══════════════════════════════════════════════

// @route  GET /api/complaints
// @desc   جميع الشكاوى مع فلترة
// @access Admin
router.get('/', protect, adminOnly, async (req, res) => {
    try {
        const page     = Math.max(1, parseInt(req.query.page)  || 1);
        const limit    = Math.min(100, parseInt(req.query.limit) || 30);
        const skip     = (page - 1) * limit;
        const filter   = {};

        if (req.query.status)   filter.status   = req.query.status;
        if (req.query.priority) filter.priority  = req.query.priority;
        if (req.query.category) filter.category  = req.query.category;
        if (req.query.assigned) filter.assignedTo = req.query.assigned;

        const [complaints, total] = await Promise.all([
            Complaint.find(filter)
                .populate('client',     'name phone')
                .populate('assignedTo', 'name')
                .sort({ priority: -1, lastReplyAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('-replies'),
            Complaint.countDocuments(filter)
        ]);

        res.json({ complaints, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        logger.error('Complaints list error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  PUT /api/complaints/:id/resolve
// @desc   حل التذكرة
// @access Admin
router.put('/:id/resolve', protect, adminOnly, async (req, res) => {
    try {
        const complaint = await Complaint.findById(req.params.id);
        if (!complaint) return res.status(404).json({ message: 'التذكرة غير موجودة' });

        complaint.status     = 'resolved';
        complaint.resolvedAt = new Date();
        await complaint.save();

        await sendNotification(req.app, {
            userId:  complaint.client,
            title:   'تم حل تذكرتك',
            message: 'تمت مراجعة تذكرتك وحلها من قبل فريق الدعم. شكراً لتواصلك معنا.',
            type:    'system',
            relatedId: complaint._id
        }).catch(() => {});

        res.json({ message: 'تم حل التذكرة بنجاح', complaint });
    } catch (error) {
        logger.error('Complaint resolve error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  PUT /api/complaints/:id/dismiss
// @desc   رفض التذكرة
// @access Admin
router.put('/:id/dismiss', protect, adminOnly, async (req, res) => {
    try {
        const complaint = await Complaint.findByIdAndUpdate(
            req.params.id,
            { status: 'dismissed' },
            { new: true }
        );
        if (!complaint) return res.status(404).json({ message: 'التذكرة غير موجودة' });
        res.json({ message: 'تم رفض التذكرة', complaint });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  PUT /api/complaints/:id/assign
// @desc   تعيين أدمن مسؤول للتذكرة
// @access Admin
router.put('/:id/assign', protect, adminOnly, async (req, res) => {
    try {
        const { adminId } = req.body;
        const complaint = await Complaint.findByIdAndUpdate(
            req.params.id,
            { assignedTo: adminId || null, status: 'in_progress' },
            { new: true }
        ).populate('assignedTo', 'name');
        if (!complaint) return res.status(404).json({ message: 'التذكرة غير موجودة' });
        res.json({ message: 'تم التعيين بنجاح', complaint });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  PUT /api/complaints/:id/priority
// @desc   تغيير أولوية التذكرة
// @access Admin
router.put('/:id/priority', protect, adminOnly, async (req, res) => {
    try {
        const { priority } = req.body;
        const valid = ['low', 'medium', 'high', 'urgent'];
        if (!valid.includes(priority)) {
            return res.status(400).json({ message: 'قيمة الأولوية غير صحيحة' });
        }
        const complaint = await Complaint.findByIdAndUpdate(
            req.params.id,
            { priority },
            { new: true }
        );
        if (!complaint) return res.status(404).json({ message: 'التذكرة غير موجودة' });
        res.json({ message: 'تم تحديث الأولوية', complaint });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
