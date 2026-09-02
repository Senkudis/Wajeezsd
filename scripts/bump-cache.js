#!/usr/bin/env node
/**
 * 🔄 أتمتة كسر الكاش (cache-busting)
 *
 * المشكلة: كان يجب رفع نسخة `?v=` على كل ملف JS/CSS + رفع CACHE_NAME في
 * service-worker.js يدوياً مع كل تعديل — ونسيانها يترك الأجهزة على نسخة قديمة.
 *
 * الحل: هذا السكربت يجعل النسخة = بصمة محتوى الملف (content hash). فتتغيّر
 * النسخة تلقائياً فقط عندما يتغيّر الملف فعلاً، ولا تحتاج أي ترقيم يدوي.
 *
 * ماذا يفعل:
 *   1. يحسب بصمة (md5 مختصرة) لكل ملف في public_html/js و public_html/css.
 *   2. يعيد كتابة `?v=` لكل مرجع js/*.js و css/*.css في ملفات HTML لتساوي البصمة.
 *   3. يضبط CACHE_NAME في service-worker.js إلى بصمة مجمّعة لكل ملفات الـ precache
 *      (فيُبطِل الـ SW الكاش القديم تلقائياً عند تغيّر أي أصل مخزَّن).
 *
 * الاستخدام:  node scripts/bump-cache.js       (أو: npm run cache)
 *            node scripts/bump-cache.js --check  (لا يكتب؛ يخرج بكود 1 إن لزم تحديث)
 *
 * السكربت idempotent: تشغيله بلا تغييرات لا يعدّل أي شيء.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'public_html');
const SW_PATH = path.join(ROOT, 'service-worker.js');
const CHECK_ONLY = process.argv.includes('--check');

const shortHash = (buf) => crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);

// 1) بصمة كل ملف JS/CSS محلي (المسار كما يُكتب في HTML → البصمة)
function hashAssets() {
    const map = {};
    for (const dir of ['js', 'css']) {
        const abs = path.join(ROOT, dir);
        if (!fs.existsSync(abs)) continue;
        for (const name of fs.readdirSync(abs)) {
            if (!/\.(js|css)$/.test(name)) continue;
            const rel = `${dir}/${name}`;
            map[rel] = shortHash(fs.readFileSync(path.join(abs, name)));
        }
    }
    return map;
}

// 2) إعادة كتابة ?v= في ملفات HTML لتساوي بصمة الملف المرجعي
function rewriteHtml(assetHashes) {
    const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
    // يطابق: src|href="js/xxx.js" أو "css/xxx.css" مع ?v= اختياري
    const re = /(src|href)="((?:js|css)\/[^"?]+\.(?:js|css))(\?v=[^"]*)?"/g;
    let changedFiles = 0, changedRefs = 0;

    for (const file of htmlFiles) {
        const abs = path.join(ROOT, file);
        let html = fs.readFileSync(abs, 'utf8');
        let fileChanged = false;

        html = html.replace(re, (match, attr, asset, oldV) => {
            const hash = assetHashes[asset];
            if (!hash) return match; // ملف غير موجود على القرص — اتركه كما هو
            const want = `${attr}="${asset}?v=${hash}"`;
            if (want !== match) { fileChanged = true; changedRefs++; }
            return want;
        });

        if (fileChanged) {
            changedFiles++;
            if (!CHECK_ONLY) fs.writeFileSync(abs, html);
        }
    }
    return { changedFiles, changedRefs };
}

// 3) ضبط CACHE_NAME إلى بصمة مجمّعة لكل ملفات الـ precache المذكورة في SW
function bumpServiceWorker(assetHashes) {
    if (!fs.existsSync(SW_PATH)) return { changed: false };
    let sw = fs.readFileSync(SW_PATH, 'utf8');

    // 📄 بصمات صفحات HTML أيضاً — لا بصمات js/css وحدها.
    //
    // العطل الذي يُغلقه هذا: كان CACHE_NAME مشتقاً من js/ و css/ فقط، بينما
    // العامل الخدمي يخزّن صفحات HTML كذلك (precache + تخزين كل استجابة HTML
    // ناجحة). فتعديلٌ داخل سكربتٍ مضمَّن في صفحة — وهو نمط شائع هنا، إذ أغلب
    // منطق الصفحات مكتوب داخلها — لا يغيّر الاسم إطلاقاً، فتبقى النسخة القديمة
    // في ذاكرة الجهاز إلى الأبد.
    //
    // الأثر محدود بالوضع دون اتصال (استراتيجية HTML هي Network-First، فالمتصل
    // يحصل على الجديد دائماً)، لكن «محدود» ليس «معدوماً»: مستخدمٌ فتح التطبيق
    // بلا شبكة كان يرى صفحةً من إصدارٍ مضى.
    const htmlHashes = {};
    for (const name of fs.readdirSync(ROOT)) {
        if (!name.endsWith('.html')) continue;
        htmlHashes[name] = shortHash(fs.readFileSync(path.join(ROOT, name)));
    }

    // نجمع بصمات كل الأصول (js/css/html) لتكوين بصمة إصدار واحدة للـ SW
    const all = { ...assetHashes, ...htmlHashes };
    const combined = shortHash(Object.keys(all).sort().map(k => k + ':' + all[k]).join('|'));
    const newName = `wajeez-static-${combined}`;

    const m = sw.match(/const CACHE_NAME = '([^']+)'/);
    if (!m) { console.warn('⚠️  لم يُعثر على CACHE_NAME في service-worker.js'); return { changed: false }; }
    if (m[1] === newName) return { changed: false, name: newName };

    sw = sw.replace(/const CACHE_NAME = '[^']+'/, `const CACHE_NAME = '${newName}'`);
    if (!CHECK_ONLY) fs.writeFileSync(SW_PATH, sw);
    return { changed: true, name: newName, old: m[1] };
}

// ── تشغيل ──
const assetHashes = hashAssets();
const html = rewriteHtml(assetHashes);
const sw = bumpServiceWorker(assetHashes);

const needsUpdate = html.changedRefs > 0 || sw.changed;

if (CHECK_ONLY) {
    if (needsUpdate) {
        console.log(`❌ الكاش يحتاج تحديثاً: ${html.changedRefs} مرجع + ${sw.changed ? 'SW' : 'SW محدَّث'}. شغّل: npm run cache`);
        process.exit(1);
    }
    console.log('✓ الكاش محدَّث — لا تغييرات مطلوبة');
    process.exit(0);
}

console.log(`✓ تم تحديث الكاش:`);
console.log(`  • ${html.changedRefs} مرجع ?v= في ${html.changedFiles} ملف HTML`);
if (sw.changed) console.log(`  • service-worker: ${sw.old} → ${sw.name}`);
else console.log(`  • service-worker: ${sw.name || 'دون تغيير'}`);
if (!needsUpdate) console.log('  (كل شيء كان محدَّثاً أصلاً)');
