const CACHE_NAME = 'wassili-static-v5';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/client-login.html',
    '/client-my-orders.html',
    '/notifications.html',
    '/admin-complaints.html',
    '/captain-login.html',
    '/css/mobile-overrides.css',
    '/css/enhanced-styles.css',
    '/css/dark-mode.css',
    '/js/app-core.js',
    '/js/config.js',
    '/notification-toast.js',
    '/js/native-notifications.js',
    '/logo.png',
    '/logo-transparent.png',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.rtl.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap'
];

// Install Event: Cache Core Assets
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Caching core assets');
            // Cache each asset individually so one failure doesn't break everything
            return Promise.allSettled(
                ASSETS_TO_CACHE.map(url =>
                    cache.add(url).catch(err => console.warn('[ServiceWorker] Failed to cache:', url, err.message))
                )
            );
        })
    );
});

// Activate Event: Cleanup Old Caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[ServiceWorker] Clearing old cache', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Cache First, Network Fallback
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // CRITICAL EXCLUSIONS
    // Do NOT cache API calls or Socket.io connections
    if (url.pathname.startsWith('/api/') ||
        url.pathname.includes('socket.io') ||
        event.request.method !== 'GET') {
        return; // Bypass service worker, go directly to network
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // 1. Return cached file if found
            if (cachedResponse) {
                return cachedResponse;
            }

            // 2. Fallback to Network
            return fetch(event.request).then((response) => {
                // Check if we received a valid response
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                // 3. Cache the new file for next time
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            }).catch((error) => {
                console.error('[ServiceWorker] Fetch failed:', error);
                // Return a generic error response to prevent "Failed to convert value to Response"
                return new Response(JSON.stringify({ error: 'Network Error' }), {
                    status: 408,
                    headers: { 'Content-Type': 'application/json' }
                });
            });
        })
    );
});

// =====================================================
// 🔔 PUSH NOTIFICATION — Rich display with Wassili logo
// =====================================================
self.addEventListener('push', (event) => {
    let payload = {
        title: 'وصل-لي 🚀',
        body: 'لديك إشعار جديد',
        type: 'general',
        url: '/'
    };

    if (event.data) {
        try {
            const raw = event.data.json();
            payload = {
                title: (raw.notification && raw.notification.title) || raw.title || payload.title,
                body: (raw.notification && raw.notification.body) || raw.body || payload.body,
                type: (raw.data && raw.data.type) || raw.type || 'general',
                url: (raw.data && raw.data.url) || raw.url || '/'
            };
        } catch (_) {
            payload.body = event.data.text();
        }
    }

    const options = {
        body: payload.body,

        // ✅ App logo as the notification icon
        icon: '/icons/icon-192x192.png',

        // ✅ Small badge shown in Android status bar
        badge: '/icons/icon-192x192.png',

        // ✅ Large branded image banner (expanded notification view)
        image: '/logo-transparent.png',

        data: {
            url: payload.url || '/',
            type: payload.type || 'general'
        },

        // Brand vibration pattern
        vibrate: [200, 100, 200],

        requireInteraction: false,

        // Action buttons in notification shade
        actions: [
            { action: 'open', title: '📲 فتح التطبيق' },
            { action: 'dismiss', title: '✕ إغلاق' }
        ],

        // Tag prevents duplicate notifications of same type
        tag: 'wassili-' + (payload.type || 'general'),
        renotify: true
    };

    event.waitUntil(
        self.registration.showNotification(payload.title, options)
    );
});

// =====================================================
// 👆 NOTIFICATION CLICK — Deep link to correct page
// =====================================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const data = event.notification.data || {};
    let targetUrl = '/';

    if (data.url && data.url !== '/') {
        targetUrl = data.url;
    } else if (data.type === 'chat') {
        targetUrl = '/client-my-orders.html';
    } else if (data.type === 'order_accepted' || data.type === 'order_update') {
        targetUrl = '/client-my-orders.html';
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    if (client.navigate) client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
