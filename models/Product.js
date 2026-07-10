const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    placeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Place',
        required: true,
        index: true
    },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true },

    // 💼 ERP: سعر التكلفة/الشراء — الربح للقطعة = price - cost
    cost: { type: Number, default: 0, min: 0 },
    // 💼 ERP: حد التنبيه للمخزون المنخفض (null = بلا تنبيه)
    lowStockThreshold: { type: Number, default: null, min: 0 },
    // 💼 ERP: رمز المنتج الداخلي (اختياري)
    sku: { type: String, default: '' },
    image: { type: String, default: '' },
    category: { type: String, default: 'عام' }, // فئة داخل المتجر
    isAvailable: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    // 📦 Stock Management
    // null  = غير محدود (لا يوجد تتبع للكمية)
    // 0     = نفدت الكمية (يُعيَّن isAvailable: false تلقائياً)
    // n > 0 = الكمية المتوفرة
    stock: { type: Number, default: null, min: 0 },

    // ⭐ نظام التقييم
    ratingAvg:   { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },

    // 👁️ عداد المشاهدات
    viewsCount:  { type: Number, default: 0 },
}, { timestamps: true });

ProductSchema.index({ placeId: 1, isAvailable: 1 });
ProductSchema.index({ placeId: 1, category: 1 });

module.exports = mongoose.model('Product', ProductSchema);
