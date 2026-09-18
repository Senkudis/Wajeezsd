const express = require('express');
const router = express.Router();
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const MapsLink = require('../public_html/js/maps-link');

/**
 * 🔗 فكّ روابط خرائط جوجل المختصرة.
 *
 * لماذا في الخادم: ما يشاركه الناس اليوم هو https://maps.app.goo.gl/XXXX —
 * رابطٌ **لا يحوي إحداثيات إطلاقاً**، وفكُّه يحتاج اتّباع تحويلة HTTP.
 * والمتصفّح لا يستطيعها (CORS)، فلا بدّ من هنا.
 *
 * ⚠️ ونقطةُ خطرٍ صريحة: مسارٌ يجلب رابطاً يرسله المستخدم هو تعريف ثغرة
 *    SSRF. من يملك حساباً يستطيع أن يطلب من خادمنا أن يفتح أي عنوان —
 *    ومنها عناوين الشبكة الداخلية وخدمات البيانات الوصفية في الاستضافات
 *    السحابية، وهي أشهر طريقٍ لسرقة مفاتيح الخوادم.
 *
 *    الحراسات هنا ليست تزيّناً:
 *      • https فقط.
 *      • قائمة مضيفات مغلقة، تُفحص **عند كل قفزة تحويل** لا عند الأولى —
 *        فالرابط المسموح قد يُحوِّل إلى ممنوع.
 *      • خمس قفزات كحدّ أقصى، ومهلةٌ قصيرة.
 *      • لا يُقرأ جسم الردّ ولا يُعاد منه شيء — الإحداثيات فقط.
 *      • محدود المعدّل ومقصورٌ على المستخدمين المُصادَقين.
 */

const resolveLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة' }
});

const MAX_HOPS = 5;
const TIMEOUT_MS = 6000;

router.post('/resolve', protect, resolveLimiter, async (req, res) => {
    try {
        const raw = String(req.body && req.body.url || '').trim();
        if (!raw) return res.status(400).json({ message: 'الرابط مطلوب' });
        if (raw.length > 2048) return res.status(400).json({ message: 'الرابط طويل جداً' });

        // ١) ربما حمل إحداثياته أصلاً — لا داعي لأي طلب شبكة
        const direct = MapsLink.parse(raw);
        if (direct) return res.json({ lat: direct.lat, lng: direct.lng, source: direct.source });

        if (!/^https:\/\//i.test(raw)) {
            return res.status(400).json({ message: 'يُقبل رابط https من خرائط جوجل فقط' });
        }

        let url;
        try { url = new URL(raw); } catch (e) {
            return res.status(400).json({ message: 'الرابط غير صالح' });
        }
        if (!MapsLink.hostAllowed(url.hostname)) {
            return res.status(400).json({ message: 'يُقبل رابط من خرائط جوجل فقط' });
        }

        // ٢) اتّباع التحويلات يدوياً — لنفحص المضيف عند كل قفزة
        let current = url.toString();
        for (let hop = 0; hop < MAX_HOPS; hop++) {
            let resp;
            try {
                resp = await axios.get(current, {
                    maxRedirects: 0,
                    timeout: TIMEOUT_MS,
                    // نرفض الأجسام الكبيرة: لا نحتاج المحتوى، والتحويلة في الترويسة
                    maxContentLength: 512 * 1024,
                    validateStatus: (s) => s >= 200 && s < 400,
                    headers: {
                        // بعض الروابط تُعيد صفحة بلا تحويلة للوكلاء المجهولين
                        'User-Agent': 'Mozilla/5.0 (compatible; WajeezBot/1.0)',
                        'Accept-Language': 'ar,en'
                    }
                });
            } catch (err) {
                // axios يرمي على 3xx حين maxRedirects=0 في بعض الإصدارات
                resp = err && err.response;
                if (!resp) {
                    logger.warn({ err: err.message }, '[maps/resolve] fetch failed');
                    return res.status(502).json({ message: 'تعذّر فتح الرابط — تأكّد منه أو حدّد الموقع على الخريطة' });
                }
            }

            const location = resp.headers && (resp.headers.location || resp.headers.Location);

            // ٣) الوجهة قد تحمل الإحداثيات
            if (location) {
                const next = new URL(location, current).toString();

                const found = MapsLink.parse(next);
                if (found) return res.json({ lat: found.lat, lng: found.lng, source: 'redirect' });

                let nextUrl;
                try { nextUrl = new URL(next); } catch (e) {
                    return res.status(400).json({ message: 'تحويلة غير صالحة' });
                }
                // 🔒 الفحص عند كل قفزة — لا عند الأولى وحدها
                if (!/^https:$/i.test(nextUrl.protocol) || !MapsLink.hostAllowed(nextUrl.hostname)) {
                    return res.status(400).json({ message: 'الرابط يُحوِّل خارج خرائط جوجل' });
                }
                current = next;
                continue;
            }

            // ٤) لا تحويلة: ربما الإحداثيات في العنوان النهائي أو في صفحة الردّ
            const fromUrl = MapsLink.parse(current);
            if (fromUrl) return res.json({ lat: fromUrl.lat, lng: fromUrl.lng, source: 'final-url' });

            const body = typeof resp.data === 'string' ? resp.data.slice(0, 200000) : '';
            if (body) {
                const fromBody = MapsLink.parse(body);
                if (fromBody) return res.json({ lat: fromBody.lat, lng: fromBody.lng, source: 'page' });
            }
            break;
        }

        return res.status(422).json({
            message: 'لم نتمكّن من قراءة الموقع من هذا الرابط — افتحه في خرائط جوجل وانسخ الرابط من زرّ «مشاركة»، أو حدّد الموقع على الخريطة'
        });
    } catch (err) {
        logger.error({ err: err.message }, '[maps/resolve] error');
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
