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
    const STOPPED_TXT = '10 دقائق';   // utils/tripTracking.STOPPED_MIN

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
        { key: 'release',   label: 'طلبات تنازل',        icon: 'fa-hand',                  color: ['#ede9fe', '#6d28d9'], n: s => s.releaseRequests },
        { key: 'late',      label: 'متأخّرة',            icon: 'fa-triangle-exclamation',  color: ['#fee2e2', '#b91c1c'], n: s => s.late },
        { key: 'warn',      label: 'قاربت التأخّر',      icon: 'fa-hourglass-half',        color: ['#fef3c7', '#b45309'], n: s => s.warn },
        { key: 'to_pickup', label: 'في الطريق للاستلام', icon: 'fa-store',                 color: ['#e0e7ff', '#4338ca'], n: s => s.toPickup },
        { key: 'to_dropoff',label: 'استلم — للعميل',     icon: 'fa-motorcycle',            color: ['#dcfce7', '#15803d'], n: s => s.toDropoff },
        { key: 'gps',       label: 'التتبّع متوقّف',     icon: 'fa-location-crosshairs',   color: ['#fef3c7', '#b45309'], n: s => s.gpsStale },
        { key: 'stopped',   label: 'واقف لا يتحرّك',     icon: 'fa-circle-pause',          color: ['#ffedd5', '#c2410c'], n: s => s.stopped },
        { key: 'suspicious',label: 'إثبات مشكوك فيه',   icon: 'fa-shield-halved',         color: ['#fee2e2', '#b91c1c'], n: s => s.suspicious },
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
            stopped: running && t.motion && t.motion.state === 'stopped',
            release: !!t.releaseRequest,
            suspicious: t.proof && t.proof.suspicious,
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

    /** 40 ← «40 م»، 1234 ← «1.2 كم» */
    function dist(m) {
        if (m == null) return '';
        return m < 1000 ? `${m} م` : `${(m / 1000).toFixed(1)} كم`;
    }

    /**
     * 🧭 أين هو من وجهته، وهل يتحرّك. الوقت وحده لا يفرّق بين متأخّرٍ على
     * بُعد ٣٠٠ م ومتأخّرٍ لم يغادر مكانه.
     */
    function motionFact(t) {
        const m = t.motion;
        if (!m || m.state === 'unknown') return '';
        const where = m.target === 'pickup' ? 'المحلّ' : 'العميل';
        if (m.state === 'at_target') {
            return `<span class="fact motion-at"><i class="fas fa-location-pin" aria-hidden="true"></i> عند ${where}${m.stoppedMin ? ` منذ ${dur(m.stoppedMin)}` : ''}</span>`;
        }
        const far = m.distanceM != null ? ` — على بُعد ${dist(m.distanceM)} من ${where}` : '';
        if (m.state === 'stopped') {
            return `<span class="fact motion-stopped"><i class="fas fa-circle-pause" aria-hidden="true"></i> واقف منذ ${dur(m.stoppedMin)}${far}</span>`;
        }
        return m.distanceM != null
            ? `<span class="fact motion-moving"><i class="fas fa-person-biking" aria-hidden="true"></i> يتحرّك — ${dist(m.distanceM)} عن ${where}</span>`
            : '';
    }

    /**
     * 🙋 طلب تنازل: السبب، ومتى، وكم مرّةً سبقه على هذا الطلب — وقرار الإدارة.
     * كان التنازل فورياً بضغطة؛ الآن ينتظر هنا.
     */
    function releaseHtml(t) {
        const r = t.releaseRequest;
        if (!r) return '';
        return `<div class="release-box" role="group" aria-label="طلب تنازل من ${esc(t.captain.name)}">
            <div class="release-head"><i class="fas fa-hand" aria-hidden="true"></i> طلب تنازل — قبل ${dur(r.agoMin)}${r.priorRequests ? ` · سبقه ${r.priorRequests} على هذا الطلب` : ''}</div>
            <div class="release-reason">«${esc(r.reason)}»</div>
            <div class="release-actions">
                <button type="button" class="btn btn-approve" data-release="${t.id}" data-decision="approve">
                    <i class="fas fa-check" aria-hidden="true"></i> قبول — يعود الطلب متاحاً</button>
                <button type="button" class="btn btn-reject" data-release="${t.id}" data-decision="reject">
                    <i class="fas fa-xmark" aria-hidden="true"></i> رفض — يكمله</button>
            </div>
        </div>`;
    }

    function nudgeLine(t) {
        const n = t.lastNudge;
        if (!n) return '';
        const who = n.to === 'captain' ? 'الكابتن' : 'العميل';
        const ack = n.to === 'captain'
            ? (n.ack
                ? `<span class="ack ok"><i class="fas fa-reply" aria-hidden="true"></i> ردّ: «${esc(n.ack.text)}» قبل ${dur(n.ack.agoMin)}</span>`
                : `<span class="ack none">لم يردّ بعد</span>`)
            : '';
        return `<div class="last-nudge"><i class="fas fa-bell" aria-hidden="true"></i>
            <span>نُبِّه ${who} قبل ${dur(n.agoMin)}${n.byName ? ' — ' + esc(n.byName) : ''}</span>${ack}</div>`;
    }

    /**
     * 📸📍 سطر الإثبات: صورة الاستلام، وأين كان الكابتن حين أعلن التسليم.
     * التسليم في وضع «المراقبة» لا يُمنع من بعيد — يُسجَّل فقط، وهنا يُرى.
     */
    function proofHtml(t) {
        const p = t.proof || {};
        const out = [];
        if (p.pickupPhoto) {
            out.push(`<button type="button" class="proof-btn" data-photo="${esc(p.pickupPhoto)}" data-cap="${esc(t.captain.name)}" data-ref="${esc(t.ref)}"
                aria-label="عرض صورة إثبات الاستلام للطلب #${esc(t.ref)}">
                <i class="fas fa-camera" aria-hidden="true"></i> صورة الاستلام</button>`);
        } else if (p.pickupPhotoMissing) {
            out.push(`<span class="proof bad"><i class="fas fa-camera" aria-hidden="true"></i> استُلم بلا صورة إثبات</span>`);
        }
        const d = p.delivery;
        if (d) {
            const radius = data && data.deliveryRadius ? data.deliveryRadius[t.city] : null;
            const row = {
                ok:          ['ok',   'fa-location-dot',        `سُلِّم عند العميل — على بُعد ${dist(d.distanceM)}${radius ? ` (المسموح ${dist(radius)})` : ''}`],
                far:         ['bad',  'fa-triangle-exclamation', `أُعلن التسليم على بُعد ${dist(d.distanceM)} من العميل`],
                no_location: ['warn', 'fa-location-crosshairs', 'لا موقع حديث للكابتن لحظة التسليم'],
                no_address:  ['muted','fa-circle-question',     'عنوان العميل بلا إحداثيات — تعذّر التحقّق'],
                unchecked:   ['muted','fa-circle-question',     'لم يُفحص موقع التسليم']
            }[d.state];
            if (row) out.push(`<span class="proof ${row[0]}"><i class="fas ${row[1]}" aria-hidden="true"></i> ${row[2]}</span>`);
        }
        return out.length ? `<div class="proofs" aria-label="إثبات الرحلة">${out.join('')}</div>` : '';
    }

    function card(t) {
        const c = t.captain;
        const v = VEHICLE[c.vehicleType] || ['fa-motorcycle', 'كابتن'];
        const photo = c.photo && window.getFullImageUrl ? window.getFullImageUrl(c.photo) : '';
        const initial = esc((c.name || '؟').trim().charAt(0));
        const running = t.stage !== 'delivered';
        const sinceLbl = t.stage === 'to_pickup' ? 'منذ القبول' : 'منذ الاستلام';

        return `
        <article class="trip lv-${running ? t.late.level : 'ok'} st-${t.stage}${t.proof && t.proof.suspicious ? ' proof-bad' : ''}" aria-label="رحلة ${esc(c.name)} — طلب #${esc(t.ref)}">
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
                <div class="to"><b>إلى:</b> <span>${esc(t.dropoff.address || '—')}${t.client ? ` — ${esc(t.client.name)}` : ''}</span>
                    ${t.client && t.client.phone ? `<a class="call-client" href="tel:${esc(t.client.phone)}" aria-label="اتصال بالعميل ${esc(t.client.name)}"><i class="fas fa-phone" aria-hidden="true"></i> ${esc(t.client.phone)}</a>` : ''}</div>
            </div>

            <div class="facts">
                ${running ? `<span class="fact"><i class="fas fa-stopwatch" aria-hidden="true"></i> ${sinceLbl} ${dur(t.late.elapsed)}</span>` : ''}
                ${t.totalMin != null ? `<span class="fact"><i class="fas fa-clock" aria-hidden="true"></i> ${running ? 'الرحلة حتى الآن' : 'مدّة الرحلة'} ${dur(t.totalMin)}</span>` : ''}
                ${motionFact(t)}
                ${gpsFact(t)}
                ${t.stops ? `<span class="fact"><i class="fas fa-flag-checkered" aria-hidden="true"></i> المحطّات ${t.stops.done}/${t.stops.total}</span>` : ''}
                <span class="fact"><i class="fas fa-tag" aria-hidden="true"></i> ${esc(t.typeLabel)} · #${esc(t.ref)}</span>
            </div>

            ${proofHtml(t)}

            ${releaseHtml(t)}
            ${nudgeLine(t)}

            <footer class="trip-actions">
                ${running ? `
                <button type="button" class="btn ${t.late.level === 'ok' ? 'btn-ghost' : 'btn-warn'}" data-nudge="${t.id}" data-to="captain">
                    <i class="fas fa-bell" aria-hidden="true"></i> تنبيه الكابتن</button>
                <button type="button" class="btn btn-info" data-nudge="${t.id}" data-to="client" ${t.client ? '' : 'disabled'}>
                    <i class="fas fa-user-check" aria-hidden="true"></i> طمأنة العميل</button>` : ''}
                <a class="btn btn-ghost" href="admin-trip-map.html?order=${encodeURIComponent(t.id)}">
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
        release:    ['fa-hand', 'لا طلبات تنازل معلّقة', 'يطلب الكابتن التنازل بسببٍ مكتوب، ويظهر هنا لتقبل أو ترفض.'],
        stopped:    ['fa-person-running', 'كل الكباتن يتحرّكون', `يظهر هنا من وقف ${STOPPED_TXT} بعيداً عن المحلّ أو العميل.`],
        suspicious: ['fa-shield-halved', 'لا إثبات مشكوك فيه', 'كل الاستلامات مصوّرة، وكل التسليمات أُعلنت عند العميل.'],
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
            checkAlerts();
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
        setLive(`${n} كابتن يحمل طلباً · ${live ? 'مباشر · ' : ''}آخر تحديث ${s < 5 ? 'الآن' : 'قبل ' + s + ' ث'}`, false);
    }

    // ─── مباشر: كل تغيّرٍ في طلبٍ يُعيد التحميل فوراً ─────────────────────
    // الخادم يبثّ admin_order_update لغرفة الإدارة عند القبول والاستلام
    // والتسليم والإلغاء وردّ الكابتن على التنبيه. التحديث الدوريّ يبقى
    // احتياطاً (ولأعمار المواقع والتوقّف التي تتغيّر بلا حدث).
    let live = false;
    let soonTimer = null;
    function soon() { clearTimeout(soonTimer); soonTimer = setTimeout(load, 700); }
    function connectLive() {
        if (typeof io !== 'function' || !token) return;
        try {
            const sock = io(API || undefined, {
                transports: ['websocket', 'polling'], reconnection: true,
                reconnectionDelay: 2000, auth: { token }
            });
            sock.on('connect', () => { sock.emit('admin_join'); live = true; tickLive(); soon(); });
            sock.on('disconnect', () => { live = false; tickLive(); });
            sock.on('admin_order_update', soon);
        } catch (_) { /* بلا socket — التحديث الدوريّ يكفي */ }
    }

    // ─── تنبيهٌ صوتيّ حين تحتاج رحلةٌ تدخّلاً ─────────────────────────────
    // لا يُطلب من الأدمن أن يحدّق في الشاشة: رحلةٌ **صارت** متأخّرة أو واقفة
    // تُسمِع نغمةً (وإشعار متصفّح إن كانت الصفحة في الخلفية). ما كان كذلك
    // عند فتح الصفحة لا يُنبَّه عليه — يراه في القائمة.
    let soundOn = false;
    try { soundOn = localStorage.getItem('trk_sound') === '1'; } catch (_) {}
    let alarmed = null;        // مفاتيح «رحلة:سبب» نُبِّه عليها — null قبل أول تحميل
    let audioCtx = null;

    function beep() {
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            [0, 0.22].forEach((offset, i) => {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                const t0 = audioCtx.currentTime + offset;
                o.type = 'sine';
                o.frequency.value = i ? 660 : 880;
                g.gain.setValueAtTime(0.0001, t0);
                g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
                o.connect(g).connect(audioCtx.destination);
                o.start(t0); o.stop(t0 + 0.2);
            });
        } catch (_) { /* لا صوت في هذا المتصفّح */ }
    }

    function alertKeys(trips) {
        const keys = [];
        for (const t of trips) {
            if (t.stage === 'delivered') continue;
            if (t.late.level === 'late') keys.push(`${t.id}:late`);
            if (t.motion && t.motion.state === 'stopped') keys.push(`${t.id}:stopped`);
        }
        return keys;
    }

    function checkAlerts() {
        if (!data) return;
        const nowKeys = new Set(alertKeys(data.trips));
        if (alarmed === null) { alarmed = nowKeys; return; }
        const fresh = [...nowKeys].filter(k => !alarmed.has(k));
        alarmed = nowKeys;            // ما زال سببه يُنبَّه عليه إن عاد لاحقاً
        if (!fresh.length || !soundOn) return;

        const [id, why] = fresh[0].split(':');
        const t = data.trips.find(x => x.id === id);
        const text = fresh.length > 1
            ? `${fresh.length} رحلات تحتاج تدخّلاً`
            : `${t ? t.captain.name : 'كابتن'} — ${why === 'late' ? 'تأخّر' : 'واقف لا يتحرّك'} (طلب #${t ? t.ref : ''})`;
        beep();
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification('لوحة التتبّع', { body: text, tag: 'trk-alert' }); } catch (_) {}
        } else if (window.Swal) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'warning', timer: 5000, showConfirmButton: false, title: text });
        }
    }

    function renderSound() {
        const b = $('trkSound');
        b.setAttribute('aria-pressed', String(soundOn));
        b.querySelector('i').className = `fas ${soundOn ? 'fa-volume-high' : 'fa-volume-xmark'}`;
        b.querySelector('span').textContent = soundOn ? 'التنبيه الصوتي مفعّل' : 'تنبيه صوتي';
    }
    $('trkSound').addEventListener('click', () => {
        soundOn = !soundOn;
        try { localStorage.setItem('trk_sound', soundOn ? '1' : '0'); } catch (_) {}
        renderSound();
        if (soundOn) {
            beep();   // نغمةٌ للتجربة — وتفتح الصوت في المتصفّح بلمسة المستخدم
            if ('Notification' in window && Notification.permission === 'default') {
                try { Notification.requestPermission(); } catch (_) {}
            }
        }
    });

    function schedule() {
        clearInterval(timer);
        timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    }

    setInterval(tickLive, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

    $('trkRefresh').addEventListener('click', load);
    $('trkCity').addEventListener('change', () => {
        try { localStorage.setItem('trk_city', $('trkCity').value); } catch (_) {}
        alarmed = null;   // مدينةٌ أخرى: ما فيها من متأخّر ليس «جديداً»
        load();
        if (view === 'report') loadReport();
    });
    let qTimer = null;
    $('trkSearch').addEventListener('input', (e) => {
        clearTimeout(qTimer);
        qTimer = setTimeout(() => { query = e.target.value.trim().toLowerCase(); renderList(); }, 150);
    });

    // ─── قرار طلب التنازل ────────────────────────────────────────────────
    $('trkList').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-release]');
        if (!b) return;
        const approve = b.dataset.decision === 'approve';
        const ask = await Swal.fire({
            title: approve ? 'قبول التنازل؟' : 'رفض التنازل؟',
            html: approve
                ? 'يعود الطلب متاحاً ويُبلَّغ كباتن المدينة، ويُبلَّغ العميل أننا نبحث عن كابتنٍ آخر.'
                : 'يبقى الطلب مع الكابتن ويصله إشعارٌ بأن يُكمله.',
            input: 'text',
            inputLabel: 'ملاحظة للكابتن (اختياري)',
            inputAttributes: { maxlength: 300 },
            showCancelButton: true,
            confirmButtonText: approve ? 'قبول' : 'رفض',
            cancelButtonText: 'تراجع',
            confirmButtonColor: approve ? '#15803d' : '#b91c1c'
        });
        if (!ask.isConfirmed) return;
        b.disabled = true;
        try {
            const res = await fetch(`${API}/api/admin/orders/${encodeURIComponent(b.dataset.release)}/release/${approve ? 'approve' : 'reject'}`, {
                method: 'PUT', headers: headers(), body: JSON.stringify({ note: ask.value || '' })
            });
            const out = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(out.message || '');
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', timer: 2600, showConfirmButton: false,
                title: out.message || 'حُفظ القرار' });
            load();
        } catch (err) {
            b.disabled = false;
            Swal.fire({ icon: 'error', text: window.friendlyError ? friendlyError(err, 'تعذّر حفظ القرار') : 'تعذّر حفظ القرار' });
        }
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
     *   متأخّر جداً، أو واقف بعيداً عن وجهته ← «تأخّرت — تحرّك الآن»
     *   قارب التأخّر ← «لم تستلم الطلب بعد» / «العميل ينتظر» بحسب المرحلة
     *   في الوقت     ← «موقعك لا يتحدّث» إن توقّف، وإلا «اتصل بالعميل»
     */
    function suggested(to, trip) {
        if (to === 'client') return 'on_the_way';
        if (trip.late.level === 'late') return 'move_now';
        // واقفٌ بعيداً عن وجهته: «تحرّك» ولو لم يتأخّر بعد
        if (trip.motion && trip.motion.state === 'stopped') return 'move_now';
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
        backTo(lastFocus, nTrip && `[data-nudge="${nTrip.id}"][data-to="${nTo}"]`);
    }

    $('trkList').addEventListener('click', (e) => {
        const b = e.target.closest('[data-nudge]');
        if (b && !b.disabled) openNudge(b.dataset.nudge, b.dataset.to);
        const p = e.target.closest('[data-photo]');
        if (p) openPhoto(p);
    });

    // ─── صورة إثبات الاستلام ─────────────────────────────────────────────
    const photoModal = $('photoModal');
    let photoFocus = null;
    function openPhoto(btn) {
        const url = window.getFullImageUrl ? getFullImageUrl(btn.dataset.photo) : btn.dataset.photo;
        const img = $('photoImg');
        img.alt = `صورة إثبات الاستلام — طلب #${btn.dataset.ref}`;
        img.src = url;
        $('photoCap').textContent = `التقطها ${btn.dataset.cap} عند استلام الطلب #${btn.dataset.ref}`;
        $('photoOpen').href = url;
        photoFocus = btn;
        photoModal.hidden = false;
        $('photoClose').focus();
    }
    function closePhoto() {
        photoModal.hidden = true;
        $('photoImg').src = '';
        // التحديث كل 20 ث يُعيد رسم البطاقات، فالزرّ المحفوظ قد صار منفصلاً
        // عن الصفحة ولا يقبل التركيز — نعود إلى نظيره الحاليّ بمعرّف الطلب
        backTo(photoFocus, photoFocus && `.proof-btn[data-ref="${photoFocus.dataset.ref}"]`);
    }

    /** يعيد التركيز لعنصرٍ ما زال في الصفحة، أو لنظيره بعد إعادة الرسم */
    function backTo(el, selector) {
        const target = (el && el.isConnected) ? el : (selector ? document.querySelector(selector) : null);
        if (target && target.focus) target.focus();
        else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
    $('photoClose').addEventListener('click', closePhoto);
    photoModal.addEventListener('click', (e) => { if (e.target === photoModal) closePhoto(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !photoModal.hidden) closePhoto(); });
    $('photoImg').addEventListener('error', () => { $('photoCap').textContent = 'تعذّر تحميل الصورة — ربما حُذفت من الخادم'; });
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

    // ─── تقرير الكباتن ───────────────────────────────────────────────────
    // البطاقات تُري الرحلة، وهذا يُري الكابتن: من يتكرّر تأخّره أو تسليمه
    // البعيد. الأحكام نفسها في الخادم (utils/trackingReport.js).
    let view = 'trips';
    try { view = localStorage.getItem('trk_view') === 'report' ? 'report' : 'trips'; } catch (_) {}
    let report = null;

    function cell(n, total, kind) {
        if (!n) return `<td class="num zero">0</td>`;
        const pct = total ? Math.round((n / total) * 100) : 0;
        // في وحدة القيمة: جدول الجوّال يوزّع أبناء الخليّة على طرفيها
        return `<td class="num ${kind}"><span>${n} <small>(${pct}%)</small></span></td>`;
    }

    function renderReport() {
        const box = $('repBody');
        box.setAttribute('aria-busy', 'false');
        if (!report) return;
        const tt = report.totals;
        $('repTotals').innerHTML = [
            ['fa-route', 'رحلات مُسلَّمة', tt.trips, ['#dbeafe', '#1d4ed8']],
            ['fa-triangle-exclamation', 'متأخّرة', tt.late, ['#fee2e2', '#b91c1c']],
            ['fa-location-crosshairs', 'تسليمٌ بعيد عن العميل', tt.far, ['#fee2e2', '#b91c1c']],
            ['fa-camera', 'استلامٌ بلا صورة', tt.noPhoto, ['#fef3c7', '#b45309']],
            ['fa-reply', 'ردّوا على التنبيه', `${tt.acked}/${tt.nudged}`, ['#dcfce7', '#15803d']]
        ].map(c => `<div class="chip stat">
            <span class="ic" style="background:${c[3][0]};color:${c[3][1]}" aria-hidden="true"><i class="fas ${c[0]}"></i></span>
            <span><span class="num">${c[2]}</span><span class="lbl" style="display:block">${c[1]}</span></span></div>`).join('');

        if (!report.captains.length) {
            box.innerHTML = `<div class="trk-empty" role="status"><i class="fas fa-chart-simple" aria-hidden="true"></i><b>لا رحلات مُسلَّمة في هذه الفترة</b></div>`;
            return;
        }
        box.innerHTML = `
            <div class="rep-wrap" tabindex="0" role="region" aria-label="جدول تقرير الكباتن"><table class="rep">
                <caption class="wj-sr-only">تقرير الكباتن — الأكثر ملاحظاتٍ أولاً</caption>
                <thead><tr>
                    <th scope="col">الكابتن</th><th scope="col">رحلات</th><th scope="col">متأخّرة</th>
                    <th scope="col">بعيد عن العميل</th><th scope="col">بلا موقع</th><th scope="col">بلا صورة</th>
                    <th scope="col">متوسط المدّة</th><th scope="col">ردّ على التنبيه</th>
                </tr></thead>
                <tbody>${report.captains.map(c => `<tr>
                    <th scope="row"><span class="rep-name">${esc(c.name)}</span>
                        ${c.phone ? `<a href="tel:${esc(c.phone)}" class="rep-phone">${esc(c.phone)}</a>` : ''}</th>
                    <td class="num">${c.trips}</td>
                    ${cell(c.late, c.trips, 'bad')}
                    ${cell(c.far, c.trips, 'bad')}
                    ${cell(c.noLocation, c.trips, 'warn')}
                    ${cell(c.noPhoto, c.trips, 'warn')}
                    <td class="num">${dur(c.avgMin)}</td>
                    <td class="num">${c.nudged ? `${c.acked}/${c.nudged}` : '—'}</td>
                </tr>`).join('')}</tbody>
            </table></div>
            ${report.truncated ? '<p class="rep-note">عُرضت أول 5000 رحلة فقط — اختر فترةً أقصر.</p>' : ''}`;
    }

    async function loadReport() {
        const city = $('trkCity').value;
        const days = $('repDays').value;
        if (window.UIState && !report) UIState.skeleton($('repBody'), { count: 3 });
        try {
            const qs = new URLSearchParams({ days });
            if (city) qs.set('city', city);
            const res = await fetch(`${API}/api/admin/tracking/report?${qs}`, { headers: headers() });
            if (res.status === 401) { location.href = 'admin-login.html'; return; }
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.message || '');
            report = body;
            renderReport();
        } catch (err) {
            const msg = window.friendlyError ? friendlyError(err, 'تعذّر تحميل تقرير الكباتن') : 'تعذّر تحميل تقرير الكباتن';
            if (window.UIState) UIState.error($('repBody'), { text: msg, onRetry: loadReport });
        }
    }

    function setView(v, focus) {
        view = v;
        try { localStorage.setItem('trk_view', v); } catch (_) {}
        const tabs = { trips: $('tabTrips'), report: $('tabReport') };
        for (const k of Object.keys(tabs)) {
            tabs[k].setAttribute('aria-selected', String(k === v));
            tabs[k].tabIndex = k === v ? 0 : -1;
        }
        $('viewTrips').hidden = v !== 'trips';
        $('viewReport').hidden = v !== 'report';
        if (focus) tabs[v].focus();
        if (v === 'report') loadReport();
    }
    $('tabTrips').addEventListener('click', () => setView('trips'));
    $('tabReport').addEventListener('click', () => setView('report'));
    $('viewTabs').addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        setView(view === 'trips' ? 'report' : 'trips', true);
    });
    $('repDays').addEventListener('change', loadReport);

    // ─── البداية ─────────────────────────────────────────────────────────
    renderChips();
    renderSound();
    if (window.UIState) UIState.skeleton($('trkList'), { count: 4 });
    load();
    schedule();
    connectLive();
    setView(view);
})();
