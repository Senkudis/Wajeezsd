/**
 * 📈 قياس المنتج — عدّادات مسارٍ يومية.
 *
 * مبدأ واحد يحكم هذا الملف: **القياس لا يعطّل شيئاً**. كل نداء هنا «أطلق
 * وانسَ» بلا await في مسار الاستجابة ومغلَّف بـ try/catch. عطلٌ في القياس
 * لا يجوز أن يمنع عميلاً من إنشاء طلب.
 *
 * والأسماء مقفلة في قائمة: حدثٌ بخطأٍ مطبعي كان سيُكتب في وثيقةٍ بحقلٍ
 * غير موجود في المخطّط، فيسقط صامتاً — فتبقى اللوحة تقول صفراً وتُقرأ
 * «لا أحد يفعل هذا» بينما الحقيقة «لا أحد يقيسه».
 */

const logger = require('./logger');

/** الأحداث المقبولة — مطابقةٌ لحقول models/DailyStat.js */
const EVENTS = Object.freeze([
    'registerStarted', 'registerCompleted', 'otpSent', 'otpVerified',
    'storeOpened', 'orderCreated', 'orderAccepted', 'orderDelivered', 'orderCancelled',
    'captainSignup', 'merchantRequest'
]);

const CITIES = Object.freeze(['Khartoum', 'PortSudan']);

/** مدينةٌ مجهولة تُجمع تحت اسمٍ واحد بدل أن تنفجر الوثائق بقيمٍ عشوائية. */
function normalizeCity(city) {
    return CITIES.includes(city) ? city : 'unknown';
}

/**
 * يبني كائن الزيادة، أو null إن كان الحدث مجهولاً.
 * مفصولٌ ونقيّ ليُفحَص بلا قاعدة: هنا يقع خطأ الاسم المطبعي.
 */
function buildIncrement(event) {
    if (!EVENTS.includes(event)) return null;
    return { [event]: 1 };
}

/**
 * يسجّل حدثاً واحداً. لا يرمي ولا يُنتظَر.
 * @param {string} event من EVENTS
 * @param {object} [opts]
 * @param {string} [opts.city]
 */
function track(event, { city } = {}) {
    const inc = buildIncrement(event);
    if (!inc) {
        // الصراخ هنا مقصود: العدّاد الصامت أسوأ من غيابه
        logger.error({ event }, 'analytics: حدث غير معروف — أضفه إلى EVENTS و DailyStat');
        return;
    }

    Promise.resolve()
        .then(async () => {
            const DailyStat = require('../models/DailyStat');
            await DailyStat.updateOne(
                { day: DailyStat.today(), city: normalizeCity(city) },
                { $inc: inc },
                { upsert: true }
            );
        })
        .catch(e => logger.warn({ err: e.message, event }, 'analytics track failed'));
}

/**
 * يحوّل صفوف الأيام إلى مسارٍ بنِسَبه.
 * النسبة تُحسب على الخطوة السابقة لا على القمّة: «كم من فتح متجراً طلب»
 * سؤالٌ غير «كم من سجّل طلب»، وخلطهما يخفي أين يقع التسرّب فعلاً.
 */
function summarize(rows) {
    const sum = {};
    for (const e of EVENTS) sum[e] = 0;
    for (const r of rows || []) {
        for (const e of EVENTS) sum[e] += Number(r[e]) || 0;
    }

    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

    return {
        totals: sum,
        funnels: {
            register: {
                started: sum.registerStarted,
                completed: sum.registerCompleted,
                completionRate: pct(sum.registerCompleted, sum.registerStarted)
            },
            otp: {
                sent: sum.otpSent,
                verified: sum.otpVerified,
                verifyRate: pct(sum.otpVerified, sum.otpSent)
            },
            order: {
                storeOpened: sum.storeOpened,
                created: sum.orderCreated,
                accepted: sum.orderAccepted,
                delivered: sum.orderDelivered,
                cancelled: sum.orderCancelled,
                // كلٌّ على سابقتها: هكذا يظهر موضع التسرّب
                openToOrder: pct(sum.orderCreated, sum.storeOpened),
                orderToAccept: pct(sum.orderAccepted, sum.orderCreated),
                acceptToDeliver: pct(sum.orderDelivered, sum.orderAccepted),
                cancelRate: pct(sum.orderCancelled, sum.orderCreated)
            }
        }
    };
}

module.exports = { track, buildIncrement, summarize, normalizeCity, EVENTS, CITIES };
