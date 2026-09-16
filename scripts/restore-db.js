#!/usr/bin/env node
/**
 * ♻️ استعادة من نسخةٍ احتياطية.
 *
 * نسخةٌ لم تُجرَّب استعادتها ليست نسخة. لكن سكربت استعادةٍ يكتب على
 * الإنتاج بسطرٍ واحد هو خطرٌ أكبر من العطل الذي يعالجه — فالافتراضي هنا
 * أن يُستعاد إلى **قاعدةٍ جديدة** بجانب الحيّة، تفحصها ثم تقرّر.
 *
 *   node scripts/restore-db.js --from backups/2026-09-16T101500Z
 *       يطبع الخطّة ولا يكتب شيئاً (بلا --yes لا كتابة أبداً)
 *
 *   node scripts/restore-db.js --from <dir> --yes
 *       يكتب في <db>_restore_<stamp> — لا يمسّ القاعدة الحيّة
 *
 *   الكتابة فوق القاعدة الحيّة تحتاج أربعة أشياء معاً، عمداً:
 *       --in-place --yes --confirm-db <اسم القاعدة بالحرف>
 *       وبيئة WAJEEZ_ALLOW_INPLACE_RESTORE=1
 *
 * وقبل أي كتابة تُفحص بصمة sha256 لكل ملف: النسخة المقطوعة أو المعبوث
 * بها تُرفض كاملةً، لا أن تُكتشف في منتصف الاستعادة.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const readline = require('readline');

const INPLACE_ENV = 'WAJEEZ_ALLOW_INPLACE_RESTORE';

/* ─── دوالّ نقيّة (مفحوصة في tests/dbBackup.test.js) ─────────────── */

function parseArgs(argv) {
    const args = {
        from: null, only: null, yes: false, inPlace: false,
        confirmDb: null, drop: false, to: null
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--yes') args.yes = true;
        else if (a === '--in-place') args.inPlace = true;
        else if (a === '--drop') args.drop = true;
        else if (a === '--from') args.from = argv[++i];
        else if (a === '--to') args.to = argv[++i];
        else if (a === '--confirm-db') args.confirmDb = argv[++i];
        else if (a === '--only') args.only = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
        else throw new Error(`خيار غير معروف: ${a}`);
    }
    if (!args.from) throw new Error('--from مطلوب: مجلد النسخة');
    return args;
}

/**
 * تقرّر الوجهة وتشرح سببها، أو ترمي بسببٍ مفهوم. كل حارسٍ هنا يمنع
 * حادثةً بعينها، لا «احتياطاً عاماً».
 */
function planRestore({ manifest, args, env = process.env, stamp = 'now' }) {
    if (!manifest || manifest.format !== 'wajeez-backup/1') {
        throw new Error('مجلدٌ ليس نسخةً احتياطية لهذا المشروع (manifest.format)');
    }
    if (manifest.complete !== true) {
        throw new Error(`النسخة ناقصة — انقطعت عند: ${manifest.error || 'سبب غير مسجَّل'}`);
    }

    let names = manifest.collections.map(c => c.name);
    if (args.only) {
        const missing = args.only.filter(n => !names.includes(n));
        if (missing.length) throw new Error(`ليست في النسخة: ${missing.join(', ')}`);
        names = args.only;
    }

    if (!args.inPlace) {
        // الوجهة الآمنة: قاعدةٌ جديدة بجانب الحيّة
        const target = args.to || `${manifest.db}_restore_${stamp}`;
        if (target === manifest.db) {
            throw new Error('--to يساوي القاعدة الحيّة — استعمل --in-place صراحةً إن كان هذا مقصودك');
        }
        return { target, inPlace: false, drop: true, collections: names, write: args.yes };
    }

    // الكتابة فوق الحيّة: أربعة حرّاس، كلٌّ منها يُغلق باباً
    if (args.to) throw new Error('--to و --in-place لا يجتمعان');
    if (env[INPLACE_ENV] !== '1') {
        throw new Error(`الكتابة فوق القاعدة الحيّة تحتاج ${INPLACE_ENV}=1 في البيئة`);
    }
    if (!args.confirmDb) throw new Error('--confirm-db مطلوب مع --in-place');
    if (args.confirmDb !== manifest.db) {
        throw new Error(`--confirm-db لا يطابق قاعدة النسخة (${manifest.db})`);
    }
    if (!args.yes) throw new Error('--yes مطلوب مع --in-place');

    return { target: manifest.db, inPlace: true, drop: args.drop, collections: names, write: true };
}

function sha256File(file) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(file)
            .on('error', reject)
            .on('data', d => h.update(d))
            .on('end', () => resolve(h.digest('hex')));
    });
}

async function verifyFiles(dir, manifest, names) {
    const bad = [];
    for (const c of manifest.collections) {
        if (!names.includes(c.name)) continue;
        const file = path.join(dir, `${c.name}.ndjson.gz`);
        if (!fs.existsSync(file)) { bad.push(`${c.name}: الملف مفقود`); continue; }
        if (fs.statSync(file).size !== c.bytes) { bad.push(`${c.name}: الحجم لا يطابق`); continue; }
        if (await sha256File(file) !== c.sha256) bad.push(`${c.name}: البصمة لا تطابق`);
    }
    return bad;
}

/** يقرأ ملف مجموعةٍ ويعيد المستندات — يُستعمل أيضاً للتحقّق بلا قاعدة. */
async function readDocs(file) {
    const { EJSON } = require('bson');
    const rl = readline.createInterface({
        input: fs.createReadStream(file).pipe(zlib.createGunzip()),
        crlfDelay: Infinity
    });
    const out = [];
    for await (const line of rl) {
        if (line.trim()) out.push(EJSON.parse(line, { relaxed: false }));
    }
    return out;
}

/* ─── التنفيذ ───────────────────────────────────────────────────── */

async function run(argv) {
    const args = parseArgs(argv);
    const dir = path.resolve(args.from);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error(`لا manifest.json في ${dir}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
    const plan = planRestore({ manifest, args, stamp });

    console.log(`النسخة: ${manifest.db} · ${manifest.startedAt} · ${plan.collections.length} مجموعة`);
    console.log(`الوجهة: ${plan.target}${plan.inPlace ? '  ⚠️ القاعدة الحيّة' : '  (قاعدة جديدة)'}`);

    console.log('فحص البصمات…');
    const bad = await verifyFiles(dir, manifest, plan.collections);
    if (bad.length) {
        console.error('✗ النسخة لا يُوثق بها — لم يُكتب شيء:');
        bad.forEach(b => console.error(`   ${b}`));
        process.exitCode = 1;
        return null;
    }
    console.log('✓ كل الملفات مطابقة');

    if (!plan.write) {
        console.log('\n(بلا --yes: هذه خطّة فقط، لم يُكتب شيء)');
        return plan;
    }

    require('dotenv').config();
    const uri = process.env.MONGO_URI;
    if (!uri || !uri.trim()) throw new Error('MONGO_URI غير مضبوط');

    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    const db = mongoose.connection.client.db(plan.target);

    let total = 0;
    for (const name of plan.collections) {
        const docs = await readDocs(path.join(dir, `${name}.ndjson.gz`));
        if (plan.drop) await db.collection(name).deleteMany({});
        for (let i = 0; i < docs.length; i += 500) {
            const chunk = docs.slice(i, i + 500);
            if (chunk.length) await db.collection(name).insertMany(chunk, { ordered: false });
        }
        total += docs.length;
        console.log(`  ✓ ${name} — ${docs.length} مستند`);
    }

    await mongoose.disconnect();
    console.log(`✓ استُعيد ${total} مستند في ${plan.target}`);
    return plan;
}

module.exports = { parseArgs, planRestore, verifyFiles, readDocs, run, INPLACE_ENV };

if (require.main === module) {
    run(process.argv.slice(2)).catch(err => {
        console.error(`✗ ${err.message}`);
        process.exit(1);
    });
}
