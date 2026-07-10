const mongoose = require('mongoose');

// 💼 ERP: طلب تسوية/سحب مستحقات التاجر — دورة يدوية:
// التاجر يطلب سحباً من رصيد محفظته → الأدمن يراجع ويحوّل (بنكك) ويرفق الإيصال
// → عند الموافقة يُخصم الرصيد ويُكتب قيد settlement في ShopLedger.
const SettlementRequestSchema = new mongoose.Schema({
    placeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', required: true },
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    amount: { type: Number, required: true, min: 1 },
    note: { type: String, default: '', maxlength: 300 }, // ملاحظة التاجر (حساب التحويل مثلاً)

    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },

    // بيانات التحويل عند الموافقة
    transactionId: { type: String, default: '' },
    receiptImage: { type: String, default: null },

    adminNote: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
}, { timestamps: true });

SettlementRequestSchema.index({ placeId: 1, createdAt: -1 });
SettlementRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SettlementRequest', SettlementRequestSchema);
