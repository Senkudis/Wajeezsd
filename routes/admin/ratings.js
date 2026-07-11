// routes/admin/ratings.js — مُولّد من تقسيم admin.js الأصلي.
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

router.get('/ratings', protect, superAdminOnly, async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 30);
        const filter = {};
        if (req.query.targetType) filter.targetType = req.query.targetType;
        if (req.query.isHidden)   filter.isHidden   = req.query.isHidden === 'true';

        const [ratings, total] = await Promise.all([
            Rating.find(filter)
                .populate('client', 'name phone')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Rating.countDocuments(filter)
        ]);
        res.json({ ratings, total, page, pages: Math.ceil(total / limit) });
    } catch (e) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// DELETE /api/admin/ratings/:id — حذف أو إخفاء تقييم مسيء

router.delete('/ratings/:id', protect, superAdminOnly, async (req, res) => {
    try {
        const rating = await Rating.findByIdAndUpdate(
            req.params.id,
            { isHidden: true },
            { new: true }
        );
        if (!rating) return res.status(404).json({ message: 'التقييم غير موجود' });
        res.json({ message: 'تم إخفاء التقييم بنجاح' });
    } catch (e) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
