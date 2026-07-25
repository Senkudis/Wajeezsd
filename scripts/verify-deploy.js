#!/usr/bin/env node
/**
 * ✅ فاحص النشر — هل ما على السيرفر هو ما عندك؟
 *
 * لماذا: النشر يدوي ملفاً ملفاً، وأخطر أعطاله النشر الجزئي — ملف حُدِّث وآخر لا،
 * فيتصرّف النظام بطرق لا يفسّرها الكود الذي تقرؤه. حدث فعلاً وكلّف يوماً كاملاً:
 * routes/places.js نُشر و utils/placesSearch.js لا، فبدا عطلاً في مفتاح جوجل.
 *
 * يقارن ملفات السيرفر ببصماتها من /api/version، وملفات public_html بتنزيلها.
 *
 * الاستخدام:
 *   node scripts/verify-deploy.js
 *   node scripts/verify-deploy.js https://staging.example.com
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { manifest } = require('../utils/deployManifest');

const BASE = (process.argv[2] || 'https://wajeezsd.com').replace(/\/+$/, '');
const ROOT = path.join(__dirname, '..');

// ملفات الواجهة الحرجة — تُفحص بتنزيلها كما يراها المتصفح تماماً
const PUBLIC_FILES = [
    'js/home.js', 'js/order-feature.js', 'js/maps-loader.js', 'js/app-core.js',
    'js/admin-settings.js', 'service-worker.js',
    'index.html', 'client-order.html', 'captain-missions.html', 'admin-settings.html'
];

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m', bold: '\x1b[1m' };
const line = (color, sym, msg) => console.log(`${color}${sym}${C.reset} ${msg}`);

async function checkServer() {
    const local = manifest();
    let remote;
    try {
        const res = await fetch(`${BASE}/api/version`, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        remote = await res.json();
    } catch (e) {
        line(C.red, '✗', `تعذّر قراءة /api/version من ${BASE} — ${e.message}`);
        console.log(`${C.dim}   إن كان المسار غير موجود أصلاً، فـ index.js نفسه لم يُنشر بعد.${C.reset}`);
        return { ok: false, stale: ['index.js (أو السيرفر لا يعمل)'] };
    }

    if (remote.digest === local.digest) {
        line(C.green, '✓', `ملفات السيرفر مطابقة تماماً (${local.count} ملفاً)`);
        return { ok: true, stale: [] };
    }

    const stale = [], missing = [], extra = [];
    for (const [file, hash] of Object.entries(local.files)) {
        const r = remote.files ? remote.files[file] : undefined;
        if (r === undefined) missing.push(file);
        else if (r !== hash) stale.push(file);
    }
    for (const file of Object.keys(remote.files || {})) {
        if (!(file in local.files)) extra.push(file);
    }

    line(C.red, '✗', `ملفات السيرفر مختلفة${C.reset}`);
    for (const f of stale)   console.log(`   ${C.yellow}قديم على السيرفر${C.reset}  ${f}`);
    for (const f of missing) console.log(`   ${C.red}غير منشور${C.reset}        ${f}`);
    for (const f of extra)   console.log(`   ${C.dim}موجود هناك فقط${C.reset}   ${f}`);
    return { ok: false, stale: [...stale, ...missing] };
}

async function checkPublic() {
    const stale = [];
    for (const rel of PUBLIC_FILES) {
        const abs = path.join(ROOT, 'public_html', rel);
        if (!fs.existsSync(abs)) continue;
        const localHash = sha(fs.readFileSync(abs));
        try {
            // ?_vd لتخطّي أي كاش وسيط — نريد ما يُخدَم فعلاً لا نسخةً محفوظة
            const res = await fetch(`${BASE}/${rel}?_vd=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
            if (!res.ok) { stale.push([rel, `HTTP ${res.status}`]); continue; }
            const remoteHash = sha(Buffer.from(await res.arrayBuffer()));
            if (remoteHash !== localHash) stale.push([rel, 'مختلف']);
        } catch (e) {
            stale.push([rel, e.message]);
        }
    }

    if (!stale.length) {
        line(C.green, '✓', `ملفات الواجهة مطابقة (${PUBLIC_FILES.length} ملفاً)`);
    } else {
        line(C.red, '✗', 'ملفات واجهة غير مطابقة:');
        for (const [f, why] of stale) console.log(`   ${C.yellow}${why}${C.reset}  ${f}`);
    }
    return stale.length === 0;
}

(async () => {
    console.log(`${C.bold}فحص النشر على ${BASE}${C.reset}\n`);
    const server = await checkServer();
    const publicOk = await checkPublic();
    console.log();

    if (server.ok && publicOk) {
        line(C.green, '✓', `${C.bold}كل شيء منشور ومتزامن.${C.reset}`);
        process.exit(0);
    }
    line(C.red, '✗', `${C.bold}النشر ناقص — انشر الملفات أعلاه وأعد تشغيل التطبيق.${C.reset}`);
    console.log(`${C.dim}  تذكير: تعديل ملفات السيرفر لا يسري إلا بعد Restart من لوحة الاستضافة.${C.reset}`);
    process.exit(1);
})();
