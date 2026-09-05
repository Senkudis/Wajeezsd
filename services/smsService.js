const axios = require('axios');
const logger = require('../utils/logger');
const errorTracker = require('../utils/errorTracker');

/**
 * 📩 إرسال رسالة قصيرة عبر BRQ SMS.
 *
 * ⚠️ الفخّ الذي أسقط إرسال الـ OTP كلّه بلا أثر:
 *
 * بوّابة BRQ تُعيد **HTTP 200 حتى على الفشل**، والخطأ يأتي في جسم الردّ:
 *     {"status":"error","message":"Unauthenticated."}
 *     {"status":"error","message":"Insufficient balance"}
 *
 * وaxios لا يرمي على 200، فكان الكود يقرأ `response.data.message` — أي **نصّ
 * الخطأ** — ويسجّله في حقلٍ اسمه `result` تحت عنوان «SMS sent» وبمستوى info:
 *
 *     logger.info({ result: response.data.message || 'Success' }, '[BRQSMS] SMS sent')
 *
 * فرصيدٌ نفد أو توكنٌ انتهى يظهر في السجل كنجاح. والمسار المُستدعي يُطلق
 * الوعد ويمضي (`.catch` لا يُستدعى لأن لا رمي) ثم يقول للعميل «راجع هاتفك».
 * ثلاث طبقات تُبلّغ نجاحاً على فشل — ولذلك «توقّفت من نفسها» بلا خطأ يُرى.
 *
 * الآن: نفحص `status` في الجسم، ونرمي على الفشل، ونسجّل في ErrorLog ليظهر
 * في لوحة الإدارة بدل أن يُدفن في سجلّ نصّي لا يقرأه أحد.
 */

// أسماء الحالات التي تعني نجاحاً في ردّ BRQ. ما عداها فشل.
const OK_STATUSES = ['success', 'ok', 'sent', 'queued'];

function isSuccessBody(data) {
    if (!data || typeof data !== 'object') return false;
    // بعض المسارات لا تُرجع status إطلاقاً عند النجاح — نقبلها ما لم تُعلن خطأً
    if (data.status === undefined || data.status === null) return true;
    return OK_STATUSES.includes(String(data.status).toLowerCase());
}

async function sendSmsOTP(phone, message) {
    // 🔑 توكن غائب = فشلٌ مؤكّد. نكشفه هنا بدل أن نرسل طلباً نعرف أنه
    //    سيُرفض ثم نُفسّر ردّاً غامضاً.
    if (!process.env.BRQSMS_TOKEN) {
        const err = new Error('BRQSMS_TOKEN غير مضبوط — لا يمكن إرسال الرسائل القصيرة');
        logger.error({ phone }, '[BRQSMS] missing token');
        errorTracker.record({ message: err.message, statusCode: 503, path: 'sms/otp' });
        throw err;
    }

    try {
        const payload = {
            recipient: phone,
            sender_id: 'Wajeezsd',
            type: 'plain',
            message: message
        };

        const response = await axios.post('https://dash.brqsms.com/api/v3/sms/send', payload, {
            headers: {
                'Authorization': `Bearer ${process.env.BRQSMS_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            // ⏱️ بلا مهلة كان الطلب قد يعلّق إلى الأبد ويُبقي العميل ينتظر كوداً
            timeout: 15000
        });

        // ✅ الفحص الذي كان غائباً: 200 لا يعني إرسالاً
        if (!isSuccessBody(response.data)) {
            const reason = (response.data && (response.data.message || response.data.error))
                || 'رفضت البوّابة الرسالة بلا سبب معلن';
            const err = new Error(`BRQSMS رفض الإرسال: ${reason}`);
            err.providerBody = response.data;
            throw err;
        }

        logger.info({ phone, result: response.data?.message || 'sent' }, '[BRQSMS] SMS sent');
        return response.data;

    } catch (err) {
        const detail = err.providerBody || err?.response?.data || err.message;
        logger.error({ phone, err: detail }, '[BRQSMS] SMS send FAILED');

        // 📋 يظهر في لوحة أخطاء الإدارة — فشلُ الـ OTP حادثةٌ تشغيلية
        //    (رصيد، توكن، معرّف مُرسِل محظور) لا يجوز أن تُكتشف من شكاوى العملاء.
        errorTracker.record({
            message: `[BRQSMS] فشل إرسال OTP: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`,
            statusCode: err?.response?.status || 502,
            path: 'sms/otp'
        });
        throw err;
    }
}

module.exports = { sendSmsOTP, isSuccessBody };
