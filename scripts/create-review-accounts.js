#!/usr/bin/env node
/**
 * 🍏 حسابات المراجعة لـ App Store / Google Play.
 *
 * لماذا: الدخول في وجيز يمرّ برمز تحقق SMS، ومراجع Apple في كاليفورنيا لن يستلم
 * رسالة على رقم سوداني. حساب غير مفعَّل = "لا نستطيع الدخول" = رفض فوري وأسبوع
 * ضائع. هذان الحسابان يُنشآن مفعَّلين مسبقاً (isVerified + approvalStatus=approved)
 * فيدخل المراجع بكلمة المرور مباشرة.
 *
 * الاستخدام:
 *   node scripts/create-review-accounts.js            → عرض ما سيحدث فقط (بلا كتابة)
 *   node scripts/create-review-accounts.js --apply    → إنشاء/تحديث الحسابين
 *   node scripts/create-review-accounts.js --delete --apply   → حذفهما بعد القبول
 *
 * ⚠️ MONGO_URI في .env يشير إلى قاعدة الإنتاج. لا تُشغّله بـ --apply إلا بقصد.
 *
 * كلمة المرور: تُقرأ من REVIEW_ACCOUNT_PASSWORD أو تُولَّد عشوائياً وتُطبع مرة واحدة
 * (لا تُخزَّن نصاً في أي ملف — pre-save في المخطط يُعمّيها بـ bcrypt).
 */
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { normalizePhone } = require('../utils/phoneNormalizer');

const APPLY = process.argv.includes('--apply');
const DELETE = process.argv.includes('--delete');

// أرقام محجوزة للمراجعة — نطاق 09000000xx لا يتقاطع مع أرقام حقيقية
const ACCOUNTS = [
    {
        label: 'عميل (Client)',
        phone: '0900000001',
        name: 'App Review Client',
        email: 'review.client@wajeezsd.com',
        role: 'client'
    },
    {
        label: 'كابتن (Captain)',
        phone: '0900000002',
        name: 'App Review Captain',
        email: 'review.captain@wajeezsd.com',
        role: 'captain',
        vehicleType: 'electric'   // من utils/vehicleTypes.js — العجلة الكهربائية
    }
];

function makePassword() {
    // مقروءة يدوياً في نموذج App Store Connect، فبلا محارف ملتبسة
    return 'Review' + crypto.randomInt(100000, 999999) + '!w';
}

(async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('❌ MONGO_URI غير مضبوط في .env');
        process.exit(1);
    }

    await mongoose.connect(uri);
    const User = require('../models/User');
    const { VEHICLE_VALUES } = require('../utils/vehicleTypes');

    // نوع المركبة يجب أن يكون من القائمة المركزية وإلا فشل التحقق عند الحفظ
    for (const acc of ACCOUNTS) {
        if (acc.vehicleType && !VEHICLE_VALUES.includes(acc.vehicleType)) {
            acc.vehicleType = VEHICLE_VALUES[0];
        }
    }

    const dbName = mongoose.connection.name;
    console.log(`\n📇 قاعدة البيانات: ${dbName}`);
    console.log(APPLY ? '✍️  وضع الكتابة (--apply)\n' : '👀 عرض فقط — أضف --apply للتنفيذ\n');

    if (DELETE) {
        for (const acc of ACCOUNTS) {
            const phone = normalizePhone(acc.phone);
            const existing = await User.findOne({ phone });
            if (!existing) {
                console.log(`  — ${acc.label}: غير موجود`);
                continue;
            }
            console.log(`  ${APPLY ? '🗑️  حُذف' : 'سيُحذف'}: ${acc.label} (${phone})`);
            if (APPLY) await User.deleteOne({ _id: existing._id });
        }
        await mongoose.disconnect();
        console.log('\n✓ تمّ.');
        return;
    }

    const password = process.env.REVIEW_ACCOUNT_PASSWORD || makePassword();
    const created = [];

    for (const acc of ACCOUNTS) {
        const phone = normalizePhone(acc.phone);
        const existing = await User.findOne({ phone });

        console.log(`  ${existing ? '↻ تحديث' : '+ إنشاء'} ${acc.label} — ${phone}`);
        if (!APPLY) continue;

        // save() لا updateOne: نحتاج pre-save ليُعمّي كلمة المرور
        const user = existing || new User({ phone });
        user.name = acc.name;
        user.email = acc.email;
        user.password = password;          // يُعمّى في pre-save
        user.role = acc.role;
        user.city = 'Khartoum';
        user.isActive = true;
        user.isVerified = true;            // ← جوهر الغرض: تخطّي رمز SMS
        user.approvalStatus = 'approved';  // ← الكابتن لا يبقى "قيد المراجعة"
        user.deletedAt = null;
        if (acc.vehicleType) user.vehicleType = acc.vehicleType;
        // الكابتن يبدأ متاحاً للعمل ليرى المراجع الطلبات فعلاً
        if (acc.role === 'captain') user.isAvailableForWork = true;

        await user.save();
        created.push({ label: acc.label, phone, password });
    }

    await mongoose.disconnect();

    if (!APPLY) {
        console.log('\n👀 لم يُكتب شيء. أعد التشغيل بـ --apply للتنفيذ.');
        return;
    }

    console.log('\n═══════════ الصقها في App Review Information ═══════════');
    for (const c of created) {
        console.log(`  ${c.label}\n    الهاتف: ${c.phone}\n    كلمة المرور: ${c.password}`);
    }
    console.log('════════════════════════════════════════════════════════');
    console.log('⚠️ كلمة المرور تُطبع هنا مرة واحدة فقط — احفظها الآن.');
    console.log('⚠️ بعد قبول النسخة: node scripts/create-review-accounts.js --delete --apply');
})().catch((err) => {
    console.error('❌ فشل:', err.message);
    process.exit(1);
});
