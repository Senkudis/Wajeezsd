/**
 * 🩹 لمّ شمل طلبات المتاجر العالقة — سكربت تشغيل يدوي.
 *
 * المشكلة التي يعالجها: قبل الإصلاح كان المجدول يُلغي طلب التوصيل بعد ست
 * ساعات عبر findByIdAndUpdate، ولأن خطّاف المزامنة كان على save() وحده لم
 * يصل الإلغاء إلى ShopOrder. النتيجة: طلبات حالتها ready_for_pickup («جاري
 * البحث عن كابتن» عند التاجر والعميل) بينما طلب توصيلها ملغى — فلا يراها
 * كابتن ولا تظهر في الطلبات الحيّة.
 *
 * الإصلاح منع تكرارها، لكنه لا يُصلح ما علِق قبله. هذا السكربت يُصلحه.
 *
 * ⚠️ العرض أولاً افتراضياً — لا يكتب شيئاً بلا --apply:
 *
 *     node scripts/fix-orphaned-shop-orders.js              # عرض فقط
 *     node scripts/fix-orphaned-shop-orders.js --apply      # تنفيذ
 *     node scripts/fix-orphaned-shop-orders.js --apply --city=PortSudan
 *
 * ⚠️ .env المحلي يشير إلى قاعدة الإنتاج — شغّله وأنت تقصد الإنتاج.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const cityArg = (process.argv.find(a => a.startsWith('--city=')) || '').split('=')[1] || null;

const LIVE = ['pending', 'scheduled', 'accepted', 'picked_up'];

async function main() {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) { console.error('✖ لا يوجد MONGO_URI في البيئة'); process.exit(1); }

    await mongoose.connect(uri);
    console.log('✔ متصل بالقاعدة\n');

    const ShopOrder = require('../models/ShopOrder');
    const Order = require('../models/Order');
    const Place = require('../models/Place');
    require('../models/User');

    const ready = await ShopOrder.find({ status: 'ready_for_pickup' })
        .populate('client', 'name phone city')
        .populate('place', 'name address phone location defaultDeliveryFee')
        .sort({ createdAt: 1 })
        .lean();

    if (!ready.length) { console.log('لا توجد طلبات في حالة "جاهز للاستلام".'); return finish(); }

    const alive = await Order.find({
        shopOrderId: { $in: ready.map(s => s._id) },
        status: { $in: LIVE }
    }).select('shopOrderId').lean();
    const aliveSet = new Set(alive.map(o => String(o.shopOrderId)));

    let orphans = ready.filter(so => !aliveSet.has(String(so._id)));
    if (cityArg) orphans = orphans.filter(so => (so.client && so.client.city) === cityArg);

    console.log(`إجمالي "جاهز للاستلام": ${ready.length}`);
    console.log(`منها عالقة (بلا طلب توصيل حيّ): ${orphans.length}\n`);
    if (!orphans.length) return finish();

    for (const so of orphans) {
        const age = Math.round((Date.now() - new Date(so.createdAt)) / 3600000);
        console.log(`  • ${so.place ? so.place.name : '؟'} — ${so.client ? so.client.name : '؟'} ` +
            `(${(so.client && so.client.city) || '؟'}) — منذ ${age} ساعة — ${String(so._id).slice(-6)}`);
    }
    console.log('');

    if (!APPLY) {
        console.log('— عرضٌ فقط. أعِد التشغيل مع --apply للتنفيذ. —');
        return finish();
    }

    const { republishShopOrder } = require('../utils/shopDelivery');
    let done = 0, failed = 0;

    for (const so of orphans) {
        try {
            const doc = await ShopOrder.findById(so._id);
            const place = so.place ? await Place.findById(so.place._id) : null;
            if (!place) { console.log(`  ✖ ${String(so._id).slice(-6)}: متجره غير موجود`); failed++; continue; }

            const r = await republishShopOrder(doc, place);
            if (r.created) {
                await ShopOrder.updateOne({ _id: doc._id }, { $set: { lastCaptainNudgeAt: new Date() } });
                console.log(`  ✔ ${String(so._id).slice(-6)} → طلب توصيل ${String(r.order._id).slice(-6)} (${r.order.city})`);
                done++;
            } else {
                console.log(`  – ${String(so._id).slice(-6)}: ${r.reason}`);
            }
        } catch (e) {
            console.log(`  ✖ ${String(so._id).slice(-6)}: ${e.message}`);
            failed++;
        }
    }

    console.log(`\nأُعيد رفع ${done} طلب، وفشل ${failed}.`);
    console.log('⚠️ الكباتن لم يُنبَّهوا من هنا — نبّههم من زر "تنبيه الكباتن" في اللوحة.');
    return finish();
}

function finish() { return mongoose.disconnect().then(() => console.log('\n✔ انتهى')); }

main().catch(e => { console.error('✖', e.message); process.exit(1); });
