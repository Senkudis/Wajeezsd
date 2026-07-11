/**
 * ⭐ تطبيع تقييمات الكباتن القديمة من مقياس /10 إلى /5.
 *
 * الخلفية: كان endpoint التقييم يقبل 1-10 سابقاً، فبعض الكباتن لديهم
 *   averageRating أو ratingSum على مقياس /10 (مثل 7.0) — وهو مستحيل على /5.
 *   هذا السكربت يقسّم بيانات هؤلاء على 2 ويعيد الحساب (بحد أقصى 5).
 *
 * آمن وقابل للتكرار (idempotent): يطبّع فقط من تجاوز 5، ويتجاهل الباقي.
 *
 * الاستخدام:
 *   node scripts/normalize-captain-ratings.js            → معاينة فقط (Dry run)
 *   node scripts/normalize-captain-ratings.js --apply    → تطبيق التغييرات فعلياً
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

(async () => {
    console.log(`\n⭐ تطبيع تقييمات الكباتن — الوضع: ${APPLY ? '✍️  تطبيق' : '👁️  معاينة فقط'}\n`);
    await mongoose.connect(process.env.MONGO_URI);
    const users = mongoose.connection.db.collection('users');

    // الكباتن الذين تجاوز متوسطهم 5 (بيانات /10 قديمة)
    const cursor = users.find({ role: 'captain', averageRating: { $gt: 5 } });
    let count = 0;
    for await (const u of cursor) {
        const oldAvg = u.averageRating || 0;
        const oldSum = u.ratingSum || 0;
        // افتراض: البيانات كانت على /10 → اقسم على 2
        let newSum = Math.round((oldSum / 2) * 10) / 10;
        const cnt = u.ratingCount || 1;
        let newAvg = Math.min(5, +(newSum / cnt).toFixed(2));

        console.log(`• ${u.name || u._id}: avg ${oldAvg} → ${newAvg} | sum ${oldSum} → ${newSum} (n=${cnt})`);
        count++;

        if (APPLY) {
            await users.updateOne({ _id: u._id }, { $set: { ratingSum: newSum, averageRating: newAvg } });
        }
    }

    console.log(`\n${APPLY ? '✅ تم تطبيع' : '👁️  سيُطبّع'} ${count} كابتن.`);
    if (!APPLY && count > 0) console.log('   شغّل بـ --apply للتنفيذ الفعلي.\n');
    await mongoose.disconnect();
    process.exit(0);
})().catch(err => { console.error('❌', err); process.exit(1); });
