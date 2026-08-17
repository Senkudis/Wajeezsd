const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { VEHICLE_VALUES } = require('../utils/vehicleTypes');

const UserSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        phone: { type: String, required: true, unique: true },
        // lowercase+trim: يضمن تخزيناً موحّداً للبريد في كل المسارات (تسجيل، جوجل، OTP)
        // فلا يتعذّر الدخول لاحقاً لأن /login يبحث دائماً بصيغة صغيرة الأحرف.
        email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
        password: { type: String, required: true },
        resetCode: { type: String },
        resetCodeExpires: { type: Date },

        // ✅ حافظنا على الأدوار القديمة
        role: {
            type: String,
            enum: ['customer', 'client', 'captain', 'admin', 'merchant'],
            default: 'client'
        },

        // ✅ حافظنا على نوع المركبة للكابتن
        vehicleType: {
            type: String,
            enum: VEHICLE_VALUES   // المصدر المركزي: utils/vehicleTypes.js
        },
        currentLocation: {
            lat: { type: Number },
            lng: { type: Number },
            updatedAt: { type: Date }
        },

        isActive: { type: Boolean, default: true }, // ← Admin-controlled: false = account suspended

        // 🗑️ حذف الحساب بطلب المستخدم (شرط App Store 5.1.1(v) وGoogle Play)
        // لا نحذف السجل فعلياً: الطلبات تشير إليه وسجلّ المحاسبة يجب أن يبقى سليماً.
        // بدلاً من ذلك نُخفي كل البيانات الشخصية (اسم/هاتف/بريد/صور/عناوين) ونضع
        // isActive=false فيُمنع الدخول من /login ومن protect معاً.
        deletedAt: { type: Date, default: null },

        // ← Captain-controlled: whether they are available to receive orders (does NOT affect login)
        isAvailableForWork: { type: Boolean, default: false },

        // ✅ FIX #17: Captains default to 'pending' (require admin approval); others default to 'approved'
        approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: function () {
                return (this.role === 'captain' || this.role === 'merchant') ? 'pending' : 'approved';
            }
        },
        documents: {
            driverLicense: { type: String },  // URL الرخصة
            profilePhoto: { type: String },   // صورة شخصية
            vehiclePhoto: { type: String }    // صورة المركبة
        },
        rejectionReason: { type: String },

        // 👇 الإضافات الجديدة للتفعيل والأمان 👇
        isVerified: { type: Boolean, default: false },
        verificationCode: { type: String },
        verificationCodeExpires: { type: Date }, // ⏰ وقت انتهاء الكود

        isWhatsappSubscribed: { type: Boolean, default: false }, // ✅ WhatsApp Subscription
        otpCode: { type: String }, // ✅ For SMS/WhatsApp OTP
        otpExpires: { type: Date },

        // 🌟 Rating System
        ratingSum: { type: Number, default: 0 },
        ratingCount: { type: Number, default: 0 },
        averageRating: { type: Number, default: 5.0 }, // Default starts high or neutral

        // 🏁 عدد الرحلات المكتملة — يُعرض للعميل مع التقييم.
        // عدّاد مخزَّن لا عدٌّ عند الطلب: العدّ في كل فتح شاشة تتبّع استعلامٌ ثقيل
        // على مجموعة الطلبات كلها لكل مستخدم. يزيد ذرّياً عند كل تسليم.
        // ⚠️ الكباتن السابقون يبدؤون من صفر — انظر scripts/backfill-captain-trips.js
        completedTrips: { type: Number, default: 0 },

        // 💰 Earnings (Legacy — positive accumulation)
        wallet: { type: Number, default: 0 },

        // 💳 Negative Wallet & Credit Limit System
        // wallet_balance: صافي رصيد المحفظة (يبدأ من 0 وينخفض مع كل طلب نقدي)
        // credit_limit: الحد الأقصى للمديونية المسموحة (سالب)
        // is_blocked: هل الكابتن محجوب بسبب تجاوز الحد الائتماني
        wallet_balance: { type: Number, default: 0 },
        credit_limit: { type: Number, default: -5000 },
        is_blocked: { type: Boolean, default: false },

        // ⚠️ وقت آخر تحذير "اقتربت من الحد الائتماني".
        // قبل هذا كان الكابتن يُنبَّه لحظة الحجب فقط — أي بعد فوات الأوان،
        // فيستيقظ موقوفاً بلا إنذار. يُصفَّر عند تعافي الرصيد فوق ٦٠٪ كي
        // يعمل التحذير من جديد في دورة المديونية التالية.
        creditWarnedAt: { type: Date, default: null },

        // 🔔 FCM for Native Notifications
        fcmToken: { type: String },

        // 📒 دفتر العناوين — عناوين محفوظة للعميل (المنزل، العمل، ...)
        savedAddresses: [{
            label:        { type: String, default: 'عنوان' },   // اسم مختصر: المنزل / العمل
            address:      { type: String, required: true },
            lat:          { type: Number },
            lng:          { type: Number },
            contactName:  { type: String, default: '' },
            contactPhone: { type: String, default: '' },
            createdAt:    { type: Date, default: Date.now }
        }],

        // 🌍 Multi-City Isolation — determines which city's socket room,
        // orders, captains, and pricing this user belongs to.
        city: {
            type: String,
            enum: ['Khartoum', 'PortSudan'],
            default: 'Khartoum',
            required: true
        },

        // 🔐 Admin Role & Permissions System
        // adminRole: تُحدد نوع الأدمن (super_admin له كل الصلاحيات، sub_admin له صلاحيات محددة)
        // null = ليس أدمن (لا يُطبق على المستخدمين العاديين)
        adminRole: {
            type: String,
            enum: ['super_admin', 'sub_admin'],
            default: null,
            sparse: true
        },
        // permissions: قائمة الصلاحيات المسموحة للـ sub_admin
        // مثال: ['view_orders', 'manage_captains', 'view_stats', 'view_map']
        permissions: {
            type: [String],
            default: [],
            enum: [
                'view_orders', 'manage_orders',
                'view_captains', 'manage_captains',
                'view_stores', 'manage_stores',
                'view_stats',         // إحصائيات مبسطة بدون أرباح وعملاء
                'view_map',
                'view_complaints',
                // 💬 قراءة محادثات العميل والكابتن — صلاحية مستقلة عن الطلبات عن قصد:
                // محتوى المحادثات خاص (أرقام، عناوين، صور)، فلا يصحّ أن يأتي ضمناً
                // مع صلاحية مشاهدة الطلبات. كل وصول يُسجَّل في AdminLog.
                'view_chats',
                // 🗑️ حذف محادثة من قاعدة البيانات — منفصلة عن القراءة لأن الحذف
                // لا رجعة فيه: من يراقب المحادثات ليس بالضرورة من يُصرَّح له بمحوها.
                'manage_chats',
                'view_categories', 'manage_categories',
                // 🆕 صلاحيات إضافية
                'view_users', 'manage_users',       // العملاء/المستخدمون
                'view_finance', 'manage_finance',   // الديون، الدفعات، السجل المالي
                'view_revenue',                     // لوحة الأرباح الكاملة
                'send_notifications',               // الإشعارات والبث
                'manage_banners',                   // البانرات الإعلانية
            ]
        },

        // 🪪 بطاقة الفريق العامة (team.wajeezsd.com) — تُبنى من هذا الحساب نفسه.
        // المصدر الوحيد للحقيقة هو مجموعة users: لا مجموعة كباتن منفصلة ولا إدخال يدوي.
        // كل الحقول اختيارية وتتجاوز الاشتقاق التلقائي في utils/teamProfile.js عند ملئها.
        //
        // ⚠️ publicId وليس _id في الرابط العام: رابط البطاقة يُطبَع على بطاقة بلاستيكية
        // ويُمسح من أي غريب، ومعرّف المستند الحقيقي يُستعمل في مسارات الطلبات والمحادثات
        // — كشفه للعلن يربط بطاقةً بحسابٍ في النظام بلا داعٍ. publicId معرّف غُفل
        // ثابت مدى الحياة (لا يتغيّر عند أي تعديل) فالبطاقات المطبوعة لا تُبطَل أبداً.
        teamProfile: {
            publicId:   { type: String, unique: true, sparse: true },  // 24 hex غُفل — يُولَّد عند أول ظهور
            show:       { type: Boolean, default: true },              // إخفاء يدوي من لوحة الأدمن
            // 🏷️ اسم العرض في صفحة الفريق وحدها.
            // منفصل عن `name` عمداً: الأخير اسم الحساب الذي يظهر للعميل في تتبّع
            // الطلب وفي المحادثة وفي الفواتير، وتعديله يمسّ التطبيق كله وسجلّاته.
            // هذا الحقل يغيّر ما يُطبع على البطاقة العامة لا غير — الاسم الرسمي
            // يبقى كما هو في الحساب. فارغ ⇒ يُستعمل `name`.
            displayName: { type: String, default: '', maxlength: 100 },
            jobTitles:  { type: [String], default: [] },               // يتجاوز الاشتقاق التلقائي
            department: { type: String, default: '', maxlength: 100 }, // يتجاوز الاشتقاق التلقائي
            photo:      { type: String, default: '' },                 // يتجاوز documents.profilePhoto
            order:      { type: Number, default: 0 }                   // ترتيب العرض (تصاعدي)
        },

        // 🔑 Trusted Devices — قائمة الأجهزة الموثوقة للأدمن المساعد
        // كل جهاز يدخل لأول مرة يُحفظ هنا بعد موافقة super_admin
        trustedDevices: [
            {
                deviceId:   { type: String },
                deviceInfo: { type: String },
                addedAt:    { type: Date, default: Date.now }
            }
        ]
    },
    { timestamps: true }
);

UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// 🔒 PERFORMANCE: Database Indexes
// unique: true already creates indexes for these fields; avoid duplicate indexes
UserSchema.index({ role: 1, isActive: 1 });                             // For finding active captains (legacy)
UserSchema.index({ city: 1 });                                          // For city-filtered admin queries
UserSchema.index({ city: 1, role: 1, isActive: 1 });                    // City-scoped captain lookup
UserSchema.index({ city: 1, role: 1, isAvailableForWork: 1 });          // City-scoped captain dispatch

// 🪪 صفحة الفريق العامة: استعلامٌ واحد يفلتر بالدور والظهور ويرتّب — فهرس مركّب
// يغطّيه كاملاً. الصفحة عامة بلا مصادقة فهي أكثر مسارات القراءة تعرّضاً للزحف.
UserSchema.index({ 'teamProfile.show': 1, role: 1, 'teamProfile.order': 1 });

module.exports = mongoose.model('User', UserSchema);
