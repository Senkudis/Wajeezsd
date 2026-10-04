const express = require('express');
const { CITY_KEYS, cityLabel } = require('../config/cities');   // 🌍 المدن — مصدرٌ واحد
const router = express.Router();
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const MapsLink = require('../public_html/js/maps-link');
const { resolvePlaceRef } = require('../utils/placesSearch');

/**
 * 🔗 فكّ روابط خرائط جوجل المختصرة، وإيجاد المحالّ التي تشير إليها.
 *
 * لماذا في الخادم: ما يشاركه الناس اليوم هو https://maps.app.goo.gl/XXXX —
 * رابطٌ **لا يحوي إحداثيات إطلاقاً**، وفكُّه يحتاج اتّباع تحويلة HTTP.
 * والمتصفّح لا يستطيعها (CORS)، فلا بدّ من هنا.
 *
 * 🏪 ورابط **المحلّ** لا يحمل إحداثياته حتى بعد الفكّ: يُحوِّل إلى
 *    /maps/place/اسم+المحل/data=!4m2!3m1!1s0x…:0x… — اسمٌ ومعرّف. فنجده
 *    عبر Places API (utils/placesSearch › resolvePlaceRef).
 *
 * ⛔ ولا نقرأ جسم صفحة جوجل. كان هذا المسار يبحث فيها عن إحداثيات، وهي
 *    تُرسَم بجافاسكربت في المتصفّح: الخادم يتلقّى **مركز الخريطة
 *    الافتراضيّ** لا موقع المحل. قيس ذلك على ثلاثة أشكالٍ لرابط محلٍّ
 *    واحد (place/data، و?cid=، و?q=&ftid=) فأعادت كلّها النقطة نفسها في أم
 *    درمان، على بُعد كيلومترات من المحل. موقعٌ معقولٌ وخاطئ يصل الكابتن
 *    إليه ولا يجد أحداً — أسوأ من رسالة «تعذّر».
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
const VALID_CITIES = CITY_KEYS;

const PLACE_NOT_FOUND = 'لم نجد موقع هذا المحل تلقائياً. افتحه في خرائط جوجل واضغط مطوّلاً على مكانه لإسقاط دبوس ثم شارك الدبوس — أو حدّد الموقع على الخريطة';

/**
 * صفحة الموافقة على ملفّات الارتباط (للزوّار من بعض الدول) تقف بين الرابط
 * ووجهته: consent.google.com/ml?continue=<الوجهة>. الوجهة في المعامل نفسه،
 * فنقرؤها بدل اتّباع صفحةٍ لا تحويلة فيها — وتمرّ بفحص المضيف كأيّ قفزة.
 */
function unwrapConsent(u) {
    if (!/^consent\.google\./i.test(u.hostname)) return null;
    const cont = u.searchParams.get('continue');
    if (!cont) return null;
    try { return new URL(cont); } catch (e) { return null; }
}

router.post('/resolve', protect, resolveLimiter, async (req, res) => {
    try {
        const raw = String(req.body && req.body.url || '').trim();
        if (!raw) return res.status(400).json({ message: 'الرابط مطلوب' });
        if (raw.length > 2048) return res.status(400).json({ message: 'الرابط طويل جداً' });

        // ١) ربما حمل إحداثياته أصلاً — لا داعي لأي طلب شبكة
        const direct = MapsLink.parse(raw);
        if (direct) return res.json({ lat: direct.lat, lng: direct.lng, source: direct.source });

        // النصّ قد يكون بطاقة مشاركة كاملة: «الاسم ⏎ العنوان ⏎ الرابط».
        // ما حول الرابط دليلٌ على المحل إن لم يحمل الرابط اسمه.
        const link = MapsLink.extractUrl(raw) || raw;
        const hint = String(req.body && req.body.hint || '').trim().slice(0, 200) || MapsLink.shareHint(raw);
        // مدينة البحث: ما يرسله التطبيق (المدينة المعروضة — قد تكون مؤقتة لطلبٍ
        // لقريبٍ في مدينةٍ أخرى)، وإلا مدينة الحساب. كانت مدينة الحساب وحدها،
        // فرابط محلٍّ في عطبرة من حسابٍ في الخرطوم يُبحث عنه في الخرطوم.
        const city = VALID_CITIES.includes(req.body && req.body.city) ? req.body.city
            : VALID_CITIES.includes(req.user && req.user.city) ? req.user.city : 'Khartoum';

        // رابطٌ طويل يسمّي محلاً — لا حاجة لفتحه أصلاً
        let ref = MapsLink.placeRef(link);

        if (!ref) {
            if (!/^https:\/\//i.test(link)) {
                return res.status(400).json({ message: 'يُقبل رابط https من خرائط جوجل فقط' });
            }

            let url;
            try { url = new URL(link); } catch (e) {
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
                        // لا نحتاج المحتوى — التحويلة في الترويسة. والحدّ يمنع
                        // أن يُستعمل المسار لتنزيل ملفّاتٍ ضخمة.
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
                if (!location) {
                    // ٣) لا تحويلة: الإحداثيات أو المحلّ في العنوان النهائيّ وحده
                    //    (لا في جسم الصفحة — انظر رأس الملف).
                    const fromUrl = MapsLink.parse(current);
                    if (fromUrl) return res.json({ lat: fromUrl.lat, lng: fromUrl.lng, source: 'final-url' });
                    ref = MapsLink.placeRef(current);
                    break;
                }

                let nextUrl;
                try { nextUrl = new URL(location, current); } catch (e) {
                    return res.status(400).json({ message: 'تحويلة غير صالحة' });
                }
                // صفحة الموافقة: الوجهة في معاملها — نقفز إليها مباشرةً
                nextUrl = unwrapConsent(nextUrl) || nextUrl;
                const next = nextUrl.toString();

                // ٤) الوجهة قد تحمل الإحداثيات (الدبوس) أو اسم المحل (المكان)
                const found = MapsLink.parse(next);
                if (found) return res.json({ lat: found.lat, lng: found.lng, source: 'redirect' });

                // 🔒 الفحص عند كل قفزة — لا عند الأولى وحدها
                if (!/^https:$/i.test(nextUrl.protocol) || !MapsLink.hostAllowed(nextUrl.hostname)) {
                    return res.status(400).json({ message: 'الرابط يُحوِّل خارج خرائط جوجل' });
                }

                // وصلنا رابط المحل: اسمه ومعرّفه — لا حاجة لقفزةٍ أخرى
                ref = MapsLink.placeRef(next);
                if (ref) break;
                current = next;
            }
        }

        // ٥) رابط محلٍّ بلا إحداثيات ← Places API
        if (ref) {
            let place = null;
            try {
                place = await resolvePlaceRef({ ...ref, hint, city });
            } catch (err) {
                if (err.message === 'PLACES_KEY_MISSING') {
                    logger.error('[maps/resolve] GOOGLE_PLACES_API_KEY missing — place links cannot resolve');
                } else {
                    logger.warn({ err: err.message }, '[maps/resolve] place lookup failed');
                }
            }
            if (place) {
                return res.json({
                    lat: place.lat, lng: place.lng, source: 'place',
                    name: place.name, address: place.address,
                    // exact=false: أقرب تطابقٍ للاسم لا المحلّ عينه — الواجهة تطلب التأكّد
                    exact: place.exact === true
                });
            }
            return res.status(422).json({ message: PLACE_NOT_FOUND });
        }

        return res.status(422).json({
            message: 'لم نتمكّن من قراءة الموقع من هذا الرابط — افتحه في خرائط جوجل وانسخ الرابط من زرّ «مشاركة»، أو حدّد الموقع على الخريطة'
        });
    } catch (err) {
        logger.error({ err: err.message }, '[maps/resolve] error');
        res.status(500).json({ message: 'تعذّر قراءة الرابط' });
    }
});

module.exports = router;
