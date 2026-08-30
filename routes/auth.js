const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { validateAuth } = require('../middleware/validateMiddleware');
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../schemas/authSchema');
const { protect } = require('../middleware/authMiddleware'); // Auto-im= ported
const { sendWhatsAppOTP } = require('../services/whatsappService');
const { sendSmsOTP } = require('../services/smsService');
const { normalizePhone } = require('../utils/phoneNormalizer'); // ✅ Fixed to use destructuring
const { NEGOTIATION_TTL_MINUTES } = require('../utils/negotiation');
const axios = require('axios'); // ✅ Import Axios for proxy requests
const rateLimit = require('express-rate-limit'); // 🛡️ Rate Limiting
const { OAuth2Client } = require('google-auth-library'); // ✅ Google Auth
const logger = require('../utils/logger');

// ==========================================
// 🛡️ Strict Rate Limiters (Clients & Captains)
// ==========================================
// Limiter for Login (5 attempts / 5 minutes per IP)
const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 دقائق
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
    handler: (req, res, next, options) => {
        // نحسب الثواني المتبقية من رأس النافذة (Retry-After يحسبها express-rate-limit تلقائياً)
        const retryAfter = Math.ceil((res.getHeader('Retry-After') || 300));
        res.status(429).json({
            message: 'محاولات تسجيل دخول كثيرة. يرجى الانتظار.',
            retryAfter  // الثواني المتبقية — يستخدمها الفرونت لعرض عداد تنازلي
        });
    }
});

// Limiter for OTP & Registration (5 attempts / 5 minutes per IP)
const otpLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 دقائق
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
    handler: (req, res, next, options) => {
        const retryAfter = Math.ceil((res.getHeader('Retry-After') || 300));
        res.status(429).json({
            message: 'لقد طلبت أرقام تفعيل كثيرة. يرجى الانتظار.',
            retryAfter
        });
    }
});

// ==========================================
// 🔒 0️⃣ Check WhatsApp Subscription (Proxy)
// ==========================================
router.get('/check-subscription/:phone', otpLimiter, async (req, res) => {
    try {
        // 🔒 المسار غير محمي ويُمرَّر لخدمة داخلية — لولا التحقق أمكن حقن مسار
        //    (مثل ../admin) لفحص نقاط داخلية على البوت. نطبّع ونتحقق بصرامة ونُرمّز.
        const phone = normalizePhone(req.params.phone);
        if (!phone || !/^\d{6,15}$/.test(phone)) {
            return res.status(400).json({ subscribed: false, error: 'رقم غير صالح' });
        }
        const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3000'; // Local Bot Service
        const BOT_API_KEY = process.env.WHATSAPP_API_KEY || '';

        const response = await axios.get(
            `${BOT_API_URL}/check-subscription/${encodeURIComponent(phone)}`,
            {
                headers: { 'x-api-key': BOT_API_KEY },
                timeout: 5000
            }
        );

        res.json(response.data);
    } catch (error) {
        logger.error('Subscription Check Proxy Error:', error.message);
        // Fail gracefully (assume not subscribed or service down)
        res.status(200).json({ subscribed: false, error: 'Service Unavailable' });
    }
});

// ==========================================
// 1️⃣ تسجيل مستخدم جديد (بدون تشفير يدوي)
// ==========================================
router.post('/register', otpLimiter, validate(registerSchema), async (req, res) => {
    try {
        let { name, email, phone, password } = req.body;

        // 1. Normalize Phone Number
        const originalPhone = phone;
        phone = normalizePhone(phone);
        logger.info(`📞 Register: ${originalPhone} -> ${phone}`);

        // BUG-H6 FIX: لا تبحث عن مستخدم بـ email=undefined — يُعيد أول مستخدم بلا بريد زوراً
        if (email) {
            let emailUser = await User.findOne({ email });
            if (emailUser) return res.status(400).json({ message: 'البريد الإلكتروني مسجل مسبقاً' });
        }

        // Check by phone as well
        // ⚠️ `let` إجباري: بدونه يصبح `user` متغيّراً عامّاً مشتركاً بين كل الطلبات المتزامنة
        let user = await User.findOne({ phone });
        if (user) return res.status(400).json({ message: 'رقم الهاتف مسجل مسبقاً' });

        // إنشاء كود تحقق عشوائي وصلاحية 10 دقائق
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

        // ⚠️ هام: نرسل الباسورد كما هو (password) ونعتمد على User.js لتشفيره

        // 🌍 Validate city
        const VALID_CITIES = ['Khartoum', 'PortSudan'];
        const userCity = VALID_CITIES.includes(req.body.city) ? req.body.city : 'Khartoum';

        user = new User({
            name,
            email,
            phone: phone, // استخدام الرقم المنسق
            password: password,
            role: 'client', // ✅ فرض دور العميل إجبارياً
            city: userCity,  // 🌍 City assignment
            isVerified: false,
            verificationCode,
            verificationCodeExpires,
            otpCode: verificationCode, // Sync with new field
            otpExpires: verificationCodeExpires
        });

        await user.save();

        // 🔒 SECURITY FIX: Only log OTP in development
        if (process.env.NODE_ENV === 'development') {
            logger.info("========================================");
            logger.info(`🔐 [DEV ONLY] كود التفعيل للمستخدم ${name} هو: ${verificationCode}`);
            logger.info("========================================");
        }

        // إرسال الإيميل في الخلفية
        sendEmail(email, 'كود تفعيل حساب وجيز', `كود التفعيل الخاص بك هو: ${verificationCode}`)
            .catch(err => logger.info("⚠️ لم يتم إرسال الإيميل:", err.message));

        // ✅ إرسال SMS
        if (phone) {
            sendSmsOTP(phone, `رمز تفعيل حسابك في وجيز هو: ${verificationCode}`)
                .catch(err => logger.error("⚠️ SMS Error:", err.message));
        }

        res.status(201).json({ message: 'تم التسجيل بنجاح! راجع هاتفك أو بريدك للحصول على الكود.' });

    } catch (err) {
        logger.error(err);
        res.status(500).json({ message: 'حدث خطأ في السيرفر' });
    }
});

// ==========================================
// 🚀 تسجيل كابتن جديد (Captain Self-Signup)
// ==========================================
router.post('/register-captain', otpLimiter, async (req, res) => {
    try {
        let { name, email, phone, password, vehicleType } = req.body;

        if (!name || !email || !phone || !password || !vehicleType) {
            return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }

        // 🔒 تطبيع البريد — /login يبحث دائماً بـ toLowerCase، فبريد فيه حرف كبير
        // كان يُخزَّن كما هو ولا يُطابَق أبداً عند الدخول (والحساب يصير غير قابل للاستخدام).
        // كما يمنع حسابين متمايزين بحرف كبير يتخطّيان فحص "البريد مسجل مسبقاً".
        email = String(email).toLowerCase().trim();
        phone = normalizePhone(phone);

        // Check existing
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'البريد الإلكتروني مسجل مسبقاً' });

        user = await User.findOne({ phone });
        if (user) return res.status(400).json({ message: 'رقم الهاتف مسجل مسبقاً' });

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // 🌍 Validate city
        const VALID_CITIES_CAP = ['Khartoum', 'PortSudan'];
        const captainCity = VALID_CITIES_CAP.includes(req.body.city) ? req.body.city : 'Khartoum';

        user = new User({
            name,
            email,
            phone,
            password,
            vehicleType,
            role: 'captain',
            city: captainCity,  // 🌍 City assignment
            approvalStatus: 'pending',
            isVerified: false,
            verificationCode,
            verificationCodeExpires: Date.now() + 10 * 60 * 1000,
            otpCode: verificationCode,
            otpExpires: Date.now() + 10 * 60 * 1000
        });

        await user.save();

        if (process.env.NODE_ENV === 'development') {
            logger.info(`\ud83d\udd10 [DEV] Captain verification code for ${name}: ${verificationCode}`);
        }

        // Send verification email
        sendEmail(email, 'كود تفعيل حساب كابتن وجيز', `كود التفعيل الخاص بك هو: ${verificationCode}`)
            .catch(err => logger.info('⚠️ Email Error:', err.message));

        if (phone) {
            sendSmsOTP(phone, `رمز تفعيل حسابك ككابتن في وجيز هو: ${verificationCode}`)
                .catch(err => logger.error('⚠️ SMS Error:', err.message));
        }

        // ✅ FIX #16: Issue a limited upload-only token (not a full login token)
        // Full login is blocked by approvalStatus check in /login until admin approves
        // This token is valid for 1 hour only — just enough to upload documents
        const uploadToken = jwt.sign(
            { userId: user._id, role: 'captain', scope: 'upload_only' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(201).json({
            message: 'تم التسجيل! قم بتفعيل حسابك ورفع الوثائق. سيتم مراجعة طلبك من الإدارة.',
            uploadToken,       // ← limited-scope token for document upload only
            requiresOtp: true, // ← frontend should show OTP verification screen
            userId: user._id
        });

    } catch (err) {
        logger.error(err);
        res.status(500).json({ message: 'حدث خطأ في السيرفر' });
    }
});

// ==========================================
// 2️⃣ تسجيل الدخول (تم التعديل لإضافة الهاتف)
// ==========================================
router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
    try {
        const { email: identifier, password } = req.body;
        if (!identifier || !password) {
            return res.status(400).json({ message: 'يرجى إدخال بيانات الدخول' });
        }

        // 🔍 Smart search: accepts email OR phone number
        const isEmail = identifier.includes('@');
        const normalizedPhone = isEmail ? null : normalizePhone(identifier);

        const user = await User.findOne(
            isEmail
                ? { email: identifier.toLowerCase().trim() }
                : { phone: normalizedPhone }
        );

        if (!user) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });

        // مقارنة الباسورد
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });

        if (!user.isActive) {
            return res.status(403).json({ message: 'حسابك موقوف. تواصل مع الإدارة.' });
        }

        // ✅ OTP Auto-Redirect: لو الحساب غير مفعّل، ابعت كود جديد وأعد توجيه الفرونت
        if (!user.isVerified) {
            const newCode = Math.floor(100000 + Math.random() * 900000).toString();
            const newExpiry = Date.now() + 10 * 60 * 1000; // 10 دقائق
            user.verificationCode = newCode;
            user.verificationCodeExpires = newExpiry;
            user.otpCode = newCode;
            user.otpExpires = newExpiry;
            await user.save();

            // إرسال SMS
            if (user.phone) {
                sendSmsOTP(user.phone, `رمز تفعيل حسابك في وجيز هو: ${newCode}`)
                    .catch(err => logger.error("⚠️ SMS Error (login-reactivate):", err.message));
            }
            // إرسال إيميل
            sendEmail(user.email, 'كود تفعيل حساب وجيز', `كود التفعيل الخاص بك هو: ${newCode}`)
                .catch(err => logger.info("⚠️ Email Error (login-reactivate):", err.message));

            if (process.env.NODE_ENV === 'development') {
                logger.info(`🔐 [DEV] Re-activation OTP for ${user.email}: ${newCode}`);
            }

            return res.status(403).json({
                code: 'ACCOUNT_NOT_VERIFIED',
                message: 'حسابك غير مفعّل. تم إرسال كود تفعيل جديد إلى هاتفك.',
                email: user.email
            });
        }

        // 🔒 Block pending/rejected captains
        if (user.role === 'captain' && user.approvalStatus === 'pending') {
            return res.status(403).json({ message: 'حسابك قيد المراجعة من الإدارة. سيتم إشعارك عند الموافقة.' });
        }
        if (user.role === 'captain' && user.approvalStatus === 'rejected') {
            return res.status(403).json({ message: 'تم رفض طلبك. تواصل مع الإدارة لمزيد من التفاصيل.' });
        }

        const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'تم تسجيل الدخول بنجاح!',
            token,
            user: {
                _id: user._id,
                name: user.name,
                role: user.role,
                phone: user.phone,
                isWhatsappSubscribed: user.isWhatsappSubscribed
            }
        });

    } catch (err) {
        logger.error(err);
        res.status(500).json({ message: 'حدث خطأ في السيرفر' });
    }
});

// ==========================================
// 2.4️⃣ Firebase Web Config (Public — for Admin Web Push)
// ==========================================
// @route  GET /api/auth/firebase-web-config
// @desc   Returns the non-secret Firebase Web SDK config for the browser.
//         projectId/authDomain/storageBucket are derived automatically from
//         the existing FIREBASE_SERVICE_ACCOUNT_JSON server variable.
//         The remaining 3 values must be added as env vars (they are NOT secret).
// @access Public (values are safe to expose — equivalent to what Firebase Console shows)
router.get('/firebase-web-config', (req, res) => {
    try {
        // --- Derive from existing service account (already on server) ---
        let projectId = process.env.FIREBASE_PROJECT_ID || '';
        if (!projectId && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            try {
                const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
                projectId = sa.project_id || '';
            } catch (_) {}
        }

        // --- These 4 values come from Firebase Console → Project Settings → Web App ---
        // They are PUBLIC (same as what appears in the Firebase SDK snippet on the web)
        const config = {
            projectId,
            authDomain:        projectId ? `${projectId}.firebaseapp.com` : '',
            storageBucket:     projectId ? `${projectId}.appspot.com`     : '',
            apiKey:            process.env.FIREBASE_WEB_API_KEY            || '',
            messagingSenderId: process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || '',
            appId:             process.env.FIREBASE_WEB_APP_ID             || '',
            vapidKey:          process.env.FIREBASE_WEB_VAPID_KEY          || ''
        };

        // Tell the client if config is incomplete so it can skip gracefully
        const isReady = config.apiKey && config.messagingSenderId && config.appId && config.vapidKey;
        res.json({ config, isReady: !!isReady });
    } catch (err) {
        logger.error('Firebase web config error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// 🔄 GET /me — جلب بيانات المستخدم الحالية من قاعدة البيانات
// يُستخدم لتحديث الدور (role) في localStorage بدون إعادة تسجيل الدخول
// ==========================================
router.get('/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('name phone email role approvalStatus city isActive');
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
        if (!user.isActive) return res.status(403).json({ message: 'الحساب معطّل' });

        res.json({
            _id: user._id,
            name: user.name,
            phone: user.phone,
            email: user.email,
            role: user.role,
            approvalStatus: user.approvalStatus,
            city: user.city
        });
    } catch (err) {
        logger.error('GET /me error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// 🌍 PUT /api/auth/city — تغيير مدينة الحساب
// يُستخدم عندما يضغط العميل على "تغيير المدينة" في الواجهة
// المدينة تُخزَّن في DB وتنعكس على كل الطلبات اللاحقة
// ==========================================
router.put('/city', protect, async (req, res) => {
    try {
        const VALID_CITIES = ['Khartoum', 'PortSudan'];
        const { city } = req.body;

        if (!city || !VALID_CITIES.includes(city)) {
            return res.status(400).json({
                message: `مدينة غير صحيحة. القيم المقبولة: ${VALID_CITIES.join(', ')}`
            });
        }

        // الكباتن لا يُسمح لهم بتغيير مدينتهم بعد التسجيل (عملياتهم مرتبطة بمدينة واحدة)
        if (req.user.role === 'captain') {
            return res.status(403).json({
                message: 'الكباتن لا يمكنهم تغيير المدينة. تواصل مع الدعم الفني.'
            });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { city },
            { new: true, select: 'city' }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        logger.info({ userId: req.user._id, oldCity: req.user.city, newCity: city }, 'User city updated');
        res.json({ city: updatedUser.city, message: `تم تغيير مدينتك إلى ${city}` });
    } catch (err) {
        logger.error({ err }, 'PUT /city error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// 2.4.5️⃣ Public App Config (Version & Updates)
// ==========================================
router.get('/app-config', async (req, res) => {
    try {
        const Settings = require('../models/Settings');
        const settings = await Settings.getSettings();
        res.json({
            appVersion:   settings.appVersion  || '1.2.1',
            minVersion:   settings.minVersion  || settings.appVersion || '1.2.1',
            playStoreLink: settings.playStoreLink || 'https://play.google.com/store/apps/details?id=com.wajeezsd.app',
            forceUpdate:  settings.forceUpdate || false,
            // 💬 مدة صلاحية عرض المفاوضة — تُقرأ في واجهة الكابتن بدل رقم مكتوب
            // في HTML كان يبقى 5 بعد تغيير السيرفر، فيرى الكابتن مدة غير صحيحة
            negotiationTtlMinutes: NEGOTIATION_TTL_MINUTES
        });
    } catch (err) {
        logger.error('App config error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// 2.5️⃣ FCM Token Update (Native Notifications)
// ==========================================
router.put('/update-fcm', protect, async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken) return res.status(400).json({ message: 'Token required' });

        const user = await User.findById(req.user._id);
        if (!user) return res.status(403).json({ message: 'User not found or banned' });

        // 🔑 توكن FCM يُعرّف جهازاً واحداً. عند تبديل الحسابات على نفس الهاتف يجب أن يعود
        // التوكن للحساب المسجّل حالياً فقط — وإلا يظل الحساب السابق يستقبل إشعارات هذا الجهاز
        // (وقد لا يصل الحساب الجديد أي شيء). لذا نفصل التوكن عن أي مستخدم آخر قبل إسناده هنا.
        await User.updateMany(
            { _id: { $ne: user._id }, fcmToken },
            { $unset: { fcmToken: '' } }
        );

        user.fcmToken = fcmToken;
        await user.save();
        res.json({ success: true, message: 'FCM Token Updated' });
    } catch (err) {
        logger.error("FCM Update Error:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ==========================================
// 3️⃣ تفعيل الحساب
// ==========================================
router.post('/verify-email', otpLimiter, async (req, res) => {
    try {
        const { email, code } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(400).json({ message: 'المستخدم غير موجود' });

        // ✅ FIX #4: Check expiry FIRST — before code comparison
        // Prevents using old valid codes and gives the correct error message
        const expiry = user.otpExpires ?? user.verificationCodeExpires;
        if (!expiry || Date.now() > new Date(expiry).getTime()) {
            return res.status(400).json({ message: 'انتهت صلاحية كود التفعيل، أعد الإرسال' });
        }

        // Allow BOTH old code AND new `otpCode`
        const isValid = user.verificationCode === code || user.otpCode === code;
        if (!isValid) return res.status(400).json({ message: 'كود التفعيل غير صحيح' });

        user.isVerified = true;
        user.verificationCode = undefined;
        user.verificationCodeExpires = undefined;
        user.otpCode = undefined;
        user.otpExpires = undefined;
        await user.save();

        if (user.role === 'captain' && user.approvalStatus !== 'approved') {
            return res.json({ 
                message: 'تم تفعيل الحساب بنجاح. في انتظار موافقة الإدارة.',
                requiresApproval: true 
            });
        }

        const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'تم تفعيل الحساب بنجاح!',
            token,
            user: {
                _id: user._id,
                name: user.name,
                role: user.role,
                phone: user.phone,
                isWhatsappSubscribed: user.isWhatsappSubscribed
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'خطأ سيرفر' });
    }
});

// ==========================================
// 4️⃣ إعادة إرسال الكود
// ✅ BUG-012 FIX: يدعم البحث بالبريد أو رقم الهاتف
// ==========================================
router.post('/resend-code', otpLimiter, async (req, res) => {
    try {
        const { email, phone } = req.body;
        const identifier = email || phone;

        if (!identifier) {
            return res.status(400).json({ message: 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف' });
        }

        let user;
        if (phone) {
            const normalizedPhone = normalizePhone(phone);
            user = await User.findOne({ phone: normalizedPhone });
        } else {
            user = await User.findOne({ email });
        }

        if (!user) return res.status(400).json({ message: 'المستخدم غير موجود' });
        if (user.isVerified) return res.status(400).json({ message: 'الحساب مفعل بالفعل!' });

        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        const newExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
        user.verificationCode = newCode;
        user.verificationCodeExpires = newExpiry;
        user.otpCode = newCode;
        user.otpExpires = newExpiry;
        await user.save();

        // 🔒 SECURITY FIX: Only log OTP in development
        if (process.env.NODE_ENV === 'development') {
            logger.info(`🔐 [DEV ONLY] كود جديد لـ ${identifier}: ${newCode}`);
        }

        // إرسال عبر SMS إذا كان لديه رقم هاتف
        if (user.phone) {
            sendSmsOTP(user.phone, `رمز تفعيل حسابك (إعادة إرسال) هو: ${newCode}`)
                .catch(err => logger.error("⚠️ SMS Error:", err.message));
        }

        // إرسال عبر البريد إذا كان لديه بريد
        if (user.email) {
            sendEmail(user.email, 'إعادة إرسال كود التفعيل', `كود التفعيل الجديد هو: ${newCode}`)
                .catch(err => logger.info("Mail Error:", err.message));
        }

        res.json({ message: 'تم إرسال كود جديد بنجاح' });
    } catch (err) {
        res.status(500).json({ message: 'فشل في إرسال الكود' });
    }
});

// ==========================================
// 🔑 Forgot Password (Smart Search - Email OR Phone)
// ==========================================
router.post('/forgot-password', otpLimiter, async (req, res) => {
    try {
        const { identifier } = req.body; // يقبل بريد أو رقم

        if (!identifier) {
            return res.status(400).json({ message: 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف' });
        }

        // 🔍 البحث الذكي: يبحث في البريد والرقم معاً
        const normalizedPhone = normalizePhone(identifier);

        const user = await User.findOne({
            $or: [
                { email: identifier.toLowerCase().trim() },
                { phone: normalizedPhone }
            ]
        });

        if (!user) {
            return res.json({ message: 'إذا كان الحساب مسجلاً لدينا، ستصلك رسالة تحتوي على كود الاستعادة' });
        }

        // إنشاء كود استعادة
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetCode = resetCode;
        user.resetCodeExpires = Date.now() + 10 * 60 * 1000; // 10 دقائق
        await user.save();

        // 📧 تحديد طريقة الإرسال بناءً على ما أدخله المستخدم
        const isEmail = identifier.includes('@');

        if (isEmail) {
            // إرسال عبر البريد الإلكتروني
            sendEmail(user.email, 'استعادة كلمة المرور', `كود الاستعادة الخاص بك هو: ${resetCode}`)
                .catch(err => logger.error('Email send error:', err));

            logger.info(`📧 Reset code sent via EMAIL to: ${user.email}`);
            res.json({
                message: 'تم إرسال كود الاستعادة على بريدك الإلكتروني',
                method: 'email'
            });
        } else {
            // إرسال عبر SMS
            if (user.phone) {
                sendSmsOTP(user.phone, `كود استعادة كلمة المرور في تطبيق وجيز هو: ${resetCode}`)
                    .catch(err => logger.error('SMS send error:', err));

                logger.info(`📱 Reset code sent via SMS to: ${user.phone}`);
                res.json({
                    message: 'تم إرسال كود الاستعادة على هاتفك في رسالة نصية',
                    method: 'sms'
                });
            } else {
                // احتياطي: إرسال عبر البريد
                sendEmail(user.email, 'استعادة كلمة المرور', `كود الاستعادة: ${resetCode}`)
                    .catch(err => logger.error('Email send error:', err));

                res.json({
                    message: 'تم إرسال كود الاستعادة على بريدك الإلكتروني',
                    method: 'email'
                });
            }
        }

        // 🔒 SECURITY: Only log in development
        if (process.env.NODE_ENV === 'development') {
            logger.info(`🔐 [DEV ONLY] Reset code for ${identifier}: ${resetCode}`);
        }

    } catch (err) {
        logger.error('Forgot password error:', err);
        res.status(500).json({ message: 'حدث خطأ في السيرفر' });
    }
});

// ==========================================
// 6️⃣ تفعيل إشعارات واتساب
// ==========================================
router.post('/toggle-notification', protect, async (req, res) => {
    try {
        const { enable } = req.body; // true or false
        const user = await User.findById(req.user._id);

        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

        user.isWhatsappSubscribed = enable;
        await user.save();

        res.json({
            success: true,
            message: enable ? 'تم تفعيل إشعارات واتساب ✅' : 'تم إيقاف إشعارات واتساب 🔕',
            isWhatsappSubscribed: user.isWhatsappSubscribed
        });

    } catch (err) {
        logger.error(err);
        res.status(500).json({ message: 'خطأ سيرفر' });
    }
});
// ==========================================
// 🔑 5️⃣ تعيين كلمة مرور جديدة (Reset Password)
// ==========================================
router.post('/reset-password', loginLimiter, async (req, res) => {
    try {
        const { identifier, code, newPassword } = req.body;

        if (!identifier || !code || !newPassword) {
            return res.status(400).json({ message: 'يرجى إدخال جميع البيانات المطلوبة' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
        }

        const normalizedPhone = normalizePhone(identifier);

        const user = await User.findOne({
            $or: [
                { email: identifier.toLowerCase().trim() },
                { phone: normalizedPhone }
            ]
        });

        if (!user) {
            return res.status(404).json({ message: 'الحساب غير موجود' });
        }

        // ✅ FIX #8: فحص الانتهاء أولاً ثم مقارنة الكود
        // لو عكسنا الترتيب، سيتحقق السيرفر من صحة الكود أولاً ويُفصح للمهاجم أن الكود صحيح قبل إبلاغه بالانتهاء
        if (!user.resetCodeExpires || Date.now() > new Date(user.resetCodeExpires).getTime()) {
            return res.status(400).json({ message: 'انتهت صلاحية كود الاستعادة، أعد المحاولة' });
        }

        // التحقق من صحة الكود (بعد التحقق من الانتهاء)
        if (user.resetCode !== code) {
            return res.status(400).json({ message: 'كود الاستعادة غير صحيح' });
        }


        // تعيين كلمة المرور الجديدة (سيتم تشفيرها تلقائياً بواسطة pre-save hook)
        user.password = newPassword;
        user.resetCode = undefined;
        user.resetCodeExpires = undefined;
        await user.save();

        res.json({ message: 'تم تغيير كلمة المرور بنجاح! يمكنك تسجيل الدخول الآن.' });

    } catch (err) {
        logger.error('Reset password error:', err);
        res.status(500).json({ message: 'حدث خطأ في السيرفر' });
    }
});

// ==========================================
// 🔄 Refresh Token — تجديد التوكن تلقائياً
// ==========================================
router.post('/refresh', protect, async (req, res) => {
    try {
        // req.user is already verified by `protect` middleware
        const newToken = jwt.sign(
            { userId: req.user._id, role: req.user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({ token: newToken });
    } catch (err) {
        res.status(401).json({ message: 'فشل تجديد الجلسة' });
    }
});

// ==========================================
// 🌐 Google Sign-In — Step 1: Verify Token
// ==========================================
// Body: { idToken }
// → Existing user: return JWT immediately
// → New user: return { requiresPhone: true, googleData: { name, email, picture, idToken } }
router.post('/google', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ message: 'idToken مطلوب' });

        // 1. Verify with Google
        const googleClient = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID
        );
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const { email, name, picture } = payload;

        // 2. Look up user by email
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            if (!existingUser.isActive) {
                return res.status(403).json({ message: 'حسابك موقوف. تواصل مع الإدارة.' });
            }
            if (!existingUser.isVerified) {
                return res.status(403).json({ message: 'حسابك غير مفعّل. تواصل مع الإدارة.' });
            }
            // ✅ Existing user — sign in directly
            logger.info(`✅ Google login (existing user): ${email}`);
            const token = jwt.sign(
                { userId: existingUser._id, role: existingUser.role },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );
            return res.json({
                token,
                user: {
                    _id: existingUser._id,
                    name: existingUser.name,
                    role: existingUser.role,
                    phone: existingUser.phone,
                    isWhatsappSubscribed: existingUser.isWhatsappSubscribed
                }
            });
        }

        // 🆕 New user — ask for phone number
        logger.info(`📱 Google new user — phone required: ${email}`);
        return res.json({
            requiresPhone: true,
            googleData: { name, email, picture, idToken }
        });

    } catch (err) {
        logger.error('Google auth error:', err.message);
        res.status(401).json({ message: 'فشل التحقق من حساب Google. حاول مجدداً.' });
    }
});

// ==========================================
// 🌐 Google Sign-In — Step 2: Complete Registration
// ==========================================
// Body: { idToken, phone }
// Re-verifies token, validates phone, creates user, returns JWT
router.post('/google/complete', async (req, res) => {
    try {
        const { idToken, phone: rawPhone } = req.body;

        if (!idToken || !rawPhone) {
            return res.status(400).json({ message: 'idToken ورقم الهاتف مطلوبان' });
        }

        // 1. Re-verify idToken server-side (never trust client data)
        const googleClient = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID
        );
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const { email, name, picture } = payload;

        // 2. Normalize phone
        const phone = normalizePhone(rawPhone);

        // 3. Check if phone is already taken
        const phoneTaken = await User.findOne({ phone });
        if (phoneTaken) {
            return res.status(400).json({ message: 'رقم الهاتف مسجل مسبقاً بحساب آخر' });
        }

        // 4. Handle race condition: email might have been registered between step 1 and 2
        let user = await User.findOne({ email });
        if (user) {
            logger.info(`✅ Google complete — email already exists (race), signing in: ${email}`);
            const token = jwt.sign(
                { userId: user._id, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );
            return res.json({
                token,
                user: {
                    _id: user._id,
                    name: user.name,
                    role: user.role,
                    phone: user.phone,
                    isWhatsappSubscribed: user.isWhatsappSubscribed
                }
            });
        }

        // 5. Create new user with real phone
        // Generate a secure random password (Google users authenticate via Google only)
        const randomPassword = require('crypto').randomBytes(32).toString('hex');

        user = new User({
            name,
            email,
            phone,
            password: randomPassword, // hashed by pre-save hook; never used for login
            role: 'client',
            wallet_balance: 0, // BL-S1 FIX: صراحة لضمان وجود القيمة وتفادي TOCTOU
            isVerified: true, // Google already verified the email
            approvalStatus: 'approved',
            authProvider: 'google',
            documents: { profilePhoto: picture || '' }
        });

        await user.save();
        logger.info(`🎉 Google new user created: ${email} (${phone})`);

        // 6. Return JWT
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.status(201).json({
            token,
            user: {
                _id: user._id,
                name: user.name,
                role: user.role,
                phone: user.phone,
                isWhatsappSubscribed: user.isWhatsappSubscribed
            }
        });

    } catch (err) {
        logger.error('Google complete error:', err.message);
        res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الحساب. حاول مجدداً.' });
    }
});

// ==========================================
// 📱 SMS OTP — Step 1: Send OTP via BRQSMS
// ==========================================
router.post('/send-otp', otpLimiter, async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ message: 'رقم الهاتف مطلوب' });

        const phone = normalizePhone(phoneNumber);
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Save to DB (expires in 5 mins automatically via TTL index)
        const Otp = require('../models/Otp');
        // Delete any existing OTP for this phone to prevent spam
        await Otp.deleteMany({ phone });

        const newOtp = new Otp({ phone, otp: otpCode });
        await newOtp.save();

        // Send via BRQSMS
        const BRQSMS_TOKEN = process.env.BRQSMS_TOKEN;
        const payload = {
            recipient: phone,
            sender_id: "Wajeezsd",
            type: "plain",
            message: `كود التحقق الخاص بتطبيق وجيز هو: ${otpCode}`
        };

        let smsSent = false;
        try {
            const response = await axios.post('https://dash.brqsms.com/api/v3/sms/send', payload, {
                headers: {
                    'Authorization': `Bearer ${BRQSMS_TOKEN}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 sec timeout
            });
            logger.info(`📱 [BRQSMS] OTP Sent to ${phone}`, response.data);
            smsSent = true;
        } catch (smsErr) {
            // SMS failed — OTP is still in DB, captain can request resend
            logger.error('⚠️ BRQSMS send failed:', smsErr?.response?.data || smsErr.message);
        }

        res.json({
            message: smsSent
                ? 'تم إرسال كود التحقق بنجاح'
                : 'تعذّر إرسال الكود عبر الرسائل. تأكد من صحة الرقم وحاول مجدداً.',
            sent: smsSent
        });
    } catch (err) {
        logger.error('Send OTP Error:', err?.response?.data || err.message);
        res.status(500).json({ message: 'فشل في إرسال الكود. تأكد من صحة الرقم وحاول مجدداً.' });
    }
});

// ==========================================
// 📱 SMS OTP — Step 2: Verify OTP & Create User
// ==========================================
router.post('/verify-otp', otpLimiter, async (req, res) => {
    try {
        const { phoneNumber, otp, googleData } = req.body; // googleData is optional (for 2-Step Google Flow)
        if (!phoneNumber || !otp) return res.status(400).json({ message: 'البيانات غير مكتملة' });

        const phone = normalizePhone(phoneNumber);
        const Otp = require('../models/Otp');

        // 1. Validate OTP
        const validOtp = await Otp.findOne({ phone, otp });
        if (!validOtp) {
            return res.status(400).json({ message: 'الكود غير صحيح أو منتهي الصلاحية' });
        }

        // OTP is valid! Delete it so it can't be reused.
        await Otp.deleteOne({ _id: validOtp._id });

        // 2. Check if user exists
        let user = await User.findOne({ phone });

        // 3. User Creation Logic
        if (!user && googleData) {
            // New User via Google Sign-In 2-Step Flow
            const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
            const ticket = await googleClient.verifyIdToken({ idToken: googleData.idToken, audience: process.env.GOOGLE_CLIENT_ID });
            const payload = ticket.getPayload();
            const { email, name, picture } = payload;

            // Check if email somehow exists first
            user = await User.findOne({ email });
            if (!user) {
                // 🌍 Validate city
                const VALID_CITIES = ['Khartoum', 'PortSudan'];
                const userCity = VALID_CITIES.includes(req.body.city) ? req.body.city : 'Khartoum';

                const randomPassword = require('crypto').randomBytes(32).toString('hex');
                user = new User({
                    name,
                    email,
                    phone,
                    password: randomPassword,
                    role: 'client',
                    city: userCity, // 🌍 City assignment
                    isVerified: true,
                    approvalStatus: 'approved',
                    documents: { profilePhoto: picture || '' }
                });
                await user.save();
                logger.info(`🎉 Google + OTP new user created: ${email} (${phone})`);
            }
        }
        else if (!user) {
            // ✅ FIX #15: التحقق من وجود حساب كابتن/تاجر معلق بنفس الرقم
            // لو سجّل كابتن عبر /register-captain ولم يُفعّل بعد، لا نُنشئ حساب عميل جديد
            // بدلاً من ذلك، أخبره بالوضع الحالي
            const pendingAccount = await User.findOne({ 
                phone, 
                role: { $in: ['captain', 'merchant'] }
            });
            if (pendingAccount) {
                return res.status(400).json({ 
                    message: 'يوجد حساب كابتن/تاجر مسجّل بهذا الرقم. يرجى تسجيل الدخول بكلمة المرور أو التواصل مع الإدارة.',
                    existingRole: pendingAccount.role,
                    approvalStatus: pendingAccount.approvalStatus
                });
            }

            // إنشاء حساب عميل جديد عبر OTP المستقل
            const randomPassword = require('crypto').randomBytes(32).toString('hex');
            const randomString = require('crypto').randomBytes(8).toString('hex');
            const fallbackEmail = `otp_${randomString}_${Date.now()}@wajeezsd.local`;
            user = new User({
                name: 'مستخدم جديد',
                email: fallbackEmail,
                phone,
                password: randomPassword,
                role: 'client',
                isVerified: true, // Phone is verified
                approvalStatus: 'approved'
            });
            await user.save();
            logger.info(`🎉 Standalone OTP new user created: (${phone}) → ${fallbackEmail}`);
        }

        // 🔒 بوابة الدخول — نفس فحوصات /login بالضبط. بدونها كان دخول OTP يتخطّى
        // الإيقاف والموافقة: حساب أوقفته الإدارة (isActive) أو كابتن مرفوض/معلّق
        // يستعيد وصوله عبر SMS. (الحسابات المُنشأة للتوّ أعلاه isActive=true وapproved.)
        // التجّار لا يُحجبون هنا تماشياً مع /login — إيقافهم يتم عبر isActive.
        if (!user.isActive) {
            return res.status(403).json({ message: 'حسابك موقوف. تواصل مع الإدارة.' });
        }
        if (user.role === 'captain' && user.approvalStatus === 'pending') {
            return res.status(403).json({ message: 'حسابك قيد المراجعة من الإدارة. سيتم إشعارك عند الموافقة.' });
        }
        if (user.role === 'captain' && user.approvalStatus === 'rejected') {
            return res.status(403).json({ message: 'تم رفض طلبك. تواصل مع الإدارة لمزيد من التفاصيل.' });
        }

        // 4. Generate JWT & Return
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            token,
            user: {
                _id: user._id,
                name: user.name,
                role: user.role,
                phone: user.phone,
                isWhatsappSubscribed: user.isWhatsappSubscribed
            }
        });

    } catch (err) {
        logger.error('Verify OTP Error:', err.message);
        res.status(500).json({ message: 'حدث خطأ أثناء التحقق من الكود' });
    }
});

// ═══════════════════════════════════════════════════════════
// 📒 دفتر العناوين — عناوين محفوظة للعميل
// ═══════════════════════════════════════════════════════════

// @route  GET /api/auth/addresses — قائمة عناوين المستخدم
router.get('/addresses', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('savedAddresses');
        res.json({ addresses: user?.savedAddresses || [] });
    } catch (err) {
        logger.error('Get addresses error:', err.message);
        res.status(500).json({ message: 'حدث خطأ' });
    }
});

// @route  POST /api/auth/addresses — إضافة عنوان جديد
router.post('/addresses', protect, async (req, res) => {
    try {
        const { label, address, lat, lng, contactName, contactPhone } = req.body || {};
        if (!address || !address.trim()) {
            return res.status(400).json({ message: 'العنوان مطلوب' });
        }
        const user = await User.findById(req.user._id).select('savedAddresses');
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

        // حد أقصى 8 عناوين لتفادي التضخم
        if ((user.savedAddresses || []).length >= 8) {
            return res.status(400).json({ message: 'وصلت للحد الأقصى من العناوين المحفوظة (8).' });
        }

        user.savedAddresses.push({
            label: (label || 'عنوان').trim().slice(0, 40),
            address: address.trim().slice(0, 200),
            lat, lng,
            contactName: (contactName || '').trim().slice(0, 60),
            contactPhone: (contactPhone || '').trim().slice(0, 20)
        });
        await user.save();
        res.json({ message: 'تم حفظ العنوان', addresses: user.savedAddresses });
    } catch (err) {
        logger.error('Add address error:', err.message);
        res.status(500).json({ message: 'حدث خطأ أثناء حفظ العنوان' });
    }
});

// @route  DELETE /api/auth/addresses/:addrId — حذف عنوان
router.delete('/addresses/:addrId', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('savedAddresses');
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
        const before = user.savedAddresses.length;
        user.savedAddresses = user.savedAddresses.filter(a => a._id.toString() !== req.params.addrId);
        if (user.savedAddresses.length === before) {
            return res.status(404).json({ message: 'العنوان غير موجود' });
        }
        await user.save();
        res.json({ message: 'تم حذف العنوان', addresses: user.savedAddresses });
    } catch (err) {
        logger.error('Delete address error:', err.message);
        res.status(500).json({ message: 'حدث خطأ أثناء الحذف' });
    }
});

// ═══════════════════════════════════════════════════════════
// 🗑️ حذف الحساب بطلب المستخدم — شرط إلزامي في App Store (5.1.1(v))
// ═══════════════════════════════════════════════════════════
// المسار يجب أن يكون متاحاً داخل التطبيق نفسه بلا مراسلة الدعم.
//
// لا نحذف مستند المستخدم فعلياً لأن الطلبات والسجل المالي تشير إليه؛ الحذف
// الصارم يفسد تقارير الأرباح والمديونيات التاريخية. بدلاً منه نُجهّل (anonymize)
// كل البيانات الشخصية ونقفل الحساب نهائياً — وهذا ما تطلبه Apple فعلياً:
// ألّا يبقى للمستخدم حساب ولا بيانات شخصية.
//
// @route  DELETE /api/auth/me
// @body   { confirmPhone } — رقم هاتف الحساب كتأكيد (يعمل لمستخدمي Google أيضاً
//         الذين لا يعرفون كلمة مرورهم، ويمنع الحذف بلمسة خاطئة)
// @access Private
router.delete('/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

        // 1️⃣ حسابات الإدارة لا تُحذف من التطبيق
        if (user.role === 'admin') {
            return res.status(403).json({ message: 'حسابات الإدارة لا تُحذف من التطبيق.' });
        }

        // 2️⃣ تأكيد الهوية برقم الهاتف
        const confirmPhone = normalizePhone(String(req.body?.confirmPhone || ''));
        if (!confirmPhone || confirmPhone !== user.phone) {
            return res.status(400).json({ message: 'رقم الهاتف غير مطابق لحساب هذا المستخدم.' });
        }

        const Order = require('../models/Order');
        const ShopOrder = require('../models/ShopOrder');
        const ACTIVE_ORDER = ['pending', 'scheduled', 'accepted', 'picked_up'];
        const ACTIVE_SHOP_ORDER = [
            'shop_pending', 'shop_preparing', 'ready_for_pickup',
            'captain_assigned', 'picked_up'
        ];

        // 3️⃣ ممنوع الحذف أثناء طلب جارٍ (يترك طرفاً آخر معلّقاً)
        const activeOrders = await Order.countDocuments({
            status: { $in: ACTIVE_ORDER },
            $or: [{ client: user._id }, { captain: user._id }]
        });
        const activeShopOrders = await ShopOrder.countDocuments({
            status: { $in: ACTIVE_SHOP_ORDER },
            $or: [{ client: user._id }, { captain: user._id }]
        });
        if (activeOrders + activeShopOrders > 0) {
            return res.status(409).json({
                code: 'ACTIVE_ORDERS',
                message: 'لديك طلب جارٍ. أكمله أو ألغِه ثم أعد المحاولة.'
            });
        }

        // 4️⃣ ممنوع الحذف مع مديونية مفتوحة (الكابتن يجمع نقداً لحساب الشركة)
        if (user.role === 'captain' && (user.wallet_balance || 0) < 0) {
            return res.status(409).json({
                code: 'OUTSTANDING_BALANCE',
                message: 'عليك مديونية غير مسددة. سوِّ حسابك مع الإدارة قبل الحذف.'
            });
        }

        // 5️⃣ التاجر: تُقفل متاجره حتى لا تبقى معروضة بلا صاحب
        if (user.role === 'merchant') {
            const Place = require('../models/Place');
            await Place.updateMany({ ownerId: user._id }, { $set: { isActive: false } });
        }

        // 6️⃣ التجهيل — الهاتف فريد في المخطط فنستبدله بقيمة فريدة مشتقّة من المعرّف
        const stamp = Date.now().toString(36);
        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    name: 'مستخدم محذوف',
                    phone: `deleted_${user._id}_${stamp}`,
                    password: await bcrypt.hash(`deleted_${user._id}_${stamp}`, 10),
                    isActive: false,
                    isVerified: false,
                    isAvailableForWork: false,
                    isWhatsappSubscribed: false,
                    savedAddresses: [],
                    documents: {},
                    deletedAt: new Date()
                },
                $unset: {
                    email: '', fcmToken: '', currentLocation: '',
                    resetCode: '', resetCodeExpires: '',
                    verificationCode: '', verificationCodeExpires: '',
                    otpCode: '', otpExpires: '', trustedDevices: ''
                }
            }
        );

        logger.info({ userId: String(user._id), role: user.role }, '🗑️ Account deleted by user');
        res.json({ message: 'تم حذف حسابك وبياناتك الشخصية نهائياً.' });
    } catch (err) {
        logger.error('Delete account error:', err.message);
        res.status(500).json({ message: 'حدث خطأ أثناء حذف الحساب' });
    }
});

module.exports = router;
