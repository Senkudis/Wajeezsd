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
    // bogo = «اشترِ N واحصل على M مجاناً». نوعٌ ثالث لا شرطٌ على النوعين
    // السابقين: قيمته لا تُشتقّ من value إطلاقاً بل من أسعار القطع المؤهَّلة.
    type: {
        type: String,
        enum: ['percentage', 'fixed', 'bogo'],
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

    // ── 📦 حصر الكوبون بمنتجات بعينها ──
    //
    // فارغة = كل منتجات الطلب (السلوك القديم، فالكوبونات القائمة تبقى كما هي).
    // غير فارغة تقلبه إلى قائمة بيضاء **وتغيّر أساس الحساب معها**: الخصم
    // يُحسب من مجموع أسطر المنتجات المذكورة وحدها لا من إجمالي السلة. وهذا
    // هو الفرق الجوهري عن places — حصرُ المتجر يقيّد أين يعمل الكود، وحصرُ
    // المنتج يقيّد **على ماذا يُحسب**. لولا ذلك لكان «خصم ٥٠٪ على العصير»
    // يخصم نصف قيمة الوجبات أيضاً متى وُجد عصيرٌ في السلة.
    products: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],

    // ── الحد الأدنى لكمية القطع المؤهَّلة (0 = بلا شرط) ──
    // يُحسب على المنتجات المذكورة في products إن وُجدت، وإلا على كل السلة.
    minQuantity: {
        type: Number,
        default: 0,
        min: 0
    },

    // ── إعدادات «اشترِ N واحصل على M مجاناً» (type: 'bogo' وحده) ──
    // القطع المجانية هي **الأرخص** بين المؤهَّلة — هو العرف التجاري، وبدونه
    // يصير العرض بابَ استغلال: يضيف العميل قطعةً رخيصة ليُمجَّن أغلى قطعة.
    bogo: {
        buyQuantity:  { type: Number, default: 1, min: 1 },
        freeQuantity: { type: Number, default: 1, min: 1 }
    },

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
