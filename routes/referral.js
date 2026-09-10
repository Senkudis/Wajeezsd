const express = require('express');
const rateLimit = require('express-rate-limit'); // 🛡️ Rate Limiting
const router = express.Router();
const validateObjectId = require('../middleware/validateObjectId');
// 🆔 أي :id ليس ObjectId ⇒ 404 لا 500 (انظر الملف للسبب)
router.param('id', validateObjectId);
const Marketer = require('../models/Marketer');
const Referral = require('../models/Referral');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { generateReferralCode } = require('../utils/otp');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────
// 🛡️ حدود المعدّل — المسارات العامة أدناه بلا كلمة مرور، فالتخمين الآلي
// هو التهديد الحقيقي: كود المسوّق قصير، ودخوله يكشف أسماء وهواتف المتاجر.
// ─────────────────────────────────────────────
const marketerLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
    handler: (req, res) => {
        const retryAfter = Math.ceil((res.getHeader('Retry-After') || 900));
        res.status(429).json({ message: 'محاولات دخول كثيرة. يرجى الانتظار.', retryAfter });
    }
});

const marketerRegisterLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // ساعة
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
    handler: (req, res) => {
        const retryAfter = Math.ceil((res.getHeader('Retry-After') || 3600));
        res.status(429).json({ message: 'طلبات تسجيل كثيرة. يرجى الانتظار.', retryAfter });
    }
});

// ─────────────────────────────────────────────
// PUBLIC ROUTES (بدون توثيق)
// ─────────────────────────────────────────────

// التحقق من صحة كود الإحالة (يُستخدم في صفحة invite.html)
router.get('/validate/:code', async (req, res) => {
    try {
        const marketer = await Marketer.findOne({
            referralCode: req.params.code.toUpperCase(),
            status: 'active'
        }).select('name referralCode');

        if (!marketer) {
            return res.status(404).json({ valid: false, message: 'كود الإحالة غير صالح أو غير مفعّل' });
        }
        res.json({ valid: true, marketer: { name: marketer.name, code: marketer.referralCode } });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// تسجيل مسوق جديد ذاتياً
router.post('/register', marketerRegisterLimiter, async (req, res) => {
    try {
        const { name, phone, notes } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ message: 'الاسم ورقم الهاتف مطلوبان' });
        }

        // منع التكرار
        const existing = await Marketer.findOne({ phone: phone.trim() });
        if (existing) {
            return res.status(409).json({ message: 'رقم الهاتف مسجّل مسبقاً' });
        }

        // توليد كود فريد مع retry
        let referralCode;
        let attempts = 0;
        do {
            referralCode = generateReferralCode();
            attempts++;
        } while (await Marketer.findOne({ referralCode }) && attempts < 10);

        const marketer = new Marketer({
            name: name.trim(),
            phone: phone.trim(),
            notes: notes?.trim() || '',
            referralCode,
            status: 'pending',
            createdBy: 'self'
        });

        await marketer.save();
        res.status(201).json({ message: 'تم استلام طلبك بنجاح، سيتم التواصل معك قريباً' });
    } catch (err) {
        logger.error({ err: err.message }, 'Referral route error');
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// دخول المسوق بكوده ورقم هاتفه
router.post('/marketer-login', marketerLoginLimiter, async (req, res) => {
    try {
        const { phone, referralCode } = req.body;
        const marketer = await Marketer.findOne({
            phone: phone?.trim(),
            referralCode: referralCode?.trim().toUpperCase(),
            status: 'active'
        }).select('name phone referralCode reward status createdAt');

        if (!marketer) {
            return res.status(401).json({ message: 'بيانات الدخول غير صحيحة أو الحساب غير مفعّل' });
        }

        const referrals = await Referral.find({ marketerId: marketer._id })
            .sort({ createdAt: -1 })
            .limit(50)
            .select('businessName ownerName phone qualifiedOrders placeId createdAt');

        // إجمالي الأوردرات المؤهِّلة للمكافأة عبر كل المتاجر المُحالة
        const totalQualifiedOrders = referrals.reduce((sum, r) => sum + (r.qualifiedOrders || 0), 0);
        // عدد المتاجر التي أجرت أوردراً واحداً على الأقل (مؤهِّلة للمكافأة)
        const qualifiedStores = referrals.filter(r => (r.qualifiedOrders || 0) > 0).length;

        res.json({
            marketer,
            referrals,
            total: referrals.length,
            totalQualifiedOrders,
            qualifiedStores
        });


    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// ─────────────────────────────────────────────
// ADMIN ROUTES (تتطلب توثيق أدمن)
// ─────────────────────────────────────────────

// قائمة كل المسوقين + إحصائياتهم
router.get('/marketers', protect, adminOnly, async (req, res) => {
    try {
        const { status, search } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { referralCode: { $regex: search, $options: 'i' } }
            ];
        }

        const marketers = await Marketer.find(filter).sort({ createdAt: -1 });

        // إضافة عدد الإحالات لكل مسوق
        const result = await Promise.all(marketers.map(async (m) => {
            const count = await Referral.countDocuments({ marketerId: m._id });
            return { ...m.toObject(), referralCount: count };
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إضافة مسوق جديد من الأدمن
router.post('/marketers', protect, adminOnly, async (req, res) => {
    try {
        const { name, phone, notes } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ message: 'الاسم ورقم الهاتف مطلوبان' });
        }

        const existing = await Marketer.findOne({ phone: phone.trim() });
        if (existing) return res.status(409).json({ message: 'رقم الهاتف مسجّل مسبقاً' });

        let referralCode;
        let attempts = 0;
        do {
            referralCode = generateReferralCode();
            attempts++;
        } while (await Marketer.findOne({ referralCode }) && attempts < 10);

        const marketer = new Marketer({
            name: name.trim(),
            phone: phone.trim(),
            notes: notes?.trim() || '',
            referralCode,
            status: 'active', // الأدمن يضيفه مفعّلاً مباشرة
            createdBy: 'admin'
        });

        await marketer.save();
        res.status(201).json(marketer);
    } catch (err) {
        logger.error({ err: err.message }, 'Referral route error');
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// تعديل حالة مسوق (تفعيل/إيقاف/موافقة)
router.patch('/marketers/:id/status', protect, adminOnly, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'inactive', 'pending'].includes(status)) {
            return res.status(400).json({ message: 'حالة غير صالحة' });
        }

        const marketer = await Marketer.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );

        if (!marketer) return res.status(404).json({ message: 'المسوق غير موجود' });
        res.json(marketer);
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// تعديل بيانات مسوق (اسم، هاتف، ملاحظات، مكافأة)
router.patch('/marketers/:id', protect, adminOnly, async (req, res) => {
    try {
        const { name, phone, notes, reward } = req.body;
        const update = {};
        if (name !== undefined)   update.name   = String(name).trim();
        if (phone !== undefined)  update.phone  = String(phone).trim();
        if (notes !== undefined)  update.notes  = String(notes).trim();
        if (reward !== undefined) update.reward = String(reward).trim();

        if (!Object.keys(update).length) {
            return res.status(400).json({ message: 'لا توجد بيانات للتحديث' });
        }

        const marketer = await Marketer.findByIdAndUpdate(
            req.params.id,
            update,
            { new: true }
        );

        if (!marketer) return res.status(404).json({ message: 'المسوق غير موجود' });
        res.json({ message: 'تم التحديث بنجاح', marketer });
    } catch (err) {
        logger.error({ err: err.message }, 'Referral route error');
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// تعديل مكافأة مسوق (الأدمن فقط) — legacy endpoint
router.patch('/marketers/:id/reward', protect, adminOnly, async (req, res) => {
    try {
        const { reward } = req.body;
        if (typeof reward !== 'string') {
            return res.status(400).json({ message: 'قيمة المكافأة غير صالحة' });
        }

        const marketer = await Marketer.findByIdAndUpdate(
            req.params.id,
            { reward: reward.trim() },
            { new: true }
        );

        if (!marketer) return res.status(404).json({ message: 'المسوق غير موجود' });
        res.json({ message: 'تم تحديث المكافأة', marketer });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});


// حذف مسوق
router.delete('/marketers/:id', protect, adminOnly, async (req, res) => {
    try {
        await Marketer.findByIdAndDelete(req.params.id);
        res.json({ message: 'تم الحذف' });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// تعديل بيانات إحالة (الأدمن — مثل تحديث qualifiedOrders)
router.patch('/referrals/:id', protect, adminOnly, async (req, res) => {
    try {
        const allowed = ['qualifiedOrders', 'notes'];
        const update  = {};
        allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
        if (!Object.keys(update).length) {
            return res.status(400).json({ message: 'لا توجد بيانات للتحديث' });
        }
        const referral = await Referral.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!referral) return res.status(404).json({ message: 'الإحالة غير موجودة' });
        res.json({ message: 'تم التحديث', referral });
    } catch (err) {
        logger.error({ err: err.message }, 'Referral route error');
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// كل الإحالات (الأدمن)
router.get('/referrals', protect, adminOnly, async (req, res) => {
    try {
        const referrals = await Referral.find({})
            .populate('marketerId', 'name referralCode phone')
            .sort({ createdAt: -1 });
        res.json(referrals);
    } catch (err) {
        logger.error({ err: err.message }, 'Referral route error');
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إحالات مسوق معين
router.get('/marketers/:id/referrals', protect, adminOnly, async (req, res) => {
    try {
        const referrals = await Referral.find({ marketerId: req.params.id })
            .sort({ createdAt: -1 });
        res.json(referrals);
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// إحصائيات عامة للأدمن
router.get('/stats', protect, adminOnly, async (req, res) => {
    try {
        const [totalMarketers, activeMarketers, pendingMarketers, totalReferrals] = await Promise.all([
            Marketer.countDocuments(),
            Marketer.countDocuments({ status: 'active' }),
            Marketer.countDocuments({ status: 'pending' }),
            Referral.countDocuments()
        ]);

        // إحالات هذا الشهر
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const monthlyReferrals = await Referral.countDocuments({ createdAt: { $gte: startOfMonth } });

        // أفضل 5 مسوقين
        const topMarketers = await Referral.aggregate([
            { $group: { _id: '$marketerId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
            { $lookup: { from: 'marketers', localField: '_id', foreignField: '_id', as: 'marketer' } },
            { $unwind: '$marketer' },
            { $project: { name: '$marketer.name', code: '$marketer.referralCode', count: 1 } }
        ]);

        // آخر 10 إحالات
        const recentReferrals = await Referral.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('marketerId', 'name referralCode');

        res.json({
            totalMarketers,
            activeMarketers,
            pendingMarketers,
            totalReferrals,
            monthlyReferrals,
            topMarketers,
            recentReferrals
        });
    } catch (err) {
        logger.error({ err: err.message }, 'Referral route error');
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

module.exports = router;
