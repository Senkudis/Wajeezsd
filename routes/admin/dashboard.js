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
// @desc    إرسال إشعار لمستخدم محدد أو لمجموعة

router.get('/dashboard-limited', protect, adminOnly, async (req, res) => {
    try {
        // 🌍 الأدمن المساعد يرى أرقام مدينته فقط
        const cityFilter = getAdminCityFilter(req);
        const [totalOrders, activeOrders, totalCaptains, pendingCaptains] = await Promise.all([
            Order.countDocuments({ ...cityFilter }),
            Order.countDocuments({ status: { $in: ['pending', 'accepted', 'picked_up'] }, ...cityFilter }),
            User.countDocuments({ role: 'captain', isActive: true, ...cityFilter }),
            User.countDocuments({ role: 'captain', approvalStatus: 'pending', ...cityFilter })
        ]);
        res.json({ totalOrders, activeOrders, totalCaptains, pendingCaptains });
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
