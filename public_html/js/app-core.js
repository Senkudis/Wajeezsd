import { App } from 'https://cdn.jsdelivr.net/npm/@capacitor/app@latest/+esm';
import { Network } from 'https://cdn.jsdelivr.net/npm/@capacitor/network@latest/+esm';
import { Toast } from 'https://cdn.jsdelivr.net/npm/@capacitor/toast@latest/+esm';
import { Haptics, ImpactStyle } from 'https://cdn.jsdelivr.net/npm/@capacitor/haptics@latest/+esm';
import { Dialog } from 'https://cdn.jsdelivr.net/npm/@capacitor/dialog@latest/+esm';

// ملاحظة: نستخدم الـ CDN مؤقتاً للتأكد من العمل حتى بدون build system معقد
// في الإنتاج يفضل استخدام الـ bundler

const AppCore = {
    init: async () => {
        console.log('📱 Initializing App Core...');

        // 0. API Base URL Interceptor (For Native App)
        AppCore.setupApiInterceptor();

        // 1. Hardware Back Button Handling
        await AppCore.setupBackButton();

        // 2. Network Status Monitoring
        await AppCore.setupNetworkListener();

        // 3. Setup Haptics
        await AppCore.setupHaptics();

        // 4. Mark as Native App
        document.body.classList.add('is-native-app');
    },

    setupApiInterceptor: () => {
        const nativeFetch = window.fetch;
        // Use global API_URL from config.js, or fallback to hardcoded if missing
        const BASE_URL = window.API_URL || 'https://wassili.site';
        window.API_BASE_URL = BASE_URL; // Expose for other scripts

        window.fetch = async (...args) => {
            let [resource, config] = args;

            // Only intercept relative URLs starting with /api
            if (typeof resource === 'string' && resource.startsWith('/api')) {
                resource = BASE_URL + resource;
                console.log(`🔌 Intercepted: ${resource}`);
            }

            try {
                const response = await nativeFetch(resource, config);
                return response;
            } catch (error) {
                console.error("Fetch Error:", error);
                throw error;
            }
        };

        // Also fix socket.io if it's using relative path
        if (window.io) {
            const originalIo = window.io;
            window.io = (url, options) => {
                if (!url || typeof url === 'string' && (url === '/' || url.startsWith('/'))) {
                    return originalIo(BASE_URL, options || url);
                }
                return originalIo(url, options);
            };
        }
    },

    setupBackButton: async () => {
        App.addListener('backButton', ({ canGoBack }) => {
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
                navToggler.click();
                return;
            }

            // 3. التعامل مع التنقل
            if (canGoBack) {
                window.history.back();
            } else {
                // إذا كنا في الصفحة الرئيسية، نطلب تأكيد الخروج
                if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('dashboard.html')) {
                    AppCore.showExitConfirm();
                } else {
                    // في الحالات الغريبة، نرجع للصفحة الرئيسية
                    window.location.href = 'index.html';
                }
            }
        });
    },

    showExitConfirm: async () => {
        const result = await Dialog.confirm({
            title: 'الخروج من التطبيق',
            message: 'هل تريد فعلاً الخروج من وصل-لي؟',
            okButtonTitle: 'نعم، خروج',
            cancelButtonTitle: 'إلغاء'
        });

        if (result.value) {
            App.exitApp();
        }
    },

    setupNetworkListener: async () => {
        // الحالة الأولية
        const status = await Network.getStatus();
        AppCore.handleNetworkChange(status);

        // الاستماع للتغييرات
        Network.addListener('networkStatusChange', (status) => {
            AppCore.handleNetworkChange(status);
        });
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
                Toast.show({
                    text: 'عاد الاتصال بالانترنت 🟢',
                    duration: 'short'
                });
            }
        }
    },

    setupHaptics: async () => {
        // Add Haptics to all buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('.btn') || e.target.closest('a')) {
                Haptics.impact({ style: ImpactStyle.Light });
            }
        });
    },

    // 🚀 Dynamic Mobile Navigation Builder 🚀
    renderMobileNav: () => {
        const navContainer = document.getElementById('mobile-nav-container');
        if (!navContainer) return; // Not a page that needs nav

        const currentPath = window.location.pathname;
        const isCaptain = currentPath.includes('captain');

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
                { icon: 'bi-house-door-fill', label: 'الرئيسية', link: 'index.html' },
                { icon: 'bi-box-seam', label: 'طلباتي', link: 'client-my-orders.html' },
                { icon: 'bi-bell', label: 'الإشعارات', link: 'notifications.html' }
            ];

            // Add Logout if on My Orders page
            if (currentPath.includes('client-my-orders.html')) {
                navItems.push({ icon: 'bi-box-arrow-right', label: 'خروج', onclick: 'logout()' });
            }
        }

        const navHTML = `
            <style>
                .mobile-nav-glass {
                    padding: 8px 0 10px !important;
                    background: rgba(255, 255, 255, 0.98) !important;
                    backdrop-filter: blur(15px) !important;
                    -webkit-backdrop-filter: blur(15px) !important;
                    box-shadow: 0 -3px 15px rgba(0, 0, 0, 0.06) !important;
                    display: flex !important;
                    justify-content: space-around !important;
                    align-items: center !important;
                }
                .nav-item-link i { font-size: 1.4rem !important; margin-bottom: 2px; display: block; }
                .nav-item-link span { font-size: 0.68rem !important; font-weight: 600; opacity: 0.9; }
                .nav-item-link { padding: 6px 10px !important; min-width: 65px !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; color: #8e9196 !important; text-decoration: none !important; }
                .nav-item-link.active { color: var(--primary-color) !important; background: linear-gradient(135deg, rgba(10, 135, 84, 0.1) 0%, rgba(10, 135, 84, 0.15) 100%) !important; }
            </style>
            <nav class="mobile-nav-glass">
                ${navItems.map(item => {
            // Check active state
            const isActive = currentPath.endsWith(item.link) || (item.link === 'index.html' && currentPath.endsWith('/'));
            const activeClass = isActive ? 'active' : '';
            const hrefAttr = item.onclick ? `href="#" onclick="${item.onclick}"` : `href="${item.link}"`;

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
    }
};

// تشغيل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // 1. Render Nav everywhere (Web & Native)
    AppCore.renderMobileNav();

    // 2. Native Features
    if (window.Capacitor) {
        AppCore.init();
    }
});

export default AppCore;
