// routes/admin/subadmins.js — مُولّد من تقسيم admin.js الأصلي.
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

// =========================================================
// 🔑 قائمة الصلاحيات — مشتقّةٌ من مخطّط النموذج لا مكتوبةً بجانبه.
//
// ⚠️ كانت مكتوبةً يدوياً مرّتين (الإنشاء والتعديل)، وتباعدت عن النموذج:
//    view_chats و manage_chats و view_captain_details موجودةٌ في المخطّط
//    ومعروضةٌ في الواجهة، لكن المسار كان يُسقطها بصمت — فمن يمنحها لا
//    يراها تُحفظ ولا يُقال له لماذا. المصدر الآن واحد، فلا تتباعد ثانية.
const VALID_PERMS = User.schema.path('permissions').caster.enumValues;
const VALID_CITIES = ['Khartoum', 'PortSudan'];

/** يُنقّي مدن الأدمن المساعد: صالحةً وبلا تكرار. فارغةً ⇒ مدينته وحدها. */
function sanitizeCities(list) {
    if (!Array.isArray(list)) return null;
    return [...new Set(list.filter(c => VALID_CITIES.includes(c)))];
}

// 📜 سجلّ أفعال الإدارة — صلاحيةٌ تُمنح، لا حكرٌ على المسؤول الرئيسي.
//    من يدير مدينةً يحتاج أن يعرف من غيّر ماذا فيها.
router.get('/activity-log', protect, requirePermission('view_activity_log'), async (req, res) => {
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
        const { name, phone, password, permissions, city, cities } = req.body;

        if (!name || !phone || !password) {
            return res.status(400).json({ message: 'الاسم والهاتف وكلمة المرور مطلوبة' });
        }

        const normalizedPhone = normalizePhone(phone);
        const exists = await User.findOne({ phone: normalizedPhone });
        if (exists) return res.status(400).json({ message: 'رقم الهاتف مسجل بالفعل' });

        const validPerms = (permissions || []).filter(p => VALID_PERMS.includes(p));

        const requested = sanitizeCities(cities);
        const assignedCities = (requested && requested.length)
            ? requested
            : [VALID_CITIES.includes(city) ? city : 'Khartoum'];

        const subAdmin = await User.create({
            name,
            phone: normalizedPhone,
            password,
            role: 'admin',
            adminRole: 'sub_admin',
            permissions: validPerms,
            // 🌍 مدنه: ما أُرسل، وإلا مدينته الواحدة. و`city` تبقى الأولى
            //    منها — بها تُختم السجلات التي ينشئها إن لم يحدّد.
            cities: assignedCities,
            city: assignedCities[0],
            isActive: true,
            isVerified: true,
            approvalStatus: 'approved'
        });

        await logAdminAction(req, 'create_sub_admin',
            `تم إنشاء أدمن مساعد: ${name}`,
            subAdmin._id, name, { permissions: validPerms, cities: assignedCities }
        );

        res.status(201).json({
            _id: subAdmin._id,
            name: subAdmin.name,
            phone: subAdmin.phone,
            adminRole: subAdmin.adminRole,
            permissions: subAdmin.permissions,
            cities: subAdmin.cities,
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
        const { permissions, isActive, adminRole, cities } = req.body;

        const target = await User.findById(req.params.id);
        if (!target || target.role !== 'admin') {
            return res.status(404).json({ message: 'الأدمن غير موجود' });
        }

        // منع تعديل نفسك
        if (target._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'لا يمكنك تعديل حسابك الشخصي من هنا' });
        }

        const updates = {};
        if (permissions !== undefined) updates.permissions = permissions.filter(p => VALID_PERMS.includes(p));
        if (cities !== undefined) {
            const clean = sanitizeCities(cities);
            // 🚫 لا نطاقَ فارغ: أدمنٌ بلا مدينةٍ واحدة لا يرى شيئاً ولا يفهم
            //    لماذا — والخطأ يقع صامتاً وقت التعيين لا وقت الاستعمال.
            if (!clean || !clean.length) {
                return res.status(400).json({ message: 'اختر مدينةً واحدة على الأقل' });
            }
            updates.cities = clean;
            updates.city   = clean[0];
        }
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
router.get('/errors', protect, superAdminOnly, async (req, res) => {
    try {
        const errorTracker = require('../../utils/errorTracker');
        // الدائم أولاً — أخطاء ما قبل آخر إعادة تشغيل هي الأهمّ غالباً
        const { source, errors } = await errorTracker.listPersisted(req.query.limit);
        res.json({ source, count: errors.length, memoryCount: errorTracker.count(), errors });
    } catch (e) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/admin/analytics?days=30
// @desc    مسار المنتج: أين يسقط المستخدم، وكم نسبة من يفتح متجراً ثم يطلب.
//          الأرقام مجمَّعة يومياً في DailyStat — لا هويّات ولا أحداث فردية.
router.get('/analytics', protect, superAdminOnly, async (req, res) => {
    try {
        const DailyStat = require('../../models/DailyStat');
        const analytics = require('../../utils/analytics');

        // الحدّ الأعلى تسعون يوماً: نطاقٌ أوسع يقرأ وثائق كثيرة بلا فائدة
        const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
        const from = new Date(Date.now() + 3 * 3600000 - (days - 1) * 86400000)
            .toISOString().slice(0, 10);

        const filter = { day: { $gte: from } };
        if (req.query.city) filter.city = analytics.normalizeCity(req.query.city);

        const rows = await DailyStat.find(filter).sort({ day: 1 }).lean();
        res.json({
            from,
            to: DailyStat.today(),
            days,
            city: req.query.city ? analytics.normalizeCity(req.query.city) : 'all',
            ...analytics.summarize(rows),
            // السلسلة اليومية: المجموع يقول «كم»، والسلسلة تقول «إلى أين يتجه»
            daily: rows
        });
    } catch (e) {
        logger.error({ err: e.message }, 'admin analytics failed');
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
