// routes/admin/auth.js — مُولّد من تقسيم admin.js الأصلي.
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
const { protect, adminOnly, superAdminOnly, requirePermission } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const { normalizePhone } = require('../../utils/phoneNormalizer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');

const SessionRequest = require('../../models/SessionRequest');
const { signUserToken } = require('../../utils/authToken');

const adminLoginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 دقائق
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
    handler: (req, res, next, options) => {
        const retryAfter = Math.ceil((res.getHeader('Retry-After') || 300));
        res.status(429).json({
            message: 'محاولات دخول كثيرة للوحة التحكم. يرجى الانتظار.',
            retryAfter
        });
    }
});

// 🛡️ الاستطلاع يجري كل 4 ثوانٍ لخمس دقائق = 75 نداءً شرعياً. السقف 120
//    يترك هامشاً مريحاً ويمنع تجريب معرّفات/أجهزة بالجملة.
const sessionClaimLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
    handler: (req, res) => res.status(429).json({ message: 'محاولات كثيرة. يرجى الانتظار.' })
});

router.post('/login', adminLoginLimiter, async (req, res) => {
    try {
        const { email, phone, password, deviceId, deviceInfo } = req.body;

        if (!password) return res.status(400).json({ message: 'يرجى إدخال كلمة المرور' });

        // ── البحث بالهاتف أو الإيميل ──────────────────────
        let user = null;
        if (phone) {
            const { normalizePhone } = require('../../utils/phoneNormalizer');
            const normalizedPhone = normalizePhone(phone);
            user = await User.findOne({ phone: normalizedPhone, role: 'admin' });
        } else if (email) {
            user = await User.findOne({ email: email.toLowerCase().trim(), role: 'admin' });
        } else {
            return res.status(400).json({ message: 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف' });
        }

        if (!user) return res.status(403).json({ message: 'بيانات الدخول غير صحيحة أو لست مسؤولاً' });
        if (!user.isActive) return res.status(403).json({ message: 'تم إيقاف هذا الحساب. تواصل مع المدير الرئيسي.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });

        // ── توليد التوكن ────────────────────────────────────
        const token = signUserToken(user, {
            claims: { adminRole: user.adminRole || 'super_admin' }
        });

        const userPayload = {
            _id: user._id,
            name: user.name,
            role: user.role,
            adminRole: user.adminRole || 'super_admin',
            email: user.email,
            phone: user.phone,
            permissions: user.permissions || [],
            city: user.city
        };

        // ── super_admin: دخول مباشر دائماً ─────────────────
        if (!user.adminRole || user.adminRole === 'super_admin') {
            return res.json({ token, user: userPayload });
        }

        // ── sub_admin: فحص الجهاز ───────────────────────────
        const isFirstLogin = !user.trustedDevices || user.trustedDevices.length === 0;

        if (isFirstLogin) {
            // أول تسجيل دخول → احفظ الجهاز تلقائياً بدون موافقة
            await User.findByIdAndUpdate(user._id, {
                $push: {
                    trustedDevices: {
                        deviceId:   deviceId || 'unknown',
                        deviceInfo: deviceInfo || 'جهاز غير معروف',
                        addedAt:    new Date()
                    }
                }
            });
            return res.json({ token, user: userPayload });
        }

        // نفس الجهاز الموثوق → دخول مباشر
        const isTrusted = deviceId && user.trustedDevices.some(d => d.deviceId === deviceId);
        if (isTrusted) {
            return res.json({ token, user: userPayload });
        }

        // ── جهاز جديد → إنشاء طلب موافقة معلق ─────────────
        // احذف أي طلب سابق منتهي أو معلق لنفس الجهاز لهذا المستخدم
        await SessionRequest.deleteMany({
            admin: user._id,
            deviceId: deviceId || 'unknown',
            status: 'pending'
        });

        const sessionReq = await SessionRequest.create({
            admin:      user._id,
            adminName:  user.name,
            adminPhone: user.phone,
            deviceId:   deviceId || 'unknown',
            deviceInfo: deviceInfo || 'جهاز غير معروف',
            tempToken:  token,
            status:     'pending'
        });

        logger.info(`🔐 New device login request from ${user.name} — device: ${deviceInfo}`);

        // 🔒 لا يُرسَل التوكن هنا إطلاقاً. كان يُرسَل مع الرد 202 فيتجاهل المهاجم
        //    شاشة الانتظار ويستعمله مباشرةً — أي أن بوابة الأجهزة الموثوقة كانت
        //    واجهة فقط. التوكن محفوظ في sessionReq.tempToken ولا يُسلَّم إلا عبر
        //    /session-requests/:id/claim بعد موافقة المدير، ومرة واحدة.
        return res.status(202).json({
            requiresApproval: true,
            requestId: sessionReq._id,
            message: 'جهاز جديد — في انتظار موافقة المدير الرئيسي'
        });

    } catch (err) {
        logger.error('Admin Login Error:', err.message);
        res.status(500).json({ message: 'حدث خطأ في السيرفر أثناء الدخول' });
    }
});

// ============================================================
// 📋 Session Requests — إدارة طلبات الدخول من أجهزة جديدة
// ============================================================

// @route   GET /api/admin/session-requests
// @desc    قائمة الطلبات المعلقة (للـ super_admin فقط)

router.get('/session-requests', protect, superAdminOnly, async (req, res) => {
    try {
        const { status = 'pending' } = req.query;
        const filter = {};
        if (['pending', 'approved', 'rejected'].includes(status)) filter.status = status;

        const requests = await SessionRequest.find(filter)
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        res.json(requests);
    } catch (err) {
        logger.error('Session Requests List Error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   POST /api/admin/session-requests/:id/claim
// @desc    استطلاع حالة الطلب، وتسليم التوكن مرة واحدة بعد الموافقة
//
// 🔒 حلّ محل `GET /session-requests/:id` العام الذي كان يكشف حالة أي طلب
//    لمن يعرف المعرّف وحده. الآن يجب أن يُثبت المُستدعي أنه الجهاز نفسه صاحب
//    الطلب. والتوكن يُسلَّم من هنا فقط، بعد الموافقة، ثم يُمحى من السجل فلا
//    يُسلَّم مرتين.
router.post('/session-requests/:id/claim', sessionClaimLimiter, async (req, res) => {
    try {
        const { deviceId } = req.body || {};
        if (!deviceId) return res.status(400).json({ message: 'معرّف الجهاز مطلوب' });

        const sessionReq = await SessionRequest.findById(req.params.id);
        // نفس الرد للطلب غير الموجود وللجهاز غير المطابق — كي لا يكشف أيهما
        // وقع لمن يجرّب معرّفات.
        if (!sessionReq || sessionReq.deviceId !== deviceId) {
            return res.status(404).json({ message: 'الطلب غير موجود' });
        }

        if (sessionReq.status !== 'approved') {
            return res.json({ status: sessionReq.status, expiresAt: sessionReq.expiresAt });
        }

        // ✅ موافَق عليه: سلّم التوكن مرة واحدة ثم امحه من السجل ذرّياً.
        const claimed = await SessionRequest.findOneAndUpdate(
            { _id: sessionReq._id, tempToken: { $exists: true, $ne: null } },
            { $unset: { tempToken: '' } },
            { new: false }
        );
        if (!claimed || !claimed.tempToken) {
            return res.status(410).json({ message: 'تم استخدام هذا الطلب مسبقاً — يرجى تسجيل الدخول من جديد' });
        }

        const user = await User.findById(sessionReq.admin).select('-password').lean();
        if (!user) return res.status(404).json({ message: 'الحساب غير موجود' });

        return res.json({
            status: 'approved',
            token: claimed.tempToken,
            user: {
                _id: user._id,
                name: user.name,
                role: user.role,
                adminRole: user.adminRole || 'super_admin',
                email: user.email,
                phone: user.phone,
                permissions: user.permissions || [],
                city: user.city
            }
        });
    } catch (err) {
        logger.error('Session Request Claim Error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/session-requests/:id
// @desc    موافقة أو رفض طلب جهاز (super_admin فقط)

router.put('/session-requests/:id', protect, superAdminOnly, async (req, res) => {
    try {
        const { status } = req.body; // 'approved' | 'rejected'
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'القيمة يجب أن تكون approved أو rejected' });
        }

        const sessionReq = await SessionRequest.findById(req.params.id);
        if (!sessionReq) return res.status(404).json({ message: 'الطلب غير موجود' });
        if (sessionReq.status !== 'pending') {
            return res.status(400).json({ message: 'تم البت في هذا الطلب مسبقاً' });
        }

        // تحديث حالة الطلب
        sessionReq.status = status;
        await sessionReq.save();

        // عند الموافقة → أضف الجهاز لقائمة الأجهزة الموثوقة للأدمن
        if (status === 'approved') {
            await User.findByIdAndUpdate(sessionReq.admin, {
                $push: {
                    trustedDevices: {
                        deviceId:   sessionReq.deviceId,
                        deviceInfo: sessionReq.deviceInfo,
                        addedAt:    new Date()
                    }
                }
            });

            await logAdminAction(req, 'approve_device',
                `تم قبول جهاز جديد للأدمن: ${sessionReq.adminName} — ${sessionReq.deviceInfo}`,
                sessionReq.admin, sessionReq.adminName, { deviceId: sessionReq.deviceId }
            );
        } else {
            await logAdminAction(req, 'reject_device',
                `تم رفض جهاز جديد للأدمن: ${sessionReq.adminName} — ${sessionReq.deviceInfo}`,
                sessionReq.admin, sessionReq.adminName, { deviceId: sessionReq.deviceId }
            );
        }

        res.json({ message: status === 'approved' ? 'تمت الموافقة وحفظ الجهاز' : 'تم رفض الطلب' });
    } catch (err) {
        logger.error('Session Request Update Error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});



// =========================================================
// 📊 الجزء الأول: الإحصائيات والداشبورد (Dashboard)
// =========================================================

// @route   GET /api/admin/dashboard
// @desc    جلب إحصائيات النظام الشاملة وآخر 5 طلبات
// Simple in-memory cache to avoid repeated heavy dashboard queries

module.exports = router;
