/**
 * 🏁 تعبئة عدّاد رحلات الكباتن من الطلبات المسلَّمة فعلاً.
 *
 * لماذا: completedTrips عدّاد جديد يبدأ من صفر، فكابتن أنجز ٤٠٠ رحلة يظهر للعميل
 * بـ"٠ رحلة" — أسوأ من ألّا يظهر شيء أصلاً. يُشغَّل مرة واحدة بعد النشر.
 *
 * الاستخدام:
 *   node scripts/backfill-captain-trips.js          → تشخيص فقط (بلا تعديل)
 *   node scripts/backfill-captain-trips.js --apply  → يكتب العدّادات
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const Order = require('../models/Order');
    const User = require('../models/User');

    // العدّ من المصدر: الطلبات المسلَّمة لكل كابتن
    const counts = await Order.aggregate([
        { $match: { status: 'delivered', captain: { $ne: null } } },
        { $group: { _id: '$captain', trips: { $sum: 1 } } }
    ]);

    console.log(`كباتن لهم رحلات مسلَّمة: ${counts.length}`);
    if (!APPLY) {
        console.log('\nتشخيص فقط — أضف --apply للكتابة.\n');
        for (const c of counts.slice(0, 10)) {
            const u = await User.findById(c._id).select('name completedTrips').lean();
            if (u) console.log(`  ${String(u.name || '—').padEnd(24)} المخزَّن: ${u.completedTrips || 0}  ←  الفعلي: ${c.trips}`);
        }
        if (counts.length > 10) console.log(`  … و${counts.length - 10} غيرهم`);
        await mongoose.disconnect();
        return;
    }

    let updated = 0;
    for (const c of counts) {
        // $set لا $inc: هذه تسويةٌ للحقيقة، وإعادة التشغيل يجب ألّا تضاعف العدّاد
        const r = await User.updateOne({ _id: c._id }, { $set: { completedTrips: c.trips } });
        if (r.modifiedCount) updated++;
    }
    console.log(`✓ حُدِّث ${updated} كابتناً.`);
    await mongoose.disconnect();
})().catch(e => { console.error('فشل:', e.message); process.exit(1); });
