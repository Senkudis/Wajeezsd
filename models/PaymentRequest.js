const mongoose = require('mongoose');

const PaymentRequestSchema = new mongoose.Schema(
    {
        captainId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        // 💰 بيانات التحويل
        amount: {
            type: Number,
            required: true,
            min: 1
        },
        transactionId: {
            type: String,
            required: true,
            trim: true
        },
        receiptImage: {
            type: String, // URL بعد الحفظ على الديسك
            default: null
        },

        // ⚖️ حالة الطلب
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },

        // 📝 ملاحظة الأدمن عند الرفض
        adminNote: {
            type: String,
            default: ''
        },

        // 👤 من وافق / رفض
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        reviewedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

// Index للبحث السريع عن الطلبات المعلقة
PaymentRequestSchema.index({ status: 1, createdAt: -1 });
PaymentRequestSchema.index({ captainId: 1, status: 1 });

module.exports = mongoose.model('PaymentRequest', PaymentRequestSchema);
