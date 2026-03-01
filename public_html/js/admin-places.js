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

// =====================================
// 🗺️ Admin Place Map — خريطة قمر صناعي كالتطبيق
// =====================================
function initAdminPlaceMap(lat, lng) {
    const wrapper = document.getElementById('adminPlaceMapWrapper');
    wrapper.style.display = 'block';

    // إتلاف الخريطة القديمة إن وجدت
    if (adminPlaceMapInstance) {
        adminPlaceMapInstance.remove();
        adminPlaceMapInstance = null;
    }

    // إعادة إنشاء div الخريطة (لتفادي "Map container is already initialized")
    const mapDiv = document.getElementById('adminPlaceMap');
    mapDiv.innerHTML = '';

    adminPlaceMapInstance = L.map('adminPlaceMap', {
        zoomControl: true,
        attributionControl: false
    }).setView([lat, lng], 17);

    // نفس طبقات التطبيق الرئيسي
    const darkLayer = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 19, subdomains: 'abcd' }
    );
    const googleHybrid = L.tileLayer(
        'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
        { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google' }
    ).addTo(adminPlaceMapInstance);

    L.control.layers(
        { '🛰️ قمر صناعي': googleHybrid, '🌙 الوضع الليلي': darkLayer },
        null, { position: 'topright' }
    ).addTo(adminPlaceMapInstance);

    // عند تحريك الخريطة — تحديث الإحداثيات تلقائياً
    adminPlaceMapInstance.on('moveend', () => {
        const center = adminPlaceMapInstance.getCenter();
        const latVal = center.lat.toFixed(6);
        const lngVal = center.lng.toFixed(6);
        document.getElementById('placeLat').value = latVal;
        document.getElementById('placeLng').value = lngVal;
        document.getElementById('adminPlaceMapCoords').innerHTML =
            `<i class="fas fa-crosshairs text-success me-1"></i> <strong>Lat:</strong> ${latVal} | <strong>Lng:</strong> ${lngVal}`;
    });

    // إصلاح البلاطات الرمادية بعد تهيئة الـ modal
    setTimeout(() => adminPlaceMapInstance.invalidateSize(), 300);
}

function adminMapLocateMe() {
    if (!navigator.geolocation) return alert('المتصفح لا يدعم GPS');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            if (adminPlaceMapInstance) {
                adminPlaceMapInstance.setView([pos.coords.latitude, pos.coords.longitude], 17);
            } else {
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
                    data-name="${cat.name}" data-icon="${cat.icon}" data-order="${cat.sortOrder || 0}"
                    style="background:#0a8754;border:none;color:white;cursor:pointer;padding:4px 10px;border-radius:8px;font-size:12px;">
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
        const res = await fetch(`${API_URL}/api/places`, { headers: headers() });
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
        // Base64 images (uploaded from device) — return as-is
        if (url.startsWith('data:image')) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        const base = window.API_URL || 'https://wassili.site';
        return url.startsWith('/') ? base + url : base + '/' + url;
    };

    tbody.innerHTML = places.map(p => `
        <tr>
            <td>
                ${p.image_url ? `<img src="${getFullImageUrl(p.image_url)}" style="width:36px;height:36px;border-radius:8px;object-fit:cover;margin-left:8px;vertical-align:middle;">` : ''}
                <strong>${p.name}</strong>
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
        document.getElementById('editPlaceOpen').value = p.workingHours?.open || '08:00';
        document.getElementById('editPlaceClose').value = p.workingHours?.close || '22:00';
        document.getElementById('editPlaceIsOpen').value = p.is_open ? '1' : '0'; // manual override
        document.getElementById('editPlaceLat').value = p.location?.lat || '';
        document.getElementById('editPlaceLng').value = p.location?.lng || '';

        document.getElementById('editPlaceModal').classList.add('show');

        // Init map after modal shown
        setTimeout(() => {
            const lat = p.location?.lat || 15.5007;
            const lng = p.location?.lng || 32.5599;
            // Destroy old instance
            if (editPlaceMapInstance) { editPlaceMapInstance.remove(); editPlaceMapInstance = null; }
            document.getElementById('editPlaceMap').innerHTML = '';

            editPlaceMapInstance = L.map('editPlaceMap', { zoomControl: true, attributionControl: false }).setView([lat, lng], 17);

            const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
                { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'] }).addTo(editPlaceMapInstance);
            const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                { maxZoom: 19, subdomains: 'abcd' });
            L.control.layers({ '🛰️ قمر صناعي': googleHybrid, '🌙 الوضع الليلي': darkLayer }, null, { position: 'topright' }).addTo(editPlaceMapInstance);

            editPlaceMapInstance.on('moveend', () => {
                const c = editPlaceMapInstance.getCenter();
                document.getElementById('editPlaceLat').value = c.lat.toFixed(6);
                document.getElementById('editPlaceLng').value = c.lng.toFixed(6);
                document.getElementById('editPlaceMapCoords').innerHTML =
                    `<i class="fas fa-crosshairs text-success me-1"></i> <strong>${c.lat.toFixed(5)}</strong>, <strong>${c.lng.toFixed(5)}</strong>`;
            });

            setTimeout(() => editPlaceMapInstance.invalidateSize(), 300);
        }, 200);

    } catch (e) {
        Swal.fire('خطأ', e.message, 'error');
    }
}

function closeEditPlaceModal() {
    document.getElementById('editPlaceModal').classList.remove('show');
    if (editPlaceMapInstance) { editPlaceMapInstance.remove(); editPlaceMapInstance = null; }
    editingPlaceId = null;
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
        location: { lat: isNaN(lat) ? 15.5007 : lat, lng: isNaN(lng) ? 32.5599 : lng },
        workingHours: {
            open: document.getElementById('editPlaceOpen').value,
            close: document.getElementById('editPlaceClose').value,
            days: [0, 1, 2, 3, 4, 5, 6]
        }
    };

    setSubmitLoading(btn, true);
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
        sortOrder: parseInt(document.getElementById('editCatOrder').value) || 0
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
}

async function createCategory(e) {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    const name = document.getElementById('catName').value.trim();
    const icon = document.getElementById('catIcon').value.trim() || 'bi-shop';
    const sortOrder = parseInt(document.getElementById('catOrder').value) || 0;

    setSubmitLoading(btn, true);
    try {
        const res = await fetch(`${API_URL}/api/places/categories`, {
            method: 'POST', headers: headers(),
            body: JSON.stringify({ name, icon, sortOrder })
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
        document.getElementById('placeImageUploadLabel').style.borderColor = '#0a8754';
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
    return data.url;
}

// =====================================
// ➕ Create Place
// =====================================
function openAddPlaceModal() {
    populateCategorySelect(); // refresh categories in select
    document.getElementById('addPlaceModal').style.display = 'flex';
}
function closeAddPlaceModal() {
    document.getElementById('addPlaceModal').style.display = 'none';
    document.getElementById('addPlaceForm').reset();
    // تدمير الخريطة عند الإغلاق لتفادي خطأ "Map container is already initialized"
    if (adminPlaceMapInstance) {
        adminPlaceMapInstance.remove();
        adminPlaceMapInstance = null;
    }
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
    const map_url = document.getElementById('placeMapUrl').value.trim();
    const lat = parseFloat(document.getElementById('placeLat').value);
    const lng = parseFloat(document.getElementById('placeLng').value);
    const open = document.getElementById('placeOpen').value;
    const close = document.getElementById('placeClose').value;

    if (!name || !category || !address) {
        Swal.fire('تنبيه', 'يرجى ملء الحقول الإلزامية (*): الاسم، التصنيف، العنوان', 'warning');
        return;
    }
    if (!map_url) {
        Swal.fire('تنبيه', 'يرجى إدخال رابط خرائط جوجل للمحل', 'warning');
        return;
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

    const location = { lat: isNaN(lat) ? 15.5007 : lat, lng: isNaN(lng) ? 32.5599 : lng };

    const payload = {
        name, category, image_url, phone, whatsapp, address, map_url,
        location,
        workingHours: { open, close, days: [0, 1, 2, 3, 4, 5, 6] }
    };

    try {
        const res = await fetch(`${API_URL}/api/places`, {
            method: 'POST', headers: headers(),
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            Swal.fire({ icon: 'success', title: 'تمت إضافة المحل!', timer: 1500, showConfirmButton: false });
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
