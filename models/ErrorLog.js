const mongoose = require('mongoose');

/**
 * 🐞 سجلّ أخطاء الإنتاج — دائم عبر إعادة التشغيل.
 *
 * لماذا: المخزن كان في ذاكرة العملية وحدها، فخطأُ الليل يضيع مع أوّل restart صباحاً،
 * وهو غالباً الوقت الذي يُعاد فيه التشغيل بحثاً عن حلّ — فيُمحى الدليل في اللحظة
 * التي يُحتاج فيها. ولا يُشارَك بين نسخ التطبيق: خطأٌ في نسخة لا تراه الأخرى.
 *
 * fingerprint يجمع الخطأ المتكرّر في وثيقة واحدة بعدّاد، فلا يطغى خطأٌ واحد يتكرّر
 * ألف مرة على بقيّة الأخطاء في الشاشة.
 *
 * TTL شهر: أخطاء أقدم من ذلك لا تُشخِّص شيئاً، وتركها ينفخ القاعدة بلا فائدة.
 */
const ErrorLogSchema = new mongoose.Schema({
    // بصمة تجميع: الرسالة + المسار + الطريقة
    fingerprint: { type: String, required: true, unique: true, index: true },

    message:    { type: String, required: true },
    stack:      { type: String, default: null },
    statusCode: { type: Number, default: 500 },
    path:       { type: String, default: null },
    method:     { type: String, default: null },
    lastUserId: { type: String, default: null },

    count:    { type: Number, default: 1 },
    firstAt:  { type: Date, default: Date.now },
    lastAt:   { type: Date, default: Date.now, index: true },
    // يُجدَّد مع كل تكرار: خطأ لا يزال يحدث لا ينبغي أن يُحذف
    expiresAt: { type: Date, required: true }
});

ErrorLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ErrorLogSchema.index({ lastAt: -1 });

module.exports = mongoose.model('ErrorLog', ErrorLogSchema);
