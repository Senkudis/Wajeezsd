/**
 * 🚩 الإبلاغ عن محتوى مسيء + حظر المستخدمين.
 *
 * شرط App Store Review Guideline 1.2: أي تطبيق يعرض محتوىً من المستخدمين
 * يجب أن يوفّر ترشيحاً للمحتوى المسيء، وآليةَ إبلاغ، وقدرةً على حظر المسيئين،
 * وبيانات تواصل منشورة. تعليقات التقييم في وجيز تُعرض علناً لكل زائر، فالشرط
 * ينطبق — وقد رُفض التقديم الأول على App Store بطلب إظهار هاتين الآليتين.
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const Report = require('../models/Report');
const Rating = require('../models/Rating');
const Message = require('../models/Message');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { notifyAdmins } = require('../utils/notificationHelper');
const logger = require('../utils/logger');

// 🛑 حدّ معدّل — الإبلاغ زرٌّ يُضغط بغضب، والغضب يُكرّر
const reportLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 15,
    message: { message: 'أرسلت بلاغات كثيرة. انتظر قليلاً ثم حاول مجدداً.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false }
});

/**
 * 🔎 يجلب المحتوى المُبلَّغ عنه ويتحقّق من وجوده.
 *
 * يُرجع مالكه ولقطةً من نصّه — الاثنان يُشتقّان خادمياً لا يُرسلهما المُبلِغ:
 * مُبلِغٌ يرسل «المالك» كما يشاء يستطيع تلطيخ سجلّ أي مستخدم ببلاغاتٍ ليست
 * على محتواه.
 */
async function resolveTarget(targetType, targetId) {
    if (targetType === 'rating') {
        const doc = await Rating.findById(targetId).select('client comment isHidden').lean();
        if (!doc) return null;
        return { owner: doc.client, snapshot: (doc.comment || '').slice(0, 1000) };
    }
    if (targetType === 'message') {
        const doc = await Message.findById(targetId).select('sender text').lean();
        if (!doc) return null;
        return { owner: doc.sender, snapshot: (doc.text || '').slice(0, 1000) };
    }
    if (targetType === 'user') {
        const doc = await User.findById(targetId).select('name').lean();
        if (!doc) return null;
        return { owner: doc._id, snapshot: doc.name || '' };
    }
    return null;
}

// ============================================================
// @route   POST /api/reports
// @desc    الإبلاغ عن تقييم أو رسالة أو مستخدم
// ============================================================
router.post('/', protect, reportLimiter, async (req, res) => {
    try {
        const { targetType, targetId, reason, note } = req.body;

        if (!['rating', 'message', 'user'].includes(targetType)) {
            return res.status(400).json({ message: 'نوع البلاغ غير صالح' });
        }
        if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ message: 'معرّف المحتوى غير صالح' });
        }
        const REASONS = ['offensive', 'harassment', 'spam', 'false_info', 'inappropriate', 'other'];
        if (!REASONS.includes(reason)) {
            return res.status(400).json({ message: 'سبب البلاغ غير صالح' });
        }

        const target = await resolveTarget(targetType, targetId);
        if (!target) return res.status(404).json({ message: 'المحتوى غير موجود' });

        // 🙅 لا يُبلّغ المرء عن نفسه — بلاغٌ بلا معنى يُشوّش قائمة المراجعة
        if (String(target.owner) === String(req.user._id)) {
            return res.status(400).json({ message: 'لا يمكنك الإبلاغ عن محتواك' });
        }

        const report = await Report.create({
            reporter:    req.user._id,
            targetType,
            targetId,
            targetOwner: target.owner,
            reason,
            note:        typeof note === 'string' ? note.trim().slice(0, 500) : '',
            snapshot:    target.snapshot
        });

        // 📣 الإدارة تُخطَر فوراً — بلاغٌ ينتظر أن يفتح أحدٌ لوحةً هو بلاغٌ ضائع
        notifyAdmins(req.app, {
            title: 'بلاغ جديد عن محتوى',
            message: `بلاغ (${reason}) على ${targetType === 'rating' ? 'تقييم' : targetType === 'message' ? 'رسالة' : 'مستخدم'}`,
            type: 'admin_alert',
            relatedId: report._id
        }).catch(e => logger.warn({ err: e.message }, 'report admin notify failed'));

        res.status(201).json({
            message: 'تم استلام بلاغك وسيُراجَع خلال ٢٤ ساعة. شكراً لك.',
            reportId: report._id
        });
    } catch (err) {
        // 11000 = بلاغ مكرّر من نفس المستخدم على نفس المحتوى.
        // نردّ بنجاح لا بخطأ: المستخدم فعل ما يريده فعلاً (أبلغ)، وإخباره
        // بـ«خطأ» يدفعه للتكرار ظنّاً أن الأولى لم تصل.
        if (err && err.code === 11000) {
            return res.status(200).json({ message: 'سبق أن أبلغت عن هذا المحتوى — البلاغ قيد المراجعة.' });
        }
        logger.error({ err }, 'Create report error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// @route   GET /api/reports/reasons
// @desc    أسباب البلاغ للعرض — من الخادم لا من حزمة التطبيق
// ============================================================
router.get('/reasons', (req, res) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.json({
        reasons: [
            { code: 'offensive',     label: 'لغة مسيئة أو بذيئة' },
            { code: 'harassment',    label: 'تحرّش أو تهديد' },
            { code: 'spam',          label: 'إزعاج أو إعلانات' },
            { code: 'false_info',    label: 'معلومات كاذبة' },
            { code: 'inappropriate', label: 'محتوى غير لائق' },
            { code: 'other',         label: 'سبب آخر' }
        ]
    });
});

// ============================================================
// 🚫 حظر المستخدمين
// ============================================================

// @route   GET /api/reports/blocked
// @desc    قائمة من حظرتهم — ليراها المستخدم ويفكّ الحظر
router.get('/blocked', protect, async (req, res) => {
    try {
        const me = await User.findById(req.user._id)
            .select('blockedUsers')
            .populate('blockedUsers', 'name documents.profilePhoto')
            .lean();
        res.json({ blocked: me?.blockedUsers || [] });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   POST /api/reports/block/:userId
router.post('/block/:userId', protect, async (req, res) => {
    try {
        const targetId = req.params.userId;
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ message: 'معرّف غير صالح' });
        }
        if (String(targetId) === String(req.user._id)) {
            return res.status(400).json({ message: 'لا يمكنك حظر نفسك' });
        }
        const exists = await User.exists({ _id: targetId });
        if (!exists) return res.status(404).json({ message: 'المستخدم غير موجود' });

        await User.updateOne({ _id: req.user._id }, { $addToSet: { blockedUsers: targetId } });
        res.json({ message: 'تم الحظر — لن تصلك رسائل من هذا المستخدم', blocked: true });
    } catch (err) {
        logger.error({ err }, 'Block user error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   DELETE /api/reports/block/:userId
router.delete('/block/:userId', protect, async (req, res) => {
    try {
        await User.updateOne({ _id: req.user._id }, { $pull: { blockedUsers: req.params.userId } });
        res.json({ message: 'تم رفع الحظر', blocked: false });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
