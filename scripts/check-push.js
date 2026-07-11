/**
 * 🔔 أداة تشخيص نظام إشعارات الـ Push (FCM).
 *
 * الاستخدام:
 *   node scripts/check-push.js                  → يعرض حالة التهيئة وعدد التوكنات
 *   node scripts/check-push.js <FCM_TOKEN>      → يرسل إشعار اختبار حقيقي لهذا التوكن
 *   node scripts/check-push.js --user <userId>  → يرسل لتوكن مستخدم مخزّن في قاعدة البيانات
 *
 * متى يعمل الإرسال؟ فقط إذا كان service account مضبوطاً (متغير بيئة أو ملف).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { isFirebaseReady, sendPush } = require('../utils/firebasePush');

(async () => {
    console.log('\n========== تشخيص نظام الـ Push ==========\n');

    // 1) حالة تهيئة Firebase
    const ready = isFirebaseReady();
    console.log(ready
        ? '✅ Firebase مهيّأ — الإرسال مُفعّل.'
        : '❌ Firebase غير مهيّأ — الـ Push معطّل (أضِف service account).');

    // 2) إحصاء التوكنات من قاعدة البيانات
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const User = require('../models/User');
        const total = await User.countDocuments();
        const withToken = await User.countDocuments({ fcmToken: { $exists: true, $ne: null } });
        const captains = await User.countDocuments({ role: 'captain', fcmToken: { $exists: true, $ne: null } });
        console.log(`\n👥 المستخدمون: ${total} | لديهم FCM token: ${withToken} | كباتن بتوكن: ${captains}`);
        if (withToken === 0) {
            console.log('⚠️ لا يوجد أي مستخدم بتوكن — لن يصل Push لأحد حتى لو هُيّئ Firebase.');
            console.log('   (التوكن يُسجَّل تلقائياً من تطبيق أندرويد عند تسجيل الدخول.)');
        }

        // 3) إرسال اختبار
        const args = process.argv.slice(2);
        let targetToken = null;
        if (args[0] === '--user' && args[1]) {
            const u = await User.findById(args[1]).select('fcmToken name');
            targetToken = u && u.fcmToken;
            console.log(`\n🎯 المستخدم ${u ? u.name : args[1]} — ${targetToken ? 'لديه توكن' : 'لا يوجد توكن'}`);
        } else if (args[0] && !args[0].startsWith('--')) {
            targetToken = args[0];
        }

        if (targetToken) {
            if (!ready) {
                console.log('\n⛔ لا يمكن الإرسال: Firebase غير مهيّأ.');
            } else {
                console.log('\n📤 إرسال إشعار اختبار...');
                const ok = await sendPush(targetToken, '🔔 اختبار وصل-لي', 'هذا إشعار تجريبي للتأكد من عمل النظام.', { type: 'test' });
                console.log(ok ? '✅ تم الإرسال بنجاح! تحقق من جهازك.' : '❌ فشل الإرسال (راجع اللوغ أعلاه).');
            }
        } else {
            console.log('\nℹ️ لإرسال اختبار حقيقي: node scripts/check-push.js <FCM_TOKEN>  أو  --user <userId>');
        }
    } catch (e) {
        console.log('❌ خطأ في قاعدة البيانات:', e.message);
    }

    console.log('\n=========================================\n');
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
})();
