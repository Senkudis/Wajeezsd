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
    // يشمل هيدرات لوحة الأدمن، المتاجر، الإشعارات، التسويق والإحالات
    var HEADER_SELECTOR = '.merchant-header, .page-header, .app-header, .conv-header, ' +
        '.header-gradient, .chat-header, .notif-header, .topbar, .gv-topbar, ' +
        '.od-header, .map-header, .header, .navbar, #navbar, .hero-header, ' +
        '.top-bar, .nav-bar, .main-header, .admin-header';
    // الأشرطة السفلية الثابتة لا تُبطَّن من هنا إطلاقاً — أوراق الأنماط تتولّاها:
    //   .merchant-nav  → merchant-ui.css
    //   .captain-nav   → captain-ui.css
    //   .bottom-nav-bar→ captain-analytics.html
    // جميعها تضع padding-bottom: var(--sab, env(safe-area-inset-bottom, 0px)).
    // تسجيل أيٍّ منها هنا يضاعف الـ inset لأن padElement يقرأ الحشوة المحسوبة
    // (المتضمّنة للـ inset أصلاً) كأساس ثم يضيف الـ inset فوقها، فتظهر فجوة ميتة
    // أسفل الشريط ويتضخّم minHeight بالقدر نفسه. أي شريط سفلي جديد يعالَج في CSS.

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

    function padElement(el, side, inset) {
        var isTop = side === 'top';
        var prop = isTop ? 'paddingTop' : 'paddingBottom';
        var baseKey = isTop ? 'wjBasePt' : 'wjBasePb';
        var heightKey = isTop ? 'wjBaseHt' : 'wjBaseHb';

        if (el.dataset[baseKey] === undefined) {
            el.dataset[baseKey] = parseFloat(getComputedStyle(el)[prop]) || 0;
            el.dataset[heightKey] = el.offsetHeight || 0;
        }

        var base = parseFloat(el.dataset[baseKey]) || 0;
        var baseH = parseFloat(el.dataset[heightKey]) || 0;

        el.style[prop] = (base + inset) + 'px';
        if (baseH > 0 && el !== document.body) {
            el.style.boxSizing = 'border-box';
            el.style.minHeight = (baseH + inset) + 'px';
        }
    }

    // ══════════════════════════════════════════════════════════════
    // 📏 ارتفاع الشريط السفلي — يُقاس ولا يُخمَّن
    //
    // كان الارتفاع مكتوباً رقماً في ثلاثة مواضع (80px في .m-fab وفي حشوة
    // body، و84px في .cap-nav-clearance). والرقم تخمينٌ صحيح على جهاز
    // المطوّر فقط: ارتفاع الشريط محكومٌ بمحتواه (أيقونة 1.4rem + نصّ
    // 10.5px + حشوة)، وأندرويد يسمح للمستخدم بتكبير حجم الخط وحجم العرض
    // (DPI) من إعدادات النظام. عند التكبير يتجاوز الشريط 80px فيقع زر
    // الإضافة **خلفه** (z-index الشريط 1000 والزر 999) ⇒ يختفي تماماً.
    // وعلى شاشة صغيرة يبقى الزر معلّقاً بعيداً عن الشريط.
    //
    // القياس يجعل الموضع صحيحاً على كل جهاز بلا استثناء. ولاحظ أن الشريط
    // يحمل padding-bottom: var(--sab) في CSS، فارتفاعه المقيس **يتضمّن**
    // منطقة الأمان — لذلك لا يُضاف --sab فوقه مرة أخرى.
    // ══════════════════════════════════════════════════════════════
    var NAV_SELECTOR = '.merchant-nav, .captain-nav, .bottom-nav-bar';
    var _navObserver = null;

    function measureBottomNav() {
        var nav = document.querySelector(NAV_SELECTOR);
        if (!nav) return 0;
        var h = Math.round(nav.getBoundingClientRect().height);
        if (h > 0) {
            document.documentElement.style.setProperty('--wj-nav-h', h + 'px');
        }

        // الشريط يتغيّر ارتفاعه بتغيّر مقياس خط النظام أو الدوران أو تبدّل
        // الوضع الليلي — والمراقب يعيد القياس بلا انتظار حدثٍ نعرفه مسبقاً.
        if (!_navObserver && typeof ResizeObserver !== 'undefined') {
            _navObserver = new ResizeObserver(function () { measureBottomNav(); });
            _navObserver.observe(nav);
        }
        return h;
    }

    function setup() {
        injectVars();
        if (!document.body) return;

        var insets = measureInsets();

        // 1) الهيدر العلوي (حتى مع وجود mobile-overrides.css الهيدرات الـ fixed/sticky تطلب حشوة top)
        if (insets.top > 0) {
            var headers = document.querySelectorAll(HEADER_SELECTOR);
            var paddedHeader = false;
            if (headers && headers.length > 0) {
                headers.forEach(function (h) {
                    var rect = h.getBoundingClientRect();
                    // نُبطّن فقط الهيدرات الواقعة أعلى الشاشة
                    if (rect.top <= 100) {
                        padElement(h, 'top', insets.top);
                        paddedHeader = true;
                    }
                });
            }
            // إذا لم توجد هيدرات معروفة في أعلى الصفحة، نبطّن body من الأعلى
            if (!paddedHeader && !document.querySelector('link[href*="mobile-overrides"]')) {
                padElement(document.body, 'top', insets.top);
            }
        }

        // 2) خلوص أسفل body — الأشرطة السفلية نفسها تُبطَّن من CSS (انظر الأعلى)
        var navH = measureBottomNav();
        if (document.querySelector('.merchant-nav')) {
            if (!document.getElementById('wj-safe-area-merchant')) {
                var s = document.createElement('style');
                s.id = 'wj-safe-area-merchant';
                // --wj-nav-h مقيسٌ ويتضمّن --sab أصلاً. الاحتياطي يعيد
                // السلوك القديم حرفياً لو تعذّر القياس.
                s.textContent = 'body { padding-bottom: calc(' +
                    'var(--wj-nav-h, calc(80px + var(--sab, env(safe-area-inset-bottom, 0px))))' +
                    ' + 12px) !important; }';
                document.head.appendChild(s);
            }
        } else if (insets.bottom > 0 && !document.querySelector('link[href*="mobile-overrides"]')) {
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
