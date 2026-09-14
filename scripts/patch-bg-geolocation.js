#!/usr/bin/env node
/**
 * 🩹 توسيع مدى Capacitor في إضافة التتبّع الخلفي.
 *
 * `@capacitor-community/background-geolocation@1.2.26` تعلن في Package.swift:
 *
 *     .package(url: "…/capacitor-swift-pm.git", from: "7.0.0")
 *
 * و`from:` في SwiftPM تعني `7.0.0 ..< 8.0.0`. ومشروعنا على Capacitor 8،
 * فيفشل حلّ التبعيات قبل أن تبدأ الترجمة أصلاً:
 *
 *     'background-geolocation' depends on 'capacitor-swift-pm' 7.0.0..<8.0.0
 *     and 'toast' depends on 'capacitor-swift-pm' 8.0.0..<9.0.0
 *
 * الإضافة نفسها لا تستعمل شيئاً تغيّر بين 7 و8 (CAPPlugin وCAPPluginCall)،
 * والمانع هو المدى المعلَن لا الشفرة. فنوسّعه.
 *
 * لماذا سكربت لا تعديلٌ يدوي: `node_modules` لا يُرفع، وبيئة البناء تُنشئها
 * بـ `npm ci` في كل مرّة — فأي تعديل باليد يضيع. يُستدعى من postinstall.
 *
 * يعمل بلا أثر إن غابت الإضافة أو كان المدى موسَّعاً أصلاً.
 */
const fs = require('fs');
const path = require('path');

const PKG = path.join(
    __dirname, '..', 'node_modules',
    '@capacitor-community', 'background-geolocation', 'Package.swift'
);

// المدى المطلوب: من 7 حتى ما قبل 9 — يقبل Capacitor 7 و8 معاً
const FROM = 'from: "7.0.0"';
const TO = '"7.0.0"..<"9.0.0"';

function main() {
    if (!fs.existsSync(PKG)) return;   // الإضافة غير مثبّتة — لا شيء نفعله

    const src = fs.readFileSync(PKG, 'utf8');
    if (src.includes(TO)) return;      // مُرقَّعة أصلاً

    if (!src.includes(FROM)) {
        // تغيّر المنبع: نقولها بوضوح بدل ترقيعٍ صامت على نصٍّ لا نعرفه
        console.warn('⚠️  patch-bg-geolocation: لم يُعثر على المدى المتوقّع في Package.swift — '
            + 'راجع الإضافة، قد تكون حدّثت دعمها لـ Capacitor 8 فيُحذف هذا السكربت.');
        return;
    }

    fs.writeFileSync(PKG, src.replace(FROM, TO), 'utf8');
    console.log('🩹 patch-bg-geolocation: وُسّع مدى capacitor-swift-pm ليقبل 8.x');
}

main();
