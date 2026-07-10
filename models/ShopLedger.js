const mongoose = require('mongoose');

// 💼 ERP: دفتر الأستاذ المالي للمتجر (كشف الحساب) — يغذّي Place.shopWalletBalance.
// الرصيد = مستحقات التاجر لدى تطبيق وجيز (Clearing/Settlement):
//   sale_income  (+) عند توصيل طلب متجر بنجاح — قيمة البضاعة بعد خصم كوبونات المنتجات
//   settlement   (-) عند تحويل الأدمن للمستحقات للتاجر (بنكك) بعد موافقة طلب السحب
//   adjustment   (±) تسوية إدارية يدوية
// ملاحظة: مبيعات نقطة البيع (POS) نقد مباشر بيد التاجر — لا تدخل الدفتر إطلاقاً.
const ShopLedgerSchema = new mongoose.Schema({
    placeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', required: true },

    type: {
        type: String,
        enum: ['sale_income', 'settlement', 'adjustment'],
        required: true
    },

    amount: { type: Number, required: true },       // موجب = دخل، سالب = صرف/تسوية
    balanceAfter: { type: Number, required: true }, // رصيد المحفظة بعد الحركة (لقطة)

    refModel: { type: String, enum: ['ShopOrder', 'SettlementRequest', null], default: null },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    note: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

ShopLedgerSchema.index({ placeId: 1, createdAt: -1 });
ShopLedgerSchema.index({ placeId: 1, type: 1, createdAt: -1 });
// 🛡️ منع القيد المزدوج: قيد دخل واحد فقط لكل طلب متجر
ShopLedgerSchema.index(
    { refModel: 1, refId: 1, type: 1 },
    { unique: true, partialFilterExpression: { type: 'sale_income', refModel: 'ShopOrder' } }
);

module.exports = mongoose.model('ShopLedger', ShopLedgerSchema);
