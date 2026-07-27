/**
 * حذف الحساب من داخل التطبيق — window.openDeleteAccount()
 *
 * شرط إلزامي في App Store (البند 5.1.1(v)) وفي Google Play: أي تطبيق يسمح
 * بإنشاء حساب يجب أن يسمح بحذفه من داخله، لا بمراسلة الدعم.
 *
 * التأكيد برقم الهاتف لا بكلمة المرور: مستخدمو Google Sign-In لا يعرفون
 * كلمة مرورهم أصلاً (تُولَّد عشوائياً في /api/auth/google/complete)، فطلبها
 * كان سيمنعهم من الحذف — وهو بحدّ ذاته سبب رفض.
 *
 * السيرفر: DELETE /api/auth/me  (routes/auth.js)
 */
(function () {
    'use strict';

    const LOGIN_PAGES = {
        captain: 'captain-login.html',
        merchant: 'client-login.html',
        client: 'client-login.html',
        customer: 'client-login.html'
    };

    function getToken() {
        return (window.Auth && window.Auth.getToken && window.Auth.getToken())
            || localStorage.getItem('token');
    }

    function getRole() {
        try {
            return (JSON.parse(localStorage.getItem('user') || '{}').role) || 'client';
        } catch (_) {
            return 'client';
        }
    }

    // إدخال رقم الهاتف: SweetAlert متاح في كل الصفحات التي تستدعي هذه الوحدة،
    // ويبقى prompt احتياطاً لو لم يُحمَّل.
    async function askPhone() {
        if (window.Swal) {
            const res = await Swal.fire({
                title: 'حذف الحساب نهائياً',
                html: 'سيتم حذف اسمك ورقمك وبريدك وعناوينك المحفوظة نهائياً، ولن تتمكن من الدخول لهذا الحساب مرة أخرى.'
                    + '<br><br>لتأكيد الحذف اكتب رقم هاتف الحساب:',
                input: 'tel',
                inputPlaceholder: '09xxxxxxxx',
                inputAttributes: { inputmode: 'tel', autocomplete: 'off' },
                showCancelButton: true,
                confirmButtonText: 'حذف حسابي',
                cancelButtonText: 'إلغاء',
                confirmButtonColor: '#dc3545',
                reverseButtons: true,
                focusCancel: true
            });
            return res.isConfirmed ? (res.value || '').trim() : null;
        }
        const val = prompt('لتأكيد حذف حسابك نهائياً اكتب رقم هاتف الحساب:');
        return val === null ? null : val.trim();
    }

    async function notify(icon, title, text) {
        if (window.Swal) {
            await Swal.fire({ icon, title, text, confirmButtonColor: '#04553A' });
        } else {
            alert(`${title}\n\n${text || ''}`);
        }
    }

    window.openDeleteAccount = async function openDeleteAccount() {
        const token = getToken();
        if (!token) {
            await notify('warning', 'غير مسجّل الدخول', 'سجّل الدخول أولاً ثم أعد المحاولة.');
            return;
        }

        const confirmPhone = await askPhone();
        if (confirmPhone === null) return;          // ألغى المستخدم
        if (!confirmPhone) {
            await notify('warning', 'الرقم مطلوب', 'اكتب رقم هاتف الحساب لتأكيد الحذف.');
            return;
        }

        try {
            if (window.Swal) {
                Swal.fire({
                    title: 'جارٍ حذف الحساب...',
                    allowOutsideClick: false,
                    didOpen: () => Swal.showLoading()
                });
            }

            const res = await fetch('/api/auth/me', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ confirmPhone })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                await notify('error', 'لم يتم الحذف', data.message || 'حدث خطأ. حاول مجدداً.');
                return;
            }

            const loginPage = LOGIN_PAGES[getRole()] || 'client-login.html';
            localStorage.clear();
            sessionStorage.clear();
            await notify('success', 'تم حذف الحساب', data.message || 'تم حذف حسابك وبياناتك الشخصية.');
            window.location.replace(loginPage);
        } catch (err) {
            await notify('error', 'تعذّر الاتصال', 'تحقق من الإنترنت ثم أعد المحاولة.');
        }
    };
})();
