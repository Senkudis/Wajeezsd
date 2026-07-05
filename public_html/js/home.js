// public_html/js/home.js


// Check Auth & Personalization
const getToken = () => (window.Auth && window.Auth.getToken ? window.Auth.getToken() : localStorage.getItem('token'));
const userName = localStorage.getItem('userName');
const userId = localStorage.getItem('userId');

if (userName) document.getElementById('greeting').innerText = `مرحباً، ${userName.split(' ')[0]}`;

// 🟢 Fetch Pricing Settings (city-aware)
let pricingConfig = null;
async function fetchPricingConfig() {
    try {
        const city = (typeof CityService !== 'undefined' && CityService.getCity()) || 'Khartoum';
        const res = await fetch(`${API_URL}/api/orders/price-config?city=${encodeURIComponent(city)}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (res.ok) {
            pricingConfig = await res.json();
            console.log('💰 Pricing Loaded for', city, ':', pricingConfig);
        }
    } catch (e) { console.error('Error loading pricing', e); }
}
if (getToken()) fetchPricingConfig();


// =====================================================
// 📍 Auto-Request Location on App Open
// =====================================================
// Shared with order-feature.js via window.userLocation
window.userLocation = null;

function requestUserLocationOnLoad() {
    if (!navigator.geolocation) {
        if (window.requestPushPermissions) window.requestPushPermissions();
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            window.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            console.log('📍 Location obtained on load:', window.userLocation);

            // Pre-fill map center for when user eventually opens the map picker
            window._initialMapLat = pos.coords.latitude;
            window._initialMapLng = pos.coords.longitude;

            // 🚀 Chain the Notification permission request AFTER location completes
            if (window.requestPushPermissions) {
                setTimeout(() => window.requestPushPermissions(), 50);
            }
        },
        (err) => {
            // Denied or unavailable — show a soft toast, don't block the user
            console.warn('📍 Location not granted:', err.message);
            // Show soft nudge only if user is logged in
            if (getToken()) {
                const toastEl = document.createElement('div');
                toastEl.style.cssText = `
                    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
                    background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;
                    border-radius:20px;font-size:13px;z-index:9999;
                    font-family:'Cairo',sans-serif;text-align:center;
                    backdrop-filter:blur(10px);
                `;
                toastEl.innerHTML = 'فعّل خدمة الموقع لتجربة أفضل';
                document.body.appendChild(toastEl);
                setTimeout(() => toastEl.remove(), 4000);
            }

            // 🚀 Chain the Notification permission request even if Location was denied
            if (window.requestPushPermissions) {
                setTimeout(() => window.requestPushPermissions(), 50);
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// 🚦 لا نطلب الموقع تلقائياً هنا — يُستدعى ضمن تسلسل الفتح الأول (بعد اختيار المدينة)
// عبر window.runFirstOpenFlow في index.html لتجنّب تداخل النوافذ.
window.requestUserLocationOnLoad = requestUserLocationOnLoad;
// للجلسات اللاحقة (المدينة محفوظة سلفاً) اطلب الموقع مباشرة بدون انتظار
if (window.CityService && CityService.hasCity()) {
    requestUserLocationOnLoad();
}

// 🗺️ Map State
let map                 = null;
let mapMarker           = null;
let mapAutocomplete     = null;
let directionsService   = null;
let directionsRenderer  = null;
let deliveryZonePolygon = null;   // Geofencing restricted area
let currentSelectionMode = 'pickup';
let mapInitialized = false;
let isOpeningMap   = false;
let _mapIsDark     = false;
let _mapIsSat      = false;

// Called by the Google Maps JS API script once it has loaded
window.__googleMapsReady = function() {
    console.log('✅ Google Maps Web SDK ready.');
    window._googleMapsApiReady = true;
};

// ── Loading overlay ──────────────────────────────────────
function showMapLoading() {
    const el = document.getElementById('map-loading-overlay');
    if (el) el.style.display = 'flex';
}
function hideMapLoading() {
    const el = document.getElementById('map-loading-overlay');
    if (el) el.style.display = 'none';
}


// ══════════════════════════════════════════════════════
// openMapModal
// ══════════════════════════════════════════════════════
window.openMapModal = function(mode) {
    if (isOpeningMap) return;
    isOpeningMap = true;
    currentSelectionMode = mode;

    // 📍 صفّر حالة العنوان لكل فتح جديد
    _centerAddress = '';
    _centerAddrKey = '';
    window._selectedSearchAddr = null;
    const _prev = document.getElementById('map-address-preview');
    if (_prev) _prev.innerHTML = '<span style="opacity:.55;">حرّك الخريطة لتحديد موقعك بدقة…</span>';

    // Update mode label
    const modeLabel = document.getElementById('map-mode-label');
    if (modeLabel) {
        modeLabel.textContent = mode === 'pickup' ? 'حدد موقع الاستلام' : 'حدد وجهتك';
    }

    // Simply show the map container
    document.getElementById('static-map-container').style.display = 'block';
    document.getElementById('main-app-wrapper').style.display     = 'none';

    if (mapInitialized && map) {
        if (window.userLocation) {
            map.panTo(window.userLocation);
        }

        // ── Live route on real streets when selecting dropoff
        _setupLiveRoute(mode);

        isOpeningMap = false;
    } else {
        showMapLoading();
        let _tryInitAttempts = 0;
        const tryInit = () => {
            if (++_tryInitAttempts > 50) {
                console.warn('[Maps] Google Maps API لم يتحمل خلال 5 ثوانٍ');
                isOpeningMap = false;
                return;
            }
            if (window._googleMapsApiReady || typeof google !== 'undefined') {
                initMap();
                isOpeningMap = false;
            } else {
                setTimeout(tryInit, 100);
            }
        };
        tryInit();
    }
};

// ── Helper: generate the real street route based on mode ──────
function _setupLiveRoute(mode) {
    if (!map) return;

    if (mode === 'dropoff') {
        const pLat = parseFloat(document.getElementById('pickup-lat').value);
        const pLng = parseFloat(document.getElementById('pickup-lng').value);

        if (pLat != null && pLng != null && !isNaN(pLat) && !isNaN(pLng)) {
            const pickupPos = { lat: pLat, lng: pLng };
            const centerPos = {
                lat: map.getCenter().lat(),
                lng: map.getCenter().lng(),
            };
            
            // Draw real route instead of straight polyline
            if (window.drawDeliveryRoute) {
                window.drawDeliveryRoute(pickupPos, centerPos);
            }
        }
    } else {
        // Selecting pickup — clear the route
        if (directionsRenderer) directionsRenderer.setDirections({ routes: [] });
    }
}


// ══════════════════════════════════════════════════════
// initMap  —  Google Maps Web SDK
// ══════════════════════════════════════════════════════
function initMap() {
    if (mapInitialized) return;

    try {
        const mapEl = document.getElementById('map');
        if (!mapEl) throw new Error('Map div not found');

        const currentCity = typeof CityService !== 'undefined' ? CityService.getCity() : 'Khartoum';
        const defaultLat = currentCity === 'PortSudan' ? 19.6151 : 15.6445;
        const defaultLng = currentCity === 'PortSudan' ? 37.2164 : 32.4777;

        const lat = window.userLocation?.lat ?? defaultLat;
        const lng = window.userLocation?.lng ?? defaultLng;
        const center = { lat, lng };

        // Create the standard Web SDK map
        map = new google.maps.Map(mapEl, {
            center,
            zoom: 15,
            renderingType: "RASTER",
            styles: [], // Always keep map in Light Mode as requested
            disableDefaultUI: false,
            gestureHandling: 'greedy',
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
        });

        // ✅ Expose map instance for search bar
        window._activeMapInstance = map;

        // ─────────────────────────────────────────────────────
        // Directions API — Initialise service + renderer
        // ─────────────────────────────────────────────────────
        directionsService = new google.maps.DirectionsService();
        directionsRenderer = new google.maps.DirectionsRenderer({
            suppressMarkers: true,   // We keep our own decorative pin
            preserveViewport: true,  // FIX: Prevents map from bouncing back when moving dropoff pin
            polylineOptions: {
                strokeColor:   '#04553A',  // App brand green
                strokeWeight:  5,
                strokeOpacity: 0.82,
            },
        });
        directionsRenderer.setMap(map);

        // Keep the address preview updated as the user drags the map
        map.addListener('center_changed', () => {
            // Wait for map 'idle' to draw the actual street route to save API limits
        });
        
        map.addListener('idle', () => {
            // 📍 حدّث معاينة العنوان النصي (reverse geocode) عند توقّف الحركة
            _updateCenterAddress();
            // Update live route dynamically when map stops moving
            if (currentSelectionMode === 'dropoff') {
                _setupLiveRoute('dropoff');
            }
        });

        // ─────────────────────────────────────────────────────
        // ❗ Feature: Delivery Zone Geofencing (Dynamic from API)
        // ─────────────────────────────────────────────────────
        const DEFAULT_ZONE_COORDS = [
            { lat: 15.750, lng: 32.400 },
            { lat: 15.750, lng: 32.650 },
            { lat: 15.450, lng: 32.650 },
            { lat: 15.450, lng: 32.400 },
        ];

        async function initDeliveryZone() {
            const currentCity = typeof CityService !== 'undefined' ? CityService.getCity() : 'Khartoum';
            let zoneCoords = null;
            try {
                const res = await fetch(`${API_URL}/api/admin/delivery-zone?city=${currentCity}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.deliveryZone && data.deliveryZone.length >= 3) {
                        zoneCoords = data.deliveryZone;
                        console.log('✅ Delivery zone loaded from API:', zoneCoords.length, 'points');
                    }
                }
            } catch (e) {
                console.warn('⚠️ Delivery zone API fetch failed:', e.message);
            }

            // 🌍 احتياطي: نطاق الخرطوم الافتراضي للخرطوم فقط. المدن الأخرى (بورتسودان)
            // بلا نطاق مُعرّف → لا نرسم مضلّعاً ولا نمنع أي موقع (تفادي رفض العميل خطأً).
            if (!zoneCoords && currentCity === 'Khartoum') {
                zoneCoords = DEFAULT_ZONE_COORDS;
            }

            if (zoneCoords) {
                deliveryZonePolygon = new google.maps.Polygon({
                    paths: zoneCoords,
                    strokeColor: '#04553A',
                    strokeOpacity: 0.15,
                    strokeWeight: 2,
                    fillColor: '#04553A',
                    fillOpacity: 0.04,
                    map: map,
                    clickable: false
                });
            } else {
                deliveryZonePolygon = null; // لا تقييد جغرافي لهذه المدينة
            }

            const MIN_ZOOM_LEVEL = 14;
        
            window.checkDeliveryZone = function() {
                if (!google.maps.geometry || !google.maps.geometry.poly || !deliveryZonePolygon) return;
                const center = map.getCenter();
                const currentZoom = map.getZoom();
                const isInside = google.maps.geometry.poly.containsLocation(center, deliveryZonePolygon);
                
                const banner = document.getElementById('geofence-warning-banner');
                const confirmBtn = document.getElementById('map-confirm-btn');
                
                let bannerText = "";
                let shouldBlock = false;

                if (!isInside) {
                    shouldBlock = true;
                    bannerText = "عفواً، الموقع خارج منطقة التوصيل حالياً.";
                } else if (currentZoom < MIN_ZOOM_LEVEL) {
                    shouldBlock = true;
                    bannerText = "الرجاء تقريب الخريطة أكثر (Zoom in) لتحديد موقعك بدقة.";
                }

                if (shouldBlock) {
                    if (banner) {
                        banner.style.display = 'flex';
                        const spanEl = banner.querySelector('span');
                        if(spanEl) spanEl.textContent = bannerText;
                    }
                    if (confirmBtn) {
                        confirmBtn.disabled = true;
                        confirmBtn.classList.add('disabled');
                    }
                } else {
                    if (banner) banner.style.display = 'none';
                    if (confirmBtn) {
                        confirmBtn.disabled = false;
                        confirmBtn.classList.remove('disabled');
                    }
                }
            };

            map.addListener('dragend', window.checkDeliveryZone);
            map.addListener('zoom_changed', window.checkDeliveryZone);
            
            // Initial check on load
            setTimeout(window.checkDeliveryZone, 500);

            // Listen for real-time zone updates from admin
            if (window.socket) {
                window.socket.on('delivery_zone_updated', (data) => {
                    if (data.deliveryZone && deliveryZonePolygon) {
                        deliveryZonePolygon.setPaths(data.deliveryZone);
                        console.log('🔄 Delivery zone updated in real-time');
                        setTimeout(window.checkDeliveryZone, 100);
                    }
                });
            }
        }

        initDeliveryZone();

        // ─────────────────────────────────────────────────────
        // 🏍️ Live Tracking: Active Captains Pool
        // ─────────────────────────────────────────────────────
        const SVG_BIKE_ICON = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="60" height="60">
                <defs>
                    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
                        <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#000" flood-opacity="0.25"/>
                    </filter>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
                    </filter>
                </defs>
                <circle cx="50" cy="50" r="44" fill="#ffffff" filter="url(#shadow)"/>
                <circle cx="50" cy="50" r="40" fill="none" stroke="#10b981" stroke-width="4"/>
                <circle cx="50" cy="50" r="40" fill="#f0fdf4" opacity="0.5"/>
                <!-- Fork / Frame -->
                <path d="M 34 62 L 45 54 L 62 54 L 70 62" fill="none" stroke="#4b5563" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M 62 54 L 56 42" stroke="#4b5563" stroke-width="4" stroke-linecap="round"/>
                <!-- Delivery Box -->
                <rect x="25" y="32" width="20" height="22" rx="3" fill="#fbbf24" stroke="#d97706" stroke-width="1.5" />
                <path d="M 25 38 L 45 38" stroke="#d97706" stroke-width="1.5"/>
                <path d="M 35 32 L 35 44" stroke="#d97706" stroke-width="1.5"/>
                <!-- Rider Torso & Helmet -->
                <path d="M 42 54 L 46 38 L 56 38 L 54 54 Z" fill="#1f2937" />
                <circle cx="54" cy="32" r="7" fill="#111827" />
                <path d="M 54 28 Q 62 28 60 34 L 54 34 Z" fill="#60a5fa" />
                <!-- Wheels -->
                <circle cx="34" cy="62" r="12" fill="none" stroke="#1f2937" stroke-width="6"/>
                <circle cx="34" cy="62" r="5" fill="#d1d5db"/>
                <circle cx="70" cy="62" r="12" fill="none" stroke="#1f2937" stroke-width="6"/>
                <circle cx="70" cy="62" r="5" fill="#d1d5db"/>
                <!-- Headlight & Motion Lines -->
                <circle cx="76" cy="52" r="4" fill="#fde047" filter="url(#glow)"/>
                <path d="M 16 45 L 8 45" stroke="#10b981" stroke-width="3" stroke-linecap="round"/>
                <path d="M 12 55 L 4 55" stroke="#10b981" stroke-width="3" stroke-linecap="round"/>
                <path d="M 18 68 L 10 68" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
            </svg>`);

        window.ActiveCaptainsPool = {
            markers: {},
            
            updateLocation(captainId, lat, lng) {
                if (!map) return;
                const pos = new google.maps.LatLng(lat, lng);
                
                if (this.markers[captainId]) {
                    this.markers[captainId].setPosition(pos); // Smooth updates
                } else {
                    this.markers[captainId] = new google.maps.Marker({
                        position: pos,
                        map: map,
                        icon: (typeof WajeezMarkers !== 'undefined') ? WajeezMarkers.captain('available') : { url: SVG_BIKE_ICON, scaledSize: new google.maps.Size(54, 54), anchor: new google.maps.Point(27, 27) },
                        title: 'كابتن متاح',
                        clickable: false,
                        zIndex: 99
                    });
                }
            },
            
            removeCaptain(captainId) {
                if (this.markers[captainId]) {
                    this.markers[captainId].setMap(null);
                    delete this.markers[captainId];
                }
            }
        };

        // Initialize Public Captain Tracking
        const initCustomerTrackingSocket = () => {
            const serverUrl = window.API_BASE_URL || (typeof API_URL !== 'undefined' ? API_URL : 'https://wajeezsd.com');
            let customerSocket = window.socket;
            
            // Connect socket if not already connected via Notifications
            if (!customerSocket || !customerSocket.connected) {
                if (typeof io !== 'undefined') {
                    customerSocket = io(serverUrl, { transports: ['websocket', 'polling'] });
                    window.socket = customerSocket; 
                }
            }

            if (customerSocket) {
                // Emit customer specific room to prevent admin floods
                customerSocket.emit('customer_join');
                console.log('🔗 Joined customer tracking socket room');
                
                customerSocket.on('nearby_captains_update', (data) => {
                    const { captainId, lat, lng, status } = data;
                    if ((status === 'working' || !status) && lat && lng) {
                        window.ActiveCaptainsPool.updateLocation(captainId, lat, lng);
                    }
                });

                customerSocket.on('captain_offline', (data) => {
                    if (data && data.captainId) window.ActiveCaptainsPool.removeCaptain(data.captainId);
                });
                
                customerSocket.on('captain_busy', (data) => {
                    if (data && data.captainId) window.ActiveCaptainsPool.removeCaptain(data.captainId);
                });
            }
        };

        initCustomerTrackingSocket();

        mapInitialized = true;
        hideMapLoading();
        console.log('✅ Google Maps Web SDK initialised.');

    } catch (err) {
        console.error('initMap error:', err);
        hideMapLoading();
        map = null;
        mapInitialized = false;
    }
}

// ─────────────────────────────────────────────────────
// clearMapSearch  —  clears the search input
// ─────────────────────────────────────────────────────
window.clearMapSearch = function() {
    const input = document.getElementById('map-search-input');
    const clearBtn = document.getElementById('map-search-clear');
    if (input) input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (input) input.focus();
};

// ══════════════════════════════════════════════════════
// closeMapUI
// ══════════════════════════════════════════════════════
window.closeMapUI = function() {
    document.getElementById('static-map-container').style.display = 'none';
    document.getElementById('main-app-wrapper').style.display     = 'block';
    isOpeningMap = false;

    // Hide the live route when closing the map
    if (directionsRenderer) directionsRenderer.setDirections({ routes: [] });

    // BUG-C: إيقاف مؤقت النبضة عند إغلاق الخريطة
    if (window._userLocPulseTimer) {
        clearInterval(window._userLocPulseTimer);
        window._userLocPulseTimer = null;
    }
};

// ══════════════════════════════════════════════════════
// 📍 Smart Address Resolution — وصف دقيق للموقع (يعتمد عليه الكابتن)
// ══════════════════════════════════════════════════════
let _centerAddress = '';      // آخر عنوان نصي تم حلّه لمركز الخريطة
let _centerAddrKey = '';      // مفتاح "lat,lng" لتفادي طلبات geocode المكرّرة
// window._selectedSearchAddr = { text, lat, lng } — يُضبط عند اختيار نتيجة بحث

function _metersBetween(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// reverse geocode: Google أولاً (أدق في السودان)، ثم Nominatim، ثم الإحداثيات
function _resolveAddress(lat, lng) {
    return new Promise((resolve) => {
        try {
            if (typeof google !== 'undefined' && google.maps && google.maps.Geocoder) {
                new google.maps.Geocoder().geocode(
                    { location: { lat, lng }, language: 'ar', region: 'SD' },
                    (results, status) => {
                        if (status === 'OK' && results && results[0]) {
                            let addr = (results[0].formatted_address || '').replace(/،?\s*السودان\s*$/, '').trim();
                            resolve(addr || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                        } else {
                            _resolveAddressNominatim(lat, lng).then(resolve);
                        }
                    }
                );
                return;
            }
        } catch (_) { /* fall through */ }
        _resolveAddressNominatim(lat, lng).then(resolve);
    });
}

function _resolveAddressNominatim(lat, lng) {
    return fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ar&lat=${lat}&lon=${lng}`)
        .then(r => r.json())
        .then(d => {
            const a = d?.address || {};
            const parts = [a.road, a.neighbourhood || a.suburb, a.city || a.town || a.village].filter(Boolean);
            return parts.join('، ') || (d?.display_name?.split(',').slice(0, 2).join('،')) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        })
        .catch(() => `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
}

// تحديث معاينة العنوان أسفل الخريطة (حيّاً عند توقّف الحركة)
function _updateCenterAddress() {
    if (!map) return;
    const c = map.getCenter();
    const lat = c.lat(), lng = c.lng();
    const previewEl = document.getElementById('map-address-preview');

    // إن اختار المستخدم نتيجة بحث ولا يزال قريباً منها → احتفظ باسم المكان الدقيق
    if (window._selectedSearchAddr) {
        const d = _metersBetween(lat, lng, window._selectedSearchAddr.lat, window._selectedSearchAddr.lng);
        if (d < 45) {
            _centerAddress = window._selectedSearchAddr.text;
            _centerAddrKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
            if (previewEl) previewEl.innerHTML = `<i class="bi bi-geo-alt-fill" style="color:#04553A;"></i> ${_centerAddress}`;
            return;
        }
        window._selectedSearchAddr = null; // ابتعد عن النتيجة → تجاهلها
    }

    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (key === _centerAddrKey) return;
    _centerAddrKey = key;
    if (previewEl) previewEl.innerHTML = `<span style="opacity:.55;">جارٍ تحديد العنوان…</span>`;
    _resolveAddress(lat, lng).then(addr => {
        const c2 = map.getCenter();
        if (`${c2.lat().toFixed(4)},${c2.lng().toFixed(4)}` !== key) return; // تحرّك أثناء الحل
        _centerAddress = addr;
        if (previewEl) previewEl.innerHTML = `<i class="bi bi-geo-alt-fill" style="color:#04553A;"></i> ${addr}`;
    });
}
window._updateCenterAddress = _updateCenterAddress;

// ══════════════════════════════════════════════════════
// confirmLocationSelection
// ══════════════════════════════════════════════════════
window.confirmLocationSelection = function() {
    // Prevent guest users from confirming BOTH points to save Directions API billing
    const otherMode = currentSelectionMode === 'pickup' ? 'dropoff' : 'pickup';
    const otherLat = document.getElementById(`${otherMode}-lat`).value;
    
    if (otherLat && !getToken()) {
        Swal.fire({
            target: document.getElementById('static-map-container'),
            icon: 'info',
            title: 'يرجى تسجيل الدخول',
            text: 'يجب تسجيل الدخول أولاً لحساب المسار وتأكيد الطلب وتجنب الحسابات الوهمية.',
            confirmButtonText: 'تسجيل الدخول',
            confirmButtonColor: '#04553A',
            showCancelButton: true,
            cancelButtonText: 'إلغاء'
        }).then((res) => {
            if (res.isConfirmed) window.location.href = 'client-login.html';
        });
        return; // Block confirmation
    }

    const currentCity = typeof CityService !== 'undefined' ? CityService.getCity() : 'Khartoum';
    let center = currentCity === 'PortSudan' ? { lat: 19.6151, lng: 37.2164 } : { lat: 15.6445, lng: 32.4777 };

    if (map && mapInitialized) {
        const c = map.getCenter();
        center = { lat: c.lat(), lng: c.lng() };
    } else if (window.userLocation) {
        center = { ...window.userLocation };
    }

    const mode = currentSelectionMode;
    document.getElementById(`${mode}-lat`).value  = center.lat;
    document.getElementById(`${mode}-lng`).value  = center.lng;

    // 📍 وصف دقيق للكابتن: العنوان المحلول (بحث/geocode)
    const addrEl = document.getElementById(`${mode}-addr`);

    // رتّب مصادر الوصف: (1) نتيجة بحث قريبة، (2) عنوان مركز محلول، (3) حلّ آني
    let resolvedAddr = '';
    if (window._selectedSearchAddr &&
        _metersBetween(center.lat, center.lng, window._selectedSearchAddr.lat, window._selectedSearchAddr.lng) < 45) {
        resolvedAddr = window._selectedSearchAddr.text;
    } else if (_centerAddress && _centerAddrKey === `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`) {
        resolvedAddr = _centerAddress;
    }

    if (resolvedAddr) {
        addrEl.value = resolvedAddr;
    } else {
        // لم يكتمل الحل بعد → اعرض مؤقتاً ثم استبدله بالعنوان الحقيقي
        addrEl.value = `موقع محدد (${center.lat.toFixed(4)}, ${center.lng.toFixed(4)})`;
        _resolveAddress(center.lat, center.lng).then(a => { addrEl.value = a; });
    }

    window._selectedSearchAddr = null;

    calculatePrice();
    window.closeMapUI();

    // If BOTH pickup and dropoff are now set, draw the delivery route
    const pLat = parseFloat(document.getElementById('pickup-lat').value);
    const pLng = parseFloat(document.getElementById('pickup-lng').value);
    const dLat = parseFloat(document.getElementById('dropoff-lat').value);
    const dLng = parseFloat(document.getElementById('dropoff-lng').value);

    if (pLat != null && pLng != null && !isNaN(pLat) && !isNaN(pLng) && dLat != null && dLng != null && !isNaN(dLat) && !isNaN(dLng)) {
        drawDeliveryRoute({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng });
    }
};

// ══════════════════════════════════════════════════════
// chooseMapCity  —  Switch between cities
// ══════════════════════════════════════════════════════
window.chooseMapCity = async function() {
    const { value: city } = await Swal.fire({
        title: 'اختر المدينة',
        input: 'select',
        inputOptions: {
            'Khartoum': 'الخرطوم - أم درمان',
            'PortSudan': 'البحر الأحمر - بورتسودان'
        },
        inputPlaceholder: 'اختر مدينة',
        showCancelButton: true,
        confirmButtonText: 'انتقال',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#04553A'
    });

    if (city && map) {
        if (city === 'Khartoum') {
            map.panTo({ lat: 15.6445, lng: 32.4777 });
            map.setZoom(12);
            Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'الخرطوم - أم درمان', showConfirmButton: false, timer: 2000 });
        } else if (city === 'PortSudan') {
            map.panTo({ lat: 19.6175, lng: 37.2164 });
            map.setZoom(13);
            Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'البحر الأحمر - بورتسودان', showConfirmButton: false, timer: 2000 });
        }
    }
};

// ══════════════════════════════════════════════════════
// locateMe  —  Enhanced with loading spinner
// ══════════════════════════════════════════════════════
// 📍💚 نقطة "موقعك الحالي" بلمسة وجيز (مثل النقطة الزرقاء في خرائط جوجل، لكن خضراء + نبضة)
let _userLocMarker = null, _userLocCircle = null, _userLocPulse = null, _userLocPulseTimer = null;
function _showUserLocationDot(lat, lng, accuracy) {
    if (!map || typeof google === 'undefined' || !google.maps) return;
    const pos = { lat, lng };

    // 1) دائرة الدقّة (نطاق GPS التقريبي)
    if (!_userLocCircle) {
        _userLocCircle = new google.maps.Circle({
            map, center: pos, radius: Math.max(15, accuracy || 30),
            strokeColor: '#04553A', strokeOpacity: 0.30, strokeWeight: 1,
            fillColor: '#04553A', fillOpacity: 0.08, clickable: false, zIndex: 1
        });
    } else { _userLocCircle.setCenter(pos); _userLocCircle.setRadius(Math.max(15, accuracy || 30)); }

    // 2) النقطة الصلبة: خضراء بحلقة بيضاء وظل (هوية وجيز)
    const dotIcon = {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">' +
            '<circle cx="14" cy="14" r="9" fill="#fff" opacity="0.95"/>' +
            '<circle cx="14" cy="14" r="6.5" fill="#04553A"/>' +
            '<circle cx="14" cy="14" r="6.5" fill="none" stroke="#25d366" stroke-width="1.5"/></svg>'),
        scaledSize: new google.maps.Size(28, 28),
        anchor: new google.maps.Point(14, 14)
    };
    if (!_userLocMarker) {
        _userLocMarker = new google.maps.Marker({ map, position: pos, icon: (typeof WajeezMarkers !== 'undefined') ? WajeezMarkers.userDot() : dotIcon, zIndex: 3, clickable: false, title: 'موقعك الحالي' });
    } else { _userLocMarker.setPosition(pos); _userLocMarker.setIcon(dotIcon); }

    // 3) 💚 لمسة وجيز: حلقة نابضة تتمدّد وتتلاشى باستمرار
    if (!_userLocPulse) {
        _userLocPulse = new google.maps.Circle({
            map, center: pos, radius: 8, strokeColor: '#25d366', strokeOpacity: 0.7,
            strokeWeight: 2, fillColor: '#25d366', fillOpacity: 0.15, clickable: false, zIndex: 2
        });
    } else { _userLocPulse.setCenter(pos); }
    if (_userLocPulseTimer) clearInterval(_userLocPulseTimer);
    let r = 8;
    _userLocPulseTimer = setInterval(() => {
        r += 2;
        if (r > 46) r = 8;
        const t = (r - 8) / 38; // 0→1
        _userLocPulse.setRadius(r);
        _userLocPulse.setOptions({ strokeOpacity: 0.7 * (1 - t), fillOpacity: 0.15 * (1 - t) });
    }, 80);
}
window._showUserLocationDot = _showUserLocationDot;

window.locateMe = function() {
    if (!navigator.geolocation) return;

    const btn  = document.getElementById('locate-me-btn');
    const icon = document.getElementById('locate-me-icon');

    // Show spinner
    if (btn)  btn.classList.add('is-locating');
    if (icon) { icon.className = ''; icon.innerHTML = '<span style="width:20px;height:20px;border:2px solid #c8e6c9;border-top-color:#04553A;border-radius:50%;display:inline-block;animation:mapSpin 0.7s linear infinite;"></span>'; }

    navigator.geolocation.getCurrentPosition(
        pos => {
            window.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            if (map && mapInitialized) {
                map.panTo(window.userLocation);
                // 📍 أظهر نقطة موقع العميل الحالي (ليتأكّد من مكانه)
                _showUserLocationDot(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
            }
            // Restore icon
            if (btn)  btn.classList.remove('is-locating');
            if (icon) { icon.innerHTML = ''; icon.className = 'bi bi-crosshair2'; }
        },
        () => {
            // Restore icon
            if (btn)  btn.classList.remove('is-locating');
            if (icon) { icon.innerHTML = ''; icon.className = 'bi bi-crosshair2'; }
            Swal.fire('تنبيه', 'يرجى تفعيل خدمة الموقع (GPS)', 'info');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
};

// ══════════════════════════════════════════════════════
// toggleMapTheme  —  Feature 2: Day / Night mode
// ══════════════════════════════════════════════════════
const _darkMapStyles = [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
    { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
    { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
    { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] }
];

window.toggleMapTheme = function() {
    if (!map) return;
    _mapIsDark = !_mapIsDark;

    // Apply styles to the Map
    map.setOptions({ styles: _mapIsDark ? _darkMapStyles : [] });

    // Update button & container class
    const btn  = document.getElementById('map-theme-btn');
    const icon = document.getElementById('map-theme-icon');
    const container = document.getElementById('static-map-container');

    if (btn) btn.classList.toggle('is-active', _mapIsDark);
    if (container) container.classList.toggle('map-night', _mapIsDark);
    if (icon) {
        icon.className = _mapIsDark ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
    }
};

// ══════════════════════════════════════════════════════
// toggleMapLayer  —  Feature 3: Satellite / Roadmap
// ══════════════════════════════════════════════════════
window.toggleMapLayer = function() {
    if (!map) return;
    _mapIsSat = !_mapIsSat;

    map.setMapTypeId(_mapIsSat
        ? google.maps.MapTypeId.HYBRID    // Satellite + labels
        : google.maps.MapTypeId.ROADMAP
    );

    const btn  = document.getElementById('map-layer-btn');
    const icon = document.getElementById('map-layer-icon');

    if (btn) btn.classList.toggle('is-active', _mapIsSat);
    if (icon) {
        icon.className = _mapIsSat ? 'bi bi-map-fill' : 'bi bi-layers-fill';
    }
};

// ══════════════════════════════════════════════════════
// 🚚 drawDeliveryRoute(origin, destination)
// Calls the Directions API and draws the route polyline on the map.
// Does NOT touch pricing — the existing calculatePrice() handles that.
// ══════════════════════════════════════════════════════
window.drawDeliveryRoute = function(origin, destination) {
    if (!directionsService || !directionsRenderer) return;

    directionsService.route(
        {
            origin,
            destination,
            travelMode: google.maps.TravelMode.DRIVING,
        },
        (response, status) => {
            if (status === google.maps.DirectionsStatus.OK) {
                directionsRenderer.setDirections(response);
            } else {
                console.warn('⚠️ Directions route failed:', status);
            }
        }
    );
};

// ══════════════════════════════════════════════════════
// clearRoute  —  removes the polyline from the map
// ══════════════════════════════════════════════════════
window.clearRoute = function() {
    if (directionsRenderer) directionsRenderer.setDirections({ routes: [] });
};



// 🟢 Utils: Smart Pricing
let isPriceManuallyEdited = false;

const priceEl = document.getElementById('price');
if (priceEl) priceEl.addEventListener('input', () => {
    const priceEl = document.getElementById('price');
    // هل حُدّدت نقطتا الاستلام والتسليم فعلاً؟
    const pointsSet = document.getElementById('pickup-lat').value &&
                      document.getElementById('pickup-lng').value &&
                      document.getElementById('dropoff-lat').value &&
                      document.getElementById('dropoff-lng').value;
    const val = priceEl.value.trim();

    if (val === '') {
        // 🐛 إصلاح: الحقل فُرّغ (يدوياً أو بفعل لصق رقم هاتف/إكمال تلقائي يمسح حقل الرقم).
        // إن لم يكن السعر مُعدّلاً يدوياً والنقطتان محدّدتان → أعد الحساب التلقائي فوراً
        // حتى لا "يختفي" السعر المقترح.
        if (!isPriceManuallyEdited && pointsSet) calculatePrice();
    } else if (pointsSet) {
        // 🐛 إصلاح: لا نثبّت السعر كـ"يدوي" إلا بعد تحديد النقطتين.
        // الكتابة قبل تحديد النقطتين يجب ألا توقف التسعير التلقائي.
        isPriceManuallyEdited = true;
    }
    priceEl.classList.remove('border-warning', 'border-2');
}); // end priceEl listener

// 💰 أزرار رفع/تنزيل السعر بمقدار 100 ج.س
const PRICE_STEP = 100;
function stepPrice(direction) {
    const priceInput = document.getElementById('price');
    const current = parseInt(priceInput.value, 10) || 0;
    // ثبّت القيمة على أقرب مضاعف لـ 100 ثم زِد/أنقص خطوة كاملة
    const snapped = Math.round(current / PRICE_STEP) * PRICE_STEP;
    let next = snapped + (direction * PRICE_STEP);
    if (next < 0) next = 0; // لا سعر سالب

    priceInput.value = next;
    isPriceManuallyEdited = true; // الأزرار تُعتبر تعديلاً يدوياً (لا يُعاد حسابه تلقائياً)
    priceInput.classList.remove('border-warning', 'border-2');

    // وميض بصري + تعطيل زر النقص عند الصفر
    priceInput.classList.remove('bumped');
    void priceInput.offsetWidth; // إعادة تشغيل الأنيميشن
    priceInput.classList.add('bumped');
    document.getElementById('price-minus').disabled = (next <= 0);
}

const _priceMinus = document.getElementById('price-minus');
const _pricePlus = document.getElementById('price-plus');
if (_priceMinus) _priceMinus.addEventListener('click', () => stepPrice(-1));
if (_pricePlus) _pricePlus.addEventListener('click', () => stepPrice(1));

// Haversine Formula with Tortuosity Factor
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightDistance = R * c;

    // 🐢 Tortuosity Factor: 1.4 (Roads are not straight lines)
    return straightDistance * 1.4;
}

function calculatePrice() {
    // 1. Get Coordinates
    const pLat = parseFloat(document.getElementById('pickup-lat').value);
    const pLng = parseFloat(document.getElementById('pickup-lng').value);
    const dLat = parseFloat(document.getElementById('dropoff-lat').value);
    const dLng = parseFloat(document.getElementById('dropoff-lng').value);

    // 2. Validate
    if (pLat == null || pLng == null || isNaN(pLat) || isNaN(pLng) || dLat == null || dLng == null || isNaN(dLat) || isNaN(dLng)) return;

    // 3. Prevent overwriting if user manually edited
    if (isPriceManuallyEdited) return;

    // 4. Calculate Distance
    const distanceKm = calculateDistance(pLat, pLng, dLat, dLng);

    // 5. Calculate Price
    // Default fallback if config not loaded yet
    const baseFare = (pricingConfig && pricingConfig.baseFare) || 1000;
    const perKm = (pricingConfig && pricingConfig.costPerKm) || 200;

    let finalPrice = baseFare + (distanceKm * perKm);

    // Round to nearest 100 for clean numbers
    finalPrice = Math.ceil(finalPrice / 100) * 100;

    // 6. Update UI
    const priceInput = document.getElementById('price');
    priceInput.value = finalPrice;

    // Visual Cue (Yellow Border)
    priceInput.classList.add('border-warning', 'border-2');
}

function previewImage(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    // 1. Show preview instantly from local file (no waiting for upload)
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('img-preview');
        preview.classList.remove('d-none');
        preview.querySelector('img').src = e.target.result;
    };
    reader.readAsDataURL(file);

    // 2. Upload to server in background
    uploadParcelImage(file);
}

// Stores the server URL after upload
let _parcelImageUrl = null;

async function uploadParcelImage(file) {
    const token = localStorage.getItem('token');
    if (!token) return; // Not logged in — will submit without image

    const label = document.querySelector('label[for="parcel-image"]');
    const originalLabelHTML = label ? label.innerHTML : '';
    if (label) label.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> جاري رفع الصورة...';

    _parcelImageUrl = null; // Reset while uploading

    try {
        const formData = new FormData();
        formData.append('parcelImage', file);

        const res = await fetch(`${window.API_URL || 'https://wajeezsd.com'}/api/upload/parcel-image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const data = await res.json();
        if (res.ok && data.url) {
            _parcelImageUrl = data.url;
            if (label) label.innerHTML = '<i class="bi bi-check-circle-fill text-success me-1"></i> تم رفع الصورة ✅';
        } else {
            if (label) label.innerHTML = '<i class="bi bi-exclamation-triangle-fill text-warning me-1"></i> فشل الرفع — أعد المحاولة';
            _parcelImageUrl = null;
        }
    } catch (err) {
        console.error('Parcel image upload error:', err);
        if (label) label.innerHTML = '<i class="bi bi-wifi-off text-danger me-1"></i> خطأ في الشبكة';
        _parcelImageUrl = null;
    }
}

window.clearImage = function() {
    document.getElementById('parcel-image').value = '';
    document.getElementById('img-preview').classList.add('d-none');
    _parcelImageUrl = null;
    const label = document.querySelector('label[for="parcel-image"]');
    if (label) label.innerHTML = '<i class="bi bi-camera-fill"></i><span>📷 صورة للطرد (اختياري)</span>';
};

// 🚀 Validation & Submission
function validateOrder() {
    const pLat = document.getElementById('pickup-lat').value;
    const dLat = document.getElementById('dropoff-lat').value;
    const pPhone = document.getElementById('pickup-phone').value;
    const dPhone = document.getElementById('dropoff-phone').value;
    const price = document.getElementById('price').value;

    const warn = (msg) => {
        Swal.fire({ icon: 'warning', text: msg, confirmButtonText: 'حسناً', confirmButtonColor: '#04553A' });
        return false;
    };

    if (!pLat) return warn('يرجى تحديد موقع الاستلام من الخريطة');
    if (!dLat) return warn('يرجى تحديد وجهة التسليم من الخريطة');
    if (!pPhone || pPhone.length < 10) return warn('رقم هاتف المرسل غير صحيح');
    if (!dPhone || dPhone.length < 10) return warn('رقم هاتف المستلم غير صحيح');
    if (!price || price <= 0) return warn('يرجى تحديد سعر العرض');

    // التفاصيل إجبارية — لازم العميل يوضح للكابتن
    const details = (document.getElementById('details')?.value || '').trim();
    if (!details) return warn('يرجى كتابة تفاصيل الطلب عشان الكابتن يفهم المطلوب');

    return true;
}

window.createOrder = async function() {
    // Guard
    if (!localStorage.getItem('token')) {
        const res = await Swal.fire({
            title: 'تسجيل الدخول مطلوب',
            text: 'عشان تقدر تطلب كابتن، لازم تسجل دخولك أولاً.',
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'تسجيل الدخول',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#04553A'
        });
        if (res.isConfirmed) window.location.href = 'client-login.html';
        return;
    }

    if (!validateOrder()) return;

    const btn = document.getElementById('submit-btn');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جاري الإرسال...';

    try {
        let base64Image = null;
        const fileInput = document.getElementById('parcel-image');
        if (fileInput.files.length > 0 && !_parcelImageUrl) {
            // Image selected but not yet uploaded — warn user
            Swal.fire({ icon: 'info', text: 'انتظر لحظة، لا تزال الصورة ترتفع للسيرفر...', timer: 2000, showConfirmButton: false });
            btn.disabled = false; btn.innerHTML = originalHTML;
            return;
        }
        const parcelImageToSend = _parcelImageUrl || null;

        const data = {
            pickup: {
                address: document.getElementById('pickup-addr').value,
                contactName: document.getElementById('pickup-name').value,
                contactPhone: document.getElementById('pickup-phone').value,
                lat: parseFloat(document.getElementById('pickup-lat').value),
                lng: parseFloat(document.getElementById('pickup-lng').value)
            },
            dropoff: {
                address: document.getElementById('dropoff-addr').value,
                receiverName: document.getElementById('dropoff-name').value,
                receiverPhone: document.getElementById('dropoff-phone').value,
                lat: parseFloat(document.getElementById('dropoff-lat').value),
                lng: parseFloat(document.getElementById('dropoff-lng').value)
            },
            details: document.getElementById('details').value,
            distanceType: 'custom', // السعر دائماً يُحسب من المسافة الحقيقية
            price: parseFloat(document.getElementById('price').value),
            parcelImage: parcelImageToSend,
            scheduledAt: document.getElementById('scheduled-at')?.value || null // ⏰ Scheduling
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

        const res = await fetch(`${API_URL}/api/orders`, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        clearTimeout(timeoutId);

        if (res.ok) {
            const result = await res.json();
            Swal.fire({ icon: 'success', title: 'تم! 🎉', text: result.message, timer: 3500, showConfirmButton: false });
            setTimeout(() => window.location.href = 'client-my-orders.html', 3500);
        } else {
            const err = await res.json();
            Swal.fire({ icon: 'error', text: err.message || 'فشل إرسال الطلب' });
            btn.disabled = false; btn.innerHTML = originalHTML;
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            Swal.fire({ icon: 'error', text: 'انتهى وقت الاتصال. يرجى التأكد من جودة الإنترنت والمحاولة مجدداً.' });
        } else {
            Swal.fire({ icon: 'error', text: 'حدث خطأ في الاتصال أثناء معالجة الطلب.' });
        }
        btn.disabled = false; btn.innerHTML = originalHTML;
    }
}

// Notification Init
if (userId && typeof initNotificationSocket === 'function') initNotificationSocket(userId);

// 🔌 Offline Handling
window.addEventListener('online', () => {
    Swal.fire({
        position: 'top-end',
        icon: 'success',
        title: 'رجع الإنترنت! 🌐',
        showConfirmButton: false,
        timer: 1500,
        toast: true
    });
});

window.addEventListener('offline', () => {
    Swal.fire({
        position: 'top-end',
        icon: 'warning',
        title: 'انقطع الاتصال بالإنترنت ⚠️',
        showConfirmButton: false,
        timer: 3000,
        toast: true
    });
});

// ═══════════════════════════════════════════════════════════
// 📒 دفتر العناوين — تحميل/حفظ/استخدام العناوين المحفوظة
// ═══════════════════════════════════════════════════════════
let _savedAddresses = [];

async function loadSavedAddresses() {
    try {
        const res = await fetch(`${API_URL}/api/auth/addresses`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        _savedAddresses = data.addresses || [];
        renderSavedAddressChips();
    } catch (e) { /* تجاهل بصمت — ميزة اختيارية */ }
}

function renderSavedAddressChips() {
    const bar = document.getElementById('savedAddressBar');
    const wrap = document.getElementById('savedAddressChips');
    if (!bar || !wrap) return;
    if (!_savedAddresses.length) { bar.classList.add('d-none'); return; }
    bar.classList.remove('d-none');
    wrap.innerHTML = _savedAddresses.map((a, i) => `
        <button type="button" class="btn btn-sm btn-light border rounded-pill px-3 d-flex align-items-center gap-1"
            style="font-size:12.5px;font-weight:700;" onclick="useSavedAddress(${i})">
            <i class="bi bi-geo-alt-fill text-success"></i>
            <span>${(a.label || 'عنوان').replace(/</g,'&lt;')}</span>
            <i class="bi bi-x-circle text-muted ms-1" style="font-size:13px;"
               onclick="event.stopPropagation(); deleteSavedAddress('${a._id}')"></i>
        </button>`).join('');
}

// استخدام عنوان محفوظ كوجهة تسليم
window.useSavedAddress = function (i) {
    const a = _savedAddresses[i];
    if (!a) return;
    document.getElementById('dropoff-addr').value = a.address || '';
    if (a.contactName) document.getElementById('dropoff-name').value = a.contactName;
    if (a.contactPhone) document.getElementById('dropoff-phone').value = a.contactPhone;
    if (a.lat != null) document.getElementById('dropoff-lat').value = a.lat;
    if (a.lng != null) document.getElementById('dropoff-lng').value = a.lng;
    if (typeof calculatePrice === 'function') { try { calculatePrice(); } catch (e) {} }
    Swal.fire({ position: 'top-end', icon: 'success', title: `تم اختيار: ${a.label}`, toast: true, timer: 1400, showConfirmButton: false });
};

// حفظ الوجهة الحالية في دفتر العناوين
window.saveCurrentDropoff = async function () {
    const address = document.getElementById('dropoff-addr').value;
    if (!address || !address.trim()) {
        Swal.fire({ icon: 'info', text: 'حدد الوجهة أولاً من الخريطة', timer: 1800, showConfirmButton: false });
        return;
    }
    const { value: label, isConfirmed } = await Swal.fire({
        title: 'حفظ العنوان',
        input: 'text',
        inputPlaceholder: 'سمِّ العنوان (المنزل، العمل...)',
        inputValue: 'المنزل',
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#04553A',
        inputValidator: (v) => !v && 'اكتب اسماً للعنوان'
    });
    if (!isConfirmed) return;
    try {
        const res = await fetch(`${API_URL}/api/auth/addresses`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                label,
                address,
                lat: parseFloat(document.getElementById('dropoff-lat').value) || undefined,
                lng: parseFloat(document.getElementById('dropoff-lng').value) || undefined,
                contactName: document.getElementById('dropoff-name').value,
                contactPhone: document.getElementById('dropoff-phone').value
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'فشل الحفظ');
        _savedAddresses = data.addresses || [];
        renderSavedAddressChips();
        Swal.fire({ position: 'top-end', icon: 'success', title: 'تم حفظ العنوان', toast: true, timer: 1500, showConfirmButton: false });
    } catch (e) {
        Swal.fire('خطأ', e.message || 'تعذّر حفظ العنوان', 'error');
    }
};

window.deleteSavedAddress = async function (addrId) {
    const ok = await Swal.fire({ title: 'حذف العنوان؟', icon: 'warning', showCancelButton: true, confirmButtonText: 'حذف', cancelButtonText: 'تراجع', confirmButtonColor: '#dc3545' });
    if (!ok.isConfirmed) return;
    try {
        const res = await fetch(`${API_URL}/api/auth/addresses/${addrId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        _savedAddresses = data.addresses || [];
        renderSavedAddressChips();
    } catch (e) {
        Swal.fire('خطأ', e.message || 'تعذّر الحذف', 'error');
    }
};

// إظهار زر "حفظ الوجهة" عندما تُحدَّد وجهة فعلية
// ✅ إصلاح BUG-12: استخدام event listener بدل setInterval
const dropoffAddrEl = document.getElementById('dropoff-addr');
const saveDropoffBtnEl = document.getElementById('saveDropoffBtn');
if (dropoffAddrEl && saveDropoffBtnEl) {
    const _updateDropoffBtn = () => {
        const hasDropoff = dropoffAddrEl.value && dropoffAddrEl.value.trim().length > 3;
        saveDropoffBtnEl.classList.toggle('d-none', !hasDropoff);
    };
    dropoffAddrEl.addEventListener('input', _updateDropoffBtn);
    _updateDropoffBtn(); // تحقق أولي
}

// تحميل العناوين عند فتح الصفحة (للعميل فقط)
if (localStorage.getItem('token')) loadSavedAddresses();

// ═══════════════════════════════════════════════════════════
// 🔄 إعادة الطلب — تعبئة النموذج من طلب سابق
// ═══════════════════════════════════════════════════════════
(function applyReorderPayload() {
    try {
        if (new URLSearchParams(location.search).get('reorder') !== '1') return;
        const raw = localStorage.getItem('reorder_payload');
        if (!raw) return;
        const d = JSON.parse(raw);
        localStorage.removeItem('reorder_payload');

        const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== '') el.value = v; };
        set('pickup-addr', d.pAddr); set('pickup-name', d.pName); set('pickup-phone', d.pPhone);
        set('pickup-lat', d.pLat); set('pickup-lng', d.pLng);
        set('dropoff-addr', d.dAddr); set('dropoff-name', d.dName); set('dropoff-phone', d.dPhone);
        set('dropoff-lat', d.dLat); set('dropoff-lng', d.dLng);
        set('details', d.details);
        if (typeof calculatePrice === 'function') { try { calculatePrice(); } catch (e) {} }

        // مرّر المستخدم لقسم الطلب
        setTimeout(() => {
            const form = document.querySelector('.route-inputs');
            if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
            Swal.fire({ position: 'top-end', icon: 'info', title: 'تم تعبئة بيانات الطلب السابق ✏️', toast: true, timer: 2200, showConfirmButton: false });
        }, 600);
    } catch (e) { /* تجاهل */ }
})();

// ═══════════════════════════════════════════════════════════
// 🌍 الاستماع لتغيير المدينة لتحديث مركز الخريطة فوراً
// ═══════════════════════════════════════════════════════════
window.addEventListener('city-changed', (e) => {
    if (map) {
        const newCity = e.detail.city;
        const newLat = newCity === 'PortSudan' ? 19.6151 : 15.6445;
        const newLng = newCity === 'PortSudan' ? 37.2164 : 32.4777;
        map.panTo({ lat: newLat, lng: newLng });
        map.setZoom(14);
    }
});
