const mongoose = require('mongoose');

// 💳 سجل تعديلات المديونية — كل عملية تعديل من الإدارة على رصيد كابتن تُسجَّل هنا
// يُستخدم في تقارير الأرباح المالية:
//   - mode='add'     → إيراد إضافي للإدارة (دين مستحق على الكابتن)
//   - mode='zero'    → خسارة (إعفاء كامل)
//   - mode='partial' → خسارة جزئية (تخفيض جزء من الدين)
const debtAdjustmentSchema = new mongoose.Schema({
    captain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    mode: {
        type: String,
        enum: ['zero', 'partial', 'add'],
        required: true,
        index: true
    },
    amount: {
        // المبلغ الموجب الذي طُبِّق (دائماً > 0)
        type: Number,
        required: true,
        min: 0
    },
    previousBalance: {
        type: Number,
        required: true
    },
    newBalance: {
        type: Number,
        required: true
    },
    note: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Helpful compound index for date-range queries by mode
debtAdjustmentSchema.index({ createdAt: -1, mode: 1 });

module.exports = mongoose.model('DebtAdjustment', debtAdjustmentSchema);
