// Admin Live Map - Real-time Captain Tracking
const token = localStorage.getItem('adminToken');
if (!token) {
    window.location.href = 'admin-login.html';
}

// Initialize Map (Centered on Khartoum/Omdurman)
const map = L.map('map').setView([15.5007, 32.5599], 12);

// Add OpenStreetMap Tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
}).addTo(map);

// Custom Car Icon for Captains
const carIcon = L.icon({
    iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjMzQ5OGRiIj48cGF0aCBkPSJNMTguOTIgNi4wMUMxOC43MiA1LjQyIDE4LjE2IDUgMTcuNSA1aC0xMWMtLjY2IDAtMS4yMS40Mi0xLjQyIDEuMDFMMyAxMnY4YzAgLjU1LjQ1IDEgMSAxaDFjLjU1IDAgMS0uNDUgMS0xdi0xaDEydjFjMCAuNTUuNDUgMSAxIDFoMWMuNTUgMCAxLS40NSAxLTF2LThsLTIuMDgtNi45OXpNNi44NSA3aDEwLjI5bDEuMDggMy42SDUuNzdMNi44NSA3ek01IDEzLjVjMC0uODMuNjctMS41IDEuNS0xLjVzMS41LjY3IDEuNSAxLjUtLjY3IDEuNS0xLjUgMS41UzUgMTQuMzMgNSAxMy41em0xMiAwYzAtLjgzLjY3LTEuNSAxLjUtMS41czEuNS42NyAxLjUgMS41LS42NyAxLjUtMS41IDEuNS0xLjUtLjY3LTEuNS0xLjV6Ii8+PC9zdmc+',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
});

// Store captain markers
const captainMarkers = {};
let onlineCount = 0;
let offlineCount = 0;

// Connect to Socket.io
const socket = io();

socket.on('connect', () => {
    console.log('✅ Connected to Socket.io');
    socket.emit('admin_join'); // Join admin room
});

// Listen for captain location updates
socket.on('captain_location_update', (data) => {
    const { captainId, lat, lng, name, status } = data;

    console.log(`📍 Captain ${captainId} location update:`, lat, lng);

    if (captainMarkers[captainId]) {
        // Update existing marker position
        captainMarkers[captainId].setLatLng([lat, lng]);
        updatePopup(captainMarkers[captainId], name, status);
    } else {
        // Create new marker
        const marker = L.marker([lat, lng], { icon: carIcon }).addTo(map);
        updatePopup(marker, name, status);
        captainMarkers[captainId] = marker;
        onlineCount++;
        updateStats();
    }
});

// Listen for captain going offline
socket.on('captain_offline', (data) => {
    const { captainId } = data;

    if (captainMarkers[captainId]) {
        map.removeLayer(captainMarkers[captainId]);
        delete captainMarkers[captainId];
        onlineCount--;
        offlineCount++;
        updateStats();
    }
});

// Listen for captain going online
socket.on('captain_online', (data) => {
    const { captainId, lat, lng, name, status } = data;

    if (!captainMarkers[captainId] && lat && lng) {
        const marker = L.marker([lat, lng], { icon: carIcon }).addTo(map);
        updatePopup(marker, name, status);
        captainMarkers[captainId] = marker;
        onlineCount++;
        updateStats();
    }
});

// Update marker popup
function updatePopup(marker, name, status) {
    const statusClass = status === 'available' ? 'available' : 'busy';
    const statusText = status === 'available' ? 'متاح' : 'مشغول';

    const popupContent = `
        <div class="captain-popup">
            <h5>${name || 'كابتن'}</h5>
            <span class="status ${statusClass}">${statusText}</span>
        </div>
    `;

    marker.bindPopup(popupContent);
}

// Update stats panel
function updateStats() {
    document.getElementById('onlineCount').textContent = onlineCount;
    document.getElementById('offlineCount').textContent = offlineCount;
}

// Load initial captain locations
async function loadInitialCaptains() {
    try {
        const res = await fetch(`${API_URL}/api/admin/active-captains`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const captains = await res.json();

            captains.forEach(captain => {
                if (captain.location && captain.location.lat && captain.location.lng) {
                    const marker = L.marker(
                        [captain.location.lat, captain.location.lng],
                        { icon: carIcon }
                    ).addTo(map);

                    updatePopup(marker, captain.name, captain.isActive ? 'available' : 'busy');
                    captainMarkers[captain._id] = marker;
                    onlineCount++;
                }
            });

            updateStats();
        }
    } catch (error) {
        console.error('Error loading initial captains:', error);
    }
}

// Load on page load
loadInitialCaptains();

// Handle disconnection
socket.on('disconnect', () => {
    console.log('❌ Disconnected from Socket.io');
});

// 🔒 PERFORMANCE FIX: Cleanup on page unload (prevent memory leaks)
window.addEventListener('beforeunload', () => {
    console.log('🧹 Cleaning up socket listeners...');

    // Remove all event listeners
    socket.off('captain_location_update');
    socket.off('captain_offline');
    socket.off('captain_online');
    socket.off('disconnect');

    // Disconnect socket
    socket.disconnect();

    // Clear markers
    Object.values(captainMarkers).forEach(marker => {
        map.removeLayer(marker);
    });
    captainMarkers = {};
});
