const mongoose = require('mongoose');

/**
 * 🔍 سجلّ عمليات البحث مجمَّعاً بالكلمة.
 *
 * لماذا: كنا نحفظ الأماكن التي اختارها العملاء فقط، فيضيع ما بحثوا عنه ولم يجدوه —
 * وهو أثمن. عمليات البحث الفارغة تقول:
 *   • أي المحلات يريدها عملاؤك ولا يعرفها جوجل ⇒ قائمة تسجيل متاجر جاهزة للمبيعات
 *   • أي المناطق يطلب منها الناس ولا نغطّيها ⇒ منطقة التوصيل أضيق من الطلب
 *   • أي الأسماء تفشل رغم وجود المحل ⇒ خلل في تطبيع البحث العربي
 *
 * وثيقة واحدة لكل (مدينة × كلمة بحث)، بعدّادات — لا صفٌّ لكل عملية بحث.
 */
const PlaceSearchQuerySchema = new mongoose.Schema({
    city:  { type: String, required: true },
    query: { type: String, required: true },   // النص المطبَّع (بلا تشكيل/مسافات زائدة)

    searches:         { type: Number, default: 0 },
    emptyCount:       { type: Number, default: 0 },   // مرات لم تُرجع أي نتيجة
    lastResultCount:  { type: Number, default: 0 },
    lastAt:           { type: Date, default: Date.now }
}, { timestamps: true });

PlaceSearchQuerySchema.index({ city: 1, query: 1 }, { unique: true });
// المسار الساخن في اللوحة: الأكثر بحثاً، والأكثر فشلاً
PlaceSearchQuerySchema.index({ city: 1, searches: -1 });
PlaceSearchQuerySchema.index({ city: 1, emptyCount: -1 });

module.exports = mongoose.model('PlaceSearchQuery', PlaceSearchQuerySchema);
