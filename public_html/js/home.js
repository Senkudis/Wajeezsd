// public_html/js/home.js

// Check Auth & Personalization
let token = localStorage.getItem('token');
const userName = localStorage.getItem('userName');
const userId = localStorage.getItem('userId');

if (userName) document.getElementById('greeting').innerText = `مرحباً، ${userName.split(' ')[0]} 👋`;

// 🟢 Fetch Pricing Settings
let pricingConfig = null;
async function fetchPricingConfig() {
    try {
        const res = await fetch(`${API_URL}/api/orders/price-config`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            pricingConfig = await res.json();
            console.log('💰 Pricing Loaded:', pricingConfig);
        }
    } catch (e) { console.error('Error loading pricing', e); }
}
if (token) fetchPricingConfig();

// 🗺️ Map Initialization & Modal Logic
let map, currentSelectionMode, mapInitialized = false;

function openMapModal(mode) {
    currentSelectionMode = mode;
    const title = mode === 'pickup' ? 'تحديد موقع الاستلام' : 'تحديد وجهة التسليم';
    document.getElementById('modalTitle').innerText = title;

    const modalEl = document.getElementById('locationPickerModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // Refresh map on modal show
    if (!mapInitialized) {
        setTimeout(initMap, 400);
    } else {
        setTimeout(() => map.invalidateSize(), 400);
    }
}

function initMap() {
    if (mapInitialized) return;
    try {
        // 🟢 Use 'pickerMap' ID
        map = L.map('pickerMap', { zoomControl: false, attributionControl: false }).setView([15.5007, 32.5599], 13);

        const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
        const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
            maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google'
        }).addTo(map);

        L.control.layers({ "قمر صناعي 🛰️": googleHybrid, "الوضع الليلي 🌙": darkLayer }, null, { position: 'topright' }).addTo(map);

        mapInitialized = true;
        setTimeout(locateMe, 500);
    } catch (err) {
        console.error('Map Init Error:', err);
        alert('فشل تهيئة الخريطة، يرجى المحاولة مرة أخرى');
    }
}

function confirmLocationSelection() {
    const center = map.getCenter();
    const mode = currentSelectionMode;

    document.getElementById(`${mode}-lat`).value = center.lat;
    document.getElementById(`${mode}-lng`).value = center.lng;
    document.getElementById(`${mode}-addr`).value = `موقع محدد (${center.lat.toFixed(4)}, ${center.lng.toFixed(4)})`;

    // Auto reverse geocode for better UI
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${center.lat}&lon=${center.lng}`)
        .then(res => res.json())
        .then(data => {
            if (data.display_name) {
                const addr = data.address.road || data.address.suburb || data.display_name.split(',')[0];
                document.getElementById(`${mode}-addr`).value = addr;
            }
        }).catch(() => { });

    bootstrap.Modal.getInstance(document.getElementById('locationPickerModal')).hide();
}

function locateMe() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 16),
        (err) => console.log('Geolocation disabled/failed'),
        { enableHighAccuracy: true }
    );
}

// 🟢 Utils
function calculatePrice() {
    // Basic Client-Side Estimation
    const type = document.getElementById('distance-type').value;
    const priceInput = document.getElementById('price');
    if (type === 'short') priceInput.value = 3000;
    else if (type === 'medium') priceInput.value = 6000;
    else if (type === 'long') priceInput.value = 10000;
}

function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('img-preview').classList.remove('d-none');
            document.getElementById('img-preview').querySelector('img').src = e.target.result;
        }
        reader.readAsDataURL(input.files[0]);
    }
}

function clearImage() {
    document.getElementById('parcel-image').value = '';
    document.getElementById('img-preview').classList.add('d-none');
}

// 🖼️ Client-Side Compression using browser-image-compression
async function compressImage(file) {
    const options = {
        maxSizeMB: 0.5,          // Max size in MB (very efficient)
        maxWidthOrHeight: 1280,  // Good for mobile screens
        useWebWorker: true,      // Run in background to avoid freezing UI
        fileType: 'image/jpeg'
    };

    try {
        const compressedFile = await imageCompression(file, options);
        // Convert Blob to Base64 for the backend
        return await imageCompression.getDataUrlFromFile(compressedFile);
    } catch (error) {
        console.error('Compression Error:', error);
        return await imageCompression.getDataUrlFromFile(file);
    }
}

// 🚀 Validation & Submission
function validateOrder() {
    const pLat = document.getElementById('pickup-lat').value;
    const dLat = document.getElementById('dropoff-lat').value;
    const pPhone = document.getElementById('pickup-phone').value;
    const dPhone = document.getElementById('dropoff-phone').value;
    const price = document.getElementById('price').value;

    const warn = (msg) => {
        Swal.fire({ icon: 'warning', text: msg, confirmButtonText: 'حسناً', confirmButtonColor: '#0a8754' });
        return false;
    };

    if (!pLat) return warn('يرجى تحديد موقع الاستلام من الخريطة');
    if (!dLat) return warn('يرجى تحديد وجهة التسليم من الخريطة');
    if (!pPhone || pPhone.length < 10) return warn('رقم هاتف المرسل غير صحيح');
    if (!dPhone || dPhone.length < 10) return warn('رقم هاتف المستلم غير صحيح');
    if (!price || price <= 0) return warn('يرجى تحديد سعر العرض');

    return true;
}

async function createOrder() {
    // Guard
    if (!localStorage.getItem('token')) {
        const res = await Swal.fire({
            title: 'تسجيل الدخول مطلوب',
            text: 'عشان تقدر تطلب كابتن، لازم تسجل دخولك أولاً.',
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'تسجيل الدخول',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#0a8754'
        });
        if (res.isConfirmed) window.location.href = 'client-login.html';
        return;
    }

    if (!validateOrder()) return;

    const btn = document.getElementById('submit-btn');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جاري الإرسال...';

    let base64Image = null;
    const fileInput = document.getElementById('parcel-image');
    if (fileInput.files.length > 0) {
        base64Image = await compressImage(fileInput.files[0]);
    }

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
        distanceType: document.getElementById('distance-type').value,
        price: parseFloat(document.getElementById('price').value),
        parcelImage: base64Image
    };

    try {
        const res = await fetch(`${API_URL}/api/orders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            Swal.fire({ icon: 'success', title: 'تم الطلب بنجاح! 🎉', text: 'جاري البحث عن كابتن...', timer: 3000, showConfirmButton: false });
            setTimeout(() => window.location.href = 'client-my-orders.html', 3000);
        } else {
            const err = await res.json();
            Swal.fire({ icon: 'error', text: err.message || 'فشل إرسال الطلب' });
            btn.disabled = false; btn.innerHTML = originalHTML;
        }
    } catch (err) {
        Swal.fire({ icon: 'error', text: 'حدث خطأ في الاتصال بالسيرفر' });
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

