/**
 * 🔒 نقل الوثائق الحسّاسة الموجودة إلى المجلد الخاصّ.
 *
 * الرفع الجديد يذهب إلى private_uploads/ مباشرة (utils/privateFiles.js). هذا
 * ينقل ما رُفع قبله: هوية الكابتن وسيلفيه ورخصته، وهوية التاجر في طلبات
 * الانضمام — من public_html/uploads (يخدمه الخادم لكل من يملك الرابط) إلى
 * private_uploads، ويكتب الرابط الخاصّ في قاعدة البيانات.
 *
 * ⚠️ يُشغَّل **على الخادم** حيث الملفات، لا على جهاز التطوير.
 *    ملفٌّ غير موجود يُبلَّغ عنه ويُترك رابطه كما هو — لا يُكتب رابطٌ لا ملف له.
 *
 * يعمل بلا كتابةٍ افتراضياً. للتطبيق: --apply
 *
 *   node scripts/migrate-private-docs.js
 *   node scripts/migrate-private-docs.js --apply
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const ROOT = path.join(__dirname, '..');
const PRIVATE_DIR = path.join(ROOT, 'private_uploads');
const PUBLIC_DIRS = [path.join(ROOT, 'public_html', 'uploads'), path.join(ROOT, 'uploads')];
const DOC_FIELDS = ['idImage', 'selfieImage', 'driverLicense'];

/** مكان الملف القديم على القرص من رابطه (/uploads/<مجلد>/<ملف> أو /api/uploads/...) */
function findLegacy(url) {
    const m = String(url || '').match(/\/uploads\/([a-z]+)\/([A-Za-z0-9_.-]+)$/);
    if (!m) return null;
    for (const base of PUBLIC_DIRS) {
        const p = path.join(base, m[1], m[2]);
        if (fs.existsSync(p)) return p;
    }
    // الخادم يبحث في المجلدات الأخرى إن لم يجده في مجلده (index.js) — نفعل مثله
    for (const base of PUBLIC_DIRS) {
        for (const sub of ['documents', 'proofs', 'profiles', 'places', 'products', 'parcels']) {
            const p = path.join(base, sub, m[2]);
            if (fs.existsSync(p)) return p;
        }
    }
    return undefined;   // رابطٌ قديم بلا ملف
}

function move(src, kind) {
    const name = path.basename(src);
    const dir = path.join(PRIVATE_DIR, kind);
    const dest = path.join(dir, name);
    if (APPLY) {
        fs.mkdirSync(dir, { recursive: true });
        try { fs.renameSync(src, dest); }
        catch (_) { fs.copyFileSync(src, dest); fs.unlinkSync(src); }
    }
    return `/api/files/${kind}/${name}`;
}

(async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) { console.error('MONGO_URI غير مضبوط'); process.exit(1); }
    await mongoose.connect(uri);
    const db = mongoose.connection;
    console.log(`قاعدة البيانات: ${db.name}`);
    console.log(APPLY ? 'وضع التطبيق — ستُنقل الملفات وتُكتب الروابط\n' : 'وضع المعاينة — لا نقل ولا كتابة (أضف --apply)\n');

    const tally = { moved: 0, missing: 0, alreadyPrivate: 0 };

    // ── الكباتن
    const users = db.collection('users');
    const cursor = users.find({ $or: DOC_FIELDS.map(f => ({ [`documents.${f}`]: { $regex: '/uploads/' } })) },
        { projection: { name: 1, documents: 1 } });
    for await (const u of cursor) {
        const set = {};
        for (const f of DOC_FIELDS) {
            const url = u.documents && u.documents[f];
            if (!url) continue;
            if (url.startsWith('/api/files/')) { tally.alreadyPrivate++; continue; }
            const src = findLegacy(url);
            if (!src) { tally.missing++; console.log(`  بلا ملف: ${u._id} ${f} ${url}`); continue; }
            set[`documents.${f}`] = move(src, 'documents');
            tally.moved++;
        }
        if (APPLY && Object.keys(set).length) await users.updateOne({ _id: u._id }, { $set: set });
    }

    // ── هويات التجّار في طلبات الانضمام
    const reqs = db.collection('merchantrequests');
    for await (const r of reqs.find({ idImage: { $regex: '/uploads/' } }, { projection: { idImage: 1 } })) {
        const src = findLegacy(r.idImage);
        if (!src) { tally.missing++; console.log(`  بلا ملف: طلب ${r._id} ${r.idImage}`); continue; }
        const url = move(src, 'merchant-ids');
        tally.moved++;
        if (APPLY) await reqs.updateOne({ _id: r._id }, { $set: { idImage: url } });
    }

    console.log(`\n${APPLY ? 'نُقل' : 'سيُنقل'}: ${tally.moved}`);
    console.log(`بلا ملفٍ على القرص (تُركت): ${tally.missing}`);
    console.log(`خاصّةٌ أصلاً: ${tally.alreadyPrivate}`);
    await mongoose.disconnect();
})().catch(async (err) => {
    console.error(err);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
});
