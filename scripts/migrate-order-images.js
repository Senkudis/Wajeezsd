/**
 * 🖼️ ترحيل صور الطلبات القديمة من Base64 (داخل المستند) إلى ملفات.
 *
 * الخلفية: قبل تحويل الرفع لملفات، كانت صور الطلبات تُخزَّن base64 (~500KB)
 *   داخل مستند الطلب، فتضخّم القاعدة وتبطئ الاستعلامات. هذا السكربت يحوّل
 *   البيانات القديمة إلى ملفات ويستبدل الحقل بالرابط (نفس ما يفعله الكود للجديد).
 *
 * يغطّي:
 *   - orders.parcelImage        → /uploads/parcels
 *   - orders.receiptImage       → /uploads/proofs
 *   - shoporders.paymentReceiptImage → /uploads/proofs
 *
 * آمن وقابل للتكرار (idempotent): يتخطّى أي حقل لا يبدأ بـ "data:image"
 *   (المحوّل مسبقاً أو الفارغ)، ولا يلمس الطلبات الحديثة.
 *
 * ⚠️ يعمل على قاعدة الإنتاج (MONGO_URI في .env). شغّل المعاينة أولاً.
 *
 * الاستخدام:
 *   node scripts/migrate-order-images.js            → معاينة فقط (Dry run)
 *   node scripts/migrate-order-images.js --apply    → تطبيق فعلي
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { saveBase64ToUploads } = require('../utils/imageUpload');

const APPLY = process.argv.includes('--apply');
const isBase64 = (v) => typeof v === 'string' && v.startsWith('data:image');

// يحوّل حقول صور محدّدة في مجموعة، ويُرجع عدد المُحوَّل والفاشل
async function migrateCollection(coll, fields) {
    // فلتر: أي مستند فيه حقل واحد على الأقل يبدأ بـ data:image
    const or = fields.map(f => ({ [f.name]: { $regex: '^data:image' } }));
    const cursor = coll.find({ $or: or });

    let converted = 0, failed = 0, docs = 0;
    for await (const doc of cursor) {
        const update = {};
        for (const f of fields) {
            const val = doc[f.name];
            if (!isBase64(val)) continue;
            const url = saveBase64ToUploads(val, f.subdir);
            if (url) {
                update[f.name] = url;
                converted++;
                console.log(`  ✓ ${coll.collectionName}/${doc._id} · ${f.name} (${Math.round(val.length / 1024)}KB) → ${url}`);
            } else {
                failed++;
                console.log(`  ✗ ${coll.collectionName}/${doc._id} · ${f.name}: تعذّر التحويل (محتوى غير صالح) — يُترك كما هو`);
            }
        }
        if (Object.keys(update).length) {
            docs++;
            if (APPLY) await coll.updateOne({ _id: doc._id }, { $set: update });
        }
    }
    return { converted, failed, docs };
}

(async () => {
    console.log(`\n🖼️  ترحيل صور الطلبات — الوضع: ${APPLY ? '✍️  تطبيق فعلي' : '👁️  معاينة فقط'}\n`);
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    const orders = await migrateCollection(db.collection('orders'), [
        { name: 'parcelImage',  subdir: 'parcels' },
        { name: 'receiptImage', subdir: 'proofs' }
    ]);
    const shop = await migrateCollection(db.collection('shoporders'), [
        { name: 'paymentReceiptImage', subdir: 'proofs' }
    ]);

    const totalConv = orders.converted + shop.converted;
    const totalFail = orders.failed + shop.failed;
    console.log(`\n${APPLY ? '✅ حُوِّل' : '👁️  سيُحوَّل'} ${totalConv} حقل صورة في ${orders.docs + shop.docs} مستند.`);
    if (totalFail) console.log(`⚠️  ${totalFail} حقل تعذّر تحويله (محتوى غير صالح) — تُرك كما هو.`);
    if (!APPLY && totalConv > 0) console.log('   شغّل بـ --apply للتنفيذ الفعلي.\n');

    await mongoose.disconnect();
    process.exit(0);
})().catch(err => { console.error('❌', err); process.exit(1); });
