const mongoose = require('mongoose');

/**
 * 🧭 محاولةٌ فاشلة لعميل — أيّ خانةٍ تعثّر فيها، وبأيّ رسالة.
 *
 * العميل الذي يعلق لا يتّصل غالباً — يغادر. ومن يتّصل يقول «التطبيق فيه
 * مشكلة، كتبت الرقم وقال غير موجود»، ولا شيء يدلّ على أيّ خانةٍ ولا كم
 * عميلاً وقع في الشيء نفسه. هذا السجلّ يجيب: «هاتف المرسل: ٣٤ محاولة من ٢١
 * عميلاً هذا الأسبوع» — فيُصلَح النموذج لا العميل.
 *
 * لا يُخزَّن ما كتبه العميل في الخانة (رقمه، اسمه) — الخانة والرسالة فقط.
 * ويُمحى بعد ٦٠ يوماً.
 */
const ClientErrorSchema = new mongoose.Schema({
    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    city:    { type: String, enum: ['Khartoum', 'PortSudan'], index: true },
    // order: نموذج الطلب · register: تسجيل العميل · captain_signup: تسجيل كابتن
    // shop_register: طلب انضمام متجر · shop_order: الطلب من صفحة متجر
    form:    { type: String, enum: ['order', 'register', 'captain_signup', 'shop_register', 'shop_order'], required: true },
    // client: فحص الواجهة قبل الإرسال · server: رفضه الخادم بعد الإرسال
    source:  { type: String, enum: ['client', 'server'], required: true },
    field:   { type: String, required: true, maxlength: 60 },
    message: { type: String, default: '', maxlength: 200 },
    // نسخة التطبيق — خطأٌ يختفي في النسخة الجديدة يُعرف من هنا
    appVersion: { type: String, default: '', maxlength: 20 },
    createdAt: { type: Date, default: Date.now }
});

ClientErrorSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });
ClientErrorSchema.index({ form: 1, field: 1, createdAt: -1 });

module.exports = mongoose.model('ClientError', ClientErrorSchema);
