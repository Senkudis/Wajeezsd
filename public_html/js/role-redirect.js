/**
 * 🚪 بابٌ يدلّ على بابه.
 *
 * العطل الذي يُغلقه: من يدخل ببياناته الصحيحة من الباب الخطأ — عميلٌ في
 * صفحة الكباتن، أو كابتنٌ في صفحة العملاء — كان يُقال له «عذراً، هذا
 * الحساب ليس مسجلاً ككابتن» ثم يُترك واقفاً. لا يُقال له ما حسابه، ولا
 * أين بابه، ولا ماذا يفعل الآن. فيظنّ حسابه معطوباً ويعيد التسجيل بحسابٍ
 * ثانٍ — أو يتصل بالدعم.
 *
 * والمهمّ أن الدخول **نجح فعلاً**: كلمة المرور صحيحة والخادم أصدر توكناً،
 * والصفحة وحدها هي التي رفضت. فنحن نعرف من هو ونعرف أين مكانه. أن نطلب
 * منه إعادة الكتابة في صفحةٍ أخرى عبثٌ — الزرّ يُدخله حيث ينتمي مباشرة.
 */
(function () {
    'use strict';

    var HOMES = {
        client:   { url: 'index.html',              label: 'تطبيق العملاء',  who: 'حساب عميل' },
        customer: { url: 'index.html',              label: 'تطبيق العملاء',  who: 'حساب عميل' },
        merchant: { url: 'merchant-dashboard.html', label: 'لوحة التاجر',    who: 'حساب تاجر' },
        captain:  { url: 'captain-dashboard.html',  label: 'لوحة الكابتن',   who: 'حساب كابتن' },
        admin:    { url: 'admin.html',              label: 'لوحة الإدارة',   who: 'حساب إداري' }
    };

    function homeFor(role) {
        return HOMES[role] || null;
    }

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /**
     * يبني نصّ التنبيه: يقول ما حسابُه فعلاً، ويعطيه زرّاً يدخله به.
     * يُعاد HTML لأن showAlert في صفحات الدخول تستعمل innerHTML.
     */
    function wrongDoorHtml(user, expectedLabel) {
        var home = homeFor(user && user.role);
        var name = user && user.name ? esc(user.name) : '';

        if (!home) {
            return 'هذا الحساب ليس ' + esc(expectedLabel) + '. تواصل مع الدعم.';
        }

        return '<div>'
            + '<div class="fw-bold mb-1">' + (name ? 'أهلاً ' + name + ' — ' : '')
            + 'حسابك ' + esc(home.who) + '، لا ' + esc(expectedLabel) + '.</div>'
            + '<div class="small mb-2">بياناتك صحيحة، لكنك في الصفحة الخطأ. ادخل من هنا:</div>'
            + '<button type="button" class="btn btn-sm btn-primary fw-bold" data-role-go>'
            + '<i class="bi bi-box-arrow-in-left ms-1"></i> الدخول إلى ' + esc(home.label)
            + '</button>'
            + '</div>';
    }

    /**
     * يربط زرّ التحويل: يحفظ الجلسة التي صدرت فعلاً ثم ينقله.
     *
     * ⚠️ يُستدعى بعد حقن النصّ — الزرّ لم يكن موجوداً قبله.
     *    و replace لا href: لا نترك الباب الخطأ في سجلّ الرجوع.
     */
    function bind(token, user) {
        var btn = document.querySelector('[data-role-go]');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var home = homeFor(user && user.role);
            if (!home) return;
            try {
                if (window.Auth && window.Auth.setAuth) {
                    window.Auth.setAuth(token, user);
                } else {
                    localStorage.setItem('token', token);
                    localStorage.setItem('user', JSON.stringify(user));
                    localStorage.setItem('userName', user.name || '');
                }
                localStorage.setItem('role', user.role);
                if (window.CityService && user.city) CityService.setCity(user.city);
            } catch (e) { /* التخزين قد يكون محجوباً — التحويل أهمّ */ }
            window.location.replace(home.url);
        });
    }

    window.RoleRedirect = { homeFor: homeFor, wrongDoorHtml: wrongDoorHtml, bind: bind };
})();
