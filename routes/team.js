/**
 * 🪪 صفحة الفريق العامة + إدارتها.
 *
 * تحلّ محل مشروع captin-verfiy المنفصل بالكامل: لا قاعدة بيانات ثانية، ولا
 * مجموعة `captains` تُملأ يدوياً، ولا حساب أدمن منفصل. كل من يظهر في الصفحة
 * هو مستخدم حقيقي في `users` — فالكابتن الذي يُعتمَد اليوم يظهر في الصفحة
 * فوراً دون أن يلمس أحد شيئاً.
 *
 * القسم العام (بلا مصادقة) لا يُخرج أي رقم هاتف ولا بريد ولا معرّفاً داخلياً:
 * البطاقة تُطبَع وتُمسَح من الغرباء، ووظيفتها إثبات أن حاملها معتمد لا فتح
 * قناة اتصال مباشرة به.
 */

const express = require('express');
const router = express.Router();
const validateObjectId = require('../middleware/validateObjectId');
// 🆔 أي :id ليس ObjectId ⇒ 404 لا 500 (انظر الملف للسبب).
// لا يمسّ :publicId — ذاك معرّف غُفل خاص بالبطاقات وله فحصه الخاص.
router.param('id', validateObjectId);
const mongoose = require('mongoose');

const User = require('../models/User');
const { protect, requirePermission, getAdminCityFilter, adminCanActOnUser } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const {
    TEAM_ROLES,
    generatePublicId,
    compareTeamOrder,
    toPublicTeamMember,
    toAdminTeamMember
} = require('../utils/teamProfile');

/** أقصى عدد أعضاء في الصفحة الواحدة — سقف صلب ضد ?limit=999999. */
const MAX_LIMIT = 60;
const DEFAULT_LIMIT = 24;

/**
 * عنوان موقع الفريق — يُبنى منه رابط الـ QR المطبوع على البطاقة.
 *
 * الافتراضي مسارٌ على النطاق الرئيسي لا نطاقٌ فرعي، لأن هذا ما يعمل فعلاً على
 * الاستضافة: تسجيل تطبيق Node في CloudLinux مرتبط بنطاق واحد، ومشاركة جذر
 * المستندات لا تنقل هذا الارتباط — النطاق الفرعي يُخدَم ملفات ثابتة بلا خادم.
 * وربط تطبيق ثانٍ به يعني عمليةً ثانية تشغّل scheduler.js مرة أخرى: مهام cron
 * كل دقيقة (توزيع، تسويات، إشعارات) تُنفَّذ مرتين.
 *
 * لتحويله إلى نطاق فرعي لاحقاً: اضبط TEAM_BASE_URL في متغيّرات البيئة.
 * ⚠️ لا تغيّره بعد طباعة البطاقات — الروابط المطبوعة تصير ميتة.
 */
const TEAM_BASE_URL = (process.env.TEAM_BASE_URL || 'https://wajeezsd.com/team').replace(/\/+$/, '');

/**
 * تحميل مكتبة QR عند أول استعمال لا عند الإقلاع.
 *
 * ⚠️ النشر هنا يدوي ملفاً ملفاً، و`qrcode` حزمة أُضيفت مع هذه الميزة. لو رُفع
 * الكود قبل تشغيل npm install على السيرفر، فـ require في أعلى الملف يرمي عند
 * الإقلاع ⇒ **الموقع كله لا يقوم**: الطلبات والمحادثات والدفع، كلها تسقط بسبب
 * توليد رمز QR في لوحة الأدمن. التحميل الكسول يحصر العطل في مساره وحده.
 */
function loadQRCode() {
    try {
        return require('qrcode');
    } catch (err) {
        logger.error({ err }, '[Team] حزمة qrcode غير مثبّتة — شغّل npm install على السيرفر');
        return null;
    }
}

/**
 * فلتر Mongo لمن يظهر في الصفحة العامة.
 * يطابق `isTeamVisible` في utils/teamProfile.js حرفياً — أي تعديل هنا يجب أن
 * ينعكس هناك (والاختبارات تتحقق من تطابقهما).
 *
 * ملاحظة على `teamProfile.show`: الافتراضي `true`، لكن المستندات المكتوبة قبل
 * إضافة الحقل لا تحمله أصلاً، فلا يكفي `{ show: true }` وإلا اختفى كل من سُجّل
 * قبل هذه الميزة.
 */
function visibilityFilter() {
    return {
        role: { $in: TEAM_ROLES },
        isActive: true,
        deletedAt: null,
        approvalStatus: 'approved',
        $or: [
            { 'teamProfile.show': true },
            { 'teamProfile.show': { $exists: false } },
            { 'teamProfile.show': null }
        ]
    };
}

/** الحقول التي يحتاجها المُسقِط العام فقط — لا نسحب المحفظة ولا الوثائق كاملة. */
const PUBLIC_FIELDS = 'name role city vehicleType adminRole documents.profilePhoto teamProfile';

/**
 * يُلحق صورة المحل بالتجّار الذين لا صورة شخصية لهم.
 *
 * التاجر لا يرفع صورة شخصية عادةً — هويّته التجارية هي محلّه. بدون هذا كان كل
 * التجّار يظهرون بصورة رمزية واحدة رغم وجود صورة حقيقية لكل محل.
 *
 * استعلام واحد لكل الدفعة لا استعلام لكل تاجر، ومقصور على من يحتاجه فعلاً:
 * من لديه صورة بطاقة أو صورة تسجيل لا يُسأل عنه أصلاً.
 *
 * @param {Array<object>} docs مستندات lean (تُعدَّل في مكانها)
 */
async function attachShopImages(docs) {
    const needing = docs.filter(d =>
        d.role === 'merchant' &&
        !(d.teamProfile && d.teamProfile.photo) &&
        !(d.documents && d.documents.profilePhoto)
    );
    if (needing.length === 0) return docs;

    try {
        const Place = require('../models/Place');
        const places = await Place.find(
            { ownerId: { $in: needing.map(d => d._id) }, image_url: { $nin: [null, ''] } }
        ).select('ownerId image_url').lean();

        const byOwner = new Map();
        for (const p of places) {
            // أوّل محلٍّ بصورة يكفي — التاجر بعدة محلات نعرض أوّلها لا نخلط
            if (!byOwner.has(String(p.ownerId))) byOwner.set(String(p.ownerId), p.image_url);
        }
        for (const doc of needing) {
            const img = byOwner.get(String(doc._id));
            if (img) doc.shopImage = img;
        }
    } catch (err) {
        // فشل هذا لا يمنع عرض الصفحة — التاجر يظهر بالصورة الرمزية فقط
        logger.error({ err }, '[Team] تعذّر جلب صور المحلات');
    }
    return docs;
}

/**
 * يمنح معرّفاً عاماً لكل من يفتقده.
 *
 * لماذا كتابة داخل مسار قراءة عام؟ لأن الشرط الأساسي للنظام هو «بدون تدخل يدوي»:
 * الكابتن الذي يُعتمَد الآن يجب أن يملك رابط بطاقة صالحاً دون أن يفتح أدمنٌ اللوحة.
 * الشرط في الفلتر يضمن أن أول كاتبٍ فقط يُثبّت المعرّف — فالطلبات المتزامنة لا
 * تُبدّل معرّف بطاقةٍ مطبوعة.
 *
 * @param {Array<object>} docs مستندات lean
 * @returns {Promise<Array<object>>} نفس المستندات بعد تعبئة publicId
 */
async function ensurePublicIds(docs) {
    const missing = docs.filter(d => !(d.teamProfile && d.teamProfile.publicId));
    if (missing.length === 0) return docs;

    const ops = missing.map(doc => {
        const publicId = generatePublicId();
        doc.teamProfile = Object.assign({}, doc.teamProfile, { publicId });
        return {
            updateOne: {
                filter: {
                    _id: doc._id,
                    $or: [
                        { 'teamProfile.publicId': { $exists: false } },
                        { 'teamProfile.publicId': null },
                        { 'teamProfile.publicId': '' }
                    ]
                },
                update: { $set: { 'teamProfile.publicId': publicId } }
            }
        };
    });

    try {
        await User.bulkWrite(ops, { ordered: false });
    } catch (err) {
        // فشل التوليد لا يمنع عرض الصفحة — العضو يظهر بلا رابط بطاقة حتى الطلب التالي
        logger.error({ err }, '[Team] تعذّر توليد المعرّفات العامة');
    }
    return docs;
}

// ═══════════════════════════════════════════════
// 🌍 المسارات العامة — بلا مصادقة
// ═══════════════════════════════════════════════

// @route  GET /api/team
// @desc   قائمة أعضاء الفريق الظاهرين (اسم، صورة، مسمّى، قسم — بلا هاتف)
// @access Public
router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
        const department = typeof req.query.department === 'string' ? req.query.department.trim() : '';

        const filter = visibilityFilter();

        // الفلترة بالقسم تُطبَّق بعد الاشتقاق لأن القسم قد يكون مشتقاً من الدور
        // (لا مخزّناً)، فلا يمكن التعبير عنه كشرط Mongo وحده. نجلب ثم نصفّي ثم
        // نُقسّم الصفحات — القائمة بعشرات لا بملايين، والفهرس يغطّي الاستعلام.
        // الترتيب في الذاكرة لا في Mongo — انظر compareTeamOrder لسبب ذلك
        const docs = await User.find(filter)
            .select(PUBLIC_FIELDS)
            .lean();

        docs.sort(compareTeamOrder);
        await ensurePublicIds(docs);
        await attachShopImages(docs);

        const all = docs.map(toPublicTeamMember).filter(m => m.publicId !== '');
        const departments = [...new Set(all.map(m => m.department).filter(Boolean))];

        const filtered = department ? all.filter(m => m.department === department) : all;
        const start = (page - 1) * limit;

        res.json({
            items: filtered.slice(start, start + limit),
            page,
            limit,
            total: filtered.length,
            departments
        });
    } catch (error) {
        logger.error({ err: error }, '[Team] فشل جلب قائمة الفريق');
        res.status(500).json({ message: 'تعذّر تحميل قائمة الفريق' });
    }
});

// @route  GET /api/team/:publicId
// @desc   بطاقة عضو واحد بالمعرّف العام
// @access Public
router.get('/:publicId', async (req, res) => {
    try {
        const publicId = String(req.params.publicId || '');
        // شكل المعرّف: 24 hex. أي شيء آخر لا يصل إلى قاعدة البيانات أصلاً.
        if (!/^[a-f0-9]{24}$/i.test(publicId)) {
            return res.status(404).json({ message: 'البطاقة غير موجودة' });
        }

        const filter = Object.assign(visibilityFilter(), { 'teamProfile.publicId': publicId.toLowerCase() });
        const doc = await User.findOne(filter).select(PUBLIC_FIELDS).lean();

        if (!doc) {
            return res.status(404).json({ message: 'البطاقة غير موجودة' });
        }

        // البطاقة المفردة هي وجهة رمز QR — لا يصحّ أن تعرض صورة رمزية بينما
        // القائمة تعرض صورة المحل لنفس التاجر
        await attachShopImages([doc]);

        res.json(toPublicTeamMember(doc));
    } catch (error) {
        logger.error({ err: error }, '[Team] فشل جلب بطاقة عضو');
        res.status(500).json({ message: 'تعذّر تحميل البطاقة' });
    }
});

// ═══════════════════════════════════════════════
// 🔐 مسارات الإدارة — لوحة وجيز
// ═══════════════════════════════════════════════

const canManageTeam = requirePermission('manage_captains');

// @route  GET /api/team/admin/members
// @desc   كل المرشّحين للظهور (بما فيهم المخفيّون) لعرضهم في لوحة الإدارة
// @access Admin (manage_captains)
router.get('/admin/members', protect, canManageTeam, async (req, res) => {
    try {
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const role = TEAM_ROLES.includes(req.query.role) ? req.query.role : '';

        // الأدمن المساعد مقيّد بمدينته — نفس قاعدة بقية اللوحة
        const filter = Object.assign(
            {
                role: role ? role : { $in: TEAM_ROLES },
                isActive: true,
                deletedAt: null,
                approvalStatus: 'approved'
            },
            getAdminCityFilter(req)
        );

        if (search) {
            // تهريب محارف RegExp: اسمٌ فيه «(» كان يرمي خطأً من قاعدة البيانات
            const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [{ name: new RegExp(safe, 'i') }, { phone: new RegExp(safe, 'i') }];
        }

        const docs = await User.find(filter)
            .select(PUBLIC_FIELDS + ' phone approvalStatus isActive deletedAt')
            .limit(500)
            .lean();

        // نفس ترتيب الصفحة العامة كي يرى الأدمن ما يراه الزائر بالضبط
        docs.sort(compareTeamOrder);
        await ensurePublicIds(docs);
        await attachShopImages(docs);

        res.json({
            items: docs.map(toAdminTeamMember),
            total: docs.length,
            teamBaseUrl: TEAM_BASE_URL
        });
    } catch (error) {
        logger.error({ err: error }, '[Team] فشل جلب قائمة الإدارة');
        res.status(500).json({ message: 'تعذّر تحميل القائمة' });
    }
});

// @route  PATCH /api/team/admin/members/:id
// @desc   تعديل بطاقة عضو: الظهور، المسمّيات، القسم، الصورة
// @access Admin (manage_captains)
router.patch('/admin/members/:id', protect, canManageTeam, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'معرّف غير صالح' });
        }

        const target = await User.findById(req.params.id).select('role city teamProfile name');
        if (!target) return res.status(404).json({ message: 'العضو غير موجود' });

        // 🔒 الأدمن المساعد ممنوع من التصرّف في حسابات الأدمن أو خارج مدينته
        if (!adminCanActOnUser(req, target)) {
            return res.status(403).json({ message: 'غير مصرح بالتعديل على هذا الحساب' });
        }

        const update = {};

        if (typeof req.body.show === 'boolean') {
            update['teamProfile.show'] = req.body.show;
        }

        if (Array.isArray(req.body.jobTitles)) {
            // تُحفظ فارغة عمداً عند المسح ⇒ يعود الاشتقاق التلقائي
            const titles = req.body.jobTitles
                .filter(t => typeof t === 'string')
                .map(t => t.trim())
                .filter(t => t !== '' && t.length <= 100)
                .slice(0, 5);
            update['teamProfile.jobTitles'] = titles;
        }

        if (typeof req.body.department === 'string') {
            update['teamProfile.department'] = req.body.department.trim().slice(0, 100);
        }

        if (typeof req.body.photo === 'string') {
            const photo = req.body.photo.trim();
            // مسارات محلية أو روابط https فقط — لا javascript: ولا data:
            if (photo !== '' && !/^(\/uploads\/|https:\/\/)/.test(photo)) {
                return res.status(400).json({ message: 'رابط الصورة غير صالح' });
            }
            update['teamProfile.photo'] = photo;
        }

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ message: 'لا يوجد ما يُحدَّث' });
        }

        // المعرّف العام يُولَّد هنا إن غاب حتى تُصدر اللوحة رمز QR فوراً
        if (!(target.teamProfile && target.teamProfile.publicId)) {
            update['teamProfile.publicId'] = generatePublicId();
        }

        const updated = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
            .select(PUBLIC_FIELDS + ' phone')
            .lean();

        res.json(toAdminTeamMember(updated));
    } catch (error) {
        logger.error({ err: error }, '[Team] فشل تعديل بطاقة عضو');
        res.status(500).json({ message: 'تعذّر حفظ التعديل' });
    }
});

// @route  PUT /api/team/admin/reorder
// @desc   ترتيب العرض — يُرسل مصفوفة المعرّفات بالترتيب المطلوب
// @access Admin (manage_captains)
router.put('/admin/reorder', protect, canManageTeam, async (req, res) => {
    try {
        const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
        if (ids.length === 0) return res.status(400).json({ message: 'قائمة الترتيب فارغة' });
        if (ids.length > 500) return res.status(400).json({ message: 'قائمة الترتيب طويلة جداً' });
        if (!ids.every(id => mongoose.Types.ObjectId.isValid(id))) {
            return res.status(400).json({ message: 'قائمة الترتيب تحوي معرّفاً غير صالح' });
        }

        const ops = ids.map((id, index) => ({
            updateOne: { filter: { _id: id }, update: { $set: { 'teamProfile.order': index } } }
        }));
        await User.bulkWrite(ops, { ordered: false });

        res.json({ success: true, count: ids.length });
    } catch (error) {
        logger.error({ err: error }, '[Team] فشل حفظ الترتيب');
        res.status(500).json({ message: 'تعذّر حفظ الترتيب' });
    }
});

// @route  GET /api/team/admin/members/:id/qr
// @desc   رمز QR (PNG) لبطاقة العضو — يُطبع على البطاقة البلاستيكية
// @access Admin (manage_captains)
router.get('/admin/members/:id/qr', protect, canManageTeam, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'معرّف غير صالح' });
        }

        const doc = await User.findById(req.params.id).select('name teamProfile').lean();
        if (!doc) return res.status(404).json({ message: 'العضو غير موجود' });

        let publicId = doc.teamProfile && doc.teamProfile.publicId;
        if (!publicId) {
            publicId = generatePublicId();
            await User.updateOne(
                {
                    _id: doc._id,
                    $or: [
                        { 'teamProfile.publicId': { $exists: false } },
                        { 'teamProfile.publicId': null },
                        { 'teamProfile.publicId': '' }
                    ]
                },
                { $set: { 'teamProfile.publicId': publicId } }
            );
            // إن سبقنا طلبٌ آخر إلى التوليد، المعرّف المثبَّت هو الصحيح لا معرّفنا
            const fresh = await User.findById(doc._id).select('teamProfile.publicId').lean();
            publicId = (fresh && fresh.teamProfile && fresh.teamProfile.publicId) || publicId;
        }

        const QRCode = loadQRCode();
        if (!QRCode) {
            return res.status(503).json({
                message: 'مكتبة توليد QR غير مثبّتة على السيرفر — شغّل npm install ثم أعد المحاولة'
            });
        }

        const url = `${TEAM_BASE_URL}/m/${publicId}`;
        // مستوى تصحيح M فأعلى: البطاقة تُخدَش وتتّسخ في الجيب، والقراءة يجب أن
        // تنجح مع فقد جزء من الرمز.
        const buffer = await QRCode.toBuffer(url, {
            errorCorrectionLevel: 'M',
            type: 'png',
            width: 512,
            margin: 2
        });

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename="wajeez-card-${publicId}.png"`);
        res.setHeader('X-Team-Card-Url', url);
        res.send(buffer);
    } catch (error) {
        logger.error({ err: error }, '[Team] فشل توليد رمز QR');
        res.status(500).json({ message: 'تعذّر توليد رمز QR' });
    }
});

module.exports = router;
module.exports.visibilityFilter = visibilityFilter;
module.exports.TEAM_BASE_URL = TEAM_BASE_URL;
