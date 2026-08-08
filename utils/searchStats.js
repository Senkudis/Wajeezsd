/**
 * 📈 تسجيل إحصاءات بحث "اشترِ لي" — عدّادات يومية + سجلّ الكلمات.
 *
 * مبدأ: التسجيل لا يعطّل البحث أبداً. كل شيء هنا "أطلق وانسَ" (بلا await في مسار
 * الاستجابة) ومغلَّف بـ try/catch — خطأٌ في الإحصاء لا يجوز أن يمنع عميلاً من
 * إيجاد محلّه.
 */

const logger = require('./logger');

/**
 * يبني عدّادات الزيادة لبحثٍ واحد.
 * مفصولة ونقيّة لأن دلالتها هي جوهر اللوحة: خطأ في تصنيف بحثٍ «مدفوع» أو «من
 * الكاش» يجعل نسبة التوفير كذبةً مطمئنة — وهي المؤشّر الذي يُبنى عليه القرار.
 * كل بحث يقع في خانة واحدة فقط: googleCalls أو cacheHits أو localOnly.
 * @returns {object} كائن $inc
 */
function buildIncrement({ resultCount, googleCalled, localOnly = false, failed = false }) {
    const inc = { searches: 1 };
    if (localOnly)          inc.localOnly = 1;      // كفت قاعدتنا: لم نلمس جوجل ولا الكاش
    else if (googleCalled)  inc.googleCalls = 1;
    else                    inc.cacheHits = 1;
    if (resultCount === 0)  inc.emptyResults = 1;
    if (failed)             inc.errorCount = 1;   // «errors» محجوز في Mongoose
    return inc;
}

/**
 * @param {object} p
 * @param {string} p.city
 * @param {string} [p.query] نص البحث المطبَّع — يُترك فارغاً في البحث بالتصنيف
 * @param {number} p.resultCount عدد النتائج المعروضة للعميل بعد الحصر الجغرافي
 * @param {boolean} p.googleCalled هل كلّفنا هذا البحث نداءً مدفوعاً؟
 * @param {boolean} [p.localOnly] هل كفت قاعدتنا فلم نُنادِ جوجل أصلاً؟
 * @param {boolean} [p.failed] هل فشل البحث الخارجي؟
 * @param {boolean} [p.queryOnly] سجّل الكلمة فقط بلا عدّادات التكلفة اليومية.
 *        سببه: اقتراحات "اشترِ لي" داخل البحث العام (/errand-suggest) بحثٌ مجاني
 *        يقع مع كل كتابة. عدّه في العدّادات يضخّم `searches` و`localOnly` بآلاف
 *        العمليات التي لم تكن أصلاً مرشّحةً لنداء مدفوع، فتقفز «نسبة التوفير»
 *        إلى ٩٩٪ وتصير مؤشّراً كاذباً مطمئناً. أما الكلمة نفسها فتُسجَّل: ما يبحث
 *        عنه العميل ولا يجده هو قائمة تسجيل المتاجر، ومصدرها لا يغيّر قيمتها.
 */
function record({ city, query, resultCount, googleCalled, localOnly = false, failed = false, queryOnly = false }) {
    // لا await: الاستجابة لا تنتظر كتابة الإحصاء
    Promise.resolve()
        .then(async () => {
            const PlaceSearchStat = require('../models/PlaceSearchStat');

            if (!queryOnly) {
                const inc = buildIncrement({ resultCount, googleCalled, localOnly, failed });
                await PlaceSearchStat.updateOne(
                    { day: PlaceSearchStat.today(), city },
                    { $inc: inc },
                    { upsert: true }
                );
            }

            // البحث بالتصنيف بلا كلمة — لا يُسجَّل في سجلّ الكلمات
            if (!query) return;
            const PlaceSearchQuery = require('../models/PlaceSearchQuery');
            await PlaceSearchQuery.updateOne(
                { city, query: String(query).slice(0, 120) },
                {
                    $inc: { searches: 1, ...(resultCount === 0 ? { emptyCount: 1 } : {}) },
                    $set: { lastResultCount: resultCount, lastAt: new Date() }
                },
                { upsert: true }
            );
        })
        .catch(e => logger.warn({ err: e.message }, 'search stats record failed'));
}

module.exports = { record, buildIncrement };
