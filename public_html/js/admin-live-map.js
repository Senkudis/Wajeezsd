// ============================================================
// Admin Live Map — Real-time Captain Tracking
//
// كل كباتن المدينة على خريطةٍ واحدة: أين هم، ومن منهم متاح أو مشغول أو
// غير متصل. (رحلةٌ بعينها تُتابَع من admin-trip-map.html — كابتنها وحده.)
//
// البيانات: GET /api/admin/active-captains (routes/admin/dashboard.js)،
// ثم مباشرةً من غرفة الإدارة:
//   captain_location_update  موقعٌ جديد
//   captain_status_changed   فتح/أغلق استقبال الطلبات
//   admin_order_update       قبول/تسليم/إلغاء — يغيّر «مشغول»، فنعيد التحميل
// ============================================================

const token = localStorage.getItem('adminToken');
let userObj = null;
try { userObj = JSON.parse(localStorage.getItem('user')); } catch(e) {}
if (!token || !userObj || userObj.role !== 'admin') {
    window.location.href = 'admin-login.html';
}

const MAP_API = (typeof API_URL !== 'undefined') ? API_URL : 'https://wajeezsd.com';

// 🍞 توست احتياطي — الصفحة لا تحمّل notification-toast.js، والنداء بدونه
// يرمي ReferenceError (نفس إصلاح admin-panel.js)
if (typeof window.showToast !== 'function') {
    window.showToast = function (msg, type = 'success') {
        try {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    toast: true, position: 'top-end',
                    icon: type === 'error' ? 'error' : (type === 'info' ? 'info' : 'success'),
                    title: msg, timer: 2600, showConfirmButton: false
                });
            }
        } catch (e) { /* لا توست — لا شيء يتعطّل */ }
    };
}

const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

// مراكز المدن من WajeezCities (config.js) — مصدرٌ واحد
const CITY_CENTER = Object.fromEntries(WajeezCities.KEYS.map(k => [k, WajeezCities.center(k)]));

// ── الحالة: مشغول / متاح / غير متصل ─────────────────────────────
// كانت تُقرأ من isActive (حالة الحساب: غير موقوف) فيظهر كل كابتنٍ «متاحاً»
// ولو أغلق تطبيقه منذ أيام، في آخر مكانٍ عُرف له. و«مشغول» في دليل الألوان
// لم يكن يُعطى لأحد. الآن:
//   مشغول      يحمل طلباً الآن (من الخادم)
//   متاح       فتح استقبال الطلبات، وموقعه قيس خلال STALE_MIN
//   غير متصل   ما عدا ذلك — ويبقى دبّوسه رمادياً في آخر موقعٍ عُرف له
const STALE_MIN = 15;
function isFresh(at) {
    if (!at) return false;
    const t = new Date(at).getTime();
    return Number.isFinite(t) && (Date.now() - t) < STALE_MIN * 60000;
}
function statusOf(d) {
    if (d.busy) return 'busy';
    return d.available && isFresh(d.locationAt) ? 'available' : 'offline';
}
function hasLocation(d) {
    return !!d && Number.isFinite(d.lat) && Number.isFinite(d.lng) && !(d.lat === 0 && d.lng === 0);
}

function agoText(at) {
    if (!at) return 'غير معروف';
    const s = Math.round((Date.now() - new Date(at).getTime()) / 1000);
    if (!Number.isFinite(s)) return 'غير معروف';
    if (s < 60) return 'الآن';
    const m = Math.round(s / 60);
    if (m < 60) return `قبل ${m} د`;
    const h = Math.floor(m / 60);
    if (h < 48) return `قبل ${h} س`;
    return `قبل ${Math.floor(h / 24)} يوم`;
}

// الهاتف محفوظٌ 249XXXXXXXXX — «tel:» بلا «+» يُطلب رقماً محلياً خاطئاً
function telHref(phone) {
    const p = String(phone || '').replace(/[^\d+]/g, '');
    return 'tel:' + (/^249\d{9}$/.test(p) ? '+' + p : p);
}

// أيقونة احتياطية إن لم يُحمَّل map-markers.js — دائرةٌ بلون الحالة
function fallbackIcon(status, isHighlighted) {
    const colors = { available: '#16a34a', busy: '#d97706', offline: '#6b7280' };
    return {
        path: google.maps.SymbolPath.CIRCLE, scale: isHighlighted ? 12 : 9,
        fillColor: isHighlighted ? '#f59e0b' : (colors[status] || colors.offline), fillOpacity: 1,
        strokeColor: isHighlighted ? '#92400e' : '#fff', strokeWeight: isHighlighted ? 3 : 2.5
    };
}
function iconFor(status, isHighlighted) {
    return (typeof WajeezMarkers !== 'undefined') ? WajeezMarkers.captain(status, isHighlighted) : fallbackIcon(status, isHighlighted);
}

// ── State ─────────────────────────────────────────────────────
let adminMap     = null;
// كل كباتن المدينة المختارة: { id: { name, phone, city, lat, lng, locationAt, available, busy } }
// — بموقعٍ أو بدونه. الدبابيس لمن له موقع، والعدّادات والبحث للجميع.
let loadedOnInit = {};
let highlightedCaptainId = null;
let firstLoadDone = false;

function selectedCity() {
    const sel = document.getElementById('liveCitySelector');
    return (sel && sel.value) || 'Khartoum';
}

// ── MarkerPool — بدون Memory Leak ────────────────────────────
const MarkerPool = {
    _pool:       {},   // { captainId: { marker, infoWindow, mover, iconKey, hl } }
    // بعد أوّل تحميل: الكابتن الذي يظهر لاحقاً «يسقط» على الخريطة ليُلحظ. قبله
    // لا — كان فتح الصفحة يُسقط خمسين دبّوساً معاً في فوضى واحدة.
    _ready:      false,

    /** يرسم الكابتن من loadedOnInit — مصدرٌ واحد للاسم والهاتف والحالة */
    upsert(map, captainId, isHighlighted = false) {
        const d = loadedOnInit[captainId];
        if (!map || !hasLocation(d)) { this.remove(captainId); return; }
        const { lat, lng } = d;
        const status = statusOf(d);
        const existing = this._pool[captainId];
        const iconKey = status + (isHighlighted ? ':hl' : '');

        if (existing) {
            // سيرٌ متّصل بدل القفز — js/marker-motion.js
            existing.mover.moveTo({ lat, lng });
            // الأيقونة تُعاد فقط إن تغيّرت الحالة — لا صورةً جديدة مع كل موقع
            if (existing.iconKey !== iconKey) { existing.marker.setIcon(iconFor(status, isHighlighted)); existing.iconKey = iconKey; }
            existing.marker.setTitle(d.name || 'كابتن');
            existing.marker.setZIndex(isHighlighted ? 999 : (status === 'offline' ? 1 : 10));
            // القفز لحظةَ التحديد وحدها — كان يتكرّر مع كل تحديث موقعٍ للمحدَّد
            // (كل ٣ ثوانٍ)، فيقفز الدبّوس بلا توقّف
            if (isHighlighted && !existing.hl && !MarkerMotion.reducedMotion()) {
                existing.marker.setAnimation(google.maps.Animation.BOUNCE);
                setTimeout(() => existing.marker.setAnimation(null), 1400);
            }
            existing.hl = !!isHighlighted;
            // نافذةٌ مفتوحة تعرض الحالة والوقت الجديدين لا ما كانا عند فتحها
            if (existing.infoWindow.getMap && existing.infoWindow.getMap()) {
                existing.infoWindow.setContent(buildInfoContent(captainId));
            }
        } else {
            const marker = new google.maps.Marker({
                position:  { lat, lng },
                map,
                title:     d.name || 'كابتن',
                icon:      iconFor(status, isHighlighted),
                animation: (this._ready && !MarkerMotion.reducedMotion()) ? google.maps.Animation.DROP : null,
                // غير المتّصل تحت المتاح والمشغول — لا يغطّي من يهمّ الآن
                zIndex:    isHighlighted ? 999 : (status === 'offline' ? 1 : 10)
            });

            const infoWindow = new google.maps.InfoWindow();

            marker.addListener('click', () => {
                infoWindow.setContent(buildInfoContent(captainId));
                infoWindow.open(map, marker);
            });

            this._pool[captainId] = { marker, infoWindow, mover: MarkerMotion.create(marker), iconKey, hl: !!isHighlighted };
        }
    },

    remove(captainId) {
        const entry = this._pool[captainId];
        if (entry) {
            entry.mover.stop();
            entry.marker.setMap(null);
            entry.infoWindow.close();
            delete this._pool[captainId];
        }
    },

    clearAll() {
        Object.values(this._pool).forEach(({ marker, infoWindow, mover }) => {
            mover.stop();
            marker.setMap(null);
            infoWindow.close();
        });
        this._pool = {};
    },

    count() { return Object.keys(this._pool).length; },

    openInfoWindow(captainId) {
        const entry = this._pool[captainId];
        if (!entry || !adminMap) return;
        entry.infoWindow.setContent(buildInfoContent(captainId));
        entry.infoWindow.open(adminMap, entry.marker);
    }
};

function buildInfoContent(captainId) {
    const d = loadedOnInit[captainId] || {};
    const status = statusOf(d);
    const statusLabel = { available: 'متاح', busy: 'مشغول — يحمل طلباً', offline: 'غير متصل' }[status];
    const color = { available: '#16a34a', busy: '#d97706', offline: '#6b7280' }[status];

    // الاسم والهاتف من بيانات الكباتن — يُهرَّبان قبل دخول الصفحة
    return `
        <div style="font-family:'Cairo',sans-serif;direction:rtl;text-align:right;min-width:170px;padding:4px 0;">
            <div style="font-size:15px;font-weight:800;color:#1a202c;margin-bottom:6px;">${esc(d.name || 'كابتن')}</div>
            <div style="font-size:13px;color:#555;margin-bottom:4px;">الحالة: <b style="color:${color}">${statusLabel}</b></div>
            ${d.phone ? `<div style="font-size:12px;margin-bottom:4px;"><a href="${esc(telHref(d.phone))}" dir="ltr" style="color:#2563eb;text-decoration:none;">${esc(d.phone)}</a></div>` : ''}
            <div style="font-size:11px;color:#94a3b8;margin-top:6px;">آخر موقع: ${agoText(d.locationAt)}</div>
        </div>`;
}

function redraw(captainId) {
    if (adminMap) MarkerPool.upsert(adminMap, captainId, captainId === highlightedCaptainId);
}

// ── Socket.io ─────────────────────────────────────────────────
const socket = io(MAP_API, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    auth: { token }
});

let wasDisconnected = false;
socket.on('connect', () => {
    socket.emit('admin_join');
    updateStatus('متصل — مباشر', 'green');
    // ما فات أثناء الانقطاع (مواقع، قبول طلبات) لا يُعاد بثّه — نعيد التحميل
    if (wasDisconnected) { wasDisconnected = false; reloadSoon(); }
});

socket.on('disconnect', () => {
    wasDisconnected = true;
    updateStatus('غير متصل — يتحدّث كل دقيقة', 'red');
});

socket.on('connect_error', (err) => {
    wasDisconnected = true;
    console.error('Socket error:', err.message);
    updateStatus('خطأ في الاتصال', 'orange');
});

// ── captain_location_update (index.js و routes/captain.js) ─────────
socket.on('captain_location_update', (data) => {
    if (!data) return;
    // الخادم يبثّ كل المدن لغرفة الإدارة — نأخذ مدينة الخريطة وحدها
    if (data.city && data.city !== selectedCity()) return;

    const captainId = String(data.captainId || data.userId || '');
    const lat = Number(data.lat), lng = Number(data.lng);
    if (!captainId || !hasLocation({ lat, lng })) return;

    const cached = loadedOnInit[captainId] || {};
    // وقت القياس من الخادم؛ وقراءةٌ أقدم ممّا نعرضه (وصلت متأخّرة) لا تُرجعه للوراء
    const at = data.fixedAt || new Date().toISOString();
    if (cached.locationAt && new Date(at) < new Date(cached.locationAt)) return;

    loadedOnInit[captainId] = {
        ...cached,
        name:  data.name || cached.name || 'كابتن',
        city:  data.city || cached.city,
        lat, lng,
        locationAt: at,
        // «status» في البثّ = isAvailableForWork؛ «مشغول» لا يعرفه البثّ فيبقى من التحميل
        available: data.status ? data.status === 'available' : !!cached.available,
        busy: !!cached.busy
    };
    redraw(captainId);
    updateCounters();
});

// فتح/أغلق الكابتن استقبال الطلبات (أو سجّل خروجه)
socket.on('captain_status_changed', (data) => {
    const captainId = data && String(data.userId || data.captainId || '');
    if (!captainId || !loadedOnInit[captainId]) return;
    loadedOnInit[captainId].available = !!data.isAvailableForWork;
    redraw(captainId);
    updateCounters();
});

// قبولٌ أو تسليمٌ أو إلغاء يغيّر «مشغول» — نعيد التحميل بعد هدوء الأحداث
socket.on('admin_order_update', (data) => {
    if (data && data.city && data.city !== selectedCity()) return;
    reloadSoon();
});

let reloadTimer = null;
function reloadSoon() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => loadInitialCaptains({ quiet: true }), 1500);
}

// ── Map Init ──────────────────────────────────────────────────
function initMapLogic() {
    const el = document.getElementById('map');
    if (adminMap) return;
    if (!el || !window.google?.maps) {
        console.error('Google Maps not loaded');
        return;
    }

    adminMap = new google.maps.Map(el, {
        center:            CITY_CENTER[selectedCity()] || CITY_CENTER.Khartoum,
        zoom:              13,
        mapTypeId:         google.maps.MapTypeId.ROADMAP,
        streetViewControl: false,
        mapTypeControl:    false,
        fullscreenControl: true,
        // إصبعٌ واحد يسحب الخريطة على الهاتف — «auto» يطلب إصبعين أحياناً
        // فتبدو الخريطة لا تستجيب للمس
        gestureHandling:   'greedy',
        styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] }
        ]
    });

    // Render any markers that arrived before map was ready
    Object.keys(loadedOnInit).forEach(redraw);
    updateCounters();

    // Close dropdown on map click
    adminMap.addListener('click', () => closeDropdown());
}

// المدينة قبل الخريطة: مركزها الأوّل من المحدِّد
setupCities();

// Google Maps callback
window._adminMapInit = initMapLogic;
if (window._adminMapReady) initMapLogic();

// ── Load Initial Positions via REST API ───────────────────────
let loadSeq = 0;
async function loadInitialCaptains(opts = {}) {
    const city = selectedCity();
    const seq = ++loadSeq;   // تبديل المدينة أثناء تحميلٍ سابق: الردّ القديم لا يكتب فوقه
    try {
        const res = await fetch(`${MAP_API}/api/admin/active-captains?city=${encodeURIComponent(city)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (seq !== loadSeq) return;
        if (res.status === 401) { window.location.href = 'admin-login.html'; return; }

        if (!res.ok) {
            console.warn('active-captains fetch failed:', res.status);
            hideLoader();
            if (!opts.quiet) showToast('تعذّر تحميل مواقع الكباتن', 'error');
            return;
        }

        const captains = await res.json();
        if (seq !== loadSeq) return;

        const next = {};
        (Array.isArray(captains) ? captains : []).forEach(c => {
            const loc = c.location || c.currentLocation || {};
            const id = String(c._id);
            const prev = loadedOnInit[id] || {};
            const restAt = c.locationAt || loc.fixedAt || loc.updatedAt || null;
            // البثّ قد يكون أحدث من الردّ (وصل أثناء الطلب) — الأحدث يبقى
            const keepLive = prev.locationAt && restAt && new Date(prev.locationAt) > new Date(restAt);
            next[id] = {
                name:   c.name || 'كابتن',
                phone:  c.phone || '',
                city:   c.city || city,
                lat:    keepLive ? prev.lat : Number(loc.lat),
                lng:    keepLive ? prev.lng : Number(loc.lng),
                locationAt: keepLive ? prev.locationAt : restAt,
                // الردود الأقدم من هذا الإصلاح بلا isAvailableForWork — نرجع لـ isActive
                available: ('isAvailableForWork' in c) ? !!c.isAvailableForWork : !!c.isActive,
                busy:   !!c.busy
            };
        });

        // كابتنٌ لم يعد في القائمة (حُذف أو نُقل لمدينةٍ أخرى) يُزال دبّوسه
        Object.keys(loadedOnInit).forEach(id => { if (!next[id]) MarkerPool.remove(id); });
        loadedOnInit = next;
        Object.keys(loadedOnInit).forEach(redraw);
        updateCounters();

        MarkerPool._ready = true;

        // ⚠️ كان هنا renderSearchList(captains) — دالةٌ غير معرّفة في أيّ ملف، فكان
        //    كل تحميلٍ ناجح يرمي ReferenceError: لا يُخفى غطاء التحميل، ولا يُتمركز
        //    على نجدةٍ ولا على كابتنٍ قادمٍ من لوحة التتبّع. البحث يعمل من loadedOnInit.
        setTimeout(hideLoader, 300);

        if (firstLoadDone) return;
        firstLoadDone = true;

        // 🚨 قدِم من إشعار نجدة؟ تمركّز على موقع التنبيه (?alert=<id>)
        focusEmergencyFromUrl();

        // 🛰️ رابطٌ لكابتنٍ بعينه؟ تمركّز عليه (?focus=<captainId>)
        const focusId = new URLSearchParams(location.search).get('focus');
        if (focusId && loadedOnInit[focusId]) {
            selectCaptain(focusId);
        } else if (focusId) {
            showToast('هذا الكابتن ليس له موقعٌ على الخريطة الآن', 'info');
        }

    } catch (err) {
        if (seq !== loadSeq) return;
        console.error('Fetch active-captains error:', err);
        hideLoader();
        if (!opts.quiet) showToast('تعذّر الاتصال بالخادم', 'error');
    }
}

// الغطاء لا يبقى فوق الخريطة إن فشل التحميل — كان يبقى بعد تبديل
// المدينة فتبدو الخريطة ميّتة لا تستجيب للمس
function hideLoader() {
    const l = document.getElementById('mapLoader');
    if (l) l.style.display = 'none';
}

// 🚨 تمركُز الخريطة على موقع نجدة الكابتن عند القدوم من إشعار الطوارئ.
// موقع النجدة (حيث ضغط الكابتن الزر) هو المهم — قد يختلف عن موقعه الحيّ.
let _emergencyFocused = false;
let _emergencyMarker = null;
let _emergencyRetries = 0;
async function focusEmergencyFromUrl() {
    if (_emergencyFocused) return;
    const alertId = new URLSearchParams(location.search).get('alert');
    if (!alertId) return;
    // الخريطة قد لا تكون جاهزة بعد (callback جوجل) — أعِد المحاولة دون استهلاك العلم
    if (!adminMap) {
        if (_emergencyRetries++ < 20) setTimeout(focusEmergencyFromUrl, 500);
        return;
    }
    _emergencyFocused = true;
    try {
        const res = await fetch(`${MAP_API}/api/admin/emergency-alerts`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const alerts = await res.json();
        const alert = alerts.find(a => String(a._id) === String(alertId));
        if (!alert || !alert.location || !alert.location.lat) {
            showToast('تعذّر تحديد موقع تنبيه الطوارئ', 'error');
            return;
        }
        const { lat, lng } = alert.location;
        const capName = (alert.captain && alert.captain.name) || 'كابتن';

        if (!adminMap) return;
        adminMap.panTo({ lat, lng });
        adminMap.setZoom(16);

        // ماركر نجدة مميّز (أحمر نابض) عند نقطة الاستغاثة
        if (_emergencyMarker) _emergencyMarker.setMap(null);
        _emergencyMarker = new google.maps.Marker({
            position: { lat, lng }, map: adminMap,
            title: `نجدة: ${capName}`,
            zIndex: 99999,
            animation: google.maps.Animation.BOUNCE,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 16, fillColor: '#dc2626', fillOpacity: 0.95,
                strokeColor: '#fff', strokeWeight: 3
            }
        });
        const info = new google.maps.InfoWindow({
            content: `<div style="font-family:'Cairo',sans-serif;font-weight:800;color:#dc2626;">نجدة — ${esc(capName)}</div>
                      <div style="font-family:'Cairo',sans-serif;font-size:12px;color:#475569;">${esc(new Date(alert.createdAt).toLocaleString('ar-SD'))}</div>`
        });
        info.open(adminMap, _emergencyMarker);
        showToast(`موقع نجدة الكابتن ${capName}`, 'info');
    } catch (e) {
        console.error('emergency focus failed', e);
    }
}

// ── City Switcher ─────────────────────────────────────────────
// الأدمن المساعد يرى مدنه وحدها: الخادم يفرضها على البيانات، فإن بقي المحدِّد
// على «الخرطوم» لأدمن بورتسودان أسقطت الصفحة كل بثٍّ لكباتنه (مدينته ≠ المختارة)
// وتمركزت الخريطة في مدينةٍ لا يراها.
function setupCities() {
    const sel = document.getElementById('liveCitySelector');
    if (!sel) return;
    const valid = Array.from(sel.options).map(o => o.value);
    if (userObj && userObj.adminRole === 'sub_admin') {
        const mine = (Array.isArray(userObj.cities) && userObj.cities.length ? userObj.cities : [userObj.city])
            .filter(c => valid.includes(c));
        if (mine.length) {
            Array.from(sel.options).forEach(o => { if (!mine.includes(o.value)) o.remove(); });
            sel.disabled = mine.length === 1;
        }
    }
    let saved = null;
    try { saved = localStorage.getItem('live_city'); } catch (_) {}
    if (saved && Array.from(sel.options).some(o => o.value === saved)) sel.value = saved;
}

window.changeLiveCity = function() {
    const city = selectedCity();
    try { localStorage.setItem('live_city', city); } catch (_) {}

    // Clear current map
    MarkerPool.clearAll();
    loadedOnInit = {};
    highlightedCaptainId = null;
    updateCounters();
    clearSearchBox();

    // Show loader
    document.getElementById('mapLoader').style.display = 'flex';

    // Jump to new city
    if (adminMap) {
        adminMap.setCenter(CITY_CENTER[city] || CITY_CENTER.Khartoum);
        adminMap.setZoom(13);
    }

    // Fetch captains
    loadInitialCaptains();
};

// ── Counters ──────────────────────────────────────────────────
// «نشط»: متاحٌ أو مشغول على الخريطة الآن. «غير متصل»: الباقون — بموقعٍ قديم
// أو بلا موقع. «الإجمالي»: كل كباتن المدينة. كان «غير متصل» صفراً دائماً
// (يُحسب ممن لهم موقعٌ فقط) و«النشط» كل من له موقعٌ ولو من أسبوع.
function updateCounters() {
    const onlineEl  = document.getElementById('onlineCount');
    const totalEl   = document.getElementById('totalCount');
    const offlineEl = document.getElementById('offlineCount');

    const all = Object.values(loadedOnInit);
    const active = all.filter(d => hasLocation(d) && statusOf(d) !== 'offline').length;
    if (onlineEl) onlineEl.textContent = active;
    if (offlineEl) offlineEl.textContent = all.length - active;
    if (totalEl) totalEl.textContent = all.length;
}

function updateStatus(msg, color) {
    const el = document.getElementById('connectionStatus');
    if (!el) return;
    const colors = { green: '#22c55e', red: '#ef4444', orange: '#f59e0b' };
    el.textContent = msg;
    el.style.color = colors[color] || color;
}

// «متاح» يصير «غير متصل» بمرور الوقت بلا حدث (توقّف موقعه) — نعيد الحكم كل
// دقيقة، ونعيد التحميل كاملاً احتياطاً إن انقطع البثّ
setInterval(() => {
    Object.keys(loadedOnInit).forEach(redraw);
    updateCounters();
    if (!socket.connected && !document.hidden) loadInitialCaptains({ quiet: true });
}, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadInitialCaptains({ quiet: true }); });

// ════════════════════════════════════════════════════════
// 🔍  SEARCH LOGIC
// ════════════════════════════════════════════════════════

const searchInput   = document.getElementById('captainSearchInput');
const searchDropdown = document.getElementById('searchDropdown');
const searchClearBtn = document.getElementById('searchClearBtn');

let searchDebounce = null;

searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    searchClearBtn.classList.toggle('visible', q.length > 0);

    clearTimeout(searchDebounce);
    if (q.length === 0) { closeDropdown(); return; }

    searchDebounce = setTimeout(() => performSearch(q), 200);
});

// Keyboard shortcuts
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { clearSearch(); return; }
    if (e.key === 'Enter') {
        // Pick first result
        const first = searchDropdown.querySelector('.search-result-item');
        if (first) first.click();
    }
});

// Ctrl+F / Cmd+F to focus search
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
    }
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (!document.getElementById('searchBar').contains(e.target)) {
        closeDropdown();
    }
});

// اختيار نتيجة — بالمعرّف من data-id لا بنداءٍ مضمَّن يُبنى من الاسم:
// اسمٌ فيه علامة تنصيص كان يكسر النداء (أو يحقن فيه)
searchDropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (item) selectCaptain(item.dataset.id);
});

function performSearch(query) {
    const q = query.toLowerCase().trim();
    if (!q) { closeDropdown(); return; }

    // Search through all known captains (on-map + offline)
    const results = Object.entries(loadedOnInit)
        .filter(([, d]) => AdminSearch.matches(q, d))
        .map(([id, d]) => ({ id, ...d, status: statusOf(d) }))
        .slice(0, 8); // max 8 results

    renderDropdown(results, query);
}

function highlight(text, query) {
    const safeText = esc(text || '');
    if (!text || !query) return safeText;
    const escapedQuery = esc(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safeText.replace(new RegExp(escapedQuery, 'gi'), m => `<mark>${m}</mark>`);
}

function renderDropdown(results, query) {
    if (results.length === 0) {
        searchDropdown.innerHTML = `
            <div class="search-no-result">
                <i class="fas fa-search-minus" aria-hidden="true"></i>
                لا توجد نتائج لـ «<b>${esc(query)}</b>»
            </div>`;
        searchDropdown.classList.add('open');
        return;
    }

    const statusLabel = { available: 'متاح', busy: 'مشغول', offline: 'غير متصل' };

    searchDropdown.innerHTML = results.map(c => `
        <div class="search-result-item" role="button" tabindex="0" data-id="${esc(c.id)}">
            <div class="sri-avatar ${c.status}"><i class="fas fa-motorcycle" aria-hidden="true"></i></div>
            <div class="sri-info">
                <div class="sri-name">${highlight(c.name || 'كابتن', query)}</div>
                ${c.phone ? `<div class="sri-phone" dir="ltr" style="text-align:right;">${highlight(c.phone, query)}</div>` : ''}
            </div>
            <span class="sri-status-badge ${c.status}">${hasLocation(c) ? statusLabel[c.status] : 'بلا موقع'}</span>
        </div>
    `).join('');

    searchDropdown.classList.add('open');
}

function selectCaptain(captainId) {
    const d = loadedOnInit[captainId];
    closeDropdown();
    if (!d) return;
    searchInput.value = d.name || '';
    searchClearBtn.classList.add('visible');

    if (!hasLocation(d)) {
        // Captain not on map (no GPS ever) — show toast
        showToast(`${d.name || 'الكابتن'} لم يُرسل موقعاً بعد`, 'info');
        return;
    }

    highlightCaptain(captainId);
}

function highlightCaptain(captainId) {
    const prev = highlightedCaptainId;
    highlightedCaptainId = captainId;
    // Reset previously highlighted
    if (prev && prev !== captainId) redraw(prev);

    // Re-draw with highlighted icon
    redraw(captainId);

    // Pan + zoom to captain smoothly
    const d = loadedOnInit[captainId];
    if (adminMap && d) {
        adminMap.panTo({ lat: d.lat, lng: d.lng });
        if (adminMap.getZoom() < 15) adminMap.setZoom(15);
    }

    // Auto-open info window
    setTimeout(() => MarkerPool.openInfoWindow(captainId), 400);
}

function clearSearchBox() {
    searchInput.value = '';
    searchClearBtn.classList.remove('visible');
    closeDropdown();
}

function clearSearch() {
    clearSearchBox();
    searchInput.focus();

    // Reset highlighted marker
    if (highlightedCaptainId) {
        const prev = highlightedCaptainId;
        highlightedCaptainId = null;
        redraw(prev);
    }
}

function closeDropdown() {
    if (searchDropdown) searchDropdown.classList.remove('open');
}

// ── Cleanup ────────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
    MarkerPool.clearAll();
    socket.off('captain_location_update');
    socket.off('captain_status_changed');
    socket.off('admin_order_update');
    socket.disconnect();
});

// ── Start ──────────────────────────────────────────────────────
loadInitialCaptains();
