// routes/admin/finance.js — مُولّد من تقسيم admin.js الأصلي.
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
const { protect, adminOnly, superAdminOnly, requirePermission, requireAnyPermission } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const { normalizePhone } = require('../../utils/phoneNormalizer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');

const SessionRequest = require('../../models/SessionRequest');

router.put('/captains/:id/adjust-debt', protect, requirePermission('manage_finance'), async (req, res) => {
    try {
        const { sendNotification } = require('../../utils/notificationHelper');
        const { mode, amount, note } = req.body;

        if (!['zero', 'partial', 'add'].includes(mode)) {
            return res.status(400).json({ message: 'mode يجب أن يكون zero أو partial أو add' });
        }

        const captain = await User.findById(req.params.id);
        if (!captain || captain.role !== 'captain') {
            return res.status(404).json({ message: 'الكابتن غير موجود' });
        }

        const previousBalance = captain.wallet_balance ?? 0;

        // Guard: zero/partial only work when captain has debt
        if (mode !== 'add' && previousBalance >= 0) {
            return res.status(400).json({ message: 'هذا الكابتن ليس لديه مديونية' });
        }

        if ((mode === 'partial' || mode === 'add') && (!amount || amount <= 0)) {
            return res.status(400).json({ message: 'يرجى إدخال مبلغ صحيح أكبر من صفر' });
        }
        if (amount > 1000000) {
            return res.status(400).json({ message: 'المبلغ المدخل مبالغ فيه (الحد الأقصى مليون)' });
        }

        let updateQuery = {};
        let adjustedAmount = 0;
        let expectedNewBalance = 0; // Just for logging

        if (mode === 'zero') {
            updateQuery = { $set: { wallet_balance: 0 } };
            adjustedAmount = Math.abs(previousBalance);
        } else if (mode === 'partial') {
            // BUG #9 FIX: Use aggregation pipeline update to atomically cap at 0 in one operation.
            // The old { $inc, $min } was two separate ops and could overshoot in a race condition.
            updateQuery = [{ $set: { wallet_balance: { $min: [0, { $add: ['$wallet_balance', amount] }] } } }];
            adjustedAmount = amount;
        } else { // add
            updateQuery = { $inc: { wallet_balance: -amount } };
            adjustedAmount = amount;
        }

        // BUG #9 FIX: Aggregation pipeline update is now used for partial mode (atomic cap at 0)
        let updatedCaptain = await User.findByIdAndUpdate(req.params.id, updateQuery, { new: true });

        // Auto-block/unblock logic (لا تؤثر على الرصيد — آمن من race condition)
        let changed = false;
        const creditLimit = updatedCaptain.credit_limit ?? -5000;
        // Auto-unblock if balance recovered above credit limit
        if (updatedCaptain.is_blocked && updatedCaptain.wallet_balance > creditLimit) {
            updatedCaptain.is_blocked = false;
            changed = true;
        }
        // Auto-block if new debt crosses the credit limit
        if (!updatedCaptain.is_blocked && updatedCaptain.wallet_balance <= creditLimit) {
            updatedCaptain.is_blocked = true;
            changed = true;
        }

        if (changed) {
            await updatedCaptain.save();
        }
        
        const newBalance = updatedCaptain.wallet_balance;

        // 📒 سجّل التعديل في DebtAdjustment للتقارير المالية
        try {
            const DebtAdjustment = require('../../models/DebtAdjustment');
            await DebtAdjustment.create({
                captain: captain._id,
                admin: req.user._id,
                mode,
                amount: adjustedAmount,
                previousBalance,
                newBalance,
                note: note || ''
            });
        } catch (logErr) {
            logger.warn({ err: logErr }, 'Failed to record DebtAdjustment audit entry');
            // لا نُفشل الطلب لو فشل التسجيل — التعديل المالي تم بنجاح
        }

        logger.info(`[Admin Debt Adjust] Captain: ${captain.name} | ${previousBalance} → ${newBalance} | Mode: ${mode} | Amount: ${adjustedAmount} | Note: ${note || '—'}`);

        // Notify captain
        let notifMsg;
        if (mode === 'zero') {
            notifMsg = `قامت الإدارة بتصفير مديونيتك بالكامل. رصيدك الحالي: 0 ج.س`;
        } else if (mode === 'partial') {
            notifMsg = `قامت الإدارة بتخفيض مديونيتك بمقدار ${adjustedAmount.toFixed(0)} ج.س. رصيدك الحالي: ${newBalance.toFixed(0)} ج.س`;
        } else {
            notifMsg = `قامت الإدارة بإضافة مديونية بمقدار ${adjustedAmount.toFixed(0)} ج.س. رصيدك الحالي: ${newBalance.toFixed(0)} ج.س${note ? ' — ' + note : ''}`;
        }

        // 🧭 wallet_update (وليس order_update): نقرة الإشعار تفتح محفظة الكابتن
        // — النوع القديم كان يوجّه لصفحة تتبع طلب بمعرّف الكابتن (وجهة خاطئة)
        await sendNotification(req.app, {
            userId: captain._id,
            title: mode === 'add' ? '⚠️ تم إضافة مديونية' : '💳 تم تعديل رصيدك',
            message: notifMsg,
            type: 'wallet_update',
            relatedId: captain._id
        });

        let responseMsg;
        if (mode === 'zero')    responseMsg = 'تم تصفير المديونية بنجاح';
        else if (mode === 'partial') responseMsg = `تم خصم ${adjustedAmount.toFixed(0)} ج.س من المديونية`;
        else                    responseMsg = `تم إضافة مديونية ${adjustedAmount.toFixed(0)} ج.س للكابتن${captain.is_blocked ? ' (تم حجب الحساب تلقائياً)' : ''}`;

        // 📋 سجل في سجل النشاط
        const actionType = mode === 'add' ? 'debt_add' : mode === 'zero' ? 'debt_zero' : 'debt_partial';
        await logAdminAction(req, actionType,
            `${responseMsg} — الكابتن: ${captain.name}`,
            captain._id, captain.name,
            { previousBalance, newBalance: updatedCaptain.wallet_balance, adjustedAmount, note: note || '' }
        );

        res.json({
            message: responseMsg,
            previousBalance,
            newBalance: updatedCaptain.wallet_balance,
            adjustedAmount,
            isUnblocked: mode !== 'add' && !updatedCaptain.is_blocked,
            isBlocked: updatedCaptain.is_blocked
        });
    } catch (error) {
        logger.error({ err: error }, 'Adjust Debt Error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 📒 سجل تعديلات المديونية — للتقارير المالية
// @route   GET /api/admin/debt-adjustments
// query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&captainId=...&mode=add|zero|partial&limit=100
// =========================================================

router.get('/debt-adjustments', protect, requireAnyPermission(['view_finance', 'manage_finance']), async (req, res) => {
    try {
        const DebtAdjustment = require('../../models/DebtAdjustment');
        const { from, to, captainId, mode, limit } = req.query;

        const filter = {};
        if (from || to) {
            filter.createdAt = {};
            if (from) filter.createdAt.$gte = new Date(from);
            if (to) filter.createdAt.$lte = new Date(to);
        }
        if (captainId) filter.captain = captainId;
        if (mode && ['add', 'zero', 'partial'].includes(mode)) filter.mode = mode;

        const max = Math.min(parseInt(limit, 10) || 100, 500);

        const [entries, summary] = await Promise.all([
            DebtAdjustment.find(filter)
                .populate('captain', 'name phone')
                .populate('admin', 'name')
                .sort({ createdAt: -1 })
                .limit(max),
            DebtAdjustment.aggregate([
                { $match: filter },
                { $group: { _id: '$mode', total: { $sum: '$amount' }, count: { $sum: 1 } } }
            ])
        ]);

        let debtAdded = 0, debtForgiven = 0, addCount = 0, zeroCount = 0, partialCount = 0;
        summary.forEach(row => {
            if (row._id === 'add')     { debtAdded = row.total; addCount = row.count; }
            else if (row._id === 'zero')    { debtForgiven += row.total; zeroCount = row.count; }
            else if (row._id === 'partial') { debtForgiven += row.total; partialCount = row.count; }
        });

        res.json({
            entries,
            summary: {
                debtAdded,
                debtForgiven,
                netImpact: debtAdded - debtForgiven,
                counts: { add: addCount, zero: zeroCount, partial: partialCount, total: addCount + zeroCount + partialCount }
            }
        });
    } catch (error) {
        logger.error({ err: error }, 'Debt Adjustments Report Error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 🚀 إدارة طلبات الكباتن المعلقة (Captain Approval)
// =========================================================

// @route   GET /api/admin/pending-captains

router.get('/ledger', protect, requireAnyPermission(['view_finance', 'manage_finance']), async (req, res) => {
    try {
        const DebtAdjustment = require('../../models/DebtAdjustment');
        const VALID_CITIES = ['Khartoum', 'PortSudan'];
        const cityFilter = VALID_CITIES.includes(req.query.city) ? req.query.city : null;

        const fromDate = req.query.from ? new Date(req.query.from) : null;
        const toDate   = req.query.to   ? new Date(req.query.to + 'T23:59:59.999Z') : null;

        // ── 1. Delivered orders (commission entries) ──
        const orderMatch = { status: 'delivered' };
        if (cityFilter) orderMatch.city = cityFilter;
        if (fromDate || toDate) {
            orderMatch.updatedAt = {};
            if (fromDate) orderMatch.updatedAt.$gte = fromDate;
            if (toDate)   orderMatch.updatedAt.$lte = toDate;
        }

        const orders = await Order.find(orderMatch)
            .select('city price appFee captain updatedAt')
            .populate('captain', 'name phone')
            .sort({ updatedAt: -1 })
            .limit(200)
            .lean();

        const orderEntries = orders.map(o => ({
            type:        'commission',
            date:        o.updatedAt,
            city:        o.city || 'Khartoum',
            amount:      o.appFee || 0,
            orderPrice:  o.price  || 0,
            captain:     o.captain ? { name: o.captain.name, phone: o.captain.phone } : { name: '—' },
            note:        `عمولة طلب بقيمة ${o.price || 0} ج.س`,
        }));

        // ── 2. Debt adjustments ──
        const debtMatch = {};
        if (fromDate || toDate) {
            debtMatch.createdAt = {};
            if (fromDate) debtMatch.createdAt.$gte = fromDate;
            if (toDate)   debtMatch.createdAt.$lte = toDate;
        }

        const adjustments = await DebtAdjustment.find(debtMatch)
            .populate('captain', 'name phone city')
            .populate('admin',   'name')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        const debtEntries = adjustments
            .filter(a => !cityFilter || (a.captain?.city === cityFilter))
            .map(a => ({
                type:    a.mode === 'add' ? 'debt_add' : a.mode === 'zero' ? 'debt_zero' : 'debt_partial',
                date:    a.createdAt,
                city:    a.captain?.city || 'Khartoum',
                amount:  a.amount || 0,
                captain: a.captain ? { name: a.captain.name, phone: a.captain.phone } : { name: '—' },
                admin:   a.admin?.name || '—',
                note:    a.note || (a.mode === 'add' ? 'إضافة مديونية' : a.mode === 'zero' ? 'تصفير مديونية' : 'تخفيض جزئي'),
                prevBalance: a.previousBalance,
                newBalance:  a.newBalance,
            }));

        // ── 3. Merge, sort by date desc, take top 100 ──
        const all = [...orderEntries, ...debtEntries]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 100);

        res.json({ total: all.length, entries: all });
    } catch (error) {
        logger.error('Ledger Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// ⚙️ الجزء الخامس: الإعدادات (Settings)
// =========================================================

// @route   GET /api/admin/settings
// @desc    جلب إعدادات مدينة محددة (للأدمن فقط)
// 🌍 ?city=Khartoum | PortSudan (required)
// Defaults to Khartoum for backward compat with legacy admin clients.

router.get('/payment-requests', protect, requireAnyPermission(['view_finance', 'manage_finance']), async (req, res) => {
    try {
        const PaymentRequest = require('../../models/PaymentRequest');
        const { status } = req.query; // optional filter: pending|approved|rejected

        const query = status ? { status } : {};
        const requests = await PaymentRequest.find(query)
            .populate('captainId', 'name phone wallet_balance credit_limit is_blocked')
            .populate('reviewedBy', 'name')
            .sort({ createdAt: -1 });

        res.json(requests);
    } catch (error) {
        logger.error('Payment Requests Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/payment-requests/:id/approve
// @desc    الموافقة على طلب السداد — إضافة المبلغ المسدد للرصيد + رفع الحجب إذا لزم

router.put('/payment-requests/:id/approve', protect, requirePermission('manage_finance'), async (req, res) => {
    try {
        const PaymentRequest = require('../../models/PaymentRequest');
        const payReq = await PaymentRequest.findById(req.params.id);
        if (!payReq) return res.status(404).json({ message: 'الطلب غير موجود' });
        if (payReq.status !== 'pending') {
            return res.status(400).json({ message: 'هذا الطلب تمت مراجعته بالفعل' });
        }

        let captain = await User.findById(payReq.captainId);
        if (!captain) return res.status(404).json({ message: 'الكابتن غير موجود' });

        const prevBalance = captain.wallet_balance ?? 0;
        const debt = Math.abs(prevBalance < 0 ? prevBalance : 0); // المديونية = القيمة المطلقة للرصيد السالب

        // 📥 Allow admin to override the deducted amount (optional)
        // If body.deductAmount is provided, use it instead of payReq.amount
        // This lets admin pay only part of the debt or correct mistakes
        const requestedAmount = req.body.deductAmount !== undefined
            ? Number(req.body.deductAmount)
            : Number(payReq.amount);

        if (isNaN(requestedAmount) || requestedAmount <= 0) {
            return res.status(400).json({ message: 'المبلغ غير صالح' });
        }

        // ⚠️ Check if amount exceeds debt
        const exceedsDebt = requestedAmount > debt;
        const overpayment = exceedsDebt ? (requestedAmount - debt) : 0;

        // If admin didn't confirm overpayment, reject and inform.
        // ⚠️ يجب أن يسبق المطالبة الذرية أدناه — يرجع قبل أي تغيير حالة، فيمكن للأدمن
        // إعادة المحاولة مع confirmOverpayment والطلب ما زال pending.
        if (exceedsDebt && !req.body.confirmOverpayment) {
            return res.status(400).json({
                message: 'overpayment_warning',
                debt,
                requestedAmount,
                overpayment,
                warningMessage: `المبلغ المسدد (${requestedAmount} ج.س) أكثر من المديونية الحالية (${debt} ج.س) بمقدار ${overpayment} ج.س. هل تريد المتابعة؟`
            });
        }

        // 🛡️ CRITICAL: مطالبة ذرية بالطلب قبل تعديل الرصيد — تمنع الموافقة المزدوجة
        // (نقرتان/أدمنان) من إضافة الرصيد مرتين لدفعة واحدة (تصفير مديونية مضاعف).
        // كان الفحص السابق status==='pending' غير ذري مع تعديل الرصيد.
        const claimed = await PaymentRequest.findOneAndUpdate(
            { _id: req.params.id, status: 'pending' },
            { $set: { status: 'approved', reviewedBy: req.user._id, reviewedAt: new Date(),
                      ...(req.body.deductAmount !== undefined ? { deductedAmount: requestedAmount } : {}) } },
            { new: true }
        );
        if (!claimed) {
            return res.status(400).json({ message: 'هذا الطلب تمت مراجعته بالفعل' });
        }

        // ✅ Atomic update using $inc (يُنفَّذ مرة واحدة فقط — الفائز بالمطالبة أعلاه)
        captain = await User.findByIdAndUpdate(
            payReq.captainId,
            { $inc: { wallet_balance: requestedAmount } },
            { new: true }
        );

        let changed = false;
        // ✅ CREDIT CEILING FIX: balance must never exceed 0 (no positive balance allowed)
        if (captain.wallet_balance > 0) {
            captain.wallet_balance = 0; // safety cap at 0
            changed = true;
        }

        // رفع الحجب فقط إذا الرصيد ضمن الحد الائتماني
        const creditLimit = captain.credit_limit ?? -5000;
        if (captain.wallet_balance >= creditLimit && captain.is_blocked) {
            captain.is_blocked = false;
            changed = true;
        }
        
        if (changed) {
            await captain.save();
        }
        
        const newBalance = captain.wallet_balance;
        const actualDeduction = requestedAmount; // We added this, though it may have been capped

        // الطلب حُدِّث ذرياً أعلاه (claimed) — لا حاجة لحفظ ثانٍ.

        // 📡 Real-Time Unblock: notify captain immediately via socket
        const ioInst = req.app.get('io');
        if (ioInst && !captain.is_blocked) {
            ioInst.to(captain._id.toString()).emit('payment_approved', {
                newBalance: captain.wallet_balance,
                message: `تم خصم ${actualDeduction} ج.س من مديونيتك. الرصيد الحالي: ${captain.wallet_balance} ج.س`
            });
        }

        // 🔔 إشعار للكابتن
        const { sendNotification } = require('../../utils/notificationHelper');
        const remainingDebt = Math.abs(captain.wallet_balance);
        const notifMsg = remainingDebt > 0
            ? `تمت الموافقة على دفعتك بمبلغ ${actualDeduction} ج.س. المتبقي عليك: ${remainingDebt} ج.س`
            : `تمت الموافقة على دفعتك بمبلغ ${actualDeduction} ج.س. تم تصفير المديونية بنجاح!`;

        await sendNotification(req.app, {
            userId: captain._id,
            title: '✅ تم قبول سداد المديونية',
            message: notifMsg,
            type: 'payment_approved',   // 🧭 يفتح محفظة الكابتن
            relatedId: payReq._id
        });

        logger.info(`✅ PaymentRequest ${payReq._id} APPROVED | Captain balance: ${prevBalance} → ${captain.wallet_balance} | Deducted: ${actualDeduction} | Blocked: ${captain.is_blocked}`);

        res.json({
            message: 'تمت الموافقة على السداد بنجاح',
            newBalance: captain.wallet_balance,
            deductedAmount: actualDeduction,
            remainingDebt: Math.abs(captain.wallet_balance),
            isBlocked: captain.is_blocked
        });
    } catch (error) {
        logger.error('Approve Payment Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/payment-requests/:id/reject
// @desc    رفض طلب السداد مع إشعار الكابتن بالسبب

router.put('/payment-requests/:id/reject', protect, requirePermission('manage_finance'), async (req, res) => {
    try {
        const PaymentRequest = require('../../models/PaymentRequest');
        const { adminNote } = req.body;

        const payReq = await PaymentRequest.findById(req.params.id)
            .populate('captainId', 'name _id');
        if (!payReq) return res.status(404).json({ message: 'الطلب غير موجود' });
        if (payReq.status !== 'pending') {
            return res.status(400).json({ message: 'هذا الطلب تمت مراجعته بالفعل' });
        }

        payReq.status = 'rejected';
        payReq.adminNote = adminNote || 'لم يتم تحديد السبب';
        payReq.reviewedBy = req.user._id;
        payReq.reviewedAt = new Date();
        await payReq.save();

        // 🔔 إشعار للكابتن
        const { sendNotification } = require('../../utils/notificationHelper');
        await sendNotification(req.app, {
            userId: payReq.captainId._id,
            title: '❌ تم رفض إشعار السداد',
            message: `تم رفض دفعتك بمبلغ ${payReq.amount} ج.س. السبب: ${payReq.adminNote}. الرجاء التواصل مع الإدارة.`,
            type: 'payment_rejected',   // 🧭 يفتح محفظة الكابتن
            relatedId: payReq._id
        });

        res.json({ message: 'تم رفض الطلب وإشعار الكابتن' });
    } catch (error) {
        logger.error('Reject Payment Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 📣 Broadcast Notifications — إرسال إشعارات جماعية
// =========================================================

// @route   GET /api/admin/users/search?q=...
// @desc    البحث عن مستخدم بالاسم أو الهاتف (للإشعار المحدد)

router.get('/promo-codes', protect, superAdminOnly, async (req, res) => {
    try {
        const codes = await PromoCode.find()
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });
        res.json(codes);
    } catch (e) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /api/admin/promo-codes

router.post('/promo-codes', protect, superAdminOnly, async (req, res) => {
    try {
        const { code, type, value, appliesTo, maxDiscount, minOrderValue, usageLimit, userUsageLimit, validFrom, validUntil, city, description } = req.body;
        if (!code || !type || value === undefined || !validUntil) {
            return res.status(400).json({ message: 'الكود، النوع، القيمة، وتاريخ الانتهاء مطلوبة' });
        }
        const exists = await PromoCode.findOne({ code: code.toUpperCase().trim() });
        if (exists) return res.status(400).json({ message: 'هذا الكود مستخدم بالفعل' });

        const promo = await PromoCode.create({
            code: code.toUpperCase().trim(),
            type, value,
            appliesTo:     appliesTo    || 'total',
            maxDiscount:   maxDiscount   || null,
            minOrderValue: minOrderValue || 0,
            usageLimit:    usageLimit    || null,
            userUsageLimit: userUsageLimit || 1,
            validFrom:  validFrom  || new Date(),
            validUntil,
            city:        city        || 'all',
            description: description || '',
            createdBy:   req.user._id
        });

        await logAdminAction(req.user, 'other', `إنشاء كوبون خصم: ${promo.code}`, promo._id, promo.code);
        res.status(201).json(promo);
    } catch (e) {
        logger.error('Promo create error:', e);
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/admin/promo-codes/:id

router.put('/promo-codes/:id', protect, superAdminOnly, async (req, res) => {
    try {
        const promo = await PromoCode.findById(req.params.id);
        if (!promo) return res.status(404).json({ message: 'الكوبون غير موجود' });

        const fields = ['type','value','appliesTo','maxDiscount','minOrderValue','usageLimit','userUsageLimit','validFrom','validUntil','city','description','isActive'];
        fields.forEach(f => { if (req.body[f] !== undefined) promo[f] = req.body[f]; });
        await promo.save();
        res.json(promo);
    } catch (e) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// DELETE /api/admin/promo-codes/:id

router.delete('/promo-codes/:id', protect, superAdminOnly, async (req, res) => {
    try {
        const promo = await PromoCode.findByIdAndDelete(req.params.id);
        if (!promo) return res.status(404).json({ message: 'الكوبون غير موجود' });
        await logAdminAction(req.user, 'other', `حذف كوبون خصم: ${promo.code}`, promo._id, promo.code);
        res.json({ message: 'تم حذف الكوبون بنجاح' });
    } catch (e) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /api/admin/promo-codes/:id/usage — من استخدم الكوبون

router.get('/promo-codes/:id/usage', protect, superAdminOnly, async (req, res) => {
    try {
        const promo = await PromoCode.findById(req.params.id)
            .populate('usedBy.user', 'name phone');
        if (!promo) return res.status(404).json({ message: 'الكوبون غير موجود' });
        res.json({ code: promo.code, usedCount: promo.usedCount, usedBy: promo.usedBy });
    } catch (e) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// ⭐ إدارة التقييمات
// =========================================================

// GET /api/admin/ratings — كل التقييمات مع فلترة

module.exports = router;
