// routes/admin/dashboard.js — مُولّد من تقسيم admin.js الأصلي.
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
const { protect, adminOnly, superAdminOnly, requirePermission, requireAnyPermission, getAdminCityFilter } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const { normalizePhone } = require('../../utils/phoneNormalizer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');

const SessionRequest = require('../../models/SessionRequest');

let _dashboardCache = null;
let _dashboardCacheTime = 0;
const DASHBOARD_CACHE_TTL = 30000; // 30 seconds

// 🔒 اللوحة الكاملة (أرباح + عملاء) للمسؤول الرئيسي أو من يملك view_revenue فقط.
// الأدمن المساعد يستخدم /dashboard-limited بدلاً منها.
router.get('/dashboard', protect, requirePermission('view_revenue'), async (req, res) => {
    try {
        const now = Date.now();
        if (_dashboardCache && (now - _dashboardCacheTime) < DASHBOARD_CACHE_TTL) {
            return res.json(_dashboardCache);
        }

        // تشغيل جميع الاستعلامات في وقت واحد لتسريع التحميل
        const [
            captainsCount,
            customersCount,
            ordersCount,
            revenueResult,
            debtSummary,
            ordersByStatusResult,
            recentOrders,
            cityStats
        ] = await Promise.all([
            User.countDocuments({ role: 'captain' }),
            User.countDocuments({ role: { $in: ['client', 'customer'] } }),
            Order.countDocuments({}),
            Order.aggregate([
                { $match: { status: 'delivered' } },
                { $group: { _id: null, total: { $sum: "$appFee" } } }
            ]),
            require('../../models/DebtAdjustment').aggregate([
                { $group: { _id: '$mode', total: { $sum: '$amount' } } }
            ]),
            Order.aggregate([
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ]),
            Order.find()
                .select('status price pickup dropoff createdAt client captain city')
                .populate('client', 'name phone')
                .populate('captain', 'name phone')
                .sort({ createdAt: -1 })
                .limit(5)
                .lean(),
            // 🌍 Per-city breakdown for admin panel city selector
            Promise.all(['Khartoum', 'PortSudan'].map(async (c) => ({
                city: c,
                captains: await User.countDocuments({ role: 'captain', city: c }),
                clients:  await User.countDocuments({ role: { $in: ['client', 'customer'] }, city: c }),
                orders:   await Order.countDocuments({ city: c }),
                revenue:  await Order.aggregate([
                    { $match: { status: 'delivered', city: c } },
                    { $group: { _id: null, total: { $sum: '$appFee' } } }
                ]).then(r => r[0]?.total ?? 0)
            })))
        ]);

        const ordersRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

        let debtAdded = 0;
        let debtForgiven = 0;
        debtSummary.forEach(row => {
            if (row._id === 'add') debtAdded = row.total;
            else debtForgiven += row.total;
        });

        const totalRevenue = ordersRevenue + debtAdded - debtForgiven;

        const ordersByStatus = {
            pending: 0, scheduled: 0, accepted: 0,
            picked_up: 0, delivered: 0, cancelled: 0
        };
        ordersByStatusResult.forEach(item => {
            if (ordersByStatus.hasOwnProperty(item._id)) {
                ordersByStatus[item._id] = item.count;
            }
        });

        const responseData = {
            stats: {
                captains: captainsCount,
                customers: customersCount,
                orders: ordersCount,
                revenue: totalRevenue,
                revenueBreakdown: { ordersRevenue, debtAdded, debtForgiven, netRevenue: totalRevenue }
            },
            ordersByStatus,
            recentOrders,
            // 🌍 Per-city breakdown for the admin panel's city-selector UI
            cityBreakdown: cityStats
        };

        _dashboardCache = responseData;
        _dashboardCacheTime = now;

        res.json(responseData);

    } catch (error) {
        logger.error("Dashboard Error:", error);
        res.status(500).json({ message: 'حدث خطأ في السيرفر' });
    }
});

// @route   GET /api/admin/user/:id
// @desc    جلب بيانات مستخدم محدد

router.get('/emergency-alerts', protect, adminOnly, async (req, res) => {
    try {
        const EmergencyAlert = require('../../models/EmergencyAlert');
        // 🌍 الأدمن المساعد يرى نجدات مدينته فقط
        const alerts = await EmergencyAlert.find(getAdminCityFilter(req))
            .populate('captain', 'name phone')
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ message: 'خطأ' });
    }
});

// @route   GET /api/admin/active-captains
// @desc    Get all captains with location data (for live map)
// ✅ Returns ALL captains regardless of location freshness — Admin panel needs full visibility

router.get('/active-captains', protect, requireAnyPermission(['view_captains', 'view_map']), async (req, res) => {
    try {
        // 🌍 sub_admin يرى كباتن مدينته فقط؛ super_admin يفلتر اختيارياً عبر ?city
        const query = { role: 'captain', ...getAdminCityFilter(req) };

        const captains = await User.find(query)
            .select('name phone isActive currentLocation wallet_balance is_blocked credit_limit role vehicleType city documents.profilePhoto');

        const result = captains.map(captain => ({
            _id: captain._id,
            name: captain.name,
            phone: captain.phone,
            role: captain.role,
            vehicleType: captain.vehicleType,
            profilePhoto: captain.documents?.profilePhoto || null,
            isActive: captain.isActive,
            is_blocked: captain.is_blocked,
            wallet_balance: captain.wallet_balance,
            credit_limit: captain.credit_limit,
            location: captain.currentLocation,
            currentLocation: captain.currentLocation,
            // ✅ Calculate if location is fresh (updated within last 5 minutes)
            locationFresh: captain.currentLocation?.updatedAt
                ? (Date.now() - new Date(captain.currentLocation.updatedAt).getTime()) < 5 * 60 * 1000
                : false
        }));

        res.json(result);
    } catch (error) {
        logger.error("Live Map Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 🔔 إرسال الإشعارات (Admin Notifications)
// =========================================================

// @route   POST /api/admin/send-notification
// =========================================================
// 📊 GET /api/admin/scoped-stats — إحصاءات نطاق الأدمن
// =========================================================
// يوم / أسبوع / شهر، مقيّدةً بمدن الأدمن. المسؤول الرئيسي يرى الكل، أو
// مدينةً بعينها عبر ?city.
//
// ولماذا مسارٌ مستقل عن /dashboard: ذاك يحمل الأرباح الكاملة ويقتضي
// view_revenue، فكان الأدمن المساعد بلا أي إحصاءٍ إطلاقاً — يدير مدينةً
// ولا يعرف كم طلباً جاءها أمس. هذا يعطيه تفصيل عمله دون كشف الأرباح
// الكلّية: كلّ رقمٍ هنا عن مدينته وحدها.
router.get('/scoped-stats', protect, requirePermission('view_stats'), async (req, res) => {
    try {
        const RANGES = { day: 1, week: 7, month: 30 };
        const rangeKey = RANGES[req.query.range] ? req.query.range : 'week';
        const days = RANGES[rangeKey];

        const cityFilter = getAdminCityFilter(req);
        const since = new Date(Date.now() - days * 86400000);
        // الفترة السابقة بنفس الطول — بلا مقارنةٍ الرقمُ وحده لا يقول شيئاً
        const prevSince = new Date(Date.now() - days * 2 * 86400000);

        const base = { ...cityFilter, createdAt: { $gte: since } };
        const prev = { ...cityFilter, createdAt: { $gte: prevSince, $lt: since } };
        const canSeeMoney = req.user.adminRole !== 'sub_admin'
            || (req.user.permissions || []).includes('view_finance');

        const [
            byStatus, prevTotal, byDay, byCity, topCaptains,
            money, newCaptains, cancelReasons, avgAccept
        ] = await Promise.all([
            Order.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
            Order.countDocuments(prev),
            Order.aggregate([
                { $match: base },
                { $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    orders:    { $sum: 1 },
                    delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
                    cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                    revenue:   { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$price', 0] } }
                } },
                { $sort: { _id: 1 } }
            ]),
            Order.aggregate([
                { $match: base },
                { $group: { _id: '$city', orders: { $sum: 1 },
                    delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } } } }
            ]),
            Order.aggregate([
                { $match: { ...base, status: 'delivered', captain: { $ne: null } } },
                { $group: { _id: '$captain', trips: { $sum: 1 }, earned: { $sum: '$price' } } },
                { $sort: { trips: -1 } },
                { $limit: 8 },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'c' } },
                { $project: {
                    trips: 1, earned: 1,
                    name:  { $ifNull: [{ $arrayElemAt: ['$c.name', 0] }, 'كابتن'] },
                    city:  { $arrayElemAt: ['$c.city', 0] }
                } }
            ]),
            Order.aggregate([
                { $match: { ...base, status: 'delivered' } },
                { $group: { _id: null, gross: { $sum: '$price' }, fees: { $sum: '$appFee' } } }
            ]),
            User.countDocuments({ ...cityFilter, role: 'captain', createdAt: { $gte: since } }),
            Order.aggregate([
                { $match: { ...base, status: 'cancelled' } },
                { $group: { _id: { $ifNull: ['$cancelledBy', 'غير محدد'] }, count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            // زمن القبول: من إنشاء الطلب إلى قبول الكابتن — مقياس خدمةٍ مباشر
            Order.aggregate([
                { $match: { ...base, acceptedAt: { $ne: null } } },
                { $project: { mins: { $divide: [{ $subtract: ['$acceptedAt', '$createdAt'] }, 60000] } } },
                { $group: { _id: null, avg: { $avg: '$mins' }, n: { $sum: 1 } } }
            ])
        ]);

        const statusCounts = {};
        for (const r of byStatus) statusCounts[r._id] = r.count;
        const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
        const delivered = statusCounts.delivered || 0;
        const cancelled = statusCounts.cancelled || 0;

        res.json({
            range: rangeKey,
            days,
            cities: cityFilter.city
                ? (typeof cityFilter.city === 'string' ? [cityFilter.city] : cityFilter.city.$in)
                : ['Khartoum', 'PortSudan'],
            totals: {
                orders: total,
                delivered,
                cancelled,
                previousOrders: prevTotal,
                // النسبة أصدق من الفرق المطلق حين تختلف أحجام المدن
                deliveryRate: total ? +(delivered / total * 100).toFixed(1) : 0,
                cancelRate:   total ? +(cancelled / total * 100).toFixed(1) : 0,
                newCaptains,
                avgAcceptMinutes: avgAccept[0] ? +avgAccept[0].avg.toFixed(1) : null,
                acceptSampleSize: avgAccept[0] ? avgAccept[0].n : 0
            },
            // 💰 الأرقام المالية لا تُرسَل لمن لا يملك view_finance — الحجب
            //    في الخادم لا في الواجهة، فالواجهة تُتجاوَز.
            money: canSeeMoney
                ? { gross: (money[0] && money[0].gross) || 0, fees: (money[0] && money[0].fees) || 0 }
                : null,
            statusCounts,
            byDay,
            byCity,
            topCaptains,
            cancelReasons
        });
    } catch (error) {
        logger.error({ err: error }, 'scoped-stats error');
        res.status(500).json({ message: 'Server Error' });
    }
});


// @desc    إرسال إشعار لمستخدم محدد أو لمجموعة

router.get('/dashboard-limited', protect, adminOnly, async (req, res) => {
    try {
        // 🌍 الأدمن المساعد يرى أرقام مدينته فقط
        const cityFilter = getAdminCityFilter(req);
        const [totalOrders, activeOrders, totalCaptains, pendingCaptains, byStatus] = await Promise.all([
            Order.countDocuments({ ...cityFilter }),
            Order.countDocuments({ status: { $in: ['pending', 'accepted', 'picked_up'] }, ...cityFilter }),
            User.countDocuments({ role: 'captain', isActive: true, ...cityFilter }),
            // يشمل ترقيات العملاء: دورهم يبقى 'client' حتى القبول، فلا
            // يعدّهم الفلتر الأول — وكان العدّاد يُظهر صفراً وقائمةُ الطلبات
            // غير فارغة.
            User.countDocuments({
                ...cityFilter,
                $or: [
                    { role: 'captain', approvalStatus: 'pending' },
                    { 'captainApplication.status': 'pending' }
                ]
            }),
            // 📊 توزيع الحالات — كان غائباً عن هذا الردّ وحده، فتبقى اللوحة
            //    عند الأدمن المساعد دائرةَ تحميلٍ لا تنتهي (بلاغٌ منه حرفياً).
            Order.aggregate([
                { $match: { ...cityFilter } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ])
        ]);

        const ordersByStatus = {};
        for (const row of byStatus) ordersByStatus[row._id] = row.count;

        res.json({ totalOrders, activeOrders, totalCaptains, pendingCaptains, ordersByStatus });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 🎟️ إدارة كوبونات الخصم (Promo Codes)
// =========================================================
// 🔔 GET /api/admin/push-status — تشخيص صحة نظام إشعارات الـ Push
// =========================================================
router.get('/push-status', protect, adminOnly, async (req, res) => {
    try {
        const { isFirebaseReady } = require('../../utils/firebasePush');
        const firebaseConfigured = isFirebaseReady();

        const [totalUsers, usersWithToken, captainsWithToken] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ fcmToken: { $exists: true, $ne: null } }),
            User.countDocuments({ role: 'captain', fcmToken: { $exists: true, $ne: null } })
        ]);

        res.json({
            firebaseConfigured,                 // هل صلاحية Firebase مهيّأة (شرط الإرسال)
            pushEnabled: firebaseConfigured,    // الـ Push يعمل فعلياً فقط عند التهيئة
            tokens: {
                total: totalUsers,
                withFcmToken: usersWithToken,   // عدد من يمكن الوصول إليهم بالـ Push
                captainsWithToken
            },
            note: firebaseConfigured
                ? 'نظام الـ Push مهيّأ ويرسل.'
                : 'الـ Push معطّل: لم تُضبط صلاحية Firebase (service account). الإشعارات داخل التطبيق والفورية تعمل.'
        });
    } catch (err) {
        logger.error({ err }, 'push-status error');
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
