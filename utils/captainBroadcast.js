/**
 * 📣 بثّ الطلبات لكباتن مدينةٍ واحدة — مصدرٌ واحد لكل من ينادي الكباتن.
 *
 * لماذا: نداء الكباتن مكرَّر في أربعة مواضع (تجهيز التاجر للطلب، وتذكيره،
 * وتذكير الأدمن، وشبكة أمان المجدول)، وفي كلٍّ منها **حصرُ المدينة** مكتوبٌ
 * يدوياً. كفى أن يُنسى الحصر في موضع واحد حتى يصل طلبُ الخرطوم لكباتن
 * بورتسودان — ولا يظهر الخطأ في أي اختبار، بل كطلبٍ لا يقبله أحد.
 * هنا يُكتب الحصر مرّة، ويرثه كل نداء.
 */

const logger = require('./logger');

const VALID_CITIES = ['Khartoum', 'PortSudan'];

/** يطبّع اسم المدينة — أي قيمة غريبة تعود للخرطوم بدل أن تُفلت من الحصر */
function normalizeCity(city) {
    return VALID_CITIES.includes(city) ? city : 'Khartoum';
}

/**
 * يُشعر كباتن مدينةٍ واحدة بطلبٍ متاح (سوكِت + إشعار مدفوع).
 *
 * @param {object} app تطبيق express (لقراءة io)
 * @param {object} p
 * @param {string} p.city مدينة الطلب — الحصر يقوم عليها
 * @param {string} p.title عنوان الإشعار
 * @param {string} p.body نصّ الإشعار
 * @param {object} [p.data] حمولة الإشعار (type، orderId، url…)
 * @param {string} [p.socketEvent] اسم حدث السوكِت لغرفة المدينة
 * @param {object} [p.socketPayload] حمولة حدث السوكِت
 * @param {string|null} [p.excludeCaptainId] كابتن يُستثنى (اعتذر عن الطلب مثلاً)
 * @returns {Promise<{targeted:number, city:string}>} كم كابتناً وصله الإشعار
 */
async function notifyCityCaptains(app, {
    city, title, body, data = {},
    socketEvent = null, socketPayload = null,
    excludeCaptainId = null
} = {}) {
    const orderCity = normalizeCity(city);

    // غرفة المدينة أولاً — تصل فوراً لمن يفتح التطبيق الآن
    try {
        const io = app && app.get ? app.get('io') : null;
        if (io && socketEvent) {
            io.to(`room_${orderCity}`).emit(socketEvent, { ...(socketPayload || {}), city: orderCity });
        }
    } catch (e) {
        logger.warn({ err: e.message }, 'captain broadcast socket failed');
    }

    // ثم الإشعار المدفوع لمن التطبيق مغلق عنده
    try {
        const User = require('../models/User');
        const { sendPushToMany } = require('./firebasePush');

        const query = {
            role: 'captain',
            city: orderCity,                    // 🌍 الحصر — لا يُحذف أبداً
            fcmToken: { $exists: true, $ne: null },
            isActive: true
        };
        if (excludeCaptainId) query._id = { $ne: excludeCaptainId };

        const captains = await User.find(query).select('fcmToken').lean();
        // مجموعة: الرمز الواحد قد يتكرّر بين حسابين على نفس الجهاز
        const tokens = [...new Set(captains.map(c => c.fcmToken).filter(Boolean))];
        if (!tokens.length) return { targeted: 0, city: orderCity };

        await sendPushToMany(tokens, title, body, data);
        return { targeted: tokens.length, city: orderCity };
    } catch (e) {
        // فشل الإشعار لا يُسقط العملية التي استدعته (تجهيز طلب، تذكير…)
        logger.error({ err: e.message, city: orderCity }, 'captain push broadcast failed');
        return { targeted: 0, city: orderCity };
    }
}

module.exports = { notifyCityCaptains, normalizeCity, VALID_CITIES };
