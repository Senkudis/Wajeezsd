#!/usr/bin/env node
/**
 * 💾 نسخ احتياطي لقاعدة البيانات.
 *
 * لماذا بلا `mongodump`: أدوات MongoDB الرسمية ليست مثبَّتة على الخادم،
 * والاعتماد عليها يعني نسخةً احتياطية لا تعمل يوم تحتاجها. هذا السكربت
 * لا يحتاج إلا ما يحتاجه التطبيق نفسه — سائق mongo الذي يجيء مع mongoose.
 *
 * الصيغة: سطرٌ لكل مستند بـ Extended JSON **القانوني** (relaxed: false)
 * مضغوطاً بـ gzip. القانوني لا المُرتاح: المُرتاح يكتب ObjectId نصّاً
 * والتاريخ نصّاً، فتعود النسخة بأنواعٍ غير أنواعها — وهي نسخةٌ تكذب.
 *
 * كل مجموعة في ملفٍ وحدها، ومعها manifest.json فيه العدد والحجم وبصمة
 * sha256 لكل ملف. الاستعادة ترفض أي ملفٍ لا تطابق بصمته، فالنسخة المقطوعة
 * (انقطع الاتصال في منتصفها) تُكتشف قبل أن تُكتب فوق شيء.
 *
 *   node scripts/backup-db.js                  نسخة كاملة إلى backups/
 *   node scripts/backup-db.js --dry-run        يعدّ ولا يكتب شيئاً
 *   node scripts/backup-db.js --only orders,users
 *   node scripts/backup-db.js --out D:/wajeez-backups --keep 30
 *
 * ⚠️ الملف الناتج فيه بيانات مستخدمين حقيقية (أرقام هواتف، عناوين،
 *    بصمات كلمات مرور). عامله معاملة السرّ: خارج المستودع، وعلى قرصٍ
 *    مشفَّر، ولا يُرسل في محادثة.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const DEFAULT_KEEP = 14;
const SYSTEM_PREFIX = 'system.';

/* ─── دوالّ نقيّة (مفحوصة في tests/dbBackup.test.js) ─────────────── */

function parseArgs(argv) {
    const args = { out: null, only: null, dryRun: false, keep: DEFAULT_KEEP, quiet: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run') args.dryRun = true;
        else if (a === '--quiet') args.quiet = true;
        else if (a === '--out') args.out = argv[++i];
        else if (a === '--only') args.only = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
        else if (a === '--keep') args.keep = Number(argv[++i]);
        else throw new Error(`خيار غير معروف: ${a}`);
    }
    if (!Number.isInteger(args.keep) || args.keep < 1) {
        throw new Error('--keep يجب أن يكون عدداً صحيحاً ≥ 1');
    }
    if (args.only && !args.only.length) throw new Error('--only بلا أسماء مجموعات');
    return args;
}

/** اسم المجلد: مرتَّبٌ أبجدياً = مرتَّبٌ زمنياً، وصالحٌ اسماً على ويندوز. */
function stampFor(date) {
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`
        + `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
}

/** مجلدات النسخ وحدها — لا يُحذف ما ليس نسخةً وقع في المجلد صدفةً. */
function isBackupDirName(name) {
    return /^\d{4}-\d{2}-\d{2}T\d{6}Z$/.test(name);
}

/**
 * ما يُحذف عند تطبيق سياسة الإبقاء. الأحدث يبقى دائماً، والمجلد الناقص
 * (بلا manifest أو غير مكتمل) لا يُحتسب ضمن المُبقى — وإلا حذفت نسخةً
 * سليمة لتُبقي على أخرى مقطوعة.
 */
function pruneList(entries, keep) {
    const usable = entries.filter(e => e.complete).map(e => e.name).sort().reverse();
    const kept = new Set(usable.slice(0, keep));
    return entries
        .map(e => e.name)
        .filter(n => !kept.has(n))
        .sort();
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

/* ─── التنفيذ ───────────────────────────────────────────────────── */

async function dumpCollection(db, name, destFile) {
    const { EJSON } = require('bson');
    const cursor = db.collection(name).find({}, { noCursorTimeout: false }).batchSize(500);
    let count = 0;

    // مولِّدٌ يدفع سطراً لكل مستند: لا تُحمَّل المجموعة كلها في الذاكرة
    async function* lines() {
        for await (const doc of cursor) {
            count++;
            yield EJSON.stringify(doc, { relaxed: false }) + '\n';
        }
    }

    await pipeline(Readable.from(lines()), zlib.createGzip({ level: 6 }), fs.createWriteStream(destFile));
    return count;
}

async function run(argv) {
    const args = parseArgs(argv);
    const log = args.quiet ? () => {} : (...a) => console.log(...a);

    require('dotenv').config();
    const uri = process.env.MONGO_URI;
    if (!uri || !uri.trim()) {
        console.error('✗ MONGO_URI غير مضبوط — لا شيء لنسخه');
        process.exitCode = 1;
        return null;
    }

    const mongoose = require('mongoose');
    // ⚠️ لا يُطبع الـ URI في أي سطر: فيه كلمة مرور القاعدة
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    const db = mongoose.connection.db;
    const dbName = mongoose.connection.name;

    const root = path.resolve(args.out || path.join(__dirname, '..', 'backups'));
    const startedAt = new Date();
    const stamp = stampFor(startedAt);
    const dir = path.join(root, stamp);

    let names = (await db.listCollections({}, { nameOnly: true }).toArray())
        .map(c => c.name)
        .filter(n => !n.startsWith(SYSTEM_PREFIX))
        .sort();

    if (args.only) {
        const missing = args.only.filter(n => !names.includes(n));
        if (missing.length) {
            console.error(`✗ مجموعات غير موجودة: ${missing.join(', ')}`);
            await mongoose.disconnect();
            process.exitCode = 1;
            return null;
        }
        names = args.only;
    }

    log(`قاعدة: ${dbName} — ${names.length} مجموعة`);

    if (args.dryRun) {
        let total = 0;
        for (const n of names) {
            const c = await db.collection(n).estimatedDocumentCount();
            total += c;
            log(`  ${String(c).padStart(8)}  ${n}`);
        }
        log(`الإجمالي التقريبي: ${total} مستند — (--dry-run: لم يُكتب شيء)`);
        await mongoose.disconnect();
        return { dryRun: true, db: dbName, collections: names.length, docs: total };
    }

    fs.mkdirSync(dir, { recursive: true });

    const collections = [];
    let failed = null;
    for (const n of names) {
        const file = path.join(dir, `${n}.ndjson.gz`);
        try {
            const count = await dumpCollection(db, n, file);
            const bytes = fs.statSync(file).size;
            collections.push({ name: n, count, bytes, sha256: await sha256File(file) });
            log(`  ✓ ${n} — ${count} مستند، ${(bytes / 1024).toFixed(0)}KB`);
        } catch (err) {
            failed = `${n}: ${err.message}`;
            console.error(`  ✗ ${n} — ${err.message}`);
            break;
        }
    }

    const manifest = {
        format: 'wajeez-backup/1',
        db: dbName,
        appVersion: require('../package.json').version,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        // ⚠️ هذه الراية هي ما تقرأه الاستعادة وسياسة الإبقاء: نسخةٌ انقطعت
        //    في منتصفها تبقى على القرص لكنها لا تُحتسب ولا تُستعاد.
        complete: !failed,
        error: failed,
        collections
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    await mongoose.disconnect();

    if (failed) {
        console.error(`✗ النسخة ناقصة — ${dir}`);
        process.exitCode = 1;
        return manifest;
    }

    const docs = collections.reduce((s, c) => s + c.count, 0);
    const bytes = collections.reduce((s, c) => s + c.bytes, 0);
    log(`✓ ${docs} مستند في ${(bytes / 1048576).toFixed(1)}MB → ${dir}`);

    // سياسة الإبقاء
    const entries = fs.readdirSync(root, { withFileTypes: true })
        .filter(d => d.isDirectory() && isBackupDirName(d.name))
        .map(d => {
            let complete = false;
            try {
                complete = JSON.parse(fs.readFileSync(path.join(root, d.name, 'manifest.json'), 'utf8')).complete === true;
            } catch (_) { /* بلا manifest = ناقصة */ }
            return { name: d.name, complete };
        });
    for (const name of pruneList(entries, args.keep)) {
        fs.rmSync(path.join(root, name), { recursive: true, force: true });
        log(`  · حُذفت نسخة قديمة: ${name}`);
    }

    return manifest;
}

module.exports = { parseArgs, stampFor, isBackupDirName, pruneList, run };

if (require.main === module) {
    run(process.argv.slice(2)).catch(err => {
        console.error(`✗ ${err.message}`);
        process.exit(1);
    });
}
