// routes/admin/subadmins.js — مُولّد من تقسيم admin.js الأصلي.
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

router.get('/activity-log', protect, superAdminOnly, async (req, res) => {
    try {
        const page    = Math.max(1, parseInt(req.query.page)  || 1);
        const limit   = Math.min(100, parseInt(req.query.limit) || 50);
        const skip    = (page - 1) * limit;

        const filter = {};
        if (req.query.action)  filter.action  = req.query.action;
        if (req.query.adminId) filter.admin   = req.query.adminId;
        if (req.query.from || req.query.to) {
            filter.createdAt = {};
            if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
            if (req.query.to)   filter.createdAt.$lte = new Date(req.query.to + 'T23:59:59.999Z');
        }

        const [logs, total] = await Promise.all([
            AdminLog.find(filter)
                .populate('admin', 'name phone adminRole')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AdminLog.countDocuments(filter)
        ]);

        res.json({ logs, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        logger.error('Activity Log Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 👥 إدارة الأدمن المساعدين (Sub-Admin Management)
// =========================================================

// @route   GET /api/admin/sub-admins
// @desc    قائمة كل الأدمن

router.get('/sub-admins', protect, superAdminOnly, async (req, res) => {
    try {
        const admins = await User.find({ role: 'admin' })
            .select('-password')
            .sort({ createdAt: -1 });
        res.json(admins);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   POST /api/admin/sub-admins
// @desc    إنشاء أدمن مساعد جديد

router.post('/sub-admins', protect, superAdminOnly, async (req, res) => {
    try {
        const { name, phone, password, permissions, city } = req.body;

        if (!name || !phone || !password) {
            return res.status(400).json({ message: 'الاسم والهاتف وكلمة المرور مطلوبة' });
        }

        const VALID_PERMS = [
            'view_orders', 'manage_orders',
            'view_captains', 'manage_captains',
            'view_stores', 'manage_stores',
            'view_stats', 'view_map',
            'view_complaints',
            'view_categories', 'manage_categories',
            'view_users', 'manage_users',
            'view_finance', 'manage_finance',
            'view_revenue',
            'send_notifications',
            'manage_banners',
        ];

        const normalizedPhone = normalizePhone(phone);
        const exists = await User.findOne({ phone: normalizedPhone });
        if (exists) return res.status(400).json({ message: 'رقم الهاتف مسجل بالفعل' });

        const validPerms = (permissions || []).filter(p => VALID_PERMS.includes(p));

        const subAdmin = await User.create({
            name,
            phone: normalizedPhone,
            password,
            role: 'admin',
            adminRole: 'sub_admin',
            permissions: validPerms,
            city: ['Khartoum', 'PortSudan'].includes(city) ? city : 'Khartoum',
            isActive: true,
            isVerified: true,
            approvalStatus: 'approved'
        });

        await logAdminAction(req, 'create_sub_admin',
            `تم إنشاء أدمن مساعد: ${name}`,
            subAdmin._id, name, { permissions: validPerms }
        );

        res.status(201).json({
            _id: subAdmin._id,
            name: subAdmin.name,
            phone: subAdmin.phone,
            adminRole: subAdmin.adminRole,
            permissions: subAdmin.permissions,
            message: 'تم إنشاء الأدمن المساعد بنجاح'
        });
    } catch (error) {
        logger.error('Create Sub-Admin Error:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
});

// @route   PUT /api/admin/sub-admins/:id
// @desc    تعديل صلاحيات أدمن مساعد

router.put('/sub-admins/:id', protect, superAdminOnly, async (req, res) => {
    try {
        const { permissions, isActive, adminRole } = req.body;

        const target = await User.findById(req.params.id);
        if (!target || target.role !== 'admin') {
            return res.status(404).json({ message: 'الأدمن غير موجود' });
        }

        // منع تعديل نفسك
        if (target._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'لا يمكنك تعديل حسابك الشخصي من هنا' });
        }

        const VALID_PERMS = [
            'view_orders', 'manage_orders', 'view_captains', 'manage_captains',
            'view_stores', 'manage_stores', 'view_stats', 'view_map',
            'view_complaints', 'view_categories', 'manage_categories',
            'view_users', 'manage_users', 'view_finance', 'manage_finance',
            'view_revenue', 'send_notifications', 'manage_banners',
        ];

        const updates = {};
        if (permissions !== undefined) updates.permissions = permissions.filter(p => VALID_PERMS.includes(p));
        if (isActive !== undefined)    updates.isActive    = Boolean(isActive);
        if (adminRole && ['super_admin', 'sub_admin'].includes(adminRole)) {
            updates.adminRole = adminRole;
        }

        await User.findByIdAndUpdate(req.params.id, updates);

        await logAdminAction(req, 'update_sub_admin',
            `تم تعديل صلاحيات الأدمن: ${target.name}`,
            target._id, target.name, updates
        );

        res.json({ message: 'تم تحديث الأدمن بنجاح' });
    } catch (error) {
        logger.error('Update Sub-Admin Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   DELETE /api/admin/sub-admins/:id
// @desc    حذف أدمن مساعد

router.delete('/sub-admins/:id', protect, superAdminOnly, async (req, res) => {
    try {
        const target = await User.findById(req.params.id);
        if (!target || target.role !== 'admin') {
            return res.status(404).json({ message: 'الأدمن غير موجود' });
        }
        if (target._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'لا يمكنك حذف حسابك الشخصي' });
        }

        await User.findByIdAndDelete(req.params.id);

        await logAdminAction(req, 'delete_sub_admin',
            `تم حذف الأدمن: ${target.name}`,
            target._id, target.name
        );

        res.json({ message: 'تم حذف الأدمن بنجاح' });
    } catch (error) {
        logger.error('Delete Sub-Admin Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/admin/errors
// @desc    آخر أخطاء الإنتاج (مخزن في الذاكرة) — مراقبة سريعة للمسؤول الرئيسي
router.get('/errors', protect, superAdminOnly, (req, res) => {
    try {
        const errorTracker = require('../../utils/errorTracker');
        res.json({
            count: errorTracker.count(),
            errors: errorTracker.list(req.query.limit)
        });
    } catch (e) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
