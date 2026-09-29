/**
 * 🌍 ملء مدينة تذاكر الدعم.
 *
 * حقل `city` أُضيف إلى Complaint ليرى الأدمن المساعد تذاكر مدينته وحدها —
 * كانت مسارات التذاكر تعرض السودان كلّه لأيّ أدمن. التذاكر الأقدم بلا الحقل
 * تبقى للأدمن الرئيسيّ وحده حتى تُملأ من دليل:
 *
 *   ١) مدينة الطلب المرتبط (Order أو ShopOrder) — أقوى دليل.
 *   ٢) فإن غاب: مدينة حساب العميل.
 *   ٣) وإلا تُترك ويُبلَّغ عنها — لا نُخمّن.
 *
 * يعمل بلا كتابةٍ افتراضياً. للتطبيق: --apply
 *
 *   node scripts/backfill-complaint-city.js
 *   node scripts/backfill-complaint-city.js --apply
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const CITIES = ['Khartoum', 'PortSudan'];

(async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('MONGO_URI غير مضبوط');
        process.exit(1);
    }

    await mongoose.connect(uri);
    const db = mongoose.connection;
    console.log(`قاعدة البيانات: ${db.name}`);
    console.log(APPLY ? 'وضع التطبيق — ستُكتب التغييرات\n' : 'وضع المعاينة — لا كتابة (أضف --apply للتطبيق)\n');

    const complaints = db.collection('complaints');
    const orders = db.collection('orders');
    const shopOrders = db.collection('shoporders');
    const users = db.collection('users');

    const rows = await complaints.find({ city: { $nin: CITIES } }).toArray();
    const tally = { order: 0, client: 0, unknown: 0 };
    const byCity = {};
    const ops = [];

    for (const c of rows) {
        let city = null;
        if (c.orderId) {
            const coll = c.orderModel === 'ShopOrder' ? shopOrders : orders;
            const o = await coll.findOne({ _id: c.orderId }, { projection: { city: 1 } });
            if (o && CITIES.includes(o.city)) { city = o.city; tally.order++; }
        }
        if (!city && c.client) {
            const u = await users.findOne({ _id: c.client }, { projection: { city: 1 } });
            if (u && CITIES.includes(u.city)) { city = u.city; tally.client++; }
        }
        if (!city) {
            tally.unknown++;
            console.log(`  بلا دليل: تذكرة ${c._id}`);
            continue;
        }
        byCity[city] = (byCity[city] || 0) + 1;
        ops.push({ updateOne: { filter: { _id: c._id, city: { $nin: CITIES } }, update: { $set: { city } } } });
    }

    console.log(`تذاكر بلا مدينة: ${rows.length}`);
    console.log(`  من الطلب المرتبط: ${tally.order}`);
    console.log(`  من حساب العميل:   ${tally.client}`);
    console.log(`  بلا دليل (تُترك): ${tally.unknown}`);
    console.log('  التوزيع:', byCity);

    if (APPLY && ops.length) {
        const r = await complaints.bulkWrite(ops, { ordered: false });
        console.log(`\nكُتب: ${r.modifiedCount}`);
    }
    await mongoose.disconnect();
})().catch(async (err) => {
    console.error(err);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
});
