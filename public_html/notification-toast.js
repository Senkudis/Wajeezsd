/**
 * نظام إشعارات وجيز الموحد
 * يدعم التنبيهات الصوتية، الـ Toasts العصرية، وتحديثات Socket.io
 * تم الإصلاح: الربط مع السيرفر الحقيقي
 */

const showToast = (title, message, type = 'info', actionUrl = null) => {
    // ✅ FIX: تأكد من تحميل Bootstrap Icons إذا لم تكن موجودة
    if (!document.querySelector('link[href*="bootstrap-icons"]')) {
        const biLink = document.createElement('link');
        biLink.rel = 'stylesheet';
        biLink.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';
        document.head.appendChild(biLink);
    }

    // إنشاء حاوية التنبيهات إذا لم تكن موجودة
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            z-index: 9999; width: 90%; max-width: 400px;
            display: flex; flex-direction: column; gap: 10px;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');

    // ✅ خريطة موسّعة لجميع أنواع الإشعارات
    const typeMap = {
        'order_accepted': { color: '#0d6efd', icon: 'bi-bicycle', bg: '#e8f0fe' },
        'order_completed': { color: '#198754', icon: 'bi-check-circle-fill', bg: '#e8f5e9' },
        'order_update': { color: '#fd7e14', icon: 'bi-arrow-repeat', bg: '#fff3e0' },
        'chat': { color: '#6f42c1', icon: 'bi-chat-dots-fill', bg: '#f3e8ff' },
        'info': { color: '#04553A', icon: 'bi-bell-fill', bg: '#e0f5ef' },
        'error': { color: '#dc3545', icon: 'bi-exclamation-circle-fill', bg: '#fdecea' },
        'warning': { color: '#ffc107', icon: 'bi-exclamation-triangle-fill', bg: '#fff8e1' },
        'system': { color: '#0dcaf0', icon: 'bi-bell-fill', bg: '#e0f7fa' },
    };

    const tm = typeMap[type] || typeMap['info'];

    toast.style.cssText = `
        background: white; border-right: 4px solid ${tm.color};
        padding: 12px 14px; border-radius: 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12); display: flex; align-items: center;
        gap: 12px; animation: slideDown 0.4s ease-out; direction: rtl;
        cursor: pointer; position: relative; overflow: hidden;
    `;

    toast.innerHTML = `
        <div style="width:42px;height:42px;flex-shrink:0;border-radius:50%;background:${tm.bg};
                    border:2px solid ${tm.color}40;display:flex;align-items:center;justify-content:center;">
            <i class="bi ${tm.icon}" style="font-size:18px;color:${tm.color};"></i>
        </div>
        <div style="flex:1;min-width:0;">
            <h4 style="margin:0;font-size:13px;font-weight:700;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</h4>
            <p style="margin:3px 0 0;font-size:12px;color:#666;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${message}</p>
        </div>
        <div style="position:absolute;bottom:0;left:0;height:3px;background:${tm.color}55;width:100%;animation:toastProgress 4s linear forwards;"></div>
    `;

    // إضافة الأنيميشن
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.innerHTML = `
            @keyframes slideDown {
                from { transform: translateY(-20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            @keyframes fadeOut {
                to { opacity: 0; transform: translateY(-10px); }
            }
            @keyframes toastProgress {
                from { width: 100%; }
                to { width: 0%; }
            }
        `;
        document.head.appendChild(style);
    }

    container.appendChild(toast);

    // إزالة التنبيه بعد 4 ثوانٍ
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.4s forwards';
        setTimeout(() => toast.remove(), 400);
    }, 4000);

    toast.onclick = () => {
        toast.remove();
        if (actionUrl) {
            // انتقال مباشر للرابط المحدد (مثلاً: المحادثة)
            window.location.href = actionUrl;
        } else if (window.location.href.includes('captain')) {
            window.location.href = 'captain-notifications.html';
        } else {
            window.location.href = 'notifications.html';
        }
    };

    playNotificationSound();
};

// ==========================================
// 🔴 Badge Helper — علامة رسالة جديدة على زر محادثة التاجر
// ==========================================
function _setChatMerchantBadge(orderId) {
    // 1. حفظ orderId في localStorage كـ "unread chat"
    const stored = JSON.parse(localStorage.getItem('_unreadChatOrders') || '[]');
    if (!stored.includes(String(orderId))) {
        stored.push(String(orderId));
        localStorage.setItem('_unreadChatOrders', JSON.stringify(stored));
    }

    // 2. لو زر "محادثة التاجر" موجود في الصفحة الحالية، ضع عليه نقطة حمراء
    const chatBtn = document.getElementById('placeModalChatBtn');
    if (chatBtn && !document.getElementById('_chatBadgeDot')) {
        const dot = document.createElement('span');
        dot.id = '_chatBadgeDot';
        dot.style.cssText = `
            display:inline-block; width:10px; height:10px; border-radius:50%;
            background:#ef4444; border:2px solid white;
            position:absolute; top:6px; right:6px;
            animation: chatBadgePulse 1.2s ease-in-out infinite;
        `;
        // تأكد من أن الزر relative
        chatBtn.style.position = 'relative';
        chatBtn.appendChild(dot);

        // CSS للنبضة
        if (!document.getElementById('_chatBadgeStyle')) {
            const s = document.createElement('style');
            s.id = '_chatBadgeStyle';
            s.textContent = `@keyframes chatBadgePulse {
                0%,100%{transform:scale(1);opacity:1;}
                50%{transform:scale(1.4);opacity:.7;}
            }`;
            document.head.appendChild(s);
        }
    }
}
window._setChatMerchantBadge = _setChatMerchantBadge;

// ==========================================
// ✅ مسح البادج عند فتح المحادثة
// ==========================================
window._clearChatBadge = function(orderId) {
    let stored = JSON.parse(localStorage.getItem('_unreadChatOrders') || '[]');
    stored = stored.filter(id => id !== String(orderId));
    localStorage.setItem('_unreadChatOrders', JSON.stringify(stored));
    const dot = document.getElementById('_chatBadgeDot');
    if (dot) dot.remove();
};

// ✅ تحقق من وجود رسائل غير مقروءة وضع بادج عند تحميل الصفحة
// ✅ إصلاح BUG-G: نستخدم refreshUnreadBadge() من الـ API بدل تخمين orderId غير صحيح
(function checkUnreadBadgeOnLoad() {
    const stored = JSON.parse(localStorage.getItem('_unreadChatOrders') || '[]');
    if (stored.length > 0) {
        setTimeout(() => {
            // ضع badge على زر المحادثة إن كان موجوداً — آخر order غير مقروء
            const lastUnread = stored[stored.length - 1];
            const chatBtn = document.getElementById('placeModalChatBtn');
            if (chatBtn && !document.getElementById('_chatBadgeDot')) {
                _setChatMerchantBadge(lastUnread);
            }
        }, 800);
    }
    // ✅ دائماً: جلب عدد الإشعارات غير المقروءة من السيرفر وتحديث شارة التنقّل
    // (refreshUnreadBadge تُستدعى تلقائياً في أسفل الملف)
})();

// ✅ دالة الاتصال بالسيرفر (تم التعديل والإصلاح هنا)
const initNotificationSocket = (userId) => {
    // التأكد من وجود userId ومكتبة socket.io
    if (!userId || typeof io === 'undefined') return;

    // ✅ SINGLETON GUARD: لا تنشئ اتصالاً جديداً إذا كان الاتصال قائماً للمستخدم نفسه
    if (window.socket && window.socket.connected && window._socketUserId === String(userId)) {
        console.log('🔌 Socket already connected for user:', userId);
        return;
    }

    // ✅ أغلق الاتصال القديم إن وجد قبل إنشاء جديد
    if (window.socket) {
        console.log('🔌 Closing stale socket before reconnecting...');
        window.socket.disconnect();
        window.socket = null;
    }

    // 1. تحديد رابط السيرفر بدقة (الأولوية لـ API_URL من config.js)
    const serverUrl = (typeof API_URL !== 'undefined') ? API_URL :
        (window.API_BASE_URL || 'https://wajeezsd.com');

    console.log(`🔌 Initializing Notification Socket to: ${serverUrl}`);

    try {
        // 2. إعداد الاتصال مع خيارات النقل الصحيحة (مهم جداً للـ cPanel)
        const socket = io(serverUrl, {
            path: '/socket.io', // المسار القياسي
            transports: ['websocket', 'polling'], // ✅ websocket أولاً لمنع انقطاع شبكة الجوال عند تبديل التابات
            auth: { token: localStorage.getItem('adminToken') || localStorage.getItem('token') },
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 3000,         // ✅ 3 ثوان لمنع الإجهاد عند العودة للتبويب
            reconnectionDelayMax: 15000,
            timeout: 10000
        });

        // ✅ FIX: Expose socket globally so captain-service.js can use it for location updates
        window.socket = socket;
        window._socketUserId = String(userId);

        const cleanUserId = String(userId).trim();

        socket.on('connect', () => {
            socket.emit('user_join', cleanUserId);
            console.log('✅ Notification system active for:', cleanUserId);
            // 🔔 حدّث شارة غير المقروء عند كل اتصال/إعادة اتصال — ضمان عدم تفويت إشعار
            refreshUnreadBadge();
        });

        socket.on('new_notification', (notification) => {
            // 💬 لو الإشعار رسالة محادثة: نفتح Chat مباشرةً عند الضغط + نحط علامة على زر التاجر
            if (notification.type === 'chat_message' && notification.relatedId) {
                const orderId   = notification.relatedId;
                // استخرج senderId من بيانات الإشعار لو موجود
                const senderId  = notification.senderId || '';
                const chatUrl   = `chat.html?orderId=${orderId}&receiverId=${senderId}`;

                showToast(notification.title, notification.message, 'chat', chatUrl);

                // 🔴 ضع علامة (Badge) على زر "محادثة التاجر" لو الزر موجود في الصفحة الحالية
                _setChatMerchantBadge(orderId);
            } else {
                showToast(notification.title, notification.message, notification.type);
            }
            // 🔔 إشعار جديد وصل → ارفع شارة غير المقروء فوراً
            bumpUnreadBadge();

            // 📄 صفحة الإشعارات إن كانت مفتوحة تُحدّث قائمتها فوراً.
            // بلا هذا يرى المستخدم التوست ثم قائمةً قديمة تحته حتى يعيد التحميل.
            window.dispatchEvent(new CustomEvent('wajeez:new-notification', {
                detail: notification
            }));
        });

        // ✅ إضافة مستمع لـ new_message لتحديث البادج في الوقت الفعلي
        socket.on('new_message', (msg) => {
            // لو المستخدم مش بشاهد محادثة هذا الطلب حالياً
            if (!window._activeChatOrderId || window._activeChatOrderId !== msg.order) {
                _setChatMerchantBadge(msg.order);
            }
        });

        socket.on('order_status_updated', (data) => {
            const statusMap = {
                'accepted': 'تم قبول طلبك! الكابتن في الطريق.',
                'picked_up': 'تم استلام طلبك بنجاح.',
                'delivered': 'تم توصيل طلبك، شكراً لك!',
                'cancelled': 'تم إلغاء الطلب.'
            };

            // عرض التنبيه فقط إذا كانت الحالة معروفة
            if (statusMap[data.status]) {
                showToast('تحديث الطلب', statusMap[data.status], 'order_update');
            }

            // تحديث قائمة الطلبات إذا كنا في صفحة الطلبات
            if (typeof loadOrders === 'function') {
                loadOrders();
            }
        });

        // 🔄 ترقية الدور لحظياً (مثلاً: الأدمن وافق على طلب تاجر) — يجدّد التوكن
        // وبيانات الجهاز فوراً دون تسجيل خروج/دخول أو حتى إعادة تحميل الصفحة
        socket.on('account_role_changed', () => {
            if (window.Auth && typeof window.Auth.syncRole === 'function') {
                window.Auth.syncRole();
            }
        });

        socket.on('connect_error', (err) => {
            // تجاهل الأخطاء الصامتة
            // console.warn('Socket connect error', err);
        });

        // ✅ نظّف المرجع عند قطع الاتصال النهائي
        socket.on('disconnect', (reason) => {
            if (reason === 'io server disconnect' || reason === 'io client disconnect') {
                window.socket = null;
                window._socketUserId = null;
            }
        });

    } catch (e) {
        console.error('Socket initialization failed:', e);
    }
};

// دالة توليد صوت التنبيه (بدون ملفات خارجية)
function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        oscillator.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.1); // C6

        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
        // المتصفح قد يمنع الصوت إذا لم يكن هناك تفاعل من المستخدم
    }
}

// ══════════════════════════════════════════════════════════════
// 🔔 شارة الإشعارات غير المقروءة — تضمن أن المستخدم لا يفوّت أي إشعار
//    تُحدَّث عند: تحميل الصفحة، الاتصال/إعادة الاتصال بالسوكت، ووصول إشعار جديد.
// ══════════════════════════════════════════════════════════════
function renderUnreadBadge(count) {
    count = Number(count) || 0;
    // ابحث عن رابط الإشعارات في شريط التنقّل (عام عبر كل الصفحات)
    const links = document.querySelectorAll('a[href*="notifications"], a[href*="captain-notifications"]');
    links.forEach(link => {
        let badge = link.querySelector('.unread-notif-badge');
        if (count <= 0) { if (badge) badge.remove(); return; }
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'unread-notif-badge';
            badge.style.cssText = 'position:absolute;top:2px;right:8px;min-width:18px;height:18px;padding:0 4px;background:#dc3545;color:#fff;border-radius:99px;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,.3);z-index:5;';
            if (getComputedStyle(link).position === 'static') link.style.position = 'relative';
            link.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : String(count);
    });
    window._unreadNotifCount = count;
}

async function refreshUnreadBadge() {
    try {
        const token = (window.Auth && window.Auth.getToken && window.Auth.getToken())
            || localStorage.getItem('token') || localStorage.getItem('adminToken');
        if (!token) return;
        const baseUrl = (typeof API_URL !== 'undefined') ? API_URL : (window.API_URL || '');
        const res = await fetch(`${baseUrl}/api/notifications/unread-count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401) {
            // التوكن منتهي الصلاحية، نقوم بحذفه بصمت لتجنب تكرار الخطأ
            if (window.Auth && window.Auth.logout) window.Auth.logout();
            else { localStorage.removeItem('token'); localStorage.removeItem('adminToken'); }
            return;
        }
        if (!res.ok) return;
        const data = await res.json();
        renderUnreadBadge(data.unreadCount || 0);
    } catch (e) { /* غير حرج */ }
}

function bumpUnreadBadge() {
    renderUnreadBadge((window._unreadNotifCount || 0) + 1);
}

window.renderUnreadBadge = renderUnreadBadge;
window.refreshUnreadBadge = refreshUnreadBadge;

// حدّث الشارة فور تحميل الصفحة (قبل اتصال السوكت)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshUnreadBadge);
} else {
    refreshUnreadBadge();
}

// تصدير الدوال للاستخدام العام
window.showToast = showToast;
window.initNotificationSocket = initNotificationSocket;

// 🔔 تهيئة تلقائية لسوكت الإشعارات على أي صفحة تُحمِّل هذا الملف —
// حتى تعمل تنبيهات "التطبيق مفتوح" (toast + صوت) في كل مكان يتصفّحه المستخدم،
// لا فقط الصفحات التي تستدعي initNotificationSocket يدوياً (كان client-order وغيرها
// تُحمّل الملف لكن لا تُشغّل السوكت أبداً → لا تنبيه أثناء فتح التطبيق).
// آمنة: initNotificationSocket فيها حارس Singleton فلا تُنشئ اتصالاً مكرراً.
(function autoInitNotificationSocket() {
    function _tryInit() {
        try {
            const token = (window.Auth && window.Auth.getToken && window.Auth.getToken())
                || localStorage.getItem('token') || localStorage.getItem('adminToken');
            if (!token) return;
            let uid = '';
            try { uid = (window.Auth && window.Auth.getUser && (window.Auth.getUser() || {})._id) || ''; } catch (_) {}
            uid = uid || localStorage.getItem('userId') || '';
            if (uid) initNotificationSocket(uid); // يتحقق داخلياً من توفّر io
        } catch (_) { /* غير حرج */ }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _tryInit);
    } else {
        _tryInit();
    }
})();