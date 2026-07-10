const mongoose = require('mongoose');

// 💼 ERP: مصروفات المتجر التشغيلية — للتقارير فقط (حساب صافي الربح).
// لا تمس رصيد محفظة المتجر (shopWalletBalance) إطلاقاً — المحفظة مستحقات لدى التطبيق.
const ExpenseSchema = new mongoose.Schema({
    placeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', required: true },

    category: {
        type: String,
        enum: ['rent', 'salaries', 'supplies', 'utilities', 'transport', 'other'],
        default: 'other'
    },
    amount: { type: Number, required: true, min: 1 },
    description: { type: String, default: '', maxlength: 300 },
    date: { type: Date, default: Date.now },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

ExpenseSchema.index({ placeId: 1, date: -1 });
ExpenseSchema.index({ placeId: 1, category: 1, date: -1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
