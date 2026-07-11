/**
 * ينسخ كل المجموعات (collections) من قاعدة الإنتاج `test` إلى قاعدة الاختبار
 * `wassili_v2` على نفس الـ cluster — لإنشاء بيئة اختبار آمنة معزولة.
 *
 * آمن: لا يكتب أبداً في `test`. يستبدل محتوى `wassili_v2` فقط.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const SOURCE = 'test';          // الإنتاج (قراءة فقط)
const TARGET = 'wassili_v2';    // الاختبار (يُكتب فيه)

(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const client = mongoose.connection.client;
    const src = client.db(SOURCE);
    const dst = client.db(TARGET);

    // حارس أمان: لا تسمح أبداً بالكتابة في الإنتاج
    if (TARGET === SOURCE) throw new Error('SAFETY: target must differ from source');

    const collections = await src.listCollections().toArray();
    console.log(`📦 Cloning ${collections.length} collections: ${SOURCE} → ${TARGET}\n`);

    for (const c of collections) {
        if (c.type === 'view') { console.log(`   ⏭️  skip view ${c.name}`); continue; }
        const docs = await src.collection(c.name).find({}).toArray();

        // أفرغ المجموعة الهدف ثم انسخ
        await dst.collection(c.name).deleteMany({});
        if (docs.length) {
            // إدراج على دفعات لتفادي حدود الحجم
            const BATCH = 500;
            for (let i = 0; i < docs.length; i += BATCH) {
                await dst.collection(c.name).insertMany(docs.slice(i, i + BATCH), { ordered: false });
            }
        }
        console.log(`   ✅ ${c.name}: ${docs.length} docs`);
    }

    // تحقق سريع
    const usersCount = await dst.collection('users').countDocuments();
    const adminsCount = await dst.collection('users').countDocuments({ role: 'admin' });
    console.log(`\n🎯 Done. ${TARGET} now has ${usersCount} users (${adminsCount} admins).`);

    await mongoose.disconnect();
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
