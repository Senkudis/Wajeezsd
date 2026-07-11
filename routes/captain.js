const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { protect, captainOnly } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const { rateLimit } = require('express-rate-limit');

// ✅ FIX #12: Rate limiter for wallet payment submissions
// Max 3 payment requests per 10 minutes per captain
const walletPayLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
    keyGenerator: (req) => req.user?._id?.toString() || req.ip,
    message: { message: 'لقد أرسلت عدداً كبيراً من طلبات الدفع. انتظر 10 دقائق قبل المحاولة مجدداً.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ==========================================
// 📊 1. إحصائيات الكابتن (للداشبورد)
// ==========================================
router.get('/stats', protect, captainOnly, async (req, res) => {
    try {
        const TZ = 'Africa/Khartoum'; // توقيت السودان (UTC+2، بدون توقيت صيفي)

        // إجمالي مدى الحياة (الأرباح + عدد الطلبات المسلّمة)
        const [allTime] = await Order.aggregate([
            { $match: { captain: req.user._id, status: 'delivered' } },
            { $group: { _id: null, earnings: { $sum: { $ifNull: ["$netRevenue", 0] } }, count: { $sum: 1 } } }
        ]);
        const earnings = allTime ? allTime.earnings : 0;
        const completedCount = allTime ? allTime.count : 0;

        // 📊 تجميع آخر ٨ أيام حسب اليوم المحلي (نأخذ ٨ لضمان تغطية الـ٧ أيام المحلية كاملة)
        const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        const daily = await Order.aggregate([
            { $match: { captain: req.user._id, status: 'delivered', createdAt: { $gte: since } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
                    earnings: { $sum: { $ifNull: ["$netRevenue", 0] } },
                    count: { $sum: 1 }
                }
            }
        ]);
        const byDate = Object.fromEntries(daily.map(d => [d._id, d]));

        // بناء مصفوفة الـ٧ أيام (من الأقدم للأحدث) بالتواريخ المحلية
        const fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const daily7 = [];
        for (let i = 6; i >= 0; i--) {
            const dateStr = fmt.format(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
            const e = byDate[dateStr];
            daily7.push({ date: dateStr, earnings: e ? e.earnings : 0, count: e ? e.count : 0 });
        }

        const today = daily7[daily7.length - 1]; // اليوم = آخر عنصر
        const week = daily7.reduce(
            (a, d) => ({ earnings: a.earnings + d.earnings, count: a.count + d.count }),
            { earnings: 0, count: 0 }
        );

        res.json({
            completedCount,
            earnings,
            today: { earnings: today.earnings, count: today.count },
            week:  { earnings: week.earnings,  count: week.count },
            daily7, // [{ date:'YYYY-MM-DD', earnings, count }] أقدم→أحدث للرسم البياني
            // ⭐ مقياس /5 موحّد — قصّ أي قيمة قديمة كانت على /10 لتفادي ظهور "7.0"
            rating: Math.min(5, req.user.averageRating || 5.0),
            ratingCount: req.user.ratingCount || 0,
            profilePhoto: (req.user.documents && req.user.documents.profilePhoto) || null,
            isActive: req.user.isAvailableForWork // ← frontend uses this to show online/offline badge
        });

    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 👤 2. بيانات البروفايل والإنجازات
// ==========================================
router.get('/profile-details', protect, captainOnly, async (req, res) => {
    try {
        const stats = await Order.aggregate([
            { $match: { captain: req.user._id, status: 'delivered' } },
            {
                $group: {
                    _id: null,
                    totalEarnings: { $sum: { $ifNull: ["$netRevenue", 0] } },
                    totalOrders: { $sum: 1 }
                }
            }
        ]);

        const result = stats.length > 0 ? stats[0] : { totalEarnings: 0, totalOrders: 0 };

        res.json({
            name: req.user.name,
            email: req.user.email,
            phone: req.user.phone,
            vehicleType: req.user.vehicleType || 'غير محدد',
            totalOrders: result.totalOrders,
            totalEarnings: result.totalEarnings,
            profilePhoto: (req.user.documents && req.user.documents.profilePhoto) || null,
            joinDate: req.user.createdAt
        });

    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 📍 3. جلب الكباتن المتاحين (للخريطة - LIVE)
// ==========================================
// ✅ FIX #11: Added protect — captain locations & phone numbers were exposed without a token
router.get('/available', protect, async (req, res) => {
    try {
        // ✅ FIX: رفع الحد من 5 دقائق إلى 30 دقيقة
        // كابتن ساكن لا يُحدّث موقعه طوال الوقت، 5 دقائق قصيرة جداً
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        // ✅ BUG-015 FIX: فلترة الكباتن حسب مدينة المستخدم لمنع ظهور كباتن مدن أخرى
        const captains = await require('../models/User').find({
            role: 'captain',
            isActive: true,              // account must not be suspended
            isAvailableForWork: true,    // captain must be online/available
            city: req.user.city,         // ✅ BUG-015 FIX: عرض كباتن نفس مدينة المستخدم فقط
            'currentLocation.lat': { $exists: true },
            'currentLocation.lng': { $exists: true },
            'currentLocation.updatedAt': { $gte: thirtyMinutesAgo }
        }).select('name phone vehicleType currentLocation');

        res.json(captains);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 📍 3.5 جلب موقع كابتن محدد (للتتبع - Polling Fallback)
// ==========================================
// BUG #20 FIX: Added authorization check — requester must be admin OR have active order with this captain
router.get('/:id/location', protect, async (req, res) => {
    try {
        const User = require('../models/User');
        const captain = await User.findById(req.params.id)
            .select('currentLocation isAvailableForWork isActive');
        if (!captain) return res.status(404).json({ message: 'Captain not found' });

        // Allow admin unrestricted access
        if (req.user.role !== 'admin') {
            // Otherwise, ensure the requester has an active order with this captain
            let activeOrder = await Order.findOne({
                client: req.user._id,
                captain: req.params.id,
                status: { $in: ['accepted', 'picked_up'] }
            }).select('_id').lean();

            // 🏪 التاجر: يتتبع الكابتن الذي يوصّل طلباً نشطاً من متجره
            if (!activeOrder && req.user.role === 'merchant') {
                const Place = require('../models/Place');
                const myPlace = await Place.findOne({ ownerId: req.user._id }).select('_id').lean();
                if (myPlace) {
                    activeOrder = await Order.findOne({
                        shopId: myPlace._id,
                        captain: req.params.id,
                        status: { $in: ['accepted', 'picked_up'] }
                    }).select('_id').lean();
                }
            }

            if (!activeOrder) {
                return res.status(403).json({ message: 'غير مصرح — ليس لديك طلب نشط مع هذا الكابتن' });
            }
        }

        res.json({
            lat: captain.currentLocation?.lat,
            lng: captain.currentLocation?.lng,
            updatedAt: captain.currentLocation?.updatedAt,
            isActive: captain.isAvailableForWork // ← tells tracking page if captain is online
        });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 📍 3.6 تحديث موقع الكابتن (HTTP Fallback)
// ==========================================
router.put('/update-location', protect, captainOnly, async (req, res) => {
    try {
        const { lat, lng } = req.body;
        if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) {
            return res.status(400).json({ message: 'إحداثيات غير صالحة — lat و lng مطلوبان كأرقام' });
        }

        const User = require('../models/User');
        await User.findByIdAndUpdate(req.user._id, {
            currentLocation: { lat, lng, updatedAt: new Date() }
        });

        // Also emit to connected clients for real-time tracking
        const io = req.app.get('io');
        if (io) {
            const Order = require('../models/Order');
            const activeOrders = await Order.find({
                captain: req.user._id,
                status: { $in: ['accepted', 'picked_up'] }
            }).select('_id client');

            for (const order of activeOrders) {
                if (order.client) {
                    io.to(order.client.toString()).emit('captain_location_updated', {
                        orderId: order._id,
                        lat, lng
                    });
                }
            }

            io.to('admin_room').emit('captain_location_update', {
                userId: req.user._id,
                captainId: req.user._id,
                lat, lng,
                name: req.user.name || 'كابتن',
                status: req.user.isAvailableForWork ? 'available' : 'offline'
            });
        }

        res.json({ message: 'تم تحديث الموقع' });
    } catch (error) {
        logger.error('Update Location Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 🔄 4. تغيير حالة التوافر (Availability Toggle)
// ==========================================
router.put('/toggle-availability', protect, captainOnly, async (req, res) => {
    try {
        // ✅ FIX: Use isAvailableForWork (captain-controlled) NOT isActive (admin-controlled)
        // isActive = admin suspension flag — must NEVER be changed here
        // isAvailableForWork = whether captain wants to receive orders
        const { isActive } = req.body; // keep param name for backward compat with frontend
        const wantsToWork = isActive; // rename for clarity

        // ✅ FIX: Prevent blocked captains from toggling availability to TRUE
        if (wantsToWork === true && req.user.is_blocked) {
            return res.status(403).json({ message: 'حسابك محجوب مؤقتاً (إما بسبب الديون أو من قبل الإدارة). لا يمكنك تلقي طلبات حالياً.' });
        }

        // ✅ FIX #17: لو الكابتن يريد إيقاف التوفر، أخبره لو لديه طلبات نشطة
        if (wantsToWork === false) {
            const activeOrders = await Order.find({
                captain: req.user._id,
                status: { $in: ['accepted', 'picked_up'] }
            }).select('_id status');

            if (activeOrders.length > 0) {
                return res.status(400).json({
                    message: `لديك ${activeOrders.length} طلب نشط حالياً. أكمل طلباتك أولاً قبل تغيير حالة التوفر.`,
                    activeOrders: activeOrders.map(o => ({ id: o._id, status: o.status }))
                });
            }
        }

        const captain = await require('../models/User').findByIdAndUpdate(
            req.user._id,
            { isAvailableForWork: wantsToWork }, // ← ONLY change availability, not isActive
            { new: true }
        ).select('isAvailableForWork isActive name');

        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('captain_status_changed', {
                userId: req.user._id,
                isAvailableForWork: captain.isAvailableForWork
            });
        }

        // Return isActive in response for backward compat with frontend
        res.json({ message: 'Status updated', isActive: captain.isAvailableForWork });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 🚪 Captain Logout — Set offline immediately
// ==========================================
router.post('/logout', protect, captainOnly, async (req, res) => {
    try {
        const User = require('../models/User');
        await User.findByIdAndUpdate(req.user._id, { isAvailableForWork: false });

        const uId = String(req.user._id);
        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('captain_status_changed', {
                userId: uId,
                isAvailableForWork: false
            });
        }

        res.json({ message: 'تم تسجيل الخروج وضبط الحالة كغير متصل' });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 📜 Trip History with Pagination
// ==========================================
router.get('/trips', protect, captainOnly, async (req, res) => {
    try {
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
            const settings = await Settings.getSettings(req.user.city || 'Khartoum');
            commissionRate = settings?.commissionRate || 0.15;
        } catch (error) {
            logger.error('Settings load error:', error);
        }

        const tripsWithProfit = orders.map(order => {
            const orderObj = order.toObject();
            // ✅ FIX #5: استخدام appFee و netRevenue المحفوظتين وقت إنشاء الطلب
            // عدم إعادة الحساب بنسبة جديدة قد تختلف عن النسبة المطبقة وقت التوصيلة
            const storedFee = orderObj.appFee || (orderObj.price * commissionRate);
            const storedNet = orderObj.netRevenue || (orderObj.price - storedFee);
            return {
                ...orderObj,
                commission: Math.round(storedFee),
                netProfit: Math.round(storedNet)
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
        logger.error('Error fetching trips:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 💳 5. محفظة الكابتن (Negative Wallet)
// GET /api/captain/wallet
// ==========================================
router.get('/wallet', protect, captainOnly, async (req, res) => {
    try {
        const User     = require('../models/User');
        const Settings = require('../models/Settings');

        // Fetch both in parallel for speed
        const [captain, settings] = await Promise.all([
            User.findById(req.user._id).select('wallet_balance credit_limit is_blocked name'),
            Settings.getSettings(req.user.city || 'Khartoum')
        ]);

        if (!captain) return res.status(404).json({ message: 'الكابتن غير موجود' });

        const balance = captain.wallet_balance ?? 0;

        // ─────────────────────────────────────────────────────
        // Credit Limit Priority (highest → lowest):
        //  1. captain.credit_limit  — if admin gave THIS captain a CUSTOM limit
        //                             (only trust it if it differs from schema default -5000,
        //                              meaning someone explicitly set it)
        //  2. settings.defaultCreditLimit — the global limit admin set for ALL captains
        //  3. -5000 — hardcoded last-resort fallback
        // ─────────────────────────────────────────────────────
        const SCHEMA_DEFAULT = -5000;
        const hasCustomLimit = captain.credit_limit !== null &&
                               captain.credit_limit !== undefined &&
                               captain.credit_limit !== SCHEMA_DEFAULT;
        const limit = hasCustomLimit
            ? captain.credit_limit                             // per-captain override
            : (settings.defaultCreditLimit ?? SCHEMA_DEFAULT); // global default

        // ✅ FIX #13: clamp pctUsed to [0, 100] — positive balance = 0% used (fully paid)
        // Negative result happens when captain overpaid (balance > 0) — show 0%
        const pctUsed = (limit !== 0 && balance < 0)
            ? Math.min(Math.round((balance / limit) * 100), 100)
            : 0;

        res.json({
            wallet_balance: balance,
            credit_limit:   limit,
            is_blocked:     captain.is_blocked ?? false,
            usage_percent:  Math.min(Math.round(pctUsed), 100),

            // 🏦 Bank Details — always from live Settings
            bankName:          settings.bankName          ?? 'بنك الخرطوم',
            bankAccountName:   settings.bankAccountName   ?? 'ضياء الدين ابراهيم محمد',
            bankAccountNumber: settings.bankAccountNumber ?? '7702038'
        });
    } catch (error) {
        logger.error('Wallet Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 💳 6. إرسال إشعار السداد (Payment Proof)
// POST /api/captain/wallet/pay
// ==========================================
router.post('/wallet/pay', protect, captainOnly, walletPayLimiter, async (req, res) => {
    try {
        const { amount, transactionId, receiptImage } = req.body;

        if (!amount || !transactionId) {
            return res.status(400).json({ message: 'المبلغ ورقم الإشعار مطلوبان' });
        }

        if (isNaN(amount) || Number(amount) <= 0) {
            return res.status(400).json({ message: 'المبلغ يجب أن يكون رقماً موجباً' });
        }

        // منع الإرسال المتكرر — لا يمكن إرسال طلب جديد إذا يوجد طلب معلق
        const PaymentRequest = require('../models/PaymentRequest');
        const existingPending = await PaymentRequest.findOne({
            captainId: req.user._id,
            status: 'pending'
        });

        if (existingPending) {
            return res.status(400).json({
                message: 'لديك طلب سداد قيد المراجعة بالفعل. الرجاء الانتظار حتى يتم مراجعته.',
                requestId: existingPending._id
            });
        }

        // تخزين صورة الإيصال مباشرة كـ Base64 في قاعدة البيانات لتجنب مشاكل الأذونات على cPanel
        let receiptImageUrl = null;
        if (receiptImage) {
            receiptImageUrl = receiptImage; // حفظ الـ Base64 مباشرة
        }

        // حفظ الطلب في DB
        const paymentRequest = await PaymentRequest.create({
            captainId: req.user._id,
            amount: Number(amount),
            transactionId: transactionId.trim(),
            receiptImage: receiptImageUrl,
            status: 'pending'
        });

        logger.info(`💳 PaymentRequest created: ${paymentRequest._id} | Captain: ${req.user._id} | Amount: ${amount}`);

        // 🔔 إشعار لجميع المسؤولين (Admins)
        try {
            const User = require('../models/User');
            const { sendNotification } = require('../utils/notificationHelper');
            const admins = await User.find({ role: 'admin' });
            for (const admin of admins) {
                await sendNotification(req.app, {
                    userId: admin._id,
                    title: '💰 طلب سداد مديونية جديد',
                    message: `الكابتن ${req.user.name} أرسل إشعار تحويل بمبلغ ${amount} ج.س — رقم الإشعار: ${transactionId}`,
                    type: 'system',
                    relatedId: paymentRequest._id
                });
            }
        } catch (notifErr) {
            logger.error('Admin notification error:', notifErr.message);
        }

        res.status(201).json({
            message: 'تم إرسال إشعار السداد للإدارة بنجاح. سيتم مراجعة الدفعة وفتح حسابك قريباً.',
            requestId: paymentRequest._id
        });

    } catch (error) {
        logger.error('Payment Proof Error:', error);
        res.status(500).json({ message: 'حدث خطأ في الخادم' });
    }
});

// ==========================================
// 💳 7. حالة آخر طلب سداد للكابتن
// GET /api/captain/wallet/pay/status
// ==========================================
router.get('/wallet/pay/status', protect, captainOnly, async (req, res) => {
    try {
        const PaymentRequest = require('../models/PaymentRequest');
        const latest = await PaymentRequest.findOne({ captainId: req.user._id })
            .sort({ createdAt: -1 })
            .select('status amount transactionId createdAt adminNote');

        res.json({ request: latest || null });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 💳 8. سجل جميع طلبات السداد للكابتن
// GET /api/captain/wallet/pay/history
// ==========================================
router.get('/wallet/pay/history', protect, captainOnly, async (req, res) => {
    try {
        const PaymentRequest = require('../models/PaymentRequest');
        const requests = await PaymentRequest.find({ captainId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(20)
            .select('status amount transactionId createdAt adminNote');

        // حساب إجمالي المبالغ المقبولة والمعلقة
        const totalApproved = requests
            .filter(r => r.status === 'approved')
            .reduce((sum, r) => sum + (r.amount || 0), 0);

        const totalPending = requests
            .filter(r => r.status === 'pending')
            .reduce((sum, r) => sum + (r.amount || 0), 0);

        res.json({
            requests,
            summary: {
                totalApproved,
                totalPending,
                count: requests.length
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 💰 9. سجل تعاملات الكابتن الكامل (Transaction History)
// GET /api/captain/wallet/transactions
// يجمع: تعديلات الإدارة + طلبات السداد المقبولة + عمولات الطلبات
// ==========================================
router.get('/wallet/transactions', protect, captainOnly, async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const skip  = (page - 1) * limit;

        const DebtAdjustment = require('../models/DebtAdjustment');
        const PaymentRequest = require('../models/PaymentRequest');

        // ── 1. تعديلات الإدارة (زيادة دين / خصم / صفر) ─────────────────
        const adjustments = await DebtAdjustment.find({ captain: req.user._id })
            .sort({ createdAt: -1 })
            .limit(100)
            .select('mode amount previousBalance newBalance note createdAt')
            .lean();

        // ── 2. طلبات السداد المقبولة ─────────────────────────────────────
        const payments = await PaymentRequest.find({
            captainId: req.user._id,
            status: 'approved'
        })
            .sort({ createdAt: -1 })
            .limit(100)
            .select('amount transactionId adminNote createdAt')
            .lean();

        // ── 3. طلبات التوصيل المكتملة (عمولة مخصومة) ────────────────────
        const deliveries = await Order.find({
            captain: req.user._id,
            status: 'delivered'
        })
            .sort({ createdAt: -1 })
            .limit(100)
            .select('price appFee netRevenue pickup.address createdAt')
            .lean();

        // ── دمج وتحويل لتنسيق موحد ────────────────────────────────────────
        const timeline = [
            ...adjustments.map(a => ({
                _id:       a._id,
                type:      a.mode === 'add'     ? 'debt_added'
                         : a.mode === 'zero'    ? 'debt_cleared'
                         :                       'debt_partial',
                label:     a.mode === 'add'     ? '➕ إضافة دين'
                         : a.mode === 'zero'    ? '✅ إعفاء كامل'
                         :                       '✂️ تخفيض دين',
                amount:    a.amount,
                balance:   a.newBalance,
                note:      a.note || '',
                date:      a.createdAt
            })),
            ...payments.map(p => ({
                _id:    p._id,
                type:   'payment_approved',
                label:  '💳 دفعة مقبولة',
                amount: p.amount,
                note:   `رقم الإشعار: ${p.transactionId}${p.adminNote ? ' — ' + p.adminNote : ''}`,
                date:   p.createdAt
            })),
            ...deliveries.map(d => ({
                _id:    d._id,
                type:   'commission_deducted',
                label:  '🏍️ توصيلة مكتملة',
                amount: d.appFee || 0,
                note:   d.pickup?.address || '',
                date:   d.createdAt
            }))
        ];

        // ── ترتيب تنازلي حسب التاريخ ─────────────────────────────────────
        timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

        const total = timeline.length;
        const paged = timeline.slice(skip, skip + limit);

        res.json({
            transactions: paged,
            pagination: {
                page,
                limit,
                total,
                pages:   Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Transaction History Error:', error);
        res.status(500).json({ message: 'حدث خطأ في جلب سجل التعاملات' });
    }
});

module.exports = router;
