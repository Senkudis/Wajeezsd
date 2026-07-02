/**
 * Auto-adds a show/hide toggle button to any <input type="password">
 * that doesn't already have one on the page. Also catches fields added
 * later (SweetAlert2 modals, dynamically-built forms, ...) via MutationObserver.
 */
(function () {
    'use strict';

    var EYE_OPEN =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/>' +
        '<circle cx="12" cy="12" r="3"/></svg>';
    var EYE_CLOSED =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8' +
        'a21.6 21.6 0 0 1 5.06-6.06M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a21.7 21.7 0 0 1-2.61 3.81M14.12 ' +
        '14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

    // Skip fields that already ship with their own eye-icon toggle button
    // (e.g. client-login.html / client-register.html) to avoid duplicates.
    function hasExistingToggle(input) {
        var scope = (input.closest && input.closest('.input-group')) || input.parentElement;
        return !!(scope && scope.querySelector(
            '.bi-eye, .bi-eye-fill, .bi-eye-slash, .bi-eye-slash-fill, .fa-eye, .fa-eye-slash, [data-pw-toggle-btn]'
        ));
    }

    function wrapField(input) {
        if (!input || input.dataset.pwToggled === '1') return;
        if (hasExistingToggle(input)) { input.dataset.pwToggled = '1'; return; }
        input.dataset.pwToggled = '1';

        var wrapper = document.createElement('div');
        wrapper.className = 'pw-toggle-wrap';
        wrapper.style.cssText = 'position:relative;width:100%;';

        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
        input.style.paddingInlineEnd = '38px';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-pw-toggle-btn', '1');
        btn.setAttribute('aria-label', 'إظهار كلمة المرور');
        btn.tabIndex = -1;
        btn.style.cssText =
            'position:absolute;inset-inline-end:10px;top:50%;transform:translateY(-50%);' +
            'background:none;border:none;padding:2px;margin:0;cursor:pointer;color:#8a8f98;' +
            'display:flex;align-items:center;line-height:0;z-index:5;';
        btn.innerHTML = EYE_OPEN;

        btn.addEventListener('click', function () {
            var showing = input.type === 'password';
            input.type = showing ? 'text' : 'password';
            btn.innerHTML = showing ? EYE_CLOSED : EYE_OPEN;
            btn.setAttribute('aria-label', showing ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
        });

        wrapper.appendChild(btn);
    }

    function scan(root) {
        (root || document).querySelectorAll('input[type="password"]').forEach(wrapField);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { scan(document); });
    } else {
        scan(document);
    }

    var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
            m.addedNodes.forEach(function (node) {
                if (node.nodeType !== 1) return;
                if (node.matches && node.matches('input[type="password"]')) wrapField(node);
                else if (node.querySelectorAll) scan(node);
            });
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.PasswordToggle = { scan: scan };
})();
