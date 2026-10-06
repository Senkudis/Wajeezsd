// routes/admin/subadmins.js — مُولّد من تقسيم admin.js الأصلي.
// كل وحدة Router مستقلة تُركّب على /api/admin عبر routes/admin.js.
const express = require('express');
const { CITY_KEYS, cityLabel } = require('../../config/cities');   // 🌍 المدن — مصدرٌ واحد
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
const { protect, adminOnly, superAdminOnly, requirePermission, isSubAdmin, adminCities } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const { normalizePhone } = require('../../utils/phoneNormalizer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');

const SessionRequest = require('../../models/SessionRequest');

// =========================================================
// 🔑 قائمة الصلاحيات — مشتقّةٌ من مخطّط النموذج لا مكتوبةً بجانبه.
//
// ⚠️ كانت مكتوبةً يدوياً مرّتين (الإنشاء والتعديل)، وتباعدت عن النموذج:
//    view_chats و manage_chats و view_captain_details موجودةٌ في المخطّط
//    ومعروضةٌ في الواجهة، لكن المسار كان يُسقطها بصمت — فمن يمنحها لا
//    يراها تُحفظ ولا يُقال له لماذا. المصدر الآن واحد، فلا تتباعد ثانية.
const VALID_PERMS = User.schema.path('permissions').caster.enumValues;
const VALID_CITIES = CITY_KEYS;

/** يُنقّي مدن الأدمن المساعد: صالحةً وبلا تكرار. فارغةً ⇒ مدينته وحدها. */
function sanitizeCities(list) {
    if (!Array.isArray(list)) return null;
    return [...new Set(list.filter(c => VALID_CITIES.includes(c)))];
}

// 📜 سجلّ أفعال الإدارة — صلاحيةٌ تُمنح، لا حكرٌ على المسؤول الرئيسي.
//    من يدير مدينةً يحتاج أن يعرف من غيّر ماذا فيها.
router.get('/activity-log', protect, requirePermission('view_activity_log'), async (req, res) => {
    try {
        const page    = Math.max(1, parseInt(req.query.page)  || 1);
        const limit   = Math.min(100, parseInt(req.query.limit) || 50);
        const skip    = (page - 1) * limit;

        const filter = {};
        if (req.query.action)  filter.action  = req.query.action;
        if (req.query.adminId) filter.admin   = req.query.adminId;
        // 🌍 الأدمن المساعد يرى ما جرى في مدنه وحدها (السجلّ يحفظ مدينة كل فعل)
        if (isSubAdmin(req)) filter.city = { $in: adminCities(req.user) };
        if (req.query.from || req.query.to) {
            filter.createdAt = {};
            if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
            if (req.query.to)   filter.createdAt.$lte = new Date(req.query.to + 'T23:59:59.999Z');
        }

        const [logs, total] = await Promise.all([
            AdminLog.find(filter)
                .populate('admin', 'name phone adminRole')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AdminLog.countDocuments(filter)
        ]);

        res.json({ logs, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        logger.error('Activity Log Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 👥 إدارة الأدمن المساعدين (Sub-Admin Management)
// =========================================================

// @route   GET /api/admin/sub-admins
// @desc    قائمة كل الأدمن

// =========================================================
// 👥 إدارة الإداريين — ثلاث درجات (أكتوبر 2026)
//
//   super_admin (الأكبر/الشركاء) يدير الجميع: يُنشئ أكبر وإداري وموظف،
//     ويرقّي وينزّل ويحذف (أي شريكٍ يدير الشركاء — قرار المالك). الحارس
//     الوحيد: لا يُنزَّل ولا يُحذف **آخر** أكبر، ولا يعدّل أحدٌ نفسه.
//   sub_admin (الإداري) يدير **موظفيه** وحدهم: يعيّن موظفاً في مدنه هو،
//     بصلاحياتٍ من صلاحياته هو — لا يمنح ما لا يملك (لا تصعيد).
//   staff (الموظف المسؤول) لا يدير أحداً.
// =========================================================
const { isSuperUser, isScopedUser, adminCities: citiesOf } = require('../../middleware/authMiddleware');
const ROLES = ['super_admin', 'sub_admin', 'staff'];

/** يمرّ الأكبر والإداري — الموظف لا يدير أحداً */
function adminManagerOnly(req, res, next) {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'غير مصرح' });
    if (isSuperUser(req.user) || req.user.adminRole === 'sub_admin') return next();
    return res.status(403).json({ message: 'غير مصرح — الموظف لا يدير الإداريين' });
}

/** هل يدير هذا الإداري ذاك الموظف؟ موظفٌ عيّنه، أو كل مدنه ضمن مدن الإداري */
function managesStaff(manager, target) {
    if (isSuperUser(manager)) return true;
    if (manager.adminRole !== 'sub_admin' || !target || target.adminRole !== 'staff') return false;
    if (target.adminCreatedBy && String(target.adminCreatedBy) === String(manager._id)) return true;
    const mine = citiesOf(manager);
    const theirs = citiesOf(target);
    return theirs.length > 0 && theirs.every(c => mine.includes(c));
}

/**
 * ما يُسمح للمُعيِّن بمنحه: الأكبر كل الصلاحيات والمدن؛ الإداري ما يملكه هو.
 * يُرجع { permissions, cities } منقّاةً، أو { error }.
 */
function grantable(manager, permissions, cities) {
    const perms = (Array.isArray(permissions) ? permissions : []).filter(p => VALID_PERMS.includes(p));
    const cits = sanitizeCities(cities);
    if (isSuperUser(manager)) return { permissions: perms, cities: cits };
    const own = manager.permissions || [];
    const extra = perms.filter(p => !own.includes(p));
    if (extra.length) return { error: 'لا يمكنك منح صلاحياتٍ لا تملكها: ' + extra.join('، ') };
    const mine = citiesOf(manager);
    if (cits && cits.some(c => !mine.includes(c))) return { error: 'لا يمكنك تعيين موظفٍ في مدينةٍ خارج مدنك' };
    return { permissions: perms, cities: cits && cits.length ? cits : mine };
}

/**
 * متاجر الموظف المحصور: معرّفاتٌ صالحة لمتاجر موجودة **داخل مدنه** فقط —
 * وإلا حُصر في متجرٍ لا يملك مدينته فلا يرى شيئاً، أو تسلّل لمدينةٍ أخرى.
 */
async function cleanStaffPlaces(list, cities) {
    if (!Array.isArray(list)) return undefined;
    const ids = list.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (!ids.length) return [];
    const Place = require('../../models/Place');
    const rows = await Place.find({ _id: { $in: ids }, city: { $in: cities } }).select('_id').lean();
    return rows.map(r => r._id);
}

/**
 * 📡 يقطع اتصالات السوكت الحيّة للحساب، فيعود ويُصادَق من جديد بدرجته
 * ومدنه الجديدة (غرف الإدارة تُحدَّد عند الاتصال). بدونه يبقى من نُزّل أو
 * حُذف يسمع بثّ المدن القديمة حتى يغلق اللوحة.
 */
function dropLiveSessions(req, userId) {
    try {
        const io = req.app.get('io');
        if (io) io.in(String(userId)).disconnectSockets(true);
    } catch (e) { logger.warn({ err: e.message }, 'dropLiveSessions failed'); }
}

/** عدد الإداريين الكبار — لا يُنزَّل آخرهم ولا يُحذف */
async function superCount() {
    return User.countDocuments({ role: 'admin', $or: [{ adminRole: 'super_admin' }, { adminRole: null }] });
}

router.get('/sub-admins', protect, adminManagerOnly, async (req, res) => {
    try {
        let q = { role: 'admin' };
        if (!isSuperUser(req.user)) {
            // الإداري يرى موظفيه وحدهم
            const mine = citiesOf(req.user);
            q = { role: 'admin', adminRole: 'staff', $or: [
                { adminCreatedBy: req.user._id },
                { cities: { $not: { $elemMatch: { $nin: mine } } }, 'cities.0': { $exists: true } }
            ] };
        }
        const admins = await User.find(q)
            .select('-password')
            .populate('staffPlaces', 'name city')
            .sort({ createdAt: -1 });
        res.json(admins);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   POST /api/admin/sub-admins
// @desc    إنشاء إداري أكبر / إداري / موظف مسؤول

router.post('/sub-admins', protect, adminManagerOnly, async (req, res) => {
    try {
        const { name, phone, password, permissions, city, cities, adminRole, staffPlaces } = req.body;

        if (!name || !phone || !password) {
            return res.status(400).json({ message: 'الاسم والهاتف وكلمة المرور مطلوبة' });
        }

        // الدرجة: الأكبر يختار، والإداري يُنشئ موظفين وحدهم
        const role = isSuperUser(req.user)
            ? (ROLES.includes(adminRole) ? adminRole : 'sub_admin')
            : 'staff';
        if (!isSuperUser(req.user) && adminRole && adminRole !== 'staff') {
            return res.status(403).json({ message: 'الإداري يعيّن موظفين فقط' });
        }

        const normalizedPhone = normalizePhone(phone);
        const exists = await User.findOne({ phone: normalizedPhone });
        if (exists) return res.status(400).json({ message: 'رقم الهاتف مسجل بالفعل' });

        const g = grantable(req.user, permissions, cities && cities.length ? cities : (city ? [city] : null));
        if (g.error) return res.status(403).json({ message: g.error });
        const assignedCities = (g.cities && g.cities.length)
            ? g.cities
            : [VALID_CITIES.includes(city) ? city : 'Khartoum'];
        // الأكبر لا يحتاج صلاحياتٍ ولا مدناً — كل شيءٍ له
        const validPerms = role === 'super_admin' ? [] : g.permissions;

        const places = role === 'staff' ? (await cleanStaffPlaces(staffPlaces, assignedCities)) || [] : [];

        const subAdmin = await User.create({
            name,
            phone: normalizedPhone,
            password,
            role: 'admin',
            adminRole: role,
            permissions: validPerms,
            // 🌍 مدنه: ما أُرسل، وإلا مدينته الواحدة. و`city` تبقى الأولى
            //    منها — بها تُختم السجلات التي ينشئها إن لم يحدّد.
            cities: assignedCities,
            city: assignedCities[0],
            staffPlaces: places,
            adminCreatedBy: req.user._id,
            isActive: true,
            isVerified: true,
            approvalStatus: 'approved'
        });

        const label = { super_admin: 'إداري أكبر', sub_admin: 'إداري', staff: 'موظف مسؤول' }[role];
        await logAdminAction(req, 'create_sub_admin',
            `تم إنشاء ${label}: ${name}`,
            subAdmin._id, name, { adminRole: role, permissions: validPerms, cities: assignedCities, staffPlaces: places }
        );

        res.status(201).json({
            _id: subAdmin._id,
            name: subAdmin.name,
            phone: subAdmin.phone,
            adminRole: subAdmin.adminRole,
            permissions: subAdmin.permissions,
            cities: subAdmin.cities,
            staffPlaces: subAdmin.staffPlaces,
            message: `تم إنشاء ${label} بنجاح`
        });
    } catch (error) {
        logger.error('Create Sub-Admin Error:', error);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
});

// @route   PUT /api/admin/sub-admins/:id
// @desc    تعديل درجة/صلاحيات/مدن/متاجر إداري

router.put('/sub-admins/:id', protect, adminManagerOnly, async (req, res) => {
    try {
        const { permissions, isActive, adminRole, cities, staffPlaces } = req.body;

        const target = await User.findById(req.params.id);
        if (!target || target.role !== 'admin') {
            return res.status(404).json({ message: 'الأدمن غير موجود' });
        }

        // منع تعديل نفسك
        if (target._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'لا يمكنك تعديل حسابك الشخصي من هنا' });
        }
        // الإداري يعدّل موظفيه وحدهم
        if (!managesStaff(req.user, target)) {
            return res.status(403).json({ message: 'لا تملك إدارة هذا الحساب' });
        }

        const updates = {};
        const isSuper = isSuperUser(req.user);
        if (adminRole !== undefined && adminRole !== target.adminRole) {
            if (!isSuper) return res.status(403).json({ message: 'الإداري لا يغيّر الدرجات' });
            if (!ROLES.includes(adminRole)) return res.status(400).json({ message: 'درجة غير صالحة' });
            // 🛡️ لا يُنزَّل آخر إداري أكبر — وإلا لا يبقى من يدير النظام
            if (isSuperUser(target) && (await superCount()) <= 1) {
                return res.status(400).json({ message: 'لا يمكن تنزيل آخر إداري أكبر' });
            }
            updates.adminRole = adminRole;
        }
        const finalRole = updates.adminRole || target.adminRole || 'super_admin';

        if (permissions !== undefined || cities !== undefined) {
            const g = grantable(req.user,
                permissions !== undefined ? permissions : target.permissions,
                cities !== undefined ? cities : target.cities);
            if (g.error) return res.status(403).json({ message: g.error });
            if (permissions !== undefined) updates.permissions = finalRole === 'super_admin' ? [] : g.permissions;
            if (cities !== undefined) {
                // 🚫 لا نطاقَ فارغ: أدمنٌ بلا مدينةٍ واحدة لا يرى شيئاً ولا يفهم
                //    لماذا — والخطأ يقع صامتاً وقت التعيين لا وقت الاستعمال.
                if (!g.cities || !g.cities.length) {
                    return res.status(400).json({ message: 'اختر مدينةً واحدة على الأقل' });
                }
                updates.cities = g.cities;
                updates.city   = g.cities[0];
            }
        }
        if (finalRole === 'staff' && staffPlaces !== undefined) {
            updates.staffPlaces = (await cleanStaffPlaces(staffPlaces, updates.cities || citiesOf(target))) || [];
        } else if (finalRole !== 'staff' && target.staffPlaces && target.staffPlaces.length) {
            updates.staffPlaces = [];   // من رُقّي من موظف لا يبقى محصوراً
        }
        if (isActive !== undefined) {
            if (!Boolean(isActive) && isSuperUser(target) && (await superCount()) <= 1) {
                return res.status(400).json({ message: 'لا يمكن إيقاف آخر إداري أكبر' });
            }
            updates.isActive = Boolean(isActive);
        }

        await User.findByIdAndUpdate(req.params.id, updates);

        // ✂️ ما نُزع من الإداري يُنزع من موظفيه — وإلا بقي موظفٌ يملك ما
        //    لم يعد مديره يملكه (صلاحيةٌ أو مدينة)، فصار فوقه.
        const newPerms  = updates.adminRole === 'super_admin' ? null : (updates.permissions || target.permissions || []);
        const newCities = updates.cities || citiesOf(target);
        if (finalRole === 'sub_admin' && newPerms) {
            const lostPerms  = (target.permissions || []).filter(p => !newPerms.includes(p));
            const lostCities = citiesOf(target).filter(c => !newCities.includes(c));
            if (lostPerms.length || lostCities.length) {
                const mine = { adminCreatedBy: target._id, adminRole: 'staff' };
                await User.updateMany(mine, { $pull: { permissions: { $in: lostPerms }, cities: { $in: lostCities } } });
                // موظفٌ لم تبق له مدينة يُوقف — لا يُترك بلا نطاقٍ يرى منه ما لا يُفهم
                await User.updateMany({ ...mine, cities: { $size: 0 } }, { isActive: false });
            }
        }

        dropLiveSessions(req, target._id);

        await logAdminAction(req, 'update_sub_admin',
            `تم تعديل صلاحيات الأدمن: ${target.name}`,
            target._id, target.name, updates
        );

        res.json({ message: 'تم تحديث الأدمن بنجاح' });
    } catch (error) {
        logger.error('Update Sub-Admin Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   DELETE /api/admin/sub-admins/:id
// @desc    حذف إداري / موظف

router.delete('/sub-admins/:id', protect, adminManagerOnly, async (req, res) => {
    try {
        const target = await User.findById(req.params.id);
        if (!target || target.role !== 'admin') {
            return res.status(404).json({ message: 'الأدمن غير موجود' });
        }
        if (target._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'لا يمكنك حذف حسابك الشخصي' });
        }
        if (!managesStaff(req.user, target)) {
            return res.status(403).json({ message: 'لا تملك إدارة هذا الحساب' });
        }
        if (isSuperUser(target) && (await superCount()) <= 1) {
            return res.status(400).json({ message: 'لا يمكن حذف آخر إداري أكبر' });
        }

        await User.findByIdAndDelete(req.params.id);
        dropLiveSessions(req, target._id);

        await logAdminAction(req, 'delete_sub_admin',
            `تم حذف الأدمن: ${target.name}`,
            target._id, target.name
        );

        res.json({ message: 'تم حذف الأدمن بنجاح' });
    } catch (error) {
        logger.error('Delete Sub-Admin Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/admin/errors
// @desc    آخر أخطاء الإنتاج (مخزن في الذاكرة) — مراقبة سريعة للمسؤول الرئيسي
router.get('/errors', protect, superAdminOnly, async (req, res) => {
    try {
        const errorTracker = require('../../utils/errorTracker');
        // الدائم أولاً — أخطاء ما قبل آخر إعادة تشغيل هي الأهمّ غالباً
        const { source, errors } = await errorTracker.listPersisted(req.query.limit);
        res.json({ source, count: errors.length, memoryCount: errorTracker.count(), errors });
    } catch (e) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/admin/analytics?days=30
// @desc    مسار المنتج: أين يسقط المستخدم، وكم نسبة من يفتح متجراً ثم يطلب.
//          الأرقام مجمَّعة يومياً في DailyStat — لا هويّات ولا أحداث فردية.
router.get('/analytics', protect, superAdminOnly, async (req, res) => {
    try {
        const DailyStat = require('../../models/DailyStat');
        const analytics = require('../../utils/analytics');

        // الحدّ الأعلى تسعون يوماً: نطاقٌ أوسع يقرأ وثائق كثيرة بلا فائدة
        const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
        const from = new Date(Date.now() + 3 * 3600000 - (days - 1) * 86400000)
            .toISOString().slice(0, 10);

        const filter = { day: { $gte: from } };
        if (req.query.city) filter.city = analytics.normalizeCity(req.query.city);

        const rows = await DailyStat.find(filter).sort({ day: 1 }).lean();
        res.json({
            from,
            to: DailyStat.today(),
            days,
            city: req.query.city ? analytics.normalizeCity(req.query.city) : 'all',
            ...analytics.summarize(rows),
            // السلسلة اليومية: المجموع يقول «كم»، والسلسلة تقول «إلى أين يتجه»
            daily: rows
        });
    } catch (e) {
        logger.error({ err: e.message }, 'admin analytics failed');
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
