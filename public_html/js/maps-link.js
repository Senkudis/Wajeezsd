/**
 * 🔗 استخراج الإحداثيات من روابط خرائط جوجل — مصدرٌ واحد للمتصفّح والخادم.
 *
 * لماذا وُجد: كثيرٌ من الناس لا يُحسنون وضع الدبوس، لكنّهم يُحسنون مشاركة
 * الموقع من خرائط جوجل أو واتساب. فالرابط أقصر طريقٍ بينهم وبين عنوانٍ
 * صحيح.
 *
 * ⚠️ والمفارقة أن **أشيع الأشكال أصعبُها**: ما يُشارَك اليوم هو
 *    https://maps.app.goo.gl/XXXX — رابطٌ مختصر لا يحوي إحداثيات إطلاقاً،
 *    ولا يفكّه المتصفّح (CORS). ولذلك يقسم هذا الملف العمل قسمين:
 *
 *      parse(url)     → للروابط التي تحمل إحداثياتها. فوريّ، بلا شبكة.
 *      isShortLink(url) → يقول للواجهة: هذا يحتاج الخادم ليتبع التحويل.
 *
 * وملفٌ واحد للطرفين عن قصد: نسختان تفترقان تعنيان رابطاً يُقبل في
 * المتصفّح ويُرفض في الخادم — أو أسوأ، إحداثيّين مختلفين للرابط نفسه.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MapsLink = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* المضيفات المسموح باتّباعها — تُفحص في الخادم عند كل قفزة تحويل */
    var ALLOWED_HOSTS = [
        'maps.app.goo.gl',
        'goo.gl',
        'g.co',
        'maps.google.com',
        'www.google.com',
        'google.com',
        'maps.app.google.com'
    ];

    function hostAllowed(host) {
        host = String(host || '').toLowerCase().replace(/^www\./, '');
        return ALLOWED_HOSTS.some(function (h) {
            var a = h.replace(/^www\./, '');
            // نطاقات جوجل القُطرية: google.com.eg، google.sd …
            if (a === 'google.com') return host === 'google.com' || /^google\.[a-z.]{2,7}$/.test(host);
            if (a === 'maps.google.com') return host === 'maps.google.com' || /^maps\.google\.[a-z.]{2,7}$/.test(host);
            return host === a;
        });
    }

    /** أهي إحداثيات سليمة أصلاً؟ */
    function validCoords(lat, lng) {
        return Number.isFinite(lat) && Number.isFinite(lng)
            && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
            && !(lat === 0 && lng === 0);   // (0,0) في المحيط الأطلسي — دائماً خطأ إدخال
    }

    /**
     * 🧭 الأنماط مرتّبة بالأولوية لا بالصدفة.
     *
     * `!3d..!4d..` أوّلها عن قصد: في روابط المشاركة الطويلة يحمل هذا النمط
     * إحداثيات **المكان نفسه**، بينما `@` يحمل مركز الكاميرا — وقد يبعد عنه
     * عشرات الأمتار حين يكون المستخدم قد حرّك الخريطة قبل المشاركة.
     */
    var PATTERNS = [
        /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,              // إحداثيات المكان في data=
        /[?&]q=loc:(-?\d+\.\d+),\s*(-?\d+\.\d+)/i,     // q=loc:
        /[?&](?:q|ll|sll|center|query|destination|daddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/i,
        /@(-?\d+\.\d+),(-?\d+\.\d+)/,                  // مركز الكاميرا
        /^geo:(-?\d+\.\d+),(-?\d+\.\d+)/i,             // geo: من بعض التطبيقات
        /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/  // إحداثيات ملصوقة مباشرة
    ];

    /**
     * يستخرج الإحداثيات من نصٍّ يحمل رابطاً أو إحداثيات.
     * @returns {{lat:number, lng:number, source:string}|null}
     */
    function parse(text) {
        if (!text) return null;
        var s = String(text).trim();

        // الرابط قد يأتي مُرمّزاً داخل رابطٍ آخر (مشاركة من داخل تطبيق)
        var candidates = [s];
        try {
            var dec = decodeURIComponent(s);
            if (dec !== s) candidates.push(dec);
        } catch (e) { /* ترميز تالف — نكتفي بالأصل */ }

        for (var c = 0; c < candidates.length; c++) {
            for (var i = 0; i < PATTERNS.length; i++) {
                var m = candidates[c].match(PATTERNS[i]);
                if (!m) continue;
                var lat = parseFloat(m[1]), lng = parseFloat(m[2]);
                if (validCoords(lat, lng)) {
                    return { lat: lat, lng: lng, source: i === 0 ? 'place' : 'url' };
                }
            }
        }
        return null;
    }

    /**
     * أرابطٌ مختصر يحتاج فكّاً في الخادم؟
     * (نسأل بعد فشل parse: بعض الروابط المختصرة تحمل إحداثيات في نهايتها)
     */
    function isShortLink(text) {
        var s = String(text || '').trim();
        if (!/^https?:\/\//i.test(s)) return false;
        try {
            var u = new URL(s);
            var h = u.hostname.toLowerCase();
            return h === 'maps.app.goo.gl' || h === 'goo.gl' || h === 'g.co';
        } catch (e) {
            return /maps\.app\.goo\.gl|goo\.gl\/maps|(^|\/\/)g\.co\//i.test(s);
        }
    }

    /** أيبدو المُدخَل رابط خرائط أصلاً؟ — لرسالة خطأ مفيدة */
    function looksLikeMapsLink(text) {
        return /(google\.[a-z.]+\/maps|maps\.google|maps\.app\.goo\.gl|goo\.gl|g\.co\/kgs|geo:)/i.test(String(text || ''));
    }

    return {
        parse: parse,
        isShortLink: isShortLink,
        looksLikeMapsLink: looksLikeMapsLink,
        validCoords: validCoords,
        hostAllowed: hostAllowed,
        ALLOWED_HOSTS: ALLOWED_HOSTS
    };
});
