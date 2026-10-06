const express = require('express');
const { toAdmins } = require('../utils/adminRooms');   // 📡 كلٌّ يسمع مدنه
const router = express.Router();
const mongoose = require('mongoose');
const validateObjectId = require('../middleware/validateObjectId');
// 🆔 أي :id ليس ObjectId ⇒ 404 لا 500 (انظر الملف للسبب)
router.param('id', validateObjectId);
const Complaint = require('../models/Complaint');
const Order = require('../models/Order');
const User = require('../models/User');
const {
    protect, requirePermission, getAdminCityFilter, adminCoversCity, VALID_CITIES
} = require('../middleware/authMiddleware');
const { sendNotification } = require('../utils/notificationHelper');
const logger = require('../utils/logger');

/**
 * 🔐 مَن يعمل على التذاكر.
 *
 * كانت مسارات الإدارة هنا `adminOnly` وحده: أدمنٌ مساعد **بلا** صلاحية
 * view_complaints، أو مُعيَّنٌ على مدينةٍ أخرى، يقرأ كل التذاكر (بأسماء
 * العملاء وهواتفهم) ويردّ عليها ويغلقها. صفحة الشكاوى تحرسها
 * data-perm="view_complaints" — لكن ذلك في المتصفّح، والـ API مفتوح.
 * الآن: الصلاحية نفسها على الخادم، ونطاق المدينة كبقية لوحة الإدارة.
 */
const STAFF = requirePermission('view_complaints');

function isStaff(user) {
    if (!user || user.role !== 'admin') return false;
    if (!user.adminRole || user.adminRole === 'super_admin') return true;
    return Array.isArray(user.permissions) && user.permissions.includes('view_complaints');
}

/** التذكرة ضمن نطاق هذا الأدمن؟ (تذكرةٌ قديمة بلا مدينة: للأدمن الرئيسيّ وحده حتى تُملأ) */
function coversTicket(user, complaint) {
    return adminCoversCity(user, complaint && complaint.city);
}

/** من يُبلَّغ بتذكرةٍ في مدينة: من يملك الصلاحية ويغطّي المدينة — لا كل الأدمنية */
async function staffFor(city) {
    const admins = await User.find({ role: 'admin', isActive: true })
        .select('_id adminRole permissions city cities').lean();
    return admins.filter(a => isStaff(a) && adminCoversCity(a, city));
}

const CATEGORIES = Complaint.schema.path('category').enumValues;
const MAX_TEXT = 2000;

/** نصٌّ من المستخدم: نصٌّ فعلاً، مقصوص الأطراف، في حدوده — أو null */
function cleanText(v, max) {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t && t.length <= max ? t : null;
}

/** روابط الصور المرفقة: نصوصٌ من مسار الرفع أو https، بحدٍّ أعلى */
function cleanImages(v) {
    if (!Array.isArray(v)) return [];
    return v.filter(x => typeof x === 'string' && x.length <= 500 && /^(\/uploads\/|\/api\/uploads\/|https:\/\/)/.test(x)).slice(0, 5);
}

// ═══════════════════════════════════════════════
// 📱 Client Routes
// ═══════════════════════════════════════════════

// @route  POST /api/complaints
// @desc   فتح تذكرة دعم فني جديدة
// @access Client
router.post('/', protect, async (req, res) => {
    try {
        const { orderId, subject, category, reason } = req.body || {};

        // ⚠️ وصفٌ غائب كان يُسقط المسار بـ 500 (description.substring على
        //    undefined)، ونوعٌ غير نصّيّ كذلك — الرسالة الصحيحة 400.
        const description = cleanText(req.body && req.body.description, MAX_TEXT);
        if (!description) {
            return res.status(400).json({ message: `اكتب وصف المشكلة (حتى ${MAX_TEXT} حرف)` });
        }
        const safeSubject = cleanText(subject, 200) || 'شكوى جديدة';
        const safeCategory = CATEGORIES.includes(category) ? category : 'other';

        let orderModel = 'Order';
        let order = null;

        // التحقق من الطلب إذا كان موجوداً
        if (orderId) {
            if (!mongoose.isValidObjectId(orderId)) {
                return res.status(400).json({ message: 'رقم الطلب غير صالح' });
            }
            order = await Order.findOne({ _id: orderId, client: req.user._id }).select('city').lean();
            if (!order) {
                const ShopOrder = require('../models/ShopOrder');
                order = await ShopOrder.findOne({ _id: orderId, client: req.user._id }).select('city').lean();
                if (order) orderModel = 'ShopOrder';
            }
            if (!order) {
                return res.status(404).json({ message: 'الطلب غير موجود أو لا ينتمي لحسابك' });
            }
        }

        // 🌍 المدينة: مدينة الطلب إن وُجد، وإلا مدينة العميل — ليراها أدمن مدينتها
        const city = [order && order.city, req.user.city].find(c => VALID_CITIES.includes(c)) || 'Khartoum';

        const complaint = await Complaint.create({
            orderId:     orderId    || null,
            orderModel:  orderModel,
            client:      req.user._id,
            city,
            subject:     safeSubject,
            category:    safeCategory,
            reason:      cleanText(reason, 200) || '',
            description,
            images:      cleanImages(req.body.images),
            status:      'open',
            priority:    'medium',
            lastReplyAt: new Date()
        });

        // إشعار من يعمل على تذاكر هذه المدينة
        for (const admin of await staffFor(city)) {
            await sendNotification(req.app, {
                userId:    admin._id,
                title:     'تذكرة دعم جديدة',
                message:   `${req.user.name || 'عميل'}: ${safeSubject !== 'شكوى جديدة' ? safeSubject : description.substring(0, 50)}`,
                type:      'system',
                relatedId: complaint._id
            }).catch(() => {});
        }

        const io = req.app.get('io');
        if (io) {
            toAdmins(io, city).emit('new_complaint', {
                id:      complaint._id,
                subject: complaint.subject,
                client:  req.user.name,
                city
            });
        }

        res.status(201).json({ message: 'تم إرسال تذكرة الدعم بنجاح', complaint });
    } catch (error) {
        logger.error('Complaint create error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  GET /api/complaints/mine
// @desc   شكاوى العميل الحالي
// @access Client
router.get('/mine', protect, async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const skip  = (page - 1) * limit;

        const [complaints, total] = await Promise.all([
            Complaint.find({ client: req.user._id })
                .sort({ lastReplyAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('-replies.sender'),
            Complaint.countDocuments({ client: req.user._id })
        ]);

        res.json({ complaints, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        logger.error('Complaints mine error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  GET /api/complaints/stats
// @desc   عدّادات شريط الإحصاء في لوحة الشكاوى — استعلامٌ واحد
// @access Admin (view_complaints)
//
// ⚠️ معرَّف قبل /:id عمداً: مسار المعرّف يلتقط أي مقطع، فلو جاء بعده لصار
// "stats" معرّفَ تذكرة ورُدّ بـ 404.
//
// لماذا وُجد: كانت الواجهة تجلب العدّادات الخمسة بخمسة نداءات منفصلة إلى
// GET /api/complaints?limit=1 لا تقرأ من كلٍّ منها غير `total` — خمس رحلات
// شبكة وخمسة countDocuments لأجل خمسة أرقام في شريط. تجميعةٌ واحدة تُعطيها
// كلها: القاعدة تمرّ على المجموعة مرّة لا خمساً.
router.get('/stats', protect, STAFF, async (req, res) => {
    try {
        const scope = getAdminCityFilter(req);
        const [byStatus, urgent] = await Promise.all([
            Complaint.aggregate([{ $match: scope }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
            Complaint.countDocuments({ ...scope, priority: 'urgent' })
        ]);

        const counts = {};
        let all = 0;
        for (const row of byStatus) {
            counts[row._id] = row.n;
            all += row.n;
        }

        res.json({
            all,
            open:        counts.open        || 0,
            in_progress: counts.in_progress || 0,
            resolved:    counts.resolved    || 0,
            dismissed:   counts.dismissed   || 0,
            urgent
        });
    } catch (error) {
        logger.error('Complaints stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  GET /api/complaints/:id
// @desc   تفاصيل تذكرة واحدة (للعميل أو الأدمن)
// @access Client | Admin (view_complaints)
router.get('/:id', protect, async (req, res) => {
    try {
        const asAdmin = req.user.role === 'admin';
        if (asAdmin && !isStaff(req.user)) {
            return res.status(403).json({ message: 'غير مصرح — تحتاج صلاحية: view_complaints' });
        }
        const query = asAdmin
            ? { _id: req.params.id }
            : { _id: req.params.id, client: req.user._id };

        const complaint = await Complaint.findOne(query)
            .populate('client',     'name phone')
            .populate('assignedTo', 'name')
            .populate('replies.sender', 'name role');

        // خارج مدينته = غير موجودة له (لا نؤكّد وجودها)
        if (!complaint || (asAdmin && !coversTicket(req.user, complaint))) {
            return res.status(404).json({ message: 'التذكرة غير موجودة' });
        }

        res.json(complaint);
    } catch (error) {
        logger.error('Complaint detail error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  POST /api/complaints/:id/reply
// @desc   إضافة رد على تذكرة (من العميل أو الأدمن)
// @access Client | Admin (view_complaints)
router.post('/:id/reply', protect, async (req, res) => {
    try {
        const asAdmin = req.user.role === 'admin';
        if (asAdmin && !isStaff(req.user)) {
            return res.status(403).json({ message: 'غير مصرح — تحتاج صلاحية: view_complaints' });
        }
        // نصٌّ غير نصّيّ كان يُسقط المسار بـ 500 (message.trim)، والطويل
        // يسقط في تحقّق المخطّط بخطأٍ إنجليزيّ
        const message = cleanText(req.body && req.body.message, MAX_TEXT);
        if (!message) {
            return res.status(400).json({ message: `نص الرد مطلوب (حتى ${MAX_TEXT} حرف)` });
        }

        const query = asAdmin
            ? { _id: req.params.id }
            : { _id: req.params.id, client: req.user._id };

        const complaint = await Complaint.findOne(query);
        if (!complaint || (asAdmin && !coversTicket(req.user, complaint))) {
            return res.status(404).json({ message: 'التذكرة غير موجودة' });
        }

        if (['resolved', 'dismissed'].includes(complaint.status)) {
            return res.status(400).json({ message: 'التذكرة مغلقة ولا يمكن الرد عليها' });
        }

        const reply = {
            sender:     req.user._id,
            senderRole: asAdmin ? 'admin' : 'client',
            message,
            images:     cleanImages(req.body.images)
        };

        complaint.replies.push(reply);
        complaint.lastReplyAt = new Date();
        if (asAdmin && complaint.status === 'open') {
            complaint.status = 'in_progress';
        }
        await complaint.save();

        // إشعار الطرف الآخر
        if (asAdmin) {
            await sendNotification(req.app, {
                userId:    complaint.client,
                title:     'رد على تذكرتك',
                message:   `ردّ فريق الدعم: ${message.substring(0, 80)}`,
                type:      'system',
                relatedId: complaint._id
            }).catch(() => {});
        } else {
            // المسؤول عنها إن عُيِّن، وإلا من يعمل على تذاكر مدينتها
            const targets = complaint.assignedTo
                ? [{ _id: complaint.assignedTo }]
                : await staffFor(complaint.city);
            for (const admin of targets) {
                await sendNotification(req.app, {
                    userId:    admin._id,
                    title:     'رد عميل على تذكرة',
                    message:   `${req.user.name}: ${message.substring(0, 80)}`,
                    type:      'system',
                    relatedId: complaint._id
                }).catch(() => {});
            }
        }

        res.json({ message: 'تم إضافة الرد بنجاح', reply });
    } catch (error) {
        logger.error('Complaint reply error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ═══════════════════════════════════════════════
// 🔐 Admin Routes (view_complaints + نطاق المدينة)
// ═══════════════════════════════════════════════

const STATUSES = Complaint.schema.path('status').enumValues;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

// @route  GET /api/complaints
// @desc   جميع الشكاوى مع فلترة
// @access Admin (view_complaints)
router.get('/', protect, STAFF, async (req, res) => {
    try {
        const page     = Math.max(1, parseInt(req.query.page)  || 1);
        const limit    = Math.min(100, parseInt(req.query.limit) || 30);
        const skip     = (page - 1) * limit;
        const filter   = { ...getAdminCityFilter(req) };

        // قيمٌ من قوائم معروفة فقط: كائنٌ في الاستعلام (?status[$ne]=x) كان
        // يصل إلى find كما هو
        if (STATUSES.includes(req.query.status))       filter.status   = req.query.status;
        if (PRIORITIES.includes(req.query.priority))   filter.priority = req.query.priority;
        if (CATEGORIES.includes(req.query.category))   filter.category = req.query.category;
        if (mongoose.isValidObjectId(req.query.assigned)) filter.assignedTo = req.query.assigned;

        const [complaints, total] = await Promise.all([
            Complaint.find(filter)
                .populate('client',     'name phone')
                .populate('assignedTo', 'name')
                .sort({ priority: -1, lastReplyAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('-replies'),
            Complaint.countDocuments(filter)
        ]);

        res.json({ complaints, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        logger.error('Complaints list error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/** التذكرة ضمن نطاق الأدمن أو 404 — للمسارات التي تعدّلها */
async function scopedTicket(req, res) {
    const complaint = await Complaint.findOne({ _id: req.params.id, ...getAdminCityFilter({ user: req.user, query: {} }) });
    if (!complaint) {
        res.status(404).json({ message: 'التذكرة غير موجودة' });
        return null;
    }
    return complaint;
}

// @route  PUT /api/complaints/:id/resolve
// @desc   حل التذكرة
// @access Admin (view_complaints)
router.put('/:id/resolve', protect, STAFF, async (req, res) => {
    try {
        const complaint = await scopedTicket(req, res);
        if (!complaint) return;

        complaint.status     = 'resolved';
        complaint.resolvedAt = new Date();
        await complaint.save();

        await sendNotification(req.app, {
            userId:  complaint.client,
            title:   'تم حل تذكرتك',
            message: 'تمت مراجعة تذكرتك وحلها من قبل فريق الدعم. شكراً لتواصلك معنا.',
            type:    'system',
            relatedId: complaint._id
        }).catch(() => {});

        res.json({ message: 'تم حل التذكرة بنجاح', complaint });
    } catch (error) {
        logger.error('Complaint resolve error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  PUT /api/complaints/:id/dismiss
// @desc   رفض التذكرة
// @access Admin (view_complaints)
router.put('/:id/dismiss', protect, STAFF, async (req, res) => {
    try {
        const complaint = await scopedTicket(req, res);
        if (!complaint) return;
        complaint.status = 'dismissed';
        await complaint.save();
        res.json({ message: 'تم رفض التذكرة', complaint });
    } catch (error) {
        logger.error('Complaint dismiss error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  PUT /api/complaints/:id/assign
// @desc   تعيين أدمن مسؤول للتذكرة
// @access Admin (view_complaints)
router.put('/:id/assign', protect, STAFF, async (req, res) => {
    try {
        const { adminId } = req.body || {};
        // المعيَّن أدمنٌ يعمل على التذاكر ويغطّي مدينتها — لا أيّ معرّف
        // (كان يقبل معرّف عميلٍ أو كابتن فيصير «المسؤول» عن التذكرة)
        if (adminId && !mongoose.isValidObjectId(adminId)) {
            return res.status(400).json({ message: 'معرّف المسؤول غير صالح' });
        }
        const complaint = await scopedTicket(req, res);
        if (!complaint) return;
        if (adminId) {
            const target = await User.findOne({ _id: adminId, role: 'admin', isActive: true })
                .select('_id adminRole permissions city cities').lean();
            if (!target || !isStaff(target) || !adminCoversCity(target, complaint.city)) {
                return res.status(400).json({ message: 'لا يمكن تعيين هذا الحساب — ليس أدمناً يعمل على تذاكر هذه المدينة' });
            }
        }
        complaint.assignedTo = adminId || null;
        complaint.status = 'in_progress';
        await complaint.save();
        await complaint.populate('assignedTo', 'name');
        res.json({ message: 'تم التعيين بنجاح', complaint });
    } catch (error) {
        logger.error('Complaint assign error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route  PUT /api/complaints/:id/priority
// @desc   تغيير أولوية التذكرة
// @access Admin (view_complaints)
router.put('/:id/priority', protect, STAFF, async (req, res) => {
    try {
        const { priority } = req.body || {};
        if (!PRIORITIES.includes(priority)) {
            return res.status(400).json({ message: 'قيمة الأولوية غير صحيحة' });
        }
        const complaint = await scopedTicket(req, res);
        if (!complaint) return;
        complaint.priority = priority;
        await complaint.save();
        res.json({ message: 'تم تحديث الأولوية', complaint });
    } catch (error) {
        logger.error('Complaint priority error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
