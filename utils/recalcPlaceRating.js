const logger = require('./logger');

/**
 * ⭐ إعادة حساب متوسط تقييم المتجر من التقييمات الظاهرة وحدها.
 *
 * العطل الذي وُضع هذا الملف لسدّه: إخفاء تقييمٍ كان يضع `isHidden: true` ولا
 * شيء غير ذلك. والمتوسط لا يُحسب إلا داخل مسار **إضافة** تقييم جديد، فيبقى
 * على حاله بعد الإخفاء.
 *
 * أي أن تقييماً مسيئاً يُبلَّغ عنه ويُخفيه الأدمن **يختفي من قائمة الآراء
 * ويظلّ أثره في نجوم المتجر إلى الأبد** — حتى يصادف أن يُقيّم أحدهم المتجر
 * من جديد فيُعاد الحساب عرضاً. فمن يُبلّغ عن تقييمٍ كيديّ يرى البلاغ
 * «نُفِّذ» ونجوم متجره لم تتحرّك.
 *
 * وهذا يمسّ مباشرةً ما نَعِد به آبل في الإرشاد 1.2: أن المحتوى المُبلَّغ عنه
 * يُزال فعلاً. الإزالة نصفُها عرضٌ ونصفها أثر.
 *
 * ⚠️ لا يرمي: فشل إعادة الحساب لا يجوز أن يُفشل إخفاءً — الإخفاء نفسه هو
 *    الإجراء العاجل، والمتوسط يُصحَّح في المحاولة التالية.
 *
 * @param {import('mongoose').Types.ObjectId|string} placeId
 */
async function recalcPlaceRating(placeId) {
    try {
        if (!placeId) return;

        const mongoose = require('mongoose');
        const Rating = require('../models/Rating');
        const Place  = require('../models/Place');

        const _id = typeof placeId === 'string' ? new mongoose.Types.ObjectId(placeId) : placeId;

        const stats = await Rating.aggregate([
            { $match: { targetType: 'place', targetId: _id, isHidden: false } },
            { $group: { _id: null, avg: { $avg: '$score' }, count: { $sum: 1 } } }
        ]);

        // 🔑 الحالة الصفرية مقصودة: إخفاء آخر تقييمٍ للمتجر يجب أن يُعيده إلى
        //    «لا تقييم». تركُ القيم القديمة هنا كان يُبقي نجوماً لمتجرٍ لم يعد
        //    له تقييمٌ ظاهر واحد.
        const avg   = stats.length ? Math.round(stats[0].avg * 10) / 10 : 0;
        const count = stats.length ? stats[0].count : 0;

        await Place.updateOne({ _id }, { $set: { ratingAvg: avg, ratingCount: count } });
        return { ratingAvg: avg, ratingCount: count };
    } catch (err) {
        logger.error({ err: err.message, placeId: String(placeId) }, 'recalcPlaceRating failed');
    }
}

module.exports = { recalcPlaceRating };
