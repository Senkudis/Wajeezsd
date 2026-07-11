// ============================================================
// Admin Live Map — Real-time Captain Tracking
// Fixed: event names, data structure, custom icons, InfoWindows
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
                    title: msg, timer: 2200, showConfirmButton: false
                });
            } else {
                console.log('[toast]', msg);
            }
        } catch (e) { console.log('[toast]', msg); }
    };
}

// ── Custom motorcycle SVG icon (inline, no external dependency) ──────────
function makeCaptainIcon(status, isHighlighted = false) {
    const colors = {
        available: '#16a34a', // green
        busy:      '#d97706', // amber
        offline:   '#6b7280'  // gray
    };
    const fill = isHighlighted ? '#f59e0b' : (colors[status] || colors.available);
    const stroke = isHighlighted ? '#92400e' : 'white';
    const strokeW = isHighlighted ? '3' : '2.5';

    // Star badge for highlighted
    const starBadge = isHighlighted ? `
      <circle cx="24" cy="5" r="7" fill="#92400e" stroke="white" stroke-width="1.5"/>
      <text x="24" y="9" text-anchor="middle" font-size="9" fill="white">⭐</text>` : '';

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${isHighlighted ? 42 : 34}" height="${isHighlighted ? 52 : 44}" viewBox="0 0 ${isHighlighted ? 56 : 48} ${isHighlighted ? 66 : 56}">
          <!-- Pin shadow -->
          <ellipse cx="${isHighlighted ? 28 : 24}" cy="${isHighlighted ? 63 : 53}" rx="${isHighlighted ? 10 : 8}" ry="3" fill="rgba(0,0,0,0.18)"/>
          <!-- Pin body -->
          <path d="M${isHighlighted ? 28 : 24} ${isHighlighted ? 4 : 2} C${isHighlighted ? 15 : 13} ${isHighlighted ? 4 : 2} ${isHighlighted ? 6 : 4} ${isHighlighted ? 13 : 11} ${isHighlighted ? 6 : 4} ${isHighlighted ? 26 : 22} C${isHighlighted ? 6 : 4} ${isHighlighted ? 40 : 35} ${isHighlighted ? 28 : 24} ${isHighlighted ? 64 : 54} ${isHighlighted ? 28 : 24} ${isHighlighted ? 64 : 54} C${isHighlighted ? 28 : 24} ${isHighlighted ? 64 : 54} ${isHighlighted ? 50 : 44} ${isHighlighted ? 40 : 35} ${isHighlighted ? 50 : 44} ${isHighlighted ? 26 : 22} C${isHighlighted ? 50 : 44} ${isHighlighted ? 13 : 11} ${isHighlighted ? 41 : 35} ${isHighlighted ? 4 : 2} ${isHighlighted ? 28 : 24} ${isHighlighted ? 4 : 2}Z"
                fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>
          <!-- Motorcycle icon (white) -->
          <g transform="translate(${isHighlighted ? 14 : 10}, ${isHighlighted ? 15 : 11}) scale(${isHighlighted ? 1.35 : 1.15})">
            <circle cx="5" cy="14" r="3.5" fill="none" stroke="white" stroke-width="1.8"/>
            <circle cx="19" cy="14" r="3.5" fill="none" stroke="white" stroke-width="1.8"/>
            <path d="M5 14 L9 8 L14 8 L17 11 L19 14" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M9 8 L11 5 L16 5" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="14" cy="9" r="1.5" fill="white"/>
          </g>
          ${starBadge}
        </svg>`;

    const w = isHighlighted ? 42 : 34;
    const h = isHighlighted ? 52 : 44;
    return {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        scaledSize: new google.maps.Size(w, h),
        anchor:     new google.maps.Point(w / 2, h - 2)
    };
}

// ── MarkerPool — بدون Memory Leak ────────────────────────────
const MarkerPool = {
    _pool:       {},   // { captainId: { marker, infoWindow } }
    _captainData: {},  // { captainId: { name, phone, status, lat, lng } }

    upsert(map, captainId, lat, lng, name, status, isHighlighted = false) {
        if (!map || !lat || !lng) return;

        const existing = this._pool[captainId];
        const icon = (typeof WajeezMarkers !== 'undefined') ? WajeezMarkers.captain(status, isHighlighted) : makeCaptainIcon(status, isHighlighted);


        // Store latest data for InfoWindow refresh
        this._captainData[captainId] = { name, status, lat, lng,
            phone: this._captainData[captainId]?.phone || '' };

        if (existing) {
            existing.marker.setPosition({ lat, lng });
            existing.marker.setIcon(icon);
            existing.marker.setTitle(name || captainId);
            if (isHighlighted) {
                existing.marker.setAnimation(google.maps.Animation.BOUNCE);
                setTimeout(() => existing.marker.setAnimation(null), 2200);
            }
        } else {
            const marker = new google.maps.Marker({
                position:  { lat, lng },
                map,
                title:     name || captainId,
                icon,
                animation: google.maps.Animation.DROP,
                zIndex:    isHighlighted ? 999 : undefined
            });

            const infoWindow = new google.maps.InfoWindow();

            marker.addListener('click', () => {
                const d = this._captainData[captainId] || {};
                infoWindow.setContent(buildInfoContent(captainId, d));
                infoWindow.open(map, marker);
            });

            this._pool[captainId] = { marker, infoWindow };
        }
    },

    remove(captainId) {
        const entry = this._pool[captainId];
        if (entry) {
            entry.marker.setMap(null);
            entry.infoWindow.close();
            delete this._pool[captainId];
            delete this._captainData[captainId];
        }
    },

    clearAll() {
        Object.values(this._pool).forEach(({ marker, infoWindow }) => {
            marker.setMap(null);
            infoWindow.close();
        });
        this._pool = {};
        this._captainData = {};
    },

    count() { return Object.keys(this._pool).length; },

    openInfoWindow(captainId) {
        const entry = this._pool[captainId];
        if (!entry || !adminMap) return;
        const d = this._captainData[captainId] || {};
        entry.infoWindow.setContent(buildInfoContent(captainId, d));
        entry.infoWindow.open(adminMap, entry.marker);
    }
};

function buildInfoContent(captainId, d) {
    const statusLabel = {
        available: '🟢 متاح',
        busy:      '🟡 مشغول',
        offline:   '⚫ غير متصل'
    }[d.status] || '🟢 متاح';

    return `
        <div style="font-family:'Cairo',sans-serif;direction:rtl;text-align:right;min-width:160px;padding:4px 0;">
            <div style="font-size:15px;font-weight:800;color:#1a202c;margin-bottom:6px;">
                🏍️ ${d.name || 'كابتن'}
            </div>
            <div style="font-size:13px;color:#555;margin-bottom:4px;">الحالة: ${statusLabel}</div>
            ${d.phone ? `<div style="font-size:12px;color:#888;margin-bottom:4px;"><a href="tel:+${d.phone}" style="color:#2563eb;text-decoration:none;">📞 +${d.phone}</a></div>` : ''}
            <div style="font-size:11px;color:#aaa;margin-top:6px;">
                آخر تحديث: ${new Date().toLocaleTimeString('ar-SA')}
            </div>
        </div>`;
}

// ── State ─────────────────────────────────────────────────────
let adminMap     = null;
let loadedOnInit = {};  // { captainId: data } loaded from REST API
let highlightedCaptainId = null;

// ── Socket.io ─────────────────────────────────────────────────
const socket = io(MAP_API, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000
});

socket.on('connect', () => {
    console.log('✅ Socket connected:', socket.id);
    socket.emit('admin_join');
    updateStatus('متصل', 'green');
});

socket.on('disconnect', () => {
    console.warn('❌ Socket disconnected');
    updateStatus('غير متصل', 'red');
});

socket.on('connect_error', (err) => {
    console.error('Socket error:', err.message);
    updateStatus('خطأ في الاتصال', 'orange');
});

// ── captain_location_update (from index.js line 363) ─────────
socket.on('captain_location_update', (data) => {
    const selectedCity = document.getElementById('liveCitySelector') ? document.getElementById('liveCitySelector').value : 'Khartoum';
    if (data.city && data.city !== selectedCity) return; // ✅ Ignore updates from other cities

    const captainId = data.captainId || data.userId;
    const { lat, lng } = data;

    if (!captainId || !lat || !lng) return;

    const cached = loadedOnInit[captainId] || {};
    const name   = data.name   || cached.name   || 'كابتن';
    const status = data.status || cached.status || 'available';

    loadedOnInit[captainId] = { ...cached, lat, lng, name, status };

    if (adminMap) {
        const isHL = captainId === highlightedCaptainId;
        MarkerPool.upsert(adminMap, captainId, lat, lng, name, status, isHL);
        updateCounters();
    }
});

socket.on('captain_online', (data) => {
    const selectedCity = document.getElementById('liveCitySelector') ? document.getElementById('liveCitySelector').value : 'Khartoum';
    if (data.city && data.city !== selectedCity) return; // ✅ Ignore updates from other cities

    const captainId = data.captainId || data.userId;
    const { lat, lng, name, status } = data;
    if (!captainId || !lat || !lng) return;

    loadedOnInit[captainId] = { lat, lng, name, status };
    if (adminMap) {
        const isHL = captainId === highlightedCaptainId;
        MarkerPool.upsert(adminMap, captainId, lat, lng, name || 'كابتن', status || 'available', isHL);
        updateCounters();
    }
});

socket.on('captain_offline', (data) => {
    const captainId = data.captainId || data.userId;
    if (!captainId) return;
    MarkerPool.remove(captainId);
    delete loadedOnInit[captainId];
    updateCounters();
});

// ── Map Init ──────────────────────────────────────────────────
function initMapLogic() {
    const el = document.getElementById('map');
    if (!el || !window.google?.maps) {
        console.error('Google Maps not loaded');
        return;
    }

    adminMap = new google.maps.Map(el, {
        center:            { lat: 15.6445, lng: 32.4777 },
        zoom:              13,
        mapTypeId:         google.maps.MapTypeId.ROADMAP,
        streetViewControl: false,
        mapTypeControl:    false,
        fullscreenControl: true,
        styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] }
        ]
    });

    console.log('✅ Admin map created');

    // Render any markers that arrived before map was ready
    Object.entries(loadedOnInit).forEach(([id, d]) => {
        if (d.lat && d.lng) {
            MarkerPool.upsert(adminMap, id, d.lat, d.lng, d.name || 'كابتن', d.status || 'available');
        }
    });
    updateCounters();

    // Close dropdown on map click
    adminMap.addListener('click', () => closeDropdown());
}

// Google Maps callback
window._adminMapInit = initMapLogic;
if (window._adminMapReady) initMapLogic();

// ── Load Initial Positions via REST API ───────────────────────
async function loadInitialCaptains() {
    try {
        const city = document.getElementById('liveCitySelector') ? document.getElementById('liveCitySelector').value : 'Khartoum';
        const res = await fetch(`${MAP_API}/api/admin/active-captains?city=${city}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            console.warn('active-captains fetch failed:', res.status);
            return;
        }

        const captains = await res.json();
        console.log(`📡 Loaded ${captains.length} captains from API`);

        let placed = 0;
        captains.forEach(c => {
            const loc = c.location || c.currentLocation;
            if (!loc || !loc.lat || !loc.lng) return;

            const captainId = String(c._id);
            loadedOnInit[captainId] = {
                lat:    loc.lat,
                lng:    loc.lng,
                name:   c.name   || 'كابتن',
                phone:  c.phone  || '',
                status: c.isActive ? 'available' : 'offline'
            };

            if (adminMap) {
                const isHL = captainId === highlightedCaptainId;
                MarkerPool.upsert(
                    adminMap, captainId,
                    loc.lat, loc.lng,
                    c.name || 'كابتن',
                    c.isActive ? 'available' : 'offline',
                    isHL
                );
            }
            placed++;
        });

        console.log(`🗺️ Placed ${placed} captain markers`);
        updateCounters();

        // Render search list immediately
        renderSearchList(captains);
        setTimeout(() => document.getElementById('mapLoader').style.display = 'none', 800);

    } catch (err) {
        console.error('Fetch active-captains error:', err);
    }
}

// ── City Switcher ─────────────────────────────────────────────
window.changeLiveCity = function() {
    const city = document.getElementById('liveCitySelector').value;
    
    // Clear current map
    MarkerPool.clearAll();
    loadedOnInit = {};
    updateCounters();
    document.getElementById('captainSearchResults').innerHTML = '';
    
    // Show loader
    document.getElementById('mapLoader').style.display = 'flex';
    
    // Jump to new city
    const center = city === 'PortSudan' ? { lat: 19.6151, lng: 37.2164 } : { lat: 15.6445, lng: 32.4777 };
    if (adminMap) {
        adminMap.setCenter(center);
        adminMap.setZoom(city === 'PortSudan' ? 13 : 13);
    }
    
    // Fetch captains
    loadInitialCaptains();
};

// ── Counters ──────────────────────────────────────────────────
function updateCounters() {
    const onlineEl  = document.getElementById('onlineCount');
    const totalEl   = document.getElementById('totalCount');
    const offlineEl = document.getElementById('offlineCount');

    const cnt = MarkerPool.count();
    if (onlineEl) onlineEl.textContent = cnt;

    const allKnown = Object.keys(loadedOnInit).length;
    if (offlineEl) offlineEl.textContent = Math.max(0, allKnown - cnt);
    if (totalEl) totalEl.textContent = allKnown;
}

function updateStatus(msg, color) {
    const el = document.getElementById('connectionStatus');
    if (!el) return;
    const colors = { green: '#22c55e', red: '#ef4444', orange: '#f59e0b' };
    el.textContent = msg;
    el.style.color = colors[color] || color;
}

// ════════════════════════════════════════════════════════
// 🔍  SEARCH LOGIC
// ════════════════════════════════════════════════════════

const searchInput   = document.getElementById('captainSearchInput');
const searchDropdown = document.getElementById('searchDropdown');
const searchClearBtn = document.getElementById('searchClearBtn');
const searchIcon     = document.getElementById('searchIcon');

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

function performSearch(query) {
    const q = query.toLowerCase().trim();
    if (!q) { closeDropdown(); return; }

    // Search through all known captains (on-map + offline)
    const results = Object.entries(loadedOnInit)
        .filter(([, d]) => {
            const nameMatch  = (d.name  || '').toLowerCase().includes(q);
            const phoneMatch = (d.phone || '').toLowerCase().includes(q);
            return nameMatch || phoneMatch;
        })
        .map(([id, d]) => ({ id, ...d }))
        .slice(0, 8); // max 8 results

    renderDropdown(results, query);
}

function highlight(text, query) {
    if (!text || !query) return window.escapeHtml(text || '');
    const safeText = window.escapeHtml(text);
    const escapedQuery = window.escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safeText.replace(new RegExp(escapedQuery, 'gi'), m => `<mark>${m}</mark>`);
}

function renderDropdown(results, query) {
    const dropdown = document.getElementById('searchDropdown');

    if (results.length === 0) {
        dropdown.innerHTML = `
            <div class="search-no-result">
                <i class="fas fa-search-minus"></i>
                لا توجد نتائج لـ "<b>${query}</b>"
            </div>`;
        dropdown.classList.add('open');
        return;
    }

    const statusLabel = { available: 'متاح', busy: 'مشغول', offline: 'غير متصل' };

    dropdown.innerHTML = results.map(c => `
        <div class="search-result-item" onclick="selectCaptain('${c.id}', '${(c.name||'').replace(/'/g,"\\'")}')">
            <div class="sri-avatar ${c.status || 'available'}">🏍️</div>
            <div class="sri-info">
                <div class="sri-name">${highlight(c.name || 'كابتن', query)}</div>
                ${c.phone ? `<div class="sri-phone" dir="ltr" style="text-align:right;">${highlight('+' + c.phone, query)}</div>` : ''}
            </div>
            <span class="sri-status-badge ${c.status || 'available'}">${statusLabel[c.status] || 'متاح'}</span>
        </div>
    `).join('');

    dropdown.classList.add('open');
}

function selectCaptain(captainId, captainName) {
    const d = loadedOnInit[captainId];
    closeDropdown();
    searchInput.value = captainName;
    searchClearBtn.classList.add('visible');

    if (!d || !d.lat || !d.lng) {
        // Captain not on map (offline / no GPS) — show toast
        showToast(`⚠️ ${captainName} غير موجود على الخريطة حالياً (لا يوجد موقع)`);
        return;
    }

    highlightCaptain(captainId, d);
}

function highlightCaptain(captainId, d) {
    // Reset previously highlighted
    if (highlightedCaptainId && highlightedCaptainId !== captainId) {
        const prev = loadedOnInit[highlightedCaptainId];
        if (prev) {
            MarkerPool.upsert(adminMap, highlightedCaptainId,
                prev.lat, prev.lng, prev.name, prev.status, false);
        }
    }

    highlightedCaptainId = captainId;

    // Re-draw with highlighted icon
    MarkerPool.upsert(adminMap, captainId, d.lat, d.lng, d.name, d.status, true);

    // Pan + zoom to captain smoothly
    if (adminMap) {
        adminMap.panTo({ lat: d.lat, lng: d.lng });
        if (adminMap.getZoom() < 15) adminMap.setZoom(15);
    }

    // Auto-open info window
    setTimeout(() => MarkerPool.openInfoWindow(captainId), 400);

    showToast(`📍 تم تحديد الكابتن: ${d.name || captainId}`);
}

function clearSearch() {
    searchInput.value = '';
    searchClearBtn.classList.remove('visible');
    closeDropdown();
    searchInput.focus();

    // Reset highlighted marker
    if (highlightedCaptainId) {
        const prev = loadedOnInit[highlightedCaptainId];
        if (prev) {
            MarkerPool.upsert(adminMap, highlightedCaptainId,
                prev.lat, prev.lng, prev.name, prev.status, false);
        }
        highlightedCaptainId = null;
    }
}

function closeDropdown() {
    const dropdown = document.getElementById('searchDropdown');
    if (dropdown) dropdown.classList.remove('open');
}

// ── Toast Notification ────────────────────────────────────────
// Global showToast is handled by app-core.js

// ── Cleanup ────────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
    MarkerPool.clearAll();
    socket.off('captain_location_update');
    socket.off('captain_online');
    socket.off('captain_offline');
    socket.disconnect();
});

// ── Start ──────────────────────────────────────────────────────
loadInitialCaptains();

