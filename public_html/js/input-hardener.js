/**
 * ⌨️ تقويم الإدخال في كل الحقول — يعمل بلا تعديل أي صفحة.
 *
 * ثلاث علل عامّة كانت تتكرّر في كل نموذج:
 *
 * ١) **الأرقام العربية‑الهندية.** لوحة المفاتيح العربية تكتب ٠١٢٣، والخادم
 *    ينظّف بـ [^0-9] فيُسقطها كلّها. فمن كتب رقمه بلوحته العربية سُجّل
 *    برقمٍ مبتور أو فارغ، بلا خطأ يُرى. نُحوّلها هنا لحظة الكتابة، فيرى
 *    المستخدم بعينه ما سيُرسَل فعلاً.
 *
 * ٢) **اتجاه الحقل.** الصفحة rtl، والهاتف والبريد والرقم محتوىً ltr. بلا
 *    dir صريح تقفز علامة + إلى الجانب الخطأ ويضطرب موضع المؤشر أثناء
 *    الكتابة. كانت موضوعةً في بعض الحقول ومنسيّةً في غيرها.
 *
 * ٣) **المسافات الطرفية.** لصقُ رقمٍ أو بريدٍ من رسالة يجرّ معه مسافة،
 *    فيفشل تسجيل الدخول بلا سببٍ ظاهر للمستخدم.
 *
 * التفويض على مستوى المستند، فيشمل الحقول المُضافة بعد التحميل.
 */
(function () {
    'use strict';

    const AR_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;
    const foldDigits = (s) => String(s).replace(AR_DIGITS,
        d => String(d.charCodeAt(0) >= 0x06F0 ? d.charCodeAt(0) - 0x06F0 : d.charCodeAt(0) - 0x0660));

    const NUMERIC_TYPES = ['tel', 'number'];
    const LTR_TYPES     = ['tel', 'number', 'email', 'url', 'password'];

    function isNumericField(el) {
        if (NUMERIC_TYPES.includes(el.type)) return true;
        // حقولٌ نصّية تحمل أرقاماً فعلاً (الرقم الوطني، اللوحة، الرمز)
        return el.inputMode === 'numeric' || el.dataset.numeric !== undefined;
    }

    function harden(el) {
        if (!el || el.dataset.hardened) return;
        if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
        el.dataset.hardened = '1';

        if (LTR_TYPES.includes(el.type) && !el.getAttribute('dir')) {
            el.setAttribute('dir', 'ltr');
        }
        // لوحة أرقام على الجوال لحقلٍ نصّيّ يحمل أرقاماً
        if (el.dataset.numeric !== undefined && !el.inputMode) {
            el.inputMode = 'numeric';
        }
    }

    document.addEventListener('input', (e) => {
        const el = e.target;
        if (!isNumericField(el)) return;

        const before = el.value;
        const folded = foldDigits(before);
        if (folded === before) return;

        // 🔑 الحفاظ على موضع المؤشر: الاستبدال حرفٌ بحرف فلا يتغيّر الطول
        const pos = el.selectionStart;
        el.value = folded;
        try { el.setSelectionRange(pos, pos); } catch (_) { /* أنواعٌ لا تدعمه */ }
    }, true);

    document.addEventListener('blur', (e) => {
        const el = e.target;
        if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
        if (el.type === 'password') return;          // مسافةٌ مقصودة أحياناً
        if (typeof el.value !== 'string') return;
        const trimmed = el.value.trim();
        if (trimmed !== el.value) el.value = trimmed;
    }, true);

    function sweep(root) {
        (root || document).querySelectorAll('input, textarea').forEach(harden);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => sweep());
    } else {
        sweep();
    }

    // حقولٌ تُبنى ديناميكياً (النوافذ والقوائم) تُقوَّم عند ظهورها
    if (typeof MutationObserver === 'function') {
        new MutationObserver((muts) => {
            for (const m of muts) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.matches && node.matches('input, textarea')) harden(node);
                    else if (node.querySelectorAll) sweep(node);
                }
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
    }

    window.InputHardener = { foldDigits, harden, sweep };
})();
