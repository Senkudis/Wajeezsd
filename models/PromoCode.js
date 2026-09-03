const mongoose = require('mongoose');

// 🎟️ نظام البرومو كود / الكوبونات
const PromoCodeSchema = new mongoose.Schema({

    // ── الكود ──
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        maxlength: 30
    },

    // ── نوع الخصم ──
    type: {
        type: String,
        enum: ['percentage', 'fixed'], // نسبة مئوية أو مبلغ ثابت
        required: true
    },

    // ── نطاق التطبيق: على المنتجات فقط، أو التوصيل فقط، أو الإجمالي ──
    // products = يُخصم من مبلغ البضاعة (المحوَّل للتاجر)
    // delivery = يُخصم من سعر التوصيل (الكاش للكابتن)
    // total    = يُخصم من الإجمالي (السلوك القديم — افتراضي للتوافق)
    appliesTo: {
        type: String,
        enum: ['total', 'products', 'delivery'],
        default: 'total'
    },

    // ── قيمة الخصم (مثلاً: 20 → 20% أو 20 جنيه) ──
    value: {
        type: Number,
        required: true,
        min: 0
    },

    // ── أقصى خصم بالجنيه (للنسبة المئوية فقط — null = غير محدود) ──
    maxDiscount: {
        type: Number,
        default: null,
        min: 0
    },

    // ── الحد الأدنى لقيمة الطلب لتطبيق الكوبون ──
    minOrderValue: {
        type: Number,
        default: 0,
        min: 0
    },

    // ── الحد الأقصى الإجمالي لعدد الاستخدامات (null = غير محدود) ──
    usageLimit: {
        type: Number,
        default: null,
        min: 1
    },

    // ── عدد مرات الاستخدام الحالية ──
    usedCount: {
        type: Number,
        default: 0
    },

    // ── الحد الأقصى لاستخدام نفس المستخدم ──
    userUsageLimit: {
        type: Number,
        default: 1,
        min: 1
    },

    // ── سجل من استخدمه ──
    usedBy: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now },
        orderId: { type: mongoose.Schema.Types.ObjectId },
        discountAmount: { type: Number, default: 0 }
    }],

    // ── مدة الصلاحية ──
    validFrom: {
        type: Date,
        default: Date.now
    },
    validUntil: {
        type: Date,
        required: true
    },

    // ── تطبيق للمدينة (all = يعمل في جميع المدن) ──
    city: {
        type: String,
        default: 'all'
    },

    // ── 🏪 حصر الكوبون بمتاجر بعينها ──
    //
    // مصفوفة فارغة = كل المتاجر (وهو السلوك القديم، فالكوبونات القائمة تبقى
    // عاملة كما هي بلا ترحيل). أي معرّف فيها يقلبها إلى قائمة بيضاء صارمة.
    //
    // ⚠️ الحصر يعني ضمناً أن الكوبون لا يعمل على طلبات التوصيل العادية
    // (طرد من عنوان إلى عنوان) — تلك بلا متجر أصلاً، فلا سبيل لمطابقتها
    // بقائمة متاجر. هذا مقصود: «خصم متاجر بعينها» جملةٌ لا معنى لها خارج
    // المتاجر، والبديل (تجاهل الحصر عند غياب المتجر) يفتح باباً يُستعمل
    // الكوبون منه في كل مكان إلا حيث قُصد.
    places: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Place'
    }],

    // ── نشط / موقوف ──
    isActive: {
        type: Boolean,
        default: true
    },

    // ── من أنشأه ──
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    // ── وصف داخلي للأدمن ──
    description: {
        type: String,
        default: ''
    }

}, { timestamps: true });

PromoCodeSchema.index({ isActive: 1, validUntil: 1 });

module.exports = mongoose.model('PromoCode', PromoCodeSchema);
