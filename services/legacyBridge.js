/**
 * legacyBridge.js — جسر مؤقت بين تطبيق "وصّلي" القديم والتطبيق الجديد "وجيز".
 *
 * المشكلة: التطبيقان على نفس عنقود MongoDB ونفس مشروع Firebase، لكن قاعدتَي بيانات
 * مختلفتين (الجديد: wassili_v2، القديم: قاعدة منفصلة). لذا طلبات القديم لا تصل للجديد.
 *
 * الحل (مؤقت): نفتح اتصالاً ثانياً (للقراءة فقط) بقاعدة القديم عبر OLD_MONGO_URI،
 * نراقب الطلبات الجديدة كل فترة، ونُشعر أدمن الجديد (حفظ + socket + FCM عبر Firebase المشترك).
 *
 * مُعطّل افتراضياً: لا يعمل إلا عند ضبط OLD_MONGO_URI — فلا يؤثّر على التشغيل العادي.
 */
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { notifyAdmins } = require('../utils/notificationHelper');

const POLL_MS = parseInt(process.env.OLD_BRIDGE_POLL_MS, 10) || 20000; // كل 20 ثانية
let legacyConn = null;
let seen = new Set();
let lastCheck = new Date();

async function startLegacyOrderBridge(app) {
    const uri = process.env.OLD_MONGO_URI;
    if (!uri) {
        logger.info('[LegacyBridge] OLD_MONGO_URI غير مضبوط — الجسر معطّل (طبيعي).');
        return;
    }

    try {
        // اتصال منفصل تماماً عن قاعدة التطبيق الجديد
        legacyConn = mongoose.createConnection(uri, {
            serverSelectionTimeoutMS: 8000,
            // اسم قاعدة القديم اختياري: لو لم يُحدَّد في الرابط نسمح بتجاوزه عبر OLD_MONGO_DB
            ...(process.env.OLD_MONGO_DB ? { dbName: process.env.OLD_MONGO_DB } : {})
        });
        await legacyConn.asPromise();
        logger.info('[LegacyBridge] ✅ تم الاتصال بقاعدة بيانات التطبيق القديم');
    } catch (e) {
        logger.error({ err: e.message }, '[LegacyBridge] ❌ فشل الاتصال بقاعدة القديم — الجسر متوقّف');
        return;
    }

    const ordersCol = legacyConn.collection('orders');

    // تشخيص أوّلي: تأكيد أننا نقرأ القاعدة الصحيحة
    try {
        const total = await ordersCol.estimatedDocumentCount();
        const latest = await ordersCol.find({}).sort({ createdAt: -1 }).limit(1).toArray();
        logger.info({
            dbName: legacyConn.name,
            totalOrders: total,
            latestOrderAt: latest[0]?.createdAt || null
        }, '[LegacyBridge] تشخيص قاعدة القديم');
    } catch (e) {
        logger.warn({ err: e.message }, '[LegacyBridge] تعذّر قراءة تشخيص الطلبات (قد تكون القاعدة/المجموعة باسم مختلف)');
    }

    lastCheck = new Date(); // لا نُشعر بالطلبات القديمة — فقط ما يأتي بعد التشغيل

    const poll = async () => {
        try {
            const since = lastCheck;
            lastCheck = new Date();

            // الطلبات المُنشأة حديثاً فقط (بعد آخر فحص)
            const fresh = await ordersCol
                .find({ createdAt: { $gt: since } })
                .sort({ createdAt: 1 })
                .limit(30)
                .toArray();

            for (const o of fresh) {
                const id = String(o._id);
                if (seen.has(id)) continue;
                seen.add(id);

                const isShop = o.orderType === 'shop';
                const priceTxt = (o.price != null) ? ` بسعر ${o.price} ج.س` : '';
                const cityTxt = o.city ? ` — ${o.city}` : '';

                // إشعار أدمن الجديد (حفظ + socket + FCM عبر Firebase المشترك)
                notifyAdmins(app, {
                    title: 'طلب جديد (تطبيق وصّلي القديم)',
                    message: `وصل طلب ${isShop ? 'محل' : 'توصيل'} من التطبيق القديم${priceTxt}${cityTxt}. يتطلّب متابعة يدوية.`,
                    type: 'legacy_order',
                    relatedId: o._id
                });
                logger.info({ orderId: id }, '[LegacyBridge] أُشعر الأدمن بطلب من التطبيق القديم');
            }

            // حدّ ذاكرة seen
            if (seen.size > 2000) seen = new Set([...seen].slice(-800));
        } catch (e) {
            logger.error({ err: e.message }, '[LegacyBridge] خطأ أثناء الفحص الدوري');
        }
    };

    setInterval(poll, POLL_MS);
    logger.info({ everyMs: POLL_MS }, '[LegacyBridge] بدأت مراقبة طلبات التطبيق القديم');
}

module.exports = { startLegacyOrderBridge };
