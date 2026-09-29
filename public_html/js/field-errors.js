/**
 * 🎯 أخطاء الإدخال في مكانها — لا نافذةٌ تقول «رقم الهاتف غير صحيح» ثم تُغلق.
 *
 * كانت النماذج تعرض الخطأ في نافذةٍ منبثقة لا تشير إلى حقل. عميلٌ ملأ هاتف
 * المستلم يقرأ «رقم هاتف المرسل غير صحيح»، يغلق النافذة، ولا يعرف أيّ خانةٍ
 * يُقصد — فيظنّ أن التطبيق معطوب («كتبت الرقم وقال غير موجود»).
 *
 * الآن كل خطأ يظهر **تحت حقله**، بإطارٍ أحمر، والصفحة تنزل إلى أوّل خطأ
 * وتضع المؤشّر فيه. ويختفي الخطأ لحظة يبدأ المستخدم التصحيح.
 *
 *   FieldErrors.showAll([{ target: 'pickup-phone', message: '…' }, …])
 *   FieldErrors.show('pickup-phone', '…')
 *   FieldErrors.clear('pickup-phone') / FieldErrors.clearAll()
 *
 * target: معرّف عنصر أو العنصر نفسه. للحقل غير القابل للكتابة (عنوانٌ يُحدَّد
 * من الخريطة) مرّر { target: 'pickup-addr', focus: 'زرّ الخريطة' } ليُركَّز
 * على ما يُصلحه.
 *
 * وSudanPhone: الحكم على رقم الهاتف كما يحكم الخادم (utils/phoneNormalizer.js)
 * — الأرقام العربية، والمسافات، و+249، والرقم بلا صفر كلها مقبولة.
 */
(function () {
    'use strict';

    // ─── رقم الهاتف السوداني — مرآة utils/phoneNormalizer.js ─────────────
    const DIGITS = /[٠-٩۰-۹]/g;
    const fold = (s) => String(s == null ? '' : s).replace(DIGITS, (d) => {
        const c = d.charCodeAt(0);
        return String(c >= 0x06F0 ? c - 0x06F0 : c - 0x0660);
    });

    function normalize(phone) {
        let cleaned = fold(phone).replace(/[^0-9]/g, '');
        if (!cleaned) return '';
        if (cleaned.startsWith('00249')) cleaned = cleaned.slice(2);   // صيغة الاتصال الدوليّ
        if (cleaned.startsWith('2490')) return '249' + cleaned.slice(4);
        if (cleaned.startsWith('249') && cleaned.length === 12) return cleaned;
        if (cleaned.startsWith('0')) return '249' + cleaned.slice(1);
        if (cleaned.length === 9) return '249' + cleaned;
        return '249' + cleaned;
    }

    const SudanPhone = {
        fold,
        normalize,
        /** رقم محمول سوداني صالح (249 + تسعة أرقام تبدأ بـ 9 أو 1) */
        isValid: (p) => /^249[19]\d{8}$/.test(normalize(p)),
        /** الصيغة المحلية للعرض والاتصال: 0912345678 */
        toLocal: (p) => {
            const n = normalize(p);
            return /^249[19]\d{8}$/.test(n) ? '0' + n.slice(3) : String(p || '').trim();
        },
        /** سبب الرفض بكلمات المستخدم — أو null إن صحّ */
        problem(p) {
            const digits = fold(p).replace(/[^0-9]/g, '');
            if (!digits) return 'empty';
            if (!/^249[19]\d{8}$/.test(normalize(p))) return digits.length < 9 ? 'short' : 'invalid';
            return null;
        }
    };

    // ─── الأنماط: تُحقن مرّة، فلا تحتاج أي صفحةٍ ملفّ CSS إضافياً ────────
    function injectStyle() {
        if (document.getElementById('field-errors-style')) return;
        const st = document.createElement('style');
        st.id = 'field-errors-style';
        st.textContent = `
            .fe-invalid, .fe-invalid:focus {
                border-color: #dc2626 !important;
                box-shadow: 0 0 0 3px rgba(220, 38, 38, .15) !important;
            }
            .fe-msg {
                display: flex; align-items: flex-start; gap: 6px;
                color: #b91c1c; font-size: 12.5px; font-weight: 700; line-height: 1.5;
                margin-top: 5px;
            }
            .fe-msg::before {
                content: '!'; flex-shrink: 0; width: 16px; height: 16px; border-radius: 50%;
                background: #dc2626; color: #fff; font-size: 11px; font-weight: 900;
                display: inline-grid; place-items: center; margin-top: 1px;
            }
            body.dark-mode .fe-msg, [data-theme="dark"] .fe-msg { color: #fca5a5; }
            @keyframes fe-shake {
                0%, 100% { transform: translateX(0); }
                20%, 60% { transform: translateX(-5px); }
                40%, 80% { transform: translateX(5px); }
            }
            .fe-shake { animation: fe-shake .38s ease-in-out; }
            @media (prefers-reduced-motion: reduce) { .fe-shake { animation: none; } }
        `;
        document.head.appendChild(st);
    }

    const byId = (t) => (typeof t === 'string' ? document.getElementById(t) : t);

    /**
     * أين تُكتب الرسالة: بعد غلاف الحقل إن كان داخل مجموعةٍ (أيقونة، زرّا
     * زيادة/إنقاص) كي لا تنكسر المجموعة — وإلا بعد الحقل نفسه.
     */
    function anchorOf(el) {
        return el.closest('.input-wrapper, .input-group') || el;
    }

    function clear(target) {
        const el = byId(target);
        if (!el) return;
        el.classList.remove('fe-invalid');
        el.removeAttribute('aria-invalid');
        const msgId = el.dataset.feMsg;
        if (msgId) {
            const m = document.getElementById(msgId);
            if (m) m.remove();
            const described = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(x => x && x !== msgId);
            if (described.length) el.setAttribute('aria-describedby', described.join(' '));
            else el.removeAttribute('aria-describedby');
            delete el.dataset.feMsg;
        }
    }

    function clearAll(root) {
        (root || document).querySelectorAll('.fe-invalid').forEach(clear);
        (root || document).querySelectorAll('.fe-msg').forEach(m => m.remove());
    }

    function mark(el, message) {
        injectStyle();
        clear(el);
        const msgId = (el.id || 'fe' + Math.random().toString(36).slice(2, 8)) + '-fe-msg';
        const msg = document.createElement('div');
        msg.className = 'fe-msg';
        msg.id = msgId;
        msg.textContent = message;
        anchorOf(el).insertAdjacentElement('afterend', msg);

        el.classList.add('fe-invalid');
        el.setAttribute('aria-invalid', 'true');
        el.setAttribute('aria-describedby', [el.getAttribute('aria-describedby'), msgId].filter(Boolean).join(' '));
        el.dataset.feMsg = msgId;

        // يختفي الخطأ لحظة يبدأ التصحيح — لا ينتظر ضغطة «اطلب» التالية
        if (!el.dataset.feBound) {
            el.dataset.feBound = '1';
            const off = () => clear(el);
            el.addEventListener('input', off);
            el.addEventListener('change', off);
        }
    }

    function reveal(el, focusEl) {
        const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const where = anchorOf(el);
        where.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        where.classList.remove('fe-shake');
        void where.offsetWidth;            // إعادة تشغيل الحركة إن تكرّر الخطأ نفسه
        where.classList.add('fe-shake');
        setTimeout(() => where.classList.remove('fe-shake'), 450);
        const f = byId(focusEl) || el;
        // بعد انتهاء التمرير: التركيز الفوريّ يقطعه ويقفز للحقل بلا نعومة
        setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (_) { f.focus(); } }, reduce ? 0 : 320);
    }

    /** خطأٌ واحد في مكانه، مع التمرير إليه */
    function show(target, message, opts) {
        const el = byId(target);
        if (!el) return false;
        mark(el, message);
        reveal(el, opts && opts.focus);
        return true;
    }

    /**
     * كل الأخطاء معاً — يرى المستخدم كل ما ينقص دفعةً واحدة بدل اكتشافه
     * خطأً بعد خطأ — والصفحة تنزل إلى الأوّل.
     * @returns {number} عدد ما عُرض
     */
    function showAll(errors) {
        clearAll();
        const shown = [];
        for (const e of errors || []) {
            const el = byId(e.target);
            if (!el) continue;
            mark(el, e.message);
            shown.push(e);
        }
        if (shown.length) reveal(byId(shown[0].target), shown[0].focus);
        return shown.length;
    }

    // ─── الإبلاغ: أيّ الخانات يتعثّر فيها العملاء ────────────────────────
    // يُرسَل اسم الخانة والرسالة فقط — لا ما كتبه العميل. لا ينتظره شيء
    // ولا يُظهر خطأً إن فشل: هو للإدارة (لوحة «تعثّر العملاء»)، لا للعميل.
    let lastSig = '', lastAt = 0;
    const ClientErrors = {
        report(form, errors, source) {
            try {
                const token = localStorage.getItem('token');
                if (!errors || !errors.length) return;
                // نموذجا التسجيل يملؤهما من لم يدخل بعد — مسارٌ مجهولٌ محدود لهما وحدهما
                const anon = !token && (form === 'register' || form === 'captain_signup');
                if (!token && !anon) return;
                const fields = errors.map(e => ({
                    field: typeof e.target === 'string' ? e.target : ((e.target && e.target.id) || 'unknown'),
                    message: String(e.message || '').slice(0, 200)
                }));
                // الضغطة المكرّرة على «اطلب» بالخطأ نفسه لا تُسجَّل مرّتين
                const sig = form + source + fields.map(f => f.field).join(',');
                if (sig === lastSig && Date.now() - lastAt < 20000) return;
                lastSig = sig; lastAt = Date.now();
                const base = (typeof API_URL !== 'undefined' && API_URL) || '';
                fetch(`${base}/api/client-errors${anon ? '/anonymous' : ''}`, {
                    method: 'POST',
                    keepalive: true,
                    headers: Object.assign({ 'Content-Type': 'application/json' },
                        anon ? {} : { 'Authorization': `Bearer ${token}` }),
                    body: JSON.stringify({ form, source, fields, appVersion: window.APP_VERSION || '' })
                }).catch(() => {});
            } catch (_) { /* الإبلاغ لا يُعطّل الطلب أبداً */ }
        }
    };

    /** «في خانتين تحتاجان تصحيح» — تنبيهٌ قصير فوق، والتفصيل تحت كل خانة */
    function toastCount(n) {
        if (!window.Swal || !n) return;
        Swal.fire({
            toast: true, position: 'top', icon: 'warning', timer: 3500, showConfirmButton: false,
            title: n === 1 ? 'في خانة تحتاج تصحيح — موضّحة بالأحمر'
                 : n === 2 ? 'في خانتين تحتاجان تصحيح — موضّحتان بالأحمر'
                 : `في ${n} خانات تحتاج تصحيح — موضّحة بالأحمر`
        });
    }

    /**
     * المسار الكامل لنموذج: الأخطاء في خاناتها + تنبيهٌ بعددها + تسجيلها للإدارة.
     * fallback(message): إن لم تُوجد خانةٌ لأيّ خطأ (خطأٌ عامّ) — تعرضه الصفحة بطريقتها.
     * @returns {number} ما عُرض في خانات
     */
    function report(errors, opts) {
        const o = opts || {};
        if (!errors || !errors.length) return 0;
        const n = showAll(errors);
        if (n) toastCount(n);
        else if (o.fallback) o.fallback(errors[0].message);
        if (o.form) ClientErrors.report(o.form, errors, o.source || 'client');
        return n;
    }

    /**
     * أخطاء الخادم ← خانات الصفحة. الخادم يعيد field أو errors[{field, message}]
     * (middleware/validate.js، middleware/validateMiddleware.js)، والصفحة تعطي
     * خريطة أسمائه إلى معرّفات خاناتها.
     */
    function fromServer(body, map) {
        const b = body || {};
        const list = Array.isArray(b.errors) && b.errors.length ? b.errors
            : (b.field ? [{ field: b.field, message: b.message }] : []);
        const seen = new Set();
        const out = [];
        for (const e of list) {
            const target = map && map[e.field];
            if (!target || seen.has(target) || !document.getElementById(target)) continue;
            seen.add(target);
            out.push({ target, message: e.message || b.message || '' });
        }
        return out;
    }

    window.FieldErrors = { show, showAll, clear, clearAll, report, fromServer, toastCount };
    window.SudanPhone = SudanPhone;
    window.ClientErrors = ClientErrors;
})();
