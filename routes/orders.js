const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings'); // ✅ Changed from Setting to Settings
const Rating = require('../models/Rating'); // New import for Rating model
const { protect } = require('../middleware/authMiddleware');
const { validateOrder, validateRating } = require('../middleware/validateMiddleware'); // Added validateRating
const nodemailer = require('nodemailer');
const { sendNotification } = require('../utils/notificationHelper');
const { sendWhatsAppIfSubscribed, OrderMessages } = require('../utils/whatsappNotificationHelper');
const rateLimit = require('express-rate-limit');

// Rate Limiter للطلبات الجديدة
const createOrderLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 3, // 3 requests per minute
    message: { message: 'Too many orders created. Please wait a moment.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false }
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// @route   POST /api/orders
// @desc    Create a new order (with duplicate check)
router.post('/', protect, createOrderLimiter, validateOrder, async (req, res) => {
    try {
        const { pickup, dropoff, details, price, distanceType } = req.body;

        // Duplicate Check
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        const duplicateOrder = await Order.findOne({
            client: req.user.id,
            price: price,
            'pickup.address': pickup.address,
            status: 'pending',
            createdAt: { $gt: oneMinuteAgo }
        });

        if (duplicateOrder) {
            return res.status(400).json({ message: 'You have already submitted this order recently' });
        }

        // ✅ Get profit percentage from unified Settings
        const settings = await Settings.getSettings();
        const profitPercent = settings.profitPercentage || settings.commissionRate * 100 || 10;

        const appFee = price * (profitPercent / 100); // حساب نسبة الأدمن ديناميكياً
        const netRevenue = price - appFee; // صافي الكابتن

        const order = await Order.create({
            client: req.user.id,
            pickup, dropoff, details, distanceType, price,
            appFee, netRevenue, parcelImage: req.body.parcelImage,
            status: 'pending'
        });

        // إشعار للكباتن بوجود طلب جديد (اختياري: يمكن إرساله لكل الكباتن المتصلين)
        const io = req.app.get('io');
        if (io) {
            io.emit('new_order_available', {
                orderId: order._id,
                pickup: order.pickup.address,
                price: order.price
            });
        }

        res.status(201).json({ message: 'Order created successfully', order });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/orders/:id/cancel
router.put('/:id/cancel', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.client.toString() !== req.user.id) {
            return res.status(403).json({ message: 'You are not authorized to cancel this order' });
        }
        if (order.status !== 'pending') {
            return res.status(400).json({ message: 'This order cannot be cancelled as it is already in progress or completed' });
        }
        order.status = 'cancelled';
        await order.save();

        // إشعار للكابتن إذا كان هناك كابتن قد قبل الطلب
        if (order.captain) {
            await sendNotification(req.app, {
                userId: order.captain,
                title: '⚠️ تم إلغاء الطلب',
                message: `العميل قام بإلغاء الطلب رقم ${order._id.toString().slice(-6)}`,
                type: 'order_update',
                relatedId: order._id
            });
        }

        res.json({ message: 'Order cancelled successfully', order });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/orders/my-orders (للعميل)
router.get('/my-orders', protect, async (req, res) => {
    console.time('fetchMyOrders'); // ⏱️ Start Timer
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // 1. Fetch Orders (Optimized)
        const orders = await Order.find({ client: req.user.id })
            .select('-parcelImage') // 🚀 Exclude heavy Base64
            .populate('captain', 'name phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(); // 🚀 Use lean() for faster read-only data

        // 2. Count Total (Optimized)
        // Note: countDocuments is fast if indexed {client: 1}
        const total = await Order.countDocuments({ client: req.user.id });

        console.timeEnd('fetchMyOrders'); // ⏱️ End Timer & Log

        res.json({
            orders,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalOrders: total
        });
    } catch (error) {
        console.error('Fetch Error:', error);
        res.status(500).json({ message: 'خطأ' });
    }
});

// @route   GET /api/orders (for captains)
router.get('/', protect, async (req, res) => {
    const userRole = req.user.role ? req.user.role.toLowerCase().trim() : '';
    if (userRole === 'captain') {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        try {
            const orders = await Order.find({ status: 'pending' })
                .select('-parcelImage') // 🚀 Optimize
                .populate('client', 'name phone')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            const total = await Order.countDocuments({ status: 'pending' });

            res.json({
                orders,
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalOrders: total
            });
        } catch (err) {
            res.status(500).json({ message: 'Server Error' });
        }
    } else {
        res.status(403).json({ message: 'Only captains can access this route' });
    }
});

// @route   PUT /api/orders/:id/negotiate
router.put('/:id/negotiate', protect, async (req, res) => {
    try {
        const userRole = req.user.role ? req.user.role.toLowerCase().trim() : '';
        if (userRole !== 'captain') {
            return res.status(403).json({ message: 'Only captains can negotiate' });
        }
        const order = await Order.findById(req.params.id).populate('client', 'name');
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.captain && order.captain.toString() !== req.user.id) {
            return res.status(400).json({ message: 'هذا الطلب يتم التفاوض عليه بواسطة كابتن آخر' });
        }
        order.captain = req.user.id;
        await order.save();
        res.json(order);
    } catch (error) {
        console.error('Negotiate Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// 🔥🔥🔥 دالة القبول المعدلة (تم تصحيح اسم الحقل إلى message) 🔥🔥🔥
// @route   PUT /api/orders/:id/accept
// ============================================================
router.put('/:id/accept', protect, async (req, res) => {
    try {
        // 1. التحقق من أن المستخدم كابتن
        const userRole = req.user.role ? req.user.role.toLowerCase().trim() : '';
        if (userRole !== 'captain') {
            return res.status(403).json({ message: 'Only captains can accept orders' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // 2. التحقق من صلاحية الطلب
        if (order.status !== 'pending' && (!order.captain || order.captain.toString() !== req.user.id)) {
            return res.status(400).json({ message: 'Order is not available' });
        }

        // 3. تحديث حالة الطلب
        order.captain = req.user.id;
        order.status = 'accepted';
        await order.save();

        // 🔥 استخدام المساعد الجديد لإرسال الإشعار
        await sendNotification(req.app, {
            userId: order.client,
            title: '🎉 تم قبول طلبك!',
            message: `الكابتن ${req.user.name || 'متاح'} وافق على الطلب وهو في الطريق إليك.`,
            type: 'order_accepted',
            relatedId: order._id
        });

        // ✅ إرسال WhatsApp للعميل
        await sendWhatsAppIfSubscribed(
            order.client,
            OrderMessages.orderAccepted(req.user.name || 'الكابتن', order._id.toString())
        );

        const io = req.app.get('io');
        if (io) {
            io.to(order.client.toString()).emit('order_status_updated', {
                orderId: order._id,
                status: 'accepted',
                captainId: req.user.id
            });
        }

        res.json({ message: 'Order accepted', order });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// @route   PUT /api/orders/:id/pickup
router.put('/:id/pickup', protect, async (req, res) => {
    try {
        const userRole = req.user.role ? req.user.role.toLowerCase().trim() : '';
        if (userRole !== 'captain') return res.status(403).json({ message: 'Only captains can pickup orders' });

        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.captain.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });

        order.status = 'picked_up';
        await order.save();

        // إشعار للعميل عند استلام الطلب
        await sendNotification(req.app, {
            userId: order.client,
            title: '📦 الكابتن استلم الطلب',
            message: `الكابتن ${req.user.name} قام باستلام طلبك الآن وهو في طريقه للتوصيل.`,
            type: 'order_update',
            relatedId: order._id
        });

        // ✅ إرسال WhatsApp للعميل
        await sendWhatsAppIfSubscribed(
            order.client,
            OrderMessages.orderPickedUp(req.user.name || 'الكابتن', order._id.toString())
        );

        const io = req.app.get('io');
        if (io) {
            io.to(order.client.toString()).emit('order_status_updated', {
                orderId: order._id,
                status: 'picked_up'
            });
        }

        res.json({ message: 'Order picked up', order });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/orders/:id/deliver
router.put('/:id/deliver', protect, async (req, res) => {
    try {
        const userRole = req.user.role ? req.user.role.toLowerCase().trim() : '';
        if (userRole !== 'captain') return res.status(403).json({ message: 'Only captains can deliver orders' });

        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.captain.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });

        order.status = 'delivered';
        await order.save();

        // 💰 Update Captain's Wallet
        const captain = await User.findById(order.captain);
        if (captain) {
            // ✅ FIX: Use netRevenue (after profit deduction) or fallback with 10% deduction
            const profit = order.netRevenue || (order.price * 0.9);
            captain.wallet = (captain.wallet || 0) + profit;
            await captain.save();
        }

        // إشعار للعميل عند التوصيل
        await sendNotification(req.app, {
            userId: order.client,
            title: '✅ تم التوصيل بنجاح',
            message: `تم توصيل طلبك بنجاح. شكراً لاستخدامك وصلي! لا تنسى تقييم الكابتن.`,
            type: 'order_completed',
            relatedId: order._id
        });

        // ✅ إرسال WhatsApp للعميل
        await sendWhatsAppIfSubscribed(
            order.client,
            OrderMessages.orderDelivered(order._id.toString())
        );

        const io = req.app.get('io');
        if (io) {
            io.to(order.client.toString()).emit('order_status_updated', {
                orderId: order._id,
                status: 'delivered'
            });
            // 🔥 Fix: Emit specific event for confirmation modal
            io.to(order.client.toString()).emit('delivery_attempted', {
                orderId: order._id
            });
        }

        res.json({ message: 'Order delivered', order });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/orders/my-missions
router.get('/my-missions', protect, async (req, res) => {
    try {
        const userRole = req.user.role ? req.user.role.toLowerCase().trim() : '';
        if (userRole !== 'captain') return res.status(403).json({ message: 'Only captains have missions' });
        const orders = await Order.find({ captain: req.user.id }).sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});


// @route   POST /api/orders/:id/complain
router.post('/:id/complain', protect, async (req, res) => {
    try {
        const { text } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.client.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });

        order.complaint = { text, status: 'pending', createdAt: new Date() };
        await order.save();

        // ✅ Send notification to admin about the complaint
        const admin = await User.findOne({ role: 'admin' });
        if (admin) {
            await sendNotification(req.app, {
                userId: admin._id,
                title: '⚠️ شكوى جديدة',
                message: `شكوى جديدة من العميل ${req.user.name || 'أحد العملاء'} على الطلب #${order._id.toString().slice(-6)}`,
                type: 'system',
                relatedId: order._id
            });
        }

        res.json({ message: 'Complaint submitted', order });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});



// ==========================================
// ⭐ تقييم الكابتن (جديد)
// ==========================================
router.post('/:id/rate', protect, async (req, res) => {
    try {
        const { rating } = req.body; // 1-10
        const orderId = req.params.id;

        if (!rating || rating < 1 || rating > 10) {
            return res.status(400).json({ message: 'التقييم يجب أن يكون بين 1 و 10' });
        }

        const order = await Order.findOne({ _id: orderId, client: req.user._id });
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        // Prevent double rating
        if (order.isRated) {
            return res.status(400).json({ message: 'تم تقييم هذا الطلب مسبقاً' });
        }

        const captain = await User.findById(order.captain);
        if (!captain) return res.status(404).json({ message: 'الكابتن غير موجود' });

        // Update Captain Stats
        captain.ratingSum = (captain.ratingSum || 0) + rating;
        captain.ratingCount = (captain.ratingCount || 0) + 1;
        captain.averageRating = captain.ratingSum / captain.ratingCount;

        await captain.save();

        // ✅ Save rating in order (as object with score)
        order.rating = { score: rating, comment: '' };
        order.isRated = true;
        // Keep status as 'delivered' - no 'completed' status in schema
        await order.save();

        // ✅ Send notification to captain with rating
        await sendNotification(req.app, {
            userId: order.captain,
            title: rating >= 7 ? '⭐ تقييم ممتاز!' : rating >= 4 ? '⭐ تقييم جيد' : '⚠️ تقييم منخفض',
            message: `حصلت على تقييم ${rating}/10 من العميل ${req.user.name || 'أحد العملاء'}`,
            type: 'system',
            relatedId: order._id
        });

        res.json({ message: 'تم التقييم بنجاح', newAverage: captain.averageRating });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/orders/price-config
// @desc    Get dynamic pricing settings for client calculation
router.get('/price-config', protect, async (req, res) => {
    try {
        const Settings = require('../models/Settings');
        let settings = await Settings.findOne();
        if (!settings) {
            settings = { baseFare: 10, costPerKm: 5, costPerMinute: 2 }; // Fallback defaults
        }
        res.json({
            baseFare: settings.baseFare,
            costPerKm: settings.costPerKm,
            costPerMinute: settings.costPerMinute
        });
    } catch (error) {
        console.error("Price Config Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;