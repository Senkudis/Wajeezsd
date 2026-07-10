// ============================================================
// Admin Panel — Main Controller
// ============================================================

var token = localStorage.getItem('adminToken') || localStorage.getItem('token');
if (!token) window.location.href = 'admin-login.html';

const BASE = window.API_URL || 'https://wajeezsd.com';
const headers = () => ({ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' });

//  Format numbers in English (not Arabic ٠١٢٣)
function fmtNum(n) { return Number(n || 0).toLocaleString('en'); }

// ── State ──
let allOrders = [];
let allUsers = [];
let allCaptains = [];
let notifications = [];
let gvMap = null;
let miniMapInstance = null;
let captainMarkers = {};
let currentPage = 'overview';

// ── Browser Push Notifications (Notification API) ──
// Works even when the tab is in the background — no Firebase Web SDK needed!
function requestBrowserNotifPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(p =>
            console.log('[Admin] Notification permission:', p)
        );
    }
}

function showBrowserNotif(title, body, orderId) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        const notif = new Notification(title, {
            body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            tag: orderId ? `order-${orderId}` : 'admin-alert',  // prevents duplicates
            renotify: true,
            requireInteraction: false
        });
        // Click → focus the admin tab
        notif.onclick = () => {
            window.focus();
            notif.close();
            if (orderId) viewOrder(orderId);
        };
        // Auto-close after 8 seconds
        setTimeout(() => notif.close(), 8000);
    } catch(e) { console.warn('[Admin] Browser notif failed:', e); }
}

// ── Socket.io ──
const socket = io(BASE, { transports: ['polling', 'websocket'], reconnection: true, reconnectionDelay: 2000 });

// Request notification permission as soon as the page loads
document.addEventListener('DOMContentLoaded', requestBrowserNotifPermission);

socket.on('connect', () => {
    console.log(' Admin Socket connected:', socket.id);
    socket.emit('admin_join');
    // Join admin's personal room for targeted notifications
    socket.emit('user_join', getAdminId());
});

// Listen for new orders (emitted to all)
socket.on('new_order_available', (data) => {
    const msg = `طلب توصيل جديد بسعر ${data.price || '?'} ج.س`;
    showToast(`🆕 طلب جديد — ${data.pickup || 'طلب'} | ${data.price || ''} ج.س`);
    addNotification('طلب جديد', msg, data.orderId);
    showBrowserNotif(' طلب توصيل جديد!', msg, data.orderId);  // ← browser notif
    document.getElementById('ordersBadge').style.display = 'block';
    if (currentPage === 'overview') { loadLiveOrders(); loadDashboard(); }
    if (currentPage === 'orders') loadAllOrders();
    playNotifSound();
});

// Shop orders
socket.on('shop_order_available', (data) => {
    const msg = `${data.shopName || 'محل'} — ${data.price || '?'} ج.س`;
    showToast(` طلب محل — ${data.shopName || '?'} | ${data.price || ''} ج.س`);
    addNotification('طلب محل جديد', msg, data.orderId);
    showBrowserNotif(' طلب محل جديد!', msg, data.orderId);   // ← browser notif
    document.getElementById('ordersBadge').style.display = 'block';
    if (currentPage === 'overview') { loadLiveOrders(); loadDashboard(); }
    if (currentPage === 'orders') loadAllOrders();
    playNotifSound();
});

// Order status changes
socket.on('order_status_updated', () => {
    if (currentPage === 'overview') { loadLiveOrders(); loadDashboard(); }
    if (currentPage === 'orders') loadAllOrders();
});

// Admin-specific order updates from backend
socket.on('admin_order_update', (data) => {
    if (currentPage === 'overview') { loadLiveOrders(); loadDashboard(); }
    if (currentPage === 'orders') loadAllOrders();
});

// Captain location updates for map —  Real-time marker movement
socket.on('captain_location_update', (data) => {
    const id = data.captainId || data.userId;
    if (!id || !data.lat || !data.lng) return;

    const status = data.status === 'offline' ? 'offline' : 'available';
    // الرقم يكون في الـ payload لو أُرسل، أو نحتفظ بالموجود في الـ marker
    const phone = data.phone || captainMarkers[id]?.data?.phone || '';

    // Update on whichever map is active
    if (gvMap) {
        updateCaptainMarkerOnMap(gvMap, id, data.lat, data.lng, data.name || 'كابتن', status, phone);
    }
    if (miniMapInstance) {
        updateCaptainMarkerOnMap(miniMapInstance, id, data.lat, data.lng, data.name || 'كابتن', status, phone);
    }
    updateMapCounter();
});

//  Real-time: refresh captains page when a new captain registers or status changes
socket.on('user_status', () => {
    if (currentPage === 'captains') loadCaptains();
});

// New notification from server (admin-specific via admin's socket room)
socket.on('new_notification', (data) => {
    if (data && data.title) {
        addNotification(data.title, data.message || '', null);
        showToast(data.title);
        playNotifSound();
    }
});

// 🚨 Emergency SOS alert from a captain — distinct siren + prominent popup
socket.on('emergency_alert', (data) => {
    if (!data) return;
    // الأدمن المساعد يتلقّى نجدات مدينته فقط
    if (userObj && userObj.adminRole === 'sub_admin' && data.city && data.city !== userObj.city) return;
    handleEmergencyAlert(data);
});

// ── Helpers ──
function getAdminId() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        return user._id || '';
    } catch(e) { return ''; }
}

function timeAgo(date) {
    const diff = (Date.now() - new Date(date).getTime()) / 1000;
    if (diff < 60) return 'الآن';
    if (diff < 3600) return Math.floor(diff/60) + ' د';
    if (diff < 86400) return Math.floor(diff/3600) + ' س';
    return Math.floor(diff/86400) + ' ي';
}

const STATUS_LABELS = {
    pending: 'قيد الانتظار',
    scheduled: 'مجدول',
    accepted: 'مقبول',
    picked_up: 'قيد التوصيل',
    delivered: 'مكتمل',
    cancelled: 'ملغي'
};

function statusLabel(s) { return STATUS_LABELS[s] || s; }

// Global showToast is handled by app-core.js

function playNotifSound() {
    try {
        const audio = new Audio('/sounds/wajeezsd-bell.wav');
        audio.volume = 0.6;
        audio.play().catch(()=>{});
    } catch(e) {}
}

// ── 🚨 Emergency siren (Web Audio — نغمة نجدة متذبذبة مميّزة، بدون ملف صوت) ──
let _sirenCtx = null, _sirenOsc = null, _sirenGain = null, _sirenTimer = null, _sirenStop = null;
function playEmergencySiren() {
    try {
        stopEmergencySiren();
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) { playNotifSound(); return; }
        _sirenCtx = new Ctx();
        _sirenOsc = _sirenCtx.createOscillator();
        _sirenGain = _sirenCtx.createGain();
        _sirenOsc.type = 'sawtooth';
        _sirenGain.gain.value = 0.25;
        _sirenOsc.connect(_sirenGain).connect(_sirenCtx.destination);
        _sirenOsc.start();
        // تذبذب بين ترددين كصفّارة إسعاف
        let high = true;
        const sweep = () => {
            if (!_sirenCtx) return;
            _sirenOsc.frequency.setValueAtTime(high ? 920 : 640, _sirenCtx.currentTime);
            high = !high;
        };
        sweep();
        _sirenTimer = setInterval(sweep, 450);
        // إيقاف تلقائي بعد 20 ثانية احتياطاً
        _sirenStop = setTimeout(stopEmergencySiren, 20000);
    } catch(e) {}
}
function stopEmergencySiren() {
    if (_sirenTimer) { clearInterval(_sirenTimer); _sirenTimer = null; }
    if (_sirenStop) { clearTimeout(_sirenStop); _sirenStop = null; }
    try { if (_sirenOsc) { _sirenOsc.stop(); _sirenOsc.disconnect(); } } catch(e) {}
    try { if (_sirenCtx) _sirenCtx.close(); } catch(e) {}
    _sirenOsc = null; _sirenGain = null; _sirenCtx = null;
}

// عرض نجدة الطوارئ بشكل بارز + تشغيل الصفّارة
function handleEmergencyAlert(data) {
    playEmergencySiren();
    const name = window.escapeHtml(data.captainName || 'كابتن');
    const phone = window.escapeHtml(data.captainPhone || '');
    const cityLabel = data.city === 'PortSudan' ? 'بورتسودان' : (data.city === 'Khartoum' ? 'الخرطوم' : '');
    addNotification('🚨 نجدة: ' + name, 'طلب طوارئ — اضغط لعرض الموقع', null);

    if (window.Swal) {
        Swal.fire({
            icon: 'error',
            title: '🚨 نجدة طارئة!',
            html: `الكابتن <b>${name}</b> طلب النجدة!<br><br>` +
                  (phone ? `📞 <a href="tel:${phone}" dir="ltr" style="font-weight:700;">${phone}</a><br>` : '') +
                  (cityLabel ? `🏙️ ${cityLabel}<br>` : '') +
                  `<a href="${data.mapsLink || '#'}" target="_blank" style="display:inline-block;margin-top:12px;background:#04553A;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:700;">📍 عرض الموقع على الخريطة</a>`,
            confirmButtonText: 'تم الاطلاع — إيقاف الصوت',
            confirmButtonColor: '#e74c3c',
            allowOutsideClick: false,
            allowEscapeKey: false
        }).then(() => stopEmergencySiren());
    } else {
        showToast('🚨 نجدة: ' + name);
        setTimeout(stopEmergencySiren, 8000);
    }
}

// Sort helper — newest first
function sortByNewest(arr) {
    return [...arr].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ── Notifications ──
function addNotification(title, message, orderId) {
    notifications.unshift({ title, message, orderId, time: new Date(), unread: true });
    if (notifications.length > 100) notifications.pop();
    updateNotifCount();
    renderNotifications();
}

function updateNotifCount() {
    const count = notifications.filter(n => n.unread).length;
    const el = document.getElementById('notifCount');
    if (count > 0) { el.textContent = count > 99 ? '99+' : count; el.style.display = 'flex'; }
    else { el.style.display = 'none'; }
}

function renderNotifications() {
    const list = document.getElementById('notifList');
    if (notifications.length === 0) {
        list.innerHTML = '<div class="gv-empty"><i class="fas fa-bell-slash"></i><p>لا توجد إشعارات</p></div>';
        return;
    }
    list.innerHTML = notifications.slice(0, 50).map(n => `
        <div class="gv-notif-item ${n.unread ? 'unread' : ''}" ${n.orderId ? `onclick="viewOrder('${n.orderId}')"` : ''}>
            <h5>${window.escapeHtml(n.title)}</h5>
            <p>${window.escapeHtml(n.message)}</p>
            <div class="time">${timeAgo(n.time)}</div>
        </div>
    `).join('');
}

function toggleNotifPanel(open) {
    document.getElementById('notifPanel').classList.toggle('open', open);
    document.getElementById('notifOverlay').classList.toggle('show', open);
    if (open) { notifications.forEach(n => n.unread = false); updateNotifCount(); renderNotifications(); }
}

// ── 🔐 Admin Permissions (frontend gate — defense in depth) ──
function isSuperAdmin() {
    return !userObj || !userObj.adminRole || userObj.adminRole === 'super_admin';
}
function hasPerm(perm) {
    if (isSuperAdmin()) return true;
    return (userObj.permissions || []).includes(perm);
}
// خريطة صفحات اللوحة الداخلية → الصلاحية المطلوبة (null = متاح للجميع)
const PAGE_PERMS = {
    overview: null, orders: 'view_orders', livemap: 'view_map',
    captains: 'view_captains', users: 'view_users', broadcast: 'send_notifications'
};
function canAccessPage(page) {
    const need = PAGE_PERMS[page];
    return !need || hasPerm(need);
}
// إخفاء عناصر التنقل التي لا يملك الأدمن المساعد صلاحيتها
function applyAdminPermissionsUI() {
    if (isSuperAdmin()) return; // المسؤول الرئيسي يرى كل شيء
    document.querySelectorAll('.gv-nav-item[data-perm]').forEach(btn => {
        const need = btn.getAttribute('data-perm');
        const allowed = need !== '__super__' && hasPerm(need);
        if (!allowed) btn.style.display = 'none';
    });
}

// ── Page Navigation ──
function switchPage(page) {
    // 🔐 منع الأدمن المساعد من فتح صفحة لا يملك صلاحيتها (حتى عبر التلاعب)
    if (!canAccessPage(page)) {
        showToast('🚫 لا تملك صلاحية الوصول لهذه الصفحة');
        return;
    }
    currentPage = page;
    document.querySelectorAll('.gv-page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    document.querySelectorAll('.gv-nav-item').forEach(b => b.classList.remove('active'));
    const navBtn = document.querySelector(`.gv-nav-item[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');

    const titles = {
        overview: 'نظرة عامة', orders: 'الطلبات', livemap: 'الخريطة الحية',
        users: 'المستخدمين', captains: 'الكباتن', broadcast: 'إرسال إشعار'
    };
    document.getElementById('pageTitle').textContent = titles[page] || page;

    // Load data for page
    if (page === 'overview') loadDashboard();
    if (page === 'orders') loadAllOrders();
    if (page === 'livemap') initFullMap();
    if (page === 'users') loadUsers();
    if (page === 'captains') loadCaptains();

    // Hide badges
    if (page === 'orders') document.getElementById('ordersBadge').style.display = 'none';
    if (page === 'captains') document.getElementById('captainsBadge').style.display = 'none';

    // Close mobile sidebar
    document.getElementById('gvSidebar').classList.remove('mobile-open');
}

async function refreshCurrentPage() {
    const btn = document.querySelector('.gv-topbar-btn[onclick="refreshCurrentPage()"]');
    const icon = btn ? btn.querySelector('i') : null;

    // 1. Spin the icon and disable button
    if (icon) {
        icon.classList.add('fa-spin');
        btn.disabled = true;
        btn.style.opacity = '0.6';
    }

    try {
        // 2. Refresh ONLY the data for the current page (no full page reload)
        const refreshTasks = [];

        if (currentPage === 'overview') {
            refreshTasks.push(loadDashboard(), loadLiveOrders(), loadOnlineCaptainsCount());
        } else if (currentPage === 'orders') {
            refreshTasks.push(loadAllOrders());
        } else if (currentPage === 'livemap') {
            refreshTasks.push(refreshMapCaptains());
        } else if (currentPage === 'captains') {
            refreshTasks.push(loadCaptains());
        } else if (currentPage === 'users') {
            refreshTasks.push(loadUsers());
        }

        await Promise.all(refreshTasks);

        // 3. Success feedback
        showToast(' تم التحديث');
    } catch (e) {
        console.error('Refresh error:', e);
        showToast(' فشل التحديث — حاول مرة أخرى');
    } finally {
                // 4. Stop spinning
        if (icon) {
            icon.classList.remove('fa-spin');
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }
}

function toggleMobileSidebar() {
    document.getElementById('gvSidebar').classList.toggle('mobile-open');
}

// ── Dashboard / Overview ──
async function loadDashboard() {
    try {
        const isSubAdmin = userObj && userObj.adminRole === 'sub_admin';

        // إخفاء بطاقات الأرباح والعملاء عن الأدمن المساعد (التنقل يُدار في applyAdminPermissionsUI)
        if (isSubAdmin) {
            ['cardClients', 'cardRevenue'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }

        const endpoint = isSubAdmin ? `${BASE}/api/admin/dashboard-limited` : `${BASE}/api/admin/dashboard`;
        const res = await fetch(endpoint, { headers: headers() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();

        if (isSubAdmin) {
            document.getElementById('stat-captains').textContent = fmtNum(data.totalCaptains || 0);
            document.getElementById('stat-orders').textContent = fmtNum(data.totalOrders || 0);
            document.getElementById('stat-online').textContent = fmtNum(data.activeOrders || 0); // Using activeOrders here for sub-admin
            
            // Hide City Breakdown panel for sub_admin as it's not provided by dashboard-limited yet
            const cityPanel = document.getElementById('cityBreakdownContainer');
            if (cityPanel && cityPanel.parentElement && cityPanel.parentElement.parentElement) {
                cityPanel.parentElement.parentElement.style.display = 'none';
            }
        } else {
            document.getElementById('stat-clients').textContent = fmtNum(data.stats.customers);
            document.getElementById('stat-captains').textContent = fmtNum(data.stats.captains);
            document.getElementById('stat-orders').textContent = fmtNum(data.stats.orders);
            document.getElementById('stat-revenue').textContent = fmtNum(data.stats.revenue) + ' ج.س';
            
            if (data.ordersByStatus) {
                renderStatusBar(data.ordersByStatus);
            }
            
            // Render City Breakdown
            const container = document.getElementById('cityBreakdownContainer');
            if (container) {
                const breakdown = data.cityBreakdown && data.cityBreakdown.length > 0
                    ? data.cityBreakdown
                    : [
                        { city: 'Khartoum',  captains: 0, clients: 0, orders: 0, revenue: 0 },
                        { city: 'PortSudan', captains: 0, clients: 0, orders: 0, revenue: 0 }
                      ];
            container.innerHTML = breakdown.map(cityData => {
                const cityKey    = cityData.city || cityData._id;
                const isKhartoum = cityKey === 'Khartoum';
                const label      = isKhartoum ? 'الخرطوم - أم درمان' : 'البحر الأحمر - بورتسودان';
                const icon       = isKhartoum
                    ? '<i class="fas fa-city" style="margin-left:6px;color:#2563eb;"></i>'
                    : '<i class="fas fa-anchor" style="margin-left:6px;color:#0ea5e9;"></i>';
                const accent   = isKhartoum ? '#2563eb' : '#0ea5e9';
                const clients  = cityData.clients  ?? cityData.users ?? 0;
                const captains = cityData.captains ?? 0;
                const orders   = cityData.orders   ?? 0;
                const revenue  = cityData.revenue  ?? 0;
                return `
                    <div style="flex:1;min-width:210px;background:#fff;border:1px solid #e2e8f0;border-top:4px solid ${accent};border-radius:14px;padding:18px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.05);">
                        <h5 style="margin:0 0 14px;font-weight:800;font-size:14px;color:#1e293b;">${icon}${label}</h5>
                        <div style="display:flex;justify-content:space-around;font-size:0.88rem;color:#64748b;gap:8px;">
                            <div style="background:#f8fafc;border-radius:8px;padding:8px 12px;">
                                <strong style="display:block;font-size:1.3rem;color:#2563eb;">${fmtNum(clients)}</strong>عملاء
                            </div>
                            <div style="background:#f8fafc;border-radius:8px;padding:8px 12px;">
                                <strong style="display:block;font-size:1.3rem;color:#16a34a;">${fmtNum(captains)}</strong>كباتن
                            </div>
                            <div style="background:#f8fafc;border-radius:8px;padding:8px 12px;">
                                <strong style="display:block;font-size:1.3rem;color:#ea580c;">${fmtNum(orders)}</strong>طلبات
                            </div>
                        </div>
                        <div style="margin-top:12px;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:10px;">
                            الإيرادات: <strong style="color:#7c3aed;">${Number(revenue).toLocaleString()} ج.س</strong>
                        </div>
                    </div>
                `;
            }).join('');
        }
        } // Close else block

    } catch(e) { console.error('Dashboard error:', e); }

    loadLiveOrders();
    loadOnlineCaptainsCount();
    initMiniMap();
}

function renderStatusBar(counts) {
    const order = ['pending', 'scheduled', 'accepted', 'picked_up', 'delivered', 'cancelled'];
    const total = order.reduce((sum, k) => sum + (counts[k] || 0), 0);

    const bar = document.getElementById('statusBar');
    if (total === 0) {
        bar.innerHTML = '<div class="gv-empty"><i class="fas fa-chart-bar"></i><p>لا توجد طلبات بعد</p></div>';
        return;
    }

    bar.innerHTML = order.map(status => {
        const count = counts[status] || 0;
        const percent = total > 0 ? (count / total * 100) : 0;
        return `
            <div class="gv-status-bar-row">
                <div class="gv-status-bar-label">
                    <div class="dot gv-color-${status}"></div>
                    <span>${statusLabel(status)}</span>
                </div>
                <div class="gv-status-bar-progress">
                    <div class="gv-status-bar-fill gv-color-${status}" style="width:${percent}%;"></div>
                </div>
                <div class="gv-status-bar-count">${fmtNum(count)}</div>
                <div class="gv-status-bar-percent">${percent.toFixed(1)}%</div>
            </div>
        `;
    }).join('');
}

async function loadOnlineCaptainsCount() {
    try {
        const res = await fetch(`${BASE}/api/admin/active-captains`, { headers: headers() });
        if (!res.ok) return;
        const captains = await res.json();
        const online = captains.filter(c => c.isActive && c.currentLocation && c.currentLocation.lat).length;
        document.getElementById('stat-online').textContent = online;
    } catch(e) {}
}

async function loadLiveOrders() {
    try {
        const res = await fetch(`${BASE}/api/admin/orders/live`, { headers: headers() });
        if (!res.ok) throw new Error('Failed');
        let live = await res.json();

        const feed = document.getElementById('liveOrdersFeed');
        const counter = document.getElementById('liveOrdersCount');
        if (counter) counter.textContent = `${live.length} طلب`;

        if (live.length === 0) {
            feed.innerHTML = '<div class="gv-empty"><i class="fas fa-inbox"></i><p>لا توجد طلبات نشطة</p></div>';
            return;
        }

        const cityLabel = (city) => {
            if (city === 'PortSudan') return '<span style="font-size:10px;font-weight:700;color:#0ea5e9;"><i class="fas fa-anchor" style="margin-left:3px;"></i> بورتسودان</span>';
            return '<span style="font-size:10px;font-weight:700;color:#7c3aed;"><i class="fas fa-city" style="margin-left:3px;"></i> الخرطوم</span>';
        };

        feed.innerHTML = live.slice(0, 30).map(o => `
            <div class="gv-order-item" onclick="viewOrder('${o._id}')">
                <div class="gv-order-status ${o.status}"></div>
                <div class="gv-order-info">
                    <h5>${window.escapeHtml(o.client?.name || 'عميل')} ${o.captain ? '← ' + window.escapeHtml(o.captain.name) : ''}</h5>
                    <p>${window.escapeHtml(o.pickup?.address || '?')} → ${window.escapeHtml(o.dropoff?.address || '?')}</p>
                    ${cityLabel(o.city)}
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                    <span class="gv-badge ${o.status}">${statusLabel(o.status)}</span>
                    <div class="gv-order-price">${o.price} ج.س</div>
                </div>
            </div>
        `).join('');
    } catch(e) {
        console.error('Live orders error:', e);
    }
}

// ── All Orders ──
async function loadAllOrders() {
    try {
        const res = await fetch(`${BASE}/api/admin/orders`, { headers: headers() });
        if (!res.ok) throw new Error('Failed');
        allOrders = sortByNewest(await res.json()); //  newest first
        renderAllOrders(allOrders);
    } catch(e) { console.error(e); }
}


function filterOrders() {
    const status = document.getElementById('orderStatusFilter').value;
    const q = (document.getElementById('orderSearch').value || '').toLowerCase().trim();
    let filtered = allOrders;
    if (status !== 'all') filtered = filtered.filter(o => o.status === status);
    if (q) {
        filtered = filtered.filter(o =>
            (o.client?.name || '').toLowerCase().includes(q) ||
            (o.captain?.name || '').toLowerCase().includes(q) ||
            (o.pickup?.address || '').toLowerCase().includes(q) ||
            (o.dropoff?.address || '').toLowerCase().includes(q) ||
            String(o.price).includes(q)
        );
    }
    renderAllOrders(filtered);
}

function renderAllOrders(orders) {
    const body = document.getElementById('allOrdersBody');
    if (!orders || !orders.length) {
        body.innerHTML = '<tr><td colspan="8"><div class="gv-empty"><i class="fas fa-inbox"></i><p>لا توجد طلبات</p></div></td></tr>';
        return;
    }
    body.innerHTML = orders.slice(0, 200).map(o => `
        <tr onclick="viewOrder('${o._id}')" style="cursor:pointer;">
            <td style="font-weight:700;">${window.escapeHtml(o.client?.name || '—')}</td>
            <td>${o.captain ? window.escapeHtml(o.captain.name) : '<span style="color:#94a3b8;">—</span>'}</td>
            <td>${window.escapeHtml(o.pickup?.address || '—')}</td>
            <td>${window.escapeHtml(o.dropoff?.address || '—')}</td>
            <td>${o.price || 0} SDG</td>
            <td><span class="gv-badge ${o.status}">${window.statusLabel ? window.statusLabel(o.status) : o.status}</span></td>
            <td>${new Date(o.createdAt).toLocaleDateString('ar-SA')}</td>
            <td onclick="event.stopPropagation();">
                <button class="gv-btn gv-btn-ghost gv-btn-icon" onclick="viewOrder('${o._id}')" title="عرض">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function loadUsers() {
    try {
        const res = await fetch(`${BASE}/api/admin/users`, { headers: headers() });
        if (!res.ok) throw new Error('Failed to load users');
        const data = await res.json();
        allUsers = Array.isArray(data) ? data : (data.users || []);
        window.filterUsers();
    } catch(e) { console.error(e); }
}

window.filterUsers = function() {
    const city = document.getElementById('userCityFilter')?.value || 'all';
    const verify = document.getElementById('userVerifyFilter')?.value || 'all';
    const q = (document.getElementById('userSearch')?.value || '').toLowerCase().trim();
    let filtered = allUsers;

    if (city !== 'all') {
        filtered = filtered.filter(u => u.city === city);
    }
    // 📵 فلتر التفعيل — للعملاء الذين لم تصلهم رسالة الـ SMS من المزود
    if (verify === 'unverified') {
        filtered = filtered.filter(u => !u.isVerified);
    } else if (verify === 'verified') {
        filtered = filtered.filter(u => u.isVerified);
    }
    if (q) {
        filtered = filtered.filter(u =>
            (u.name || '').toLowerCase().includes(q) ||
            (u.phone || '').includes(q)
        );
    }
    // عدّاد غير المفعلين في خيار الفلتر (يلفت نظر الأدمن للحسابات العالقة)
    const unverifiedCount = allUsers.filter(u => !u.isVerified).length;
    const sel = document.getElementById('userVerifyFilter');
    if (sel && sel.options[1]) sel.options[1].textContent = `غير مفعلة (OTP)${unverifiedCount ? ' — ' + unverifiedCount : ''}`;

    renderUsers(filtered);
};

function renderUsers(users) {
    const body = document.getElementById('usersBody');
    if (!body) return;
    if (!users || !users.length) {
        body.innerHTML = '<tr><td colspan="6"><div class="gv-empty"><i class="fas fa-users"></i><p>لا يوجد مستخدمون</p></div></td></tr>';
        return;
    }
    const roleMap = { client: 'عميل', captain: 'كابتن', merchant: 'تاجر', admin: 'مشرف' };
    const roleBadge = { client: 'delivered', captain: 'pending', merchant: 'picked_up', admin: 'accepted' };
    body.innerHTML = users.slice(0, 300).map(u => `
        <tr>
            <td style="font-weight:700;">${window.escapeHtml(u.name || '—')}</td>
            <td dir="ltr" style="font-size:13px;">${window.escapeHtml(u.phone || '—')}</td>
            <td><span class="gv-badge ${roleBadge[u.role] || 'pending'}">${roleMap[u.role] || u.role}</span></td>
            <td>${u.isActive ? '<span style="color:var(--gv-success);font-weight:700;">● نشط</span>' : '<span style="color:var(--gv-danger);font-weight:700;">○ معطل</span>'}</td>
            <td>${u.isVerified
                ? '<span style="color:var(--gv-success);font-weight:700;font-size:12px;"><i class="fas fa-check-circle"></i> مفعل</span>'
                : '<span style="background:#fef3c7;color:#b45309;font-weight:800;font-size:11px;padding:3px 9px;border-radius:20px;"><i class="fas fa-envelope-open-text"></i> بانتظار OTP</span>'}</td>
            <td style="white-space:nowrap;">
                ${!u.isVerified ? `
                <button class="gv-btn gv-btn-ghost gv-btn-icon" onclick="toggleUserVerify('${u._id}', true)" title="تفعيل الحساب يدوياً (لم تصله رسالة SMS)" style="color:var(--gv-success);">
                    <i class="fas fa-user-check"></i>
                </button>` : `
                <button class="gv-btn gv-btn-ghost gv-btn-icon" onclick="toggleUserVerify('${u._id}', false)" title="إلغاء التفعيل (سيُطلب OTP عند الدخول)" style="color:#b45309;">
                    <i class="fas fa-user-lock"></i>
                </button>`}
                <button class="gv-btn gv-btn-ghost gv-btn-icon" onclick="editUser('${u._id}')" title="تعديل">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="gv-btn gv-btn-ghost gv-btn-icon" onclick="toggleUserStatus('${u._id}')" title="${u.isActive ? 'تعطيل' : 'تفعيل'}">
                    <i class="fas fa-${u.isActive ? 'ban' : 'check'}"></i>
                </button>
                <button class="gv-btn gv-btn-ghost gv-btn-icon" onclick="deleteUser('${u._id}')" title="حذف" style="color:var(--gv-danger);">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// 📵 تفعيل/إلغاء تفعيل حساب يدوياً — لعملاء لم تصلهم رسالة OTP من مزود الـ SMS
async function toggleUserVerify(userId, willVerify) {
    const result = await Swal.fire({
        title: willVerify ? 'تفعيل الحساب يدوياً؟' : 'إلغاء تفعيل الحساب؟',
        text: willVerify
            ? 'سيتمكن المستخدم من تسجيل الدخول مباشرة دون كود OTP. استخدمها عندما لا تصل رسالة SMS من المزود.'
            : 'سيُطلب من المستخدم كود OTP عند محاولة الدخول القادمة.',
        icon: 'question', showCancelButton: true,
        confirmButtonText: willVerify ? 'نعم، فعّل الحساب' : 'نعم، ألغِ التفعيل',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: willVerify ? '#10b981' : '#b45309'
    });
    if (!result.isConfirmed) return;
    try {
        const res = await fetch(`${BASE}/api/admin/user/${userId}/verify`, { method: 'PUT', headers: headers() });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { Swal.fire('خطأ', d.message || 'فشل تحديث التفعيل', 'error'); return; }
        loadUsers();
        showToast(d.message || 'تم تحديث التفعيل');
    } catch(e) { console.error(e); Swal.fire('خطأ', 'فشل الاتصال بالسيرفر', 'error'); }
}

async function toggleUserStatus(userId) {
    try {
        await fetch(`${BASE}/api/admin/user/${userId}/status`, { method: 'PUT', headers: headers() });
        loadUsers();
        showToast('تم تحديث حالة المستخدم');
    } catch(e) { console.error(e); }
}

async function deleteUser(userId) {
    const result = await Swal.fire({
        title: 'حذف المستخدم؟', text: 'لا يمكن التراجع',
        icon: 'warning', showCancelButton: true, confirmButtonText: 'احذف', cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
    });
    if (!result.isConfirmed) return;
    try {
        await fetch(`${BASE}/api/admin/users/${userId}`, { method: 'DELETE', headers: headers() });
        loadUsers();
        showToast('تم الحذف');
    } catch(e) { console.error(e); }
}

//  Edit User Modal
async function editUser(userId) {
    // Fetch user data
    let user;
    try {
        const res = await fetch(`${BASE}/api/admin/user/${userId}`, { headers: headers() });
        if (!res.ok) throw new Error('Failed');
        user = await res.json();
    } catch(e) { Swal.fire('خطأ', 'فشل جلب بيانات المستخدم', 'error'); return; }

    const currentPhoto = user.documents && user.documents.profilePhoto;
    const photoUrl = currentPhoto ? window.getFullImageUrl(currentPhoto) : '';
    const vehicleOptions = user.role === 'captain' ? `
        <label style="display:block;text-align:right;font-weight:700;margin-top:8px;font-size:13px;">نوع المركبة</label>
        <select id="swal-vehicle" class="swal2-select" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-family:inherit;">
            ${window.VehicleTypes.optionsHtml(user.vehicleType)}
        </select>
        <label style="display:block;text-align:right;font-weight:700;margin-top:12px;font-size:13px;">صورة بروفايل الكابتن (تظهر للعميل)</label>
        <div style="display:flex;align-items:center;gap:10px;margin-top:4px;">
            <img id="swal-photo-preview" src="${photoUrl}" alt=""
                style="width:54px;height:54px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0;background:#f1f5f9;${photoUrl ? '' : 'display:none;'}">
            <span id="swal-photo-placeholder" style="width:54px;height:54px;border-radius:50%;display:${photoUrl ? 'none' : 'flex'};align-items:center;justify-content:center;background:#f1f5f9;border:2px solid #e2e8f0;font-size:22px;color:#94a3b8;">📷</span>
            <input type="file" id="swal-photo" accept="image/png,image/jpeg,image/webp" style="flex:1;font-size:12px;"
                onchange="(function(i){if(i.files&&i.files[0]){var r=new FileReader();r.onload=function(e){var p=document.getElementById('swal-photo-preview');p.src=e.target.result;p.style.display='block';document.getElementById('swal-photo-placeholder').style.display='none';};r.readAsDataURL(i.files[0]);}})(this)">
        </div>
    ` : '';

    const { isConfirmed, value } = await Swal.fire({
        title: 'تعديل المستخدم',
        html: `
            <input id="swal-name" class="swal2-input" placeholder="الاسم" value="${user.name || ''}">
            <input id="swal-email" class="swal2-input" placeholder="البريد" type="email" value="${user.email || ''}">
            <input id="swal-phone" class="swal2-input" placeholder="الهاتف" dir="ltr" value="${user.phone || ''}">
            <label style="display:block;text-align:right;font-weight:700;margin-top:8px;font-size:13px;">المدينة / المنطقة</label>
            <select id="swal-edit-city" class="swal2-select" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-family:inherit;">
                <option value="Khartoum" ${(!user.city || user.city === 'Khartoum') ? 'selected' : ''}>الخرطوم - أم درمان</option>
                <option value="PortSudan" ${user.city === 'PortSudan' ? 'selected' : ''}>البحر الأحمر - بورتسودان</option>
            </select>
            <label style="display:block;text-align:right;font-weight:700;margin-top:8px;font-size:13px;">الدور</label>
            <select id="swal-role" class="swal2-select" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-family:inherit;">
                <option value="client" ${user.role === 'client' ? 'selected' : ''}>عميل</option>
                <option value="captain" ${user.role === 'captain' ? 'selected' : ''}>كابتن</option>
                <option value="merchant" ${user.role === 'merchant' ? 'selected' : ''}>تاجر</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>مدير</option>
            </select>
            ${vehicleOptions}
            <input id="swal-pass" class="swal2-input" placeholder="كلمة مرور جديدة (اختياري)" type="password">
        `,
        confirmButtonText: 'حفظ', showCancelButton: true, cancelButtonText: 'إلغاء',
        preConfirm: () => {
            const data = {
                name: document.getElementById('swal-name').value,
                email: document.getElementById('swal-email').value,
                phone: document.getElementById('swal-phone').value,
                role: document.getElementById('swal-role').value,
                city: document.getElementById('swal-edit-city').value,
            };
            const passEl = document.getElementById('swal-pass');
            if (passEl && passEl.value) data.password = passEl.value;
            const vehicleEl = document.getElementById('swal-vehicle');
            if (vehicleEl) data.vehicleType = vehicleEl.value;
            const photoEl = document.getElementById('swal-photo');
            data.__photoFile = (photoEl && photoEl.files && photoEl.files[0]) || null;
            return data;
        }
    });

    if (!isConfirmed) return;
    const photoFile = value.__photoFile;
    delete value.__photoFile; // لا يُرسل ضمن بيانات JSON
    try {
        const res = await fetch(`${BASE}/api/admin/users/${userId}`, {
            method: 'PUT', headers: headers(), body: JSON.stringify(value)
        });
        const data = await res.json();
        if (!res.ok) { Swal.fire('خطأ', data.message, 'error'); return; }

        // 📷 رفع صورة الكابتن بعد حفظ البيانات (إن اختيرت) — مع شريط تقدّم
        if (photoFile) {
            try {
                await uploadCaptainPhotoWithProgress(userId, photoFile);
            } catch (uploadErr) {
                Swal.fire('تنبيه', 'حُفظت البيانات لكن فشل رفع الصورة: ' + (uploadErr.message || ''), 'warning');
                loadUsers(); loadCaptains();
                return;
            }
        }
        showToast(' تم التحديث'); loadUsers(); loadCaptains();
    } catch(e) { Swal.fire('خطأ', 'فشل الاتصال', 'error'); }
}

// 📷 رفع صورة الكابتن مع شريط تقدّم (XHR يدعم onprogress عكس fetch)
function uploadCaptainPhotoWithProgress(userId, photoFile) {
    return new Promise((resolve, reject) => {
        const fd = new FormData();
        fd.append('photo', photoFile);

        Swal.fire({
            title: 'جاري رفع الصورة...',
            html: `
                <div style="background:#e2e8f0;border-radius:999px;height:14px;overflow:hidden;margin-top:10px;">
                    <div id="uploadProgressBar" style="height:100%;width:0%;background:linear-gradient(90deg,var(--gv-primary),var(--gv-accent));transition:width .15s ease;"></div>
                </div>
                <div id="uploadProgressText" style="margin-top:8px;font-size:13px;color:var(--gv-dark-2);">0%</div>
            `,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => Swal.showLoading()
        });

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BASE}/api/upload/admin/captain-photo/${userId}`);
        xhr.setRequestHeader('Authorization', headers().Authorization); // بدون Content-Type ليضبطه المتصفح

        xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const pct = Math.round((e.loaded / e.total) * 100);
            const bar = document.getElementById('uploadProgressBar');
            const txt = document.getElementById('uploadProgressText');
            if (bar) bar.style.width = pct + '%';
            if (txt) txt.textContent = pct + '%';
        };

        xhr.onload = () => {
            Swal.close();
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                let msg = '';
                try { msg = JSON.parse(xhr.responseText).message || ''; } catch (_) {}
                reject(new Error(msg));
            }
        };
        xhr.onerror = () => { Swal.close(); reject(new Error('فشل الاتصال بالخادم')); };
        xhr.send(fd);
    });
}

// ── Captains ──
async function loadCaptains() {
    try {
        // 🌍 فلتر المدينة (super_admin فقط؛ الأدمن المساعد مقيّد بمدينته في الباك-إند)
        const cityEl = document.getElementById('captainCityFilter');
        // إخفاء الفلتر عن الأدمن المساعد — هو مقيّد بمدينة واحدة
        if (cityEl && userObj && userObj.adminRole === 'sub_admin') cityEl.style.display = 'none';
        const city = cityEl ? cityEl.value : 'all';
        const cityQS = (city && city !== 'all') ? `?city=${city}` : '';

        const [captainsRes, pendingRes] = await Promise.all([
            fetch(`${BASE}/api/admin/active-captains${cityQS}`, { headers: headers() }),
            fetch(`${BASE}/api/admin/pending-captains${cityQS}`, { headers: headers() })
        ]);
        allCaptains = await captainsRes.json();
        const pending = await pendingRes.json();

        filterCaptains();
        renderPendingCaptains(pending);

        if (pending.length > 0) document.getElementById('captainsBadge').style.display = 'block';
    } catch(e) { console.error(e); }
}

function renderCaptainsTable(captains) {
    const body = document.getElementById('captainsBody');
    if (!captains.length) {
        body.innerHTML = '<tr><td colspan="7"><div class="gv-empty"><p>لا يوجد كباتن</p></div></td></tr>';
        return;
    }
    // ترتيب أبجدي حسب الاسم
    const sorted = [...captains].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'ar', { sensitivity: 'base' }));
    body.innerHTML = sorted.map(c => {
        const formattedPhone = c.phone ? (c.phone.toString().startsWith('+') ? c.phone : '+' + c.phone) : '—';
        const photoUrl = c.profilePhoto ? window.getFullImageUrl(c.profilePhoto) : '';
        const avatar = photoUrl
            ? `<img src="${window.escapeHtml(photoUrl)}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid var(--gv-border);">`
            : `<span style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--gv-primary),var(--gv-accent));color:white;font-weight:800;font-size:15px;">${window.escapeHtml((c.name || '?')[0])}</span>`;
        return `
        <tr>
            <td>${avatar}</td>
            <td style="font-weight:700;">${window.escapeHtml(c.name || '—')}</td>
            <td dir="ltr" style="font-size:13px;">${window.escapeHtml(formattedPhone)}</td>
            <td>${c.vehicleType ? window.VehicleTypes.iconLabel(c.vehicleType) : '—'}</td>
            <td style="font-weight:700;color:${(c.wallet_balance || 0) < 0 ? 'var(--gv-danger)' : 'var(--gv-success)'};white-space:nowrap;">
                ${fmtNum(c.wallet_balance || 0)} ج.س
            </td>
            <td>${c.isActive ? '<span style="color:var(--gv-success);font-weight:700;">● نشط</span>' : '<span style="color:var(--gv-dark-2);">○ غير نشط</span>'}</td>
            <td style="white-space:nowrap;">
                <button class="gv-btn gv-btn-ghost gv-btn-icon" onclick="editUser('${c._id}')" title="تعديل">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="gv-btn gv-btn-ghost gv-btn-icon" onclick="toggleUserStatus('${c._id}')" title="تبديل الحالة">
                    <i class="fas fa-power-off"></i>
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

function filterCaptains() {
    const q = (document.getElementById('captainSearch')?.value || '').trim().toLowerCase();
    if (!q) { renderCaptainsTable(allCaptains); return; }
    const filtered = (allCaptains || []).filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').toString().toLowerCase().includes(q)
    );
    renderCaptainsTable(filtered);
}

function renderPendingCaptains(pending) {
    const body = document.getElementById('pendingCaptainsBody');
    if (!pending.length) {
        body.innerHTML = '<div class="gv-empty"><i class="fas fa-check-circle"></i><p>لا توجد طلبات معلقة</p></div>';
        return;
    }
    body.innerHTML = pending.map(c => {
        const formattedPhone = c.phone ? (c.phone.toString().startsWith('+') ? c.phone : '+' + c.phone) : '';
        return `
        <div style="display:flex;align-items:center;gap:14px;padding:14px;border:1px solid var(--gv-border);border-radius:12px;margin-bottom:10px;flex-wrap:wrap;">
            <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--gv-primary),var(--gv-accent));color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0;">
                ${window.escapeHtml((c.name || '?')[0])}
            </div>
            <div style="flex:1;min-width:140px;">
                <div style="font-weight:700;font-size:14px;">${window.escapeHtml(c.name)}</div>
                <div style="font-size:12px;color:var(--gv-dark-2);" dir="ltr">${window.escapeHtml(formattedPhone)} ${c.email ? '| ' + window.escapeHtml(c.email) : ''}</div>
            </div>
            <div style="display:flex;gap:8px;">
                <button class="gv-btn gv-btn-success gv-btn-sm" onclick="approveCaptain('${c._id}')"><i class="fas fa-check"></i> قبول</button>
                <button class="gv-btn gv-btn-danger gv-btn-sm" onclick="rejectCaptain('${c._id}')"><i class="fas fa-times"></i> رفض</button>
            </div>
        </div>
        `;
    }).join('');
}

async function approveCaptain(id) {
    try {
        await fetch(`${BASE}/api/admin/approve-captain/${id}`, { method: 'PUT', headers: headers() });
        showToast(' تمت الموافقة');
        loadCaptains();
    } catch(e) { console.error(e); }
}

async function rejectCaptain(id) {
    const { value: reason } = await Swal.fire({
        title: 'سبب الرفض', input: 'text', inputPlaceholder: 'اكتب السبب...',
        showCancelButton: true, confirmButtonText: 'رفض', cancelButtonText: 'إلغاء'
    });
    if (!reason) return;
    try {
        await fetch(`${BASE}/api/admin/reject-captain/${id}`, {
            method: 'PUT', headers: headers(), body: JSON.stringify({ reason })
        });
        showToast('تم الرفض');
        loadCaptains();
    } catch(e) { console.error(e); }
}

function openAddCaptainModal() {
    Swal.fire({
        title: 'إضافة كابتن جديد',
        html: `
            <input id="swal-name" class="swal2-input" placeholder="الاسم الكامل">
            <input id="swal-email" class="swal2-input" placeholder="البريد الإلكتروني" type="email">
            <input id="swal-phone" class="swal2-input" placeholder="رقم الهاتف" dir="ltr">
            <label style="display:block;text-align:right;font-weight:700;margin-top:8px;font-size:13px;">المدينة / المنطقة</label>
            <select id="swal-city" class="swal2-select" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-family:inherit;">
                <option value="Khartoum">الخرطوم - أم درمان</option>
                <option value="PortSudan">البحر الأحمر - بورتسودان</option>
            </select>
            <label style="display:block;text-align:right;font-weight:700;margin-top:8px;font-size:13px;">نوع المركبة</label>
            <select id="swal-vehicle" class="swal2-select" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-family:inherit;">
                ${window.VehicleTypes.optionsHtml()}
            </select>
            <input id="swal-pass" class="swal2-input" placeholder="كلمة المرور" type="password">
        `,
        confirmButtonText: 'إنشاء', showCancelButton: true, cancelButtonText: 'إلغاء',
        preConfirm: () => ({
            name: document.getElementById('swal-name').value,
            email: document.getElementById('swal-email').value,
            phone: document.getElementById('swal-phone').value,
            password: document.getElementById('swal-pass').value,
            vehicleType: document.getElementById('swal-vehicle').value,
            city: document.getElementById('swal-city').value
        })
    }).then(async (result) => {
        if (!result.isConfirmed) return;
        try {
            const res = await fetch(`${BASE}/api/admin/create-captain`, {
                method: 'POST', headers: headers(), body: JSON.stringify(result.value)
            });
            const data = await res.json();
            if (res.ok) { showToast('تم الإنشاء'); loadCaptains(); }
            else Swal.fire('خطأ', data.message, 'error');
        } catch(e) { Swal.fire('خطأ', 'فشل الاتصال', 'error'); }
    });
}

// ── Broadcast ──
let selectedBroadcastUserId = null;
let selectedBroadcastUserName = '';
let broadcastSearchTimer = null;

document.querySelectorAll('.broadcast-target').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.broadcast-target').forEach(b => {
            b.classList.remove('active','gv-btn-primary');
            b.classList.add('gv-btn-ghost');
        });
        btn.classList.add('active','gv-btn-primary');
        btn.classList.remove('gv-btn-ghost');

        // إظهار/إخفاء حقل البحث عن مستخدم محدد
        const container = document.getElementById('userSearchContainer');
        if (btn.dataset.target === 'user') {
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
            clearSelectedUser();
        }
    });
});

function searchBroadcastUser() {
    clearTimeout(broadcastSearchTimer);
    const q = document.getElementById('broadcastUserSearch').value.trim();
    const resultsDiv = document.getElementById('broadcastUserResults');

    if (q.length < 2) {
        resultsDiv.style.display = 'none';
        return;
    }

    broadcastSearchTimer = setTimeout(async () => {
        try {
            const res = await fetch(`${BASE}/api/admin/users`, { headers: headers() });
            const users = await res.json();
            const filtered = users.filter(u =>
                (u.name || '').toLowerCase().includes(q.toLowerCase()) ||
                (u.phone || '').includes(q)
            ).slice(0, 20);

            if (!filtered.length) {
                resultsDiv.innerHTML = '<div style="padding:12px;text-align:center;color:var(--gv-dark-2);font-size:13px;">لا توجد نتائج</div>';
            } else {
                const roleMap = { client: 'عميل', captain: 'كابتن', merchant: 'تاجر', admin: 'مدير' };
                resultsDiv.innerHTML = filtered.map(u => `
                    <div onclick="selectBroadcastUser('${u._id}', '${(u.name || '').replace(/'/g, "\\'")}' )" 
                        style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--gv-border);display:flex;align-items:center;justify-content:space-between;transition:background .15s;"
                        onmouseover="this.style.background='var(--gv-bg)'" onmouseout="this.style.background='transparent'">
                        <div>
                            <span style="font-weight:700;font-size:14px;">${window.escapeHtml(u.name || '—')}</span>
                            <span style="font-size:12px;color:var(--gv-dark-2);margin-right:8px;" dir="ltr">${u.phone || ''}</span>
                        </div>
                        <span style="font-size:11px;padding:3px 8px;border-radius:6px;background:var(--gv-bg);color:var(--gv-dark-2);">${roleMap[u.role] || u.role}</span>
                    </div>
                `).join('');
            }
            resultsDiv.style.display = 'block';
        } catch(e) {
            console.error('Search error:', e);
            resultsDiv.style.display = 'none';
        }
    }, 300);
}

function selectBroadcastUser(id, name) {
    selectedBroadcastUserId = id;
    selectedBroadcastUserName = name;
    document.getElementById('broadcastUserResults').style.display = 'none';
    document.getElementById('broadcastUserSearch').style.display = 'none';
    document.getElementById('selectedUserBadge').style.display = 'flex';
    document.getElementById('selectedUserName').textContent = name;
}

function clearSelectedUser() {
    selectedBroadcastUserId = null;
    selectedBroadcastUserName = '';
    document.getElementById('broadcastUserSearch').value = '';
    document.getElementById('broadcastUserSearch').style.display = 'block';
    document.getElementById('broadcastUserResults').style.display = 'none';
    document.getElementById('selectedUserBadge').style.display = 'none';
}

async function sendBroadcast() {
    const title = document.getElementById('broadcastTitle').value.trim();
    const message = document.getElementById('broadcastMsg').value.trim();
    const target = document.querySelector('.broadcast-target.active')?.dataset.target || 'all';

    if (!title || !message) { Swal.fire('تنبيه', 'يرجى ملء العنوان والرسالة', 'warning'); return; }

    // التحقق من اختيار مستخدم عند الإرسال لمستخدم محدد
    if (target === 'user' && !selectedBroadcastUserId) {
        Swal.fire('تنبيه', 'يرجى اختيار مستخدم من نتائج البحث', 'warning');
        return;
    }

    const payload = { title, message, target };
    if (target === 'user') payload.userId = selectedBroadcastUserId;

    try {
        const res = await fetch(`${BASE}/api/admin/send-notification`, {
            method: 'POST', headers: headers(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
            Swal.fire('تم', `تم إرسال الإشعار لـ ${data.sentTo} مستخدم`, 'success');
            document.getElementById('broadcastTitle').value = '';
            document.getElementById('broadcastMsg').value = '';
            clearSelectedUser();
        } else { Swal.fire('خطأ', data.message, 'error'); }
    } catch(e) { Swal.fire('خطأ', 'فشل الاتصال', 'error'); }
}

// ── Maps ──
function makeCaptainIcon(status) {
    const colors = { available: '#10b981', busy: '#f59e0b', offline: '#94a3b8' };
    const fill = colors[status] || colors.available;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
        <ellipse cx="20" cy="45" rx="7" ry="3" fill="rgba(0,0,0,0.15)"/>
        <path d="M20 2C11 2 4 9 4 18C4 29 20 46 20 46C20 46 36 29 36 18C36 9 29 2 20 2Z" fill="${fill}" stroke="white" stroke-width="2.5"/>
        <circle cx="20" cy="18" r="7" fill="white"/>
        <text x="20" y="23" text-anchor="middle" font-size="12" font-weight="bold"></text>
    </svg>`;
    return {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        scaledSize: new google.maps.Size(40, 48),
        anchor: new google.maps.Point(20, 46)
    };
}

function updateCaptainMarker(id, lat, lng, name, status, phone) {
    // Update on all active maps
    if (gvMap) updateCaptainMarkerOnMap(gvMap, id, lat, lng, name, status, phone);
    else if (miniMapInstance) updateCaptainMarkerOnMap(miniMapInstance, id, lat, lng, name, status, phone);
}

function updateCaptainMarkerOnMap(map, id, lat, lng, name, status, phone) {
    if (!map) return;

    if (captainMarkers[id]) {
        //  Smooth position update (marker already exists)
        captainMarkers[id].marker.setPosition({ lat, lng });
        captainMarkers[id].marker.setIcon((typeof WajeezMarkers !== 'undefined') ? WajeezMarkers.captain(status) : makeCaptainIcon(status));
        captainMarkers[id].data = { name, status, lat, lng, phone };
        // Make sure it's on the right map
        if (captainMarkers[id].marker.getMap() !== map) {
            captainMarkers[id].marker.setMap(map);
        }
    } else {
        const marker = new google.maps.Marker({
            position: { lat, lng }, map, title: name,
            icon: (typeof WajeezMarkers !== 'undefined') ? WajeezMarkers.captain(status) : makeCaptainIcon(status)
        });
        const infoWindow = new google.maps.InfoWindow();
        marker.addListener('click', () => {
            const d = captainMarkers[id]?.data || {};
            const statusMap = { available: ' متاح', offline: ' غير متصل' };
            const formattedPhone = d.phone ? (d.phone.toString().startsWith('+') ? d.phone : '+' + d.phone) : '';
            const phoneHtml = formattedPhone
                ? `<a href="tel:${window.escapeHtml(formattedPhone)}" style="display:flex;align-items:center;gap:6px;margin-top:8px;padding:7px 10px;background:#10b981;color:white;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;justify-content:center;"> <span dir="ltr">${window.escapeHtml(formattedPhone)}</span></a>`
                : '';
            infoWindow.setContent(`
                <div style="font-family:'Cairo',sans-serif;direction:rtl;text-align:right;min-width:160px;padding:4px;">
                    <div style="font-weight:800;font-size:14px;margin-bottom:4px;"> ${d.name || 'كابتن'}</div>
                    <div style="font-size:12px;color:#555;">الحالة: ${statusMap[d.status] || ' متاح'}</div>
                    ${phoneHtml}
                </div>
            `);
            infoWindow.open(map, marker);
        });
        captainMarkers[id] = { marker, infoWindow, data: { name, status, lat, lng, phone } };
    }
}

function updateMapCounter() {
    const count = Object.values(captainMarkers).filter(m => m.data.status !== 'offline').length;
    const el = document.getElementById('mapOnlineCount');
    if (el) el.innerHTML = `<i class="fas fa-circle" style="font-size:8px;"></i> ${count} نشط`;
}

let _captainSearchTimer = null;

// Called on every keystroke — waits 600ms after user stops typing before searching
window.highlightMapCaptain = function() {
    clearTimeout(_captainSearchTimer);
    _captainSearchTimer = setTimeout(_runCaptainSearch, 600);
};

function _runCaptainSearch() {
    const q = (document.getElementById('mapCaptainSearch')?.value || '').toLowerCase().trim();
    const map = gvMap || miniMapInstance;
    if (!map) return;

    let found = false;
    Object.values(captainMarkers).forEach(({ marker, data, infoWindow }) => {
        const nameMatch = (data.name || '').toLowerCase().includes(q);
        const phoneMatch = (data.phone || '').includes(q);
        
        if (q === '') {
            marker.setAnimation(null);
            infoWindow.close();
            return;
        }

        if (nameMatch || phoneMatch) {
            marker.setAnimation(google.maps.Animation.BOUNCE);
            if (!found) {
                map.panTo(marker.getPosition());
                map.setZoom(15);
                infoWindow.open(map, marker);
                found = true;
            }
        } else {
            marker.setAnimation(null);
            infoWindow.close();
        }
    });
}

let _mapCityFilter = { fullMap: 'Khartoum', miniMap: 'Khartoum' };

//  Switch map city and reload captains
window.switchMapCity = function(mapId, city) {
    _mapCityFilter[mapId] = city;

    // Update button styles
    const prefix = mapId === 'fullMap' ? 'fullMap' : 'miniMap';
    const khBtn = document.getElementById(`${prefix}CityKhartoum`);
    const psBtn = document.getElementById(`${prefix}CityPortSudan`);
    if (khBtn && psBtn) {
        if (city === 'Khartoum') {
            khBtn.style.cssText = khBtn.style.cssText.replace(/background:[^;]+/, 'background:#2563eb').replace(/color:[^;]+/, 'color:#fff').replace(/border-color:[^;]+/, 'border-color:#2563eb');
            psBtn.style.cssText = psBtn.style.cssText.replace(/background:[^;]+/, 'background:#f8fafc').replace(/color:[^;]+/, 'color:#64748b').replace(/border:[^;]+/, 'border:2px solid #64748b');
        } else {
            psBtn.style.cssText = psBtn.style.cssText.replace(/background:[^;]+/, 'background:#0ea5e9').replace(/color:[^;]+/, 'color:#fff').replace(/border:[^;]+/, 'border:2px solid #0ea5e9');
            khBtn.style.cssText = khBtn.style.cssText.replace(/background:[^;]+/, 'background:#f8fafc').replace(/color:[^;]+/, 'color:#64748b').replace(/border-color:[^;]+/, 'border-color:#64748b');
        }
    }

    // Move map center
    const mapInstance = mapId === 'fullMap' ? gvMap : miniMapInstance;
    const center = city === 'PortSudan' ? { lat: 19.6151, lng: 37.2164 } : { lat: 15.6445, lng: 32.4777 };
    if (mapInstance) mapInstance.setCenter(center);

    // Clear existing markers
    Object.values(captainMarkers).forEach(m => m.marker?.setMap(null));
    captainMarkers = {};

    // Reload captains for new city
    loadMapCaptains(mapInstance, city);
};

async function loadMapCaptains(map, cityFilter) {
    try {
        const city = cityFilter || _mapCityFilter.fullMap || 'Khartoum';
        const res = await fetch(`${BASE}/api/admin/active-captains?city=${city}`, { headers: headers() });
        if (!res.ok) return;
        const captains = await res.json();

        let onlineCount = 0;
        captains.forEach(c => {
            const loc = c.currentLocation || c.location;
            if (!loc || !loc.lat || !loc.lng) return;

            let status = 'offline';
            if (c.isActive) { status = 'available'; onlineCount++; }

            updateCaptainMarker(c._id, loc.lat, loc.lng, c.name || 'كابتن', status, c.phone || '');
        });

        const el = document.getElementById('mapOnlineCount');
        if (el) el.innerHTML = `<i class="fas fa-circle" style="font-size:8px;"></i> ${onlineCount} نشط`;
    } catch(e) { console.error(e); }
}

function initMiniMap() {
    if (miniMapInstance || !window.google?.maps) return;
    const el = document.getElementById('miniMap');
    if (!el) return;

    miniMapInstance = new google.maps.Map(el, {
        center: { lat: 15.6445, lng: 32.4777 }, zoom: 12,
        disableDefaultUI: true, zoomControl: true,
        styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] }
        ]
    });
    loadMapCaptains(miniMapInstance);
}

function initFullMap() {
    if (!window.google?.maps) { setTimeout(initFullMap, 500); return; }
    const el = document.getElementById('fullMap');
    if (!el) return;

    if (!gvMap) {
        gvMap = new google.maps.Map(el, {
            center: { lat: 15.6445, lng: 32.4777 }, zoom: 13,
            mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
            styles: [
                { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                { featureType: 'transit', stylers: [{ visibility: 'off' }] }
            ]
        });
    }
    refreshMapCaptains();
}



async function refreshMapCaptains() {
    const map = gvMap || miniMapInstance;
    if (map) {
        // We do NOT clear captainMarkers here to preserve smooth animations.
        // loadMapCaptains will upsert them properly.
        await loadMapCaptains(map);
    }
}

// Google Maps callback
window._gvMapInit = function() {
    if (currentPage === 'overview') initMiniMap();
    if (currentPage === 'livemap') initFullMap();
};
if (window._gvMapReady) window._gvMapInit();

// ── Logout ──
function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'admin-login.html';
}

// ── Mobile Detection ──
function checkMobile() {
    const toggle = document.getElementById('menuToggle');
    if (window.innerWidth <= 991) toggle.style.display = 'flex';
    else toggle.style.display = 'none';
}
window.addEventListener('resize', checkMobile);
checkMobile();

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    applyAdminPermissionsUI(); // 🔐 إخفاء التنقل غير المصرّح للأدمن المساعد
    loadDashboard();
    loadAdminNotifications(); // 🔔 تحميل سجلّ الإشعارات حتى لا تكون الخانة فارغة
});

// 🔔 تحميل سجلّ إشعارات الأدمن من السيرفر (تظهر عند الفتح وتبقى بعد التحديث)
async function loadAdminNotifications() {
    try {
        const res = await fetch(`${BASE}/api/notifications?limit=50`, { headers: headers() });
        if (!res.ok) return;
        const data = await res.json();
        const items = (data.notifications || []).map(n => ({
            title: n.title || 'إشعار',
            message: n.message || '',
            orderId: (n.type === 'new_order' || n.type === 'shop_order' || n.type === 'admin_order_alert') ? (n.relatedId || null) : null,
            time: n.createdAt || new Date(),
            unread: !n.isRead
        }));
        // دمج السجلّ مع أي إشعارات حيّة وصلت قبل اكتمال التحميل (الأحدث أولاً)
        notifications = [...notifications, ...items]
            .sort((a, b) => new Date(b.time) - new Date(a.time))
            .slice(0, 100);
        updateNotifCount();
        renderNotifications();
    } catch (e) { /* غير حرج */ }
}

// ── Periodic refresh ──
setInterval(() => {
    if (currentPage === 'overview') { loadLiveOrders(); loadOnlineCaptainsCount(); }
    if (currentPage === 'livemap') refreshMapCaptains();
}, 15000); //  Every 15s for more responsive map

// ── Socket reconnect: reload map data ──
socket.on('reconnect', () => {
    console.log(' Socket reconnected — refreshing map');
    if (currentPage === 'livemap') refreshMapCaptains();
    if (currentPage === 'overview') { loadLiveOrders(); initMiniMap(); }
});

// ── View Order Details ──
// يفتح صفحة التفاصيل الكاملة (خريطة + نقاط الاستلام/التسليم + تغيير الحالة)
// بدل الـ modal النصي البسيط.
window.viewOrder = function(id) {
    if (!id) return;
    window.location.href = `admin-order-details.html?id=${id}`;
};
