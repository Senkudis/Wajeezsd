const mongoose = require('mongoose');

/**
 * 💾 كاش نتائج بحث الأماكن الخارجي.
 *
 * لماذا في القاعدة لا في الذاكرة: الكاش داخل العملية يضيع مع كل إعادة تشغيل أو نشر
 * (فيُدفع ثمن نفس البحث من جديد)، ولا يُشارَك بين نسخ التطبيق حين يعمل بأكثر من
 * عملية — فكل نسخة تشتري نتائجها وحدها. هنا كاش واحد مشترك يعيش عبر النشر.
 *
 * الانتهاء بـ TTL index: مونجو يحذف المنتهي تلقائياً، بلا مهمّة تنظيف نكتبها.
 */
const PlaceSearchCacheSchema = new mongoose.Schema({
    // مفتاح البحث المطبَّع (النوع + المدينة + النص/التصنيف + إحداثيات مقرَّبة)
    key: { type: String, required: true, unique: true, index: true },
    // النتائج الخام المطبَّعة — تُفلتر بمنطقة التوصيل عند القراءة لا عند الحفظ
    results: { type: Array, default: [] },
    expiresAt: { type: Date, required: true }
}, { timestamps: true });

// حذف تلقائي عند بلوغ expiresAt
PlaceSearchCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PlaceSearchCache', PlaceSearchCacheSchema);
