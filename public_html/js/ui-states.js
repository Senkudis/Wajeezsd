/**
 * ⏳ حالات الواجهة الثلاث: تحميل، فراغ، وخطأ — وبَنَر انقطاع الشبكة.
 *
 * لماذا وحدةٌ واحدة: الصفحات سبعون. الهيكل العظمي معرَّف في سبعَ عشرة
 * منها، وحالة الفراغ بثمانية أسماء أصناف مختلفة (empty / empty-state /
 * no-data / gv-empty …)، وانقطاع الشبكة في تسعة ملفات فقط. فالصفحة التي
 * تنقصها هذه الحالات تبدو **معطّلة** وهي سليمة — تظهر فارغةً بيضاء فلا
 * يعرف المستخدم: أما زال يُحمّل؟ أم لا يوجد شيء؟ أم انقطع الاتصال؟
 *
 * الوحدة تحقن أنماطها بنفسها فتعمل على أي صفحة بسطرٍ واحد، بلا ربطها
 * بورقة أنماطٍ بعينها ولا بترتيب تحميلها.
 *
 * الاستعمال:
 *     UIState.skeleton(box, { count: 3 });          قبل الجلب
 *     UIState.empty(box, { title: 'لا طلبات بعد' }); حين تعود القائمة فارغة
 *     UIState.error(box, { onRetry: load });         حين يفشل الجلب
 *
 * وبَنَر الانقطاع يعمل وحده، ويُطلق حدث `ui:reconnected` عند عودة
 * الاتصال — تستمع له الصفحة فتُعيد الجلب بلا أن يضغط المستخدم شيئاً.
 */
(function () {
    'use strict';

    if (window.UIState) return;

    var STYLE_ID = 'ui-states-style';

    /* ─── الأنماط ─────────────────────────────────────────────────── */

    var CSS = [
        /* الهيكل العظمي: خصائص مفصّلة لا shorthand — أي override لاحق على
           background كان يمحو background-size فيتجمّد اللمعان. */
        '.uis-sk{background-color:#e9edeb;background-image:linear-gradient(110deg,#e9edeb 8%,#f4f7f5 18%,#e9edeb 33%);',
        'background-size:200% 100%;animation:uisShimmer 1.4s linear infinite;border-radius:10px}',
        '@keyframes uisShimmer{to{background-position-x:-200%}}',
        '.uis-sk-card{display:flex;gap:12px;align-items:flex-start;padding:14px;margin-bottom:12px;',
        'border:1px solid rgba(0,0,0,.07);border-radius:14px;background:rgba(127,127,127,.04)}',
        '.uis-sk-avatar{width:46px;height:46px;border-radius:50%;flex-shrink:0}',
        '.uis-sk-body{flex:1;min-width:0}',
        '.uis-sk-line{height:12px;margin-bottom:9px}',
        '.uis-sk-line:last-child{margin-bottom:0}',
        '.uis-sk-cell{padding:14px 12px!important}',
        '.uis-sk-cell .uis-sk-line{margin:0}',

        /* الفراغ والخطأ: بطاقة واحدة بمقاسٍ واحد في كل الصفحات */
        '.uis-state{display:flex;flex-direction:column;align-items:center;justify-content:center;',
        'text-align:center;padding:38px 20px;gap:10px;color:inherit}',
        '.uis-state-ic{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;',
        'font-size:1.7rem;background:rgba(4,85,58,.08);color:#0d8a5e;margin-bottom:2px}',
        '.uis-state-err .uis-state-ic{background:rgba(220,38,38,.09);color:#dc2626}',
        '.uis-state-t{font-size:1.03rem;font-weight:800;margin:0}',
        '.uis-state-p{font-size:.9rem;opacity:.72;margin:0;max-width:34ch;line-height:1.7}',
        '.uis-state-btn{margin-top:6px;min-height:44px;padding:0 22px;border:none;border-radius:999px;',
        'background:#04553A;color:#fff;font:inherit;font-weight:800;cursor:pointer}',
        '.uis-state-btn:active{transform:scale(.98)}',

        /* بَنَر الانقطاع: يحترم الشقّ العلوي عبر --sat لا env() الخام —
           WebView أندرويد يعيد صفراً من env() فيختفي البنر تحت الشقّ. */
        '.uis-offline{position:fixed;inset-inline:0;inset-block-start:var(--sat,0px);z-index:99999;',
        'display:flex;align-items:center;justify-content:center;gap:9px;',
        'padding:9px 14px;background:#92400e;color:#fff;font-size:.84rem;font-weight:800;',
        'transform:translateY(-100%);transition:transform .28s cubic-bezier(.16,1,.3,1)}',
        '.uis-offline.is-on{transform:none}',
        '.uis-offline-dot{width:8px;height:8px;border-radius:50%;background:#fbbf24;flex-shrink:0}',

        /* الوضع الداكن: التطبيق يستعمل body.dark-mode، وصفحة الهبوط
           data-theme، وبعض الأجهزة تفرض تفضيل النظام. الثلاثة مغطّاة. */
        'body.dark-mode .uis-sk,[data-theme="dark"] .uis-sk{background-color:#1d2b24;',
        'background-image:linear-gradient(110deg,#1d2b24 8%,#2b3f35 18%,#1d2b24 33%);background-size:200% 100%}',
        'body.dark-mode .uis-sk-card,[data-theme="dark"] .uis-sk-card{border-color:rgba(255,255,255,.08)}',
        '@media (prefers-color-scheme:dark){',
        'body:not(.light-mode):not([data-theme="light"]) .uis-sk{background-color:#1d2b24;',
        'background-image:linear-gradient(110deg,#1d2b24 8%,#2b3f35 18%,#1d2b24 33%);background-size:200% 100%}}',

        '@media (prefers-reduced-motion:reduce){',
        '.uis-sk{animation:none}.uis-offline{transition:none}}'
    ].join('');

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = CSS;
        (document.head || document.documentElement).appendChild(el);
    }

    /* ─── أدوات ───────────────────────────────────────────────────── */

    function resolve(target) {
        if (!target) return null;
        return typeof target === 'string' ? document.querySelector(target) : target;
    }

    /** نصٌّ لا HTML: العناوين تأتي أحياناً من الخادم، فلا تُحقن كماركب. */
    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function clear(box) {
        while (box.firstChild) box.removeChild(box.firstChild);
    }

    /* ─── الحالات ─────────────────────────────────────────────────── */

    /**
     * هيكلٌ عظمي بعدد البطاقات المتوقّع — لا دوّامة.
     * الدوّامة تقول «انتظر»، والهيكل يقول «هذا ما سيظهر»، فيقلّ الارتجاج
     * حين تصل البيانات لأن المساحة محجوزة سلفاً.
     */
    function skeleton(target, opts) {
        var box = resolve(target);
        if (!box) return;
        injectStyle();
        opts = opts || {};
        var count = Math.max(1, Math.min(opts.count || 3, 12));
        var avatar = opts.avatar !== false;

        clear(box);
        box.setAttribute('aria-busy', 'true');

        // جدول: الهيكل يجب أن يكون صفوفاً وخلايا. بطاقةٌ داخل tbody يرفضها
        // المتصفّح فيرفعها خارج الجدول، فيظهر الهيكل فوقه لا داخله.
        if (opts.variant === 'row') {
            var cols = Math.max(1, Math.min(opts.cols || 1, 20));
            for (var r = 0; r < count; r++) {
                var tr = el('tr');
                var td = el('td', 'uis-sk-cell');
                td.colSpan = cols;
                var bar = el('div', 'uis-sk uis-sk-line');
                bar.style.width = (60 + (r % 3) * 15) + '%';
                td.appendChild(bar);
                tr.appendChild(td);
                box.appendChild(tr);
            }
            return;
        }

        for (var i = 0; i < count; i++) {
            var card = el('div', 'uis-sk-card');
            if (avatar) card.appendChild(el('div', 'uis-sk uis-sk-avatar'));
            var body = el('div', 'uis-sk-body');
            var w = ['70%', '100%', '45%'];
            for (var j = 0; j < 3; j++) {
                var line = el('div', 'uis-sk uis-sk-line');
                line.style.width = w[j];
                body.appendChild(line);
            }
            card.appendChild(body);
            box.appendChild(card);
        }
    }

    function state(target, opts, kind) {
        var box = resolve(target);
        if (!box) return;
        injectStyle();
        opts = opts || {};

        clear(box);
        box.removeAttribute('aria-busy');

        var wrap = el('div', 'uis-state' + (kind === 'error' ? ' uis-state-err' : ''));
        // الحالة تُعلَن للقارئ الصوتي: صفحةٌ فارغة بلا إعلان لا يعرف بها
        wrap.setAttribute('role', kind === 'error' ? 'alert' : 'status');

        var ic = el('div', 'uis-state-ic');
        var i = el('i', 'bi ' + (opts.icon || (kind === 'error' ? 'bi-wifi-off' : 'bi-inbox')));
        i.setAttribute('aria-hidden', 'true');
        ic.appendChild(i);
        wrap.appendChild(ic);

        wrap.appendChild(el('h3', 'uis-state-t', opts.title
            || (kind === 'error' ? 'تعذّر التحميل' : 'لا يوجد شيء هنا بعد')));

        if (opts.text !== null) {
            wrap.appendChild(el('p', 'uis-state-p', opts.text
                || (kind === 'error' ? 'تحقّق من اتصالك ثم أعد المحاولة.' : '')));
        }

        var onClick = kind === 'error' ? opts.onRetry : opts.onAction;
        if (typeof onClick === 'function') {
            var btn = el('button', 'uis-state-btn',
                opts.actionLabel || (kind === 'error' ? 'إعادة المحاولة' : 'تحديث'));
            btn.type = 'button';
            btn.addEventListener('click', onClick);
            wrap.appendChild(btn);
        }

        box.appendChild(wrap);
    }

    function empty(target, opts) { state(target, opts, 'empty'); }
    function error(target, opts) { state(target, opts, 'error'); }

    /* ─── بَنَر الانقطاع ──────────────────────────────────────────── */

    var banner = null;

    function ensureBanner() {
        if (banner) return banner;
        injectStyle();
        banner = el('div', 'uis-offline');
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.appendChild(el('span', 'uis-offline-dot'));
        banner.appendChild(el('span', null, 'لا يوجد اتصال بالإنترنت'));
        document.body.appendChild(banner);
        return banner;
    }

    function setOffline(isOffline) {
        var b = ensureBanner();
        // مرحلتان حتى يسري الانتقال على عنصرٍ أُضيف للتوّ
        requestAnimationFrame(function () {
            b.classList.toggle('is-on', isOffline);
        });
        document.documentElement.classList.toggle('is-offline', isOffline);
    }

    function bindNetwork() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', bindNetwork, { once: true });
            return;
        }
        if (!navigator.onLine) setOffline(true);

        window.addEventListener('offline', function () { setOffline(true); });
        window.addEventListener('online', function () {
            setOffline(false);
            // الصفحة تستمع فتُعيد الجلب وحدها — لا تنتظر ضغطة
            window.dispatchEvent(new CustomEvent('ui:reconnected'));
        });
    }

    window.UIState = {
        skeleton: skeleton,
        empty: empty,
        error: error,
        isOffline: function () { return !navigator.onLine; },
        /** تُستدعى في صفحاتٍ تُمرّر دالة جلبٍ واحدة: تربط إعادة الجلب تلقائياً */
        onReconnect: function (fn) {
            if (typeof fn === 'function') window.addEventListener('ui:reconnected', fn);
        }
    };

    bindNetwork();
})();
