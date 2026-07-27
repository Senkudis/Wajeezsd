/**
 * 🔢 فاحص تزامن رقم الإصدار.
 *
 * لماذا: رقم الإصدار مكرَّر في ثلاثة ملفات، ولا شيء كان يربطها. عند إصدار 1.0.8 بُمّط
 * package.json و build.gradle ونُسي APP_VERSION في app-core.js — وهو **الرقم الوحيد الذي
 * يُقارَن فعلاً** في AppCore.checkForUpdates(). النتيجة الصامتة: تطبيق يقول عن نفسه إنه
 * 1.0.7 بينما هو 1.0.8، فيظهر لمستخدميه تنبيه «تحديث متاح» لنسخة هم مثبّتوها أصلاً.
 *
 * الاستخدام:
 *   node scripts/check-version.js          → يتحقق فقط (يخرج بـ 1 عند الاختلاف)
 *   node scripts/check-version.js --set X  → يضبط الثلاثة على X (وينبّه لـ versionCode)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PKG      = path.join(ROOT, 'package.json');
const GRADLE   = path.join(ROOT, 'android/app/build.gradle');
const APP_CORE = path.join(ROOT, 'public_html/js/app-core.js');

// 🍎 مشروع iOS (يُنشأ بـ cap add ios على macOS) — رابع موضع لرقم الإصدار.
// غيابه طبيعي على ويندوز فنتخطّاه، لكن وجوده بقيمة مختلفة انحراف صامت آخر.
const PBXPROJ = path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj');

const read = (f) => fs.readFileSync(f, 'utf8');

function currentVersions() {
    const gradle = read(GRADLE);
    const core   = read(APP_CORE);
    const out = {
        'package.json':              JSON.parse(read(PKG)).version,
        'build.gradle (versionName)': (gradle.match(/versionName\s+"([^"]+)"/) || [])[1],
        'app-core.js (APP_VERSION)':  (core.match(/window\.APP_VERSION\s*=\s*'([^']+)'/) || [])[1]
    };
    if (fs.existsSync(PBXPROJ)) {
        out['iOS (MARKETING_VERSION)'] = (read(PBXPROJ).match(/MARKETING_VERSION = ([^;]+);/) || [])[1];
    }
    return out;
}

/**
 * 🔎 أرقام إصدار مكتوبة يدوياً داخل HTML.
 * لماذا: هذا الفاحص كان يقرأ ثلاثة ملفات فقط، وHTML يعرض للمستخدم رقماً آخر تماماً
 * (1.4.1 في الرئيسية و2.0.0 في ملف الكابتن بينما التطبيق 1.0.9) — انحراف صامت لأن
 * لا شيء كان يقرأه. البديل الصحيح: <span data-app-version> يملؤه app-core.js.
 */
function hardcodedInHtml() {
    const dir = path.join(ROOT, 'public_html');
    const hits = [];
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.html')); } catch (_) { return hits; }

    for (const f of files) {
        const src = read(path.join(dir, f));
        const re = /(الإصدار|إصدار التطبيق)\s*[:：]?\s*(\d+\.\d+\.\d+)/g;
        let m;
        while ((m = re.exec(src))) hits.push({ file: `public_html/${f}`, version: m[2] });
    }
    return hits;
}

const setTo = process.argv.includes('--set')
    ? process.argv[process.argv.indexOf('--set') + 1]
    : null;

if (setTo) {
    if (!/^\d+\.\d+\.\d+$/.test(setTo)) {
        console.error(`❌ صيغة إصدار غير صالحة: ${setTo} (المتوقع x.y.z)`);
        process.exit(1);
    }
    fs.writeFileSync(PKG, read(PKG).replace(/("version":\s*)"[^"]+"/, `$1"${setTo}"`));
    fs.writeFileSync(GRADLE, read(GRADLE).replace(/(versionName\s+)"[^"]+"/, `$1"${setTo}"`));
    fs.writeFileSync(APP_CORE, read(APP_CORE).replace(/(window\.APP_VERSION\s*=\s*)'[^']+'/, `$1'${setTo}'`));
    console.log(`✓ تم ضبط الإصدار على ${setTo} في الملفات الثلاثة.`);
    if (fs.existsSync(PBXPROJ)) {
        fs.writeFileSync(PBXPROJ, read(PBXPROJ).replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${setTo};`));
        console.log('✓ وضُبط MARKETING_VERSION في مشروع iOS أيضاً.');
        console.log('⚠️ CURRENT_PROJECT_VERSION (build number) يجب رفعه يدوياً — App Store يرفض إعادة رفع نفس الرقم.');
    }
    const code = (read(GRADLE).match(/versionCode\s+(\d+)/) || [])[1];
    console.log(`⚠️ versionCode الحالي = ${code} — ارفعه يدوياً في build.gradle قبل بناء APK جديد.`);
    console.log('⚠️ ولا تنسَ ضبط «أحدث إصدار» في لوحة الأدمن، وإلا لن يُبلَّغ المستخدمون بالتحديث.');
    process.exit(0);
}

const v = currentVersions();
const values = Object.values(v);
const same = values.every(x => x && x === values[0]);

for (const [file, val] of Object.entries(v)) {
    console.log(`  ${same ? '✓' : (val === values[0] ? ' ' : '✗')} ${file.padEnd(28)} ${val || '(غير موجود!)'}`);
}

if (!same) {
    console.error('\n❌ أرقام الإصدار غير متزامنة. صحّحها بـ: node scripts/check-version.js --set x.y.z');
    process.exit(1);
}

// رقمٌ مكتوب يدوياً في HTML لا يتحرّك مع --set، فينحرف بصمت ويراه المستخدم
const hard = hardcodedInHtml();
if (hard.length) {
    console.error('\n❌ أرقام إصدار مكتوبة يدوياً في HTML (لن تتحدّث مع --set):');
    for (const h of hard) console.error(`   ${h.file}  →  ${h.version}`);
    console.error('   استبدلها بـ: <span data-app-version></span>');
    process.exit(1);
}

console.log(`\n✓ الإصدار متزامن: ${values[0]}`);
console.log('✓ لا أرقام إصدار مكتوبة يدوياً في HTML');
