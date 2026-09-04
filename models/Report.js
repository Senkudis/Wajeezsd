const mongoose = require('mongoose');

/**
 * 🚩 بلاغ عن محتوى مسيء.
 *
 * منفصل عن Complaint عن قصد: تلك تذكرة دعمٍ على **طلب** (تأخّر، منتج ناقص،
 * خلاف على مال) ولها ردود وأولوية وأدمن مُعيَّن. وهذا بلاغٌ على **محتوى**
 * (تعليق تقييم، رسالة، مستخدم) وسؤاله واحد: يُخفى أم يُترك؟ خلطهما كان
 * سيُغرق قائمة الدعم ببلاغاتٍ لا علاقة لها بالطلبات، ويجعل «حالة التذكرة»
 * تعني شيئين مختلفين.
 *
 * لماذا وُجد أصلاً: App Store Review Guideline 1.2 يشترط على أي تطبيق يعرض
 * محتوىً من المستخدمين آليةَ إبلاغ وآليةَ حظر. تعليقات التقييم في وجيز تُعرض
 * علناً لكل زائر، فالشرط ينطبق. (رُفض التقديم الأول بطلب إظهارهما في تسجيل
 * الشاشة.)
 */
const ReportSchema = new mongoose.Schema({

    // ── من أبلغ ──
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // ── نوع المحتوى المُبلَّغ عنه ──
    targetType: {
        type: String,
        enum: ['rating', 'message', 'user'],
        required: true,
        index: true
    },

    // ── معرّف المحتوى (تقييم / رسالة / مستخدم) ──
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },

    // ── صاحب المحتوى — يُشتقّ خادمياً لا يُرسله المُبلِغ ──
    // وجوده يتيح للأدمن رؤية «هذا المستخدم عليه ٤ بلاغات» بلا استعلام مركّب،
    // ويبقى صحيحاً حتى لو حُذف المحتوى نفسه.
    targetOwner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },

    // ── سبب البلاغ — رمز ثابت لا نصّ حر (يُجمَّع ويُرتَّب) ──
    reason: {
        type: String,
        enum: [
            'offensive',      // لغة مسيئة أو بذيئة
            'harassment',     // تحرّش أو تهديد
            'spam',           // إزعاج أو إعلانات
            'false_info',     // معلومات كاذبة
            'inappropriate',  // محتوى غير لائق
            'other'
        ],
        required: true
    },

    // ── تفصيل اختياري من المُبلِغ ──
    note: {
        type: String,
        default: '',
        maxlength: 500
    },

    // ── لقطة من نصّ المحتوى وقت الإبلاغ ──
    // ⚠️ ضرورية لا زائدة: المحتوى قد يُحذف أو يُعدَّل قبل أن يراه الأدمن،
    //    فيصل البلاغ إلى شاشةٍ لا تعرض ما شُكي منه أصلاً.
    snapshot: {
        type: String,
        default: '',
        maxlength: 1000
    },

    // ── حالة المراجعة ──
    status: {
        type: String,
        enum: ['pending', 'actioned', 'dismissed'],
        default: 'pending',
        index: true
    },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    adminNote:  { type: String, default: '', maxlength: 500 }

}, { timestamps: true });

// 🔒 بلاغ واحد لكل مستخدم على كل محتوى — التكرار ضغطٌ على الزر لا إشارةُ خطورة،
//    وعدّ البلاغات المكرّرة من شخصٍ واحد يُضلّل الأدمن.
ReportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });

// 📋 شاشة الأدمن: المعلّقة أولاً والأحدث أولاً
ReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Report', ReportSchema);
