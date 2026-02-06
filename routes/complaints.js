const express = require('express');
const router = express.Router();
const Complaint = require('../models/Complaint');
const Order = require('../models/Order');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { sendNotification } = require('../utils/notificationHelper');

// POST /api/complaints - Submit a new complaint
router.post('/', protect, async (req, res) => {
    try {
        const { orderId, reason, description } = req.body;

        // Verify order exists and belongs to user
        const order = await Order.findOne({ _id: orderId, client: req.user._id });
        if (!order) {
            return res.status(404).json({ message: 'الطلب غير موجود' });
        }

        const complaint = await Complaint.create({
            orderId,
            client: req.user._id,
            reason,
            description
        });

        // ✅ Send notification to admin about the complaint
        const admin = await User.findOne({ role: 'admin' });
        if (admin) {
            await sendNotification(req.app, {
                userId: admin._id,
                title: '⚠️ شكوى جديدة',
                message: `شكوى جديدة من العميل ${req.user.name || 'أحد العملاء'}: ${reason}`,
                type: 'system',
                relatedId: orderId
            });
        }

        res.status(201).json({ message: 'تم إرسال الشكوى بنجاح', complaint });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/complaints - Get all complaints (Admin only)
router.get('/', protect, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Admin only.' });
        }

        const complaints = await Complaint.find()
            .populate('client', 'name phone email')
            .populate('orderId', 'price status')
            .sort({ createdAt: -1 });

        res.json(complaints);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /api/complaints/:id/resolve - Resolve a complaint (Admin only)
router.put('/:id/resolve', protect, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Admin only.' });
        }

        const complaint = await Complaint.findById(req.params.id);
        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found' });
        }

        complaint.status = 'resolved';
        await complaint.save();

        // ✅ Send notification to client about resolution
        await sendNotification(req.app, {
            userId: complaint.client,
            title: '✅ تم حل شكواك',
            message: 'تم مراجعة شكواك وحلها من قبل الإدارة. شكراً لتواصلك معنا.',
            type: 'system',
            relatedId: complaint.orderId
        });

        res.json({ message: 'Complaint resolved successfully', complaint });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
