// public_html/js/admin-places.js
// Admin Panel: Places & Categories Management


const adminToken = () => localStorage.getItem('token');
const headers = () => ({ 'Authorization': `Bearer ${adminToken()}`, 'Content-Type': 'application/json' });

/**
 * Helper: Set a submit button to loading or restore it.
 * @param {HTMLElement} btn - The button element
 * @param {boolean} loading - true = show spinner, false = restore
 * @param {string} originalHtml - The original innerHTML to restore
 */
function setSubmitLoading(btn, loading, originalHtml) {
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn._originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>جاري الحفظ...';
    } else {
        btn.disabled = false;
        btn.innerHTML = originalHtml || btn._originalHtml || 'حفظ';
    }
}

let allCategories = [];
let placesDataTable = null;

// =====================================
// 🗺️ Google Maps URL Coord Extractor + Map Preview
// =====================================
let adminPlaceMapInstance = null;

function autoExtractCoords(url) {
    const statusEl = document.getElementById('coordsStatus');
    if (!url.trim()) { statusEl.style.display = 'none'; return; }

    const patterns = [
        /@(-?\d+\.\d+),(-?\d+\.\d+)/,
        /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
        /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            document.getElementById('placeLat').value = lat.toFixed(6);
            document.getElementById('placeLng').value = lng.toFixed(6);
            adminReverseFillAddress(lat, lng);
            statusEl.style.display = 'block';
            statusEl.style.background = '#f0fdf4';
            statusEl.style.border = '1px solid #bbf7d0';
            statusEl.style.color = '#166534';
            statusEl.innerHTML = `<i class="fas fa-check-circle"></i> تم استخراج الإحداثيات تلقائياً: Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`;

            // ✅ فتح الخريطة التأكيدية
            initAdminPlaceMap(lat, lng);
            return;
        }
    }

    if (url.includes('goo.gl') || url.includes('maps.app')) {
        statusEl.style.display = 'block';
        statusEl.style.background = '#fefce8';
        statusEl.style.border = '1px solid #fde68a';
        statusEl.style.color = '#854d0e';
        statusEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> رابط مختصر — سيتم حفظ الرابط مباشرة، ولكن <b>لن تظهر الخريطة</b> ولا حساب المسافة. للحصول على رابط كامل <b>افتح الرابط في متصفح، ثم انسخ الرابط الكامل</b> من شريط العنوان.`;
        document.getElementById('adminPlaceMapWrapper').style.display = 'none';
    } else {
        statusEl.style.display = 'none';
    }
}

// 📍 يملأ "الوصف الجغرافي" تلقائياً من الموقع المحدّد (إن كان فارغاً) — سلاسة الإضافة.
// reverse-geocode عبر Google ثم Nominatim. لا يطمس ما كتبه الأدمن يدوياً.
function adminReverseFillAddress(lat, lng) {
    const field = document.getElementById('placeAddress');
    if (!field || field.value.trim()) return; // لا تطمس الإدخال اليدوي
    const apply = (addr) => { if (addr && !field.value.trim()) field.value = addr; };
    try {
        if (typeof google !== 'undefined' && google.maps && google.maps.Geocoder) {
            new google.maps.Geocoder().geocode(
                { location: { lat, lng }, language: 'ar', region: 'SD' },
                (results, status) => {
                    if (status === 'OK' && results && results[0]) {
                        apply((results[0].formatted_address || '').replace(/،?\s*السودان\s*$/, '').trim());
                    } else { adminReverseFillNominatim(lat, lng, apply); }
                }
            );
            return;
        }
    } catch (_) {}
    adminReverseFillNominatim(lat, lng, apply);
}
function adminReverseFillNominatim(lat, lng, apply) {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ar&lat=${lat}&lon=${lng}`)
        .then(r => r.json())
        .then(d => {
            const a = d?.address || {};
            apply([a.road, a.neighbourhood || a.suburb, a.city || a.town || a.village].filter(Boolean).join('، '));
        }).catch(() => {});
}

// =====================================
// 🗺️ Admin Place Map — خريطة قمر صناعي كالتطبيق
// =====================================
async function initAdminPlaceMap(lat, lng) {
    // Singleton: Destroy any existing map
    if (typeof adminPlaceMapInstance !== 'undefined' && adminPlaceMapInstance !== null) {
        try { await adminPlaceMapInstance.destroy(); } catch(e) {}
        adminPlaceMapInstance = null;
    }

    const wrapper = document.getElementById('adminPlaceMapWrapper');
    wrapper.style.display = 'block';

    const mapElement = document.getElementById('adminPlaceMap');
    if (!mapElement) return;

    // 🗺️ Web SDK حصرياً. مسار البلوجن الأصلي (Capacitor) حُذف نهائياً لأنه:
    //   1. يرسم خلف الـ WebView بإحداثيات شاشة ثابتة → دبوس "شبحي" في مكان عشوائي
    //   2. لم يكن يُدمَّر عند الإغلاق → يتراكم دبوسان فأكثر عند إعادة الفتح
    //   3. بلا مستمعي سحب/نقر → تعذّر تعديل الموقع من التطبيق أصلاً
    // ننتظر تحميل الـ SDK (idempotent) بدل السقوط للبلوجن في سباق التحميل.
    try {
        if (typeof window.loadGoogleMaps === 'function') {
            await window.loadGoogleMaps({ libraries: 'places' });
        }
    } catch (e) { console.error('Maps SDK load failed:', e); }

    if (typeof google !== 'undefined' && google.maps && typeof google.maps.Map === 'function') {
        mapElement.innerHTML = '';
        const webMap = new google.maps.Map(mapElement, {
            center: { lat, lng }, zoom: 16,
            gestureHandling: 'greedy', disableDefaultUI: false,
            mapId: 'WAJEEZ_ADMIN_MAP'
        });
        const marker = (typeof window.createModernMarker === 'function')
            ? window.createModernMarker({ position: { lat, lng }, map: webMap, draggable: true, title: 'موقع المحل', icon: (typeof WajeezMarkers !== 'undefined') ? WajeezMarkers.place() : undefined })
            : new google.maps.Marker({ position: { lat, lng }, map: webMap, draggable: true, title: 'موقع المحل', icon: (typeof WajeezMarkers !== 'undefined') ? WajeezMarkers.place() : undefined });

        marker.addListener('dragend', () => {
            const pos = marker.getPosition();
            document.getElementById('placeLat').value = pos.lat().toFixed(6);
            document.getElementById('placeLng').value = pos.lng().toFixed(6);
            document.getElementById('adminPlaceMapCoords').textContent = pos.lat().toFixed(5) + ', ' + pos.lng().toFixed(5);
            adminReverseFillAddress(pos.lat(), pos.lng());
        });
        webMap.addListener('click', (e) => {
            marker.setPosition(e.latLng);
            document.getElementById('placeLat').value = e.latLng.lat().toFixed(6);
            document.getElementById('placeLng').value = e.latLng.lng().toFixed(6);
            document.getElementById('adminPlaceMapCoords').textContent = e.latLng.lat().toFixed(5) + ', ' + e.latLng.lng().toFixed(5);
            adminReverseFillAddress(e.latLng.lat(), e.latLng.lng());
        });
        // FIX: trigger resize so tiles load inside modal
        setTimeout(() => {
            google.maps.event.trigger(webMap, 'resize');
            webMap.setCenter({ lat, lng });
        }, 250);
        adminPlaceMapInstance = {
            destroy: function() {
                if (marker) marker.setMap(null);
                if (webMap) google.maps.event.clearInstanceListeners(webMap);
            }
        };

    } else {
        console.warn('No map provider available for adminPlaceMap');
    }
}


function adminMapLocateMe() {
    if (!navigator.geolocation) return alert('المتصفح لا يدعم GPS');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            if (!adminPlaceMapInstance) {
                initAdminPlaceMap(pos.coords.latitude, pos.coords.longitude);
            }
        },
        () => alert('تعذّر تحديد موقعك. تأكد من تفعيل الـ GPS.'),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
}


// =====================================
// 🔁 Load on page
// =====================================
document.addEventListener('DOMContentLoaded', () => {
    loadAdminCategories();
    loadAdminPlaces();
});

// =====================================
// 🏷️ Categories
// =====================================
async function loadAdminCategories() {
    try {
        const res = await fetch(`${API_URL}/api/places/categories`);
        allCategories = await res.json();
        renderAdminCategories(allCategories);
        populateCategorySelect();
    } catch (e) {
        document.getElementById('adminCategoriesList').innerHTML = '<span style="color:red">فشل التحميل</span>';
    }
}

function renderAdminCategories(cats) {
    const container = document.getElementById('adminCategoriesList');
    if (cats.length === 0) {
        container.innerHTML = '<span style="color:#9ca3af;">لا توجد تصنيفات بعد. أضف تصنيفاً جديداً!</span>';
        return;
    }
    container.innerHTML = cats.map(cat => `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:10px 16px;display:flex;align-items:center;gap:10px;">
            <i class="bi ${cat.icon} text-success"></i>
            <span style="font-weight:700;font-size:14px;">${cat.name}</span>
            <div style="margin-right:auto;display:flex;gap:6px;">
                <button onclick="openEditCategoryModal('${cat._id}', this)"
                    data-name="${(cat.name || '').replace(/"/g, '&quot;')}" data-icon="${cat.icon}" data-order="${cat.sortOrder || 0}"
                    data-notes="${(cat.notes || '').replace(/"/g, '&quot;')}"
                    style="background:#04553A;border:none;color:white;cursor:pointer;padding:4px 10px;border-radius:8px;font-size:12px;">
                    <i class="fas fa-edit"></i> تعديل
                </button>
                <button onclick="deleteCategory('${cat._id}', '${cat.name}')"
                    style="background:none;border:none;color:#ef4444;cursor:pointer;padding:4px 6px;">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function populateCategorySelect() {
    const sel = document.getElementById('placeCategorySelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">اختر التصنيف...</option>' +
        allCategories.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
}

async function deleteCategory(id, name) {
    const confirm = await Swal.fire({ title: `حذف "${name}"?`, text: 'سيتم حذف التصنيف نهائياً', icon: 'warning', showCancelButton: true, confirmButtonText: 'حذف', cancelButtonText: 'إلغاء', confirmButtonColor: '#ef4444' });
    if (!confirm.isConfirmed) return;
    try {
        await fetch(`${API_URL}/api/places/categories/${id}`, { method: 'DELETE', headers: headers() });
        Swal.fire({ icon: 'success', title: 'تم الحذف', timer: 1500, showConfirmButton: false });
        loadAdminCategories();
    } catch (e) { Swal.fire('خطأ', 'فشل الحذف', 'error'); }
}

// =====================================
// 🏪 Places
// =====================================
async function loadAdminPlaces() {
    try {
        const res = await fetch(`${API_URL}/api/places?city=all`, { headers: headers() });
        const places = await res.json();
        renderAdminPlacesTable(places);
    } catch (e) {
        document.querySelector('#placesTable tbody').innerHTML = '<tr><td colspan="5" style="color:red;text-align:center;">فشل التحميل</td></tr>';
    }
}

function renderAdminPlacesTable(places) {
    const tbody = document.querySelector('#placesTable tbody');
    if (places.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;">لا توجد محلات بعد</td></tr>';
        return;
    }

    const getFullImageUrl = (url) => {
        if (!url) return '';
        if (url.startsWith('data:image')) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        const base = window.API_URL || 'https://wajeezsd.com';
        const cleanUrl = url.replace(/\\/g, '/');
        const withSlash = cleanUrl.startsWith('/') ? cleanUrl : '/' + cleanUrl;
        const isLocal = base.includes('localhost') || base.includes('127.0.0.1');
        if (!isLocal && withSlash.startsWith('/uploads')) return base + '/api' + withSlash;
        return base + withSlash;
    };

    tbody.innerHTML = places.map(p => `
        <tr>
            <td>
                ${p.image_url ? `<img src="${getFullImageUrl(p.image_url)}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;margin-left:8px;vertical-align:middle;">` : ''}
                <strong>${p.name}</strong>
                <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">
                    <i class="bi bi-geo-alt-fill"></i> ${p.city === 'PortSudan' ? 'بورتسودان' : 'الخرطوم'}
                </div>
            </td>
            <td>${p.category?.name || '-'}</td>
            <td>${p.phone || '-'}</td>
            <td>
                ${p.is_open
            ? '<span style="background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">مفتوح</span>'
            : '<span style="background:#fee2e2;color:#dc2626;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">مغلق</span>'}
            </td>
            <td>
                <button onclick="openEditPlaceModal('${p._id}')" class="btn-primary-custom" style="padding:6px 12px;font-size:12px;margin-left:6px;">
                    <i class="fas fa-edit"></i> تعديل
                </button>
                <button onclick="deletePlace('${p._id}', '${p.name}')" class="btn-danger-custom" style="padding:6px 12px;font-size:12px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// =====================================
// ✏️ Edit Place
// =====================================
let editingPlaceId = null;
let editPlaceMapInstance = null;

async function openEditPlaceModal(id) {
    editingPlaceId = id;
    try {
        const res = await fetch(`${API_URL}/api/places/${id}`, { headers: headers() });
        if (!res.ok) throw new Error('فشل جلب بيانات المحل');
        const p = await res.json();

        // Populate category selector
        const catSel = document.getElementById('editPlaceCategorySelect');
        catSel.innerHTML = allCategories.map(c =>
            `<option value="${c._id}" ${c._id === (p.category?._id || p.category) ? 'selected' : ''}>${c.name}</option>`
        ).join('');

        document.getElementById('editPlaceName').value = p.name || '';
        document.getElementById('editPlacePhone').value = p.phone || '';
        document.getElementById('editPlaceWhatsapp').value = p.whatsapp || '';
        document.getElementById('editPlaceAddress').value = p.address || '';
        document.getElementById('editPlaceNotes').value = p.notes || '';
        document.getElementById('editPlaceCity').value = p.city || 'Khartoum'; // 🌍 City field
        document.getElementById('editPlaceOpen').value = p.workingHours?.open || '08:00';
        document.getElementById('editPlaceClose').value = p.workingHours?.close || '22:00';
        document.getElementById('editPlaceIsOpen').value = p.is_open ? '1' : '0'; // manual override
        document.getElementById('editPlaceLat').value = p.location?.lat || '';
        document.getElementById('editPlaceLng').value = p.location?.lng || '';

        // populate menu
        document.getElementById('editPlaceMenu').value = p.menu || '';
        if (p.menu) {
            const fullMenuUrl = (() => {
                if (!p.menu) return '';
                if (p.menu.startsWith('http')) return p.menu;
                const base = window.API_URL || 'https://wajeezsd.com';
                const withSlash = p.menu.startsWith('/') ? p.menu : '/' + p.menu;
                const isLocal = base.includes('localhost') || base.includes('127.0.0.1');
                if (!isLocal && withSlash.startsWith('/uploads')) return base + '/api' + withSlash;
                return base + withSlash;
            })();
            document.getElementById('editMenuImagePreviewImg').src = fullMenuUrl;
            document.getElementById('editMenuImagePreview').style.display = 'block';
            document.getElementById('editPlaceMenu').value = p.menu;
        } else {
            clearEditMenuImage();
        }

        document.getElementById('editPlaceModal').classList.add('show');

        // 🛒 تحميل منتجات المتجر
        resetProductForm();
        toggleProductForm(false);
        loadPlaceProducts();

        // 🖼️ Show current place image if exists
        const imgPreviewEl = document.getElementById('placeImagePreviewImg');
        const imgPreviewContainer = document.getElementById('placeImagePreview');
        if (p.image_url) {
            const fullImgUrl = (() => {
                if (!p.image_url) return '';
                if (p.image_url.startsWith('http')) return p.image_url;
                const base = window.API_URL || 'https://wajeezsd.com';
                const withSlash = p.image_url.startsWith('/') ? p.image_url : '/' + p.image_url;
                const isLocal = base.includes('localhost') || base.includes('127.0.0.1');
                if (!isLocal && withSlash.startsWith('/uploads')) return base + '/api' + withSlash;
                return base + withSlash;
            })();
            imgPreviewEl.src = fullImgUrl;
            imgPreviewContainer.style.display = 'block';
            document.getElementById('placeImage').value = p.image_url;
        } else {
            imgPreviewEl.src = '';
            imgPreviewContainer.style.display = 'none';
            document.getElementById('placeImage').value = '';
        }

        // 🔥 Singleton enforcement: Destroy any existing map before opening again
        if (typeof editPlaceMapInstance !== 'undefined' && editPlaceMapInstance !== null) {
            try { await editPlaceMapInstance.destroy(); } catch(e) {}
            editPlaceMapInstance = null;
        }

        // Init map after modal shown
        setTimeout(async () => {
            // 🌍 لو المتجر بلا موقع محفوظ: مركز الخريطة يتبع مدينته المختارة
            // (كان الافتراضي دائماً وسط الخرطوم → دبوس "عشوائي" لمتاجر بورتسودان)
            const hasSavedLoc = Number.isFinite(Number(p.location?.lat)) && Number.isFinite(Number(p.location?.lng));
            const cityCenters = {
                Khartoum:  { lat: 15.5007, lng: 32.5599 },
                PortSudan: { lat: 19.6158, lng: 37.2164 }
            };
            const fallback = cityCenters[p.city] || cityCenters.Khartoum;
            const lat = hasSavedLoc ? Number(p.location.lat) : fallback.lat;
            const lng = hasSavedLoc ? Number(p.location.lng) : fallback.lng;

            const mapElement = document.getElementById('editPlaceMap');
            if (!mapElement) return;

            // 🗺️ Web SDK حصرياً — مسار البلوجن الأصلي حُذف (يرسم خلف الـ WebView،
            // لا يُدمَّر عند الإغلاق فيراكم دبابيس شبحية، وبلا مستمعي سحب/نقر)
            try {
                if (typeof window.loadGoogleMaps === 'function') {
                    await window.loadGoogleMaps({ libraries: 'places' });
                }
            } catch (e) { console.error('Maps SDK load failed:', e); }

            if (typeof google !== 'undefined' && google.maps && typeof google.maps.Map === 'function') {
                mapElement.innerHTML = '';
                const webMap = new google.maps.Map(mapElement, {
                    center: { lat, lng }, zoom: 16,
                    gestureHandling: 'greedy', disableDefaultUI: false,
                    mapId: 'WAJEEZ_EDIT_PLACE_MAP'
                });
                const marker = (typeof window.createModernMarker === 'function')
                    ? window.createModernMarker({ position: { lat, lng }, map: webMap, draggable: true, title: 'موقع المحل', icon: (typeof WajeezMarkers !== 'undefined') ? WajeezMarkers.place() : undefined })
                    : new google.maps.Marker({ position: { lat, lng }, map: webMap, draggable: true, title: 'موقع المحل', icon: (typeof WajeezMarkers !== 'undefined') ? WajeezMarkers.place() : undefined });

                marker.addListener('dragend', () => {
                    const pos = marker.getPosition();
                    document.getElementById('editPlaceLat').value = pos.lat().toFixed(6);
                    document.getElementById('editPlaceLng').value = pos.lng().toFixed(6);
                    document.getElementById('editPlaceMapCoords').textContent = pos.lat().toFixed(5) + ', ' + pos.lng().toFixed(5);
                });
                webMap.addListener('click', (e) => {
                    marker.setPosition(e.latLng);
                    document.getElementById('editPlaceLat').value = e.latLng.lat().toFixed(6);
                    document.getElementById('editPlaceLng').value = e.latLng.lng().toFixed(6);
                    document.getElementById('editPlaceMapCoords').textContent = e.latLng.lat().toFixed(5) + ', ' + e.latLng.lng().toFixed(5);
                });
                // FIX: trigger resize so tiles load inside modal
                setTimeout(() => {
                    google.maps.event.trigger(webMap, 'resize');
                    webMap.setCenter({ lat, lng });
                }, 250);
                editPlaceMapInstance = {
                    destroy: function() {
                        if (marker) marker.setMap(null);
                        if (webMap) google.maps.event.clearInstanceListeners(webMap);
                    }
                };

            } else {
                console.warn('No map provider available for editPlaceMap');
            }
        }, 200);

    } catch (e) {
        Swal.fire('خطأ', e.message, 'error');
    }
}

function closeEditPlaceModal() {
    document.getElementById('editPlaceModal').classList.remove('show');
    // 🧹 تنظيف فعلي للخريطة عند الإغلاق — كان يُصفَّر المتغير فقط دون تدمير،
    // فيبقى دبوس الفتحة السابقة ويظهر دبوسان عند إعادة الفتح
    const mapEl = document.getElementById('editPlaceMap');
    if (mapEl) mapEl.innerHTML = '';
    editPlaceMapInstance = null;
    editingPlaceId = null;
    clearEditMenuImage();
}

async function submitEditPlace(e) {
    e.preventDefault();
    if (!editingPlaceId) return;
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');

    const lat = parseFloat(document.getElementById('editPlaceLat').value);
    const lng = parseFloat(document.getElementById('editPlaceLng').value);

    const payload = {
        name: document.getElementById('editPlaceName').value.trim(),
        category: document.getElementById('editPlaceCategorySelect').value,
        phone: document.getElementById('editPlacePhone').value.trim(),
        whatsapp: document.getElementById('editPlaceWhatsapp').value.trim(),
        address: document.getElementById('editPlaceAddress').value.trim(),
        notes: document.getElementById('editPlaceNotes').value.trim(),
        city: document.getElementById('editPlaceCity').value, // 🌍 City field
        workingHours: {
            open: document.getElementById('editPlaceOpen').value,
            close: document.getElementById('editPlaceClose').value,
            days: [0, 1, 2, 3, 4, 5, 6]
        }
    };

    // 🗺️ أرسل الموقع فقط إن كان صالحاً — وإلا يبقى المحفوظ في القاعدة كما هو.
    // (كان الفارغ يُستبدل بصمت بوسط الخرطوم فيطمس مواقع صحيحة → دبابيس عشوائية)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        payload.location = { lat, lng };
    }

    setSubmitLoading(btn, true);

    // 🖼️ رفع/حفظ صورة (لوغو) المتجر — كان مفقوداً فالتعديل ما كان يُحفظ
    let imageUrl = document.getElementById('placeImage').value || '';
    try {
        const uploadedImg = await uploadPlaceImageIfNeeded();
        if (uploadedImg) imageUrl = uploadedImg;
    } catch (e) {
        Swal.fire('خطأ', e.message, 'error');
        setSubmitLoading(btn, false);
        return;
    }
    payload.image_url = imageUrl;

    let menuUrl = document.getElementById('editPlaceMenu').value;
    try {
        const uploadedMenu = await uploadMenuImageIfNeeded('edit');
        if (uploadedMenu) menuUrl = uploadedMenu;
    } catch (e) {
        Swal.fire('خطأ', e.message, 'error');
        setSubmitLoading(btn, false);
        return;
    }
    payload.menu = menuUrl;
    try {
        const res = await fetch(`${API_URL}/api/places/${editingPlaceId}`, {
            method: 'PUT', headers: headers(), body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error((await res.json()).message || 'فشل الحفظ');
        Swal.fire({ icon: 'success', title: 'تم التحديث!', timer: 1500, showConfirmButton: false });
        closeEditPlaceModal();
        loadAdminPlaces();
    } catch (e) {
        Swal.fire('خطأ', e.message, 'error');
        setSubmitLoading(btn, false);
    }
}

// =====================================
// ✏️ Edit Category
// =====================================
let editingCatId = null;

function openEditCategoryModal(id, btn) {
    editingCatId = id;
    const parent = btn.closest('[data-name]') || btn;
    document.getElementById('editCatName').value = btn.dataset.name || '';
    document.getElementById('editCatIcon').value = btn.dataset.icon || 'bi-shop';
    document.getElementById('editCatOrder').value = btn.dataset.order || '0';
    document.getElementById('editCatNotes').value = btn.dataset.notes || '';
    document.getElementById('editCategoryModal').classList.add('show');
}

function closeEditCategoryModal() {
    document.getElementById('editCategoryModal').classList.remove('show');
    editingCatId = null;
}

async function submitEditCategory(e) {
    e.preventDefault();
    if (!editingCatId) return;
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    const payload = {
        name: document.getElementById('editCatName').value.trim(),
        icon: document.getElementById('editCatIcon').value.trim() || 'bi-shop',
        sortOrder: parseInt(document.getElementById('editCatOrder').value) || 0,
        notes: document.getElementById('editCatNotes').value.trim()
    };
    setSubmitLoading(btn, true);
    try {
        const res = await fetch(`${API_URL}/api/places/categories/${editingCatId}`, {
            method: 'PUT', headers: headers(), body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error((await res.json()).message || 'فشل الحفظ');
        Swal.fire({ icon: 'success', title: 'تم التحديث!', timer: 1500, showConfirmButton: false });
        closeEditCategoryModal();
        loadAdminCategories();
    } catch (e) {
        Swal.fire('خطأ', e.message, 'error');
        setSubmitLoading(btn, false);
    }
}

async function deletePlace(id, name) {
    const confirm = await Swal.fire({ title: `حذف "${name}"?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'حذف', cancelButtonText: 'إلغاء', confirmButtonColor: '#ef4444' });
    if (!confirm.isConfirmed) return;
    try {
        await fetch(`${API_URL}/api/places/${id}`, { method: 'DELETE', headers: headers() });
        Swal.fire({ icon: 'success', title: 'تم الحذف', timer: 1500, showConfirmButton: false });
        loadAdminPlaces();
    } catch (e) { Swal.fire('خطأ', 'فشل الحذف', 'error'); }
}

// =====================================
// ➕ Create Category
// =====================================
function openAddCategoryModal() {
    document.getElementById('addCategoryModal').style.display = 'flex';
}
function closeAddCategoryModal() {
    document.getElementById('addCategoryModal').style.display = 'none';
    document.getElementById('addCategoryForm').reset();
    document.getElementById('catNotes').value = '';
}

async function createCategory(e) {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    const name = document.getElementById('catName').value.trim();
    const icon = document.getElementById('catIcon').value.trim() || 'bi-shop';
    const sortOrder = parseInt(document.getElementById('catOrder').value) || 0;
    const notes = document.getElementById('catNotes').value.trim();

    setSubmitLoading(btn, true);
    try {
        const res = await fetch(`${API_URL}/api/places/categories`, {
            method: 'POST', headers: headers(),
            body: JSON.stringify({ name, icon, sortOrder, notes })
        });
        if (res.ok) {
            Swal.fire({ icon: 'success', title: 'تمت الإضافة!', timer: 1500, showConfirmButton: false });
            closeAddCategoryModal();
            loadAdminCategories();
        } else {
            const err = await res.json();
            Swal.fire('خطأ', err.message, 'error');
            setSubmitLoading(btn, false);
        }
    } catch (e) {
        Swal.fire('خطأ', 'فشل الاتصال', 'error');
        setSubmitLoading(btn, false);
    }
}

// =====================================
// 🖼️ Image Upload Helpers
// =====================================
function previewPlaceImage(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('placeImagePreviewImg').src = e.target.result;
        document.getElementById('placeImagePreview').style.display = 'block';
        document.getElementById('placeImageUploadLabel').style.borderColor = '#04553A';
    };
    reader.readAsDataURL(input.files[0]);
}

function clearPlaceImage() {
    const fileInput = document.getElementById('placeImageFile');
    if (fileInput) fileInput.value = '';
    const urlInput = document.getElementById('placeImageUrl');
    if (urlInput) urlInput.value = '';
    document.getElementById('placeImagePreviewImg').src = '';
    document.getElementById('placeImagePreview').style.display = 'none';
    const lbl = document.getElementById('placeImageUploadLabel');
    if (lbl) lbl.style.borderColor = '#d1d5db';
    document.getElementById('placeImage').value = '';
}

// Toggle between file upload and external URL modes
function setPlaceImageMode(mode) {
    const fileMode = document.getElementById('placeImgFileMode');
    const urlMode = document.getElementById('placeImgUrlMode');
    const btnFile = document.getElementById('placeImgModeFile');
    const btnUrl = document.getElementById('placeImgModeUrl');
    clearPlaceImage();
    if (mode === 'url') {
        fileMode.style.display = 'none';
        urlMode.style.display = 'block';
        btnFile.className = 'btn btn-outline-secondary btn-sm';
        btnUrl.className = 'btn btn-primary btn-sm';
    } else {
        fileMode.style.display = 'block';
        urlMode.style.display = 'none';
        btnFile.className = 'btn btn-primary btn-sm';
        btnUrl.className = 'btn btn-outline-secondary btn-sm';
    }
}

// Preview external image URL and store it in the hidden field
function previewPlaceImageUrl(url) {
    if (!url || !url.startsWith('http')) return;
    document.getElementById('placeImagePreviewImg').src = url;
    document.getElementById('placeImagePreview').style.display = 'block';
    document.getElementById('placeImage').value = url; // store directly
}

async function uploadPlaceImageIfNeeded() {
    // If external URL already set — skip upload, use it directly
    const existingUrl = document.getElementById('placeImage').value;
    if (existingUrl && existingUrl.startsWith('http')) return existingUrl;
    // If it's a relative server path, keep it
    if (existingUrl && existingUrl.startsWith('/uploads/')) return existingUrl;

    const fileInput = document.getElementById('placeImageFile');
    if (!fileInput.files || !fileInput.files[0]) return null;

    const formData = new FormData();
    formData.append('placeImage', fileInput.files[0]);

    const res = await fetch(`${API_URL}/api/upload/place-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken()}` },
        body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل رفع الصورة');
    
    // Update preview with full URL
    const _imgBase = window.API_URL || 'https://wajeezsd.com';
    const _isLocalImg = _imgBase.includes('localhost') || _imgBase.includes('127.0.0.1');
    const fullUrl = (!_isLocalImg && data.url.startsWith('/uploads')) ? _imgBase + '/api' + data.url : _imgBase + data.url;
    document.getElementById('placeImagePreviewImg').src = fullUrl;
    document.getElementById('placeImagePreview').style.display = 'block';
    return data.url;
}

// Menu uploading logic
function previewMenuImage(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('menuImagePreviewImg').src = e.target.result;
        document.getElementById('menuImagePreview').style.display = 'block';
        document.getElementById('menuImageUploadLabel').style.borderColor = '#ffc107'; // warning color
    };
    reader.readAsDataURL(input.files[0]);
}

function clearMenuImage() {
    const fileInput = document.getElementById('menuImageFile');
    if (fileInput) fileInput.value = '';
    const urlInput = document.getElementById('menuImageUrl');
    if (urlInput) urlInput.value = '';
    document.getElementById('menuImagePreviewImg').src = '';
    document.getElementById('menuImagePreview').style.display = 'none';
    const lbl = document.getElementById('menuImageUploadLabel');
    if (lbl) lbl.style.borderColor = '#ffc107';
    document.getElementById('placeMenu').value = '';
}

function setMenuImageMode(mode) {
    const fileMode = document.getElementById('menuImgFileMode');
    const urlMode = document.getElementById('menuImgUrlMode');
    const btnFile = document.getElementById('menuImgModeFile');
    const btnUrl = document.getElementById('menuImgModeUrl');
    clearMenuImage();
    if (mode === 'url') {
        fileMode.style.display = 'none';
        urlMode.style.display = 'block';
        btnFile.className = 'btn btn-outline-secondary btn-sm';
        btnUrl.className = 'btn btn-warning btn-sm text-dark';
    } else {
        fileMode.style.display = 'block';
        urlMode.style.display = 'none';
        btnFile.className = 'btn btn-warning btn-sm text-dark';
        btnUrl.className = 'btn btn-outline-secondary btn-sm';
    }
}

function previewMenuImageUrl(url) {
    if (!url || !url.startsWith('http')) return;
    document.getElementById('menuImagePreviewImg').src = url;
    document.getElementById('menuImagePreview').style.display = 'block';
    document.getElementById('placeMenu').value = url;
}

// Edit menu uploading logic
function previewEditMenuImage(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('editMenuImagePreviewImg').src = e.target.result;
        document.getElementById('editMenuImagePreview').style.display = 'block';
        document.getElementById('editMenuImageUploadLabel').style.borderColor = '#ffc107'; // warning color
    };
    reader.readAsDataURL(input.files[0]);
}

function clearEditMenuImage() {
    const fileInput = document.getElementById('editMenuImageFile');
    if (fileInput) fileInput.value = '';
    const urlInput = document.getElementById('editMenuImageUrl');
    if (urlInput) urlInput.value = '';
    document.getElementById('editMenuImagePreviewImg').src = '';
    document.getElementById('editMenuImagePreview').style.display = 'none';
    const lbl = document.getElementById('editMenuImageUploadLabel');
    if (lbl) lbl.style.borderColor = '#ffc107';
    document.getElementById('editPlaceMenu').value = '';
}

function setEditMenuImageMode(mode) {
    const fileMode = document.getElementById('editMenuImgFileMode');
    const urlMode = document.getElementById('editMenuImgUrlMode');
    const btnFile = document.getElementById('editMenuImgModeFile');
    const btnUrl = document.getElementById('editMenuImgModeUrl');
    clearEditMenuImage();
    if (mode === 'url') {
        fileMode.style.display = 'none';
        urlMode.style.display = 'block';
        btnFile.className = 'btn btn-outline-secondary btn-sm';
        btnUrl.className = 'btn btn-warning btn-sm text-dark';
    } else {
        fileMode.style.display = 'block';
        urlMode.style.display = 'none';
        btnFile.className = 'btn btn-warning btn-sm text-dark';
        btnUrl.className = 'btn btn-outline-secondary btn-sm';
    }
}

function previewEditMenuImageUrl(url) {
    if (!url || !url.startsWith('http')) return;
    document.getElementById('editMenuImagePreviewImg').src = url;
    document.getElementById('editMenuImagePreview').style.display = 'block';
    document.getElementById('editPlaceMenu').value = url;
}

async function uploadMenuImageIfNeeded(mode = 'add') {
    const valInputId = mode === 'edit' ? 'editPlaceMenu' : 'placeMenu';
    const fileInputId = mode === 'edit' ? 'editMenuImageFile' : 'menuImageFile';
    const previewImgId = mode === 'edit' ? 'editMenuImagePreviewImg' : 'menuImagePreviewImg';
    const previewDivId = mode === 'edit' ? 'editMenuImagePreview' : 'menuImagePreview';

    const existingUrl = document.getElementById(valInputId).value;
    if (existingUrl && (existingUrl.startsWith('http') || existingUrl.startsWith('/uploads/'))) return existingUrl;

    const fileInput = document.getElementById(fileInputId);
    if (!fileInput || !fileInput.files || !fileInput.files[0]) return null;

    const formData = new FormData();
    formData.append('placeImage', fileInput.files[0]);

    const res = await fetch(`${API_URL}/api/upload/place-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken()}` },
        body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل رفع صورة المنيو');
    
    // Update preview
    const _menuBase = window.API_URL || 'https://wajeezsd.com';
    const _isLocalMenu = _menuBase.includes('localhost') || _menuBase.includes('127.0.0.1');
    const fullUrl = (!_isLocalMenu && data.url.startsWith('/uploads')) ? _menuBase + '/api' + data.url : _menuBase + data.url;
    const pImg = document.getElementById(previewImgId);
    const pDiv = document.getElementById(previewDivId);
    if (pImg) pImg.src = fullUrl;
    if (pDiv) pDiv.style.display = 'block';
    document.getElementById(valInputId).value = data.url;
    
    return data.url;
}

// =====================================
// ➕ Create Place
// =====================================
// =====================================
// 👤 Owner Mode Toggle
// =====================================
function setOwnerMode(mode) {
    const newFields = document.getElementById('ownerNewFields');
    const noneInfo = document.getElementById('ownerNoneInfo');
    const btnNew = document.getElementById('ownerModeNew');
    const btnNone = document.getElementById('ownerModeNone');

    if (mode === 'new') {
        newFields.style.display = 'block';
        noneInfo.style.display = 'none';
        btnNew.className = 'btn btn-success btn-sm';
        btnNone.className = 'btn btn-outline-secondary btn-sm';
    } else {
        newFields.style.display = 'none';
        noneInfo.style.display = 'block';
        btnNew.className = 'btn btn-outline-secondary btn-sm';
        btnNone.className = 'btn btn-secondary btn-sm';
        // مسح حقول التاجر
        ['ownerName','ownerPhone','ownerEmail','ownerPassword','ownerBankAccount'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }
}

function openAddPlaceModal() {
    populateCategorySelect(); // refresh categories in select
    setOwnerMode('new'); // افتراضياً: تاجر جديد
    document.getElementById('addPlaceModal').style.display = 'flex';
}
function closeAddPlaceModal() {
    document.getElementById('addPlaceModal').style.display = 'none';
    document.getElementById('addPlaceForm').reset();
    clearMenuImage();
    clearPlaceImage();
    // مسح حقول التاجر
    ['ownerName','ownerPhone','ownerEmail','ownerPassword','ownerBankAccount'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    // تدمير الخريطة عند الإغلاق لتفادي خطأ "Map container is already initialized"
    adminPlaceMapInstance = null;
    document.getElementById('adminPlaceMapWrapper').style.display = 'none';
    document.getElementById('adminPlaceMapCoords').innerHTML = '';
    document.getElementById('coordsStatus').style.display = 'none';
}

async function createPlace(e) {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    const name = document.getElementById('placeName').value.trim();
    const category = document.getElementById('placeCategorySelect').value;
    const phone = document.getElementById('placePhone').value.trim();
    const whatsapp = document.getElementById('placeWhatsapp').value.trim();
    const address = document.getElementById('placeAddress').value.trim();
    const notes = document.getElementById('placeNotes').value.trim();
    const map_url = document.getElementById('placeMapUrl').value.trim();
    const city = document.getElementById('placeCity').value; // 🌍 City field
    const lat = parseFloat(document.getElementById('placeLat').value);
    const lng = parseFloat(document.getElementById('placeLng').value);
    const open = document.getElementById('placeOpen').value;
    const close = document.getElementById('placeClose').value;

    // 👤 بيانات التاجر
    const ownerMode = document.getElementById('ownerModeNew')?.classList.contains('btn-success') ? 'new' : 'none';
    const ownerName = document.getElementById('ownerName')?.value.trim() || '';
    const ownerPhone = document.getElementById('ownerPhone')?.value.trim() || '';
    const ownerEmail = document.getElementById('ownerEmail')?.value.trim() || '';
    const ownerPassword = document.getElementById('ownerPassword')?.value.trim() || '';
    const ownerBankAccount = document.getElementById('ownerBankAccount')?.value.trim() || '';

    if (!name || !category || !address) {
        Swal.fire('تنبيه', 'يرجى ملء الحقول الإلزامية (*): الاسم، التصنيف، العنوان', 'warning');
        return;
    }
    if (!map_url) {
        Swal.fire('تنبيه', 'يرجى إدخال رابط خرائط جوجل للمحل', 'warning');
        return;
    }

    // التحقق من بيانات التاجر إذا اختار "تاجر جديد"
    if (ownerMode === 'new') {
        if (!ownerName || !ownerPhone || !ownerPassword) {
            Swal.fire('تنبيه', 'يرجى إدخال اسم التاجر، هاتفه، وكلمة المرور — أو اختر "متجر بدون تاجر"', 'warning');
            return;
        }
        if (ownerPassword.length < 6) {
            Swal.fire('تنبيه', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'warning');
            return;
        }
    }

    setSubmitLoading(btn, true);

    // Upload image first if selected
    let image_url = document.getElementById('placeImage').value || '';
    try {
        const uploadedUrl = await uploadPlaceImageIfNeeded();
        if (uploadedUrl) image_url = uploadedUrl;
    } catch (uploadErr) {
        Swal.fire('خطأ', uploadErr.message, 'error');
        setSubmitLoading(btn, false);
        return;
    }

    let menu_url = document.getElementById('placeMenu').value || '';
    try {
        const uploadedMenuUrl = await uploadMenuImageIfNeeded('add');
        if (uploadedMenuUrl) menu_url = uploadedMenuUrl;
    } catch (uploadMenuErr) {
        Swal.fire('خطأ', uploadMenuErr.message, 'error');
        setSubmitLoading(btn, false);
        return;
    }

    // 🗺️ الموقع إلزامي عند الإنشاء — نرفض بدل الافتراضي الصامت (وسط الخرطوم)
    // الإحداثيات تُستخرج تلقائياً من رابط خرائط جوجل أو بتحريك الدبوس على الخريطة
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        Swal.fire('تنبيه', 'حدد موقع المتجر: الصق رابط خرائط جوجل كاملاً (تُستخرج الإحداثيات تلقائياً) أو حرّك الدبوس على الخريطة', 'warning');
        setSubmitLoading(btn, false);
        return;
    }
    const location = { lat, lng };

    const payload = {
        name, category, image_url, phone, whatsapp, address, map_url,
        notes, menu: menu_url,
        city, // 🌍 Add city to payload
        location,
        workingHours: { open, close, days: [0, 1, 2, 3, 4, 5, 6] }
    };

    // إضافة بيانات التاجر إلى الـ payload
    if (ownerMode === 'new' && ownerName && ownerPhone && ownerPassword) {
        payload.ownerName = ownerName;
        payload.ownerPhone = ownerPhone;
        payload.ownerPassword = ownerPassword;
        if (ownerEmail) payload.ownerEmail = ownerEmail;
        if (ownerBankAccount) payload.ownerBankAccount = ownerBankAccount;
    }

    try {
        const res = await fetch(`${API_URL}/api/places`, {
            method: 'POST', headers: headers(),
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const successMsg = (ownerMode === 'new' && ownerName)
                ? `تمت إضافة المتجر وإنشاء حساب التاجر "${ownerName}" بنجاح!`
                : 'تمت إضافة المحل بنجاح!';
            Swal.fire({ icon: 'success', title: successMsg, timer: 2500, showConfirmButton: false });
            closeAddPlaceModal();
            loadAdminPlaces();
        } else {
            const err = await res.json();
            Swal.fire('خطأ', err.message, 'error');
            setSubmitLoading(btn, false);
        }
    } catch (e) {
        Swal.fire('خطأ', 'فشل الاتصال', 'error');
        setSubmitLoading(btn, false);
    }
}

// ============================================================
// 🛒 Admin Product Management (منتجات المتجر داخل نافذة التعديل)
// ============================================================
let _adminProducts = [];

function _productFullImg(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const base = window.API_URL || 'https://wajeezsd.com';
    const withSlash = url.startsWith('/') ? url : '/' + url;
    const isLocal = base.includes('localhost') || base.includes('127.0.0.1');
    return (!isLocal && withSlash.startsWith('/uploads')) ? base + '/api' + withSlash : base + withSlash;
}

async function loadPlaceProducts() {
    const list = document.getElementById('placeProductsList');
    if (!editingPlaceId || !list) return;
    list.innerHTML = '<div class="text-center text-muted small py-2">جاري التحميل...</div>';
    try {
        const res = await fetch(`${API_URL}/api/places/${editingPlaceId}/products/admin`, { headers: headers() });
        _adminProducts = await res.json();
        renderPlaceProducts();
    } catch (e) {
        list.innerHTML = '<div class="text-center text-danger small py-2">فشل تحميل المنتجات</div>';
    }
}

function renderPlaceProducts() {
    const list = document.getElementById('placeProductsList');
    if (!list) return;
    const esc = window.escapeHtml || (s => s);
    if (!Array.isArray(_adminProducts) || !_adminProducts.length) {
        list.innerHTML = '<div class="text-center text-muted small py-3"><i class="fas fa-box-open me-1"></i> لا توجد منتجات بعد — أضف أول منتج</div>';
        return;
    }
    list.innerHTML = _adminProducts.map(p => {
        const img = p.image
            ? `<img src="${_productFullImg(p.image)}" style="width:46px;height:46px;object-fit:cover;border-radius:10px;flex-shrink:0;">`
            : `<div style="width:46px;height:46px;border-radius:10px;background:#eef2f1;display:flex;align-items:center;justify-content:center;color:#94a3b8;flex-shrink:0;"><i class="fas fa-box"></i></div>`;
        return `<div class="d-flex align-items-center gap-2 p-2 border rounded-3 mb-2 bg-white">
            ${img}
            <div class="flex-grow-1" style="min-width:0;">
                <div class="fw-bold text-truncate" style="font-size:13px;">${esc(p.name || '')}</div>
                <div class="small text-muted">${Number(p.price || 0).toLocaleString('en')} ج.س · ${esc(p.category || 'عام')}</div>
            </div>
            <span class="badge ${p.isAvailable ? 'bg-success' : 'bg-secondary'}">${p.isAvailable ? 'متوفر' : 'غير متوفر'}</span>
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="editProduct('${p._id}')"><i class="fas fa-pen"></i></button>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${p._id}')"><i class="fas fa-trash"></i></button>
        </div>`;
    }).join('');
}

function toggleProductForm(show) {
    const f = document.getElementById('productForm');
    if (!f) return;
    const willShow = show === undefined ? f.style.display === 'none' : show;
    f.style.display = willShow ? 'block' : 'none';
    if (!willShow) resetProductForm();
}

function resetProductForm() {
    ['productEditId', 'productName', 'productPrice', 'productCategory', 'productDesc', 'productImg'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const av = document.getElementById('productAvailable'); if (av) av.checked = true;
    const fi = document.getElementById('productImgFile'); if (fi) fi.value = '';
    const prev = document.getElementById('productImgPreview'); if (prev) { prev.src = ''; prev.style.display = 'none'; }
}

function previewProductImg(input) {
    if (!input.files || !input.files[0]) return;
    const r = new FileReader();
    r.onload = e => { const prev = document.getElementById('productImgPreview'); prev.src = e.target.result; prev.style.display = 'block'; };
    r.readAsDataURL(input.files[0]);
}

async function uploadProductImgIfNeeded() {
    const existing = document.getElementById('productImg').value;
    if (existing && (existing.startsWith('http') || existing.startsWith('/uploads'))) return existing;
    const fileInput = document.getElementById('productImgFile');
    if (!fileInput.files || !fileInput.files[0]) return existing || '';
    const fd = new FormData();
    fd.append('image', fileInput.files[0]);
    const res = await fetch(`${API_URL}/api/upload/product-image`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${adminToken()}` }, body: fd
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل رفع الصورة');
    return data.url;
}

async function saveProduct() {
    if (!editingPlaceId) return;
    const name = document.getElementById('productName').value.trim();
    const price = document.getElementById('productPrice').value;
    if (!name || price === '') { Swal.fire('تنبيه', 'الاسم والسعر مطلوبان', 'warning'); return; }
    const btn = document.getElementById('saveProductBtn');
    const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    try {
        const image = await uploadProductImgIfNeeded();
        const payload = {
            name, price: Number(price),
            category: document.getElementById('productCategory').value.trim() || 'عام',
            description: document.getElementById('productDesc').value.trim(),
            isAvailable: document.getElementById('productAvailable').checked,
            image
        };
        const editId = document.getElementById('productEditId').value;
        const url = editId
            ? `${API_URL}/api/places/${editingPlaceId}/products/${editId}`
            : `${API_URL}/api/places/${editingPlaceId}/products`;
        const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(payload) });
        if (!res.ok) throw new Error((await res.json()).message || 'فشل الحفظ');
        toggleProductForm(false);
        loadPlaceProducts();
    } catch (e) {
        Swal.fire('خطأ', e.message, 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = orig;
    }
}

function editProduct(id) {
    const p = _adminProducts.find(x => x._id === id);
    if (!p) return;
    document.getElementById('productEditId').value = p._id;
    document.getElementById('productName').value = p.name || '';
    document.getElementById('productPrice').value = (p.price ?? '');
    document.getElementById('productCategory').value = p.category || '';
    document.getElementById('productDesc').value = p.description || '';
    document.getElementById('productAvailable').checked = p.isAvailable !== false;
    document.getElementById('productImg').value = p.image || '';
    const prev = document.getElementById('productImgPreview');
    if (p.image) { prev.src = _productFullImg(p.image); prev.style.display = 'block'; }
    else { prev.src = ''; prev.style.display = 'none'; }
    const f = document.getElementById('productForm');
    f.style.display = 'block';
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteProduct(id) {
    const { isConfirmed } = await Swal.fire({
        icon: 'warning', title: 'حذف المنتج؟', text: 'لا يمكن التراجع.',
        showCancelButton: true, confirmButtonText: 'حذف', cancelButtonText: 'إلغاء', confirmButtonColor: '#ef4444'
    });
    if (!isConfirmed) return;
    try {
        const res = await fetch(`${API_URL}/api/places/${editingPlaceId}/products/${id}`, { method: 'DELETE', headers: headers() });
        if (!res.ok) throw new Error('فشل الحذف');
        loadPlaceProducts();
    } catch (e) {
        Swal.fire('خطأ', e.message, 'error');
    }
}
