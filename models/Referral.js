const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
    marketerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Marketer',
        required: true
    },
    referralCode: {
        type: String,
        required: true
    },
    // بيانات المتجر المُسجَّل من خلال الإحالة
    merchantRequestId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MerchantRequest',
        default: null
    },
    // يُملأ عند قبول الطلب
    merchantUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    placeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Place',
        default: null
    },
    businessName: {
        type: String,
        default: ''
    },
    ownerName: {
        type: String,
        default: ''
    },
    phone: {
        type: String,
        default: ''
    },
    // عدد الأوردرات المُنجزة من هذا المتجر (الإحالة المؤهِّلة للمكافأة)
    qualifiedOrders: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

referralSchema.index({ marketerId: 1 });
referralSchema.index({ referralCode: 1 });
referralSchema.index({ merchantUserId: 1 });
referralSchema.index({ placeId: 1 });
referralSchema.index({ merchantRequestId: 1 });

module.exports = mongoose.model('Referral', referralSchema);
