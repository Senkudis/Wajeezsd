/**
 * 🩹 إصلاح حسابات العملاء التي قلبها منطقُ الانتساب القديم — تشغيل يدوي.
 *
 * ما كان يحدث: عميلٌ يتقدّم للعمل ككابتن فيصير role='captain' في اللحظة
 * نفسها، قبل أن ينظر أحدٌ في طلبه. وإن رُفض صار كابتناً مرفوضاً و
 * isActive=false — وتسجيل الدخول ممنوع على الكابتن المرفوض، فانتهى به
 * الأمر **محظوراً من التطبيق كلّه** عقوبةً على أنه تقدّم لوظيفة.
 *
 * الإصلاح في الكود منع تكرارها، لكنه **لا يُصلح من علِق قبله**:
 *   - المرفوضون: ما زالوا خارج التطبيق. لا يستطيعون حتى تسجيل الدخول.
 *   - المعلّقون: فقدوا واجهة العميل، ولو رُفضوا اليوم لسقطوا في نفس الحفرة،
 *     لأن دورهم صار 'captain' فلا يعرف مسارُ الرفض أنهم عملاء أصلاً.
 *
 * التمييز: مَن سجّل ككابتن ابتداءً يُنشأ حسابه ويُقدَّم طلبه في الطلب نفسه،
 * فـ createdAt ≈ submittedAt. أمّا المُرقَّى فبينهما فجوة — استعمل التطبيق
 * كعميل ثم تقدّم. ونُعزّز ذلك بوجود طلباتٍ له كعميل، وهي قرينة قاطعة.
 *
 * ⚠️ العرض أولاً افتراضياً — لا يكتب شيئاً بلا --apply:
 *
 *     node scripts/repair-captain-applications.js           # عرض فقط
 *     node scripts/repair-captain-applications.js --apply   # تنفيذ
 *
 * ⚠️ تأكّد أن MONGO_URI يشير إلى قاعدة الإنتاج قبل التشغيل.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

// فجوةٌ بين إنشاء الحساب وتقديم الطلب تعني أن الحساب سبق الطلب — أي ترقية.
// عشر دقائق تتسع لتسجيلٍ بطيء مع رفع وثائق، ولا تتسع ليومٍ من الاستعمال.
const UPGRADE_GAP_MS = 10 * 60 * 1000;

async function main() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGO_URI غير مضبوط في .env');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log(`قاعدة البيانات: ${mongoose.connection.name}`);
    console.log(APPLY ? '>>> وضع التنفيذ' : '>>> عرض فقط (أضف --apply للتنفيذ)');

    const User  = require('../models/User');
    const Order = require('../models/Order');

    // كل من دورُه كابتن وله ملفّ انتسابٍ مُقدَّم، وقراره ليس قبولاً.
    // المقبولون كباتنُ فعلاً — لا نمسّهم مهما كان أصلهم.
    const candidates = await User.find({
        role: 'captain',
        'captainApplication.submittedAt': { $ne: null },
        approvalStatus: { $in: ['pending', 'rejected'] }
    }).select('name phone createdAt approvalStatus isActive captainApplication').lean();

    console.log(`\nمرشّحون للفحص: ${candidates.length}`);

    const repairs = [];

    for (const u of candidates) {
        const submitted = new Date(u.captainApplication.submittedAt).getTime();
        const created   = new Date(u.createdAt).getTime();
        const gap       = submitted - created;

        // قرينة قاطعة: طلباتٌ قدّمها كعميل. حسابٌ أُنشئ ككابتن لا يملكها.
        const clientOrders = await Order.countDocuments({ client: u._id });

        const isUpgrade = clientOrders > 0 || gap > UPGRADE_GAP_MS;
        if (!isUpgrade) continue;

        repairs.push({
            _id: u._id,
            name: u.name,
            phone: u.phone,
            was: u.approvalStatus,
            clientOrders,
            gapHours: Math.round(gap / 3600000),
            wasActive: u.isActive
        });
    }

    if (!repairs.length) {
        console.log('\nلا حسابات تحتاج إصلاحاً.');
        await mongoose.disconnect();
        return;
    }

    console.log(`\nحسابات ستُعاد إلى دور العميل: ${repairs.length}\n`);
    for (const r of repairs) {
        const locked = (r.was === 'rejected' && !r.wasActive) ? '  [كان محظوراً من التطبيق]' : '';
        console.log(`  ${r.name} — ${r.phone}`);
        console.log(`     الحالة: ${r.was} | طلباته كعميل: ${r.clientOrders} | الفجوة: ${r.gapHours} ساعة${locked}`);
    }

    if (!APPLY) {
        console.log('\nلم يُكتب شيء. أعد التشغيل بـ --apply للتنفيذ.');
        await mongoose.disconnect();
        return;
    }

    let done = 0;
    for (const r of repairs) {
        // الدور يعود عميلاً، والحساب يُفعَّل، وحالة الطلب تنتقل إلى حقلها
        // الجديد — فيبقى المعلّق ظاهراً للأدمن عبر captainApplication.status.
        await User.updateOne({ _id: r._id }, {
            $set: {
                role: 'client',
                approvalStatus: 'approved',   // الافتراضي للعميل — وإلا منعته الحُرّاس
                isActive: true,
                'captainApplication.status': r.was   // 'pending' أو 'rejected'
            }
        });
        done++;
    }

    console.log(`\nتم إصلاح ${done} حساباً.`);
    console.log('المرفوضون يستطيعون تسجيل الدخول الآن، وإعادة التقديم إن أرادوا.');
    await mongoose.disconnect();
}

main().catch(err => {
    console.error('فشل:', err.message);
    process.exit(1);
});
