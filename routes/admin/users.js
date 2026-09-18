// routes/admin/users.js — مُولّد من تقسيم admin.js الأصلي.
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
const { protect, adminOnly, superAdminOnly, requirePermission, requireAnyPermission, getAdminCityFilter, resolveCreationCity, adminCanActOnUser } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const { normalizePhone } = require('../../utils/phoneNormalizer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');
const SessionRequest = require('../../models/SessionRequest');
const Place = require('../../models/Place');
const Product = require('../../models/Product');

router.get('/user/:id', protect, requireAnyPermission(['view_users', 'view_captains', 'manage_captains', 'manage_users']), async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }
        // 🌍 sub_admin لا يطّلع على مستخدم خارج مدينته
        if (!adminCanActOnUser(req, user)) {
            return res.status(403).json({ message: 'غير مصرح — هذا المستخدم خارج مدينتك' });
        }
        res.json(user);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// =========================================================
// 👥 الجزء الثاني: إدارة المستخدمين
// =========================================================

// @route   GET /api/admin/users
// @desc    جلب جميع المستخدمين (مع فلتر اختياري بالمدينة)
// 🌍 ?city=Khartoum | PortSudan (optional, no city = all cities)

router.get('/users', protect, requirePermission('view_users'), async (req, res) => {
    try {
        // 🌍 sub_admin يرى مستخدمي مدينته فقط
        const users = await User.find(getAdminCityFilter(req)).select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/admin/captains
// @desc    جلب الكباتن فقط (مع فلتر اختياري بالمدينة)
// 🌍 ?city=Khartoum | PortSudan (optional)

/**
 * ⚡ حقول القائمة — اختيارٌ صريح لا `-password`.
 *
 * كان المسار يُرجع مستند الكابتن كاملاً إلا كلمة المرور، فيحمل في كل صفٍّ
 * رموز التحقّق (verificationCode، otpCode) ورمز الإشعارات (fcmToken) وروابط
 * المستندات — بيانات لا تستعملها أيّ شاشة، وبعضها أسرارٌ لا داعي لخروجها من
 * السيرفر أصلاً. شاشتان تستهلكان هذا المسار ولا تحتاجان بينهما غير ما هنا:
 * الإدارة المالية (الرصيد والحدّ والحجب) وتبديل كابتن الطلب (الاسم والمركبة).
 *
 * الأثر: حمولة أصغر بمراتب على مسارٍ تُناديه صفحة المالية عند كل فتح.
 */
const CAPTAIN_LIST_FIELDS =
    'name phone city role isActive approvalStatus vehicleType ' +
    'wallet_balance credit_limit is_blocked averageRating completedTrips createdAt';

router.get('/captains', protect, requirePermission('view_captains'), async (req, res) => {
    try {
        // 🌍 sub_admin يرى كباتن مدينته فقط
        const captains = await User.find({ role: 'captain', ...getAdminCityFilter(req) })
            .select(CAPTAIN_LIST_FIELDS)
            .lean();   // قراءةٌ للعرض فقط — لا حاجة لمستندات mongoose كاملة
        res.json(captains);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/admin/captains-detailed
// @desc    ملفّ الكباتن الكامل لصفحة admin-captains.html
// 🔐 صلاحية: view_captain_details — لا view_captains.
//    تلك تُظهر اسماً ورقماً ورصيداً، وهذه تكشف الرقم الوطني والعنوان وجهة
//    الطوارئ وصور الهوية والسيلفي. فصلُهما مقصود.

router.get('/captains-detailed', protect, requirePermission('view_captain_details'), async (req, res) => {
    try {
        const captains = await User.find({
            $or: [
                { role: 'captain' },
                // مُرقّىً ما زال طلبه معلّقاً: دورُه 'client' حتى القبول
                { 'captainApplication.status': { $in: ['pending', 'rejected'] } }
            ],
            ...getAdminCityFilter(req)
        })
            .select(
                'name phone email city role isActive isVerified approvalStatus vehicleType ' +
                'wallet_balance credit_limit is_blocked averageRating ratingCount completedTrips ' +
                'createdAt lastSeen currentLocation captainApplication documents rejectionReason'
            )
            .sort({ createdAt: -1 })
            .lean();

        // 📊 إثراءٌ لا تملكه الوثيقة: عدد التوصيلات المكتملة فعلاً من الطلبات.
        //    completedTrips حقلٌ يُزاد يدوياً وقد ينحرف؛ العدّ من المصدر أصدق.
        const ids = captains.map(c => c._id);
        const delivered = ids.length ? await Order.aggregate([
            { $match: { captain: { $in: ids }, status: 'delivered' } },
            { $group: { _id: '$captain', count: { $sum: 1 } } }
        ]) : [];
        const deliveredMap = Object.fromEntries(delivered.map(d => [String(d._id), d.count]));

        const rows = captains.map(c => {
            const app  = c.captainApplication || {};
            const docs = c.documents || {};

            // حالة موحّدة تُغني الواجهة عن استنتاجها من حقول متفرّقة
            let state = 'approved';
            if (app.status === 'pending' || (c.role === 'captain' && c.approvalStatus === 'pending')) state = 'pending';
            else if (app.status === 'rejected' || c.approvalStatus === 'rejected') state = 'rejected';
            if (c.is_blocked) state = 'blocked';
            else if (state === 'approved' && !c.isActive) state = 'inactive';

            const requiredDocs = {
                idImage:      !!docs.idImage,
                selfieImage:  !!docs.selfieImage,
                profilePhoto: !!docs.profilePhoto,
                vehiclePhoto: !!docs.vehiclePhoto
            };

            return {
                _id: c._id,
                name: c.name,
                phone: c.phone,
                email: c.email || '',
                city: c.city,
                role: c.role,
                state,
                vehicleType: c.vehicleType || '',
                isActive: c.isActive,
                isVerified: c.isVerified,
                isBlocked: !!c.is_blocked,
                walletBalance: c.wallet_balance || 0,
                creditLimit: c.credit_limit,
                averageRating: c.averageRating || 0,
                ratingCount: c.ratingCount || 0,
                deliveredCount: deliveredMap[String(c._id)] || 0,
                joinedAt: c.createdAt,
                lastSeen: c.lastSeen || null,
                rejectionReason: app.rejectionReason || c.rejectionReason || '',
                application: {
                    status:               app.status || 'none',
                    nationalId:           app.nationalId || '',
                    address:              app.address || '',
                    plateNumber:          app.plateNumber || '',
                    whatsapp:             app.whatsapp || '',
                    emergencyPhone:       app.emergencyPhone || '',
                    emergencyContactName: app.emergencyContactName || '',
                    emergencyRelation:    app.emergencyRelation || '',
                    hasCarrier:           app.hasCarrier || '',
                    pledgeText:           app.pledgeText || '',
                    submittedAt:          app.submittedAt || null
                },
                documents: {
                    idImage:       docs.idImage || '',
                    selfieImage:   docs.selfieImage || '',
                    profilePhoto:  docs.profilePhoto || '',
                    vehiclePhoto:  docs.vehiclePhoto || '',
                    driverLicense: docs.driverLicense || ''
                },
                requiredDocs,
                missingDocsCount: Object.values(requiredDocs).filter(v => !v).length
            };
        });

        await logAdminAction(req, 'view_captain_details',
            `اطّلع على ملفّات الكباتن (${rows.length})`);

        res.json({ captains: rows, total: rows.length });
    } catch (error) {
        logger.error({ err: error.message }, 'captains-detailed error');
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/admin/merchants-list
// @desc    لائحة التجار مع بياناتهم: الاسم، الهاتف، اسم المتجر، الفئة، عدد المنتجات
// 🔐 صلاحية: view_stores

router.get('/merchants-list', protect, requireAnyPermission(['view_stores', 'manage_stores']), async (req, res) => {
    try {
        const cityFilter = getAdminCityFilter(req);

        // جلب جميع التجار (بكل حالات الاعتماد — الفلترة تتم في الواجهة)
        const merchants = await User.find({
            role: 'merchant',
            ...cityFilter
        }).select('name phone city approvalStatus isActive createdAt').lean();

        if (!merchants.length) return res.json({ merchants: [] });

        const merchantIds = merchants.map(m => m._id);

        // جلب متاجرهم مع الفئة
        const places = await Place.find({ ownerId: { $in: merchantIds } })
            .select('name ownerId category city isActive shopWalletBalance tier')
            .populate('category', 'name icon')
            .lean();

        // جلب عدد المنتجات لكل متجر
        const placeIds = places.map(p => p._id);
        const productCounts = await Product.aggregate([
            { $match: { placeId: { $in: placeIds } } },
            { $group: { _id: '$placeId', count: { $sum: 1 } } }
        ]);
        const countMap = {};
        productCounts.forEach(pc => { countMap[pc._id.toString()] = pc.count; });

        // ربط البيانات — ownerId ليس فريداً في Place، فالتاجر قد يملك أكثر من متجر.
        // التجميع في مصفوفة بدل الدهس الذي كان يُسقط كل المتاجر عدا الأخير.
        const placesByOwner = {};
        places.forEach(p => {
            const key = p.ownerId.toString();
            (placesByOwner[key] || (placesByOwner[key] = [])).push(p);
        });

        const toStore = p => ({
            id: p._id,
            name: p.name,
            category: p.category ? p.category.name : 'غير مصنّف',
            categoryIcon: p.category ? p.category.icon : 'bi-shop',
            isActive: p.isActive,
            tier: p.tier,
            walletBalance: p.shopWalletBalance,
            productCount: countMap[p._id.toString()] || 0
        });

        const result = merchants.map(m => {
            const owned = (placesByOwner[m._id.toString()] || []).map(toStore);
            return {
                merchantId: m._id,
                name: m.name,
                phone: m.phone,
                city: m.city,
                approvalStatus: m.approvalStatus,
                isActive: m.isActive,
                joinedAt: m.createdAt,
                // store: المتجر الأساسي — يبقى للتوافق مع الواجهة الحالية
                store: owned[0] || null,
                stores: owned,
                storeCount: owned.length,
                // مجموع منتجات كل متاجر التاجر (لا الأول فقط)
                totalProductCount: owned.reduce((s, st) => s + st.productCount, 0)
            };
        });

        res.json({ merchants: result, total: result.length });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/admin/user/:id/city
// @desc    Reassign a user (client or captain) to a different city.
//          Use this when a user registered with the wrong city or moved.
// 🌍 Body: { city: 'Khartoum' | 'PortSudan' }

router.put('/user/:id/city', protect, superAdminOnly, async (req, res) => {
    try {
        const VALID_CITIES = ['Khartoum', 'PortSudan'];
        const { city } = req.body;

        if (!VALID_CITIES.includes(city)) {
            return res.status(400).json({
                message: `مدينة غير صحيحة. القيم المقبولة: ${VALID_CITIES.join(', ')}`
            });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
        if (user.role === 'admin') return res.status(403).json({ message: 'لا يمكن تغيير مدينة حساب الأدمن' });

        const oldCity = user.city;
        user.city = city;
        await user.save();

        logger.info({ adminId: req.user._id, userId: user._id, from: oldCity, to: city }, 'Admin reassigned user city');

        res.json({
            message: `تم تغيير مدينة المستخدم من ${oldCity} إلى ${city} بنجاح`,
            user: { _id: user._id, name: user.name, role: user.role, city: user.city }
        });
    } catch (error) {
        logger.error({ err: error }, 'City reassignment error');
        res.status(500).json({ message: 'Server error' });
    }
});

// @desc    تفعيل أو تعطيل حساب مستخدم

router.put('/user/:id/status', protect, requireAnyPermission(['manage_captains', 'manage_users']), async (req, res) => {
    try {
        // حماية: منع الأدمن من تعطيل نفسه
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ message: 'لا يمكنك تعطيل حسابك الشخصي!' });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // 🌍 sub_admin لا يعدّل مستخدماً خارج مدينته
        if (!adminCanActOnUser(req, user)) {
            return res.status(403).json({ message: 'غير مصرح — هذا المستخدم خارج مدينتك' });
        }

        user.isActive = !user.isActive; // عكس الحالة الحالية
        await user.save();

        res.json({
            message: `تم ${user.isActive ? 'تفعيل' : 'تعطيل'} الحساب بنجاح`,
            isActive: user.isActive,
        });

    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/admin/user/:id/verify
// @desc    تفعيل/إلغاء تفعيل حساب يدوياً (OTP) — لعملاء لم تصلهم رسالة SMS من المزود
router.put('/user/:id/verify', protect, requireAnyPermission(['manage_captains', 'manage_users']), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // 🌍 sub_admin لا يعدّل مستخدماً خارج مدينته
        if (!adminCanActOnUser(req, user)) {
            return res.status(403).json({ message: 'غير مصرح — هذا المستخدم خارج مدينتك' });
        }

        user.isVerified = !user.isVerified; // عكس الحالة الحالية
        if (user.isVerified) {
            // تنظيف أكواد التفعيل المعلقة حتى لا تبقى صالحة بعد التفعيل اليدوي
            user.verificationCode = undefined;
            user.verificationCodeExpires = undefined;
            user.otpCode = undefined;
            user.otpExpires = undefined;
        }
        await user.save();

        logger.info({ admin: req.user._id, userId: user._id, isVerified: user.isVerified }, 'Admin toggled account verification');

        res.json({
            message: user.isVerified
                ? 'تم تفعيل الحساب يدوياً — يمكن للمستخدم الدخول الآن مباشرة'
                : 'تم إلغاء تفعيل الحساب — سيُطلب منه كود OTP عند الدخول',
            isVerified: user.isVerified,
        });

    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// =========================================================
// 📦 الجزء الثالث: الطلبات (سجل الطلبات الكامل)
// =========================================================

// @route   GET /api/admin/orders/live
// @desc    جلب الطلبات النشطة فقط (مع فلتر اختياري بالمدينة)
// 🌍 ?city=Khartoum | PortSudan (optional)

router.post('/create-captain', protect, requirePermission('manage_captains'), async (req, res) => {
    try {
        const { name, email, phone, password, vehicleType, city } = req.body;

        // 🌍 sub_admin يُنشئ الكابتن في مدينته إجبارياً؛ super_admin يحدّد المدينة
        const captainCity = resolveCreationCity(req, city);

        // تنسيق رقم الهاتف
        const normalizedPhone = normalizePhone(phone);
        logger.info(`📞 Create Captain - Original: ${phone}, Normalized: ${normalizedPhone}, City: ${captainCity}`);

        // التحقق من وجود المستخدم مسبقاً
        const userExists = await User.findOne({ $or: [{ email }, { phone: normalizedPhone }] });
        if (userExists) {
            return res.status(400).json({ message: 'المستخدم موجود بالفعل (البريد أو الهاتف مسجل مسبقاً)' });
        }

        // إنشاء المستخدم
        const user = await User.create({
            name,
            email,
            phone: normalizedPhone,
            password,
            role: 'captain',
            vehicleType,
            city: captainCity,   // 🌍 City stamp
            isActive: true,
            isVerified: true,
            approvalStatus: 'approved'
        });

        if (user) {
            await logAdminAction(req, 'create_captain',
                `تم إضافة كابتن جديد: ${name}`,
                user._id, name, { phone: normalizedPhone, city: captainCity, vehicleType }
            );
            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                city: user.city,
                message: `تم إنشاء حساب الكابتن بنجاح في مدينة ${captainCity}`
            });
        } else {
            res.status(400).json({ message: 'بيانات المستخدم غير صحيحة' });
        }

    } catch (error) {
        logger.error("Create Captain Error:", error);
        res.status(500).json({ message: 'حدث خطأ في السيرفر' });
    }
});

// @route   PUT /api/admin/orders/:id/cancel-force

router.get('/pending-captains', protect, requirePermission('view_captains'), async (req, res) => {
    try {
        // 🌍 sub_admin يرى طلبات مدينته فقط
        // مصدران للطلبات، ولا بدّ منهما معاً:
        //   ١) تسجيلٌ جديد ككابتن — حسابٌ أُنشئ ليكون كابتناً (role='captain').
        //   ٢) ترقية عميلٍ قائم — دورُه يبقى 'client' حتى القبول، فلا يظهر في
        //      الفلتر الأول إطلاقاً. كان هؤلاء يظهرون لأن الدور كان يُقلب
        //      فوراً؛ وبعد إيقاف ذلك القلب صاروا يحتاجون شرطهم الخاص.
        const captains = await User.find({
            ...getAdminCityFilter(req),
            $or: [
                { role: 'captain', approvalStatus: 'pending' },
                { 'captainApplication.status': 'pending' }
            ]
        })
            .select('-password')
            .sort({ createdAt: -1 });
        res.json(captains);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/approve-captain/:id

router.put('/approve-captain/:id', protect, requirePermission('manage_captains'), async (req, res) => {
    try {
        const captain = await User.findById(req.params.id);
        if (!captain) return res.status(404).json({ message: 'الكابتن غير موجود' });
        const isUpgrade = captain.role !== 'captain'
            && captain.captainApplication?.status === 'pending';
        if (captain.role !== 'captain' && !isUpgrade) {
            return res.status(400).json({ message: 'هذا المستخدم ليس كابتن ولا لديه طلب انتساب' });
        }
        if (!adminCanActOnUser(req, captain)) return res.status(403).json({ message: 'غير مصرح — هذا الكابتن خارج مدينتك' });

        // 📎 لا قبول بوثائق ناقصة.
        //
        //    التحقّق في الواجهة يمنع الإرسال الناقص، لكنه واجهةٌ تُتجاوَز —
        //    وطلبات قديمة وصلت فعلاً بلا وثيقةٍ واحدة. وقبولُ كابتنٍ بلا هوية
        //    ولا صورةٍ لوسيلته يعني إسناد طلبات عملاء إلى شخصٍ مجهول.
        const docs = captain.documents || {};
        //    السيلفي منها: هي ما يُطابقه المراجع بصورة الهوية، فقبولٌ بلا
        //    سيلفي يعني اعتماد هويةٍ لم يتحقّق أحدٌ أنها لصاحبها.
        //    ورخصة القيادة خارجها عمداً — وسائل التوصيل منها ما لا يحتاجها.
        const missing = [
            [docs.idImage,      'الهوية'],
            [docs.selfieImage,  'السيلفي'],
            [docs.profilePhoto, 'الصورة الشخصية'],
            [docs.vehiclePhoto, 'صورة وسيلة التوصيل']
        ].filter(([v]) => !v).map(([, label]) => label);

        if (missing.length) {
            return res.status(400).json({
                message: `لا يمكن القبول — وثائق ناقصة: ${missing.join('، ')}. اطلب من المتقدّم رفعها ثم أعد المحاولة.`,
                missingDocuments: missing
            });
        }

        // 🔑 هنا وحدها تقع الترقية — لا عند تقديم الطلب.
        if (isUpgrade) captain.role = 'captain';

        captain.approvalStatus = 'approved';
        if (captain.captainApplication?.status) captain.captainApplication.status = 'approved';
        captain.isVerified = true;
        captain.isActive = true;
        await captain.save();

        await logAdminAction(req, 'approve_captain',
            `تم قبول الكابتن: ${captain.name}`,
            captain._id, captain.name
        );

        // Notify captain
        const { sendNotification } = require('../../utils/notificationHelper');
        await sendNotification(req.app, {
            userId: captain._id,
            title: 'تمت الموافقة على طلبك!',
            message: 'تم قبولك ككابتن في وجيز. يمكنك الآن تسجيل الدخول والبدء في استقبال الطلبات!',
            type: 'system',
            relatedId: captain._id
        });

        // 📩 رسالة القبول — واتساب هو ما يصل فعلاً: الكابتن لم يدخل التطبيق
        //    بعد (سجّل ثم انتظر)، فإشعار التطبيق وحده قد لا يراه أحد.
        //
        //    وتُعاد في الرد دائماً حتى لو تعذّر الإرسال: إرسال واتساب معطّل
        //    كلياً حين لا يُضبط WHATSAPP_BOT_URL (انظر services/whatsappService)،
        //    فالنسخ اليدوي من اللوحة هو الطريق المضمون لا احتياطياً نادراً.
        let approvalMessage = '';
        try {
            const { buildCaptainApprovalMessage } = require('../../utils/captainApprovalMessage');
            const Settings = require('../../models/Settings');
            const settings = await Settings.getSettings(captain.city);

            approvalMessage = buildCaptainApprovalMessage({
                name: captain.name,
                phone: captain.phone,
                email: captain.email,
                appLink: settings && settings.playStoreLink,
                appLinkIos: settings && settings.appStoreLink,
                supportPhone: settings && settings.adminPhone
            });

            // رقم الواتساب من نموذج الانتساب إن وُجد، وإلا هاتف الحساب
            const waNumber = (captain.captainApplication && captain.captainApplication.whatsapp)
                || captain.phone;
            if (waNumber) {
                const { sendWhatsAppNotification } = require('../../services/whatsappService');
                // لا نُفشل القبول إن تعثّر الإرسال — القبول وقع في القاعدة فعلاً
                sendWhatsAppNotification(waNumber, approvalMessage)
                    .catch(e => logger.warn({ err: e.message }, 'captain approval WhatsApp failed'));
            }
        } catch (e) {
            logger.warn({ err: e.message }, 'captain approval message build failed');
        }

        res.json({
            message: 'تمت الموافقة على الكابتن بنجاح',
            captain,
            approvalMessage,
            // الرقم من الخادم لا من قائمة الواجهة: الصفّ يختفي بعد التحديث
            whatsapp: (captain.captainApplication && captain.captainApplication.whatsapp) || captain.phone || ''
        });
    } catch (error) {
        logger.error('Approve Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});


// @route   PUT /api/admin/reject-captain/:id

router.put('/reject-captain/:id', protect, requirePermission('manage_captains'), async (req, res) => {
    try {
        const { reason } = req.body;
        const captain = await User.findById(req.params.id);
        if (!captain) return res.status(404).json({ message: 'الكابتن غير موجود' });
        const isUpgrade = captain.role !== 'captain'
            && captain.captainApplication?.status === 'pending';
        if (captain.role !== 'captain' && !isUpgrade) {
            return res.status(400).json({ message: 'هذا المستخدم ليس كابتن ولا لديه طلب انتساب' });
        }
        if (!adminCanActOnUser(req, captain)) return res.status(403).json({ message: 'غير مصرح — هذا الكابتن خارج مدينتك' });

        // 🕳️ نافذةٌ متبقّية من المنطق القديم: طلبات قُدّمت قبل الإصلاح قلبت
        //    دور صاحبها إلى 'captain' فوراً، فلا يعرف isUpgrade أنها ترقية.
        //    رفضُها اليوم كان سيُعطّل حساب عميلٍ من جديد.
        //
        //    التمييز بلا استعلامٍ إضافي: من سجّل ككابتن ابتداءً يُنشأ حسابه
        //    ويُقدّم طلبه في الطلب نفسه (createdAt ≈ submittedAt)، والمُرقَّى
        //    بينهما فجوة — استعمل التطبيق ثم تقدّم.
        //    (scripts/repair-captain-applications.js يُصلح المتراكم منها.)
        const _submitted = captain.captainApplication?.submittedAt;
        const isLegacyUpgrade = !isUpgrade
            && !!_submitted
            && (new Date(_submitted) - new Date(captain.createdAt)) > 10 * 60 * 1000;

        captain.rejectionReason = reason || 'لم يتم تحديد السبب';
        if (captain.captainApplication) {
            captain.captainApplication.status = 'rejected';
            captain.captainApplication.rejectionReason = captain.rejectionReason;
        }

        if (isUpgrade || isLegacyUpgrade) {
            // 🔑 عميلٌ رُفض طلبُ انتسابه يبقى **عميلاً عاملاً**.
            //    تعطيل حسابه هنا كان يعني أن من يطلب وظيفة ويُرفض يخسر
            //    التطبيق نفسه — ولا علاقة لأهليته للعمل بأهليته للطلب.
            if (isLegacyUpgrade) {
                captain.role = 'client';
                captain.approvalStatus = 'approved';   // الافتراضي للعميل
            }
            captain.isActive = true;
        } else {
            captain.approvalStatus = 'rejected';
            captain.isActive = false;
        }
        await captain.save();

        await logAdminAction(req, 'reject_captain',
            `تم رفض طلب الكابتن: ${captain.name}`,
            captain._id, captain.name, { reason: captain.rejectionReason }
        );

        const { sendNotification } = require('../../utils/notificationHelper');
        await sendNotification(req.app, {
            userId: captain._id,
            title: 'تم رفض طلبك',
            message: `سبب الرفض: ${captain.rejectionReason}`,
            type: 'system',
            relatedId: captain._id
        });

        // 📩 رسالة الرفض — تُبنى وتُعاد ليرسلها الأدمن بزرّ واحد.
        //    الرفض كان يُسجَّل ولا يبلَّغ به أحد خارج إشعار التطبيق، والمرفوض
        //    غالباً لم يدخل التطبيق أصلاً. فينتظر بلا خبر، ولا يعرف أن سبب
        //    الرفض قابلٌ للإصلاح.
        let rejectionMessage = '';
        try {
            const { buildCaptainRejectionMessage } = require('../../utils/captainApprovalMessage');
            const Settings = require('../../models/Settings');
            const settings = await Settings.getSettings(captain.city);
            rejectionMessage = buildCaptainRejectionMessage({
                name: captain.name,
                reason: captain.rejectionReason,
                supportPhone: settings && settings.adminPhone
            });
        } catch (e) {
            logger.warn({ err: e.message }, 'captain rejection message build failed');
        }

        res.json({
            message: 'تم رفض طلب الكابتن',
            captain,
            rejectionMessage,
            whatsapp: (captain.captainApplication && captain.captainApplication.whatsapp) || captain.phone || ''
        });
    } catch (error) {
        logger.error('Reject Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});


// =========================================================
// 📒 سجل الحركات المالية الشامل (Financial Ledger)
// =========================================================

// @route   GET /api/admin/ledger
// @desc    آخر 100 حركة مالية (عمولات الطلبات + تعديلات الديون)
// 🌍 ?city=Khartoum | PortSudan | all (اختياري)
// 📅 ?from=YYYY-MM-DD&to=YYYY-MM-DD (اختياري)

router.delete('/users/:id', protect, requireAnyPermission(['manage_captains', 'manage_users']), async (req, res) => {
    try {
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ message: 'لا يمكنك حذف حسابك الشخصي!' });
        }
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

        // حذف حسابات الأدمن يتم من إدارة الأدمن المساعدين فقط
        if (user.role === 'admin') {
            return res.status(403).json({ message: 'لا يمكن حذف حساب أدمن من هنا' });
        }
        // 🌍 sub_admin لا يحذف مستخدماً خارج مدينته
        if (!adminCanActOnUser(req, user)) {
            return res.status(403).json({ message: 'غير مصرح — هذا المستخدم خارج مدينتك' });
        }

        await user.deleteOne();
        res.json({ message: 'تم حذف المستخدم بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/users/:id
// @desc    تعديل بيانات المستخدم شاملة

router.put('/users/:id', protect, requireAnyPermission(['manage_captains', 'manage_users']), async (req, res) => {
    try {
        const { name, email, phone, role, wallet, vehicleType } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

        // 🌍 sub_admin لا يعدّل مستخدماً خارج مدينته
        if (!adminCanActOnUser(req, user)) {
            return res.status(403).json({ message: 'غير مصرح — هذا المستخدم خارج مدينتك' });
        }
        // الأدمن المساعد ممنوع من تغيير المدينة/الدور/الحقول المالية (صلاحيات المسؤول الرئيسي)
        const isSubAdmin = req.user.adminRole === 'sub_admin';

        // ⚠️ Safety: allow 'admin' role only — no other invalid roles
        const validRoles = ['client', 'captain', 'merchant', 'admin'];
        if (role !== undefined && !validRoles.includes(role)) {
            return res.status(400).json({ message: 'قيمة الدور غير صالحة' });
        }

        user.name   = name   || user.name;
        user.email  = email  || user.email;
        user.phone  = phone  || user.phone;
        if (!isSubAdmin) {
            user.role = role || user.role;
            if (req.body.city !== undefined) user.city = req.body.city;
        }
        user.wallet = wallet !== undefined ? wallet : user.wallet;

        // 💳 Financial fields — للمسؤول الرئيسي فقط
        if (!isSubAdmin) {
            if (req.body.wallet_balance !== undefined) {
                const parsedBalance = Number(req.body.wallet_balance);
                if (!isNaN(parsedBalance)) user.wallet_balance = parsedBalance;
            }
            if (req.body.credit_limit !== undefined) {
                const parsedLimit = Number(req.body.credit_limit);
                if (!isNaN(parsedLimit)) user.credit_limit = parsedLimit;
            }
            if (req.body.is_blocked !== undefined) {
                user.is_blocked = Boolean(req.body.is_blocked);
            }
        }

        if (role === 'captain' && vehicleType) {
            user.vehicleType = vehicleType;
        }

        // ✅ FIX: Set password directly — the pre('save') hook in User.js will hash it
        if (req.body.password) {
            user.password = req.body.password;
            // 🔒 تغيير كلمة المرور من الإدارة يُسقط جلسات المستخدم القائمة —
            //    وإلا بقي من يملك توكناً قديماً داخلاً رغم تغييرها.
            user.tokenVersion = (user.tokenVersion || 0) + 1;
        }

        await user.save();
        
        const userObj = user.toObject();
        delete userObj.password;
        delete userObj.fcmToken;
        delete userObj.resetCode;
        delete userObj.verificationCode;
        
        res.json({ message: 'تم تحديث بيانات المستخدم بنجاح', user: userObj });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   DELETE /api/admin/orders/:id
// @desc    حذف طلب نهائياً

router.get('/users/search', protect, requireAnyPermission(['send_notifications', 'view_users', 'view_captains']), async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q || q.length < 2) return res.json([]);

        const AdminSearch = require('../../public_html/js/admin-search');

        // 🛡️ تهريب المُدخَل قبل بنائه نمطاً: كان يُحقن خاماً، فنقطةٌ أو قوسٌ
        //    في ما يكتبه الأدمن يُفسَّر كنمط — نتائج عشوائية، أو نمطٌ كارثيّ
        //    يشغل الخادم على مجموعةٍ كبيرة.
        const safe = AdminSearch.escapeRegex(q);
        const or = [
            { name:  { $regex: safe, $options: 'i' } },
            // 📧 لم يكن يُبحَث فيه إطلاقاً
            { email: { $regex: safe, $options: 'i' } }
        ];

        // 📞 الهاتف مخزَّنٌ 249XXXXXXXXX، فبحثُ النصّ الخام لا يجد `0912…`
        //    أبداً — الصيغة الوحيدة التي كانت تعمل مصادفةً هي إسقاط الصفر.
        //    نطابق على **جوهر الرقم** فتستوي كل الصيغ التي يكتبها الإنسان.
        //    ولا نُرسي على نهاية الرقم: البحث يجري أثناء الكتابة، و«91234»
        //    يجب أن تجد صاحبها قبل أن يُكمل الأدمن الرقم كلّه.
        const core = AdminSearch.phoneCore(q);
        if (core) or.push({ phone: { $regex: AdminSearch.escapeRegex(core) } });
        else       or.push({ phone: { $regex: safe, $options: 'i' } });

        const users = await User.find({
            $or: or,
            role: { $in: ['client', 'captain', 'merchant'] },
            ...getAdminCityFilter(req) // 🌍 sub_admin يبحث في مدينته فقط
        })
        .select('name phone email role fcmToken')
        .limit(10);

        res.json(users);
    } catch (err) {
        logger.error('User Search Error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/admin/broadcast
// @desc    إرسال إشعار جماعي أو مخصص
// target: 'all' | 'clients' | 'captains' | 'merchants' | 'user'
// userId: required when target === 'user'

module.exports = router;
