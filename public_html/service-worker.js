const CACHE_NAME = 'wajeez-static-v47';
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
    '/js/home.js',
    '/js/order-feature.js',
    '/js/auth-helper.js',
    '/js/input-validator.js',
    '/js/theme-manager.js',
    '/js/onboarding.js',
    '/js/saved-locations.js',
    '/js/native-dialogs.js',
    '/sounds/wajeezsd-bell.wav',
    '/logo.png',
    '/logo-transparent.png',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    // ✅ Local vendor libraries — bundled so the app renders correctly
    //    on the very first launch WITHOUT internet (previously loaded from CDN,
    //    which left the UI unstyled/"scattered" before the first online visit).
    '/vendor/bootstrap/bootstrap.rtl.min.css',
    '/vendor/bootstrap/bootstrap.bundle.min.js',
    '/vendor/bootstrap-icons/bootstrap-icons.min.css',
    '/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',
    '/vendor/sweetalert2/sweetalert2.all.min.js',
    '/vendor/socket.io/socket.io.min.js',
    '/vendor/fonts/fonts.css'
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

// Fetch Event: Network-First for HTML, Cache-First for assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // CRITICAL EXCLUSIONS — bypass service worker entirely for these:
    if (url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/uploads/') || // Images uploaded by admin — always fetch fresh
        url.pathname.includes('socket.io') ||
        event.request.method !== 'GET') {
        return; // Go directly to network, no caching
    }

    // ✅ Network-First for HTML pages (so admins always get the latest page)
    const isHtml = url.pathname.endsWith('.html') ||
                   url.pathname === '/' ||
                   event.request.headers.get('accept')?.includes('text/html');

    if (isHtml) {
        event.respondWith(
            fetch(event.request).then((response) => {
                // Update cache with fresh copy
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                }
                return response;
            }).catch(() => {
                // Offline fallback — serve cached copy if network fails
                return caches.match(event.request).then(cached => cached || Response.error());
            })
        );
        return;
    }

    // Cache-First for static assets (CSS, JS, images, fonts)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((response) => {
                // \u2705 \u0625\u0635\u0644\u0627\u062d BUG-16: \u0627\u0644\u0633\u0645\u0627\u062d \u0628\u062a\u062e\u0632\u064a\u0646 cross-origin assets (cors) \u0645\u062b\u0644 Google Fonts \u0648\u0627\u0644\u0640 CDN
                if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
                    return response;
                }

                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            }).catch((error) => {
                console.error('[ServiceWorker] Fetch failed:', error);
                return Response.error();
            });
        })
    );
});

// =====================================================
// 🔔 PUSH NOTIFICATION — Rich display with Wajeez logo
// =====================================================
self.addEventListener('push', (event) => {
    let payload = {
        title: 'وجيز 🚀',
        body: 'لديك إشعار جديد',
        type: 'general',
        url: '/',
        orderId: '',
        relatedId: '',
        senderId: ''
    };

    if (event.data) {
        try {
            const raw = event.data.json();
            const d = raw.data || {};
            payload = {
                title: (raw.notification && raw.notification.title) || raw.title || payload.title,
                body: (raw.notification && raw.notification.body) || raw.body || payload.body,
                type: d.type || raw.type || 'general',
                url: d.url || raw.url || '/',
                // ✅ Carry the record id through so notificationclick can deep-link to the exact order
                orderId: d.orderId || '',
                relatedId: d.relatedId || '',
                senderId: d.senderId || ''
            };
        } catch (_) {
            payload.body = event.data.text();
        }
    }

    const options = {
        body: payload.body,

        // ✅ App logo as the notification icon (large circle)
        icon: '/icons/icon-192x192.png',

        data: {
            url: payload.url || '/',
            type: payload.type || 'general',
            orderId: payload.orderId,
            relatedId: payload.relatedId,
            senderId: payload.senderId
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
        tag: 'wajeezsd-' + (payload.type || 'general'),
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
    // 🔗 Normalise the record id — server may send it as relatedId or orderId
    const recordId = data.orderId || data.relatedId || '';
    let targetUrl = '/';

    // Explicit URL always wins
    if (data.url && data.url !== '/') {
        targetUrl = data.url;
    }
    // 🏍️ Captain — new order → captain-orders.html (details visible there)
    else if (data.type === 'new_order' || data.type === 'shop_order') {
        targetUrl = '/captain-orders.html' + (recordId ? `?highlight=${recordId}` : '');
    }
    // 🏍️ Captain — mission accepted/assigned → missions
    else if (data.type === 'order_assigned' || data.type === 'negotiation_accepted') {
        targetUrl = '/captain-missions.html';
    }
    // 🏪 Merchant — new order / payment receipt uploaded → merchant orders list
    else if (data.type === 'new_shop_order' || data.type === 'payment_receipt') {
        targetUrl = '/merchant-orders.html' + (recordId ? `?highlight=${recordId}` : '');
    }
    // 📦 Client — shop order status change (accepted/ready/rejected/payment) → shop orders
    else if (data.type === 'shop_order_update' || data.type === 'payment_confirmed' || data.type === 'payment_reminder') {
        targetUrl = '/client-shop-orders.html' + (recordId ? `?highlight=${recordId}` : '');
    }
    // 🌟 Client — rate a completed order
    else if (data.type === 'order_completed') {
        targetUrl = '/client-my-orders.html' + (recordId ? `?rateOrder=${recordId}` : '');
    }
    // 🏬 Admin — new merchant signup request → merchant requests review
    else if (data.type === 'merchant_request') {
        targetUrl = '/admin-merchant-requests.html';
    }
    // 🚨 Admin — captain emergency alert → live map
    else if (data.type === 'emergency') {
        targetUrl = '/admin-live-map.html';
    }
    // 👨‍💼 Admin — general alert / broadcast → dashboard
    else if (data.type === 'admin_order_alert' || data.type === 'admin_alert' || data.type === 'broadcast') {
        targetUrl = '/admin.html';
    }
    // 💬 Chat → chat page
    else if (data.type === 'chat' || data.type === 'chat_message') {
        const orderId = data.orderId || data.order;
        targetUrl = orderId ? `/chat.html?orderId=${orderId}&receiverId=${data.senderId || ''}` : '/conversations.html';
    }
    // 📦 Client → my orders
    else if (data.type === 'order_accepted' || data.type === 'order_update' || data.type === 'order_delivered') {
        targetUrl = recordId ? `/tracking.html?orderId=${recordId}` : '/client-my-orders.html';
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
