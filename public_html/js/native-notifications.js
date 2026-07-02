/**
 * Native Notifications - Push Notification Management
 * Uses Capacitor native plugins when available
 */

// نستخدم Auth Helper من النافذة العامة
const Auth = window.Auth;

// الحصول على الـ Capacitor plugins مباشرة
function getPushNotifications() {
    if (window.Capacitor && window.Capacitor.Plugins) {
        return window.Capacitor.Plugins.PushNotifications;
    }
    return null;
}

function getToast() {
    if (window.Capacitor && window.Capacitor.Plugins) {
        return window.Capacitor.Plugins.Toast;
    }
    return null;
}

/**
 * Deep-link routing shared by both notification-tap paths:
 * 1. Capacitor's own 'pushNotificationActionPerformed' (kept as a fallback; in this app's
 *    architecture it typically never fires, since WassiliFCMService.java builds the
 *    notification and its tap Intent manually, bypassing Capacitor's push plugin).
 * 2. The 'wajeezPushTapped' window event that MainActivity.java dispatches for every
 *    real-world tap (foreground/background/killed), forwarding the orderId/type extras
 *    from the notification's launch Intent.
 * @param {{orderId?: string, relatedId?: string, senderId?: string, type?: string, url?: string}} data
 */
function routeNotificationTap(data) {
    // 🔗 Normalise the record id — server may send it as relatedId or orderId
    const recordId = data ? (data.orderId || data.relatedId || '') : '';

    // 💬 Chat Notification
    if (data && (data.type === 'chat' || data.type === 'chat_message')) {
        const orderId = data.orderId || data.order;
        if (orderId) {
            window.location.href = `chat.html?orderId=${orderId}&receiverId=${data.senderId || ''}`;
            return;
        }
    }

    // ✅ Route by user role
    const userStr = localStorage.getItem('user');
    let role = '';
    try { role = userStr ? (JSON.parse(userStr).role || '').toLowerCase() : ''; } catch (_) {}

    if (data) {
        // 🏍️ New order for captain — go to available orders list (details visible there now)
        if (role === 'captain' && (data.type === 'new_order' || data.type === 'shop_order')) {
            window.location.href = `captain-orders.html?highlight=${recordId}`;
            return;
        }

        // 🏍️ Captain got a mission accepted / assigned — go to missions
        if (role === 'captain' && (data.type === 'order_accepted' || data.type === 'order_assigned' || data.type === 'negotiation_accepted')) {
            window.location.href = 'captain-missions.html';
            return;
        }

        // 🏪 Merchant — new order / client uploaded payment receipt → merchant orders list
        if (role === 'merchant' && (data.type === 'new_shop_order' || data.type === 'payment_receipt')) {
            window.location.href = `merchant-orders.html${recordId ? `?highlight=${recordId}` : ''}`;
            return;
        }

        // 📦 Client — shop order status change (accepted/ready/rejected/payment) → shop orders
        if (role === 'client' && (data.type === 'shop_order_update' || data.type === 'payment_confirmed' || data.type === 'payment_reminder')) {
            window.location.href = `client-shop-orders.html${recordId ? `?highlight=${recordId}` : ''}`;
            return;
        }

        // 🏬 Admin — new merchant signup request → merchant requests review
        if (role === 'admin' && data.type === 'merchant_request') {
            window.location.href = 'admin-merchant-requests.html';
            return;
        }

        // 🚨 Admin — captain emergency alert → live map
        if (role === 'admin' && data.type === 'emergency') {
            window.location.href = 'admin-live-map.html';
            return;
        }

        // 👨‍💼 Admin — general alert / broadcast → dashboard
        if (role === 'admin' && (data.type === 'admin_order_alert' || data.type === 'admin_alert' || data.type === 'broadcast')) {
            window.location.href = 'admin.html';
            return;
        }

        // 📦 Client order update — go to my orders
        if (role === 'client' && (data.type === 'order_update' || data.type === 'order_accepted' || data.type === 'order_delivered')) {
            window.location.href = recordId ? `tracking.html?orderId=${recordId}` : 'client-my-orders.html';
            return;
        }

        // 🌟 Client rate order request
        if (role === 'client' && data.type === 'order_completed') {
            window.location.href = `client-my-orders.html?rateOrder=${recordId}`;
            return;
        }

        // Explicit URL always wins
        if (data.url) {
            window.location.href = data.url;
            return;
        }

        // Generic fallback using the record id (role-aware)
        if (recordId) {
            if (role === 'captain') window.location.href = 'captain-orders.html';
            else if (role === 'merchant') window.location.href = 'merchant-orders.html';
            else if (role === 'admin') window.location.href = 'admin.html';
            else window.location.href = `tracking.html?orderId=${recordId}`;
            return;
        }
    }
}

const NativeNotifications = {
    init: async () => {
        // ✅ SINGLETON: Prevent double-initialization (e.g. if script loads twice)
        if (NativeNotifications._initialized) return;
        NativeNotifications._initialized = true;

        const isNative = window.Capacitor && window.Capacitor.isNativePlatform();

        if (!isNative) {
            console.log('🌐 Web Mode: Notification logic skipped (FCM requires native).');
            return;
        }

        console.log('📲 Initializing Native Notifications Listeners...');
        await NativeNotifications.requestPermissions();
        await NativeNotifications.addListeners();

        // 🔄 إصلاح حرج: حدث registration يُطلق التوكن مرة واحدة عند التشغيل (قبل الدخول)،
        // فلا يصل التوكن للسيرفر. هنا نُعيد مزامنة التوكن المخزّن في كل تحميل صفحة —
        // فبمجرّد تسجيل الدخول يُحفظ التوكن في القاعدة فتصل إشعارات الطلبات (push).
        const storedToken = localStorage.getItem('fcmToken');
        if (storedToken) {
            NativeNotifications.updateServerToken(storedToken);
        } else {
            // لا توكن مخزّن بعد → أعد طلب التسجيل (لو الإذن ممنوح) لإطلاق registration
            try {
                const PN = getPushNotifications();
                if (PN) {
                    const st = await PN.checkPermissions();
                    if (st.receive === 'granted') await PN.register();
                }
            } catch (_) {}
        }
    },
    _initialized: false,

    requestPermissions: async () => {
        const PushNotifications = getPushNotifications();
        if (!PushNotifications) return;

        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            // Let the AppCore overlay handle the request, just return early
            console.log('🔔 Push notification permission needs to be requested via AppCore overlay');
            return;
        }

        if (permStatus.receive !== 'granted') {
            console.warn('🚫 Push notification permission denied');
            return;
        }

        await PushNotifications.register();
    },

    addListeners: async () => {
        const PushNotifications = getPushNotifications();
        const Toast = getToast();
        if (!PushNotifications) return;

        // 1. عند نجاح التسجيل والحصول على التوكن
        PushNotifications.addListener('registration', token => {
            console.log('📍 FCM Token:', token.value);
            // ✅ FIX: احفظ التوكن في localStorage فوراً
            // لأن التسجيل يحصل قبل تسجيل الدخول، والـ registration event
            // لا يُعاد إطلاقه بعد التنقل بين الصفحات إذا لم يتغير التوكن
            localStorage.setItem('fcmToken', token.value);
            NativeNotifications.updateServerToken(token.value);
        });

        // 2. عند حدوث خطأ في التسجيل
        PushNotifications.addListener('registrationError', error => {
            console.error('❌ Error on registration:', error);
        });

        // 3. عند استقبال إشعار والتطبيق مفتوح (Foreground)
        PushNotifications.addListener('pushNotificationReceived', notification => {
            console.log('🔔 Notification Received:', notification);

            // إظهار تنبيه صغير (Toast)
            if (Toast) {
                Toast.show({
                    text: `${notification.title}: ${notification.body}`,
                    duration: 'long',
                    position: 'top'
                });
            }
        });

        // 4. عند الضغط على الإشعار (Action Performed)
        // Fallback path — see routeNotificationTap() doc comment for why this rarely fires here.
        PushNotifications.addListener('pushNotificationActionPerformed', notification => {
            console.log('👆 Notification Action:', notification);
            routeNotificationTap(notification.notification.data);
        });

        // 5. Real-world tap path for background/killed taps: MainActivity.java dispatches
        // this once the WebView has a page ready to receive it (see MainActivity.java).
        window.addEventListener('wajeezPushTapped', event => {
            console.log('👆 Notification Tap (native forward):', event.orderId, event.notifType);
            routeNotificationTap({ orderId: event.orderId, type: event.notifType });
        });
    },

    updateServerToken: async (fcmToken) => {
        // Get token from Auth helper OR fallback to adminToken/token in localStorage
        const authToken = (Auth && Auth.getToken()) || localStorage.getItem('adminToken') || localStorage.getItem('token');
        if (!authToken) {
            console.warn('⚠️ No auth token available — cannot sync FCM token');
            return;
        }

        const apiUrl = (typeof API_URL !== 'undefined') ? API_URL : (window.API_URL || 'https://wajeezsd.com');

        try {
            console.log('📤 Sending FCM token to server...');
            const res = await fetch(`${apiUrl}/api/auth/update-fcm`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fcmToken })
            });

            if (res.ok) {
                console.log('✅ FCM Token Synced with Server');
            } else {
                console.warn('⚠️ Failed to sync FCM token:', res.status, await res.text());
            }
        } catch (e) {
            console.error('❌ Error syncing FCM token:', e);
        }
    }
};

// تشغيل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    NativeNotifications.init();
    // إتاحتها للجلوبال عشان نستدعيها في أي وقت (مثلاً بعد طلب اللوكيشن)
    window.requestPushPermissions = NativeNotifications.requestPermissions;
});

export default NativeNotifications;
