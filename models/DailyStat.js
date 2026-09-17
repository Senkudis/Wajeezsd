const mongoose = require('mongoose');

/**
 * 📊 عدّادات المسار اليومية — وثيقةٌ واحدة لكل (يوم × مدينة).
 *
 * لماذا: لم يكن في المشروع أي قياسٍ للمنتج. لا يمكن الإجابة على «أين يسقط
 * المستخدم في التسجيل؟» ولا «كم نسبة من يفتح متجراً ثم يطلب؟» ولا «أي
 * مدينة تنمو؟» — فيُطوَّر بالحدس.
 *
 * ولماذا عدّادات لا أحداث: سجلّ حدثٍ لكل نقرة ينمو بلا حدّ وينفخ القاعدة
 * التي يعمل عليها التطبيق نفسه. هنا وثيقةٌ واحدة في اليوم لكل مدينة
 * تُحدَّث بـ `$inc` ذرّي: حجمها ثابتٌ مهما بلغ عدد المستخدمين.
 *
 * ولماذا لا خدمة خارجية: هذه بيانات مستخدمين في السودان، وإرسالها لطرفٍ
 * ثالث يضيف التزاماً قانونياً ويحتاج موافقةً لا نملكها. وكل ما نحتاجه
 * أرقامٌ مجمَّعة — لا هويّات — والقاعدة عندنا تكفي.
 *
 * 🔒 لا شيء هنا يخصّ فرداً: أعدادٌ فقط. لا معرّف مستخدم ولا جهاز.
 */
const DailyStatSchema = new mongoose.Schema({
    day:  { type: String, required: true },   // YYYY-MM-DD بتوقيت السودان
    city: { type: String, required: true, default: 'unknown' },

    /* ── مسار التسجيل: أين يسقط الناس ── */
    registerStarted:   { type: Number, default: 0 },  // فُتح نموذج التسجيل وأُرسل
    registerCompleted: { type: Number, default: 0 },  // صار له حساب فعلاً
    otpSent:           { type: Number, default: 0 },
    otpVerified:       { type: Number, default: 0 },

    /* ── مسار الطلب: من يتصفّح إلى من يستلم ── */
    storeOpened:    { type: Number, default: 0 },  // فُتحت صفحة متجر
    orderCreated:   { type: Number, default: 0 },
    orderAccepted:  { type: Number, default: 0 },  // قبِله كابتن
    orderDelivered: { type: Number, default: 0 },
    orderCancelled: { type: Number, default: 0 },

    /* ── انضمام ── */
    captainSignup:  { type: Number, default: 0 },
    merchantRequest: { type: Number, default: 0 }
}, { timestamps: true });

// وثيقةٌ واحدة لكل يوم ومدينة — الفهرس الفريد هو ما يجعل upsert آمناً
DailyStatSchema.index({ day: 1, city: 1 }, { unique: true });
DailyStatSchema.index({ day: -1 });

/** يوم السودان (UTC+3) — حتى لا ينقسم مساء اليوم على يومين */
DailyStatSchema.statics.today = function () {
    return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

module.exports = mongoose.model('DailyStat', DailyStatSchema);
