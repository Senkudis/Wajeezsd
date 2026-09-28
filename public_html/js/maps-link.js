/**
 * 🔗 استخراج الإحداثيات من روابط خرائط جوجل — مصدرٌ واحد للمتصفّح والخادم.
 *
 * لماذا وُجد: كثيرٌ من الناس لا يُحسنون وضع الدبوس، لكنّهم يُحسنون مشاركة
 * الموقع من خرائط جوجل أو واتساب. فالرابط أقصر طريقٍ بينهم وبين عنوانٍ
 * صحيح.
 *
 * ⚠️ والمفارقة أن **أشيع الأشكال أصعبُها**: ما يُشارَك اليوم هو
 *    https://maps.app.goo.gl/XXXX — رابطٌ مختصر لا يحوي إحداثيات إطلاقاً،
 *    ولا يفكّه المتصفّح (CORS). ولذلك يقسم هذا الملف العمل:
 *
 *      extractUrl(text) → الرابط من نصٍّ ملصوق (بطاقة المشاركة فيها اسمٌ وعنوان)
 *      parse(text)      → للروابط التي تحمل إحداثياتها. فوريّ، بلا شبكة.
 *      placeRef(text)   → رابط **محلّ** بلا إحداثيات: اسمه ومعرّفاته، ليجده
 *                         الخادم عبر Places API.
 *      needsServer(text)→ يقول للواجهة: هذا لا يُحَلّ إلا في الخادم.
 *
 * 🏪 رابط المحلّ غير رابط الدبوس. مشاركة دبوسٍ تُحوِّل إلى رابطٍ فيه
 *    إحداثياته، أمّا مشاركة محلٍّ فتُحوِّل إلى
 *        google.com/maps/place/اسم+المحل/data=!4m2!3m1!1s0x…:0x…
 *    اسمٌ ومعرّفٌ داخليّ فقط. وصفحة جوجل نفسها لا تُفيد: تُرسَم بجافاسكربت،
 *    والخادم الذي يجلبها يتلقّى **مركز الخريطة الافتراضيّ** لا موقع المحل —
 *    قيس ذلك على ثلاثة أشكالٍ لرابط محلٍّ واحد فأعادت كلّها النقطة نفسها في
 *    أم درمان، بعيداً عن المحل. موقعٌ معقولٌ وخاطئ: أسوأ من الفشل.
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
     * 📋 الرابط من نصٍّ ملصوق.
     *
     * بطاقة المشاركة في خرائط جوجل لمحلٍّ تُنسخ هكذا:
     *     Corinthia Hotel
     *     Nile St, Khartoum, Sudan
     *     https://maps.app.goo.gl/XXXX
     * وحقل الإدخال سطرٌ واحد فيُلصق الأسطر متلاصقة — فلا يبدأ النصّ بـ
     * https:// ، فكان يُرفض بـ «لم نجد إحداثيات» **دون أن يُرسَل للخادم
     * أصلاً**. بينما مشاركة الدبوس رابطٌ وحده فتعمل. هذا وحده كان يُفرّق
     * رابط الدبوس عن رابط المحل.
     */
    function extractUrl(text) {
        var s = String(text || '');
        var m = s.match(/https?:\/\/[^\s<>"'«»]+/i);
        if (m) return m[0].replace(/[).,،؛;]+$/, '');
        // رابطٌ بلا بروتوكول: «maps.app.goo.gl/XXXX» كما ينسخه بعض المستخدمين
        m = s.match(/(?:^|[\s(])((?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.[a-z.]{2,7}|(?:www\.)?google\.[a-z.]{2,7}\/maps)[^\s<>"']*)/i);
        return m ? 'https://' + m[1].replace(/[).,،؛;]+$/, '') : '';
    }

    /** ما حول الرابط في بطاقة المشاركة — اسم المحل وعنوانه، دليلٌ للبحث */
    function shareHint(text) {
        var s = String(text || '');
        var url = extractUrl(s);
        if (url) s = s.split(url).join(' ').replace(/https?:\/\/\S*/g, ' ');
        return s.replace(/\s+/g, ' ').trim().slice(0, 200);
    }

    /** 15°35'10.2"N 32°31'55.1"E → عشريّ. دبابيس جوجل تُسمّى هكذا أحياناً. */
    function parseDms(s) {
        var m = s.match(/(\d{1,2})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|'')?\s*([NS])[\s,+]*(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|'')?\s*([EW])/i);
        if (!m) return null;
        var lat = (+m[1]) + (+m[2]) / 60 + (+m[3]) / 3600;
        var lng = (+m[5]) + (+m[6]) / 60 + (+m[7]) / 3600;
        if (/S/i.test(m[4])) lat = -lat;
        if (/W/i.test(m[8])) lng = -lng;
        return { lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7 };
    }

    /**
     * 🧭 مسار الاتجاهات: /maps/dir/15.1,32.1/15.2,32.2/ — الوجهة آخرُ نقطة.
     * (رابط التوصيل وجهةٌ لا منطلق، ومن يشارك «اتجاهات» إلى مكانٍ يقصده.)
     */
    function parseDirPath(s) {
        var i = s.indexOf('/maps/dir/');
        if (i < 0) return null;
        var path = s.slice(i + 10).split(/[?@]/)[0];
        var parts = path.split('/');
        for (var k = parts.length - 1; k >= 0; k--) {
            var m = parts[k].match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*\+?\s*(-?\d{1,3}\.\d+)\s*$/);
            if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
        }
        return null;
    }

    /**
     * 🧭 الأنماط مرتّبة بالأولوية لا بالصدفة.
     *
     * `!3d..!4d..` أوّلها عن قصد: في روابط المشاركة الطويلة يحمل هذا النمط
     * إحداثيات **المكان نفسه**، بينما `@` يحمل مركز الكاميرا — وقد يبعد عنه
     * عشرات الأمتار حين يكون المستخدم قد حرّك الخريطة قبل المشاركة.
     * وكذلك الإحداثيات في المسار (/search/15.5,+32.5) والدرجات (15°35'N)
     * تُسمّي الدبوس نفسه، فتسبق `@` أيضاً.
     */
    var PATTERNS = [
        /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,              // إحداثيات المكان في data=
        /[?&]q=loc:(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/i,  // q=loc:
        /[?&](?:q|ll|sll|center|query|destination|daddr)=(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/i,
        // الإحداثيات في المسار: /maps/search/15.58,+32.53 و /maps/place/15.58,32.53
        /\/maps\/(?:search|place)\/(-?\d{1,2}\.\d+)\s*,\s*\+?\s*(-?\d{1,3}\.\d+)/i,
        'DIR',                                          // /maps/dir/…/lat,lng
        'DMS',                                          // 15°35'10.2"N 32°31'55.1"E
        /@(-?\d+\.\d+),(-?\d+\.\d+)/,                  // مركز الكاميرا
        /^geo:(-?\d+\.\d+),(-?\d+\.\d+)/i,             // geo: من بعض التطبيقات
        /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/  // إحداثيات ملصوقة مباشرة
    ];

    function decodeLoose(s) {
        // + في الاستعلام مسافة؛ ونفكّ الترميز جزءاً جزءاً لأن «%» مفردةً
        // في نصٍّ طويل تُسقط decodeURIComponent على الكلّ.
        return String(s).replace(/\+/g, ' ').replace(/(%[0-9a-f]{2})+/gi, function (seq) {
            try { return decodeURIComponent(seq); } catch (e) { return seq; }
        });
    }

    /**
     * يستخرج الإحداثيات من نصٍّ يحمل رابطاً أو إحداثيات.
     * @returns {{lat:number, lng:number, source:string}|null}
     */
    function parse(text) {
        if (!text) return null;
        var s = String(text).trim();

        // النصّ كما هو، ثم الرابط وحده إن كان مدفوناً في بطاقة مشاركة،
        // ثم نسختاهما مفكوكتا الترميز (رابطٌ مُرمّز داخل رابطٍ آخر)
        var candidates = [s];
        var url = extractUrl(s);
        if (url && url !== s) candidates.push(url);
        var n = candidates.length;
        for (var d = 0; d < n; d++) {
            var dec = decodeLoose(candidates[d]);
            if (dec !== candidates[d]) candidates.push(dec);
        }

        // النمط هو الحلقة الخارجية لا النصّ: الدبوس بالدرجات المُرمَّزة
        // (15%C2%B035'…) لا يظهر إلا في النسخة المفكوكة، و`@` الكاميرا ظاهرٌ
        // في الأصل — فلو جُرّب الأصل بكل الأنماط أولاً لفازت الكاميرا على
        // الدبوس. هكذا يفوز الأعلى أولويةً في أيّ صيغةٍ ورد.
        for (var i = 0; i < PATTERNS.length; i++) {
            for (var c = 0; c < candidates.length; c++) {
                var p = PATTERNS[i], lat, lng;
                if (p === 'DIR') {
                    var dir = parseDirPath(candidates[c]);
                    if (!dir) continue;
                    lat = dir.lat; lng = dir.lng;
                } else if (p === 'DMS') {
                    var dms = parseDms(candidates[c]);
                    if (!dms) continue;
                    lat = dms.lat; lng = dms.lng;
                } else {
                    var m = candidates[c].match(p);
                    if (!m) continue;
                    lat = parseFloat(m[1]); lng = parseFloat(m[2]);
                }
                if (validCoords(lat, lng)) {
                    return { lat: lat, lng: lng, source: i === 0 ? 'place' : 'url' };
                }
            }
        }
        return null;
    }

    /** ست‌عشريّ طويل → عشريّ نصّاً (CID أكبر من أن يحمله Number بدقّة) */
    function hexToDec(hex) {
        hex = String(hex).replace(/^0x/i, '').toLowerCase();
        if (!/^[0-9a-f]+$/.test(hex)) return '';
        if (typeof BigInt === 'function') return BigInt('0x' + hex).toString();
        var digits = [0];
        for (var i = 0; i < hex.length; i++) {
            var carry = parseInt(hex[i], 16);
            for (var j = 0; j < digits.length; j++) {
                var v = digits[j] * 16 + carry;
                digits[j] = v % 10;
                carry = Math.floor(v / 10);
            }
            while (carry) { digits.push(carry % 10); carry = Math.floor(carry / 10); }
        }
        return digits.reverse().join('');
    }

    /**
     * 🏪 مرجع المحلّ في رابطٍ بلا إحداثيات — ما يحتاجه Places API ليجده.
     *
     *   placeId  ChIJ…   أدقّها: يُجلب المكان به مباشرةً
     *   cid      رقم     معرّف جوجل للمكان. نصف ftid الثاني (0x…:0x…) بالست‌عشريّ
     *                    هو CID نفسه، وPlaces API تُعيد لكل نتيجة googleMapsUri
     *                    بشكل ?cid=… — فيُطابَق فنعرف أنها المحلّ عينه لا شبيهه
     *   name     نصّ     اسمه كما في /maps/place/الاسم/ أو ?q=الاسم
     *
     * @returns {{name:string, cid:string, placeId:string, ftid:string}|null}
     */
    function placeRef(text) {
        // رابطٌ من مضيفٍ في قائمة جوجل المغلقة وحده — وإلا صار أيّ نصٍّ فيه
        // «google.» بحثاً مدفوعاً في Places باسمٍ يختاره المُرسِل
        var raw = extractUrl(text);
        if (!raw) return null;
        try { if (!hostAllowed(new URL(raw).hostname)) return null; } catch (e) { return null; }
        var s = decodeLoose(raw);
        var ref = { name: '', cid: '', placeId: '', ftid: '' };
        var m;

        if ((m = s.match(/\/maps\/place\/([^/@?]+)/i))) ref.name = m[1].trim();
        if (!ref.name && (m = s.match(/[?&](?:q|query)=([^&#]+)/i))) {
            var q = m[1].trim();
            if (!/^loc:|^place_id:|^-?\d+(\.\d+)?\s*,/i.test(q)) ref.name = q;
        }
        if ((m = s.match(/!19s(ChIJ[A-Za-z0-9_-]{10,})/))
            || (m = s.match(/[?&]query_place_id=(ChIJ[A-Za-z0-9_-]{10,})/))
            || (m = s.match(/place_id:(ChIJ[A-Za-z0-9_-]{10,})/))) {
            ref.placeId = m[1];
        }
        if ((m = s.match(/(0x[0-9a-f]{6,16}):(0x[0-9a-f]{6,16})/i))) {
            ref.ftid = m[1] + ':' + m[2];
            ref.cid = hexToDec(m[2]);
        }
        if (!ref.cid && (m = s.match(/[?&]cid=(\d{5,25})/))) ref.cid = m[1];

        // اسمٌ هو إحداثياتٌ في الحقيقة ليس اسماً
        if (ref.name && parse(ref.name)) ref.name = '';
        ref.name = ref.name.slice(0, 120);

        return (ref.name || ref.cid || ref.placeId) ? ref : null;
    }

    /**
     * أرابطٌ مختصر يحتاج فكّاً في الخادم؟
     * (نسأل بعد فشل parse: بعض الروابط المختصرة تحمل إحداثيات في نهايتها)
     */
    function isShortLink(text) {
        var s = extractUrl(text) || String(text || '').trim();
        if (!/^https?:\/\//i.test(s)) return false;
        try {
            var u = new URL(s);
            var h = u.hostname.toLowerCase();
            return h === 'maps.app.goo.gl' || h === 'goo.gl' || h === 'g.co';
        } catch (e) {
            return /maps\.app\.goo\.gl|goo\.gl\/maps|(^|\/\/)g\.co\//i.test(s);
        }
    }

    /**
     * أيحتاج الخادم؟ — رابطٌ مختصر يُفكّ، أو رابط محلٍّ يُبحث عنه.
     * (يُسأل بعد فشل parse.)
     */
    function needsServer(text) {
        return isShortLink(text) || !!placeRef(text);
    }

    /** أيبدو المُدخَل رابط خرائط أصلاً؟ — لرسالة خطأ مفيدة */
    function looksLikeMapsLink(text) {
        return /(google\.[a-z.]+\/maps|maps\.google|maps\.app\.goo\.gl|goo\.gl|g\.co\/kgs|geo:)/i.test(String(text || ''));
    }

    return {
        parse: parse,
        extractUrl: extractUrl,
        shareHint: shareHint,
        placeRef: placeRef,
        hexToDec: hexToDec,
        isShortLink: isShortLink,
        needsServer: needsServer,
        looksLikeMapsLink: looksLikeMapsLink,
        validCoords: validCoords,
        hostAllowed: hostAllowed,
        ALLOWED_HOSTS: ALLOWED_HOSTS
    };
});
