const mongoose = require('mongoose');

/**
 * 📊 عدّادات يومية لبحث "اشترِ لي".
 *
 * لماذا: بنينا طبقات لخفض فاتورة جوجل (كاش دائم + قاعدة أماكن متعلَّمة) بلا أي
 * وسيلة لمعرفة إن كانت تعمل. بدون هذه العدّادات يبقى الدليل الوحيد فاتورةَ جوجل
 * آخر الشهر — أي أن أي خلل (كاش معطّل مثلاً) يُكتشف بعد الدفع لا قبله.
 *
 * وثيقة واحدة لكل (يوم × مدينة)، تُحدَّث بـ $inc ذرّي — لا تنمو مع عدد عمليات البحث.
 */
const PlaceSearchStatSchema = new mongoose.Schema({
    day:  { type: String, required: true },   // YYYY-MM-DD بتوقيت السودان
    city: { type: String, required: true },

    searches:     { type: Number, default: 0 },  // كل نداءات البحث
    googleCalls:  { type: Number, default: 0 },  // ما كلّفنا مالاً فعلاً
    cacheHits:    { type: Number, default: 0 },  // خُدم من الكاش
    localOnly:    { type: Number, default: 0 },  // كفت قاعدتنا فلم نُنادِ جوجل أصلاً
    emptyResults: { type: Number, default: 0 },  // بحث لم يجد شيئاً
    // ⚠️ ليس «errors»: اسمٌ محجوز في Mongoose (خاصية أخطاء التحقّق في كل وثيقة)،
    // استعماله يطبع تحذيراً عند الإقلاع وقد يكسر التحقّق صامتاً.
    errorCount:   { type: Number, default: 0 }
}, { timestamps: true });

PlaceSearchStatSchema.index({ day: 1, city: 1 }, { unique: true });

/** يوم السودان (UTC+3) — حتى لا ينقسم مساء اليوم على يومين */
PlaceSearchStatSchema.statics.today = function () {
    return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

module.exports = mongoose.model('PlaceSearchStat', PlaceSearchStatSchema);
