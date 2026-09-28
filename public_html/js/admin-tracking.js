/**
 * 🛰️ لوحة التتبّع — الكباتن الذين يحملون طلباً الآن، ومراحل كلّ رحلة.
 *
 * البيانات من GET /api/admin/tracking (routes/admin/tracking.js)، والحكم
 * بالتأخّر هناك لا هنا: الخادم يستعمل عتبات المدينة نفسها التي يُنبّه بها
 * المُجدوِل آلياً. هذه الصفحة تعرض فقط — ولا تحسب شيئاً قد يخالفه.
 */
(function () {
    'use strict';

    const API = (typeof API_URL !== 'undefined' && API_URL) || '';
    const token = localStorage.getItem('adminToken');
    const REFRESH_MS = 20000;

    const $ = (id) => document.getElementById(id);
    const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s));
    const headers = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` });

    let data = null;            // آخر ردٍّ من الخادم
    let lastOk = 0;             // متى نجح آخر تحميل
    let filter = 'active';
    let query = '';
    let timer = null;
    let refocus = null;         // زرٌّ يعود إليه التركيز بعد إعادة الرسم

    try { filter = localStorage.getItem('trk_filter') || 'active'; } catch (_) {}
    try { $('trkCity').value = localStorage.getItem('trk_city') || ''; } catch (_) {}

    // ─── تنسيق ────────────────────────────────────────────────────────────

    /** 75 ← «1 س 15 د» */
    function dur(min) {
        if (min == null) return '—';
        if (min < 1) return 'أقل من دقيقة';
        const h = Math.floor(min / 60), m = min % 60;
        return h ? `${h} س${m ? ' ' + m + ' د' : ''}` : `${m} د`;
    }
    function clock(at) {
        if (!at) return '';
        try { return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
        catch (_) { return ''; }
    }

    const VEHICLE = {
        motorcycle: ['fa-motorcycle', 'دراجة نارية'],
        electric:   ['fa-bolt', 'سكوتر كهربائي'],
        bicycle:    ['fa-bicycle', 'دراجة هوائية'],
        rickshaw:   ['fa-taxi', 'ركشة'],
        car:        ['fa-car-side', 'سيارة'],
        van:        ['fa-truck', 'عربة نقل']
    };
    const STEP_ICON = {
        accepted:  'fa-handshake',
        picked_up: 'fa-box-open',
        on_way:    'fa-motorcycle',
        delivered: 'fa-house-circle-check'
    };

    // ─── الرقائق: ملخّصٌ وتصفية معاً ─────────────────────────────────────

    const CHIPS = [
        { key: 'active',    label: 'رحلات جارية',        icon: 'fa-route',                 color: ['#dbeafe', '#1d4ed8'], n: s => s.active },
        { key: 'late',      label: 'متأخّرة',            icon: 'fa-triangle-exclamation',  color: ['#fee2e2', '#b91c1c'], n: s => s.late },
        { key: 'warn',      label: 'قاربت التأخّر',      icon: 'fa-hourglass-half',        color: ['#fef3c7', '#b45309'], n: s => s.warn },
        { key: 'to_pickup', label: 'في الطريق للاستلام', icon: 'fa-store',                 color: ['#e0e7ff', '#4338ca'], n: s => s.toPickup },
        { key: 'to_dropoff',label: 'استلم — للعميل',     icon: 'fa-motorcycle',            color: ['#dcfce7', '#15803d'], n: s => s.toDropoff },
        { key: 'gps',       label: 'التتبّع متوقّف',     icon: 'fa-location-crosshairs',   color: ['#fef3c7', '#b45309'], n: s => s.gpsStale },
        { key: 'delivered', label: 'سُلِّمت مؤخراً',     icon: 'fa-house-circle-check',    color: ['#f1f5f9', '#334155'], n: s => s.delivered }
    ];

    function renderChips() {
        const s = (data && data.summary) || {};
        $('trkChips').innerHTML = CHIPS.map(c => `
            <button type="button" class="chip" data-f="${c.key}" aria-pressed="${filter === c.key}">
                <span class="ic" style="background:${c.color[0]};color:${c.color[1]}" aria-hidden="true"><i class="fas ${c.icon}"></i></span>
                <span><span class="num">${data ? (c.n(s) || 0) : '—'}</span><span class="lbl" style="display:block">${c.label}</span></span>
            </button>`).join('');
    }

    $('trkChips').addEventListener('click', (e) => {
        const b = e.target.closest('.chip');
        if (!b) return;
        filter = b.dataset.f;
        try { localStorage.setItem('trk_filter', filter); } catch (_) {}
        renderChips();
        renderList();
    });

    // ─── البطاقات ────────────────────────────────────────────────────────

    function matches(t) {
        const running = t.stage !== 'delivered';
        const byFilter = {
            active: running,
            late: running && t.late.level === 'late',
            warn: running && t.late.level === 'warn',
            to_pickup: t.stage === 'to_pickup',
            to_dropoff: t.stage === 'to_dropoff',
            gps: running && t.captain && t.captain.gps.state === 'stale',
            delivered: t.stage === 'delivered'
        }[filter];
        if (!byFilter) return false;
        if (!query) return true;
        const hay = [t.ref, t.captain && t.captain.name, t.captain && t.captain.phone,
                     t.client && t.client.name, t.client && t.client.phone,
                     t.pickup.address, t.dropoff.address].join(' ').toLowerCase();
        return hay.includes(query);
    }

    function lateBadge(t) {
        if (t.stage === 'delivered') {
            return `<span class="badge done"><i class="fas fa-house-circle-check" aria-hidden="true"></i> سُلِّم قبل ${dur(t.late.elapsed)}</span>`;
        }
        if (t.late.level === 'late') {
            return `<span class="badge late"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> متأخّر ${dur(t.late.lateBy)}</span>`;
        }
        if (t.late.level === 'warn') {
            return `<span class="badge warn"><i class="fas fa-hourglass-half" aria-hidden="true"></i> تجاوز المعتاد بـ ${dur(t.late.lateBy)}</span>`;
        }
        return `<span class="badge ok"><i class="fas fa-circle-check" aria-hidden="true"></i> في الوقت</span>`;
    }

    function stepsHtml(t) {
        return `<ol class="steps" aria-label="مراحل الرحلة">` + t.steps.map(s => {
            const cls = s.done ? 'done' : (s.current ? 'current' : '');
            const state = s.done ? 'تمّت' : (s.current ? 'جارية الآن' : 'لم تبدأ');
            const icon = s.done ? 'fa-check' : STEP_ICON[s.key];
            return `<li class="step ${cls}" aria-label="${esc(s.label)}: ${state}${s.done && s.at ? ' — ' + clock(s.at) : ''}">
                <span class="dot" aria-hidden="true"><i class="fas ${icon}"></i></span>
                <span class="s-lbl" aria-hidden="true">${esc(s.label)}</span>
                <span class="s-at" aria-hidden="true">${s.done && s.at ? clock(s.at) : ''}</span>
            </li>`;
        }).join('') + `</ol>`;
    }

    function gpsFact(t) {
        const g = t.captain && t.captain.gps;
        if (!g || t.stage === 'delivered') return '';
        if (g.state === 'none') return `<span class="fact gps-none"><i class="fas fa-location-crosshairs" aria-hidden="true"></i> لا موقع للكابتن</span>`;
        if (g.state === 'stale') return `<span class="fact gps-stale"><i class="fas fa-location-crosshairs" aria-hidden="true"></i> التتبّع متوقّف منذ ${dur(g.ageMin)}</span>`;
        return `<span class="fact gps-fresh"><i class="fas fa-location-dot" aria-hidden="true"></i> آخر موقع قبل ${dur(g.ageMin)}</span>`;
    }

    function card(t) {
        const c = t.captain;
        const v = VEHICLE[c.vehicleType] || ['fa-motorcycle', 'كابتن'];
        const photo = c.photo && window.getFullImageUrl ? window.getFullImageUrl(c.photo) : '';
        const initial = esc((c.name || '؟').trim().charAt(0));
        const running = t.stage !== 'delivered';
        const sinceLbl = t.stage === 'to_pickup' ? 'منذ القبول' : 'منذ الاستلام';

        return `
        <article class="trip lv-${running ? t.late.level : 'ok'} st-${t.stage}" aria-label="رحلة ${esc(c.name)} — طلب #${esc(t.ref)}">
            <header class="trip-head">
                <div class="cap">
                    ${photo ? `<img class="avatar" src="${esc(photo)}" alt="" data-i="${initial}"
                                onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'avatar',textContent:this.dataset.i}))">`
                            : `<span class="avatar" aria-hidden="true">${initial}</span>`}
                    <div style="min-width:0">
                        <div class="cap-name">${esc(c.name)}</div>
                        <div class="cap-sub">
                            <span><i class="fas ${v[0]}" aria-hidden="true"></i> ${v[1]}</span>
                            ${c.phone ? `<a href="tel:${esc(c.phone)}" aria-label="اتصال بالكابتن ${esc(c.name)}"><i class="fas fa-phone" aria-hidden="true"></i> ${esc(c.phone)}</a>` : ''}
                        </div>
                    </div>
                </div>
                ${lateBadge(t)}
            </header>

            ${stepsHtml(t)}

            <div class="route">
                <i class="fas fa-store from" aria-hidden="true"></i>
                <div class="from"><b>من:</b> <span>${esc(t.pickup.address || '—')}</span></div>
                <i class="fas fa-location-dot to" aria-hidden="true"></i>
                <div class="to"><b>إلى:</b> <span>${esc(t.dropoff.address || '—')}${t.client ? ` — ${esc(t.client.name)}` : ''}</span></div>
            </div>

            <div class="facts">
                ${running ? `<span class="fact"><i class="fas fa-stopwatch" aria-hidden="true"></i> ${sinceLbl} ${dur(t.late.elapsed)}</span>` : ''}
                ${t.totalMin != null ? `<span class="fact"><i class="fas fa-clock" aria-hidden="true"></i> ${running ? 'الرحلة حتى الآن' : 'مدّة الرحلة'} ${dur(t.totalMin)}</span>` : ''}
                ${gpsFact(t)}
                ${t.stops ? `<span class="fact"><i class="fas fa-flag-checkered" aria-hidden="true"></i> المحطّات ${t.stops.done}/${t.stops.total}</span>` : ''}
                <span class="fact"><i class="fas fa-tag" aria-hidden="true"></i> ${esc(t.typeLabel)} · #${esc(t.ref)}</span>
            </div>

            ${t.lastNudge ? `<div class="last-nudge"><i class="fas fa-bell" aria-hidden="true"></i>
                نُبِّه ${t.lastNudge.to === 'captain' ? 'الكابتن' : 'العميل'} قبل ${dur(t.lastNudge.agoMin)}${t.lastNudge.byName ? ' — ' + esc(t.lastNudge.byName) : ''}</div>` : ''}

            <footer class="trip-actions">
                ${running ? `
                <button type="button" class="btn ${t.late.level === 'ok' ? 'btn-ghost' : 'btn-warn'}" data-nudge="${t.id}" data-to="captain">
                    <i class="fas fa-bell" aria-hidden="true"></i> تنبيه الكابتن</button>
                <button type="button" class="btn btn-info" data-nudge="${t.id}" data-to="client" ${t.client ? '' : 'disabled'}>
                    <i class="fas fa-user-check" aria-hidden="true"></i> طمأنة العميل</button>` : ''}
                <a class="btn btn-ghost" href="admin-live-map.html?focus=${encodeURIComponent(c.id)}">
                    <i class="fas fa-map-location-dot" aria-hidden="true"></i> على الخريطة</a>
                <a class="btn btn-ghost" href="admin-order-details.html?id=${encodeURIComponent(t.id)}">
                    <i class="fas fa-file-lines" aria-hidden="true"></i> تفاصيل الطلب</a>
            </footer>
        </article>`;
    }

    const EMPTY = {
        active:     ['fa-mug-hot', 'لا كابتن يحمل طلباً الآن', 'ستظهر هنا كل رحلة فور قبول الكابتن للطلب.'],
        late:       ['fa-circle-check', 'لا رحلات متأخّرة', 'كل الرحلات الجارية في وقتها.'],
        warn:       ['fa-circle-check', 'لا رحلات قاربت التأخّر', ''],
        to_pickup:  ['fa-store', 'لا كابتن في الطريق للاستلام', ''],
        to_dropoff: ['fa-motorcycle', 'لا طلب في الطريق للعميل', ''],
        gps:        ['fa-location-dot', 'كل الكباتن يُرسلون مواقعهم', ''],
        delivered:  ['fa-house-circle-check', 'لا تسليم في آخر ساعات', '']
    };

    function renderList() {
        const box = $('trkList');
        box.setAttribute('aria-busy', 'false');
        if (!data) return;
        const trips = data.trips.filter(matches);
        if (!trips.length) {
            const e = query ? ['fa-magnifying-glass', 'لا نتائج لهذا البحث', 'جرّب اسماً آخر أو رقم الطلب.'] : EMPTY[filter];
            box.innerHTML = `<div class="trk-empty" role="status"><i class="fas ${e[0]}" aria-hidden="true"></i><b>${e[1]}</b>${e[2]}</div>`;
            return;
        }
        box.innerHTML = trips.map(card).join('');
        if (refocus) {
            const el = box.querySelector(refocus);
            refocus = null;
            if (el) el.focus();
        }
    }

    // ─── التحميل والتحديث الدوريّ ─────────────────────────────────────────

    function setLive(text, isError) {
        $('trkLive').classList.toggle('is-error', !!isError);
        $('trkLiveText').textContent = text;
    }

    async function load() {
        const city = $('trkCity').value;
        try {
            const res = await fetch(`${API}/api/admin/tracking${city ? `?city=${encodeURIComponent(city)}` : ''}`, { headers: headers() });
            if (res.status === 401) { location.href = 'admin-login.html'; return; }
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.message || '');
            data = body;
            lastOk = Date.now();
            renderChips();
            renderList();
            tickLive();
        } catch (err) {
            const msg = window.friendlyError ? friendlyError(err, 'تعذّر تحميل لوحة التتبّع') : 'تعذّر تحميل لوحة التتبّع';
            if (!data && window.UIState) {
                UIState.error($('trkList'), { text: msg, onRetry: load });
            }
            setLive(`${msg} — إعادة المحاولة تلقائياً`, true);
        }
    }

    function tickLive() {
        if (!lastOk) return;
        const s = Math.round((Date.now() - lastOk) / 1000);
        const n = data ? data.summary.carrying : 0;
        setLive(`${n} كابتن يحمل طلباً · آخر تحديث ${s < 5 ? 'الآن' : 'قبل ' + s + ' ث'}`, false);
    }

    function schedule() {
        clearInterval(timer);
        timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    }

    setInterval(tickLive, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

    $('trkRefresh').addEventListener('click', load);
    $('trkCity').addEventListener('change', () => {
        try { localStorage.setItem('trk_city', $('trkCity').value); } catch (_) {}
        load();
    });
    let qTimer = null;
    $('trkSearch').addEventListener('input', (e) => {
        clearTimeout(qTimer);
        qTimer = setTimeout(() => { query = e.target.value.trim().toLowerCase(); renderList(); }, 150);
    });

    // ─── نافذة التنبيه ───────────────────────────────────────────────────

    const modal = $('nudgeModal');
    let nTrip = null, nTo = 'captain', nTpl = null, lastFocus = null;

    function templatesFor(to, trip) {
        const list = ((data && data.templates && data.templates[to]) || [])
            .filter(x => !x.stages || x.stages.includes(trip.stage));
        return list.concat([{ id: 'custom', title: 'رسالة مخصّصة', message: 'اكتب نصّاً بنفسك.' }]);
    }

    /**
     * الأنسب أولاً — والتأخّر قبل الموقع: كابتنٌ متأخّر نصف ساعة وموقعه
     * متوقّف يحتاج «تحرّك» قبل «شغّل الموقع».
     *   متأخّر جداً   ← «تأخّرت — تحرّك الآن»
     *   قارب التأخّر ← «لم تستلم الطلب بعد» / «العميل ينتظر» بحسب المرحلة
     *   في الوقت     ← «موقعك لا يتحدّث» إن توقّف، وإلا «اتصل بالعميل»
     */
    function suggested(to, trip) {
        if (to === 'client') return 'on_the_way';
        if (trip.late.level === 'late') return 'move_now';
        if (trip.late.level === 'warn') return trip.stage === 'to_pickup' ? 'pickup_late' : 'deliver_late';
        if (trip.captain && trip.captain.gps.state === 'stale') return 'gps_off';
        return 'call_client';
    }

    function renderTemplates() {
        const list = templatesFor(nTo, nTrip);
        if (!list.find(x => x.id === nTpl)) nTpl = suggested(nTo, nTrip);
        if (!list.find(x => x.id === nTpl)) nTpl = list[0].id;
        $('nudgeTemplates').innerHTML = list.map(x => `
            <button type="button" class="tpl" role="radio" aria-checked="${x.id === nTpl}" data-tpl="${x.id}" tabindex="${x.id === nTpl ? 0 : -1}">
                <span class="radio" aria-hidden="true"></span>
                <span><span class="t-title" style="display:block">${esc(x.title)}</span><span class="t-msg" style="display:block">${esc(x.message)}</span></span>
            </button>`).join('');
        $('nudgeCustomWrap').hidden = nTpl !== 'custom';
        document.querySelectorAll('.seg button').forEach(b => {
            b.setAttribute('aria-pressed', String(b.dataset.to === nTo));
            if (b.dataset.to === 'client') b.disabled = !nTrip.client;
        });
        $('nudgeErr').textContent = '';
    }

    function openNudge(tripId, to) {
        nTrip = data && data.trips.find(t => t.id === tripId);
        if (!nTrip) return;
        nTo = to === 'client' && nTrip.client ? 'client' : 'captain';
        nTpl = null;
        $('nudgeCustom').value = '';
        $('nudgeCount').textContent = '0 / 300';
        const lateTxt = nTrip.late.level === 'ok' ? 'في الوقت' : `متأخّر ${dur(nTrip.late.lateBy)}`;
        $('nudgeFor').innerHTML = `طلب <b>#${esc(nTrip.ref)}</b> — ${esc(nTrip.stageLabel)} منذ ${dur(nTrip.late.elapsed)} (${lateTxt})<br>
            الكابتن: <b>${esc(nTrip.captain.name)}</b>${nTrip.client ? ` · العميل: <b>${esc(nTrip.client.name)}</b>` : ''}`;
        renderTemplates();
        lastFocus = document.activeElement;
        modal.hidden = false;
        const first = modal.querySelector('.tpl[aria-checked="true"]');
        if (first) first.focus();
    }

    function closeNudge() {
        modal.hidden = true;
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    $('trkList').addEventListener('click', (e) => {
        const b = e.target.closest('[data-nudge]');
        if (b && !b.disabled) openNudge(b.dataset.nudge, b.dataset.to);
    });
    document.querySelector('.seg').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-to]');
        if (!b || b.disabled) return;
        nTo = b.dataset.to; nTpl = null; renderTemplates();
    });
    $('nudgeTemplates').addEventListener('click', (e) => {
        const b = e.target.closest('.tpl');
        if (!b) return;
        nTpl = b.dataset.tpl; renderTemplates();
        if (nTpl === 'custom') $('nudgeCustom').focus();
        else { const cur = modal.querySelector('.tpl[aria-checked="true"]'); if (cur) cur.focus(); }
    });
    // مجموعة اختيار: الأسهم تنقل بين النصوص كما في أيّ radiogroup
    $('nudgeTemplates').addEventListener('keydown', (e) => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault();
        const items = [...modal.querySelectorAll('.tpl')];
        const i = items.findIndex(x => x.dataset.tpl === nTpl);
        const next = items[(i + (e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? 1 : -1) + items.length) % items.length];
        nTpl = next.dataset.tpl; renderTemplates();
        modal.querySelector(`.tpl[data-tpl="${nTpl}"]`).focus();
    });
    $('nudgeCustom').addEventListener('input', (e) => { $('nudgeCount').textContent = `${e.target.value.length} / 300`; });
    $('nudgeClose').addEventListener('click', closeNudge);
    $('nudgeCancel').addEventListener('click', closeNudge);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeNudge(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeNudge(); });

    $('nudgeSend').addEventListener('click', async () => {
        const btn = $('nudgeSend');
        const body = { to: nTo, template: nTpl };
        if (nTpl === 'custom') {
            body.message = $('nudgeCustom').value.trim();
            if (body.message.length < 3) { $('nudgeErr').textContent = 'اكتب نصّ الرسالة أولاً'; return; }
        }
        btn.disabled = true;
        try {
            const res = await fetch(`${API}/api/admin/tracking/${encodeURIComponent(nTrip.id)}/notify`, {
                method: 'POST', headers: headers(), body: JSON.stringify(body)
            });
            const out = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(out.message || '');
            closeNudge();
            // التحديث بعده يُعيد رسم البطاقات فيضيع الزرّ المركَّز — نعود إليه
            refocus = `[data-nudge="${nTrip.id}"][data-to="${nTo}"]`;
            if (window.Swal) {
                Swal.fire({ toast: true, position: 'top-end', icon: 'success', timer: 2200, showConfirmButton: false,
                    title: `أُرسل التنبيه إلى ${out.sentTo || (nTo === 'captain' ? 'الكابتن' : 'العميل')}` });
            }
            load();
        } catch (err) {
            $('nudgeErr').textContent = window.friendlyError ? friendlyError(err, 'تعذّر إرسال التنبيه') : 'تعذّر إرسال التنبيه';
        } finally {
            btn.disabled = false;
        }
    });

    // ─── البداية ─────────────────────────────────────────────────────────
    renderChips();
    if (window.UIState) UIState.skeleton($('trkList'), { count: 4 });
    load();
    schedule();
})();
