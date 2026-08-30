/**
 * 🔔 نظام إشعارات وجيز الموحد (Wajeez Unified In-App Toast & Socket System)
 * 
 * - تصميم عالي الفخامة (Glassmorphism / Dynamic Island Aesthetic)
 * - دعم كامل لمنطقة الأمان (Safe Area / Status Bar / Notch) في أندرويد و iOS
 * - منع تراكم وتكرار الإشعارات مع حد أقصى للظهور وتمرير الإغلاق باللمس (Swipe to Dismiss)
 * - دعم الوضع الليلي والنهاري، التنبيهات الصوتية والاهتزاز الذكي (Haptics)
 */

(function () {
    'use strict';

    // سجل الإشعارات النشطة للتحكم بالتكديس ومنع التكرار
    let _activeToasts = [];
    const MAX_VISIBLE_TOASTS = 2;
    let _lastToastHash = '';
    let _lastToastTime = 0;

    // خريطة التنسيق البصري للأنواع المختلفة
    const TOAST_THEMES = {
        'order_accepted': {
            gradient: 'linear-gradient(135deg, #0284c7, #38bdf8)',
            icon: 'bi-bicycle',
            accent: '#0284c7'
        },
        'order_assigned': {
            gradient: 'linear-gradient(135deg, #0284c7, #0ea5e9)',
            icon: 'bi-person-check-fill',
            accent: '#0284c7'
        },
        'order_completed': {
            gradient: 'linear-gradient(135deg, #059669, #10b981)',
            icon: 'bi-check-circle-fill',
            accent: '#059669'
        },
        'order_delivered': {
            gradient: 'linear-gradient(135deg, #059669, #10b981)',
            icon: 'bi-box2-heart-fill',
            accent: '#059669'
        },
        'success': {
            gradient: 'linear-gradient(135deg, #048c5b, #10b981)',
            icon: 'bi-check2-circle',
            accent: '#048c5b'
        },
        'order_update': {
            gradient: 'linear-gradient(135deg, #ea580c, #f97316)',
            icon: 'bi-arrow-repeat',
            accent: '#ea580c'
        },
        'chat': {
            gradient: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            icon: 'bi-chat-dots-fill',
            accent: '#7c3aed'
        },
        'chat_message': {
            gradient: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            icon: 'bi-chat-text-fill',
            accent: '#7c3aed'
        },
        'error': {
            gradient: 'linear-gradient(135deg, #dc2626, #f43f5e)',
            icon: 'bi-exclamation-circle-fill',
            accent: '#dc2626'
        },
        'order_cancelled': {
            gradient: 'linear-gradient(135deg, #dc2626, #f43f5e)',
            icon: 'bi-x-circle-fill',
            accent: '#dc2626'
        },
        'order_expired': {
            gradient: 'linear-gradient(135deg, #dc2626, #ef4444)',
            icon: 'bi-clock-history',
            accent: '#dc2626'
        },
        'warning': {
            gradient: 'linear-gradient(135deg, #d97706, #fbbf24)',
            icon: 'bi-exclamation-triangle-fill',
            accent: '#d97706'
        },
        'info': {
            gradient: 'linear-gradient(135deg, #0d9488, #14b8a6)',
            icon: 'bi-bell-fill',
            accent: '#0d9488'
        },
        'system': {
            gradient: 'linear-gradient(135deg, #048c5b, #059669)',
            icon: 'bi-shield-check',
            accent: '#048c5b'
        }
    };

    // حقن التنسيقات الحديثة
    function injectStyles() {
        if (document.getElementById('wj-toast-styles')) return;

        const style = document.createElement('style');
        style.id = 'wj-toast-styles';
        style.textContent = `
            /* 🧭 حاوية التوست التكيفية مع الـ Safe Area */
            .wj-toast-container {
                position: fixed;
                top: max(16px, calc(var(--sat, env(safe-area-inset-top, 0px)) + 12px));
                left: 50%;
                transform: translateX(-50%);
                z-index: 1000000;
                width: calc(100% - 28px);
                max-width: 400px;
                display: flex;
                flex-direction: column;
                gap: 9px;
                align-items: center;
                pointer-events: none;
            }

            /* بطاقة الإشعار المنبثق الفخمة */
            .wj-toast {
                width: 100%;
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                border: 1px solid rgba(226, 232, 240, 0.9);
                border-radius: 18px;
                box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.14), 0 4px 12px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.9);
                padding: 10px 14px;
                display: flex;
                align-items: center;
                gap: 12px;
                direction: rtl;
                cursor: pointer;
                position: relative;
                overflow: hidden;
                pointer-events: auto;
                user-select: none;
                touch-action: pan-y;
                animation: wjToastSlideIn 0.38s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease, box-shadow 0.2s ease;
            }

            .wj-toast:active {
                transform: scale(0.975);
            }

            .wj-toast.wj-toast-out {
                animation: wjToastSlideOut 0.32s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
            }

            /* الوضع الليلي */
            body.dark-mode .wj-toast,
            [data-theme="dark"] .wj-toast {
                background: rgba(15, 23, 42, 0.94);
                border: 1px solid rgba(255, 255, 255, 0.12);
                box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                color: #f8fafc;
            }

            /* أيقونة الإشعار */
            .wj-toast-icon {
                width: 40px;
                height: 40px;
                flex-shrink: 0;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #ffffff;
                font-size: 18px;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
            }

            /* المحتوى النصي */
            .wj-toast-content {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .wj-toast-title {
                margin: 0;
                font-size: 13.5px;
                font-weight: 800;
                color: #0f172a;
                line-height: 1.3;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                letter-spacing: -0.2px;
            }
            body.dark-mode .wj-toast-title,
            [data-theme="dark"] .wj-toast-title {
                color: #f8fafc;
            }

            .wj-toast-msg {
                margin: 0;
                font-size: 12px;
                font-weight: 500;
                color: #64748b;
                line-height: 1.35;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }
            body.dark-mode .wj-toast-msg,
            [data-theme="dark"] .wj-toast-msg {
                color: #94a3b8;
            }

            /* الإجراءات والإغلاق */
            .wj-toast-actions {
                display: flex;
                align-items: center;
                gap: 4px;
                flex-shrink: 0;
            }

            .wj-toast-close {
                width: 26px;
                height: 26px;
                border-radius: 50%;
                border: none;
                background: rgba(0, 0, 0, 0.05);
                color: #64748b;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.15s ease;
                padding: 0;
            }
            .wj-toast-close:hover {
                background: rgba(0, 0, 0, 0.1);
                color: #0f172a;
            }
            body.dark-mode .wj-toast-close,
            [data-theme="dark"] .wj-toast-close {
                background: rgba(255, 255, 255, 0.1);
                color: #94a3b8;
            }
            body.dark-mode .wj-toast-close:hover,
            [data-theme="dark"] .wj-toast-close:hover {
                background: rgba(255, 255, 255, 0.2);
                color: #f8fafc;
            }

            .wj-toast-arrow {
                font-size: 13px;
                color: #94a3b8;
                margin-right: 2px;
            }

            /* شريط التقدم الزمني */
            .wj-toast-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 2.5px;
                width: 100%;
                opacity: 0.7;
                animation: wjToastProgress 4s linear forwards;
            }

            @keyframes wjToastSlideIn {
                0% {
                    transform: translateY(-26px) scale(0.93);
                    opacity: 0;
                }
                100% {
                    transform: translateY(0) scale(1);
                    opacity: 1;
                }
            }

            @keyframes wjToastSlideOut {
                0% {
                    transform: translateY(0) scale(1);
                    opacity: 1;
                    max-height: 80px;
                    margin-bottom: 0;
                }
                100% {
                    transform: translateY(-22px) scale(0.9);
                    opacity: 0;
                    max-height: 0;
                    padding-top: 0;
                    padding-bottom: 0;
                    margin-bottom: -9px;
                }
            }

            @keyframes wjToastProgress {
                0% { width: 100%; }
                100% { width: 0%; }
            }
        `;
        document.head.appendChild(style);
    }

    // دالة إنشاء وإظهار الإشعار المنبثق
    const showToast = (arg1, arg2, arg3, arg4) => {
        let title = '';
        let message = '';
        let type = 'info';
        let actionUrl = null;

        // دعم مختلف أشكال الاستدعاء (Overloads)
        if (arg4 !== undefined) {
            title = String(arg1 || '');
            message = String(arg2 || '');
            type = arg3 || 'info';
            actionUrl = arg4;
        } else if (arg3 !== undefined) {
            title = String(arg1 || '');
            message = String(arg2 || '');
            type = arg3 || 'info';
        } else if (arg2 !== undefined) {
            const knownTypes = ['info', 'success', 'warning', 'error', 'danger', 'chat', 'chat_message', 'order_update', 'order_accepted', 'order_completed', 'order_delivered', 'order_cancelled', 'order_expired', 'system'];
            if (knownTypes.includes(arg2)) {
                title = 'تنبيه';
                message = String(arg1 || '');
                type = arg2;
            } else {
                title = String(arg1 || '');
                message = String(arg2 || '');
                type = 'info';
            }
        } else if (arg1 !== undefined) {
            title = 'تنبيه';
            message = String(arg1 || '');
            type = 'info';
        }

        // منع تكرار نفس التوست المتطابق في أقل من 2 ثانية
        const hash = `${title}_${message}_${type}`;
        const now = Date.now();
        if (hash === _lastToastHash && (now - _lastToastTime) < 2000) {
            return;
        }
        _lastToastHash = hash;
        _lastToastTime = now;

        // تأكد من تحميل التنسيقات والأيقونات
        injectStyles();
        if (!document.querySelector('link[href*="bootstrap-icons"]')) {
            const biLink = document.createElement('link');
            biLink.rel = 'stylesheet';
            biLink.href = 'vendor/bootstrap-icons/bootstrap-icons.min.css';
            document.head.appendChild(biLink);
        }

        // إنشاء الحاوية إن لم تكن موجودة
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'wj-toast-container';
            document.body.appendChild(container);
        }

        // إزالة أقدم توست إذا زاد العدد عن الحد المسموح
        while (_activeToasts.length >= MAX_VISIBLE_TOASTS) {
            const oldest = _activeToasts.shift();
            if (oldest && oldest.el && oldest.el.parentNode) {
                oldest.dismiss();
            }
        }

        const theme = TOAST_THEMES[type] || TOAST_THEMES['info'];
        const toast = document.createElement('div');
        toast.className = `wj-toast wj-toast-${type}`;

        toast.innerHTML = `
            <div class="wj-toast-icon" style="background:${theme.gradient};">
                <i class="bi ${theme.icon}"></i>
            </div>
            <div class="wj-toast-content">
                <h4 class="wj-toast-title">${title}</h4>
                <p class="wj-toast-msg">${message}</p>
            </div>
            <div class="wj-toast-actions">
                ${actionUrl ? '<i class="bi bi-chevron-left wj-toast-arrow"></i>' : ''}
                <button type="button" class="wj-toast-close" title="إغلاق" aria-label="إغلاق">
                    <i class="bi bi-x"></i>
                </button>
            </div>
            <div class="wj-toast-progress" style="background:${theme.accent};"></div>
        `;

        let timer = null;
        let isDismissed = false;

        const dismiss = () => {
            if (isDismissed) return;
            isDismissed = true;
            clearTimeout(timer);
            toast.classList.add('wj-toast-out');
            setTimeout(() => {
                toast.remove();
                _activeToasts = _activeToasts.filter(t => t.el !== toast);
            }, 320);
        };

        // مؤقت الإغلاق التلقائي (4 ثوانٍ)
        timer = setTimeout(dismiss, 4000);

        // زر الإغلاق
        const closeBtn = toast.querySelector('.wj-toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dismiss();
            });
        }

        // النقر على الإشعار للتوجيه
        toast.addEventListener('click', () => {
            dismiss();
            if (actionUrl) {
                window.location.href = actionUrl;
            } else if (window.location.href.includes('captain')) {
                window.location.href = 'captain-notifications.html';
            } else if (window.location.href.includes('admin')) {
                // البقاء في صفحة الأدمن أو فتح الإشعار
            } else {
                window.location.href = 'notifications.html';
            }
        });

        // إيماءة التمرير للأعلى للإغلاق (Swipe up to dismiss)
        let touchStartY = 0;
        toast.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            clearTimeout(timer); // إيقاف المؤقت أثناء لمس المستخدم
        }, { passive: true });

        toast.addEventListener('touchend', (e) => {
            const touchEndY = e.changedTouches[0].clientY;
            if (touchStartY - touchEndY > 30) {
                // سحب للأعلى بمقدار 30 بكسل على الأقل
                dismiss();
            } else {
                timer = setTimeout(dismiss, 2500); // استئناف المؤقت بعد الإفلات
            }
        }, { passive: true });

        container.appendChild(toast);
        _activeToasts.push({ el: toast, dismiss });

        // تشغيل صوت التنبيه واهتزاز خفيف للأندرويد إن توفر
        playNotificationSound();
        try {
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
                window.Capacitor.Plugins.Haptics.impact({ style: 'LIGHT' });
            }
        } catch (_) {}
    };

    // ==========================================
    // 🔴 Badge Helper — علامة رسالة جديدة على زر محادثة التاجر
    // ==========================================
    function _setChatMerchantBadge(orderId) {
        const stored = JSON.parse(localStorage.getItem('_unreadChatOrders') || '[]');
        if (!stored.includes(String(orderId))) {
            stored.push(String(orderId));
            localStorage.setItem('_unreadChatOrders', JSON.stringify(stored));
        }

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
            chatBtn.style.position = 'relative';
            chatBtn.appendChild(dot);

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

    window._clearChatBadge = function(orderId) {
        let stored = JSON.parse(localStorage.getItem('_unreadChatOrders') || '[]');
        stored = stored.filter(id => id !== String(orderId));
        localStorage.setItem('_unreadChatOrders', JSON.stringify(stored));
        const dot = document.getElementById('_chatBadgeDot');
        if (dot) dot.remove();
    };

    (function checkUnreadBadgeOnLoad() {
        const stored = JSON.parse(localStorage.getItem('_unreadChatOrders') || '[]');
        if (stored.length > 0) {
            setTimeout(() => {
                const lastUnread = stored[stored.length - 1];
                const chatBtn = document.getElementById('placeModalChatBtn');
                if (chatBtn && !document.getElementById('_chatBadgeDot')) {
                    _setChatMerchantBadge(lastUnread);
                }
            }, 800);
        }
    })();

    // ✅ دالة الاتصال بالسيرفر
    const initNotificationSocket = (userId) => {
        if (!userId || typeof io === 'undefined') return;

        if (window.socket && window.socket.connected && window._socketUserId === String(userId)) {
            return;
        }

        if (window.socket) {
            window.socket.disconnect();
            window.socket = null;
        }

        const serverUrl = (typeof API_URL !== 'undefined') ? API_URL :
            (window.API_BASE_URL || 'https://wajeezsd.com');

        try {
            const socket = io(serverUrl, {
                path: '/socket.io',
                transports: ['websocket', 'polling'],
                auth: { token: localStorage.getItem('adminToken') || localStorage.getItem('token') },
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 3000,
                reconnectionDelayMax: 15000,
                timeout: 10000
            });

            window.socket = socket;
            window._socketUserId = String(userId);
            const cleanUserId = String(userId).trim();

            socket.on('connect', () => {
                socket.emit('user_join', cleanUserId);
                refreshUnreadBadge();
            });

            socket.on('new_notification', (notification) => {
                if (notification.type === 'chat_message' && notification.relatedId) {
                    const orderId = notification.relatedId;
                    const senderId = notification.senderId || '';
                    const chatUrl = `chat.html?orderId=${orderId}&receiverId=${senderId}`;
                    showToast(notification.title, notification.message, 'chat', chatUrl);
                    _setChatMerchantBadge(orderId);
                } else {
                    showToast(notification.title, notification.message, notification.type);
                }
                bumpUnreadBadge();

                window.dispatchEvent(new CustomEvent('wajeez:new-notification', {
                    detail: notification
                }));
            });

            socket.on('new_message', (msg) => {
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

                if (statusMap[data.status]) {
                    showToast('تحديث الطلب', statusMap[data.status], 'order_update');
                }

                if (typeof loadOrders === 'function') {
                    loadOrders();
                }
            });

            socket.on('account_role_changed', () => {
                if (window.Auth && typeof window.Auth.syncRole === 'function') {
                    window.Auth.syncRole();
                }
            });

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
        } catch (e) {}
    }

    function renderUnreadBadge(count) {
        count = Number(count) || 0;
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
                if (window.Auth && window.Auth.logout) window.Auth.logout();
                else { localStorage.removeItem('token'); localStorage.removeItem('adminToken'); }
                return;
            }
            if (!res.ok) return;
            const data = await res.json();
            renderUnreadBadge(data.unreadCount || 0);
        } catch (e) {}
    }

    function bumpUnreadBadge() {
        renderUnreadBadge((window._unreadNotifCount || 0) + 1);
    }

    window.renderUnreadBadge = renderUnreadBadge;
    window.refreshUnreadBadge = refreshUnreadBadge;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refreshUnreadBadge);
    } else {
        refreshUnreadBadge();
    }

    window.showToast = showToast;
    window.initNotificationSocket = initNotificationSocket;

    (function autoInitNotificationSocket() {
        function _tryInit() {
            try {
                const token = (window.Auth && window.Auth.getToken && window.Auth.getToken())
                    || localStorage.getItem('token') || localStorage.getItem('adminToken');
                if (!token) return;
                let uid = '';
                try { uid = (window.Auth && window.Auth.getUser && (window.Auth.getUser() || {})._id) || ''; } catch (_) {}
                uid = uid || localStorage.getItem('userId') || '';
                if (uid) initNotificationSocket(uid);
            } catch (_) {}
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _tryInit);
        } else {
            _tryInit();
        }
    })();
})();