/**
 * 🔧 إصلاح تاجر مُنشأ يدوياً لا يستطيع الدخول.
 *
 * السبب: إنشاء المتجر من لوحة الأدمن كان يخزّن الهاتف خاماً (0914…) بينما /login
 * يبحث بـ normalizePhone (249914…)، وإن لم يُدخَل إيميل يصبح الحساب غير قابل
 * للوصول من الدخول إطلاقاً رغم وجوده.
 *
 * الاستخدام:
 *   node scripts/fix-merchant-phone.js 0914137263
 *      → تشخيص فقط: يعرض الحسابات المطابقة وحالتها (بلا تعديل).
 *   node scripts/fix-merchant-phone.js 0914137263 --apply
 *      → يطبّع الهاتف للصيغة التي يبحث عنها الدخول.
 *   node scripts/fix-merchant-phone.js 0914137263 --apply --password=NEW_PASS
 *      → يطبّع الهاتف + يعيد ضبط كلمة المرور (تُشفَّر عبر pre-save).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { normalizePhone } = require('../utils/phoneNormalizer');

const rawArg = process.argv[2];
const APPLY = process.argv.includes('--apply');
const pwArg = (process.argv.find(a => a.startsWith('--password=')) || '').split('=')[1] || null;

if (!rawArg) {
    console.error('❌ مرّر رقم هاتف التاجر. مثال: node scripts/fix-merchant-phone.js 0914137263');
    process.exit(1);
}

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const User = require('../models/User');

    const norm = normalizePhone(rawArg);
    const digits = String(rawArg).replace(/[^0-9]/g, '');

    // ابحث بكل الصيغ المحتملة (خام / مُطبَّع / آخر 9 أرقام)
    const last9 = digits.slice(-9);
    const candidates = await User.find({
        $or: [
            { phone: rawArg },
            { phone: norm },
            { phone: new RegExp(last9 + '$') }
        ]
    }).select('name email phone role isActive isVerified approvalStatus password');

    console.log(`\n🔎 البحث عن: "${rawArg}"  (المُطبَّع: ${norm})\n`);
    if (candidates.length === 0) {
        console.log('لا يوجد أي حساب بهذا الرقم إطلاقاً — تأكّد أن المتجر أُنشئ فعلاً.\n');
        await mongoose.disconnect(); process.exit(0);
    }

    for (const u of candidates) {
        console.log('────────────────────────────────────');
        console.log('الاسم       :', u.name || '(بلا اسم)');
        console.log('الهاتف      :', u.phone, u.phone === norm ? '✓ مُطبَّع' : '⚠️ خام (لا يجده الدخول!)');
        console.log('الإيميل     :', u.email || '⚠️ لا يوجد — لا يمكن الدخول بالإيميل');
        console.log('الدور       :', u.role);
        console.log('نشط        :', u.isActive, '| مفعّل:', u.isVerified, '| الموافقة:', u.approvalStatus);
        console.log('كلمة مرور   :', u.password ? '✓ محفوظة (مشفّرة)' : '⚠️ لا توجد!');
    }
    console.log('────────────────────────────────────\n');

    if (!APPLY) {
        console.log('👁️  تشخيص فقط. أضِف --apply للإصلاح (تطبيع الهاتف)، و --password=... لإعادة ضبط كلمة المرور.\n');
        await mongoose.disconnect(); process.exit(0);
    }

    // اختر الحساب: تاجر إن وُجد، وإلا الأول
    const target = candidates.find(u => u.role === 'merchant') || candidates[0];

    // تأكّد ألا يتعارض الهاتف المُطبَّع مع حساب آخر
    const clash = await User.findOne({ phone: norm, _id: { $ne: target._id } });
    if (clash) {
        console.log(`❌ الرقم المُطبَّع ${norm} مستخدم بحساب آخر (${clash.name}). أوقفتُ الإصلاح لتفادي التعارض.\n`);
        await mongoose.disconnect(); process.exit(1);
    }

    target.phone = norm;                 // تطبيع الهاتف
    if (pwArg) target.password = pwArg;   // pre-save سيشفّرها
    if (target.role !== 'merchant') console.log('ℹ️  ملاحظة: هذا الحساب ليس دوره merchant.');
    await target.save();

    console.log('✅ تم الإصلاح:');
    console.log('   الهاتف الآن :', target.phone, '(يطابق ما يبحث عنه الدخول)');
    if (pwArg) console.log('   كلمة المرور: أُعيد ضبطها.');
    console.log(`\nيدخل التاجر الآن بـ: ${target.phone}${pwArg ? '  وكلمة المرور الجديدة' : '  وكلمة مروره الأصلية'}\n`);

    await mongoose.disconnect();
    process.exit(0);
})().catch(err => { console.error('❌', err); process.exit(1); });
