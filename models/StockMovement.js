const mongoose = require('mongoose');

// 💼 ERP: سجل حركة المخزون — كل تغيير في كمية منتج يُكتب هنا كسطر تدقيق دائم.
// موجب = دخول للمخزون (شراء/إرجاع)، سالب = خروج (بيع/تسوية بالنقص).
const StockMovementSchema = new mongoose.Schema({
    placeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, default: '' }, // لقطة للاسم — يبقى السجل مقروءاً لو حُذف المنتج

    type: {
        type: String,
        enum: [
            'purchase',   // توريد/شراء بضاعة جديدة
            'sale',       // بيع (طلب تطبيق أو نقطة بيع)
            'adjustment', // تسوية يدوية (جرد)
            'return'      // إرجاع للمخزون (رفض/إلغاء طلب)
        ],
        required: true
    },

    quantity: { type: Number, required: true },        // موجب = دخول، سالب = خروج
    balanceAfter: { type: Number, default: null },     // المخزون بعد الحركة (null = غير محدود)
    unitCost: { type: Number, default: 0 },            // تكلفة الوحدة (لحركات الشراء)

    reason: { type: String, default: '' },
    refModel: { type: String, enum: ['ShopOrder', 'PosSale', null], default: null },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

StockMovementSchema.index({ placeId: 1, createdAt: -1 });
StockMovementSchema.index({ productId: 1, createdAt: -1 });
StockMovementSchema.index({ placeId: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('StockMovement', StockMovementSchema);
