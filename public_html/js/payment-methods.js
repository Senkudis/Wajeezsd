/**
 * 💳 طرق الدفع — بنكك، ماي كاشي، فوري، أوكاش.
 *
 * مرآة utils/paymentMethods.js في الخادم: القائمة نفسها بالترتيب نفسه،
 * والفحص نفسه (رقمٌ من 4 إلى 30 خانة، واسمٌ من 3 أحرف فأكثر).
 *
 * واجهتان:
 *   • التاجر يختار طريقةً أو أكثر ويملأ لكلٍّ رقمها واسمها:
 *       PaymentMethods.renderPicker(box, { value })
 *       PaymentMethods.readPicker(box)  → { methods, errors }
 *   • العميل يرى ما يقبله المتجر، يختار واحدةً فتظهر بياناتها:
 *       PaymentMethods.renderPay(box, methods)
 *
 * الخانات بمعرّفاتٍ ثابتة (pm-bankak-num …) لتعرض FieldErrors الخطأ تحتها،
 * وخطأ الخادم (paymentMethods.bankak.accountNumber) يُحوَّل إليها بـ inputFor.
 */
(function (global) {
    'use strict';

    var LIST = [
        { id: 'bankak',  label: 'بنكك',     numberLabel: 'رقم الحساب',  hint: 'رقم حساب بنكك (بنك الخرطوم)' },
        { id: 'mycashi', label: 'ماي كاشي', numberLabel: 'رقم المحفظة', hint: 'رقم محفظة ماي كاشي' },
        { id: 'fawry',   label: 'فوري',     numberLabel: 'رقم الحساب',  hint: 'رقم حساب فوري' },
        { id: 'ocash',   label: 'أوكاش',    numberLabel: 'رقم الحساب',  hint: 'رقم حساب أوكاش' }
    ];
    var NUMBER_MIN = 4, NUMBER_MAX = 30, NAME_MIN = 3, NAME_MAX = 80;
    var ICON_DIR = 'icons/payments/';

    function meta(id) {
        for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
        return null;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    var AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
                      '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
    function cleanNumber(v) {
        return String(v == null ? '' : v).replace(/[٠-٩۰-۹]/g, function (d) { return AR_DIGITS[d]; })
            .replace(/[\s\-_.]/g, '').trim();
    }
    function cleanName(v) {
        return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    /** أيقونة الطريقة — وللحساب البنكيّ القديم بلا طريقةٍ معروفة: رسم بنكٍ عامّ */
    function iconHtml(id, size, label) {
        size = size || 40;
        var m = meta(id);
        if (m) {
            return '<img class="pm-icon" src="' + ICON_DIR + id + '.png" width="' + size + '" height="' + size +
                '" alt="" aria-hidden="true" loading="lazy" decoding="async">';
        }
        return '<span class="pm-icon pm-icon-bank" style="width:' + size + 'px;height:' + size + 'px" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="' + Math.round(size * 0.55) + '" height="' + Math.round(size * 0.55) + '" fill="currentColor">' +
            '<path d="M12 2 2 7v2h20V7L12 2zm-7 9v7h3v-7H5zm5.5 0v7h3v-7h-3zM16 11v7h3v-7h-3zM2 20v2h20v-2H2z"/></svg></span>';
    }

    /* ─── الأنماط: تُحقن مرّة ─────────────────────────────────────────── */
    var STYLE_ID = 'pm-style';
    var CSS = [
        '.pm-icon{border-radius:12px;object-fit:cover;flex-shrink:0;display:block;box-shadow:0 1px 3px rgba(15,23,42,.12)}',
        '.pm-icon-bank{display:inline-flex;align-items:center;justify-content:center;background:#e2e8f0;color:#334155}',
        '.pm-picker{display:grid;gap:10px}',
        '.pm-opt{border:1.5px solid #e2e8f0;border-radius:14px;background:#fff;transition:border-color .15s,box-shadow .15s}',
        '.pm-opt.is-on{border-color:#048c5b;box-shadow:0 0 0 3px rgba(4,140,91,.12)}',
        '.pm-head{display:flex;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;margin:0;min-height:60px}',
        '.pm-head input{position:absolute;opacity:0;width:1px;height:1px}',
        '.pm-name{flex:1;font-weight:800;font-size:15px;color:#0f172a}',
        '.pm-tick{width:24px;height:24px;border-radius:50%;border:2px solid #cbd5e1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}',
        '.pm-opt.is-on .pm-tick{background:#048c5b;border-color:#048c5b}',
        '.pm-opt.is-on .pm-tick::after{content:"";width:6px;height:11px;border:solid #fff;border-width:0 2.5px 2.5px 0;transform:rotate(45deg) translate(-1px,-1px)}',
        '.pm-head input:focus-visible ~ .pm-tick{outline:3px solid #60a5fa;outline-offset:2px}',
        '.pm-fields{padding:0 12px 12px;display:grid;gap:8px}',
        '.pm-fields[hidden]{display:none}',
        '.pm-fields label{font-size:12.5px;font-weight:700;color:#475569;margin:0}',
        '.pm-fields input{width:100%;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px 12px;font:inherit;font-size:16px;background:#f8fafc}',
        '.pm-fields input:focus{outline:none;border-color:#048c5b;background:#fff}',
        /* شاشة الدفع للعميل */
        '.pm-pay{display:grid;gap:10px}',
        '.pm-pay-title{font-size:13px;font-weight:800;color:#334155;margin:0}',
        '.pm-choices{display:flex;flex-wrap:wrap;gap:8px}',
        '.pm-choice{display:inline-flex;align-items:center;gap:8px;border:1.5px solid #e2e8f0;background:#fff;border-radius:12px;padding:6px 12px 6px 8px;min-height:48px;font:inherit;font-weight:700;font-size:14px;color:#0f172a;cursor:pointer;transition:all .15s}',
        '.pm-choice[aria-checked="true"]{border-color:#048c5b;background:#ecfdf5;box-shadow:0 0 0 3px rgba(4,140,91,.12)}',
        '.pm-choice:focus-visible{outline:3px solid #60a5fa;outline-offset:2px}',
        '.pm-detail{border:1.5px dashed #cbd5e1;border-radius:14px;padding:12px;background:#f8fafc;display:grid;gap:8px}',
        '.pm-detail-head{display:flex;align-items:center;gap:10px;font-weight:800;color:#0f172a}',
        '.pm-row{display:flex;align-items:center;justify-content:space-between;gap:8px}',
        '.pm-k{font-size:12.5px;color:#64748b;font-weight:700}',
        '.pm-v{font-weight:800;color:#0f172a;word-break:break-all}',
        '.pm-num{font-size:18px;letter-spacing:.5px;font-variant-numeric:tabular-nums}',
        '.pm-copy{border:0;background:#048c5b;color:#fff;border-radius:10px;padding:8px 14px;min-height:40px;font:inherit;font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap}',
        '.pm-copy:focus-visible{outline:3px solid #60a5fa;outline-offset:2px}',
        '.pm-empty{font-size:13px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:10px 12px;margin:0}',
        /* الوضع الليلي */
        'body.dark-mode .pm-opt,body.dark-mode .pm-choice{background:#1f2937;border-color:#374151}',
        'body.dark-mode .pm-name,body.dark-mode .pm-choice,body.dark-mode .pm-v,body.dark-mode .pm-detail-head{color:#f1f5f9}',
        'body.dark-mode .pm-fields input,body.dark-mode .pm-detail{background:#111827;border-color:#374151;color:#f1f5f9}',
        'body.dark-mode .pm-choice[aria-checked="true"]{background:#064e3b;border-color:#10b981}',
        'body.dark-mode .pm-fields label,body.dark-mode .pm-k,body.dark-mode .pm-pay-title{color:#94a3b8}',
        '@media (prefers-reduced-motion:reduce){.pm-opt,.pm-tick,.pm-choice{transition:none}}'
    ].join('');

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = CSS;
        (document.head || document.documentElement).appendChild(el);
    }

    /* ─── التاجر: اختيار الطرق وتعبئتها ─────────────────────────────── */

    /**
     * @param {HTMLElement} box
     * @param {{ value?: Array<{method, accountNumber, accountName}> }} opts
     */
    function renderPicker(box, opts) {
        if (!box) return;
        injectStyle();
        var value = (opts && opts.value) || [];
        var byId = {};
        value.forEach(function (v) { if (v && v.method) byId[v.method] = v; });

        box.classList.add('pm-picker');
        box.setAttribute('role', 'group');
        if (!box.getAttribute('aria-label')) box.setAttribute('aria-label', 'طرق الدفع التي تستلم بها');
        box.innerHTML = LIST.map(function (m) {
            var v = byId[m.id];
            var on = !!v;
            return '<div class="pm-opt' + (on ? ' is-on' : '') + '" data-method="' + m.id + '">' +
                '<label class="pm-head" for="pm-' + m.id + '">' +
                    iconHtml(m.id, 44) +
                    '<span class="pm-name">' + esc(m.label) + '</span>' +
                    '<input type="checkbox" id="pm-' + m.id + '" class="pm-check"' + (on ? ' checked' : '') +
                        ' aria-controls="pm-' + m.id + '-fields" aria-expanded="' + on + '">' +
                    '<span class="pm-tick" aria-hidden="true"></span>' +
                '</label>' +
                '<div class="pm-fields" id="pm-' + m.id + '-fields"' + (on ? '' : ' hidden') + '>' +
                    '<label for="pm-' + m.id + '-num">' + esc(m.numberLabel) + '</label>' +
                    '<input type="text" id="pm-' + m.id + '-num" inputmode="numeric" autocomplete="off" dir="ltr" maxlength="40"' +
                        ' placeholder="' + esc(m.hint) + '" value="' + esc(v ? v.accountNumber : '') + '">' +
                    '<label for="pm-' + m.id + '-name">اسم صاحب الحساب (كما هو مسجّل)</label>' +
                    '<input type="text" id="pm-' + m.id + '-name" autocomplete="name" maxlength="' + NAME_MAX + '"' +
                        ' value="' + esc(v ? v.accountName : '') + '">' +
                '</div>' +
            '</div>';
        }).join('');

        if (box._pmBound) return;
        box._pmBound = true;
        box.addEventListener('change', function (e) {
            var chk = e.target.closest && e.target.closest('.pm-check');
            if (!chk) return;
            var opt = chk.closest('.pm-opt');
            var fields = opt.querySelector('.pm-fields');
            opt.classList.toggle('is-on', chk.checked);
            fields.hidden = !chk.checked;
            chk.setAttribute('aria-expanded', chk.checked ? 'true' : 'false');
            if (chk.checked) {
                var num = fields.querySelector('input');
                if (num && !num.value) setTimeout(function () { num.focus(); }, 60);
            }
        });
    }

    /** المختار والمكتوب، مع أخطاءٍ بخاناتها — بفحص الخادم نفسه */
    function readPicker(box) {
        var methods = [], errors = [];
        if (!box) return { methods: methods, errors: errors };
        LIST.forEach(function (m) {
            var chk = box.querySelector('#pm-' + m.id);
            if (!chk || !chk.checked) return;
            var num = cleanNumber((box.querySelector('#pm-' + m.id + '-num') || {}).value);
            var name = cleanName((box.querySelector('#pm-' + m.id + '-name') || {}).value);
            if (!num) errors.push({ target: 'pm-' + m.id + '-num', message: 'اكتب ' + m.numberLabel + ' في ' + m.label });
            else if (!/^\d+$/.test(num) || num.length < NUMBER_MIN || num.length > NUMBER_MAX) {
                errors.push({ target: 'pm-' + m.id + '-num', message: m.numberLabel + ' أرقامٌ فقط (من ' + NUMBER_MIN + ' إلى ' + NUMBER_MAX + ' رقماً)' });
            }
            if (name.length < NAME_MIN) errors.push({ target: 'pm-' + m.id + '-name', message: 'اكتب اسم صاحب الحساب كما هو مسجّل في ' + m.label });
            methods.push({ method: m.id, accountNumber: num, accountName: name });
        });
        if (!methods.length) {
            errors.unshift({ target: box.id || 'pm-bankak', message: 'اختر طريقة دفعٍ واحدة على الأقل ليدفع لك العملاء' });
        }
        return { methods: methods, errors: errors };
    }

    /** خانة خطأ الخادم: paymentMethods.bankak.accountNumber ← pm-bankak-num */
    function inputFor(field) {
        var m = /^paymentMethods\.(\w+)\.(accountNumber|accountName)$/.exec(String(field || ''));
        if (m) return 'pm-' + m[1] + '-' + (m[2] === 'accountNumber' ? 'num' : 'name');
        return null;   // «paymentMethods» وحدها: خطأٌ على المجموعة — تعرضه الصفحة عليها
    }

    /* ─── العميل: اختيار طريقة وعرض بياناتها ────────────────────────── */

    function copyText(text, btn) {
        var done = function () {
            if (btn) {
                var old = btn.textContent;
                btn.textContent = 'تم النسخ';
                setTimeout(function () { btn.textContent = old; }, 1600);
            }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
        } else { fallbackCopy(text); done(); }
    }
    function fallbackCopy(text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text; ta.setAttribute('readonly', '');
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        } catch (_) { /* لا شيء — الرقم ظاهرٌ ويُنسخ يدوياً */ }
    }

    function detailHtml(pm) {
        var m = meta(pm.method);
        var label = pm.label || (m ? m.label : 'تحويل بنكي');
        return '<div class="pm-detail" aria-live="polite">' +
            '<div class="pm-detail-head">' + iconHtml(pm.method, 36) + '<span>' + esc(label) + '</span></div>' +
            '<div class="pm-row"><div><div class="pm-k">' + esc(m ? m.numberLabel : 'رقم الحساب') + '</div>' +
                '<div class="pm-v pm-num" dir="ltr">' + esc(pm.accountNumber) + '</div></div>' +
                '<button type="button" class="pm-copy" data-copy="' + esc(pm.accountNumber) + '" aria-label="نسخ ' + esc(m ? m.numberLabel : 'رقم الحساب') + '">نسخ الرقم</button></div>' +
            (pm.accountName ? '<div><div class="pm-k">اسم صاحب الحساب</div><div class="pm-v">' + esc(pm.accountName) + '</div></div>' : '') +
        '</div>';
    }

    /**
     * @param {HTMLElement} box
     * @param {Array<{method,label?,accountNumber,accountName}>} methods  من الخادم
     */
    function renderPay(box, methods) {
        if (!box) return;
        injectStyle();
        methods = (methods || []).filter(function (x) { return x && x.accountNumber; });
        box.classList.add('pm-pay');
        if (!methods.length) {
            box.innerHTML = '<p class="pm-empty">لم يُضف المتجر طريقة دفعٍ بعد — تواصل معه من المحادثة.</p>';
            return;
        }
        if (methods.length === 1) {
            box.innerHTML = '<p class="pm-pay-title">حوّل المبلغ إلى:</p>' + detailHtml(methods[0]);
        } else {
            box.innerHTML = '<p class="pm-pay-title" id="' + (box.id || 'pm') + '-t">اختر طريقة الدفع</p>' +
                '<div class="pm-choices" role="radiogroup" aria-labelledby="' + (box.id || 'pm') + '-t">' +
                methods.map(function (pm, i) {
                    var m = meta(pm.method);
                    return '<button type="button" class="pm-choice" role="radio" aria-checked="false" data-i="' + i + '" tabindex="' + (i ? -1 : 0) + '">' +
                        iconHtml(pm.method, 32) + '<span>' + esc(pm.label || (m ? m.label : 'تحويل بنكي')) + '</span></button>';
                }).join('') +
                '</div><div class="pm-slot"></div>';
        }
        box._pmMethods = methods;

        if (box._pmPayBound) return;
        box._pmPayBound = true;
        box.addEventListener('click', function (e) {
            var copy = e.target.closest && e.target.closest('.pm-copy');
            if (copy) { copyText(copy.getAttribute('data-copy'), copy); return; }
            var ch = e.target.closest && e.target.closest('.pm-choice');
            if (ch) select(box, Number(ch.getAttribute('data-i')));
        });
        // الأسهم بين الخيارات كما في أيّ مجموعة أزرار راديو
        box.addEventListener('keydown', function (e) {
            var ch = e.target.closest && e.target.closest('.pm-choice');
            if (!ch || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
            e.preventDefault();
            var all = box.querySelectorAll('.pm-choice');
            var i = Number(ch.getAttribute('data-i'));
            var step = (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? 1 : -1;   // RTL
            var n = (i + step + all.length) % all.length;
            select(box, n);
            all[n].focus();
        });
    }

    function select(box, i) {
        var all = box.querySelectorAll('.pm-choice');
        for (var k = 0; k < all.length; k++) {
            all[k].setAttribute('aria-checked', k === i ? 'true' : 'false');
            all[k].tabIndex = k === i ? 0 : -1;
        }
        var slot = box.querySelector('.pm-slot');
        if (slot && box._pmMethods && box._pmMethods[i]) slot.innerHTML = detailHtml(box._pmMethods[i]);
    }

    /** سطرٌ مختصر بأيقونات الطرق — لبطاقات الإدارة */
    function summaryHtml(methods) {
        methods = methods || [];
        if (!methods.length) return '';
        return methods.map(function (pm) {
            var m = meta(pm.method);
            return '<div style="display:flex;align-items:center;gap:8px;margin:4px 0">' + iconHtml(pm.method, 28) +
                '<div style="min-width:0"><div style="font-weight:800">' + esc(pm.label || (m ? m.label : 'تحويل بنكي')) +
                '</div><div dir="ltr" style="font-size:12.5px;text-align:right">' + esc(pm.accountNumber) + '</div>' +
                (pm.accountName ? '<div style="font-size:12px;color:#64748b">' + esc(pm.accountName) + '</div>' : '') +
                '</div></div>';
        }).join('');
    }

    /** اسم بنكٍ نصّيّ قديم ← أقرب طريقة (مرآة guessMethod في الخادم) */
    function guessMethod(bankName) {
        var s = String(bankName || '').toLowerCase();
        if (!s) return null;
        if (/بنكك|الخرطوم|bankak/.test(s)) return 'bankak';
        if (/كاشي|cashi/.test(s)) return 'mycashi';
        if (/فوري|fawry|fawri/.test(s)) return 'fawry';
        if (/[اأ]وكاش|o-?cash|ocash|أمدرمان الوطني/.test(s)) return 'ocash';
        return null;
    }

    /**
     * طرق المتجر للتعديل: المحفوظة، أو — لمتجرٍ سجّل بالطريقة القديمة —
     * حسابه القديم في الطريقة المطابقة لاسم بنكه إن عُرفت.
     */
    function fromPlace(place) {
        if (!place) return [];
        if (Array.isArray(place.paymentMethods) && place.paymentMethods.length) return place.paymentMethods;
        var g = guessMethod(place.bankName);
        if (g && place.bankAccountNumber) {
            return [{ method: g, accountNumber: place.bankAccountNumber, accountName: place.bankAccountName || '' }];
        }
        return [];
    }

    global.PaymentMethods = {
        LIST: LIST,
        meta: meta,
        guessMethod: guessMethod,
        fromPlace: fromPlace,
        iconHtml: iconHtml,
        renderPicker: renderPicker,
        readPicker: readPicker,
        inputFor: inputFor,
        renderPay: renderPay,
        summaryHtml: function (methods) { injectStyle(); return summaryHtml(methods); },
        cleanNumber: cleanNumber
    };
})(window);
