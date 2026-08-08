/* ============================================
   Admin Dashboard JavaScript
   ============================================ */

// --- Auth Check ---
var token = localStorage.getItem('adminToken');
let userObj = null;
try { userObj = JSON.parse(localStorage.getItem('user')); } catch(e) {}
if (!token || !userObj || userObj.role !== 'admin') {
    window.location.href = 'admin-login.html';
}

const adminName = localStorage.getItem('adminName');
const adminNameEl = document.getElementById('adminName');
if (adminName && adminNameEl) adminNameEl.textContent = adminName;

let ordersChart, usersChart;

// --- Modal Functions ---
function openModal() { document.getElementById('captainModal').classList.add('show'); }
function closeModal() { document.getElementById('captainModal').classList.remove('show'); document.getElementById('addCaptainForm').reset(); }
function closeEditUserModal() { document.getElementById('editUserModal').classList.remove('show'); }
function closeEditOrderModal() { document.getElementById('editOrderModal').classList.remove('show'); }

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => {
        if (e.target === m) {
            m.classList.remove('show');
            if (m.id === 'editPlaceModal' && typeof window.closeEditPlaceModal === 'function') window.closeEditPlaceModal();
            if (m.id === 'addPlaceModal' && typeof window.closeAddPlaceModal === 'function') window.closeAddPlaceModal();
        }
    });
});


// --- Phone Normalize ---
function normalizePhone(phone) {
    let c = phone.replace(/[^0-9]/g, '');
    if (c.startsWith('2490')) { c = c.substring(4); return '249' + c; }
    if (c.startsWith('249') && c.length >= 12) return c;
    if (c.startsWith('0')) { c = c.substring(1); return '249' + c; }
    if (c.length === 9) return '249' + c;
    return '249' + c;
}

// --- Create Captain ---
async function createCaptain(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...'; btn.disabled = true;

    const captainData = {
        name: document.getElementById('capName').value,
        email: document.getElementById('capEmail').value,
        phone: normalizePhone(document.getElementById('capPhone').value),
        vehicleType: document.getElementById('capVehicle').value,
        password: document.getElementById('capPassword').value
    };

    try {
        const res = await fetch(`${API_URL}/api/admin/create-captain`, {
            method: 'POST', headers: { ...window.Auth.getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify(captainData)
        });
        const data = await res.json();
        if (res.ok) { Swal.fire({ icon: 'success', title: 'تم!', text: 'تم إضافة الكابتن', timer: 1500 }); closeModal(); loadUsers(); loadDashboard(); }
        else Swal.fire({ icon: 'error', title: 'خطأ', text: data.message || 'حدث خطأ' });
    } catch { Swal.fire({ icon: 'error', title: 'خطأ', text: 'خطأ في الاتصال' }); }
    finally { btn.innerHTML = orig; btn.disabled = false; }
}

// --- Status HTML ---
function getStatusHtml(status) {
    const map = {
        'pending': { text: '⏳ انتظار', cls: 'badge-warning' },
        'accepted': { text: '🚴 جاري التوصيل', cls: 'badge-info' },
        'picked_up': { text: '📦 تم الاستلام', cls: 'badge-primary' },
        'delivered': { text: '✅ تم التسليم', cls: 'badge-success' },
        'cancelled': { text: '❌ ملغي', cls: 'badge-danger' }
    };
    const info = map[status] || { text: status, cls: 'badge-info' };
    return `<span class="badge ${info.cls}">${info.text}</span>`;
}

// --- Animate Counter ---
function animateValue(id, start, end, duration, suffix = '') {
    const obj = document.getElementById(id);
    if (!obj || end === 0) { if (obj) obj.textContent = '0' + suffix; return; }
    const range = end - start;
    const stepTime = Math.max(Math.abs(Math.floor(duration / range)), 10);
    let current = start;
    const timer = setInterval(() => {
        current += (end > start ? 1 : -1);
        obj.textContent = current.toLocaleString() + suffix;
        if (current == end) clearInterval(timer);
    }, stepTime);
}

// --- Load Dashboard ---
async function loadDashboard() {
    try {
        const el = document.getElementById('total-revenue');
        if (!el) return; // Not on dashboard page
        const res = await fetch(`${API_URL}/api/admin/dashboard`, { headers: window.Auth.getAuthHeader() });
        if (res.status === 403) { Swal.fire({ icon: 'error', title: 'غير مصرح', text: 'غير مصرح لك!' }).then(() => logout()); return; }
        const data = await res.json();
        
        // Render City Breakdown
        if (document.getElementById('cityBreakdownContainer')) {
            const container = document.getElementById('cityBreakdownContainer');
            const breakdown = data.cityBreakdown && data.cityBreakdown.length > 0
                ? data.cityBreakdown
                : [
                    { city: 'Khartoum',  captains: 0, clients: 0, orders: 0, revenue: 0 },
                    { city: 'PortSudan', captains: 0, clients: 0, orders: 0, revenue: 0 }
                  ];

            container.innerHTML = '';
            breakdown.forEach(cityData => {
                const cityKey   = cityData.city || cityData._id;
                const isKhartoum = cityKey === 'Khartoum';
                const label     = isKhartoum ? 'الخرطوم - أم درمان' : 'البحر الأحمر - بورتسودان';
                const faIcon    = isKhartoum
                    ? '<i class="fas fa-city" style="margin-left:6px;color:#2563eb;"></i>'
                    : '<i class="fas fa-anchor" style="margin-left:6px;color:#0ea5e9;"></i>';
                const accentTop = isKhartoum ? '#2563eb' : '#0ea5e9';
                const clients  = cityData.clients  ?? cityData.users ?? 0;
                const captains = cityData.captains ?? 0;
                const orders   = cityData.orders   ?? 0;
                const revenue  = cityData.revenue  ?? 0;
                container.innerHTML += `
                    <div style="flex:1; min-width:210px; background:#fff; border:1px solid #e2e8f0; border-top:4px solid ${accentTop}; border-radius:14px; padding:18px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,.05);">
                        <h5 style="margin:0 0 14px; font-weight:800; font-size:14px; color:#1e293b;">${faIcon}${label}</h5>
                        <div style="display:flex; justify-content:space-around; font-size:0.88rem; color:#64748b; gap:8px;">
                            <div style="background:#f8fafc;border-radius:8px;padding:8px 12px;">
                                <strong style="display:block;font-size:1.3rem;color:#2563eb;">${clients}</strong>عملاء
                            </div>
                            <div style="background:#f8fafc;border-radius:8px;padding:8px 12px;">
                                <strong style="display:block;font-size:1.3rem;color:#16a34a;">${captains}</strong>كباتن
                            </div>
                            <div style="background:#f8fafc;border-radius:8px;padding:8px 12px;">
                                <strong style="display:block;font-size:1.3rem;color:#ea580c;">${orders}</strong>طلبات
                            </div>
                        </div>
                        <div style="margin-top:12px;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:10px;">
                            الإيرادات: <strong style="color:#7c3aed;">${revenue.toLocaleString()} ج.س</strong>
                        </div>
                    </div>
                `;
            });
        }

        if (data.stats) {
            animateValue('count-customers', 0, data.stats.customers || 0, 1000);
            animateValue('count-captains', 0, data.stats.captains || 0, 1000);
            animateValue('count-orders', 0, data.stats.orders || 0, 1000);
            el.textContent = (data.stats.revenue || 0).toLocaleString() + ' ج.س';
            updateCharts(data);
        }
    } catch (err) { console.error('Dashboard error:', err); }
}

// --- Charts ---
function updateCharts(data) {
    const ordersCtx = document.getElementById('ordersChart').getContext('2d');
    if (ordersChart) ordersChart.destroy();
    ordersChart = new Chart(ordersCtx, {
        type: 'bar',
        data: {
            labels: ['انتظار', 'جاري', 'تم التسليم', 'ملغي'],
            datasets: [{
                label: 'الطلبات', data: [
                    data.ordersByStatus?.pending || 0, data.ordersByStatus?.accepted || 0,
                    data.ordersByStatus?.delivered || 0, data.ordersByStatus?.cancelled || 0
                ], backgroundColor: ['rgba(245,158,11,0.7)', 'rgba(6,182,212,0.7)', 'rgba(16,185,129,0.7)', 'rgba(239,68,68,0.7)'],
                borderRadius: 8, borderSkipped: false
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });

    const usersCtx = document.getElementById('usersChart').getContext('2d');
    if (usersChart) usersChart.destroy();
    usersChart = new Chart(usersCtx, {
        type: 'doughnut',
        data: {
            labels: ['العملاء', 'الكباتن'],
            datasets: [{
                data: [data.stats?.customers || 0, data.stats?.captains || 0],
                backgroundColor: ['rgba(99,102,241,0.8)', 'rgba(245,158,11,0.8)'], borderWidth: 0
            }]
        },
        options: { responsive: true, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
    });
}

// --- Load All Orders ---
async function loadAllOrders() {
    if (!document.getElementById('allOrdersTable')) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/orders`, { headers: window.Auth.getAuthHeader() });
        const orders = await res.json();
        if ($.fn.DataTable && $.fn.DataTable.isDataTable('#allOrdersTable')) $('#allOrdersTable').DataTable().destroy();

        const tableData = orders.map(order => {
            const clientName = window.escapeHtml(order.client?.name || order.customer?.name || 'غير معروف');
            const captainName = window.escapeHtml(order.captain?.name || '---');
            const pickup = window.escapeHtml(order.pickup?.address || order.pickupLocation || 'غير محدد');
            const dropoff = window.escapeHtml(order.dropoff?.address || order.dropoffLocation || 'غير محدد');
            const orderStr = encodeURIComponent(JSON.stringify(order));
            return [clientName, captainName, pickup, dropoff, order.price + ' ج.س', getStatusHtml(order.status),
                `<div style="display:flex;gap:6px;justify-content:center;">
                    <button class="btn-icon edit" onclick="openEditOrderModal('${orderStr}')" title="تعديل"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete" onclick="deleteOrder('${order._id}')" title="حذف"><i class="fas fa-trash"></i></button>
                </div>`
            ];
        });

        $('#allOrdersTable').DataTable({
            data: tableData, pageLength: 10, order: [[0, 'desc']],
            language: { sProcessing: "جارٍ التحميل...", sLengthMenu: "أظهر _MENU_", sZeroRecords: "لا توجد نتائج", sInfo: "_START_-_END_ من _TOTAL_", sInfoEmpty: "0", sSearch: "بحث:", oPaginate: { sFirst: "الأول", sPrevious: "السابق", sNext: "التالي", sLast: "الأخير" } }
        });
    } catch (err) { console.error("Orders error:", err); }
}

// --- Load Users ---
async function loadUsers() {
    if (!document.getElementById('usersTable')) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/users`, { headers: window.Auth.getAuthHeader() });
        const users = await res.json();
        const usersList = Array.isArray(users) ? users : (users.users || []);
        if ($.fn.DataTable && $.fn.DataTable.isDataTable('#usersTable')) $('#usersTable').DataTable().destroy();

        const tableData = usersList.map(user => {
            const roleMap = { captain: { icon: '🚴', text: 'كابتن', color: '#d97706' }, admin: { icon: '👑', text: 'أدمن', color: '#7c3aed' }, client: { icon: '👤', text: 'عميل', color: '#6366f1' } };
            const r = roleMap[user.role] || roleMap.client;
            const userStr = encodeURIComponent(JSON.stringify(user));
            return [
                window.escapeHtml(user.name || ''), window.escapeHtml(user.phone || user.email || '---'),
                `<span style="font-weight:600;color:${r.color}">${r.icon} ${r.text}</span>`,
                `<span class="badge ${user.isActive ? 'badge-success' : 'badge-danger'}">${user.isActive ? 'نشط' : 'معطل'}</span>`,
                `<div style="display:flex;gap:6px;justify-content:center;">
                    <button class="btn-icon ${user.isActive ? 'toggle-on' : 'toggle-off'}" onclick="toggleUserStatus('${user._id}')" title="${user.isActive ? 'تجميد' : 'تفعيل'}"><i class="fas ${user.isActive ? 'fa-ban' : 'fa-check'}"></i></button>
                    <button class="btn-icon edit" onclick="openEditUserModal('${userStr}')" title="تعديل"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete" onclick="deleteUser('${user._id}')" title="حذف"><i class="fas fa-trash"></i></button>
                </div>`
            ];
        });

        $('#usersTable').DataTable({
            data: tableData, pageLength: 10, order: [[0, 'asc']],
            language: { sProcessing: "جارٍ التحميل...", sLengthMenu: "أظهر _MENU_", sZeroRecords: "لا توجد نتائج", sInfo: "_START_-_END_ من _TOTAL_", sInfoEmpty: "0", sSearch: "بحث:", oPaginate: { sFirst: "الأول", sPrevious: "السابق", sNext: "التالي", sLast: "الأخير" } }
        });
    } catch (err) { console.error(err); }
}

// --- Toggle / Delete User ---
async function toggleUserStatus(id) {
    const r = await Swal.fire({ title: 'تأكيد', text: 'تغيير حالة المستخدم؟', icon: 'warning', showCancelButton: true, confirmButtonText: 'نعم', cancelButtonText: 'إلغاء' });
    if (!r.isConfirmed) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/user/${id}/status`, { method: 'PUT', headers: window.Auth.getAuthHeader() });
        if (res.ok) { Swal.fire({ icon: 'success', title: 'تم', timer: 1200, showConfirmButton: false }); loadUsers(); loadDashboard(); }
        else Swal.fire('خطأ', 'حدث خطأ', 'error');
    } catch { Swal.fire('خطأ', 'خطأ في الاتصال', 'error'); }
}

async function deleteUser(id) {
    const r = await Swal.fire({ title: 'حذف نهائي؟', text: 'لا يمكن التراجع!', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'نعم احذف', cancelButtonText: 'إلغاء' });
    if (!r.isConfirmed) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/users/${id}`, { method: 'DELETE', headers: window.Auth.getAuthHeader() });
        if (res.ok) { Swal.fire('تم', 'تم الحذف', 'success'); loadUsers(); }
        else { const d = await res.json(); Swal.fire('خطأ', d.message || 'فشل', 'error'); }
    } catch { Swal.fire('خطأ', 'خطأ في الاتصال', 'error'); }
}

// --- Edit User ---
function openEditUserModal(userStr) {
    const u = JSON.parse(decodeURIComponent(userStr));
    document.getElementById('editUserId').value = u._id;
    document.getElementById('editUserName').value = u.name;
    document.getElementById('editUserEmail').value = u.email || '';
    document.getElementById('editUserPhone').value = u.phone || '';
    document.getElementById('editUserRole').value = u.role;
    document.getElementById('editUserPassword').value = '';
    toggleVehicleField();
    if (u.vehicleType) document.getElementById('editUserVehicle').value = u.vehicleType;

    // 📷 صورة البروفايل: اعرض الحالية (إن وُجدت) وأفرغ حقل الملف
    const fileInput = document.getElementById('editUserPhotoFile');
    if (fileInput) fileInput.value = '';
    const preview = document.getElementById('editUserPhotoPreview');
    const placeholder = document.getElementById('editUserPhotoPlaceholder');
    const currentPhoto = u.documents && u.documents.profilePhoto;
    if (preview && placeholder) {
        if (currentPhoto) {
            preview.src = (currentPhoto.startsWith('http') ? '' : API_URL) + currentPhoto;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            preview.style.display = 'none';
            placeholder.style.display = 'flex';
        }
    }

    document.getElementById('editUserModal').classList.add('show');
}

function toggleVehicleField() {
    const isCaptain = document.getElementById('editUserRole').value === 'captain';
    document.getElementById('editVehicleGroup').style.display = isCaptain ? 'block' : 'none';
    // مجموعة صورة البروفايل تظهر للكباتن فقط
    const photoGroup = document.getElementById('editPhotoGroup');
    if (photoGroup) photoGroup.style.display = isCaptain ? 'block' : 'none';
}

// 📤 يرفع صورة بروفايل الكابتن المختار إلى endpoint الإدارة (إن اختير ملف)
async function uploadCaptainPhotoIfSelected(userId) {
    const fileInput = document.getElementById('editUserPhotoFile');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) return; // لا صورة مختارة
    const fd = new FormData();
    fd.append('photo', fileInput.files[0]);
    const res = await fetch(`${API_URL}/api/upload/admin/captain-photo/${userId}`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }, // بدون Content-Type — المتصفح يضبط boundary
        body: fd
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'فشل رفع الصورة');
    }
}

async function updateUser(e) {
    e.preventDefault();
    const id = document.getElementById('editUserId').value;
    const body = {
        name: document.getElementById('editUserName').value, email: document.getElementById('editUserEmail').value,
        phone: document.getElementById('editUserPhone').value, role: document.getElementById('editUserRole').value,
        password: document.getElementById('editUserPassword').value || undefined
    };
    if (body.role === 'captain') body.vehicleType = document.getElementById('editUserVehicle').value;
    try {
        const res = await fetch(`${API_URL}/api/admin/users/${id}`, { method: 'PUT', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { Swal.fire('خطأ', 'فشل التحديث', 'error'); return; }
        // 📷 ارفع صورة الكابتن بعد نجاح حفظ البيانات (إن اختيرت)
        await uploadCaptainPhotoIfSelected(id);
        Swal.fire('تم', 'تم التحديث', 'success'); closeEditUserModal(); loadUsers();
    } catch (err) { Swal.fire('خطأ', err.message || 'خطأ في الاتصال', 'error'); }
}

// --- Edit/Delete Order ---
function openEditOrderModal(orderStr) {
    const o = JSON.parse(decodeURIComponent(orderStr));
    document.getElementById('editOrderId').value = o._id;
    document.getElementById('editOrderStatus').value = o.status;
    document.getElementById('editOrderPrice').value = o.price;
    document.getElementById('editOrderPickup').value = o.pickup?.address || o.pickupLocation || '';
    document.getElementById('editOrderDropoff').value = o.dropoff?.address || o.dropoffLocation || '';
    document.getElementById('editOrderModal').classList.add('show');
}

async function updateOrder(e) {
    e.preventDefault();
    const id = document.getElementById('editOrderId').value;
    const body = {
        status: document.getElementById('editOrderStatus').value, price: document.getElementById('editOrderPrice').value,
        pickup: { address: document.getElementById('editOrderPickup').value }, dropoff: { address: document.getElementById('editOrderDropoff').value }
    };
    try {
        const res = await fetch(`${API_URL}/api/admin/orders/${id}`, { method: 'PUT', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) { Swal.fire('تم', 'تم التحديث', 'success'); closeEditOrderModal(); loadAllOrders(); loadDashboard(); }
        else Swal.fire('خطأ', 'فشل', 'error');
    } catch { Swal.fire('خطأ', 'خطأ في الاتصال', 'error'); }
}

async function deleteOrder(id) {
    const r = await Swal.fire({ title: 'حذف الطلب؟', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'حذف', cancelButtonText: 'إلغاء' });
    if (!r.isConfirmed) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/orders/${id}`, { method: 'DELETE', headers: window.Auth.getAuthHeader() });
        if (res.ok) { Swal.fire('تم', 'تم الحذف', 'success'); loadAllOrders(); loadDashboard(); }
        else Swal.fire('خطأ', 'فشل الحذف', 'error');
    } catch { Swal.fire('خطأ', 'خطأ في الاتصال', 'error'); }
}


// --- Pending Captains ---
async function loadPendingCaptains() {
    const container = document.getElementById('pendingCaptainsContainer');
    if (!container) return; // Not on dashboard page
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await fetch(`${API_URL}/api/admin/pending-captains`, { headers: window.Auth.getAuthHeader() });
        const captains = await res.json();
        const list = Array.isArray(captains) ? captains : (captains.captains || []);

        if (list.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>لا توجد طلبات معلقة</p></div>';
            return;
        }

        container.innerHTML = list.map(c => `
            <div class="captain-card" id="captain-card-${c._id}">
                <div class="captain-avatar">${window.escapeHtml(c.name ? c.name.charAt(0) : '?')}</div>
                <div class="captain-info">
                    <h4>${window.escapeHtml(c.name)}</h4>
                    <p><i class="fas fa-phone"></i> ${window.escapeHtml(c.phone || c.email || '---')}</p>
                    <p><i class="fas fa-motorcycle"></i> ${window.escapeHtml(c.vehicleType || 'غير محدد')}</p>
                </div>
                <div class="captain-actions">
                    <button class="btn-icon approve" onclick="approveCaptain('${c._id}')" title="قبول"><i class="fas fa-check"></i></button>
                    <button class="btn-icon reject" onclick="rejectCaptain('${c._id}')" title="رفض"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>خطأ في التحميل</p></div>';
        console.error(err);
    }
}

async function approveCaptain(id) {
    try {
        const res = await fetch(`${API_URL}/api/admin/approve-captain/${id}`, { method: 'PUT', headers: window.Auth.getAuthHeader() });
        if (res.ok) { Swal.fire('تم القبول!', '', 'success'); loadPendingCaptains(); }
        else Swal.fire('خطأ', 'فشل', 'error');
    } catch { Swal.fire('خطأ', 'خطأ في الاتصال', 'error'); }
}

async function rejectCaptain(id) {
    const { value: reason } = await Swal.fire({ title: 'سبب الرفض', input: 'textarea', inputPlaceholder: 'أدخل السبب...', showCancelButton: true, confirmButtonText: 'رفض', cancelButtonText: 'إلغاء', confirmButtonColor: '#ef4444', inputValidator: v => !v && 'أدخل السبب' });
    if (!reason) return;
    try {
        const res = await fetch(`${API_URL}/api/admin/reject-captain/${id}`, { method: 'PUT', headers: { ...window.Auth.getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
        if (res.ok) { Swal.fire('تم الرفض', '', 'info'); loadPendingCaptains(); }
        else Swal.fire('خطأ', 'فشل', 'error');
    } catch { Swal.fire('خطأ', 'خطأ في الاتصال', 'error'); }
}

// --- 🔔 Send Broadcast Notification ---
let selectedTarget = 'all';

function selectTarget(el, target) {
    selectedTarget = target;
    document.querySelectorAll('.target-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
}

async function sendBroadcastNotification() {
    const title = document.getElementById('notifTitle').value.trim();
    const message = document.getElementById('notifMessage').value.trim();

    if (!title || !message) { Swal.fire({ icon: 'warning', text: 'أدخل العنوان والرسالة' }); return; }

    const btn = document.getElementById('sendNotifBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...'; btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/api/admin/send-notification`, {
            method: 'POST',
            headers: { ...window.Auth.getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, message, target: selectedTarget })
        });
        const data = await res.json();

        if (res.ok) {
            Swal.fire({ icon: 'success', title: 'تم الإرسال! 🎉', html: `<p>تم إرسال الإشعار إلى <b>${data.sentTo}</b> مستخدم</p><p>Push: <b>${data.pushSent || 0}</b></p>`, confirmButtonText: 'ممتاز' });
            document.getElementById('notifTitle').value = '';
            document.getElementById('notifMessage').value = '';
        } else {
            Swal.fire({ icon: 'error', title: 'خطأ', text: data.message || 'فشل الإرسال' });
        }
    } catch { Swal.fire({ icon: 'error', title: 'خطأ', text: 'خطأ في الاتصال بالسيرفر' }); }
    finally { btn.innerHTML = orig; btn.disabled = false; }
}

// --- Navigation ---
function scrollToSection(id, btn) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Highlight active nav item
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const clickedBtn = btn || (typeof event !== 'undefined' && event?.target?.closest?.('.nav-item'));
    if (clickedBtn) clickedBtn.closest('.nav-item')?.classList?.add('active') || clickedBtn.classList?.add('active');
    // Close sidebar on mobile
    if (window.innerWidth <= 991) {
        document.getElementById('sidebar').classList.remove('show');
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) overlay.classList.remove('show');
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('show');
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) overlay.classList.toggle('show');
}

function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminName');
    localStorage.removeItem('token');
    window.location.href = 'admin-login.html';
}

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    // ⚠️ admin.html تحمّل هذا الملفّ و admin-panel.js معاً، وبينهما ثماني
    // دوال بنفس الاسم في النطاق العام — فتطمس نسخةُ الثاني نسخةَ الأول.
    // استدعاؤها من هنا أيضاً كان يُنفّذ نسخة admin-panel مرّتين: نداءان
    // لـ dashboard ولـ orders/live ولـ active-captains عند كل فتح.
    // حين يتولّى admin-panel.js الصفحة نتنحّى عن التهيئة — دوالّنا هنا
    // مطموسة أصلاً فلا فائدة من نداء يكرّر عمل غيرنا.
    if (window.__adminPanelOwnsPage) return;

    loadDashboard();
    loadUsers();
    loadAllOrders();
    setTimeout(loadPendingCaptains, 1000);
});
