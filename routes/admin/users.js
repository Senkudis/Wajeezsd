// routes/admin/users.js — مُولّد من تقسيم admin.js الأصلي.
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
const { protect, adminOnly, superAdminOnly, requirePermission, requireAnyPermission, getAdminCityFilter, resolveCreationCity, adminCanActOnUser } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const { normalizePhone } = require('../../utils/phoneNormalizer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');
const SessionRequest = require('../../models/SessionRequest');
const Place = require('../../models/Place');
const Product = require('../../models/Product');

router.get('/user/:id', protect, requireAnyPermission(['view_users', 'view_captains', 'manage_captains', 'manage_users']), async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }
        // 🌍 sub_admin لا يطّلع على مستخدم خارج مدينته
        if (!adminCanActOnUser(req, user)) {
            return res.status(403).json({ message: 'غير مصرح — هذا المستخدم خارج مدينتك' });
        }
        res.json(user);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// =========================================================
// 👥 الجزء الثاني: إدارة المستخدمين
// =========================================================

// @route   GET /api/admin/users
// @desc    جلب جميع المستخدمين (مع فلتر اختياري بالمدينة)
// 🌍 ?city=Khartoum | PortSudan (optional, no city = all cities)

router.get('/users', protect, requirePermission('view_users'), async (req, res) => {
    try {
        // 🌍 sub_admin يرى مستخدمي مدينته فقط
        const users = await User.find(getAdminCityFilter(req)).select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/admin/captains
// @desc    جلب الكباتن فقط (مع فلتر اختياري بالمدينة)
// 🌍 ?city=Khartoum | PortSudan (optional)

router.get('/captains', protect, requirePermission('view_captains'), async (req, res) => {
    try {
        // 🌍 sub_admin يرى كباتن مدينته فقط
        const captains = await User.find({ role: 'captain', ...getAdminCityFilter(req) }).select('-password');
        res.json(captains);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/admin/merchants-list
// @desc    لائحة التجار مع بياناتهم: الاسم، الهاتف، اسم المتجر، الفئة، عدد المنتجات
// 🔐 صلاحية: view_stores

router.get('/merchants-list', protect, requireAnyPermission(['view_stores', 'manage_stores']), async (req, res) => {
    try {
        const cityFilter = getAdminCityFilter(req);

        // جلب جميع التجار (بكل حالات الاعتماد — الفلترة تتم في الواجهة)
        const merchants = await User.find({
            role: 'merchant',
            ...cityFilter
        }).select('name phone city approvalStatus isActive createdAt').lean();

        if (!merchants.length) return res.json({ merchants: [] });

        const merchantIds = merchants.map(m => m._id);

        // جلب متاجرهم مع الفئة
        const places = await Place.find({ ownerId: { $in: merchantIds } })
            .select('name ownerId category city isActive shopWalletBalance tier')
            .populate('category', 'name icon')
            .lean();

        // جلب عدد المنتجات لكل متجر
        const placeIds = places.map(p => p._id);
        const productCounts = await Product.aggregate([
            { $match: { placeId: { $in: placeIds } } },
            { $group: { _id: '$placeId', count: { $sum: 1 } } }
        ]);
        const countMap = {};
        productCounts.forEach(pc => { countMap[pc._id.toString()] = pc.count; });

        // ربط البيانات — ownerId ليس فريداً في Place، فالتاجر قد يملك أكثر من متجر.
        // التجميع في مصفوفة بدل الدهس الذي كان يُسقط كل المتاجر عدا الأخير.
        const placesByOwner = {};
        places.forEach(p => {
            const key = p.ownerId.toString();
            (placesByOwner[key] || (placesByOwner[key] = [])).push(p);
        });

        const toStore = p => ({
            id: p._id,
            name: p.name,
            category: p.category ? p.category.name : 'غير مصنّف',
            categoryIcon: p.category ? p.category.icon : 'bi-shop',
            isActive: p.isActive,
            tier: p.tier,
            walletBalance: p.shopWalletBalance,
            productCount: countMap[p._id.toString()] || 0
        });

        const result = merchants.map(m => {
            const owned = (placesByOwner[m._id.toString()] || []).map(toStore);
            return {
                merchantId: m._id,
                name: m.name,
                phone: m.phone,
                city: m.city,
                approvalStatus: m.approvalStatus,
                isActive: m.isActive,
                joinedAt: m.createdAt,
                // store: المتجر الأساسي — يبقى للتوافق مع الواجهة الحالية
                store: owned[0] || null,
                stores: owned,
                storeCount: owned.length,
                // مجموع منتجات كل متاجر التاجر (لا الأول فقط)
                totalProductCount: owned.reduce((s, st) => s + st.productCount, 0)
            };
        });

        res.json({ merchants: result, total: result.length });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/admin/user/:id/city
// @desc    Reassign a user (client or captain) to a different city.
//          Use this when a user registered with the wrong city or moved.
// 🌍 Body: { city: 'Khartoum' | 'PortSudan' }

router.put('/user/:id/city', protect, superAdminOnly, async (req, res) => {
    try {
        const VALID_CITIES = ['Khartoum', 'PortSudan'];
        const { city } = req.body;

        if (!VALID_CITIES.includes(city)) {
            return res.status(400).json({
                message: `مدينة غير صحيحة. القيم المقبولة: ${VALID_CITIES.join(', ')}`
            });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
        if (user.role === 'admin') return res.status(403).json({ message: 'لا يمكن تغيير مدينة حساب الأدمن' });

        const oldCity = user.city;
        user.city = city;
        await user.save();

        logger.info({ adminId: req.user._id, userId: user._id, from: oldCity, to: city }, 'Admin reassigned user city');

        res.json({
            message: `تم تغيير مدينة المستخدم من ${oldCity} إلى ${city} بنجاح`,
            user: { _id: user._id, name: user.name, role: user.role, city: user.city }
        });
    } catch (error) {
        logger.error({ err: error }, 'City reassignment error');
        res.status(500).json({ message: 'Server error' });
    }
});

// @desc    تفعيل أو تعطيل حساب مستخدم

router.put('/user/:id/status', protect, requireAnyPermission(['manage_captains', 'manage_users']), async (req, res) => {
    try {
        // حماية: منع الأدمن من تعطيل نفسه
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ message: 'لا يمكنك تعطيل حسابك الشخصي!' });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // 🌍 sub_admin لا يعدّل مستخدماً خارج مدينته
        if (!adminCanActOnUser(req, user)) {
            return res.status(403).json({ message: 'غير مصرح — هذا المستخدم خارج مدينتك' });
        }

        user.isActive = !user.isActive; // عكس الحالة الحالية
        await user.save();

        res.json({
            message: `تم ${user.isActive ? 'تفعيل' : 'تعطيل'} الحساب بنجاح`,
            isActive: user.isActive,
        });

    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/admin/user/:id/verify
// @desc    تفعيل/إلغاء تفعيل حساب يدوياً (OTP) — لعملاء لم تصلهم رسالة SMS من المزود
router.put('/user/:id/verify', protect, requireAnyPermission(['manage_captains', 'manage_users']), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // 🌍 sub_admin لا يعدّل مستخدماً خارج مدينته
        if (!adminCanActOnUser(req, user)) {
            return res.status(403).json({ message: 'غير مصرح — هذا المستخدم خارج مدينتك' });
        }

        user.isVerified = !user.isVerified; // عكس الحالة الحالية
        if (user.isVerified) {
            // تنظيف أكواد التفعيل المعلقة حتى لا تبقى صالحة بعد التفعيل اليدوي
            user.verificationCode = undefined;
            user.verificationCodeExpires = undefined;
            user.otpCode = undefined;
            user.otpExpires = undefined;
        }
        await user.save();

        logger.info({ admin: req.user._id, userId: user._id, isVerified: user.isVerified }, 'Admin toggled account verification');

        res.json({
            message: user.isVerified
                ? 'تم تفعيل الحساب يدوياً — يمكن للمستخدم الدخول الآن مباشرة'
                : 'تم إلغاء تفعيل الحساب — سيُطلب منه كود OTP عند الدخول',
            isVerified: user.isVerified,
        });

    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// =========================================================
// 📦 الجزء الثالث: الطلبات (سجل الطلبات الكامل)
// =========================================================

// @route   GET /api/admin/orders/live
// @desc    جلب الطلبات النشطة فقط (مع فلتر اختياري بالمدينة)
// 🌍 ?city=Khartoum | PortSudan (optional)

router.post('/create-captain', protect, requirePermission('manage_captains'), async (req, res) => {
    try {
        const { name, email, phone, password, vehicleType, city } = req.body;

        // 🌍 sub_admin يُنشئ الكابتن في مدينته إجبارياً؛ super_admin يحدّد المدينة
        const captainCity = resolveCreationCity(req, city);

        // تنسيق رقم الهاتف
        const normalizedPhone = normalizePhone(phone);
        logger.info(`📞 Create Captain - Original: ${phone}, Normalized: ${normalizedPhone}, City: ${captainCity}`);

        // التحقق من وجود المستخدم مسبقاً
        const userExists = await User.findOne({ $or: [{ email }, { phone: normalizedPhone }] });
        if (userExists) {
            return res.status(400).json({ message: 'المستخدم موجود بالفعل (البريد أو الهاتف مسجل مسبقاً)' });
        }

        // إنشاء المستخدم
        const user = await User.create({
            name,
            email,
            phone: normalizedPhone,
            password,
            role: 'captain',
            vehicleType,
            city: captainCity,   // 🌍 City stamp
            isActive: true,
            isVerified: true,
            approvalStatus: 'approved'
        });

        if (user) {
            await logAdminAction(req, 'create_captain',
                `تم إضافة كابتن جديد: ${name}`,
                user._id, name, { phone: normalizedPhone, city: captainCity, vehicleType }
            );
            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                city: user.city,
                message: `تم إنشاء حساب الكابتن بنجاح في مدينة ${captainCity}`
            });
        } else {
            res.status(400).json({ message: 'بيانات المستخدم غير صحيحة' });
        }

    } catch (error) {
        logger.error("Create Captain Error:", error);
        res.status(500).json({ message: 'حدث خطأ في السيرفر' });
    }
});

// @route   PUT /api/admin/orders/:id/cancel-force

router.get('/pending-captains', protect, requirePermission('view_captains'), async (req, res) => {
    try {
        // 🌍 sub_admin يرى طلبات مدينته فقط
        const captains = await User.find({ role: 'captain', approvalStatus: 'pending', ...getAdminCityFilter(req) })
            .select('-password')
            .sort({ createdAt: -1 });
        res.json(captains);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/approve-captain/:id

router.put('/approve-captain/:id', protect, requirePermission('manage_captains'), async (req, res) => {
    try {
        const captain = await User.findById(req.params.id);
        if (!captain) return res.status(404).json({ message: 'الكابتن غير موجود' });
        if (captain.role !== 'captain') return res.status(400).json({ message: 'هذا المستخدم ليس كابتن' });
        if (!adminCanActOnUser(req, captain)) return res.status(403).json({ message: 'غير مصرح — هذا الكابتن خارج مدينتك' });

        captain.approvalStatus = 'approved';
        captain.isVerified = true;
        captain.isActive = true;
        await captain.save();

        await logAdminAction(req, 'approve_captain',
            `تم قبول الكابتن: ${captain.name}`,
            captain._id, captain.name
        );

        // Notify captain
        const { sendNotification } = require('../../utils/notificationHelper');
        await sendNotification(req.app, {
            userId: captain._id,
            title: '🎉 تمت الموافقة على طلبك!',
            message: 'تم قبولك ككابتن في وجيز. يمكنك الآن تسجيل الدخول والبدء في استقبال الطلبات!',
            type: 'system',
            relatedId: captain._id
        });

        res.json({ message: 'تمت الموافقة على الكابتن بنجاح', captain });
    } catch (error) {
        logger.error('Approve Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});


// @route   PUT /api/admin/reject-captain/:id

router.put('/reject-captain/:id', protect, requirePermission('manage_captains'), async (req, res) => {
    try {
        const { reason } = req.body;
        const captain = await User.findById(req.params.id);
        if (!captain) return res.status(404).json({ message: 'الكابتن غير موجود' });
        if (captain.role !== 'captain') return res.status(400).json({ message: 'هذا المستخدم ليس كابتن' });
        if (!adminCanActOnUser(req, captain)) return res.status(403).json({ message: 'غير مصرح — هذا الكابتن خارج مدينتك' });

        captain.approvalStatus = 'rejected';
        captain.rejectionReason = reason || 'لم يتم تحديد السبب';
        captain.isActive = false;
        await captain.save();

        await logAdminAction(req, 'reject_captain',
            `تم رفض طلب الكابتن: ${captain.name}`,
            captain._id, captain.name, { reason: captain.rejectionReason }
        );

        const { sendNotification } = require('../../utils/notificationHelper');
        await sendNotification(req.app, {
            userId: captain._id,
            title: '❌ تم رفض طلبك',
            message: `سبب الرفض: ${captain.rejectionReason}`,
            type: 'system',
            relatedId: captain._id
        });

        res.json({ message: 'تم رفض طلب الكابتن', captain });
    } catch (error) {
        logger.error('Reject Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});


// =========================================================
// 📒 سجل الحركات المالية الشامل (Financial Ledger)
// =========================================================

// @route   GET /api/admin/ledger
// @desc    آخر 100 حركة مالية (عمولات الطلبات + تعديلات الديون)
// 🌍 ?city=Khartoum | PortSudan | all (اختياري)
// 📅 ?from=YYYY-MM-DD&to=YYYY-MM-DD (اختياري)

router.delete('/users/:id', protect, requireAnyPermission(['manage_captains', 'manage_users']), async (req, res) => {
    try {
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ message: 'لا يمكنك حذف حسابك الشخصي!' });
        }
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

        // حذف حسابات الأدمن يتم من إدارة الأدمن المساعدين فقط
        if (user.role === 'admin') {
            return res.status(403).json({ message: 'لا يمكن حذف حساب أدمن من هنا' });
        }
        // 🌍 sub_admin لا يحذف مستخدماً خارج مدينته
        if (!adminCanActOnUser(req, user)) {
            return res.status(403).json({ message: 'غير مصرح — هذا المستخدم خارج مدينتك' });
        }

        await user.deleteOne();
        res.json({ message: 'تم حذف المستخدم بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/users/:id
// @desc    تعديل بيانات المستخدم شاملة

router.put('/users/:id', protect, requireAnyPermission(['manage_captains', 'manage_users']), async (req, res) => {
    try {
        const { name, email, phone, role, wallet, vehicleType } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

        // 🌍 sub_admin لا يعدّل مستخدماً خارج مدينته
        if (!adminCanActOnUser(req, user)) {
            return res.status(403).json({ message: 'غير مصرح — هذا المستخدم خارج مدينتك' });
        }
        // الأدمن المساعد ممنوع من تغيير المدينة/الدور/الحقول المالية (صلاحيات المسؤول الرئيسي)
        const isSubAdmin = req.user.adminRole === 'sub_admin';

        // ⚠️ Safety: allow 'admin' role only — no other invalid roles
        const validRoles = ['client', 'captain', 'merchant', 'admin'];
        if (role !== undefined && !validRoles.includes(role)) {
            return res.status(400).json({ message: 'قيمة الدور غير صالحة' });
        }

        user.name   = name   || user.name;
        user.email  = email  || user.email;
        user.phone  = phone  || user.phone;
        if (!isSubAdmin) {
            user.role = role || user.role;
            if (req.body.city !== undefined) user.city = req.body.city;
        }
        user.wallet = wallet !== undefined ? wallet : user.wallet;

        // 💳 Financial fields — للمسؤول الرئيسي فقط
        if (!isSubAdmin) {
            if (req.body.wallet_balance !== undefined) {
                const parsedBalance = Number(req.body.wallet_balance);
                if (!isNaN(parsedBalance)) user.wallet_balance = parsedBalance;
            }
            if (req.body.credit_limit !== undefined) {
                const parsedLimit = Number(req.body.credit_limit);
                if (!isNaN(parsedLimit)) user.credit_limit = parsedLimit;
            }
            if (req.body.is_blocked !== undefined) {
                user.is_blocked = Boolean(req.body.is_blocked);
            }
        }

        if (role === 'captain' && vehicleType) {
            user.vehicleType = vehicleType;
        }

        // ✅ FIX: Set password directly — the pre('save') hook in User.js will hash it
        if (req.body.password) {
            user.password = req.body.password;
        }

        await user.save();
        
        const userObj = user.toObject();
        delete userObj.password;
        delete userObj.fcmToken;
        delete userObj.resetCode;
        delete userObj.verificationCode;
        
        res.json({ message: 'تم تحديث بيانات المستخدم بنجاح', user: userObj });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   DELETE /api/admin/orders/:id
// @desc    حذف طلب نهائياً

router.get('/users/search', protect, requireAnyPermission(['send_notifications', 'view_users', 'view_captains']), async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q || q.length < 2) return res.json([]);

        const users = await User.find({
            $or: [
                { name: { $regex: q, $options: 'i' } },
                { phone: { $regex: q, $options: 'i' } }
            ],
            role: { $in: ['client', 'captain', 'merchant'] },
            ...getAdminCityFilter(req) // 🌍 sub_admin يبحث في مدينته فقط
        })
        .select('name phone role fcmToken')
        .limit(10);

        res.json(users);
    } catch (err) {
        logger.error('User Search Error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/admin/broadcast
// @desc    إرسال إشعار جماعي أو مخصص
// target: 'all' | 'clients' | 'captains' | 'merchants' | 'user'
// userId: required when target === 'user'

module.exports = router;
