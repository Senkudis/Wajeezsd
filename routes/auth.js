const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { validateAuth } = require('../middleware/validateMiddleware');
const { protect } = require('../middleware/authMiddleware'); // Auto-imported
const { sendWhatsAppOTP } = require('../services/whatsappService');
const { normalizePhone } = require('../utils/phoneNormalizer'); // ✅ Fixed to use destructuring
const axios = require('axios'); // ✅ Import Axios for proxy requests

// ==========================================
// 🔒 0️⃣ Check WhatsApp Subscription (Proxy)
// ==========================================
router.get('/check-subscription/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const BOT_API_URL = 'http://localhost:3000'; // Local Bot Service
        const BOT_API_KEY = 'scrt_whatsapp_api_key_2026'; // Server-side Secret

        const response = await axios.get(`${BOT_API_URL}/check-subscription/${phone}`, {
            headers: { 'x-api-key': BOT_API_KEY }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Subscription Check Proxy Error:', error.message);
        // Fail gracefully (assume not subscribed or service down)
        res.status(200).json({ subscribed: false, error: 'Service Unavailable' });
    }
});

// ==========================================
// 1️⃣ تسجيل مستخدم جديد (بدون تشفير يدوي)
// ==========================================
router.post('/register', validateAuth, async (req, res) => {
    try {
        let { name, email, phone, password } = req.body;

        // 1. Normalize Phone Number
        const originalPhone = phone;
        phone = normalizePhone(phone);
        console.log(`📞 Register: ${originalPhone} -> ${phone}`);

        // التحقق من وجود المستخدم
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'البريد الإلكتروني مسجل مسبقاً' });

        // Check by phone as well
        user = await User.findOne({ phone });
        if (user) return res.status(400).json({ message: 'رقم الهاتف مسجل مسبقاً' });

        // إنشاء كود تحقق عشوائي وصلاحية 10 دقائق
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

        // ⚠️ هام: نرسل الباسورد كما هو (password) ونعتمد على User.js لتشفيره
        user = new User({
            name,
            email,
            phone: phone, // استخدام الرقم المنسق
            password: password,
            role: 'client', // ✅ فرض دور العميل إجبارياً
            isVerified: false,
            verificationCode,
            verificationCodeExpires,
            otpCode: verificationCode, // Sync with new field
            otpExpires: verificationCodeExpires
        });

        await user.save();

        // 🔒 SECURITY FIX: Only log OTP in development
        if (process.env.NODE_ENV === 'development') {
            console.log("========================================");
            console.log(`🔐 [DEV ONLY] كود التفعيل للمستخدم ${name} هو: ${verificationCode}`);
            console.log("========================================");
        }

        // إرسال الإيميل في الخلفية
        sendEmail(email, 'كود تفعيل حساب وصل-لي', `كود التفعيل الخاص بك هو: ${verificationCode}`)
            .catch(err => console.log("⚠️ لم يتم إرسال الإيميل:", err.message));

        // ✅ إرسال واتساب
        if (phone) {
            sendWhatsAppOTP(phone, `رمز تفعيل حسابك في وصل-لي هو: *${verificationCode}*`)
                .catch(err => console.error("⚠️ WhatsApp Error:", err.message));
        }

        res.status(201).json({ message: 'تم التسجيل بنجاح! راجع هاتفك أو بريدك للحصول على الكود.' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'حدث خطأ في السيرفر' });
    }
});

// ==========================================
// 2️⃣ تسجيل الدخول (تم التعديل لإضافة الهاتف)
// ==========================================
router.post('/login', validateAuth, async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });

        // مقارنة الباسورد
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });

        if (!user.isVerified) return res.status(403).json({ message: 'الحساب غير مفعل' });

        const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

        // 🔥🔥🔥 التعديل هنا: أضفنا user.phone 🔥🔥🔥
        res.json({
            message: 'تم تسجيل الدخول بنجاح! 🚀',
            token,
            user: {
                _id: user._id,
                name: user.name,
                role: user.role,
                phone: user.phone, // ✅✅✅ تمت إضافة هذا السطر لحل المشكلة
                isWhatsappSubscribed: user.isWhatsappSubscribed
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'حدث خطأ في السيرفر' });
    }
});

// ==========================================
// 3️⃣ تفعيل الحساب
// ==========================================
router.post('/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(400).json({ message: 'المستخدم غير موجود' });

        // Allow BOTH old code AND new `otpCode`
        const isValid = user.verificationCode === code || user.otpCode === code;
        if (!isValid) return res.status(400).json({ message: 'كود التفعيل غير صحيح' });

        user.isVerified = true;
        user.verificationCode = undefined;
        user.otpCode = undefined;
        user.otpExpires = undefined;
        await user.save();

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
// ==========================================
router.post('/resend-code', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(400).json({ message: 'المستخدم غير موجود' });
        if (user.isVerified) return res.status(400).json({ message: 'الحساب مفعل بالفعل!' });

        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.verificationCode = newCode;
        user.otpCode = newCode; // Update new field
        await user.save();

        console.log(`🔐 كود جديد للإيميل ${email}: ${newCode}`); // طباعة الكود

        sendEmail(email, 'إعادة إرسال كود التفعيل', `كود التفعيل الجديد هو: ${newCode}`)
            .catch(err => console.log("Mail Error:", err.message));

        // ✅ إرسال واتساب
        if (user.phone) {
            sendWhatsAppOTP(user.phone, `رمز تفعيل حسابك (إعادة إرسال): *${newCode}*`)
                .catch(err => console.error("⚠️ WhatsApp Error:", err.message));
        }

        res.json({ message: 'تم إرسال كود جديد بنجاح' });
    } catch (err) {
        res.status(500).json({ message: 'فشل في إرسال الكود' });
    }
});

// ==========================================
// 🔑 Forgot Password (Smart Search - Email OR Phone)
// ==========================================
router.post('/forgot-password', async (req, res) => {
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
            return res.status(404).json({ message: 'الحساب غير موجود' });
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
                .catch(err => console.error('Email send error:', err));

            console.log(`📧 Reset code sent via EMAIL to: ${user.email}`);
            res.json({
                message: 'تم إرسال كود الاستعادة على بريدك الإلكتروني',
                method: 'email'
            });
        } else {
            // إرسال عبر WhatsApp
            if (user.phone) {
                sendWhatsAppOTP(user.phone, `كود استعادة كلمة المرور في وصل-لي: *${resetCode}*`)
                    .catch(err => console.error('WhatsApp send error:', err));

                console.log(`📱 Reset code sent via WhatsApp to: ${user.phone}`);
                res.json({
                    message: 'تم إرسال كود الاستعادة على واتساب',
                    method: 'whatsapp'
                });
            } else {
                // احتياطي: إرسال عبر البريد
                sendEmail(user.email, 'استعادة كلمة المرور', `كود الاستعادة: ${resetCode}`)
                    .catch(err => console.error('Email send error:', err));

                res.json({
                    message: 'تم إرسال كود الاستعادة على بريدك الإلكتروني',
                    method: 'email'
                });
            }
        }

        // 🔒 SECURITY: Only log in development
        if (process.env.NODE_ENV === 'development') {
            console.log(`🔐 [DEV ONLY] Reset code for ${identifier}: ${resetCode}`);
        }

    } catch (err) {
        console.error('Forgot password error:', err);
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
        console.error(err);
        res.status(500).json({ message: 'خطأ سيرفر' });
    }
});
// ==========================================
// 7️⃣ FCM Token Update (Native Notifications)
// ==========================================
router.put('/update-fcm', protect, async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken) return res.status(400).json({ message: 'Token required' });

        await User.findByIdAndUpdate(req.user._id, { fcmToken });
        res.json({ success: true, message: 'FCM Token Updated' });
    } catch (err) {
        console.error("FCM Update Error:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;