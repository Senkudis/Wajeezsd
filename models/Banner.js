const mongoose = require('mongoose');

// 🖼️ نظام البانرات الإعلانية
const BannerSchema = new mongoose.Schema({

    // ── العنوان ──
    title: {
        type: String,
        required: true,
        maxlength: 200
    },

    // ── رابط الصورة ──
    image_url: {
        type: String,
        required: true
    },

    // ── الرابط عند الضغط على البانر (اختياري) ──
    link: {
        type: String,
        default: ''
    },

    // ── نوع الهدف عند الضغط ──
    targetType: {
        type: String,
        enum: ['none', 'place', 'product', 'category', 'url'],
        default: 'none'
    },

    // ── معرّف الهدف: ID المتجر، أو "placeId:productId" للمنتج، أو ID القسم، أو رابط خارجي ──
    targetId: {
        type: String,
        default: ''
    },

    // ── المدينة المستهدفة (all = جميع المدن) ──
    city: {
        type: String,
        default: 'all'
    },

    // ── مكان عرض البنر: الرئيسية، صفحة التسوق، أو كلاهما ──
    placement: {
        type: String,
        enum: ['all', 'home', 'shop'],
        default: 'all'
    },

    // ── ترتيب العرض (الأصغر = الأول) ──
    sortOrder: {
        type: Number,
        default: 0
    },

    // ── نشط / موقوف ──
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },

    // ── تاريخ انتهاء البانر (null = لا يوجد انتهاء) ──
    expiresAt: {
        type: Date,
        default: null
    },

    // ── إحصائيات ──
    viewsCount:  { type: Number, default: 0 },
    clicksCount: { type: Number, default: 0 },

    // ── من أنشأه ──
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }

}, { timestamps: true });

BannerSchema.index({ isActive: 1, sortOrder: 1 });
BannerSchema.index({ city: 1, isActive: 1 });

module.exports = mongoose.model('Banner', BannerSchema);
