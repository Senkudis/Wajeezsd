// routes/admin/feedback.js — صوت العميل في لوحة الإدارة.
// يُركّب على /api/admin عبر routes/admin.js.
const express = require('express');
const router = express.Router();
const validateObjectId = require('../../middleware/validateObjectId');
router.param('id', validateObjectId);

const Feedback = require('../../models/Feedback');
const { CANCEL_REASONS } = require('../../models/Feedback');
const { protect, requirePermission, getAdminCityFilter } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const logger = require('../../utils/logger');

/**
 * GET /api/admin/feedback
 * قائمة صوت العميل + ملخّص إحصائي.
 * الملخّص هو الغاية الحقيقية: "لماذا يُلغى الطلب؟" سؤال تجميعي لا فردي.
 */
router.get('/feedback', protect, requirePermission('view_complaints'), async (req, res) => {
    try {
        const cityFilter = getAdminCityFilter(req);
        const { kind, reviewed, days } = req.query;

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));

        const q = { ...cityFilter };
        if (kind === 'cancellation' || kind === 'first_order') q.kind = kind;
        if (reviewed === 'true') q.isReviewed = true;
        if (reviewed === 'false') q.isReviewed = false;

        // نافذة زمنية اختيارية — الافتراضي كل السجلات
        const windowDays = parseInt(days);
        if (Number.isFinite(windowDays) && windowDays > 0) {
            q.createdAt = { $gte: new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000) };
        }

        const [items, total, byReason, byRating, counts] = await Promise.all([
            Feedback.find(q)
                .populate('user', 'name phone city')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Feedback.countDocuments(q),
            // توزيع أسباب الإلغاء — العمود الفقري للتقرير
            Feedback.aggregate([
                { $match: { ...q, kind: 'cancellation' } },
                { $group: { _id: '$reasonCode', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            // توزيع تقييمات أول طلب
            Feedback.aggregate([
                { $match: { ...q, kind: 'first_order', rating: { $ne: null } } },
                { $group: { _id: '$rating', count: { $sum: 1 } } },
                { $sort: { _id: -1 } }
            ]),
            Feedback.aggregate([
                { $match: { ...cityFilter } },
                {
                    $group: {
                        _id: '$kind',
                        total: { $sum: 1 },
                        unreviewed: { $sum: { $cond: ['$isReviewed', 0, 1] } }
                    }
                }
            ])
        ]);

        const ratingSum = byRating.reduce((s, r) => s + r._id * r.count, 0);
        const ratingCount = byRating.reduce((s, r) => s + r.count, 0);

        res.json({
            items,
            total,
            page,
            totalPages: Math.ceil(total / limit) || 1,
            reasonLabels: CANCEL_REASONS,
            summary: {
                byReason: byReason.map(r => ({
                    code: r._id || 'other',
                    label: CANCEL_REASONS[r._id] || 'غير محدّد',
                    count: r.count
                })),
                byRating,
                avgRating: ratingCount ? +(ratingSum / ratingCount).toFixed(2) : null,
                ratingCount,
                counts: counts.reduce((acc, c) => {
                    acc[c._id] = { total: c.total, unreviewed: c.unreviewed };
                    return acc;
                }, {})
            }
        });
    } catch (err) {
        logger.error({ err }, 'GET /admin/feedback failed');
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * PUT /api/admin/feedback/:id/review
 * تعليم السجل كمُراجَع مع ملاحظة داخلية.
 */
router.put('/feedback/:id/review', protect, requirePermission('view_complaints'), async (req, res) => {
    try {
        const note = String(req.body?.adminNote || '').trim().replace(/<[^>]*>/g, '').slice(0, 1000);
        const reviewed = req.body?.isReviewed !== false;

        const doc = await Feedback.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    isReviewed: reviewed,
                    reviewedBy: reviewed ? req.user._id : null,
                    reviewedAt: reviewed ? new Date() : null,
                    adminNote: note
                }
            },
            { new: true }
        );

        if (!doc) return res.status(404).json({ message: 'السجل غير موجود' });

        await logAdminAction(req, 'review_feedback', `مراجعة ملاحظة عميل (${doc.kind})`, doc._id);
        res.json({ message: 'تم الحفظ', feedback: doc });
    } catch (err) {
        logger.error({ err }, 'PUT /admin/feedback/:id/review failed');
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
