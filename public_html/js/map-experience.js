/**
 * 🗺️ تجربة شاشة تحديد الموقع — طبقةٌ فوق home.js لا تمسّ منطق الطلب.
 *
 * ما تعالجه (من بحث أنماط «الدبوس الثابت في المركز» وحدود زمن الاستجابة):
 *
 * 1. الانتظار: الخريطة كانت تُبنى عند أوّل فتح، فيرى العميل «جارٍ تحميل
 *    الخريطة» ثانيةً أو أكثر في أكثر لحظةٍ يتوقّع فيها الاستجابة. هنا نبنيها
 *    مخفيّةً عند أوّل لمسةٍ للعميل في الصفحة (نيّة طلب)، فتفتح فوراً.
 * 2. الحركة: الدبوس كان يرتفع مع السحب بالإصبع فقط؛ التكبير بإصبعين والتحريك
 *    البرمجي كانا بلا أيّ إشارة. الآن كل حركة = الدبوس يرتفع والعنوان يخفت،
 *    والاستقرار = هبوطٌ ونبضة اهتزاز خفيفة تؤكّد «ثبت هنا».
 * 3. الاختيار بضغطة: «موقعي الحالي» وعناويني المحفوظة شرائح في البطاقة —
 *    أشيع الحالات (البيت/الشغل/مكاني الآن) لا تحتاج سحباً ولا بحثاً.
 * 4. الوضوح: البطاقة وزرّ التأكيد يقولان أيّ طرفٍ يُحدَّد الآن.
 */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const shell = () => $('static-map-container');
    const sheet = () => $('wj-map-sheet');
    let mode = 'pickup';

    // ── 4. نصوصٌ تتبع الطرف المُحدَّد ─────────────────────────────────
    const TEXT = {
        pickup:  { label: 'هنا بنستلم', confirm: 'تأكيد مكان الاستلام', idle: 'حرّك الخريطة لحدّي ما الدبوس يقيف على مكان الاستلام' },
        dropoff: { label: 'هنا بنوصّل', confirm: 'تأكيد مكان التوصيل', idle: 'حرّك الخريطة لحدّي ما الدبوس يقيف على مكان التوصيل' },
        stop:    { label: 'النقطة الإضافية', confirm: 'تأكيد النقطة', idle: 'حرّك الخريطة لحدّي ما الدبوس يقيف على المكان' }
    };

    function applyModeText(m) {
        mode = m;
        const t = TEXT[m === 'pickup' || m === 'dropoff' ? m : 'stop'];
        const lbl = $('wj-addr-label');
        if (lbl) lbl.textContent = t.label;
        const btn = $('map-confirm-btn');
        if (btn) btn.textContent = t.confirm;
        const pv = $('map-address-preview');
        if (pv) pv.innerHTML = '<span class="wj-idle-hint">' + t.idle + '</span>';
        const s = sheet();
        if (s) s.dataset.mode = (m === 'pickup' || m === 'dropoff') ? m : 'stop';
        renderQuickPicks();
    }

    // ── 3. اختيارٌ بضغطة ────────────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function renderQuickPicks() {
        const host = $('wj-quick-picks');
        if (!host) return;
        let saved = [];
        try { saved = (window.SavedLocations && SavedLocations.getAll()) || []; } catch (_) {}
        saved = saved.filter(l => Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng))).slice(0, 4);
        host.innerHTML =
            '<button type="button" class="wj-pick" data-pick="me"><i class="bi bi-crosshair" aria-hidden="true"></i>موقعي الحالي</button>' +
            saved.map(l => '<button type="button" class="wj-pick" data-pick="saved" data-id="' + esc(l.id) + '">' +
                '<i class="bi bi-bookmark-fill" aria-hidden="true"></i>' + esc(l.name) + '</button>').join('');
    }

    function goTo(lat, lng, text) {
        const m = window._activeMapInstance;
        if (!m) return;
        if (text) window._selectedSearchAddr = { text, lat, lng };
        m.panTo({ lat, lng });
        if (m.getZoom() < 17) m.setZoom(17);
    }

    document.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('.wj-pick');
        if (!b) return;
        if (b.dataset.pick === 'me') {
            if (window.locateMe) window.locateMe();
            return;
        }
        let loc = null;
        try { loc = SavedLocations.get(Number(b.dataset.id)); } catch (_) {}
        if (loc) goTo(Number(loc.lat), Number(loc.lng), loc.address || loc.name);
    });

    // ── 2. حالات الحركة والاستقرار ───────────────────────────────────────
    let wired = false;
    let moving = false;
    let userMoved = false;

    function setMoving(on) {
        if (moving === on) return;
        moving = on;
        const sh = shell(), s = sheet();
        if (sh) sh.classList.toggle('is-dragging', on);
        if (s) s.classList.toggle('is-moving', on);
    }

    function wireMap() {
        const m = window._activeMapInstance;
        if (!m || wired || !window.google || !google.maps) return;
        wired = true;
        // أيّ تغيّرٍ في المشهد (سحب، تكبير بإصبعين، تحريك برمجي) = حركة
        m.addListener('bounds_changed', () => setMoving(true));
        m.addListener('dragstart', () => { userMoved = true; });
        m.addListener('zoom_changed', () => { userMoved = true; });
        m.addListener('idle', () => {
            const was = moving;
            setMoving(false);
            // نبضةٌ واحدة قصيرة عند الهبوط بعد حركةٍ من العميل: «ثبت هنا»
            if (was && userMoved && navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
            userMoved = false;
        });
    }

    // الخريطة تُبنى داخل home.js — ننتظر ظهورها ثم نوصل المستمعين
    const waitMap = setInterval(() => {
        if (window._activeMapInstance) { wireMap(); clearInterval(waitMap); }
    }, 250);

    // ── 1. تسخين الخريطة قبل أن تُطلب ────────────────────────────────────
    //    تُبنى مخفيّةً (visibility) عند أوّل لمسة — تكلفة تحميل خريطةٍ واحدة
    //    لمن لمس صفحة الطلب، مقابل فتحٍ فوريٍّ بلا شاشة انتظار.
    let warmed = false;
    function warmUp() {
        if (warmed) return;
        warmed = true;
        const sh = shell();
        if (!sh || window._activeMapInstance || typeof window.initMap !== 'function') return;
        const tryInit = (n) => {
            if (window._activeMapInstance) return;
            if (!(window._googleMapsApiReady && window.google && google.maps)) {
                if (n < 40) setTimeout(() => tryInit(n + 1), 250);
                return;
            }
            if (sh.style.display === 'block') return;   // فُتحت فعلاً في الأثناء
            sh.style.visibility = 'hidden';
            sh.style.display = 'block';
            try { window.initMap(); } catch (_) {}
            setTimeout(() => {
                if (sh.style.visibility === 'hidden') {
                    sh.style.display = 'none';
                    sh.style.visibility = '';
                }
            }, 1500);
        };
        tryInit(0);
    }
    ['touchstart', 'pointerdown', 'scroll'].forEach(ev =>
        window.addEventListener(ev, () => setTimeout(warmUp, 600), { once: true, passive: true }));

    // ── ربطٌ بفتح الشاشة: نظّف حالة التسخين وطبّق نصوص الطرف ─────────────
    function wrapOpen() {
        const orig = window.openMapModal;
        if (typeof orig !== 'function' || orig._wjWrapped) return false;
        const wrapped = function (m) {
            const sh = shell();
            if (sh) sh.style.visibility = '';   // كانت مخفيّة للتسخين
            const r = orig.apply(this, arguments);
            applyModeText(m);
            setTimeout(wireMap, 0);
            return r;
        };
        wrapped._wjWrapped = true;
        window.openMapModal = wrapped;
        return true;
    }
    if (!wrapOpen()) document.addEventListener('DOMContentLoaded', wrapOpen);

    window.MapExperience = { refreshQuickPicks: renderQuickPicks };
})();
