const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Settings = require('../models/Settings'); // ✅ Changed from Setting to Settings
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { normalizePhone } = require('../utils/phoneNormalizer'); // ✅ Fixed import consistency

// تم استيراد adminOnly من الميدل وير


// =========================================================
// 📊 الجزء الأول: الإحصائيات والداشبورد (Dashboard)
// =========================================================

// @route   GET /api/admin/dashboard
// @desc    جلب إحصائيات النظام الشاملة وآخر 5 طلبات
router.get('/dashboard', protect, adminOnly, async (req, res) => {
    try {
        // 1. حساب العدادات
        const captainsCount = await User.countDocuments({ role: 'captain' });
        const customersCount = await User.countDocuments({ role: { $in: ['client', 'customer'] } });
        const ordersCount = await Order.countDocuments({});

        // 2. حساب الأرباح (الأكثر أهمية: يحسب فقط الطلبات المسلمة)
        const revenueResult = await Order.aggregate([
            { $match: { status: 'delivered' } }, // شرط: الحالة "تم التسليم" فقط
            { $group: { _id: null, total: { $sum: "$appFee" } } } // ✅ حساب صافي أرباح التطبيق فقط
        ]);
        // إذا لم توجد طلبات مسلمة، تكون النتيجة 0
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

        // 2.5 حساب توزيع الطلبات حسب الحالة (للرسوم البيانية)
        const ordersByStatusResult = await Order.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);

        // تحويل النتيجة إلى كائن سهل الاستخدام
        const ordersByStatus = {
            pending: 0,
            accepted: 0,
            delivered: 0,
            cancelled: 0
        };

        ordersByStatusResult.forEach(item => {
            if (ordersByStatus.hasOwnProperty(item._id)) {
                ordersByStatus[item._id] = item.count;
            }
        });

        // 3. جلب آخر 5 طلبات (للداشبورد المختصر)
        const recentOrders = await Order.find()
            .populate('client', 'name phone') // جلب بيانات العميل
            .populate('captain', 'name phone') // جلب بيانات الكابتن
            .sort({ createdAt: -1 }) // الأحدث أولاً
            .limit(5);

        res.json({
            stats: {
                captains: captainsCount,
                customers: customersCount,
                orders: ordersCount,
                revenue: totalRevenue
            },
            ordersByStatus,
            recentOrders
        });

    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({ message: 'حدث خطأ في السيرفر' });
    }
});

// @route   GET /api/admin/user/:id
// @desc    جلب بيانات مستخدم محدد
router.get('/user/:id', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// =========================================================
// 👥 الجزء الثاني: إدارة المستخدمين
// =========================================================

// @route   GET /api/admin/users
// @desc    جلب جميع المستخدمين
router.get('/users', protect, adminOnly, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/admin/captains
// @desc    جلب الكباتن فقط
router.get('/captains', protect, adminOnly, async (req, res) => {
    try {
        const captains = await User.find({ role: 'captain' }).select('-password');
        res.json(captains);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/admin/user/:id/status
// @desc    تفعيل أو تعطيل حساب مستخدم
router.put('/user/:id/status', protect, adminOnly, async (req, res) => {
    try {
        // حماية: منع الأدمن من تعطيل نفسه
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ message: 'لا يمكنك تعطيل حسابك الشخصي!' });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        user.isActive = !user.isActive; // عكس الحالة الحالية
        await user.save();

        res.json({
            message: `تم ${user.isActive ? 'تفعيل' : 'تعطيل'} الحساب بنجاح`,
            isActive: user.isActive,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// =========================================================
// 📦 الجزء الثالث: الطلبات (سجل الطلبات الكامل)
// =========================================================

// @route   GET /api/admin/orders
// @desc    جلب جميع الطلبات (لصفحة السجل الكامل)
router.get('/orders', protect, adminOnly, async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('client', 'name phone')
            .populate('captain', 'name phone')
            .sort({ createdAt: -1 }); // الأحدث أولاً

        res.json(orders);
    } catch (error) {
        console.error("Orders Error:", error);
        res.status(500).json({ message: 'Server error' });
    }
});

// =========================================================
// 🚩 الجزء الرابع: الشكاوى
// =========================================================

// @route   GET /api/admin/complaints
// @desc    جلب الطلبات التي بها شكاوى
router.get('/complaints', protect, adminOnly, async (req, res) => {
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
router.put('/complaints/:id/resolve', protect, adminOnly, async (req, res) => {
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
router.post('/create-captain', protect, adminOnly, async (req, res) => {
    try {
        const { name, email, phone, password, vehicleType } = req.body;

        // تنسيق رقم الهاتف
        const normalizedPhone = normalizePhone(phone);
        console.log(`📞 Create Captain - Original: ${phone}, Normalized: ${normalizedPhone}`);

        // التحقق من وجود المستخدم مسبقاً
        const userExists = await User.findOne({ $or: [{ email }, { phone: normalizedPhone }] });
        if (userExists) {
            return res.status(400).json({ message: 'المستخدم موجود بالفعل (البريد أو الهاتف مسجل مسبقاً)' });
        }

        // إنشاء المستخدم
        const user = await User.create({
            name,
            email,
            phone: normalizedPhone, // استخدام الرقم المنسق
            password, // يفترض أن الموديل يقوم بتشفير كلمة المرور تلقائياً
            role: 'captain',
            vehicleType, // تأكد أن هذا الحقل موجود في المودل الخاص بك، أو احذفه إذا لم يكن موجوداً
            isActive: true, // تفعيل الحساب مباشرة
            isVerified: true
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                message: "تم إنشاء حساب الكابتن بنجاح"
            });
        } else {
            res.status(400).json({ message: 'بيانات المستخدم غير صحيحة' });
        }

    } catch (error) {
        console.error("Create Captain Error:", error);
        res.status(500).json({ message: 'حدث خطأ في السيرفر' });
    }
});
// @route   PUT /api/admin/orders/:id/cancel-force
router.put('/orders/:id/cancel-force', protect, adminOnly, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        order.status = 'cancelled';
        await order.save();
        res.json({ message: 'تم إلغاء الطلب إجبارياً بواسطة الإدارة', order });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// ⚙️ الجزء الخامس: الإعدادات (Settings)
// =========================================================

// @route   GET /api/admin/settings
// @desc    جلب الإعدادات
router.get('/settings', protect, adminOnly, async (req, res) => {
    try {
        const settings = await Settings.getSettings();
        res.json(settings);
    } catch (error) {
        console.error("Settings Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/settings
// @desc    تحديث الإعدادات
router.put('/settings', protect, adminOnly, async (req, res) => {
    try {
        const { baseFare, costPerKm, costPerMinute, commissionRate, profitPercentage, adminPhone } = req.body;

        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({
                baseFare,
                costPerKm,
                costPerMinute,
                commissionRate,
                profitPercentage,
                adminPhone,
                updatedBy: req.user._id
            });
        } else {
            Object.assign(settings, {
                baseFare,
                costPerKm,
                costPerMinute,
                commissionRate,
                profitPercentage,
                adminPhone,
                updatedBy: req.user._id,
                updatedAt: Date.now()
            });
            await settings.save();
        }

        res.json({ message: 'تم تحديث الإعدادات بنجاح', settings });
    } catch (error) {
        console.error("Settings Update Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 🗑️ الجزء السادس: الحذف والتعديل الشامل (Super Admin)
// =========================================================

// @route   DELETE /api/admin/users/:id
// @desc    حذف مستخدم نهائياً
router.delete('/users/:id', protect, adminOnly, async (req, res) => {
    try {
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ message: 'لا يمكنك حذف حسابك الشخصي!' });
        }
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
        res.json({ message: 'تم حذف المستخدم بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/users/:id
// @desc    تعديل بيانات المستخدم شاملة
router.put('/users/:id', protect, adminOnly, async (req, res) => {
    try {
        const { name, email, phone, role, wallet, vehicleType } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

        user.name = name || user.name;
        user.email = email || user.email;
        user.phone = phone || user.phone;
        user.role = role || user.role;
        user.wallet = wallet !== undefined ? wallet : user.wallet;

        if (role === 'captain' && vehicleType) {
            user.vehicleType = vehicleType;
        }

        if (req.body.password) {
            const bcrypt = require('bcryptjs');
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(req.body.password, salt);
        }

        await user.save();
        res.json({ message: 'تم تحديث بيانات المستخدم بنجاح', user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   DELETE /api/admin/orders/:id
// @desc    حذف طلب نهائياً
router.delete('/orders/:id', protect, adminOnly, async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
        res.json({ message: 'تم حذف الطلب بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/orders/:id
// @desc    تعديل بيانات الطلب شاملة
router.put('/orders/:id', protect, adminOnly, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        // تحديث الحقول المسموح بها
        if (req.body.status) order.status = req.body.status;
        if (req.body.price) order.price = req.body.price;
        if (req.body.appFee) order.appFee = req.body.appFee;

        // تحديث تفاصيل الاستلام والتسليم إذا وجدت
        if (req.body.pickup) order.pickup = { ...order.pickup, ...req.body.pickup };
        if (req.body.dropoff) order.dropoff = { ...order.dropoff, ...req.body.dropoff };

        await order.save();
        res.json({ message: 'تم تحديث الطلب بنجاح', order });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

router.get('/emergency-alerts', protect, adminOnly, async (req, res) => {
    try {
        const EmergencyAlert = require('../models/EmergencyAlert');
        const alerts = await EmergencyAlert.find().populate('captain', 'name phone').sort({ createdAt: -1 }).limit(50);
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ message: 'خطأ' });
    }
});

// @route   GET /api/admin/active-captains
// @desc    Get all captains with location data (for live map)
router.get('/active-captains', protect, adminOnly, async (req, res) => {
    try {
        const captains = await User.find({ role: 'captain' }).select('name phone isActive currentLocation');

        const result = captains.map(captain => ({
            _id: captain._id,
            name: captain.name,
            phone: captain.phone,
            isActive: captain.isActive,
            location: captain.currentLocation
        }));

        res.json(result);
    } catch (error) {
        console.error("Live Map Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;