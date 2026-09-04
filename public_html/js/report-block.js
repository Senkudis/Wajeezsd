/**
 * 🚩 الإبلاغ عن محتوى مسيء + حظر المستخدمين — واجهة مشتركة.
 *
 * لماذا ملف واحد: الآليتان تظهران في موضعين لا يشتركان في شيء آخر (آراء
 * المتجر، وشاشة المحادثة). نسخُ نافذة الإبلاغ في كل صفحة يعني نصّين
 * يفترقان مع أول تعديل، وسببَ بلاغٍ يُضاف في مكان وينسى في آخر.
 *
 * الخلفية: App Store Review Guideline 1.2 يشترط على أي تطبيق يعرض محتوىً من
 * المستخدمين آليةَ إبلاغ وقدرةً على حظر المسيئين. تعليقات التقييم في وجيز
 * تُعرض علناً، فالشرط ينطبق.
 *
 * يعتمد على: window.API_URL و SweetAlert2 (كلاهما محمَّل في الصفحات المعنية).
 */
(function () {
    'use strict';

    const API = () => (window.API_URL || '');

    function authHeaders() {
        const t = localStorage.getItem('token')
            || localStorage.getItem('clientToken')
            || localStorage.getItem('captainToken')
            || localStorage.getItem('merchantToken')
            || '';
        return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' }
                 : { 'Content-Type': 'application/json' };
    }

    function isLoggedIn() {
        return !!(localStorage.getItem('token') || localStorage.getItem('clientToken')
            || localStorage.getItem('captainToken') || localStorage.getItem('merchantToken'));
    }

    function requireLogin() {
        Swal.fire({
            icon: 'info',
            title: 'يلزم تسجيل الدخول',
            text: 'سجّل الدخول أولاً لتتمكّن من الإبلاغ.',
            confirmButtonText: 'تسجيل الدخول',
            showCancelButton: true,
            cancelButtonText: 'لاحقاً',
            confirmButtonColor: '#04553A'
        }).then(r => {
            if (r.isConfirmed) {
                localStorage.setItem('returnUrl', window.location.href);
                window.location.href = 'client-login.html';
            }
        });
    }

    // 📋 أسباب البلاغ تُجلب من الخادم مرّة واحدة — إضافة سبب أو حذفه لا
    //    ينتظر تحديث التطبيق على أجهزة المستخدمين.
    let _reasonsCache = null;
    async function loadReasons() {
        if (_reasonsCache) return _reasonsCache;
        try {
            const res = await fetch(`${API()}/api/reports/reasons`);
            const d = res.ok ? await res.json() : {};
            _reasonsCache = d.reasons || [];
        } catch (e) {
            // 🛟 احتياطي محلي: تعذُّر الشبكة لا يجوز أن يمنع الإبلاغ عن إساءة
            _reasonsCache = [
                { code: 'offensive',     label: 'لغة مسيئة أو بذيئة' },
                { code: 'harassment',    label: 'تحرّش أو تهديد' },
                { code: 'spam',          label: 'إزعاج أو إعلانات' },
                { code: 'inappropriate', label: 'محتوى غير لائق' },
                { code: 'other',         label: 'سبب آخر' }
            ];
        }
        return _reasonsCache;
    }

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

    /**
     * يفتح نافذة الإبلاغ.
     * @param {'rating'|'message'|'user'} targetType
     * @param {string} targetId
     * @param {Event} [event]
     */
    window.reportContent = async function (targetType, targetId, event) {
        if (event) event.stopPropagation();
        if (!isLoggedIn()) return requireLogin();

        const reasons = await loadReasons();
        const html = `
            <div style="text-align:right;">
                <div style="font-size:13px;color:#64748b;margin-bottom:10px;">
                    اختر سبب البلاغ. تُراجع البلاغات خلال ٢٤ ساعة.
                </div>
                <div id="rbReasons" style="display:flex;flex-direction:column;gap:6px;">
                    ${reasons.map((r, i) => `
                        <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;
                                      border:1.5px solid #e2e8f0;border-radius:10px;cursor:pointer;">
                            <input type="radio" name="rbReason" value="${esc(r.code)}" ${i === 0 ? 'checked' : ''}
                                   style="width:16px;height:16px;">
                            <span style="font-size:13.5px;font-weight:600;color:#334155;">${esc(r.label)}</span>
                        </label>`).join('')}
                </div>
                <textarea id="rbNote" maxlength="500" rows="2" class="swal2-textarea"
                          style="width:100%;margin:10px 0 0;font-size:13px;"
                          placeholder="تفاصيل إضافية (اختياري)"></textarea>
            </div>`;

        const { isConfirmed, value } = await Swal.fire({
            title: 'الإبلاغ عن محتوى',
            html,
            showCancelButton: true,
            confirmButtonText: 'إرسال البلاغ',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#dc2626',
            focusConfirm: false,
            preConfirm: () => ({
                reason: document.querySelector('input[name="rbReason"]:checked')?.value,
                note: (document.getElementById('rbNote')?.value || '').trim()
            })
        });
        if (!isConfirmed || !value?.reason) return;

        try {
            const res = await fetch(`${API()}/api/reports`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ targetType, targetId, reason: value.reason, note: value.note })
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.message || 'تعذّر إرسال البلاغ');
            Swal.fire({ icon: 'success', title: 'وصلنا بلاغك', text: d.message,
                        confirmButtonColor: '#04553A' });
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'تعذّر الإرسال', text: e.message,
                        confirmButtonColor: '#dc2626' });
        }
    };

    /**
     * يحظر مستخدماً بعد تأكيد.
     * @param {string} userId
     * @param {string} [userName] للعرض في نصّ التأكيد
     * @param {function} [onDone] يُستدعى بعد نجاح الحظر
     */
    window.blockUser = async function (userId, userName, onDone) {
        if (!isLoggedIn()) return requireLogin();

        const { isConfirmed } = await Swal.fire({
            icon: 'warning',
            title: 'حظر هذا المستخدم؟',
            html: `لن تصلك رسائل من <b>${esc(userName || 'هذا المستخدم')}</b> ولن تتمكّن من مراسلته.
                   <br><span style="font-size:12.5px;color:#64748b;">يمكنك رفع الحظر لاحقاً من إعدادات حسابك.</span>`,
            showCancelButton: true,
            confirmButtonText: 'نعم، احظره',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#dc2626'
        });
        if (!isConfirmed) return;

        try {
            const res = await fetch(`${API()}/api/reports/block/${userId}`, {
                method: 'POST', headers: authHeaders()
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.message || 'تعذّر الحظر');
            Swal.fire({ icon: 'success', title: 'تم الحظر', text: d.message,
                        confirmButtonColor: '#04553A' });
            if (typeof onDone === 'function') onDone();
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'تعذّر الحظر', text: e.message,
                        confirmButtonColor: '#dc2626' });
        }
    };

    window.unblockUser = async function (userId) {
        try {
            const res = await fetch(`${API()}/api/reports/block/${userId}`, {
                method: 'DELETE', headers: authHeaders()
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d.message || 'تعذّر رفع الحظر');
            return true;
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'خطأ', text: e.message, confirmButtonColor: '#dc2626' });
            return false;
        }
    };
})();
