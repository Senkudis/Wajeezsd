/**
 * 🧭 تسجيل تعثّر العملاء في النماذج، وقراءته للإدارة.
 *
 *   POST /api/client-errors            ← الواجهة: خاناتٌ رُفضت في محاولة
 *   GET  /api/admin/client-errors      ← الإدارة: أيّ الخانات يتعثّر فيها الناس
 *
 * انظر models/ClientError.js لماذا، و public_html/js/field-errors.js لمن يرسل.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const ClientError = require('../models/ClientError');
const {
    protect, requireAnyPermission, getAdminCityFilter, VALID_CITIES
} = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

const FORMS = ['order'];
const SOURCES = ['client', 'server'];
// اسم الخانة كما تعرفه الواجهة أو الخادم: pickup-phone، dropoff.receiverPhone، stop-3-addr
const FIELD_RE = /^[A-Za-z0-9._-]{1,60}$/;
const MAX_FIELDS = 12;

/** أسماء الخانات بلغة الإدارة — «stop-3-phone» يُقرأ «هاتف نقطة إضافية» */
const FIELD_LABELS = {
    'pickup-addr': 'موقع الاستلام', 'pickup-name': 'اسم المرسل', 'pickup-phone': 'هاتف المرسل',
    'dropoff-addr': 'وجهة التسليم', 'dropoff-name': 'اسم المستلم', 'dropoff-phone': 'هاتف المستلم',
    'details': 'وصف الطلب', 'price': 'السعر',
    'errand-items': 'أصناف «اشترِ لي»', 'errand-shop-input': 'اسم المحل («اشترِ لي»)',
    'stop-addr': 'موقع نقطة إضافية', 'stop-phone': 'هاتف نقطة إضافية',
    'server': 'رفضٌ عامّ من الخادم'
};

/** يوحّد النقاط الإضافية (stop-7-addr ← stop-addr) كي تُجمَع معاً */
function canonicalField(f) {
    return String(f).replace(/^stop-\d+-/, 'stop-');
}

const reportLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => String(req.user && req.user._id),
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
    standardHeaders: true,
    legacyHeaders: false,
    // الإبلاغ لا يُعيق العميل أبداً: الردّ يُتجاهَل في الواجهة
    message: { ok: false }
});

// ─── POST /api/client-errors ─────────────────────────────────────────────
router.post('/client-errors', protect, reportLimiter, async (req, res) => {
    try {
        const { form, source, fields, appVersion } = req.body || {};
        if (!FORMS.includes(form) || !SOURCES.includes(source) || !Array.isArray(fields) || !fields.length) {
            return res.status(400).json({ ok: false });
        }
        const city = VALID_CITIES.includes(req.user.city) ? req.user.city : undefined;
        const docs = fields.slice(0, MAX_FIELDS)
            .filter(f => f && typeof f.field === 'string' && FIELD_RE.test(f.field))
            .map(f => ({
                user: req.user._id,
                city,
                form,
                source,
                field: canonicalField(f.field),
                message: typeof f.message === 'string' ? f.message.slice(0, 200) : '',
                appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 20) : ''
            }));
        if (docs.length) await ClientError.insertMany(docs, { ordered: false });
        res.status(201).json({ ok: true, recorded: docs.length });
    } catch (err) {
        logger.warn({ err: err.message }, '[client-errors] record failed');
        res.status(500).json({ ok: false });
    }
});

// ─── GET /api/admin/client-errors ────────────────────────────────────────
const DAYS = [1, 7, 30];

router.get('/admin/client-errors', protect, requireAnyPermission(['view_orders', 'view_complaints']), async (req, res) => {
    try {
        const days = DAYS.includes(Number(req.query.days)) ? Number(req.query.days) : 7;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const match = { ...getAdminCityFilter(req), form: 'order', createdAt: { $gte: since } };

        const [byField, attempts, recent] = await Promise.all([
            ClientError.aggregate([
                { $match: match },
                { $group: {
                    _id: '$field',
                    count: { $sum: 1 },
                    users: { $addToSet: '$user' },
                    fromServer: { $sum: { $cond: [{ $eq: ['$source', 'server'] }, 1, 0] } },
                    lastAt: { $max: '$createdAt' },
                    messages: { $addToSet: '$message' }
                } },
                { $project: {
                    _id: 0, field: '$_id', count: 1, fromServer: 1, lastAt: 1,
                    users: { $size: '$users' },
                    messages: { $slice: ['$messages', 4] }
                } },
                { $sort: { count: -1 } },
                { $limit: 40 }
            ]),
            ClientError.distinct('user', match),
            ClientError.find(match)
                .sort({ createdAt: -1 })
                .limit(40)
                .populate('user', 'name phone')
                .select('field message source createdAt user appVersion')
                .lean()
        ]);

        res.json({
            days, since,
            totals: {
                events: byField.reduce((a, r) => a + r.count, 0),
                users: attempts.length
            },
            fields: byField.map(r => ({ ...r, label: FIELD_LABELS[r.field] || r.field })),
            recent: recent.map(r => ({
                at: r.createdAt, field: r.field, label: FIELD_LABELS[r.field] || r.field,
                message: r.message, source: r.source, appVersion: r.appVersion || '',
                user: r.user ? { id: String(r.user._id), name: r.user.name || '', phone: r.user.phone || '' } : null
            }))
        });
    } catch (err) {
        logger.error({ err: err.message }, '[admin/client-errors] load failed');
        res.status(500).json({ message: 'تعذّر تحميل أخطاء العملاء' });
    }
});

module.exports = router;
module.exports.canonicalField = canonicalField;
module.exports.FIELD_LABELS = FIELD_LABELS;
