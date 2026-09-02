#!/usr/bin/env node
/**
 * 🍎 ترقيع ios/App/App/Info.plist بكل المفاتيح التي يرفض App Store التطبيق بدونها
 *
 * لماذا سكربت لا توثيق يدوي: `npx cap add ios` يُولّد Info.plist نظيفاً من قالب
 * Capacitor بلا أي وصف أذونات، وأي إعادة توليد للمنصة تمحو التعديل اليدوي.
 * تشغيل هذا السكربت بعد كل `cap add ios` يعيد المفاتيح كما هي (idempotent —
 * تشغيله مرتين لا يكرّر شيئاً).
 *
 * الاستخدام على الـ Mac:
 *   npx cap add ios
 *   node scripts/patch-ios-plist.js
 *   npx cap sync ios
 *
 * ملاحظة: قيمة NSLocationAlwaysAndWhenInUseUsageDescription تُقرأ بالحرف في
 * نافذة الإذن، ومراجع Apple يقرؤها. صياغة غامضة = رفض تحت البند 5.1.1.
 */

const fs = require('fs');
const path = require('path');

// يقبل مساراً بديلاً كوسيط أول (للاختبار قبل توفّر ios/)
const PLIST = process.argv[2] || path.join(__dirname, '..', 'ios', 'App', 'App', 'Info.plist');

// المفتاح → عقدة القيمة كما تُكتب في plist
const KEYS = {
    // 📍 الموقع — الكابتن يحتاج الخلفية أثناء المهمة، العميل عند الطلب فقط
    NSLocationWhenInUseUsageDescription:
        '<string>نستخدم موقعك لتحديد نقطة الاستلام والتسليم بدقة وحساب سعر التوصيل.</string>',
    NSLocationAlwaysAndWhenInUseUsageDescription:
        '<string>يستخدم تطبيق الكابتن موقعك أثناء المهمة النشطة فقط — حتى لو كان التطبيق في الخلفية — لعرض موقعك للعميل ومتابعة الطلب حتى التسليم. لا نتتبّع موقعك خارج المهام.</string>',
    NSLocationAlwaysUsageDescription:
        '<string>يستخدم تطبيق الكابتن موقعك أثناء المهمة النشطة فقط لعرض موقعه للعميل ومتابعة الطلب حتى التسليم.</string>',

    // 📷 رفع صور الطرد وإثبات التسليم ووثائق الكابتن
    NSCameraUsageDescription:
        '<string>لتصوير الطرد أو إشعار الدفع أو وثائق الكابتن ورفعها مع الطلب.</string>',
    NSPhotoLibraryUsageDescription:
        '<string>لاختيار صورة الطرد أو إشعار الدفع أو الوثائق من معرض الصور.</string>',
    NSPhotoLibraryAddUsageDescription:
        '<string>لحفظ صورة إيصال الطلب في معرض صورك عند طلبك ذلك.</string>',

    // 🔄 أنماط الخلفية: تتبّع الكابتن + إشعارات الطلبات الفورية
    UIBackgroundModes:
        '<array>\n\t\t<string>location</string>\n\t\t<string>remote-notification</string>\n\t</array>',

    // 🔐 تصريح التشفير — غيابه يوقف كل بناء عند مرحلة Export Compliance
    ITSAppUsesNonExemptEncryption: '<false/>',

    // 🌍 التطبيق عربي بالكامل — يمنع ظهور اللغة الافتراضية English في App Store
    CFBundleLocalizations: '<array>\n\t\t<string>ar</string>\n\t</array>',
    CFBundleDevelopmentRegion: '<string>ar</string>'
};

function main() {
    if (!fs.existsSync(PLIST)) {
        console.error(`❌ لم يوجد ${PLIST}\n   نفّذ أولاً: npx cap add ios  (على macOS)`);
        process.exit(1);
    }

    const original = fs.readFileSync(PLIST, 'utf8');
    let plist = original;
    const added = [];
    const skipped = [];

    // قالب Capacitor يضع CFBundleDevelopmentRegion = en؛ التطبيق عربي بالكامل
    // فنُصحّح القيمة الموجودة لا نتخطّاها.
    plist = plist.replace(
        /(<key>CFBundleDevelopmentRegion<\/key>\s*<string>)[^<]*(<\/string>)/,
        '$1ar$2'
    );

    for (const [key, value] of Object.entries(KEYS)) {
        if (plist.includes(`<key>${key}</key>`)) {
            skipped.push(key);
            continue;
        }
        // الإدراج قبل </dict></plist> الختامية
        plist = plist.replace(
            /<\/dict>\s*<\/plist>[\s\S]*$/,
            `\t<key>${key}</key>\n\t${value}\n</dict>\n</plist>\n`
        );
        added.push(key);
    }

    if (plist === original) {
        console.log('✅ كل المفاتيح موجودة أصلاً — لا تغيير.');
    } else {
        fs.writeFileSync(PLIST, plist, 'utf8');
        console.log(added.length
            ? `✅ أُضيفت ${added.length} مفاتيح:\n   ${added.join('\n   ')}`
            : '✅ صُحّحت قيم موجودة (بلا مفاتيح جديدة).');
    }
    if (skipped.length) console.log(`↩️  موجودة مسبقاً: ${skipped.join(', ')}`);

    console.log(`
📌 خطوات لا يستطيع السكربت عملها (تحتاج Xcode):
   1. Signing & Capabilities ← أضف: Push Notifications، Background Modes
      (Location updates + Remote notifications)، Associated Domains
      (applinks:wajeezsd.com و applinks:www.wajeezsd.com)، Sign in with Apple عند إضافته.
   2. انسخ GoogleService-Info.plist (تطبيق iOS من Firebase) إلى ios/App/App/.
   3. أضف URL Scheme = قيمة REVERSED_CLIENT_ID من ذلك الملف (شرط Google Sign-In).
   4. انسخ resources/ios/PrivacyInfo.xcprivacy إلى ios/App/App/ وأضفه للهدف في Xcode.`);
}

main();
