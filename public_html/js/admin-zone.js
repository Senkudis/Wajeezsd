// ============================================================
// Admin Zone Builder — Custom Polygon Drawing (No DrawingManager)
// DrawingManager was removed from Google Maps API v3.65+
// Replace with a manual click-to-draw approach
// ============================================================

let adminMap;
let currentPolygon  = null;   // The finalized/editable polygon for the selected city
let otherCityPolygon = null;  // The preview polygon for the unselected city
let previewPolyline = null;   // Dashed preview line while drawing
let tempMarkers     = [];     // Vertex dot markers while drawing
let drawnPoints     = [];     // Array of LatLng objects collected during drawing
let isDrawingMode   = false;

// We will cache the zones here to avoid re-fetching when switching dropdown
let cachedZones = {
    Khartoum: null,
    PortSudan: null
};

// ── Helpers ──────────────────────────────────────────────────

function setStatus(msg, color = '#04553A') {
    const el = document.getElementById('zone-draw-status');
    if (el) { el.textContent = msg; el.style.color = color; }
}

function updateCoordinatesOutput() {
    if (!currentPolygon) return;
    const path = currentPolygon.getPath().getArray();
    const coordinates = path.map(p => ({
        lat: Number(p.lat().toFixed(6)),
        lng: Number(p.lng().toFixed(6))
    }));
    const textarea = document.getElementById('zone-coordinates-output');
    if (textarea) textarea.value = JSON.stringify(coordinates, null, 2);
}

// ── Drawing Controls ──────────────────────────────────────────

function startDrawing() {
    // Clear any existing polygon first
    clearZoneFully();

    isDrawingMode = true;
    adminMap.setOptions({ draggableCursor: 'crosshair' });
    document.getElementById('btn-start-draw').style.display  = 'none';
    document.getElementById('btn-finish-draw').style.display = 'inline-block';
    document.getElementById('btn-undo-point').style.display  = 'inline-block';
    setStatus('🖊 انقر على الخريطة لإضافة نقاط المضلع. أضف 3 نقاط على الأقل.', '#d97706');
}

function undoLastPoint() {
    if (!isDrawingMode || drawnPoints.length === 0) return;

    // Remove last marker
    const lastMarker = tempMarkers.pop();
    if (lastMarker) lastMarker.setMap(null);

    drawnPoints.pop();
    refreshPreviewPolyline();

    if (drawnPoints.length === 0) {
        setStatus('🖊 ابدأ بالنقر على الخريطة لإضافة نقاط.', '#d97706');
    } else {
        setStatus(`🖊 ${drawnPoints.length} نقطة — انقر لإضافة المزيد أو اضغط "إنهاء".`, '#d97706');
    }
}

function finishDrawing() {
    if (drawnPoints.length < 3) {
        setStatus('❗ يجب إضافة 3 نقاط على الأقل لإتمام المضلع.', '#dc3545');
        return;
    }

    isDrawingMode = false;
    adminMap.setOptions({ draggableCursor: null });

    // Remove temp markers and preview polyline
    tempMarkers.forEach(m => m.setMap(null));
    tempMarkers = [];
    if (previewPolyline) { previewPolyline.setMap(null); previewPolyline = null; }

    // Create the final editable polygon
    currentPolygon = new google.maps.Polygon({
        paths: drawnPoints,
        strokeColor: '#04553A',
        strokeOpacity: 0.9,
        strokeWeight: 3,
        fillColor: '#04553A',
        fillOpacity: 0.25,
        editable: true,
        draggable: true,
        map: adminMap,
        zIndex: 1
    });

    // Attach real-time edit listeners
    const path = currentPolygon.getPath();
    google.maps.event.addListener(path, 'set_at',    updateCoordinatesOutput);
    google.maps.event.addListener(path, 'insert_at', updateCoordinatesOutput);
    google.maps.event.addListener(path, 'remove_at', updateCoordinatesOutput);
    google.maps.event.addListener(currentPolygon, 'dragend', updateCoordinatesOutput);

    drawnPoints = [];
    updateCoordinatesOutput();

    document.getElementById('btn-start-draw').style.display  = 'inline-block';
    document.getElementById('btn-finish-draw').style.display = 'none';
    document.getElementById('btn-undo-point').style.display  = 'none';

    setStatus(`✅ المضلع جاهز (${currentPolygon.getPath().getLength()} نقطة). يمكنك تعديله أو حفظه.`, '#04553A');
}

// ── Live Preview While Drawing ────────────────────────────────

function refreshPreviewPolyline() {
    if (previewPolyline) { previewPolyline.setMap(null); previewPolyline = null; }
    if (drawnPoints.length < 2) return;

    previewPolyline = new google.maps.Polyline({
        path: drawnPoints,
        geodesic: true,
        strokeColor: '#04553A',
        strokeOpacity: 0.6,
        strokeWeight: 2,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '15px' }],
        map: adminMap
    });
}

function addDotMarker(latLng, index) {
    const marker = new google.maps.Marker({
        position: latLng,
        map: adminMap,
        icon: (typeof WajeezMarkers !== 'undefined') ? WajeezMarkers.zoneDot() : {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#04553A',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
        },
        label: { text: String(index + 1), color: '#fff', fontSize: '10px', fontWeight: 'bold' },
        title: `نقطة ${index + 1}`,
        zIndex: 10
    });
    return marker;
}


// ── Clear / Reset ─────────────────────────────────────────────

function clearZoneFully() {
    if (currentPolygon) { currentPolygon.setMap(null); currentPolygon = null; }
    if (otherCityPolygon) { otherCityPolygon.setMap(null); otherCityPolygon = null; }
    if (previewPolyline) { previewPolyline.setMap(null); previewPolyline = null; }
    tempMarkers.forEach(m => m.setMap(null));
    tempMarkers = [];
    drawnPoints = [];
    const textarea = document.getElementById('zone-coordinates-output');
    if (textarea) textarea.value = '';
}

window.clearZoneMap = function() {
    isDrawingMode = false;
    adminMap.setOptions({ draggableCursor: null });
    clearZoneFully();

    document.getElementById('btn-start-draw').style.display  = 'inline-block';
    document.getElementById('btn-finish-draw').style.display = 'none';
    document.getElementById('btn-undo-point').style.display  = 'none';
    setStatus('🖊 انقر على "ابدأ رسم المنطقة" لرسم منطقة التوصيل.', '#64748b');
};

// ── Save Zone ─────────────────────────────────────────────────

window.saveDeliveryZone = async function() {
    const coordsStr = document.getElementById('zone-coordinates-output').value;

    if (!coordsStr || !currentPolygon) {
        Swal.fire({ icon: 'warning', title: 'تنبيه', text: 'الرجاء رسم مضلع منطقة أولاً!' });
        return;
    }

    let coords;
    try { coords = JSON.parse(coordsStr); }
    catch (e) {
        Swal.fire({ icon: 'error', title: 'خطأ', text: 'حدث خطأ في محتوى الإحداثيات.' });
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const city = document.getElementById('zoneCitySelector').value;
        const res = await fetch(`${window.API_URL || ''}/api/admin/delivery-zone`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ deliveryZone: coords, city: city })
        });

        const data = await res.json();
        if (res.ok) {
            cachedZones[city] = coords; // Update the cache
            Swal.fire({
                icon: 'success', title: '✅ تم الحفظ بنجاح!',
                text: `تم حفظ منطقة التوصيل لمدينة ${city === 'PortSudan' ? 'بورتسودان' : 'الخرطوم'} (${coords.length} نقطة) وستُطبَّق فوراً.`,
                confirmButtonColor: '#04553A'
            });
        } else { throw new Error(data.message || 'فشل الحفظ'); }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'فشل الحفظ', text: err.message || 'خطأ في الاتصال بالسيرفر', confirmButtonColor: '#dc3545' });
    }
};

// ── Load All Zones ────────────────────────────────────────
async function fetchZoneForCity(city) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${window.API_URL || ''}/api/admin/delivery-zone?city=${city}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        const zone = data.deliveryZone;
        return (zone && zone.length >= 3) ? zone : null;
    } catch (e) {
        return null;
    }
}

async function loadAndDrawAllZones() {
    clearZoneFully();
    
    // Fetch both if not cached (or force fetch)
    cachedZones.Khartoum = await fetchZoneForCity('Khartoum');
    cachedZones.PortSudan = await fetchZoneForCity('PortSudan');
    
    drawZonesFromCache();
}

function drawZonesFromCache() {
    clearZoneFully(); // Clean before drawing
    const selectedCity = document.getElementById('zoneCitySelector').value;
    const otherCity = selectedCity === 'Khartoum' ? 'PortSudan' : 'Khartoum';
    
    // 1. Draw the OTHER city first as read-only (blue/gray)
    if (cachedZones[otherCity]) {
        otherCityPolygon = new google.maps.Polygon({
            paths: cachedZones[otherCity],
            strokeColor: '#2563eb', // Blue for preview
            strokeOpacity: 0.5,
            strokeWeight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            editable: false,
            draggable: false,
            clickable: false, // so it doesn't interfere with drawing
            map: adminMap,
            zIndex: 0
        });
    }

    // 2. Draw the SELECTED city as editable (green)
    const selectedZone = cachedZones[selectedCity];
    if (selectedZone) {
        currentPolygon = new google.maps.Polygon({
            paths: selectedZone,
            strokeColor: '#04553A', // Green for active
            strokeOpacity: 0.9,
            strokeWeight: 3,
            fillColor: '#04553A',
            fillOpacity: 0.25,
            editable: true,
            draggable: true,
            map: adminMap,
            zIndex: 1
        });

        const path = currentPolygon.getPath();
        google.maps.event.addListener(path, 'set_at',    updateCoordinatesOutput);
        google.maps.event.addListener(path, 'insert_at', updateCoordinatesOutput);
        google.maps.event.addListener(path, 'remove_at', updateCoordinatesOutput);
        google.maps.event.addListener(currentPolygon, 'dragend', updateCoordinatesOutput);

        const textarea = document.getElementById('zone-coordinates-output');
        if (textarea) textarea.value = JSON.stringify(selectedZone, null, 2);

        setStatus(`✅ تم تحميل منطقة محفوظة لمدينة ${selectedCity === 'PortSudan' ? 'بورتسودان' : 'الخرطوم'}. يمكنك تعديلها مباشرة.`, '#04553A');
        return true;
    } else {
        setStatus(`ℹ️ لا توجد منطقة توصيل محفوظة لمدينة ${selectedCity === 'PortSudan' ? 'بورتسودان' : 'الخرطوم'}. ابدأ الرسم الآن!`, '#d97706');
        return false;
    }
}

// ── City Switcher ─────────────────────────────────────────────
window.changeZoneCity = async function() {
    const city = document.getElementById('zoneCitySelector').value;
    
    // Default centers if we want to jump to the city
    const center = city === 'PortSudan' ? { lat: 19.6151, lng: 37.2164 } : { lat: 15.6445, lng: 32.4777 };
    adminMap.setCenter(center);
    adminMap.setZoom(city === 'PortSudan' ? 13 : 12);
    
    drawZonesFromCache();
}

// ── Map Init ──────────────────────────────────────────────────

function initAdminMap() {
    adminMap = new google.maps.Map(document.getElementById('admin-map'), {
        center: { lat: 15.6445, lng: 32.4777 },
        zoom: 12,
        mapTypeId: 'roadmap',
        disableDefaultUI: false,
        zoomControl: true,
    });

    // Map click → add point while in drawing mode
    adminMap.addListener('click', (e) => {
        if (!isDrawingMode) return;
        const latLng = e.latLng;
        drawnPoints.push(latLng);
        tempMarkers.push(addDotMarker(latLng, drawnPoints.length - 1));
        refreshPreviewPolyline();
        setStatus(`🖊 ${drawnPoints.length} نقطة — استمر بالنقر أو اضغط "إنهاء الرسم".`, '#d97706');
    });

    setStatus('🖊 جاري جلب مناطق التوصيل...', '#64748b');
    
    // Fetch and draw all zones once map is ready
    loadAndDrawAllZones().then(() => {
        // Optional: you can automatically fit bounds to the selected city here
        const selectedCity = document.getElementById('zoneCitySelector').value;
        if (cachedZones[selectedCity] && cachedZones[selectedCity].length > 0) {
            const bounds = new google.maps.LatLngBounds();
            cachedZones[selectedCity].forEach(p => bounds.extend(new google.maps.LatLng(p.lat, p.lng)));
            adminMap.fitBounds(bounds);
        }
    });
}
