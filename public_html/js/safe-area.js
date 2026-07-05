/**
 * Safe Area Inset Helper v2
 * يمنع دخول المحتوى تحت شريط الحالة (الإشعارات) وأزرار النظام السفلية
 * في وضع edge-to-edge على أندرويد/iOS، ويعمل بلا أثر في المتصفح العادي.
 *
 * المنهج: قياس قيمة الـ inset الفعلية ثم إضافتها فوق الحشوة الأصلية
 * للعنصر (بدل فرض قيم ثابتة كانت تُصغّر حشوات بعض الصفحات).
 *
 * ملاحظة: الصفحات التي تُحمّل mobile-overrides.css معالجة بالكامل هناك
 * (body مبطّن بمتغيرات --sat/--sab) — هذا الملف يتجاهلها لتفادي الازدواج.
 */
(function applySafeArea() {
    // أول هيدر معروف في الصفحة يُبطَّن من الأعلى.
    // يشمل هيدرات لوحة الأدمن (topbar/gv-topbar) وصفحة الإشعارات (notif-header)
    var HEADER_SELECTOR = '.merchant-header, .page-header, .app-header, .conv-header, ' +
        '.header-gradient, .chat-header, .notif-header, .topbar, .gv-topbar, ' +
        '.od-header, .map-header, .header';
    // أشرطة تنقّل سفلية ثابتة تُبطَّن من الأسفل
    var BOTTOM_NAV_SELECTOR = '.merchant-nav, .bottom-nav-bar';

    function injectVars() {
        if (!document.head || document.getElementById('wj-safe-area-vars')) return;
        var style = document.createElement('style');
        style.id = 'wj-safe-area-vars';
        style.textContent =
            ':root {' +
            '--sat: env(safe-area-inset-top, 0px);' +
            '--sar: env(safe-area-inset-right, 0px);' +
            '--sab: env(safe-area-inset-bottom, 0px);' +
            '--sal: env(safe-area-inset-left, 0px);' +
            '}';
        document.head.appendChild(style);
    }

    // القيم لا تُقرأ مباشرة من JS — نقيسها عبر عنصر مخفي.
    // var(--sat) أولاً: على أندرويد يحقنها الكود الأصلي (MainActivity) بالقيم
    // الحقيقية لأن env() هناك تُرجع صفراً دائماً؛ وعلى iOS تسقط للـ env().
    function measureInsets() {
        var probe = document.createElement('div');
        probe.style.cssText =
            'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
            'padding-top:var(--sat, env(safe-area-inset-top, 0px));' +
            'padding-bottom:var(--sab, env(safe-area-inset-bottom, 0px));';
        document.body.appendChild(probe);
        var cs = getComputedStyle(probe);
        var insets = {
            top: parseFloat(cs.paddingTop) || 0,
            bottom: parseFloat(cs.paddingBottom) || 0
        };
        probe.remove();
        return insets;
    }

    // إضافة inset فوق الحشوة الأصلية مع الحفاظ على ارتفاع محتوى الهيدر.
    // نُثبّت box-sizing:border-box ونرفع min-height بمقدار الـ inset، وإلا فإن
    // الهيدرات ذات الارتفاع الثابت (مثل .topbar بـ height:64px) كان محتواها يُضغط.
    // الأساس والارتفاع الأصلي محفوظان في dataset فلا تراكم عند تكرار الاستدعاء.
    function padElement(el, side, inset) {
        var isTop = side === 'top';
        var prop = isTop ? 'paddingTop' : 'paddingBottom';
        var baseKey = isTop ? 'wjBasePt' : 'wjBasePb';
        var heightKey = isTop ? 'wjBaseHt' : 'wjBaseHb';

        if (el.dataset[baseKey] === undefined) {
            el.dataset[baseKey] = parseFloat(getComputedStyle(el)[prop]) || 0;
            // الارتفاع المُصيَّر قبل أي تعديل منا (offsetHeight يشمل الحشوة والحدود)
            el.dataset[heightKey] = el.offsetHeight || 0;
        }

        var base = parseFloat(el.dataset[baseKey]) || 0;
        var baseH = parseFloat(el.dataset[heightKey]) || 0;

        el.style[prop] = (base + inset) + 'px';
        // مع border-box: min-height يشمل الحشوة، فتُحفظ مساحة المحتوى كما هي.
        // نتخطّى body: تجميد ارتفاعه غير مرغوب — الحشوة وحدها تكفي لخلوصه السفلي.
        if (baseH > 0 && el !== document.body) {
            el.style.boxSizing = 'border-box';
            el.style.minHeight = (baseH + inset) + 'px';
        }
    }

    function setup() {
        injectVars();
        if (!document.body) return;

        // mobile-overrides.css تبطّن body بالكامل — لا شيء لنفعله هنا
        if (document.querySelector('link[href*="mobile-overrides"]')) return;

        var insets = measureInsets();

        // 1) الهيدر العلوي
        if (insets.top > 0) {
            var header = document.querySelector(HEADER_SELECTOR);
            if (header) padElement(header, 'top', insets.top);
        }

        // 2) الأشرطة السفلية الثابتة
        if (insets.bottom > 0) {
            document.querySelectorAll(BOTTOM_NAV_SELECTOR).forEach(function (nav) {
                padElement(nav, 'bottom', insets.bottom);
            });
        }

        // 3) خلوص أسفل body
        if (document.querySelector('.merchant-nav')) {
            // صفحات التاجر: خلوص كامل فوق الشريط السفلي (سلوك النسخة السابقة)
            if (!document.getElementById('wj-safe-area-merchant')) {
                var s = document.createElement('style');
                s.id = 'wj-safe-area-merchant';
                s.textContent = 'body { padding-bottom: calc(80px + var(--sab, env(safe-area-inset-bottom, 0px))) !important; }';
                document.head.appendChild(s);
            }
        } else if (insets.bottom > 0) {
            padElement(document.body, 'bottom', insets.bottom);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
    // تتغيّر الـ insets عند تدوير الشاشة — أعد الحساب (الأساس محفوظ فلا تراكم)
    window.addEventListener('orientationchange', function () { setTimeout(setup, 300); });
    // MainActivity يحقن القيم الحقيقية بعد تحميل الصفحة ويطلق هذا الحدث —
    // أعد الحساب فوراً بالقيم الجديدة (قد يصل الحقن بعد DOMContentLoaded)
    document.addEventListener('wj-safe-area', setup);

    // حقن مبكر للمتغيرات يقلل وميض القفزة قبل DOMContentLoaded
    injectVars();
})();
