const mongoose = require('mongoose');

// 📋 نموذج موحّد للتقييمات — يدعم الكباتن والمتاجر والمنتجات
const ratingSchema = new mongoose.Schema({

    // ── من قيّم ──
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // ── نوع التقييم ──
    targetType: {
        type: String,
        required: true,
        enum: ['captain', 'place', 'product'],
        index: true
    },

    // ── الهدف (ID الكابتن أو المتجر أو المنتج) ──
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },

    // ── مرجع الطلب (اختياري — لمنع التقييم المزدوج لنفس الطلب) ──
    order: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'orderModel',
        default: null
    },
    orderModel: {
        type: String,
        enum: ['Order', 'ShopOrder'],
        default: 'Order'
    },

    // ── للتوافق مع النظام القديم (captain only) ──
    captain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // ── في حالة تقييم منتج — نحفظ ID المتجر الأب ──
    place: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Place',
        default: null
    },

    // ── التقييم (1-5 نجوم) ──
    score: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },

    // ── تعليق اختياري ──
    comment: {
        type: String,
        default: '',
        maxlength: 500
    },

    // ── للإشراف ──
    isHidden: { type: Boolean, default: false }, // الأدمن يخفي تقييم مسيء

}, { timestamps: true });

// منع تقييم مزدوج لنفس الطلب + نفس النوع
ratingSchema.index({ client: 1, order: 1, targetType: 1 }, { unique: true, sparse: true });
ratingSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('Rating', ratingSchema);