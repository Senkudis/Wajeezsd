/**
 * 🗺️ خريطة رحلةٍ واحدة — كابتن الطلب وحده، ونقطتا الاستلام والتسليم.
 *
 * تُفتح من لوحة التتبّع (admin-trip-map.html?order=<id>). الخريطة الحيّة
 * العامة تُظهر كل الكباتن، ومن يتابع طلباً يريد صاحبه فقط: أين هو الآن،
 * وإلى أين يتّجه، وكم بقي.
 *
 * البيانات: GET /api/admin/tracking/:id/map (routes/admin/tracking.js).
 * الحركة: حدث captain_location_update لغرفة الإدارة — نأخذ منه كابتن هذا
 * الطلب وحده ونتجاهل الباقين. وتحديثٌ دوريّ احتياطاً لتغيّر المرحلة.
 */
(function () {
    'use strict';

    const API = (typeof API_URL !== 'undefined' && API_URL) || '';
    const token = localStorage.getItem('adminToken');
    const REFRESH_MS = 20000;
    const orderId = new URLSearchParams(location.search).get('order') || '';

    const $ = (id) => document.getElementById(id);
    const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s));

    let data = null;
    let map = null;
    let mk = { captain: null, pickup: null, dropoff: null, proof: null, stops: [] };
    let lines = { toTarget: null, route: null };
    let capPos = null;          // موقع الكابتن المعروض الآن
    let capAt = null;           // وقت قياسه
    let heading = null;
    let follow = true;          // الخريطة تتبع الكابتن حتى يسحبها الأدمن
    let fitted = false;
    let live = false;

    // ─── تنسيق ────────────────────────────────────────────────────────────
    function dur(min) {
        if (min == null) return '—';
        if (min < 1) return 'أقل من دقيقة';
        const h = Math.floor(min / 60), m = min % 60;
        return h ? `${h} س${m ? ' ' + m + ' د' : ''}` : `${m} د`;
    }
    function dist(m) {
        if (m == null) return '—';
        return m < 1000 ? `${Math.round(m)} م` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} كم`;
    }
    function ago(at) {
        if (!at) return 'غير معروف';
        const s = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 1000));
        if (s < 30) return 'الآن';
        if (s < 90) return 'قبل دقيقة';
        return `قبل ${dur(Math.round(s / 60))}`;
    }
    function metersBetween(a, b) {
        const R = 6371000, rad = (d) => d * Math.PI / 180;
        const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(x));
    }
    function bearing(a, b) {
        const rad = (d) => d * Math.PI / 180;
        const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
        const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
                  Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function vehicleLabel(v) {
        return (window.VehicleTypes && VehicleTypes.label(v)) || v;
    }

    // تقديرٌ تقريبيّ: الخطّ المستقيم × 1.4 لتعرّج الطرق، بسرعة وسيلة الكابتن
    function etaMin(m) {
        const v = data && data.trip.captain && data.trip.captain.vehicleType;
        const kmh = (window.VehicleTypes && VehicleTypes.speed(v)) || 25;
        return Math.max(1, Math.round((m * 1.4 / 1000) / kmh * 60));
    }

    // ─── الحالة ───────────────────────────────────────────────────────────
    function setLive(text, bad) {
        const el = $('tmLive');
        el.textContent = text;
        el.classList.toggle('bad', !!bad);
    }
    function showError(msg) {
        $('tmSheetBody').innerHTML = `<div class="tm-empty" role="alert">
            <i class="fas fa-triangle-exclamation" aria-hidden="true"></i><p>${esc(msg)}</p>
            <a class="tm-btn" href="admin-tracking.html"><i class="fas fa-arrow-right" aria-hidden="true"></i> لوحة التتبّع</a></div>`;
    }

    // ─── الخريطة ──────────────────────────────────────────────────────────
    function initMap() {
        if (map || !(window.google && google.maps)) return;
        map = new google.maps.Map($('tmMap'), {
            center: { lat: 15.6445, lng: 32.4777 },
            zoom: 13,
            // لمسة إصبعٍ واحدة تسحب الخريطة — الافتراضيّ يطلب إصبعين داخل
            // صفحةٍ قابلة للتمرير، فيبدو للأدمن على الهاتف أنها لا تستجيب
            gestureHandling: 'greedy',
            clickableIcons: false,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            zoomControl: true,
            styles: [
                { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                { featureType: 'transit', stylers: [{ visibility: 'off' }] }
            ]
        });
        // سحبٌ يدويّ يوقف المتابعة — لا نشدّ الخريطة من تحت إصبعه
        map.addListener('dragstart', () => setFollow(false));
        if (data) draw();
    }
    window.initTripMap = initMap;

    function pinIcon(kind) {
        if (typeof WajeezMarkers === 'undefined') return undefined;
        return kind === 'pickup' ? WajeezMarkers.pickup() : WajeezMarkers.dropoff();
    }
    function capIcon() {
        const v = (data && data.trip.captain && data.trip.captain.vehicleType) || 'motorcycle';
        if (typeof WajeezMarkers !== 'undefined' && WajeezMarkers.captainPuck) return WajeezMarkers.captainPuck(v, heading);
        return undefined;
    }

    function place(key, pos, opts) {
        if (!pos) {
            if (mk[key]) { mk[key].setMap(null); mk[key] = null; }
            return;
        }
        const p = { lat: pos.lat, lng: pos.lng };
        if (mk[key]) { mk[key].setPosition(p); if (opts.icon) mk[key].setIcon(opts.icon); return; }
        mk[key] = new google.maps.Marker({ position: p, map, ...opts });
    }

    function drawStops() {
        mk.stops.forEach(m => m.setMap(null));
        mk.stops = (data.points.stops || []).map(s => new google.maps.Marker({
            position: { lat: s.lat, lng: s.lng }, map,
            title: `${s.type === 'pickup' ? 'استلام' : 'تسليم'} ${s.n}: ${s.address}`,
            label: { text: String(s.n), color: '#fff', fontWeight: '800', fontSize: '12px' },
            opacity: s.done ? 0.45 : 1,
            icon: {
                path: google.maps.SymbolPath.CIRCLE, scale: 13,
                fillColor: s.type === 'pickup' ? '#10b981' : '#e63946', fillOpacity: 1,
                strokeColor: '#fff', strokeWeight: 2.5
            }
        }));
    }

    function draw() {
        if (!map || !data) return;
        const P = data.points;
        const multi = (P.stops || []).length > 0;

        place('pickup', multi ? null : P.pickup, { icon: pinIcon('pickup'), title: 'الاستلام: ' + (P.pickup && P.pickup.address || ''), zIndex: 10 });
        place('dropoff', multi ? null : P.dropoff, { icon: pinIcon('dropoff'), title: 'التسليم: ' + (P.dropoff && P.dropoff.address || ''), zIndex: 10 });
        if (multi) drawStops();

        // أين أعلن الكابتن التسليم — دائرةٌ صغيرة بجانب دبّوس العميل
        place('proof', P.deliveredAt, {
            title: 'هنا أعلن الكابتن التسليم', zIndex: 20,
            icon: {
                path: google.maps.SymbolPath.CIRCLE, scale: 9,
                fillColor: P.deliveredAt && P.deliveredAt.verified === false ? '#dc2626' : '#2563eb',
                fillOpacity: 0.95, strokeColor: '#fff', strokeWeight: 3
            }
        });

        // خطّ الرحلة الباهت: الاستلام ← التسليم
        const routePath = multi ? P.stops.map(s => ({ lat: s.lat, lng: s.lng }))
            : [P.pickup, P.dropoff].filter(Boolean).map(p => ({ lat: p.lat, lng: p.lng }));
        if (lines.route) lines.route.setMap(null);
        lines.route = routePath.length > 1 ? new google.maps.Polyline({
            path: routePath, map, geodesic: true, strokeColor: '#64748b', strokeOpacity: 0, zIndex: 1,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.55, strokeWeight: 3, scale: 3 }, offset: '0', repeat: '14px' }]
        }) : null;

        drawCaptain(false);

        if (!fitted) { fitAll(); fitted = true; }
    }

    function drawCaptain(animate) {
        if (!map || !data) return;
        const showCap = !!capPos;
        if (!showCap) {
            place('captain', null);
        } else if (mk.captain && animate) {
            glide(mk.captain, capPos);
            mk.captain.setIcon(capIcon());
        } else {
            place('captain', capPos, { icon: capIcon(), title: (data.trip.captain && data.trip.captain.name) || 'الكابتن', zIndex: 100 });
        }

        // خطٌّ متّصل من الكابتن إلى وجهته الآن
        const t = data.target;
        if (lines.toTarget) lines.toTarget.setMap(null);
        lines.toTarget = (showCap && data.running && t && Number.isFinite(t.lat)) ? new google.maps.Polyline({
            path: [capPos, { lat: t.lat, lng: t.lng }], map, geodesic: true, zIndex: 2,
            strokeColor: t.kind === 'pickup' ? '#10b981' : '#e63946', strokeOpacity: 0.9, strokeWeight: 4
        }) : null;

        if (follow && showCap && data.running) map.panTo(capPos);
        renderFacts();
    }

    // تنقّلٌ سلس بدل القفز — التحديث كل ثوانٍ ويبدو الكابتن «يمشي»
    let glideRaf = null;
    function glide(marker, to) {
        const from = marker.getPosition();
        if (!from) { marker.setPosition(to); return; }
        const a = { lat: from.lat(), lng: from.lng() };
        const t0 = performance.now(), D = 900;
        cancelAnimationFrame(glideRaf);
        const step = (now) => {
            const k = Math.min(1, (now - t0) / D);
            marker.setPosition({ lat: a.lat + (to.lat - a.lat) * k, lng: a.lng + (to.lng - a.lng) * k });
            if (k < 1) glideRaf = requestAnimationFrame(step);
        };
        glideRaf = requestAnimationFrame(step);
    }

    function boundsPad() {
        const sheet = $('tmSheet');
        const wide = window.innerWidth >= 900;
        const h = sheet ? sheet.getBoundingClientRect().height : 0;
        return wide ? { top: 90, bottom: 40, left: 40, right: 420 } : { top: 90, bottom: Math.min(h, window.innerHeight * 0.6) + 24, left: 30, right: 30 };
    }

    function fitAll() {
        if (!map || !data) return;
        const P = data.points;
        const pts = [P.pickup, P.dropoff, P.deliveredAt, capPos].concat(P.stops || []).filter(p => p && Number.isFinite(p.lat));
        if (!pts.length) return;
        if (pts.length === 1) { map.setCenter(pts[0]); map.setZoom(15); return; }
        const b = new google.maps.LatLngBounds();
        pts.forEach(p => b.extend({ lat: p.lat, lng: p.lng }));
        map.fitBounds(b, boundsPad());
    }

    function setFollow(on) {
        follow = on;
        const btn = $('tmFollow');
        if (btn) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.classList.toggle('on', on); }
    }

    // ─── اللوحة السفلية ───────────────────────────────────────────────────
    const LEVEL = { late: ['متأخّر', 'late'], warn: ['قارب التأخّر', 'warn'], ok: ['في الوقت', 'ok'] };

    function renderSheet() {
        const t = data.trip;
        const c = t.captain;
        // المُسلَّمة: اسم المرحلة يكفي — شارة «تمّ التسليم» بجانبه تكرارٌ له
        const lv = data.running ? (LEVEL[t.late.level] || LEVEL.ok) : null;
        document.title = `رحلة #${t.ref} | وجيز`;
        $('tmTitle').textContent = `رحلة #${t.ref}`;

        const initial = c ? esc((c.name || 'ك').trim().charAt(0)) : '?';
        $('tmSheetBody').innerHTML = `
            <div class="tm-stage">
                ${lv ? `<span class="tm-pill ${lv[1]}">${lv[0]}</span>` : '<span class="tm-pill done"><i class="fas fa-check" aria-hidden="true"></i></span>'}
                <strong>${esc(t.stageLabel)}</strong>
                ${data.running ? `<span class="tm-muted">منذ ${dur(t.late.elapsed)}</span>` : ''}
            </div>

            ${c ? `<div class="tm-person">
                <div class="tm-avatar" aria-hidden="true">${c.photo ? `<img src="${esc(c.photo)}" alt="" loading="lazy">` : initial}</div>
                <div class="tm-who"><b>${esc(c.name)}</b><span class="tm-muted">الكابتن${c.vehicleType ? ' · ' + esc(vehicleLabel(c.vehicleType)) : ''}</span></div>
                ${c.phone ? `<a class="tm-call" href="tel:${esc(c.phone)}" aria-label="اتصال بالكابتن ${esc(c.name)}"><i class="fas fa-phone" aria-hidden="true"></i></a>` : ''}
            </div>` : '<p class="tm-muted">لا كابتن على هذا الطلب الآن.</p>'}

            <div id="tmFacts" class="tm-facts"></div>

            <ul class="tm-route">
                <li><span class="tm-dot a">A</span><div><b>الاستلام</b><span>${esc(t.pickup.address || '—')}${t.pickup.name ? ' — ' + esc(t.pickup.name) : ''}</span></div></li>
                <li><span class="tm-dot b">B</span><div><b>التسليم</b><span>${esc(t.dropoff.address || '—')}${t.client ? ' — ' + esc(t.client.name) : ''}</span></div>
                    ${t.client && t.client.phone ? `<a class="tm-call sm" href="tel:${esc(t.client.phone)}" aria-label="اتصال بالعميل ${esc(t.client.name)}"><i class="fas fa-phone" aria-hidden="true"></i></a>` : ''}</li>
            </ul>
            ${noPinsNote()}

            <div class="tm-actions">
                <button type="button" class="tm-btn" id="tmFit"><i class="fas fa-expand" aria-hidden="true"></i> الرحلة كاملة</button>
                ${data.running ? `<button type="button" class="tm-btn" id="tmFollow" aria-pressed="${follow}"><i class="fas fa-location-crosshairs" aria-hidden="true"></i> تتبّع الكابتن</button>` : ''}
                <a class="tm-btn ghost" href="admin-order-details.html?id=${encodeURIComponent(t.id)}"><i class="fas fa-file-lines" aria-hidden="true"></i> تفاصيل الطلب</a>
            </div>`;
        setFollow(follow);
        renderFacts();
    }

    function noPinsNote() {
        const P = data.points;
        const missing = [];
        if (!(P.stops || []).length) {
            if (!P.pickup) missing.push('الاستلام');
            if (!P.dropoff) missing.push('التسليم');
        }
        return missing.length
            ? `<p class="tm-note"><i class="fas fa-circle-info" aria-hidden="true"></i> لا إحداثيات لنقطة ${missing.join(' و')} — كُتب العنوان نصّاً فقط.</p>` : '';
    }

    function renderFacts() {
        const box = $('tmFacts');
        if (!box || !data) return;
        const out = [];
        const t = data.target;
        if (!data.running) {
            // رحلةٌ منتهية: موقع الكابتن الآن لا يعني شيئاً — الحكم بموقع إعلان التسليم
        } else if (!capPos) {
            out.push(`<span class="tm-fact bad"><i class="fas fa-location-dot" aria-hidden="true"></i> لا موقع للكابتن — لم يُرسل تطبيقه موقعاً بعد</span>`);
        } else {
            const ageMin = capAt ? (Date.now() - new Date(capAt).getTime()) / 60000 : null;
            const staleAfter = (data.trip.captain && data.trip.captain.gps && data.trip.captain.gps.staleAfter) || 12;
            const stale = ageMin != null && ageMin >= staleAfter;
            out.push(`<span class="tm-fact ${stale ? 'bad' : ''}"><i class="fas fa-satellite-dish" aria-hidden="true"></i> الموقع ${ago(capAt)}${stale ? ' — قديم' : ''}</span>`);
            if (data.running && t && Number.isFinite(t.lat)) {
                const m = metersBetween(capPos, t);
                const where = t.kind === 'pickup' ? 'الاستلام' : 'العميل';
                out.push(`<span class="tm-fact"><i class="fas fa-route" aria-hidden="true"></i> ${m <= 150 ? 'عند ' + where : 'يبعد ' + dist(m) + ' عن ' + where}</span>`);
                if (m > 150) out.push(`<span class="tm-fact"><i class="fas fa-hourglass-half" aria-hidden="true"></i> يصل خلال نحو ${dur(etaMin(m))}</span>`);
            }
        }
        const mo = data.trip.motion;
        if (mo && mo.state === 'stopped') out.push(`<span class="tm-fact warn"><i class="fas fa-hand" aria-hidden="true"></i> واقف منذ ${dur(mo.stoppedMin)}</span>`);
        const dp = data.points.deliveredAt;
        if (dp && dp.distanceM != null) {
            out.push(`<span class="tm-fact ${dp.verified === false ? 'bad' : ''}"><i class="fas fa-circle-dot" aria-hidden="true"></i> أعلن التسليم على بُعد ${dist(dp.distanceM)} من العميل</span>`);
        }
        box.innerHTML = out.join('');
    }

    // ─── التحميل ──────────────────────────────────────────────────────────
    async function load() {
        if (!orderId) { showError('لم يُحدَّد الطلب.'); return; }
        try {
            const res = await fetch(`${API}/api/admin/tracking/${encodeURIComponent(orderId)}/map`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) { showError(body.message || 'تعذّر تحميل الرحلة'); setLive('تعذّر التحميل', true); return; }
            const first = !data;
            const prevCap = data && data.trip.captain && data.trip.captain.id;
            data = body;
            const cap = data.trip.captain && data.trip.captain.id;
            // نُقل الطلب لكابتنٍ آخر، أو انتهت الرحلة: موقع السابق لا يخصّ هذه الخريطة
            if ((prevCap && prevCap !== cap) || !data.running) { capPos = null; capAt = null; heading = null; }
            // الموقع من الخادم يُعتمد فقط إن كان أحدث مما وصل عبر المقبس
            const srv = data.captainLocation;
            if (data.running && srv && (!capAt || new Date(srv.at || 0) > new Date(capAt))) { capPos = { lat: srv.lat, lng: srv.lng }; capAt = srv.at; }
            if (first && !data.running) setFollow(false);
            renderSheet();
            draw();
            setLive(live ? 'مباشر' : 'يتحدّث كل 20 ث', false);
        } catch (e) {
            setLive('لا اتصال', true);
            if (!data) showError('تعذّر الاتصال بالخادم');
        }
    }

    function connectLive() {
        if (typeof io !== 'function' || !token) return;
        try {
            const sock = io(API || undefined, { transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 2000, auth: { token } });
            sock.on('connect', () => { sock.emit('admin_join'); live = true; setLive('مباشر', false); });
            sock.on('disconnect', () => { live = false; setLive('انقطع البثّ — يتحدّث كل 20 ث', true); });
            // كل الكباتن يبثّون لغرفة الإدارة — نأخذ كابتن هذا الطلب وحده
            sock.on('captain_location_update', (d) => {
                const cap = data && data.trip.captain;
                if (!cap || !data.running) return;
                if (String(d.captainId || d.userId) !== String(cap.id)) return;
                const lat = Number(d.lat), lng = Number(d.lng);
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
                const next = { lat, lng };
                if (capPos && metersBetween(capPos, next) > 5) heading = bearing(capPos, next);
                capPos = next;
                capAt = new Date().toISOString();
                drawCaptain(true);
            });
            sock.on('admin_order_update', (d) => {
                if (d && String(d.orderId) === String(orderId)) load();
            });
        } catch (_) { /* بلا مقبس — التحديث الدوريّ يكفي */ }
    }

    // ─── أحداث ────────────────────────────────────────────────────────────
    document.addEventListener('click', (e) => {
        if (e.target.closest('#tmFit')) { setFollow(false); fitAll(); }
        else if (e.target.closest('#tmFollow')) {
            setFollow(!follow);
            if (follow && capPos && map) { map.panTo(capPos); if (map.getZoom() < 15) map.setZoom(16); }
        } else if (e.target.closest('#tmHandle')) {
            const s = $('tmSheet');
            const open = s.classList.toggle('collapsed');
            e.target.closest('#tmHandle').setAttribute('aria-expanded', open ? 'false' : 'true');
        }
    });

    load();
    connectLive();
    setInterval(load, REFRESH_MS);
    setInterval(renderFacts, 15000);   // «قبل دقيقة» يتقدّم بلا حدث
    if (window.google && google.maps) initMap();
})();
