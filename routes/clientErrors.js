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

const FORMS = ClientError.schema.path('form').enumValues;

/** أسماء النماذج بلغة الإدارة */
const FORM_LABELS = {
    order: 'طلب توصيل', register: 'تسجيل عميل', captain_signup: 'تسجيل كابتن',
    shop_register: 'انضمام متجر', shop_order: 'طلب من متجر'
};
const SOURCES = ['client', 'server'];
// اسم الخانة كما تعرفه الواجهة أو الخادم: pickup-phone، dropoff.receiverPhone، stop-3-addr
const FIELD_RE = /^[A-Za-z0-9._-]{1,60}$/;
const MAX_FIELDS = 12;

/**
 * أسماء الخانات بلغة الإدارة — «stop-3-phone» يُقرأ «هاتف نقطة إضافية».
 * المفتاح «نموذج:خانة» حين يتكرّر اسم الخانة بين نموذجين بمعنيين، وإلا الخانة وحدها.
 */
const FIELD_LABELS = {
    // التسجيل (عميل وكابتن)
    'name': 'الاسم', 'phone': 'رقم الهاتف', 'email': 'البريد الإلكتروني', 'password': 'كلمة المرور',
    'registerCity': 'المدينة', 'city': 'المدينة', 'nationalId': 'الرقم الوطني', 'address': 'المنطقة',
    'whatsapp': 'رقم الواتساب', 'emergencyPhone': 'رقم الطوارئ', 'emergencyContactName': 'اسم جهة الطوارئ',
    'emergencyRelation': 'صلة القرابة', 'pledgeName': 'الاسم في الإقرار', 'pledgePhone': 'الهاتف في الإقرار',
    'pledgeAgree': 'الموافقة على الشروط',
    // انضمام متجر
    'fBusinessName': 'الاسم التجاري', 'fCategory': 'تصنيف المتجر', 'fCategoryOther': 'التصنيف (أخرى)',
    'locationBtn': 'موقع المتجر', 'fOwnerName': 'اسم المالك', 'fPhone': 'هاتف المتجر', 'fBankName': 'البنك',
    'fBankNameOther': 'اسم البنك (أخرى)', 'fBankAccountNum': 'رقم الحساب', 'fBankAccountOwner': 'مالك الحساب',
    // طرق الدفع (js/payment-methods.js) — pm-bankak-num ← pm-num
    'fPaymentMethods': 'طرق الدفع', 'pm-num': 'رقم حساب الدفع', 'pm-name': 'اسم صاحب حساب الدفع',
    'box-logo': 'شعار المتجر', 'box-id': 'إثبات الهوية', 'termsRow': 'الموافقة على الشروط',
    // الطلب من صفحة متجر
    'deliveryAddress': 'موقع التوصيل', 'receiverName': 'اسم المستلم', 'receiverPhone': 'هاتف المستلم',
    'deliveryFee': 'سعر التوصيل',
    'pickup-addr': 'موقع الاستلام', 'pickup-name': 'اسم المرسل', 'pickup-phone': 'هاتف المرسل',
    'dropoff-addr': 'وجهة التسليم', 'dropoff-name': 'اسم المستلم', 'dropoff-phone': 'هاتف المستلم',
    'details': 'وصف الطلب', 'price': 'السعر',
    'errand-items': 'أصناف «اشترِ لي»', 'errand-shop-input': 'اسم المحل («اشترِ لي»)',
    'stop-addr': 'موقع نقطة إضافية', 'stop-phone': 'هاتف نقطة إضافية',
    'server': 'رفضٌ عامّ من الخادم'
};

/** يوحّد النقاط الإضافية (stop-7-addr ← stop-addr) كي تُجمَع معاً */
function canonicalField(f) {
    return String(f).replace(/^stop-\d+-/, 'stop-').replace(/^pm-\w+-(num|name)$/, 'pm-$1');
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

/** يحفظ ما يصحّ من الإبلاغ — مشتركٌ بين المُصادَق والمجهول */
async function record(req, res, { userId, city, allowedForms }) {
    try {
        const { form, source, fields, appVersion } = req.body || {};
        if (!allowedForms.includes(form) || !SOURCES.includes(source) || !Array.isArray(fields) || !fields.length) {
            return res.status(400).json({ ok: false });
        }
        const docs = fields.slice(0, MAX_FIELDS)
            .filter(f => f && typeof f.field === 'string' && FIELD_RE.test(f.field))
            .map(f => ({
                user: userId || undefined,
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
}

// ─── POST /api/client-errors ─────────────────────────────────────────────
router.post('/client-errors', protect, reportLimiter, (req, res) => record(req, res, {
    userId: req.user._id,
    city: VALID_CITIES.includes(req.user.city) ? req.user.city : undefined,
    allowedForms: FORMS
}));

// ─── POST /api/client-errors/anonymous ───────────────────────────────────
// من يملأ نموذج التسجيل لم يدخل بعد — وهو أكثر من يتعثّر. نموذجا التسجيل
// وحدهما، وبحدٍّ ضيّق لكل عنوان: لا حساب يُحاسَب عليه الإغراق.
const ANON_FORMS = ['register', 'captain_signup'];
const anonLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false },
    message: { ok: false }
});
router.post('/client-errors/anonymous', anonLimiter, (req, res) => record(req, res, {
    userId: null,
    city: undefined,
    allowedForms: ANON_FORMS
}));

// ─── GET /api/admin/client-errors ────────────────────────────────────────
const DAYS = [1, 7, 30];

router.get('/admin/client-errors', protect, requireAnyPermission(['view_orders', 'view_complaints']), async (req, res) => {
    try {
        const days = DAYS.includes(Number(req.query.days)) ? Number(req.query.days) : 7;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const match = { ...getAdminCityFilter(req), createdAt: { $gte: since } };
        if (FORMS.includes(req.query.form)) match.form = req.query.form;

        const [byField, attempts, recent] = await Promise.all([
            ClientError.aggregate([
                { $match: match },
                { $group: {
                    _id: { form: '$form', field: '$field' },
                    count: { $sum: 1 },
                    users: { $addToSet: '$user' },
                    fromServer: { $sum: { $cond: [{ $eq: ['$source', 'server'] }, 1, 0] } },
                    lastAt: { $max: '$createdAt' },
                    messages: { $addToSet: '$message' }
                } },
                { $project: {
                    _id: 0, form: '$_id.form', field: '$_id.field', count: 1, fromServer: 1, lastAt: 1,
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
                .select('form field message source createdAt user appVersion')
                .lean()
        ]);

        res.json({
            days, since,
            totals: {
                events: byField.reduce((a, r) => a + r.count, 0),
                users: attempts.length
            },
            forms: FORM_LABELS,
            fields: byField.map(r => ({ ...r, label: FIELD_LABELS[r.field] || r.field, formLabel: FORM_LABELS[r.form] || r.form })),
            recent: recent.map(r => ({
                at: r.createdAt, form: r.form, formLabel: FORM_LABELS[r.form] || r.form,
                field: r.field, label: FIELD_LABELS[r.field] || r.field,
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
module.exports.FORM_LABELS = FORM_LABELS;
