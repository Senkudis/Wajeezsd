#!/usr/bin/env node
/**
 * 📦 تجهيز أرشيف نشر ميزة بطاقات الفريق.
 *
 * النشر في هذا المشروع يدوي ملفاً ملفاً، وأخطر أعطاله النشر الجزئي — ملف
 * حُدِّث وآخر لا (انظر scripts/verify-deploy.js). هذا السكربت يجمع كل ملفات
 * الميزة في أرشيف واحد بنفس هيكل المجلدات، فيُفَك فوق جذر الموقع مباشرةً بلا
 * اختيار يدوي لأي ملف.
 *
 * يتضمّن حزمة qrcode وتبعياتها داخل node_modules لأنها حزمة جديدة: لو رُفع
 * الكود دون تثبيتها لتعطّل توليد رمز QR (والسيرفر نفسه يبقى قائماً بفضل
 * التحميل الكسول في routes/team.js).
 *
 * الاستعمال: node scripts/pack-team-deploy.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tmp');
const STAGE = path.join(OUT_DIR, 'team-deploy');

/** ملفات الخادم — تُرفع إلى جذر تطبيق Node على الاستضافة. */
const SERVER_FILES = [
    'index.js',
    'models/User.js',
    'routes/team.js',
    'routes/upload.js',
    'utils/teamProfile.js',
    'utils/teamHost.js',
    'scripts/migrate-team-captains.js',
    'package.json',
    'package-lock.json'
];

/** ملفات الواجهة — تُرفع داخل public_html. */
const PUBLIC_FILES = [
    'public_html/admin-team.html',
    'public_html/admin.html',
    'public_html/service-worker.js'
];

/** مجلدات تُنسخ بالكامل. */
const DIRS = ['public_html/team'];

/** الحزمة الجديدة وتبعياتها — تُحسب من شجرة الاعتماد الحقيقية لا يدوياً. */
function resolveDeps(rootPkg) {
    const seen = new Set();
    (function walk(name) {
        if (seen.has(name)) return;
        const pkgPath = path.join(ROOT, 'node_modules', name, 'package.json');
        if (!fs.existsSync(pkgPath)) return;
        seen.add(name);
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        for (const dep of Object.keys(pkg.dependencies || {})) walk(dep);
    })(rootPkg);
    return [...seen];
}

function copyFile(rel) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) throw new Error(`ملف مفقود: ${rel}`);
    const dest = path.join(STAGE, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return fs.statSync(src).size;
}

function copyDir(rel) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) throw new Error(`مجلد مفقود: ${rel}`);
    fs.cpSync(src, path.join(STAGE, rel), { recursive: true });
}

function dirSize(dir) {
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
    }
    return total;
}

const MB = (bytes) => (bytes / 1048576).toFixed(2) + ' MB';

function main() {
    fs.rmSync(STAGE, { recursive: true, force: true });
    fs.mkdirSync(STAGE, { recursive: true });

    console.log('📦 تجهيز أرشيف نشر بطاقات الفريق\n');

    console.log('— ملفات الخادم');
    for (const f of SERVER_FILES) { copyFile(f); console.log('   ✓ ' + f); }

    console.log('\n— ملفات الواجهة');
    for (const f of PUBLIC_FILES) { copyFile(f); console.log('   ✓ ' + f); }

    console.log('\n— مجلدات');
    for (const d of DIRS) {
        copyDir(d);
        const count = fs.readdirSync(path.join(STAGE, d), { recursive: true }).length;
        console.log(`   ✓ ${d}/ (${count} ملف)`);
    }

    console.log('\n— حزمة qrcode وتبعياتها');
    const deps = resolveDeps('qrcode');
    for (const dep of deps) {
        copyDir(path.join('node_modules', dep).replace(/\\/g, '/'));
    }
    console.log(`   ✓ ${deps.length} حزمة: ${deps.join(', ')}`);

    // تعليمات مختصرة داخل الأرشيف نفسه — الأرشيف قد يُفتح بعد أسابيع.
    // الاسم لاتيني عمداً: أسماء الملفات العربية تتشوّه عند الفكّ على أدوات
    // لا تقرأ راية UTF-8 في الأرشيف (المحتوى نفسه عربي بترميز UTF-8 سليم).
    fs.writeFileSync(path.join(STAGE, 'DEPLOY-README.txt'), '﻿' + README_TEXT, 'utf8');

    const zipPath = path.join(OUT_DIR, 'wajeez-team-deploy.zip');
    fs.rmSync(zipPath, { force: true });

    // ⚠️ tar.exe (bsdtar) لا Compress-Archive.
    // Compress-Archive في PowerShell 5.1 يكتب أسماء المدخلات بشرطة مائلة عكسية،
    // وهو مخالف لمواصفة ZIP التي توجب المائلة الأمامية. الأرشيف يبدو سليماً على
    // ويندوز، لكن فكّه على استضافة لينكس يُنتج ملفات اسمها حرفياً
    // "models\User.js" في الجذر بدل مجلدات — نشرٌ فاسد بالكامل يصعب تشخيصه.
    // مسار صريح إلى bsdtar الخاص بويندوز: تشغيل السكربت من Git Bash يجعل `tar`
    // يشير إلى GNU tar الذي لا يعرف `-a` ولا يكتب zip أصلاً.
    const bsdtar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    execFileSync(fs.existsSync(bsdtar) ? bsdtar : 'tar', ['-a', '-c', '-f', zipPath, '-C', STAGE, '.'], { stdio: 'inherit' });

    // تحقّق فوري: أي شرطة عكسية في أسماء المدخلات تعني أرشيفاً غير صالح للنشر
    const raw = fs.readFileSync(zipPath);
    if (raw.includes(Buffer.from('models\\User.js'))) {
        throw new Error('الأرشيف يحوي فواصل مسار عكسية — لا تنشره');
    }

    console.log('\n──────────────────────────────');
    console.log('حجم المحتوى :', MB(dirSize(STAGE)));
    console.log('حجم الأرشيف :', MB(fs.statSync(zipPath).size));
    console.log('المسار      :', zipPath);
}

const README_TEXT = `رفع ميزة بطاقات الفريق — وجيز
================================

فُكّ محتويات هذا الأرشيف فوق جذر التطبيق على الاستضافة مع الإبقاء على
هيكل المجلدات كما هو. الملفات تحلّ محلّ نظيراتها مباشرةً.

ما بداخله
---------
ملفات الخادم        : index.js، models/User.js، routes/team.js، routes/upload.js،
                      utils/teamProfile.js، utils/teamHost.js،
                      scripts/migrate-team-captains.js
الاعتماديات         : package.json، package-lock.json، وnode_modules/qrcode مع تبعياتها
الواجهة             : public_html/admin-team.html (جديد)، admin.html، service-worker.js
موقع الفريق         : public_html/team/ (تطبيق مبني كاملاً)

بعد الرفع
---------
1. أعد تشغيل تطبيق Node من لوحة الاستضافة (ضروري — ملفات الخادم لا تُقرأ إلا عند الإقلاع).
2. إن كانت الاستضافة تتيح "Run NPM Install" فشغّله. غير ذلك فحزمة qrcode مرفقة
   داخل node_modules ولا حاجة لشيء.
3. أنشئ النطاق الفرعي team.wajeezsd.com في cPanel واجعل جذر مستنداته
   هو نفسه جذر تطبيق وجيز (نفس المسار تماماً، لا مجلد جديد).
   لاسم نطاق مختلف اضبط متغيّري البيئة: TEAM_HOSTS و TEAM_BASE_URL.

⚠️ لا ترفع هذا الأرشيف في مجلد النطاق الفرعي. موقع الفريق ليس موقعاً مستقلاً —
   يخدمه تطبيق وجيز نفسه ويقرأ من نفس قاعدة البيانات. مكانه جذر التطبيق فقط.

التحقق بعد الرفع
----------------
- https://wajeezsd.com/api/health          يجب أن يردّ ok
- https://wajeezsd.com/api/team            يجب أن يردّ قائمة الأعضاء
- https://wajeezsd.com/team                يجب أن تفتح صفحة الفريق
- لوحة الأدمن ← "بطاقات الفريق"            يجب أن تعرض الأعضاء وتولّد رمز QR

ملاحظات
-------
- لا شيء يُحذف من قاعدة البيانات. الحقول الجديدة تُضاف تلقائياً عند أول قراءة.
- صفحة الفريق تُبنى من حسابات النظام مباشرةً، فلا إدخال يدوي لأي عضو.
- لنقل بيانات الموقع القديم شغّل على السيرفر:
      node scripts/migrate-team-captains.js --dry-run
  ثم --apply بعد مراجعة المعاينة.
`;

main();
