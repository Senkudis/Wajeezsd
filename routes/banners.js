const express = require('express');
const router = express.Router();
const Banner = require('../models/Banner');
const { protect, superAdminOnly, requirePermission } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════
// 📱 Public Routes — للتطبيق
// ═══════════════════════════════════════════════

// @route  GET /api/banners
// @desc   جلب البانرات النشطة للتطبيق
// @access Public
router.get('/', async (req, res) => {
    try {
        const { city, placement } = req.query;
        const now = new Date();

        const and = [
            { isActive: true },
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }
        ];
        // فلترة بالمدينة (all = كل المدن)
        if (city) and.push({ $or: [{ city: 'all' }, { city }] });
        // 🎯 فلترة بمكان العرض (الرئيسية/التسوق). 'all' أو غير المحدّد يظهر في الكل.
        if (placement) and.push({ $or: [{ placement }, { placement: 'all' }, { placement: null }, { placement: { $exists: false } }] });

        const filter = { $and: and };

        const banners = await Banner.find(filter)
            .sort({ sortOrder: 1, createdAt: -1 })
            .select('-createdBy -usageLimit -__v');

        // زيادة عداد المشاهدات (fire & forget)
        if (banners.length > 0) {
            Banner.updateMany(
                { _id: { $in: banners.map(b => b._id) } },
                { $inc: { viewsCount: 1 } }
            ).catch(() => {});
        }

        res.json(banners);
    } catch (error) {
        logger.error('Banners fetch error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route  POST /api/banners/:id/click
// @desc   تسجيل نقرة على بانر
// @access Public
router.post('/:id/click', async (req, res) => {
    try {
        await Banner.findByIdAndUpdate(req.params.id, { $inc: { clicksCount: 1 } });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ═══════════════════════════════════════════════
// 🔐 Admin Routes — إدارة البانرات
// ═══════════════════════════════════════════════

// @route  GET /api/banners/admin/all
// @desc   جلب جميع البانرات للأدمن
// @access Super Admin
router.get('/admin/all', protect, requirePermission('manage_banners'), async (req, res) => {
    try {
        const banners = await Banner.find()
            .populate('createdBy', 'name')
            .sort({ sortOrder: 1, createdAt: -1 });
        res.json(banners);
    } catch (error) {
        logger.error('Admin banners fetch error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route  POST /api/banners/admin
// @desc   إنشاء بانر جديد
// @access Super Admin
router.post('/admin', protect, requirePermission('manage_banners'), async (req, res) => {
    try {
        const { title, image_url, link, targetType, targetId, city, placement, sortOrder, isActive, expiresAt } = req.body;

        if (!title || !image_url) {
            return res.status(400).json({ message: 'العنوان والصورة مطلوبان' });
        }

        const banner = await Banner.create({
            title,
            image_url,
            link:       link       || '',
            targetType: targetType || 'none',
            targetId:   targetId   || '',
            city:       city       || 'all',
            placement:  ['all', 'home', 'shop'].includes(placement) ? placement : 'all',
            sortOrder:  sortOrder  || 0,
            isActive:   isActive   !== undefined ? isActive : true,
            expiresAt:  expiresAt  || null,
            createdBy:  req.user._id
        });

        res.status(201).json(banner);
    } catch (error) {
        logger.error('Banner create error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route  PUT /api/banners/admin/:id
// @desc   تعديل بانر
// @access Super Admin
router.put('/admin/:id', protect, requirePermission('manage_banners'), async (req, res) => {
    try {
        const banner = await Banner.findById(req.params.id);
        if (!banner) return res.status(404).json({ message: 'البانر غير موجود' });

        const fields = ['title', 'image_url', 'link', 'targetType', 'targetId', 'city', 'placement', 'sortOrder', 'isActive', 'expiresAt'];
        fields.forEach(f => {
            if (req.body[f] !== undefined) banner[f] = req.body[f];
        });

        await banner.save();
        res.json(banner);
    } catch (error) {
        logger.error('Banner update error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route  DELETE /api/banners/admin/:id
// @desc   حذف بانر
// @access Super Admin
router.delete('/admin/:id', protect, requirePermission('manage_banners'), async (req, res) => {
    try {
        const banner = await Banner.findByIdAndDelete(req.params.id);
        if (!banner) return res.status(404).json({ message: 'البانر غير موجود' });
        res.json({ message: 'تم حذف البانر بنجاح' });
    } catch (error) {
        logger.error('Banner delete error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
