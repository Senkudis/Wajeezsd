const mongoose = require('mongoose');

/**
 * 💬 صوت العميل — مجموعة واحدة لكل ما يقوله العميل عن التجربة.
 *
 * لماذا ليست ضمن Complaint؟ الشكوى تذكرة دعم لها حالة وردود ومسؤول
 * وزمن استجابة. أما هذه فملاحظات تحليلية: تُقرأ مجمّعة للإجابة عن
 * "لماذا يتسرّب العملاء؟" لا لتُحلّ واحدة واحدة. خلطهما يفسد
 * مؤشّرات الدعم ويدفن الإشارة في ضجيج التذاكر.
 *
 * kind يفصل نوعي الإدخال:
 *   cancellation — سبب إلغاء العميل لطلبه (يُلتقط لحظة الإلغاء)
 *   first_order  — رأي العميل بعد أول توصيلة مكتملة له
 */

// أسباب الإلغاء المعرّفة مسبقاً — رموز ثابتة كي تصلح للتجميع الإحصائي.
// النص الحر يبقى متاحاً في message لكن التحليل يقوم على هذه الرموز.
const CANCEL_REASONS = {
    slow_captain: 'لم يقبل أي كابتن الطلب',
    price_high: 'سعر التوصيل مرتفع',
    changed_mind: 'غيّرت رأيي / لم أعد بحاجة',
    wrong_details: 'أخطأت في بيانات الطلب',
    found_alternative: 'وجدت وسيلة أخرى',
    other: 'سبب آخر'
};

const FeedbackSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        kind: {
            type: String,
            enum: ['cancellation', 'first_order'],
            required: true,
            index: true
        },

        // الطلب المرتبط — قد يكون Order أو ShopOrder
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

        // ── الإلغاء ──
        reasonCode: {
            type: String,
            enum: [...Object.keys(CANCEL_REASONS), null],
            default: null
        },

        // ── رأي أول طلب ──
        rating: {
            type: Number,
            min: 1,
            max: 5,
            default: null
        },

        // نص حرّ في الحالتين (اختياري في الإلغاء، هو الجوهر في رأي أول طلب)
        message: {
            type: String,
            maxlength: 1000,
            default: ''
        },

        // 🌍 للتصفية حسب المدينة في لوحة الإدارة
        city: {
            type: String,
            default: 'Khartoum',
            index: true
        },

        // ── متابعة الإدارة ──
        isReviewed: { type: Boolean, default: false, index: true },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedAt: { type: Date, default: null },
        adminNote: { type: String, maxlength: 1000, default: '' }
    },
    { timestamps: true }
);

// قائمة الإدارة: أحدث أولاً، مع تصفية بالنوع والمدينة وحالة المراجعة
FeedbackSchema.index({ createdAt: -1 });
FeedbackSchema.index({ kind: 1, createdAt: -1 });
FeedbackSchema.index({ city: 1, kind: 1, createdAt: -1 });

// 🔒 سجل واحد لكل (مستخدم، طلب، نوع) — يمنع التكرار عند إعادة إرسال النموذج
// أو نقر زر الإرسال مرتين. sparse كي لا يصطدم أي سجلين بلا طلب.
FeedbackSchema.index({ user: 1, order: 1, kind: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Feedback', FeedbackSchema);
module.exports.CANCEL_REASONS = CANCEL_REASONS;
