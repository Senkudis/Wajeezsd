const CACHE_NAME = 'wassili-static-v1';
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
    '/js/notification-toast.js',
    '/js/native-notifications.js',
    '/logo.png',
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
            return cache.addAll(ASSETS_TO_CACHE);
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
                // Optional: Return offline page here
            });
        })
    );
});