/**
 * 🔴 شارات «ما لم يكتمل» في لوحة التاجر.
 *
 * الفكرة: كل زرٍّ يقابله عملٌ منتظر يحمل رقماً أحمر، ويختفي الرقم لحظة
 * انتهاء العمل. الرقم الذي لا يقابله فعلٌ يُنهيه يصير زينةً تُتجاهَل — لذلك
 * لا شارة إلا على ما ينتظر التاجر فعلاً.
 *
 * الاستعمال في أي صفحة تاجر:
 *   <span class="m-badge" data-badge="orders"></span>
 *   <script src="js/merchant-badges.js"></script>
 * والوحدة تتكفّل بالباقي: جلبٌ واحد لكل الأرقام، وتحديثٌ سلس، وإطفاءٌ فوري
 * عند العودة للصفحة أو عند وصول حدث سوكِت.
 *
 * ⚠️ الإخفاء بـ hidden لا بـ style.display: العنصر يحمل انتقالاً في CSS،
 *    و display لا يُنتقل إليه أصلاً فتختفي الشارة بقطعٍ مفاجئ. hidden مع
 *    فئة .is-on تسمح بتلاشٍ حقيقي (انظر .m-badge في merchant-ui.css).
 */
(function merchantBadges() {
    'use strict';

    var KEYS = ['orders', 'messages', 'notifications', 'products'];
    var POLL_MS = 20000;
    var _timer = null;
    var _inFlight = false;
    var _last = {};

    function token() {
        return (window.Auth && window.Auth.getToken && window.Auth.getToken()) ||
            localStorage.getItem('token');
    }

    function nodesFor(key) {
        return document.querySelectorAll('[data-badge="' + key + '"]');
    }

    function paint(key, count) {
        var n = Number(count) || 0;
        nodesFor(key).forEach(function (el) {
            // 99+ بدل رقمٍ يكسر عرض الشارة ويغطّي الأيقونة
            el.textContent = n > 99 ? '99+' : String(n);
            el.setAttribute('aria-label', n + ' بانتظارك');

            if (n > 0) {
                el.hidden = false;
                // ⚠️ إعادة تدفّق مفروضة لا requestAnimationFrame: قراءة
                //    offsetWidth تُثبّت الحالة المخفية فوراً فيبدأ الانتقال
                //    منها. أما rAF فلا تُستدعى إطلاقاً والصفحة مخفيّة — وهي
                //    حالةٌ واقعية بعد أن صار الجلب الأول يعمل في الخلفية:
                //    كانت الشارة تأخذ رقمها وتبقى شفّافة تماماً (hidden=false
                //    بلا is-on) فلا يراها أحد.
                void el.offsetWidth;
                el.classList.add('is-on');
                // نبضة قصيرة عند **ازدياد** الرقم وحده: النبض عند كل تحديث
                // يجعل الشريط يرقص بلا سبب ويفقد التنبيه معناه.
                if (_last[key] !== undefined && n > _last[key]) {
                    el.classList.remove('is-bump');
                    void el.offsetWidth;              // إعادة تشغيل الأنيميشن
                    el.classList.add('is-bump');
                }
            } else {
                el.classList.remove('is-on', 'is-bump');
                // ننتظر انتهاء التلاشي قبل الإخفاء، وإلا اختفت فجأةً
                setTimeout(function () {
                    if (!el.classList.contains('is-on')) el.hidden = true;
                }, 220);
            }
        });
        _last[key] = n;
    }

    /**
     * @param {boolean} [idleOk] اسمح بالجلب ولو كانت الصفحة مخفيّة.
     *   الاستطلاع الدوري يتوقّف عند الإخفاء (لا معنى لاستهلاك شبكة الهاتف
     *   وبطاريته لتحديث ما لا يُرى)، لكن **الجلب الأول لا يتوقّف**: صفحةٌ
     *   تُحمَّل في الخلفية — من إشعارٍ أو تبويبٍ مستعاد — كانت تبقى بشاراتٍ
     *   فارغة حتى أول ظهور، فيرى التاجر لوحةً تبدو خالية من العمل.
     */
    function refresh(idleOk) {
        var t = token();
        if (!t || _inFlight) return;
        if (document.hidden && !idleOk) return;
        _inFlight = true;

        var base = window.API_URL || '';
        fetch(base + '/api/merchant/badges', { headers: { 'Authorization': 'Bearer ' + t } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data) return;
                KEYS.forEach(function (k) { paint(k, data[k]); });
            })
            .catch(function () { /* الشبكة تتعثّر — الأرقام السابقة تبقى كما هي */ })
            .then(function () { _inFlight = false; });
    }

    function start() {
        refresh(true);                       // الأولى دائماً، ولو كانت مخفيّة
        if (_timer) clearInterval(_timer);
        _timer = setInterval(function () { refresh(); }, POLL_MS);
    }

    // العودة إلى الصفحة أهمّ لحظة: التاجر غالباً عاد للتوّ من إنهاء العمل
    // في صفحة أخرى، فيجب أن يجد الشارة قد انطفأت لا أن ينتظر دورة الاستطلاع.
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) refresh(true);
    });
    window.addEventListener('focus', function () { refresh(true); });
    window.addEventListener('pageshow', function () { refresh(true); });

    // أحداث لحظية — الشارة تتحرّك مع الحدث لا بعد عشرين ثانية
    ['new_shop_order', 'shop_order_update', 'new_message', 'messages_read', 'new_notification']
        .forEach(function (evt) {
            document.addEventListener('wj-' + evt, function () { refresh(true); });
        });

    // نداءٌ صريح لمن أنهى عملاً في نفس الصفحة (قبِل طلباً، قرأ رسالة…)
    window.refreshMerchantBadges = function () { refresh(true); };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
