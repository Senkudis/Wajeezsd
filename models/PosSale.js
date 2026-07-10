const mongoose = require('mongoose');

// 💼 ERP: مبيعات نقطة البيع (Walk-in POS) — بيع مباشر من المحل بدون توصيل.
// النقد بيد التاجر مباشرة، لذلك لا تمس محفظة المستحقات (ShopLedger) —
// لكنها تدخل في تقارير المبيعات والأرباح وتخصم من المخزون.
const PosSaleSchema = new mongoose.Schema({
    placeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', required: true },

    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        cost: { type: Number, default: 0 },   // لقطة التكلفة وقت البيع
        quantity: { type: Number, default: 1 },
        subtotal: { type: Number }
    }],

    itemsTotal: { type: Number, required: true },   // قبل الخصم
    discount: { type: Number, default: 0 },          // خصم يدوي على الفاتورة
    totalAmount: { type: Number, required: true },   // بعد الخصم

    paymentMethod: { type: String, enum: ['cash', 'bank'], default: 'cash' },
    note: { type: String, default: '', maxlength: 300 },

    // إلغاء فاتورة (يعيد المخزون)
    isVoided: { type: Boolean, default: false },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

PosSaleSchema.index({ placeId: 1, createdAt: -1 });
PosSaleSchema.index({ placeId: 1, isVoided: 1, createdAt: -1 });

module.exports = mongoose.model('PosSale', PosSaleSchema);
