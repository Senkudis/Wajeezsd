// Screen Wake Lock Utility for Order Tracking
(function () {
    'use strict';

    let wakeLock = null;

    // Request wake lock
    async function requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('🔆 Screen Wake Lock activated');

                wakeLock.addEventListener('release', () => {
                    console.log('🌙 Screen Wake Lock released');
                });
            } else {
                console.warn('⚠️ Wake Lock API not supported');
            }
        } catch (err) {
            console.error('❌ Wake Lock request failed:', err);
        }
    }

    // Release wake lock
    function releaseWakeLock() {
        if (wakeLock !== null) {
            wakeLock.release();
            wakeLock = null;
        }
    }

    // Re-acquire wake lock when page becomes visible
    document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    });

    // Release wake lock when page is about to unload
    window.addEventListener('beforeunload', () => {
        releaseWakeLock();
    });

    // Auto-start wake lock on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', requestWakeLock);
    } else {
        requestWakeLock();
    }

    // Expose functions globally
    window.wakeLockUtils = {
        request: requestWakeLock,
        release: releaseWakeLock
    };

})();
