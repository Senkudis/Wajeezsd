// routes/admin/reports.js — مراجعة بلاغات المحتوى المسيء.
//
// الصلاحية view_complaints عمداً لا صلاحية جديدة: من يراجع شكاوى العملاء هو
// نفسه من يراجع البلاغات في الممارسة، وإضافة صلاحية ثالثة تعني أدمناً مساعداً
// يرى الشكاوى ولا يرى البلاغات بلا سبب — وبلاغاً مسيئاً يبقى معلّقاً.
const express = require('express');
const router = express.Router();
const validateObjectId = require('../../middleware/validateObjectId');
router.param('id', validateObjectId);

const Report = require('../../models/Report');
const Rating = require('../../models/Rating');
const { protect, requirePermission } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const logger = require('../../utils/logger');

// @route   GET /api/admin/reports?status=pending
router.get('/reports', protect, requirePermission('view_complaints'), async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 30);
        const filter = {};
        if (['pending', 'actioned', 'dismissed'].includes(req.query.status)) {
            filter.status = req.query.status;
        }

        const [reports, total, pendingCount] = await Promise.all([
            Report.find(filter)
                .populate('reporter', 'name phone')
                .populate('targetOwner', 'name phone role')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Report.countDocuments(filter),
            Report.countDocuments({ status: 'pending' })
        ]);

        res.json({ reports, total, pendingCount, page, pages: Math.ceil(total / limit) });
    } catch (e) {
        logger.error({ err: e }, 'Admin reports list error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/reports/:id
// @desc    البتّ في بلاغ: إخفاء المحتوى أو صرف النظر
router.put('/reports/:id', protect, requirePermission('view_complaints'), async (req, res) => {
    try {
        const { action, adminNote } = req.body;   // action: 'hide' | 'dismiss'
        if (!['hide', 'dismiss'].includes(action)) {
            return res.status(400).json({ message: 'الإجراء غير صالح' });
        }

        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'البلاغ غير موجود' });

        // 🙈 الإخفاء يطال التقييمات وحدها: الرسائل خاصّة بطرفَي الطلب أصلاً
        //    (لا يراها جمهور) وعلاجها الحظر أو إيقاف الحساب، والمستخدم لا
        //    "يُخفى" — يُوقَف حسابه من شاشة المستخدمين.
        if (action === 'hide') {
            if (report.targetType !== 'rating') {
                return res.status(400).json({
                    message: 'الإخفاء متاح للتقييمات فقط. للرسائل والمستخدمين استخدم إيقاف الحساب.'
                });
            }
            await Rating.updateOne({ _id: report.targetId }, { $set: { isHidden: true } });
        }

        report.status     = action === 'hide' ? 'actioned' : 'dismissed';
        report.reviewedBy = req.user._id;
        report.reviewedAt = new Date();
        report.adminNote  = typeof adminNote === 'string' ? adminNote.trim().slice(0, 500) : '';
        await report.save();

        await logAdminAction(
            req.user, 'other',
            `${action === 'hide' ? 'إخفاء محتوى مُبلَّغ عنه' : 'صرف نظر عن بلاغ'} (${report.targetType})`,
            report._id, String(report.targetId)
        );

        res.json({ message: action === 'hide' ? 'أُخفي المحتوى' : 'صُرف النظر عن البلاغ', report });
    } catch (e) {
        logger.error({ err: e }, 'Admin report action error');
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
