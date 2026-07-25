// routes/admin/complaints.js — مُولّد من تقسيم admin.js الأصلي.
// كل وحدة Router مستقلة تُركّب على /api/admin عبر routes/admin.js.
const express = require('express');
const router = express.Router();
const validateObjectId = require('../../middleware/validateObjectId');
// 🆔 أي :id ليس ObjectId ⇒ 404 لا 500 (انظر الملف للسبب)
router.param('id', validateObjectId);
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

router.get('/complaints', protect, requirePermission('view_complaints'), async (req, res) => {
    try {
        // البحث عن أي طلب يحتوي على حالة شكوى لا تساوي 'none'
        const orders = await Order.find({
            'complaint.status': { $exists: true, $ne: 'none' }
        })
            .populate('client', 'name phone')
            .populate('captain', 'name phone')
            .sort({ 'complaint.createdAt': -1 });

        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/admin/complaints/:id/resolve
// @desc    حل الشكوى

router.put('/complaints/:id/resolve', protect, requirePermission('view_complaints'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        if (!order.complaint) {
            order.complaint = {}; // إنشاء كائن الشكوى إذا لم يكن موجوداً
        }

        order.complaint.status = 'resolved';
        order.complaint.resolvedAt = Date.now();

        await order.save();
        res.json({ message: 'تم حل الشكوى بنجاح', order });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// =========================================================
// 🆕 إضافة كابتن جديد (بواسطة الأدمن فقط)
// =========================================================
// @route   POST /api/admin/create-captain
// @desc    إضافة كابتن جديد (بواسطة الأدمن فقط)
// 🌍 `city` field required: 'Khartoum' | 'PortSudan'

module.exports = router;
