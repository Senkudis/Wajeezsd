const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const Feedback = require('../models/Feedback');
const Order = require('../models/Order');
const { protect } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

// نموذج قصير يُرسَل مرة واحدة — حدّ متساهل يكفي لمنع العبث فقط
const feedbackLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
    handler: (req, res) => res.status(429).json({ message: 'محاولات كثيرة. يرجى الانتظار قليلاً.' })
});

/**
 * GET /api/feedback/pending
 * هل على العميل رأيٌ لم يُرسله بعد عن أول توصيلة؟
 * تستدعيها واجهة العميل عند فتح "طلباتي" — لا نعتمد على وصول الدفعة وحدها،
 * فقد تكون الإشعارات معطّلة على الجهاز وهذا بالضبط ما نحاول إصلاحه.
 */
router.get('/pending', protect, async (req, res) => {
    try {
        if (req.user.role !== 'client') return res.json({ pending: null });

        // أول طلب مكتمل لهذا العميل
        const firstDelivered = await Order.findOne({ client: req.user._id, status: 'delivered' })
            .sort({ deliveredAt: 1, createdAt: 1 })
            .select('_id deliveredAt createdAt')
            .lean();

        if (!firstDelivered) return res.json({ pending: null });

        const already = await Feedback.exists({
            user: req.user._id,
            kind: 'first_order'
        });
        if (already) return res.json({ pending: null });

        res.json({
            pending: { kind: 'first_order', orderId: firstDelivered._id }
        });
    } catch (err) {
        logger.error({ err }, 'GET /feedback/pending failed');
        res.status(500).json({ message: 'Server Error' });
    }
});

/**
 * POST /api/feedback
 * رأي العميل بعد أول توصيلة. أسباب الإلغاء تُسجَّل خادمياً وقت الإلغاء
 * (routes/orders.js) لا من هنا — كي لا يستطيع أحد تلفيق سبب لطلب ليس له.
 */
router.post('/', protect, feedbackLimiter, async (req, res) => {
    try {
        const { orderId, rating, message } = req.body || {};

        const numRating = rating == null || rating === '' ? null : Number(rating);
        if (numRating !== null && (!Number.isFinite(numRating) || numRating < 1 || numRating > 5)) {
            return res.status(400).json({ message: 'التقييم يجب أن يكون بين 1 و 5' });
        }

        // نزع أي وسوم HTML — النص يُعرض في لوحة الإدارة
        const cleanMessage = String(message || '').trim().replace(/<[^>]*>/g, '').slice(0, 1000);

        if (numRating === null && !cleanMessage) {
            return res.status(400).json({ message: 'اكتب رأيك أو اختر تقييماً على الأقل' });
        }

        // نتحقّق أن الطلب فعلاً للعميل — لا نثق بمعرّف قادم من الواجهة
        let order = null;
        if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
            order = await Order.findOne({ _id: orderId, client: req.user._id })
                .select('_id city')
                .lean();
        }

        const doc = await Feedback.create({
            user: req.user._id,
            kind: 'first_order',
            order: order ? order._id : null,
            orderModel: 'Order',
            rating: numRating,
            message: cleanMessage,
            city: (order && order.city) || req.user.city || 'Khartoum'
        });

        // 🔔 نبّه الإدارة فوراً — الرأي المبكّر يفقد قيمته إن قُرئ بعد أسبوع
        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('new_feedback', {
                id: doc._id,
                kind: 'first_order',
                rating: doc.rating,
                city: doc.city
            });
        }

        res.status(201).json({ message: 'شكراً لك — وصل رأيك للإدارة', feedback: { id: doc._id } });
    } catch (err) {
        // 11000 = تكرار على الفهرس الفريد: أرسل رأيه مسبقاً
        if (err && err.code === 11000) {
            return res.status(200).json({ message: 'سبق أن أرسلت رأيك — شكراً لك' });
        }
        logger.error({ err }, 'POST /feedback failed');
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
