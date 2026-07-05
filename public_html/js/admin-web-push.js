/**
 * admin-web-push.js
 * ==================
 * Handles Web Push (FCM) token registration for admin users on the browser.
 *
 * HOW IT WORKS:
 *   1. Fetches Firebase web config from /api/auth/firebase-web-config (server derives it
 *      automatically from the existing FIREBASE_SERVICE_ACCOUNT_JSON env var +
 *      4 simple env vars you add once to the server).
 *   2. Loads Firebase Web JS SDK dynamically (no bundle required).
 *   3. Gets an FCM token from the browser.
 *   4. Sends the token to /api/auth/update-fcm so the server can push to this admin.
 *
 * WHAT YOU NEED TO ADD TO YOUR SERVER .env:
 *   FIREBASE_WEB_API_KEY=AIzaSy...          ← Firebase Console → Project Settings → Web App
 *   FIREBASE_WEB_MESSAGING_SENDER_ID=1234…  ← same place
 *   FIREBASE_WEB_APP_ID=1:1234…:web:abc…   ← same place
 *   FIREBASE_WEB_VAPID_KEY=BNx...           ← Cloud Messaging tab → Web Push certificates
 *
 *   projectId, authDomain, storageBucket are derived AUTOMATICALLY from your
 *   existing FIREBASE_SERVICE_ACCOUNT_JSON — no need to add them.
 */

let _fbInitialized  = false;
let _fbMessaging    = null;
let _fbGetToken     = null;
let _cachedConfig   = null;

// ──────────────────────────────────────────
// 1. Fetch config from server
// ──────────────────────────────────────────
async function _fetchWebConfig() {
    if (_cachedConfig) return _cachedConfig;

    const apiUrl = (typeof API_URL !== 'undefined') ? API_URL : 'https://wajeezsd.com';
    const res = await fetch(`${apiUrl}/api/auth/firebase-web-config`);
    if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);

    const { config, isReady } = await res.json();
    if (!isReady) {
        console.warn(
            '[AdminWebPush] ⚠️  Firebase web config is incomplete on the server.\n' +
            '  Add these 4 env vars to your server .env:\n' +
            '    FIREBASE_WEB_API_KEY\n' +
            '    FIREBASE_WEB_MESSAGING_SENDER_ID\n' +
            '    FIREBASE_WEB_APP_ID\n' +
            '    FIREBASE_WEB_VAPID_KEY\n' +
            '  (Get them from Firebase Console → Project Settings → Your web app)\n' +
            '  VAPID key: Cloud Messaging tab → Web Push certificates → Generate key pair'
        );
        return null;
    }

    _cachedConfig = config;
    return config;
}

// ──────────────────────────────────────────
// 2. Lazy-init Firebase Web SDK
// ──────────────────────────────────────────
async function _initFirebaseWeb(config) {
    if (_fbInitialized) return true;

    try {
        const [appMod, msgMod] = await Promise.all([
            import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js')
        ]);

        const { initializeApp, getApps } = appMod;
        const { getMessaging, getToken  } = msgMod;

        const app = getApps().length === 0
            ? initializeApp(config)
            : getApps()[0];

        _fbMessaging = getMessaging(app);
        _fbGetToken  = getToken;
        _fbInitialized = true;

        console.log('[AdminWebPush] ✅ Firebase Web SDK ready');
        return true;
    } catch (err) {
        console.error('[AdminWebPush] Failed to load Firebase Web SDK:', err);
        return false;
    }
}

// ──────────────────────────────────────────
// 3. Main: register + sync token
// ──────────────────────────────────────────
async function registerAdminWebPush(authToken) {
    try {
        // a. Browser support check
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            console.warn('[AdminWebPush] Browser does not support push notifications');
            return false;
        }

        // b. Request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[AdminWebPush] Notification permission denied');
            return false;
        }

        // c. Fetch config from server
        const config = await _fetchWebConfig();
        if (!config) return false;   // incomplete config — warning already logged

        // d. Init Firebase Web SDK
        const ready = await _initFirebaseWeb(config);
        if (!ready) return false;

        // e. Get service worker registration (must be active)
        const swReg = await navigator.serviceWorker.ready;

        // f. Get FCM token
        const fcmToken = await _fbGetToken(_fbMessaging, {
            vapidKey: config.vapidKey,
            serviceWorkerRegistration: swReg
        });

        if (!fcmToken) {
            console.warn('[AdminWebPush] No FCM token returned');
            return false;
        }

        console.log('[AdminWebPush] ✅ FCM Token:', fcmToken.substring(0, 20) + '...');

        // g. Send token to server
        const apiUrl = (typeof API_URL !== 'undefined') ? API_URL : 'https://wajeezsd.com';
        const res = await fetch(`${apiUrl}/api/auth/update-fcm`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fcmToken })
        });

        if (res.ok) {
            console.log('[AdminWebPush] ✅ FCM token synced — admin push notifications enabled!');
            localStorage.setItem('adminFcmRegistered', '1');
            return true;
        }

        console.warn('[AdminWebPush] Server rejected FCM token:', res.status, await res.text());
        return false;

    } catch (err) {
        console.error('[AdminWebPush] Error during Web Push registration:', err);
        return false;
    }
}

// ──────────────────────────────────────────
// 4. Silent refresh — call from admin dashboard
// ──────────────────────────────────────────
async function refreshAdminWebPushToken() {
    // Only refresh if the admin already registered once
    if (!localStorage.getItem('adminFcmRegistered')) return false;

    const authToken = localStorage.getItem('adminToken') || localStorage.getItem('token');
    if (!authToken) return false;

    return registerAdminWebPush(authToken);
}

// Expose globally so inline scripts and admin.html can call them
window.registerAdminWebPush     = registerAdminWebPush;
window.refreshAdminWebPushToken = refreshAdminWebPushToken;
