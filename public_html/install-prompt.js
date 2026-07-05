// PWA Installation Prompt Handler (iOS & Android)
(function () {
    'use strict';

    // Detect iOS
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    // Check if running in standalone mode
    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true;
    }

    // Check if already dismissed
    function isDismissed() {
        return localStorage.getItem('install-prompt-dismissed') === 'true';
    }

    // Show iOS installation instructions
    function showIOSPrompt() {
        const modal = document.createElement('div');
        modal.id = 'ios-install-modal';
        modal.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <div style="background: white; border-radius: 20px; padding: 30px; max-width: 400px; text-align: center; font-family: 'Cairo', sans-serif;">
          <div style="font-size: 60px; margin-bottom: 20px;">📱</div>
          <h3 style="color: #04553A; margin-bottom: 15px; font-weight: bold;">ثبّت التطبيق</h3>
          <p style="color: #666; margin-bottom: 25px; line-height: 1.6;">
            لتثبيت التطبيق على جهازك:<br>
            1. اضغط على زر المشاركة <span style="font-size: 20px;">⬆️</span><br>
            2. اختر "إضافة إلى الشاشة الرئيسية"
          </p>
          <button onclick="document.getElementById('ios-install-modal').remove(); localStorage.setItem('install-prompt-dismissed', 'true');" 
                  style="background: #04553A; color: white; border: none; padding: 12px 30px; border-radius: 25px; font-weight: bold; cursor: pointer; font-size: 16px;">
            حسناً
          </button>
        </div>
      </div>
    `;
        document.body.appendChild(modal);
    }

    // Show Android installation prompt
    function showAndroidPrompt() {
        if (window.deferredPrompt) {
            window.deferredPrompt.prompt();
            window.deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('✅ User accepted installation');
                }
                window.deferredPrompt = null;
            });
        }
    }

    // Initialize installation prompt
    function init() {
        // Don't show if already installed or dismissed
        if (isStandalone() || isDismissed()) {
            return;
        }

        // Wait a bit before showing prompt
        setTimeout(() => {
            if (isIOS()) {
                showIOSPrompt();
            }
            // For Android, we just wait for the user to trigger it
            // The prompt will be shown when deferredPrompt is available
        }, 3000); // Show after 3 seconds
    }

    // Run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
