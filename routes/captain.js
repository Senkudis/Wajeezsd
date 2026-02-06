const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { protect } = require('../middleware/authMiddleware');

// ==========================================
// 📊 1. إحصائيات الكابتن (للداشبورد)
// ==========================================
router.get('/stats', protect, async (req, res) => {
    try {
        const userRole = req.user.role ? req.user.role.toLowerCase().trim() : '';
        if (userRole !== 'captain') {
            return res.status(403).json({ message: 'غير مصرح - يجب أن تكون كابتن' });
        }

        const completedCount = await Order.countDocuments({
            captain: req.user._id,
            status: 'delivered'
        });

        const earningsResult = await Order.aggregate([
            { $match: { captain: req.user._id, status: 'delivered' } },
            {
                $group: {
                    _id: null,
                    total: { $sum: { $cond: [{ $gt: ["$netRevenue", 0] }, "$netRevenue", "$price"] } }
                }
            }
        ]);

        const earnings = earningsResult.length > 0 ? earningsResult[0].total : 0;

        res.json({
            completedCount,
            earnings,
            rating: req.user.averageRating || 5.0,
            ratingCount: req.user.ratingCount || 0,
            isActive: req.user.isActive // ✅ Send current status
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 👤 2. بيانات البروفايل والإنجازات
// ==========================================
router.get('/profile-details', protect, async (req, res) => {
    try {
        const userRole = req.user.role ? req.user.role.toLowerCase().trim() : '';
        if (userRole !== 'captain') {
            return res.status(403).json({ message: 'غير مصرح - يجب أن تكون كابتن' });
        }

        // حساب الإحصائيات (الأرباح والطلبات)
        const stats = await Order.aggregate([
            { $match: { captain: req.user._id, status: 'delivered' } },
            {
                $group: {
                    _id: null,
                    totalEarnings: { $sum: "$price" },
                    totalOrders: { $sum: 1 }
                }
            }
        ]);

        const result = stats.length > 0 ? stats[0] : { totalEarnings: 0, totalOrders: 0 };

        // إرسال البيانات
        res.json({
            name: req.user.name,
            email: req.user.email,
            phone: req.user.phone,
            vehicleType: req.user.vehicleType || 'غير محدد',
            totalOrders: result.totalOrders,
            totalEarnings: result.totalEarnings,
            joinDate: req.user.createdAt
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 📍 3. جلب الكباتن القريبين (للخريطة)
// ==========================================
// ==========================================
// 📍 3. جلب الكباتن المتاحين (للخريطة - LIVE)
// ==========================================
router.get('/available', async (req, res) => {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        const captains = await require('../models/User').find({
            role: 'captain',
            isActive: true,
            'currentLocation.lat': { $exists: true },
            'currentLocation.lng': { $exists: true },
            'currentLocation.updatedAt': { $gte: fiveMinutesAgo } // 🛡️ Stale check
        }).select('name phone vehicleType currentLocation');

        res.json(captains);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// (Deprecated/Legacy)
router.get('/nearby', async (req, res) => {
    try {
        // نرجع الكباتن (Active) ولديهم موقع مسجل
        const captains = await require('../models/User').find({
            role: 'captain',
            isActive: true,
            'currentLocation.lat': { $exists: true },
            'currentLocation.lng': { $exists: true }
        }).select('name phone vehicleType currentLocation');

        res.json(captains);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 🔄 4. تغيير حالة التوافر (Availability Toggle)
// ==========================================
router.put('/toggle-availability', protect, async (req, res) => {
    try {
        const { isActive } = req.body;

        // Update user status
        const captain = await require('../models/User').findByIdAndUpdate(
            req.user._id,
            { isActive: isActive },
            { new: true }
        ).select('isActive name');

        // Emit global event for map updates
        const io = req.app.get('io');
        if (io) {
            io.emit('captain_status_changed', { userId: req.user._id, isActive: captain.isActive });
        }

        res.json({ message: 'Status updated', isActive: captain.isActive });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 📜 Trip History with Pagination
// ==========================================
router.get('/trips', protect, async (req, res) => {
    try {
        const userRole = req.user.role ? req.user.role.toLowerCase().trim() : '';
        if (userRole !== 'captain') {
            return res.status(403).json({ message: 'غير مصرح - يجب أن تكون كابتن' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        if (page < 1 || limit < 1 || limit > 100) {
            return res.status(400).json({ message: 'معاملات الصفحة غير صحيحة' });
        }

        const orders = await Order.find({ captain: req.user._id, status: 'delivered' })
            .populate('client', 'name phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Order.countDocuments({ captain: req.user._id, status: 'delivered' });

        let commissionRate = 0.15;
        try {
            const Settings = require('../models/Settings');
            const settings = await Settings.getSettings();
            commissionRate = settings?.commissionRate || 0.15;
        } catch (error) {
            console.error('Settings load error:', error);
        }

        const tripsWithProfit = orders.map(order => {
            const orderObj = order.toObject();
            const commission = orderObj.price * commissionRate;
            const netProfit = orderObj.price - commission;
            return {
                ...orderObj,
                commission: Math.round(commission),
                netProfit: Math.round(netProfit)
            };
        });

        res.json({
            trips: tripsWithProfit,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching trips:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;