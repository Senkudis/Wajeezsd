// Service Worker Registration and Installation Prompt Handler
(function () {
    'use strict';

    let deferredPrompt;

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register('/service-worker.js')
                .then((registration) => {
                    console.log('✅ Service Worker registered:', registration.scope);

                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New version available
                                if (confirm('تحديث جديد متاح! هل تريد تحديث التطبيق الآن؟')) {
                                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                                    window.location.reload();
                                }
                            }
                        });
                    });
                })
                .catch((error) => {
                    console.error('❌ Service Worker registration failed:', error);
                });
        });
    }

    // Capture install prompt event (Android)
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        console.log('📱 Install prompt captured');

        // Store for later use
        window.deferredPrompt = deferredPrompt;
    });

    // Track installation
    window.addEventListener('appinstalled', () => {
        console.log('✅ App installed successfully');
        deferredPrompt = null;
        localStorage.setItem('pwa-installed', 'true');
    });

})();
