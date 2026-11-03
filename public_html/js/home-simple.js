/**
 * تبسيط نموذج «اطلب كابتن» في الرئيسية — docs/customer-ui-redesign.md
 *
 * 1. المرسل غالباً هو العميل نفسه: نملأ اسمه ورقمه من حسابه ونطويهما في
 *    سطرٍ واحد «المرسل: أنت · تغيير». الخانتان تبقيان في الصفحة كما هما
 *    (التحقق والخادم يطلبانهما)، و field-errors.js يفتح الطيّ عند أيّ خطأ.
 * 2. زرّ «أنا المستلم» يملأ المستلم بضغطة.
 * 3. مسودة الزائر: بوابة الدخول كانت تُرجعه لنموذجٍ فارغ بعد أن ملأه.
 *
 * يُحمَّل بعد home.js؛ لا يغيّر أيّ معرّف ولا يمسّ وضع «اشترِ لي».
 */
(function () {
    'use strict';

    const DRAFT_KEY = 'guest_order_draft';
    const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
    const DRAFT_FIELDS = [
        'pickup-addr', 'pickup-lat', 'pickup-lng', 'pickup-name', 'pickup-phone',
        'dropoff-addr', 'dropoff-lat', 'dropoff-lng', 'dropoff-name', 'dropoff-phone',
        'details'
    ];

    const $ = (id) => document.getElementById(id);
    const val = (id) => ($(id)?.value || '').trim();
    const isErrand = () => !!window._errandMode || new URLSearchParams(location.search).get('mode') === 'errand';
    const validPhone = (p) => !!p && !!window.SudanPhone && SudanPhone.isValid(p);

    function me() {
        let u = {};
        try { u = JSON.parse(localStorage.getItem('user') || '{}') || {}; } catch (_) {}
        return {
            name: (u.shopName || u.name || localStorage.getItem('userName') || '').trim(),
            phone: (u.phone || '').trim()
        };
    }

    function setVal(id, v) {
        const el = $(id);
        if (!el) return;
        el.value = v;
        // يمسح أيّ خطأٍ ظاهر على الخانة كما لو كتبها العميل
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ── 1. المرسل ─────────────────────────────────────────────
    function setupSender() {
        const row = $('pickup-contact-row');
        if (!row || isErrand()) return;
        const self = me();

        if (!val('pickup-name') && self.name) setVal('pickup-name', self.name);
        if (!val('pickup-phone') && validPhone(self.phone)) setVal('pickup-phone', self.phone);

        const name = val('pickup-name');
        const phone = val('pickup-phone');
        if (!name || !validPhone(phone)) return;   // ناقص: تبقى الخانتان ظاهرتين

        const who = $('pickup-contact-who');
        if (who) who.textContent = (name === self.name && phone === self.phone) ? `إنت (${phone})` : `${name} (${phone})`;
        row.classList.add('cu-collapsed');

        $('pickup-contact-edit')?.addEventListener('click', () => {
            row.classList.remove('cu-collapsed');
            $('pickup-name')?.focus();
        });
    }

    // ── 2. أنا المستلم ────────────────────────────────────────
    function setupReceiverShortcut() {
        const btn = $('dropoff-me-btn');
        const self = me();
        if (!btn || !self.name || !validPhone(self.phone)) return;
        btn.classList.remove('d-none');
        btn.addEventListener('click', () => {
            setVal('dropoff-name', self.name);
            setVal('dropoff-phone', self.phone);
        });
    }

    // ── 3. مسودة الزائر ───────────────────────────────────────
    window.saveGuestDraft = function () {
        try {
            const data = {};
            DRAFT_FIELDS.forEach((id) => { data[id] = val(id); });
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), data }));
            localStorage.setItem('returnUrl', 'index.html?draft=1');
        } catch (_) { /* التخزين ممتلئ أو محجوب: يعود بنموذجٍ فارغ كما كان */ }
    };

    function restoreGuestDraft() {
        let draft = null;
        try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (_) {}
        if (!draft) return;
        // الاستعادة للمسجَّل فقط، ومرةً واحدة
        if (!localStorage.getItem('token')) return;
        localStorage.removeItem(DRAFT_KEY);
        if (Date.now() - (draft.at || 0) > DRAFT_TTL_MS || isErrand()) return;

        const d = draft.data || {};
        DRAFT_FIELDS.forEach((id) => {
            // ما ملأه الحساب أو «إعادة الطلب» أولى من المسودة
            if (d[id] && !val(id)) setVal(id, d[id]);
        });
        // السعر يحتاج إعدادات التسعير من الخادم — نعطيها لحظة
        if (d['pickup-lat'] && d['dropoff-lat'] && typeof window.onTripChanged === 'function') {
            setTimeout(() => { try { window.onTripChanged(); } catch (_) {} }, 1500);
        }
    }

    function init() {
        restoreGuestDraft();
        setupSender();
        setupReceiverShortcut();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
