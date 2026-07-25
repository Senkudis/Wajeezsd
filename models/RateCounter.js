const mongoose = require('mongoose');

/**
 * ⏱️ عدّاد نافذة زمنية مشترك — لسقوف الاستهلاك.
 *
 * لماذا في القاعدة: السقف داخل ذاكرة العملية يضيع مع كل إعادة تشغيل (فيُصفَّر لكل
 * المستخدمين)، ولا يُشارَك بين نسخ التطبيق — فمن يوزَّع طلبه على نسختين يحصل على
 * ضعف السقف. وهذا بالضبط ما يحمي منه السقف: استنزاف نداءات جوجل المدفوعة.
 *
 * المفتاح يحمل النافذة (مثل: errand-search:<userId>:<دقيقة>)، وتحذف مونجو الوثيقة
 * تلقائياً عند انتهائها — بلا مهمّة تنظيف.
 */
const RateCounterSchema = new mongoose.Schema({
    key:       { type: String, required: true, unique: true },
    count:     { type: Number, default: 0 },
    expiresAt: { type: Date, required: true }
});

RateCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * يزيد العدّاد ويقول هل تُجووِز السقف.
 * @param {string} key معرّف النافذة
 * @param {number} limit أقصى عدد مسموح داخلها
 * @param {number} windowMs طول النافذة بالملّي ثانية
 * @returns {Promise<{allowed: boolean, count: number}>}
 *          allowed=true عند فشل القاعدة: السقف حماية لا بوّابة، وتعطيله أهون من
 *          تعطيل البحث كلّه على كل العملاء.
 */
RateCounterSchema.statics.hit = async function (key, limit, windowMs) {
    try {
        const doc = await this.findOneAndUpdate(
            { key },
            { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + windowMs) } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        return { allowed: doc.count <= limit, count: doc.count };
    } catch (_) {
        return { allowed: true, count: 0 };
    }
};

module.exports = mongoose.model('RateCounter', RateCounterSchema);
