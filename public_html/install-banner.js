// PWA Install Banner - Add to any page
(function () {
    'use strict';

    let deferredPrompt = null;

    // Capture the install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallBanner();
    });

    function showInstallBanner() {
        // Check if already dismissed
        if (localStorage.getItem('install-banner-dismissed') === 'true') {
            return;
        }

        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            return;
        }

        // Create banner
        const banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.innerHTML = `
            <div style="position: fixed; bottom: 80px; left: 20px; right: 20px; background: linear-gradient(135deg, #04553A, #065f3a); color: white; padding: 15px 20px; border-radius: 15px; box-shadow: 0 8px 25px rgba(0,0,0,0.3); z-index: 9998; display: flex; align-items: center; gap: 15px; font-family: 'Cairo', sans-serif; animation: slideUp 0.5s ease;">
                <div style="flex: 1;">
                    <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">📱 ثبّت التطبيق</div>
                    <div style="font-size: 13px; opacity: 0.9;">استخدم وجيز بسهولة من شاشتك الرئيسية</div>
                </div>
                <button id="install-btn" style="background: white; color: #04553A; border: none; padding: 10px 20px; border-radius: 25px; font-weight: bold; cursor: pointer; font-size: 14px; white-space: nowrap;">
                    تثبيت الآن
                </button>
                <button id="dismiss-btn" style="background: transparent; color: white; border: none; font-size: 24px; cursor: pointer; padding: 5px; line-height: 1;">
                    ×
                </button>
            </div>
            <style>
                @keyframes slideUp {
                    from { transform: translateY(100px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            </style>
        `;

        document.body.appendChild(banner);

        // Install button click
        document.getElementById('install-btn').addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response: ${outcome}`);
                deferredPrompt = null;
                banner.remove();
            }
        });

        // Dismiss button click
        document.getElementById('dismiss-btn').addEventListener('click', () => {
            localStorage.setItem('install-banner-dismissed', 'true');
            banner.remove();
        });
    }

    // Auto-show after 5 seconds
    setTimeout(() => {
        if (deferredPrompt) {
            showInstallBanner();
        }
    }, 5000);

})();
