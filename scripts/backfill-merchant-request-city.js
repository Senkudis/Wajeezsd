/**
 * 🌍 ملء مدينة طلبات انضمام المتاجر.
 *
 * حقل `city` أُضيف إلى MerchantRequest لأن الطلبات كانت الكيانَ الوحيد
 * غير المقيَّد بمدينة — فأدمنٌ مساعد معيَّن على مدينةٍ يرى متقدّمي
 * السودان كلّه: أسماءهم وهواتفهم وأرقام حساباتهم وصور هوياتهم.
 *
 * والطلبات القائمة بلا الحقل تأخذ `default: 'Khartoum'` — وهو تخمينٌ
 * يجعل طلبات بورتسودان تظهر للخرطوم ولا تظهر لأهلها. فتُملأ من دليل:
 *
 *   ١) إحداثيات المتجر في الطلب (cityFromCoords) — أقوى دليل.
 *   ٢) فإن غابت: مدينة المتجر الذي أُنشئ من الطلب.
 *   ٣) فإن غاب: مدينة حساب صاحبه.
 *   ٤) وإلا تُترك ويُبلَّغ عنها — لا نُخمّن.
 *
 * يعمل بلا كتابةٍ افتراضياً. للتطبيق: --apply
 *
 *   node scripts/backfill-merchant-request-city.js
 *   node scripts/backfill-merchant-request-city.js --apply
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

(async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('MONGO_URI غير مضبوط');
        process.exit(1);
    }

    await mongoose.connect(uri);
    const db = mongoose.connection;
    console.log(`قاعدة البيانات: ${db.name}`);
    console.log(APPLY ? '⚠️  وضع التطبيق — ستُكتب التغييرات\n' : 'وضع المعاينة — لا كتابة (أضف --apply للتطبيق)\n');

    const { cityFromCoords } = require('../utils/geofence');
    const requests = db.collection('merchantrequests');
    const places = db.collection('places');
    const users = db.collection('users');

    const rows = await requests.find({}).toArray();
    const tally = { coords: 0, place: 0, owner: 0, unknown: 0, alreadySet: 0 };
    const byCity = {};
    const unresolved = [];
    const ops = [];

    for (const r of rows) {
        // حقلٌ مضبوطٌ فعلاً (صالح) لا يُلمس
        if (r.city === 'Khartoum' || r.city === 'PortSudan') {
            // ⚠️ الافتراضي 'Khartoum' يُطبَّق على القراءة في مونجوس لا في
            //    القاعدة، فالمستند القديم لا يحمل الحقل أصلاً — نفحص الخام.
            if (Object.prototype.hasOwnProperty.call(r, 'city')) {
                tally.alreadySet++;
                byCity[r.city] = (byCity[r.city] || 0) + 1;
                continue;
            }
        }

        let city = null;
        let source = null;

        const lat = Number(r.location && r.location.lat);
        const lng = Number(r.location && r.location.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            city = cityFromCoords(lat, lng);
            if (city) source = 'coords';
        }

        if (!city && r.userId) {
            const place = await places.findOne({ owner: r.userId }, { projection: { city: 1 } });
            if (place && (place.city === 'Khartoum' || place.city === 'PortSudan')) {
                city = place.city;
                source = 'place';
            }
        }

        if (!city && r.userId) {
            const owner = await users.findOne({ _id: r.userId }, { projection: { city: 1 } });
            if (owner && (owner.city === 'Khartoum' || owner.city === 'PortSudan')) {
                city = owner.city;
                source = 'owner';
            }
        }

        if (!city) {
            tally.unknown++;
            unresolved.push({ id: String(r._id), name: r.businessName || '(بلا اسم)' });
            continue;
        }

        tally[source]++;
        byCity[city] = (byCity[city] || 0) + 1;
        ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: { city } } } });
    }

    console.log(`إجمالي الطلبات: ${rows.length}`);
    console.log(`  مضبوطة مسبقاً : ${tally.alreadySet}`);
    console.log(`  من الإحداثيات : ${tally.coords}`);
    console.log(`  من المتجر     : ${tally.place}`);
    console.log(`  من حساب صاحبه : ${tally.owner}`);
    console.log(`  تعذّر تحديدها : ${tally.unknown}`);
    console.log(`\nالتوزيع الناتج: ${JSON.stringify(byCity)}`);

    if (unresolved.length) {
        console.log('\n⚠️ طلباتٌ بلا دليلٍ على مدينتها — تُترك بلا حقل ولن تظهر');
        console.log('   لأي أدمنٍ مساعد حتى تُضبط يدوياً من اللوحة:');
        unresolved.forEach(u => console.log(`   • ${u.name} (${u.id})`));
    }

    if (!ops.length) {
        console.log('\nلا تغييرات.');
    } else if (!APPLY) {
        console.log(`\nسيُحدَّث ${ops.length} طلباً. أعد التشغيل بـ --apply للتطبيق.`);
    } else {
        const res = await requests.bulkWrite(ops, { ordered: false });
        console.log(`\n✅ حُدِّث ${res.modifiedCount} طلباً.`);
    }

    await mongoose.disconnect();
})().catch(err => {
    console.error('خطأ:', err.message);
    process.exit(1);
});
