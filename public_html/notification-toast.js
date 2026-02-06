/**
 * نظام إشعارات وصل-لي الموحد
 * يدعم التنبيهات الصوتية، الـ Toasts العصرية، وتحديثات Socket.io
 * تم الإصلاح: الربط مع السيرفر الحقيقي
 */

const showToast = (title, message, type = 'info') => {
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
    const colors = {
        'order_accepted': '#3498db',
        'order_update': '#f39c12',
        'order_completed': '#27ae60',
        'chat': '#8e44ad',
        'info': '#0a8754',
        'error': '#dc3545',
        'warning': '#ffc107'
    };

    const color = colors[type] || colors.info;

    toast.style.cssText = `
        background: white; border-right: 5px solid ${color};
        padding: 15px; border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1); display: flex; align-items: center;
        gap: 12px; animation: slideDown 0.5s ease-out; direction: rtl;
        cursor: pointer; position: relative;
    `;

    // تحديد الأيقونة
    let icon = 'bi-bell';
    if (type.includes('order')) icon = 'bi-box-seam';
    if (type === 'chat') icon = 'bi-chat-dots';
    if (type === 'error') icon = 'bi-exclamation-circle';

    toast.innerHTML = `
        <div style="background:${color}22; padding:10px; border-radius:50%; color:${color}; display:flex; align-items:center; justify-content:center;">
            <i class="bi ${icon}" style="font-size:20px;"></i>
        </div>
        <div style="flex:1">
            <h4 style="margin:0; font-size:14px; font-weight:700; color:#333;">${title}</h4>
            <p style="margin:3px 0 0; font-size:12px; color:#666; line-height:1.4;">${message}</p>
        </div>
        <div style="position: absolute; bottom: 0; left: 0; height: 3px; background: ${color}44; width: 100%; animation: progress 4s linear forwards;"></div>
    `;

    // إضافة الأنيميشن
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.innerHTML = `
            @keyframes slideDown {
                from { transform: translateY(-100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            @keyframes fadeOut {
                to { opacity: 0; transform: translateY(-20px); }
            }
            @keyframes progress {
                from { width: 100%; }
                to { width: 0%; }
            }
        `;
        document.head.appendChild(style);
    }

    container.appendChild(toast);

    // إزالة التنبيه بعد 4 ثوانٍ (فترة كافية للقراءة)
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.5s forwards';
        setTimeout(() => toast.remove(), 500);
    }, 4000);

    toast.onclick = () => {
        // توجيه المستخدم حسب نوع الصفحة
        if (window.location.href.includes('captain')) {
            window.location.href = 'captain-notifications.html';
        } else {
            window.location.href = 'notifications.html';
        }
    };

    playNotificationSound();
};

// ✅ دالة الاتصال بالسيرفر (تم التعديل والإصلاح هنا)
const initNotificationSocket = (userId) => {
    // التأكد من وجود userId ومكتبة socket.io
    if (!userId || typeof io === 'undefined') return;

    // 1. تحديد رابط السيرفر بدقة (الأولوية لـ API_URL من config.js)
    const serverUrl = (typeof API_URL !== 'undefined') ? API_URL :
        (window.API_BASE_URL || 'https://wassili.site');

    console.log(`🔌 Initializing Notification Socket to: ${serverUrl}`);

    try {
        // 2. إعداد الاتصال مع خيارات النقل الصحيحة (مهم جداً للـ cPanel)
        const socket = io(serverUrl, {
            path: '/socket.io', // المسار القياسي
            transports: ['websocket', 'polling'], // دعم البروتوكولين لضمان الاتصال
            reconnection: true
        });

        const cleanUserId = String(userId).trim();

        socket.on('connect', () => {
            socket.emit('user_join', cleanUserId);
            console.log('✅ Notification system active for:', cleanUserId);
        });

        socket.on('new_notification', (notification) => {
            showToast(notification.title, notification.message, notification.type);
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

        socket.on('connect_error', (err) => {
            // تجاهل الأخطاء الصامتة
            // console.warn('Socket connect error', err);
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

// تصدير الدوال للاستخدام العام
window.showToast = showToast;
window.initNotificationSocket = initNotificationSocket;