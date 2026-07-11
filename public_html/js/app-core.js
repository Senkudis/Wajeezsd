// 🔌 إضافات Capacitor عبر الجسر المحلي (window.Capacitor.Plugins) — بلا أي اعتماد على CDN.
// السبب: استيراد الـ ESM من CDN كان يفشل عند أول تشغيل بدون إنترنت → يتعطّل الموديول كاملاً
// فتعلّق شاشة الأذونات. الجسر المحلي متاح فوراً داخل التطبيق الأصلي دون شبكة.
// كل الاستخدامات محميّة (try/catch أو فحص null) فتعمل في المتصفح أيضاً عبر البدائل.
const _CapPlugins = (window.Capacitor && window.Capacitor.Plugins) || {};
const App = _CapPlugins.App || null;
const Network = _CapPlugins.Network || null;
const Toast = _CapPlugins.Toast || null;
const Haptics = _CapPlugins.Haptics || null;
const Geolocation = _CapPlugins.Geolocation || null;
const ImpactStyle = { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' };

window.APP_VERSION = '1.0.7'; // الاصدار الحالي للتطبيق (وجيز — تحديث وشامل)

// دالة عرض الـ Toasts الداخلية (تُستخدم فقط إذا لم تُحمَّل notification-toast.js بعد)
// ✅ إصلاح BUG-2: لا تُعيَّن على window.showToast لتجنّب تعارض التوقيعات
window.showSleekToast = function(msg, type = 'success') {
    const containerId = 'sleek-toast-container';
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.className = 'sleek-toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `sleek-toast toast-${type}`;
    
    // Icon based on type
    let icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    else if (type === 'info') icon = 'fa-info-circle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-hiding');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

const AppCore = {
    init: async () => {
        console.log('📱 Initializing App Core...');

        // ✅ إصلاح BUG-3: إعداد الـ API interceptor أولاً حتى يُعيَّن API_BASE_URL قبل checkForUpdates
        // 0. API Base URL Interceptor (For Native App)
        AppCore.setupApiInterceptor();

        // Check for updates (بعد إعداد الـ URL الصحيح)
        AppCore.checkForUpdates();

        // 1. Hardware Back Button Handling
        await AppCore.setupBackButton();

        // 🔗 روابط المتاجر القصيرة (App Links) — كان معرّفاً بلا استدعاء فالروابط لا تعمل
        await AppCore.setupDeepLinks();

        // 2. Network Status Monitoring
        await AppCore.setupNetworkListener();

        // 3. Setup Haptics
        await AppCore.setupHaptics();

        // 4. Mark as Native App
        document.body.classList.add('is-native-app');

        // 5. Enforce Core Permissions
        await AppCore.enforcePermissions();
    },

    setupApiInterceptor: () => {
        const nativeFetch = window.fetch;
        // Use global API_URL from config.js, or fallback to hardcoded if missing
        const BASE_URL = window.API_URL || 'https://wajeezsd.com';
        window.API_BASE_URL = BASE_URL; // Expose for other scripts

        // 🔒 حماية من الطلبات المكررة (Double-tap / Double-submit)
        // يمنع إرسال نفس طلب POST/PUT/PATCH/DELETE مرتين في نفس الوقت
        const _inFlightMutating = new Set();

        window.fetch = async (...args) => {
            let [resource, config] = args;

            // Only intercept relative URLs starting with /api
            if (typeof resource === 'string' && resource.startsWith('/api')) {
                resource = BASE_URL + resource;
                console.log(`🔌 Intercepted: ${resource}`);
            }

            // 🔒 منع التكرار للطلبات التي تُعدّل البيانات
            const method = ((config && config.method) || 'GET').toUpperCase();
            const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
            const requestKey = isMutating ? `${method}:${resource}` : null;

            if (requestKey) {
                if (_inFlightMutating.has(requestKey)) {
                    console.warn(`[AppCore] Blocked duplicate ${method} → ${resource}`);
                    // إرجاع response فارغ بدل الإرسال مجدداً
                    return new Response(JSON.stringify({ message: 'طلب قيد التنفيذ، يرجى الانتظار...' }), {
                        status: 429,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                _inFlightMutating.add(requestKey);
            }

            try {
                const response = await nativeFetch(resource, config);
                return response;
            } catch (error) {
                console.error("Fetch Error:", error);
                throw error;
            } finally {
                if (requestKey) _inFlightMutating.delete(requestKey);
            }
        };

        if (window.io) {
            const originalIo = window.io;
            window.io = (url, options) => {
                const defaultOpts = { transports: ['polling', 'websocket'], ...options };
                if (!url || typeof url === 'string' && (url === '/' || url.startsWith('/'))) {
                    return originalIo(BASE_URL, defaultOpts || url);
                }
                return originalIo(url, defaultOpts);
            };
        }
    },

    setupBackButton: async () => {
        // تحقق أولاً أن مكتبة App متاحة فعلياً
        if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
            return; // متصفح عادي — ما نحتاجل backButton
        }
        try {
            await App.addListener('backButton', ({ canGoBack }) => {
                // 1. إغلاق أي Modal مفتوح أولاً
                const openModal = document.querySelector('.modal.show');
                if (openModal) {
                    const modalInstance = bootstrap.Modal.getInstance(openModal);
                    if (modalInstance) {
                        modalInstance.hide();
                        return;
                    }
                }

                // 2. إغلاق القائمة الجانبية إذا كانت مفتوحة
                const navToggler = document.querySelector('.navbar-toggler');
                const navCollapse = document.querySelector('.navbar-collapse');
                if (navCollapse && navCollapse.classList.contains('show')) {
                    navToggler?.click();
                    return;
                }

                // 3. التعامل مع التنقل
                if (canGoBack) {
                    window.history.back();
                } else {
                    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('dashboard.html')) {
                        AppCore.showExitConfirm();
                    } else {
                        window.location.href = 'index.html';
                    }
                }
            });
        } catch (e) {
            console.warn('App backButton listener not available', e.message || e);
        }
    },

    // 🔗 Deep Links: رابط متجر قصير (wajeezsd.com/s/<code>) فُتح والتطبيق مثبّت →
    // App Links يوجهه لنا هنا؛ نحلّ الكود عبر الـ API ونفتح صفحة المتجر داخل التطبيق.
    setupDeepLinks: async () => {
        if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
            return; // متصفح عادي — الرابط يعمل مباشرة بلا حاجة لهذا المعالج
        }
        if (!App) return;
        try {
            await App.addListener('appUrlOpen', async ({ url }) => {
                try {
                    const apiUrl = window.API_URL || 'https://wajeezsd.com';
                    
                    // Match Product Short Link: /p/24hex
                    const pMatch = String(url || '').match(/\/p\/([0-9a-fA-F]{24})/);
                    if (pMatch) {
                        const res = await fetch(`${apiUrl}/api/places/resolve-product/${pMatch[1]}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.placeId) {
                                window.location.href = `shop-detail.html?placeId=${data.placeId}&product=${data.productId}`;
                                return;
                            }
                        }
                    }

                    // Match Shop Short Link: /s/code
                    const sMatch = String(url || '').match(/\/s\/([2-9A-HJ-NP-Za-km-z]{4,12})/);
                    if (sMatch) {
                        const res = await fetch(`${apiUrl}/api/places/resolve/${sMatch[1]}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.placeId) {
                                window.location.href = `shop-detail.html?placeId=${data.placeId}`;
                                return;
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Deep link resolution failed:', err.message || err);
                }
            });
        } catch (e) {
            console.warn('appUrlOpen listener not available', e.message || e);
        }
    },

    showExitConfirm: async () => {
        // Dialog plugin not installed — use Swal if available, else native confirm
        let confirmed = false;
        if (window.Swal) {
            const result = await window.Swal.fire({
                title: 'الخروج من التطبيق',
                text: 'هل تريد فعلاً الخروج من وجيز؟',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'نعم، خروج',
                cancelButtonText: 'إلغاء',
                confirmButtonColor: '#dc3545'
            });
            confirmed = result.isConfirmed;
        } else {
            confirmed = window.confirm('هل تريد فعلاً الخروج من وجيز؟');
        }
        if (confirmed) {
            try {
                App.exitApp();
            } catch (e) {
                console.warn('App exit not available');
            }
        }
    },

    setupNetworkListener: async () => {
        try {
            // الحالة الأولية
            const status = await Network.getStatus();
            AppCore.handleNetworkChange(status);

            // الاستماع للتغييرات
            Network.addListener('networkStatusChange', (status) => {
                AppCore.handleNetworkChange(status);
            });
        } catch (e) {
            console.warn('Network plugin not available, using web fallback', e);
            AppCore.handleNetworkChange({ connected: navigator.onLine });
            window.addEventListener('online', () => AppCore.handleNetworkChange({ connected: true }));
            window.addEventListener('offline', () => AppCore.handleNetworkChange({ connected: false }));
        }
    },

    handleNetworkChange: (status) => {
        console.log('Network status:', status);
        const offlineOverlay = document.getElementById('offline-overlay');

        if (!status.connected) {
            // Show Overlay
            if (!offlineOverlay) {
                const overlay = document.createElement('div');
                overlay.id = 'offline-overlay';
                overlay.innerHTML = `
                    <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:white; text-align:center;">
                        <i class="bi bi-wifi-off" style="font-size: 4rem; margin-bottom: 20px; color: #dc3545;"></i>
                        <h3>لا يوجد اتصال بالانترنت</h3>
                        <p>يرجى التحقق من الشبكة للمتابعة</p>
                    </div>
                `;
                document.body.appendChild(overlay);
            } else {
                offlineOverlay.style.display = 'flex';
            }
        } else {
            // Hide Overlay
            if (offlineOverlay) {
                offlineOverlay.style.display = 'none';
                try {
                    Toast.show({
                        text: 'عاد الاتصال بالانترنت 🟢',
                        duration: 'short'
                    });
                } catch(e) {
                    if (window.showToast) window.showToast('عاد الاتصال بالانترنت 🟢');
                }
            }
        }
    },

    setupHaptics: async () => {
        // ✅ Throttle haptics: max 1 impact per 300ms to avoid spam on rapid taps/scrolls
        let lastHapticTime = 0;
        const HAPTIC_COOLDOWN = 300; // ms

        document.addEventListener('click', (e) => {
            if (e.isTrusted === false) return;

            const now = Date.now();
            if (now - lastHapticTime < HAPTIC_COOLDOWN) return;
            lastHapticTime = now;

            if (e.target.closest('button') || e.target.closest('.btn') || e.target.closest('a')) {
                // ✅ Haptics اختيارية — نتجاهل بصمت إن لم يكن الجسر متاحاً
                if (Haptics) { try { Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); } catch (_) {} }
            }
        });
    },

    // ==========================================
    // 🛡️ Permissions Enforcement 
    // ==========================================
    enforcePermissions: async () => {
        // ✅ SINGLETON GUARD: Never register more than one polling loop.
        if (window._enforcePermissionsCalled) return;
        window._enforcePermissionsCalled = true;

        // ✅ تحقق أننا فعلاً داخل تطبيق Capacitor أصلي (مش متصفح عادي)
        const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
        if (!isNative) {
            // في المتصفح العادي لا نطلب أذونات Capacitor
            return;
        }

        let permissionsValid = false;
        let _isRunning = false;

        const checkAndPrompt = async () => {
            if (_isRunning) return;
            _isRunning = true;

            let locationGranted = false;
            let pushGranted = false;

            try {
                // 🐛 إصلاح التعليق: جسر Capacitor قد يتجمّد على بعض الهواتف بلا رفض —
                // نضيف مهلة 2.5ث، وعند تجاوزها ننتقل لفحص الويب البديل بدل تعليق الشاشة.
                const locStatus = await Promise.race([
                    Geolocation.checkPermissions(),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('PERM_CHECK_TIMEOUT')), 2500))
                ]);
                locationGranted = (locStatus.location === 'granted' || locStatus.coarseLocation === 'granted');
            } catch (e) {
                // Fallback to web API check
                try {
                    const perm = await navigator.permissions.query({ name: 'geolocation' });
                    locationGranted = perm.state === 'granted';
                } catch (err) {
                    locationGranted = localStorage.getItem('web_loc_granted') === 'true';
                }
            }

            try {
                const push = window.Capacitor?.Plugins?.PushNotifications;
                if (push) {
                    const pushStatus = await Promise.race([
                        push.checkPermissions(),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('PERM_CHECK_TIMEOUT')), 2500))
                    ]);
                    pushGranted = pushStatus.receive === 'granted';
                } else if ('Notification' in window) {
                    pushGranted = Notification.permission === 'granted';
                } else {
                    pushGranted = localStorage.getItem('push_bypassed') === 'true';
                }
            } catch (e) {
                if ('Notification' in window) {
                    pushGranted = Notification.permission === 'granted';
                } else {
                    pushGranted = localStorage.getItem('push_bypassed') === 'true';
                }
            }

            // 🔔 الإشعارات اختيارية: متى ما حاول المستخدم تفعيلها (ولو تعذّر على هاتفه)
            // لا نحبسه على هذه الشاشة — الموقع وحده هو الشرط الإلزامي للدخول.
            if (localStorage.getItem('push_bypassed') === 'true') pushGranted = true;

            if (locationGranted && pushGranted) {
                AppCore.removePermissionOverlay();
                permissionsValid = true;
                if (window._permCheckInterval) {
                    clearInterval(window._permCheckInterval);
                    delete window._permCheckInterval;
                }
            } else {
                AppCore.showPermissionOverlay(!locationGranted, !pushGranted);
            }

            _isRunning = false;
        };

        // Initial check
        await checkAndPrompt();

        // Polling only if permissions still needed
        if (!permissionsValid) {
            window._permCheckInterval = setInterval(checkAndPrompt, 3000);
        }
    },

    showPermissionOverlay: (needLocation, needPush) => {
        let overlay = document.getElementById('permission-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'permission-overlay';
            overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 20px; color:white; text-align:center; direction:rtl; font-family:"Cairo",sans-serif; backdrop-filter: blur(10px);';
            document.body.appendChild(overlay);
        }

        let locBtn = needLocation ? `<button onclick="window.AppCoreHelper.requestLocation()" style="background:white; color:#04553A; border:none; border-radius:50px; padding:14px 20px; font-weight:800; font-size:15px; width:100%; font-family:'Cairo',sans-serif; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); cursor:pointer;"><span style="font-size:1.2rem;">📍</span> تفعيل الموقع (GPS)</button>` : '';
        let pushBtn = needPush ? `<button onclick="window.AppCoreHelper.requestPush()" style="background:rgba(255,255,255,0.15); color:white; border:2px solid rgba(255,255,255,0.4); border-radius:50px; padding:14px 20px; font-weight:700; font-size:15px; width:100%; font-family:'Cairo',sans-serif; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; backdrop-filter:blur(10px);"><span style="font-size:1.2rem;">🔔</span> تفعيل الإشعارات</button>` : '';

        overlay.innerHTML = `
            <div style="background: linear-gradient(160deg, #064e32 0%, #04553A 50%, #0d9d63 100%); border-radius: 24px; padding: 30px 20px; width: 100%; max-width: 380px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); text-align: center; position:relative; overflow:hidden;">
                <div style="position:absolute;top:-40px;left:-40px;width:160px;height:160px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
                <div style="position:absolute;bottom:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.04);border-radius:50%;"></div>
                <div style="position:relative; z-index:1;">
                    <img src="logo-transparent.png" alt="وجيز" style="width: 80px; height: 80px; object-fit: contain; margin-bottom: 16px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25));">
                    <h3 style="color:white; font-weight:800; margin-bottom:8px; font-size:1.3rem;">مرحباً في وجيز 👋</h3>
                    <p style="color:rgba(255,255,255,0.85); margin-bottom:24px; font-size:14px; line-height:1.7;">
                        لتقديم خدمة التوصيل بأفضل صورة، نحتاج إذنك لـ:
                    </p>
                    <div style="background:rgba(255,255,255,0.12); border-radius:14px; padding:14px 16px; margin-bottom:20px; backdrop-filter:blur(10px);">
                        <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px; text-align:right;">
                            <span style="font-size:1.4rem; flex-shrink:0;">📍</span>
                            <div style="flex:1;">
                                <div style="color:white; font-weight:700; font-size:13px;">الموقع الجغرافي</div>
                                <div style="color:rgba(255,255,255,0.7); font-size:11px;">لتحديد موقعك وتوصيل طلبك بدقة</div>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:12px; text-align:right;">
                            <span style="font-size:1.4rem; flex-shrink:0;">🔔</span>
                            <div style="flex:1;">
                                <div style="color:white; font-weight:700; font-size:13px;">الإشعارات</div>
                                <div style="color:rgba(255,255,255,0.7); font-size:11px;">لإعلامك بحالة طلبك أولاً بأول</div>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        ${locBtn}
                        ${pushBtn}
                    </div>
                </div>
            </div>
        `;
    },

    removePermissionOverlay: () => {
        const overlay = document.getElementById('permission-overlay');
        if (overlay) overlay.remove();
        if (window._permCheckInterval) {
            clearInterval(window._permCheckInterval);
            delete window._permCheckInterval;
        }
    },

    // 🚀 Dynamic Mobile Navigation Builder 🚀
    renderMobileNav: () => {
        const navContainer = document.getElementById('mobile-nav-container');
        if (!navContainer) return;

        const currentPath = window.location.pathname;
        const isCaptain = currentPath.includes('captain');
        const isOnIndexPage = currentPath.endsWith('index.html') || currentPath.endsWith('/');

        let navItems = [];

        if (isCaptain) {
            navItems = [
                { icon: 'bi-house-door-fill', label: 'الرئيسية', link: 'captain-dashboard.html' },
                { icon: 'bi-bicycle', label: 'طلبات متاحة', link: 'captain-orders.html' },
                { icon: 'bi-card-checklist', label: 'مهامي', link: 'captain-missions.html' },
                { icon: 'bi-bell-fill', label: 'الإشعارات', link: 'captain-notifications.html' },
                { icon: 'bi-person-circle', label: 'حسابي', link: 'captain-profile.html' }
            ];
        } else {
            // Client Navigation
            navItems = [
                isOnIndexPage
                    ? { icon: 'bi-house-door-fill', label: 'الرئيسية', onclick: 'showHomeSection && showHomeSection()' }
                    : { icon: 'bi-house-door-fill', label: 'الرئيسية', link: 'index.html' },

                { icon: 'bi-shop', label: 'تسوق', link: 'client-order.html' },
                { icon: 'bi-box-seam', label: 'طلباتي', link: 'client-my-orders.html' },
                { icon: 'bi-bell', label: 'الإشعارات', link: 'notifications.html' }
            ];
        }

        const isOrderTab = currentPath.includes('client-order');

        const navHTML = `
            <nav class="mobile-nav-glass">
                ${navItems.map(item => {
            let isActive = false;
            if (!item.link && !item.onclick) {
                isActive = false;
            } else if (item.link === 'client-order.html') {
                isActive = isOrderTab;
            } else if (item.onclick && item.onclick.includes('showHomeSection')) {
                isActive = isOnIndexPage;
            } else if (item.link === 'index.html') {
                isActive = isOnIndexPage;
            } else {
                isActive = item.link ? currentPath.endsWith(item.link.split('?')[0]) : false;
            }
            const activeClass = isActive ? 'active' : '';
            const hrefAttr = item.onclick
                ? `href="#" onclick="event.preventDefault();${item.onclick}"`
                : `href="${item.link || '#'}"`;

            return `
                        <a ${hrefAttr} class="nav-item-link ${activeClass}">
                            <i class="bi ${item.icon}"></i>
                            <span>${item.label}</span>
                        </a>
                    `;
        }).join('')}
            </nav>
        `;

        navContainer.innerHTML = navHTML;
    },

    // ==========================================
    // 🔄 App Update Checker
    // ==========================================
    checkForUpdates: async () => {
        try {
            // ✅ على الويب/PWA التحديث تلقائي عبر الـ Service Worker — لا حاجة لرسالة Play Store.
            //    نفحص فقط داخل التطبيق المثبّت (Native) لتفادي الرسائل العالقة على المتصفح.
            const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
            if (!isNative) return;

            const BASE = window.API_BASE_URL || window.API_URL || 'https://wajeezsd.com';
            const res = await fetch(`${BASE}/api/auth/app-config`);
            if (!res.ok) return;
            const data = await res.json();
            
            // Compare versions
            const current = window.APP_VERSION || '1.0.6';
            const latest = data.appVersion || '1.0.6';
            const minVersion = data.minVersion || latest;
            
            // Helper to compare versions
            const cmp = (v1, v2) => {
                const a = v1.split('.').map(Number);
                const b = v2.split('.').map(Number);
                for (let i = 0; i < 3; i++) {
                    if ((a[i] || 0) > (b[i] || 0)) return 1;
                    if ((a[i] || 0) < (b[i] || 0)) return -1;
                }
                return 0;
            };

            const isOutdated = cmp(latest, current) > 0;
            const isBelowMin = cmp(minVersion, current) > 0;
            const isForced = data.forceUpdate || isBelowMin;

            if (isOutdated) {
                // Show update dialog
                const title = isForced ? 'تحديث إجباري مطلوب! 🚨' : 'تحديث جديد متاح! 🚀';
                const text = isForced 
                    ? 'إصدار التطبيق لديك قديم جداً ولن يعمل بشكل صحيح. يرجى التحديث الآن.' 
                    : 'يوجد إصدار جديد من تطبيق وجيز. يرجى التحديث للحصول على أفضل تجربة.';

                if (window.Swal) {
                    window.Swal.fire({
                        title: title,
                        text: text,
                        icon: isForced ? 'warning' : 'info',
                        showCancelButton: !isForced,
                        confirmButtonText: 'تحديث الآن',
                        cancelButtonText: 'لاحقاً',
                        confirmButtonColor: '#04553A',
                        allowOutsideClick: !isForced,
                        allowEscapeKey: !isForced
                    }).then((result) => {
                        if (result.isConfirmed || isForced) {
                            window.location.href = data.playStoreLink || 'https://play.google.com/store/apps';
                            if (isForced) {
                                // Prevent bypassing by returning from Play Store
                                setTimeout(() => AppCore.checkForUpdates(), 1500);
                            }
                        }
                    });
                } else {
                    if (isForced) {
                        alert(title + '\n' + text);
                        window.location.href = data.playStoreLink || 'https://play.google.com/store/apps';
                        setTimeout(() => AppCore.checkForUpdates(), 1500);
                    } else {
                        const confirmUpdate = window.confirm(title + '\n' + text);
                        if (confirmUpdate) {
                            window.location.href = data.playStoreLink || 'https://play.google.com/store/apps';
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Failed to check for updates:', e);
        }
    },

    // ============================================================
    // 🔴 Captain Navigation Badges
    // ============================================================
    initCaptainBadges: () => {
        const path = window.location.pathname;
        const isCaptain = path.includes('captain');

        // ✅ FIX: استبعاد صفحات Login/Signup/Register من تنفيذ الـ badges
        // هذه الصفحات لا يوجد فيها توكن ولا ناف بار → لا داعي لاستدعاء API
        const isAuthPage = path.includes('login') || path.includes('signup') || path.includes('register');
        if (!isCaptain || isAuthPage) return;

        const updateNavBadge = (badgeId, count) => {
            const badgeEl = document.getElementById(badgeId);
            if (!badgeEl) return;
            if (count > 0) {
                badgeEl.textContent = count > 99 ? '+99' : count;
                badgeEl.style.display = 'flex';
            } else {
                badgeEl.textContent = '0';
                badgeEl.style.display = 'none';
            }
        };

        const fetchBadgeCounts = async () => {
            // ✅ FIX: فحص صريح للتوكن — لو ما في token لا نُرسل أي طلب
            const token = localStorage.getItem('token');
            if (!token) return;
            if (!window.Auth || !window.Auth.isAuthenticated()) return;

            const BASE = window.API_BASE_URL || window.API_URL || 'https://wajeezsd.com';
            
            try {
                const headers = window.Auth.getAuthHeader();
                
                // 1. Available orders
                fetch(`${BASE}/api/orders`, { headers })
                    .then(r => r.ok ? r.json() : [])
                    .then(data => {
                        const count = Array.isArray(data) ? data.length : 0;
                        updateNavBadge('orders-badge', count);
                        window._ordersBadgeCount = count;
                    }).catch(()=>{});

                // 2. My Tasks (missions)
                fetch(`${BASE}/api/orders/my-missions`, { headers })
                    .then(r => r.ok ? r.json() : [])
                    .then(data => {
                        const count = Array.isArray(data) ? data.length : 0;
                        updateNavBadge('tasks-badge', count);
                        window._tasksBadgeCount = count;
                    }).catch(()=>{});

            } catch (err) {
                console.error('Badge init fetch error:', err);
            }
        };

        // 1. Initial Load
        fetchBadgeCounts();

        // 2. Real-time Updates (Socket.io)
        if (window.io) {
            const BASE = window.API_BASE_URL || window.API_URL || 'https://wajeezsd.com';
            const socket = window.io(BASE);

            socket.on('new_order', () => {
                window._ordersBadgeCount = (window._ordersBadgeCount || 0) + 1;
                updateNavBadge('orders-badge', window._ordersBadgeCount);
                // Subtle sound
                try {
                    const audio = new Audio('/sounds/wajeezsd-bell.wav');
                    audio.volume = 0.5;
                    audio.play().catch(()=>{});
                } catch(e) {}
            });

            socket.on('order_status_updated', (data) => {
                // If a task is assigned, updated or removed, just refetch to be accurate
                fetchBadgeCounts();
            });
        }

        // 3. Resetting on click
        document.querySelectorAll('.nav-item-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href && href.includes('captain-orders.html')) {
                    window._ordersBadgeCount = 0;
                    updateNavBadge('orders-badge', 0);
                }
                if (href && href.includes('captain-missions.html')) {
                    window._tasksBadgeCount = 0;
                    updateNavBadge('tasks-badge', 0);
                }
            });
        });
    }
};

// ============================================================
// 🎬 Page Transition Manager
// ============================================================
const PageTransition = {
    init: () => {
        // Thin top progress bar — lightweight, professional (YouTube / GitHub style)
        const style = document.createElement('style');
        style.textContent = `
            #pto-bar {
                position: fixed;
                top: 0; left: 0;
                width: 0%;
                height: 3px;
                background: #04553A;
                z-index: 999999;
                border-radius: 0 2px 2px 0;
                opacity: 0;
                transition: width 0.25s ease, opacity 0.3s ease;
                pointer-events: none;
                box-shadow: 0 0 8px rgba(10,135,84,0.6);
            }
            #pto-bar.running {
                opacity: 1;
                width: 75%;
                transition: width 0.4s cubic-bezier(0.1, 0.05, 0.0, 1.0);
            }
            #pto-bar.done {
                width: 100%;
                opacity: 0;
                transition: width 0.15s ease, opacity 0.3s ease 0.1s;
            }
        `;
        document.head.appendChild(style);

        const bar = document.createElement('div');
        bar.id = 'pto-bar';
        document.body.appendChild(bar);
    },

    start: () => {
        const bar = document.getElementById('pto-bar');
        if (!bar) return;
        bar.classList.remove('done');
        // Force reflow so animation restarts cleanly
        bar.style.width = '0%';
        bar.style.opacity = '0';
        bar.offsetHeight; // reflow
        bar.classList.add('running');
    },

    finish: () => {
        const bar = document.getElementById('pto-bar');
        if (!bar) return;
        bar.classList.remove('running');
        bar.classList.add('done');
        // Reset after animation ends
        setTimeout(() => {
            bar.classList.remove('done');
            bar.style.width = '0%';
        }, 600);
    },

    // Call after nav is rendered
    attachNavInterceptor: () => {
        document.querySelectorAll('.nav-item-link[href]').forEach(link => {
            if (link.getAttribute('href') === '#') return;

            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = link.href;
                // Start the bar, then navigate immediately
                PageTransition.start();
                setTimeout(() => { window.location.href = target; }, 80);
            });
        });
    }
};

// تشغيل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // 1. Page transitions (run first for smoothest experience)
    PageTransition.init();

    // 2. Render Nav everywhere (Web & Native)
    AppCore.renderMobileNav();

    // 3. Attach nav transition interceptor
    PageTransition.attachNavInterceptor();

    // 4. Init Captain Badges
    AppCore.initCaptainBadges();

    // 5. Native Features (runs always — each method handles browser vs native internally)
    AppCore.init();
});

// ============================================================
// 🛡️ AppCoreHelper — Permission Requests with Timeout Fallback
// Prevents native Capacitor plugin calls from hanging indefinitely
// on fragmented Android devices (Huawei no-GMS, permanent deny, etc.)
// ============================================================
window.AppCoreHelper = (() => {

    // ─────────────────────────────────────────────────────────
    // 🔧 withTimeout — races any promise against a timer.
    // Rejects with a special TIMEOUT_ERROR if the promise
    // doesn't settle within `ms` milliseconds.
    // ─────────────────────────────────────────────────────────
    function withTimeout(promise, ms = 3000) {
        const timer = new Promise((_, reject) =>
            setTimeout(() => {
                const err = new Error(`Native plugin timed out after ${ms}ms`);
                err.code = 'TIMEOUT_ERROR';
                reject(err);
            }, ms)
        );
        return Promise.race([promise, timer]);
    }

    // ─────────────────────────────────────────────────────────
    // 🌍 requestLocation
    // 1. Try native Geolocation.requestPermissions() with 3s timeout
    // 2. Fallback → navigator.geolocation.getCurrentPosition()
    // 3. If everything fails → show manual-settings guidance
    // ─────────────────────────────────────────────────────────
    async function requestLocation() {
        let granted = false;

        // ── Step 1: Native Capacitor plugin (with timeout) ──
        try {
            const status = await withTimeout(Geolocation.requestPermissions(), 3000);
            granted = (status.location === 'granted' || status.coarseLocation === 'granted');
            console.log('[Permissions] Native Geolocation result:', status);
        } catch (nativeErr) {
            if (nativeErr.code === 'TIMEOUT_ERROR') {
                console.warn('[Permissions] Geolocation.requestPermissions() timed out — falling back to Web API');
            } else {
                console.warn('[Permissions] Geolocation native error:', nativeErr.message);
            }

            // ── Step 2: Web API fallback ──
            try {
                await withTimeout(
                    new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000, maximumAge: 0 });
                    }),
                    5000 // slightly more time for GPS acquisition
                );
                granted = true;
                localStorage.setItem('web_loc_granted', 'true');
                console.log('[Permissions] Web Geolocation fallback: granted');
            } catch (webErr) {
                granted = false;
                console.warn('[Permissions] Web Geolocation fallback also failed:', webErr.message || webErr.code);
            }
        }

        // ── Step 3: React to result ──
        if (granted) {
            window._enforcePermissionsCalled = false;
            await AppCore.enforcePermissions();
        } else {
            _showManualSettingsAlert(
                'صلاحية الموقع الجغرافي',
                'لم نتمكن من الوصول لموقعك. يرجى تفعيل صلاحية الموقع يدوياً من:\n\n⚙️ الإعدادات → التطبيقات → وجيز → الأذونات → الموقع',
                'bi-geo-alt-fill'
            );
        }
    }

    // ─────────────────────────────────────────────────────────
    // 🔔 requestPush
    // 1. Try native PushNotifications.requestPermissions() with 3s timeout
    // 2. Fallback → Notification.requestPermission() (Web API)
    // 3. If everything fails → show manual-settings guidance
    // ─────────────────────────────────────────────────────────
    async function requestPush() {
        let granted = false;

        const push = window.Capacitor?.Plugins?.PushNotifications;

        // ── Step 1: Native Capacitor plugin (with timeout) ──
        if (push) {
            try {
                const status = await withTimeout(push.requestPermissions(), 3000);
                granted = (status.receive === 'granted');
                console.log('[Permissions] Native Push result:', status);
                if (granted) {
                    try { push.register(); } catch (_) {}
                }
            } catch (nativeErr) {
                if (nativeErr.code === 'TIMEOUT_ERROR') {
                    console.warn('[Permissions] PushNotifications.requestPermissions() timed out — falling back to Web API');
                } else {
                    console.warn('[Permissions] Push native error:', nativeErr.message);
                }

                // ── Step 2: Web Notification API fallback ──
                granted = await _webNotificationFallback();
            }
        } else {
            // No native plugin available at all → go straight to Web API
            granted = await _webNotificationFallback();
        }

        // ── Step 3: React to result ──
        if (granted) {
            window._enforcePermissionsCalled = false;
            await AppCore.enforcePermissions();
        } else {
            // الإشعارات اختيارية — بعد المحاولة لا نحبس المستخدم على الشاشة.
            // نعلّمها كـ"تم تجاوزها" فيُكمل الدخول، مع تذكيره بكيفية تفعيلها لاحقاً.
            localStorage.setItem('push_bypassed', 'true');
            _showManualSettingsAlert(
                'صلاحية الإشعارات (اختيارية)',
                'يمكنك المتابعة الآن. لتصلك تنبيهات حالة الطلب لاحقاً، فعّل الإشعارات من:\n\n⚙️ الإعدادات → التطبيقات → وجيز → الأذونات → الإشعارات',
                'bi-bell-fill'
            );
            window._enforcePermissionsCalled = false;
            await AppCore.enforcePermissions(); // يُغلق الشاشة ما دام الموقع مُفعّلاً
        }
    }

    // ─────────────────────────────────────────────────────────
    // 🔔 Web Notification API fallback helper
    // ─────────────────────────────────────────────────────────
    async function _webNotificationFallback() {
        try {
            if (!('Notification' in window)) {
                // Browser/device doesn't support Notifications at all → bypass gracefully
                localStorage.setItem('push_bypassed', 'true');
                console.log('[Permissions] Notification API not available — bypassed');
                return true;
            }

            const perm = await withTimeout(
                Promise.resolve(Notification.requestPermission()),
                5000
            );
            const isGranted = (perm === 'granted');
            console.log('[Permissions] Web Notification fallback result:', perm);
            return isGranted;
        } catch (e) {
            console.warn('[Permissions] Web Notification fallback failed:', e.message);
            return false;
        }
    }

    // ─────────────────────────────────────────────────────────
    // 🗨️ Manual settings alert — never blocks the app
    // ─────────────────────────────────────────────────────────
    function _showManualSettingsAlert(permissionName, instructionText, iconClass = 'bi-shield-exclamation') {
        // Ensure enforcePermissions can be retried later by resetting the singleton guard
        window._enforcePermissionsCalled = false;

        if (window.Swal) {
            window.Swal.fire({
                icon: 'warning',
                title: `تفعيل ${permissionName}`,
                html: `
                    <div style="text-align:right; direction:rtl; line-height:1.8;">
                        <i class="bi ${iconClass}" style="font-size:2rem; color:#f59e0b; display:block; margin-bottom:10px;"></i>
                        ${instructionText.replace(/\n/g, '<br>')}
                        <br><br>
                        <small style="color:#6b7280;">بعد تفعيل الإذن، أعد تشغيل التطبيق أو اضغط "إعادة المحاولة".</small>
                    </div>
                `,
                confirmButtonText: '🔄 إعادة المحاولة',
                showCancelButton: true,
                cancelButtonText: 'تخطّى الآن',
                confirmButtonColor: '#04553A',
                cancelButtonColor: '#6b7280',
                allowOutsideClick: false,
                allowEscapeKey: false
            }).then(async (result) => {
                if (result.isConfirmed) {
                    // Re-trigger the full permissions check cycle
                    window._enforcePermissionsCalled = false;
                    await AppCore.enforcePermissions();
                }
                // If cancelled → app continues normally without freezing
            });
        } else {
            // Absolute fallback for environments without Swal
            const goSettings = window.confirm(
                `${permissionName} غير مفعّلة.\n\n${instructionText}\n\nاضغط OK لإعادة المحاولة.`
            );
            if (goSettings) {
                window._enforcePermissionsCalled = false;
                AppCore.enforcePermissions();
            }
        }
    }

    // ── Public API ──
    return {
        requestLocation,
        requestPush
    };

})();


// ✅ إصلاح BUG-1: حُذف export default لأن الملف يُحمَّل كـ <script> عادي وليس ES Module
