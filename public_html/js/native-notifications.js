/**
 * Native Notifications - Push Notification Management
 * Uses Capacitor native plugins when available
 */


// الحصول على الـ Capacitor plugins مباشرة
function getPushNotifications() {
    if (window.Capacitor && window.Capacitor.Plugins) {
        return window.Capacitor.Plugins.PushNotifications;
    }
    return null;
}

/**
 * 🔥 FirebaseMessaging — مصدر التوكن الوحيد على المنصّتين.
 *
 * لماذا لا @capacitor/push-notifications: على iOS تلك الإضافة تُسجّل مع APNs
 * مباشرة وتُعيد **توكن جهاز آبل** (٦٤ حرفاً ست‑عشرياً — انظر
 * PushNotificationsPlugin.swift)، لا توكن FCM. والخادم يرسل عبر firebase-admin
 * وحده، فيرفضه FCM ثم يحذفه منظّف التوكنات الميتة. أي أن iOS لم يكن ليعمل
 * أبداً مهما صحّت المفاتيح.
 *
 * وعلى أندرويد getToken() تُعيد نفس التوكن الذي كان يصل عبر حدث registration —
 * لكن كاستدعاءٍ يُنتظر بدل حدثٍ يُطلق مرّة واحدة عند الإقلاع (قبل تسجيل
 * الدخول) ثم لا يتكرّر. ذلك الحدث هو سبب حِيَل إعادة المزامنة أدناه.
 */
function getFirebaseMessaging() {
    if (window.Capacitor && window.Capacitor.Plugins) {
        return window.Capacitor.Plugins.FirebaseMessaging;
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

    // 💬 Chat Notification (قبل url — لأن رابط المحادثة المحلي يضيف receiverId)
    if (data && (data.type === 'chat' || data.type === 'chat_message')) {
        const orderId = data.orderId || data.order;
        if (orderId) {
            window.location.href = `chat.html?orderId=${orderId}&receiverId=${data.senderId || ''}`;
            return;
        }
    }

    // 🧭 الرابط المحسوب في السيرفر حسب دور المستقبِل له الأولوية —
    // خرائط الأنواع أدناه تبقى احتياطاً للإشعارات القديمة/الناقصة فقط.
    // (utils/pushRouting.js في السيرفر هو مصدر الحقيقة لوجهة كل دور+نوع)
    const serverUrl = data ? (data.url || data.targetUrl || '') : '';
    if (serverUrl && serverUrl !== '/') {
        window.location.href = serverUrl.startsWith('/') ? serverUrl.slice(1) : serverUrl;
        return;
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
            // 📦 دُمجت طلبات المتاجر في «طلباتي» — انظر utils/pushRouting.js
            window.location.href = `client-my-orders.html${recordId ? `?highlight=${recordId}` : ''}`;
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

        // 📦 Client order updates (errand quoting or active searching)
        if (role === 'client' && (data.type === 'errand_quote' || data.type === 'order_searching' || data.type === 'order_delayed')) {
            window.location.href = recordId ? `tracking.html?orderId=${recordId}` : 'client-my-orders.html';
            return;
        }

        // 📦 Client order status changes & updates -> my orders list with highlight
        if (role === 'client' && (data.type === 'order_update' || data.type === 'order_accepted' || data.type === 'order_delivered' || data.type === 'order_cancelled' || data.type === 'order_expired' || data.type === 'negotiation_offer' || data.type === 'negotiate')) {
            window.location.href = recordId ? `client-my-orders.html?highlight=${recordId}` : 'client-my-orders.html';
            return;
        }

        // 🌟 Client rate order request
        if (role === 'client' && data.type === 'order_completed') {
            window.location.href = recordId ? `client-my-orders.html?rateOrder=${recordId}` : 'client-my-orders.html';
            return;
        }

        // Explicit URL always wins
        if (data.url) {
            window.location.href = data.url;
            return;
        }

        // Generic fallback using the record id (role-aware)
        if (recordId) {
            if (role === 'captain') window.location.href = `captain-orders.html?highlight=${recordId}`;
            else if (role === 'merchant') window.location.href = `merchant-orders.html?highlight=${recordId}`;
            else if (role === 'admin') window.location.href = 'admin.html';
            else window.location.href = `client-my-orders.html?highlight=${recordId}`;
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
        }

        // 🔑 اسحب التوكن الحقيقي من Firebase — لا تنتظر حدثاً قد لا يأتي.
        await NativeNotifications.pullToken();
    },

    /**
     * يجلب توكن FCM ويُزامنه. آمنٌ للاستدعاء المتكرّر.
     *
     * يُفضَّل على انتظار حدث registration لثلاثة أسباب: يُعيد قيمةً يمكن
     * انتظارها، ويعمل بعد تسجيل الدخول لا قبله فقط، ويُعطي **توكن FCM على
     * iOS** بدل توكن APNs الذي يرفضه الخادم.
     */
    pullToken: async () => {
        const FM = getFirebaseMessaging();
        if (!FM) {
            // 🛟 نسخةٌ قديمة مثبّتة بلا الإضافة — نُبقي المسار السابق عاملاً
            //    على أندرويد بدل أن نُسقط الإشعارات عن مستخدميها.
            try {
                const PN = getPushNotifications();
                if (PN) {
                    const st = await PN.checkPermissions();
                    if (st.receive === 'granted') await PN.register();
                }
            } catch (_) {}
            return null;
        }

        try {
            const { token } = await FM.getToken();
            if (!token) return null;
            localStorage.setItem('fcmToken', token);
            NativeNotifications.updateServerToken(token);
            return token;
        } catch (err) {
            // جهاز بلا خدمات Google، أو Firebase غير مهيّأ — الإشعارات وحدها
            // تتعطّل وبقيّة التطبيق يعمل.
            console.warn('🔕 تعذّر جلب توكن FCM:', err?.message || err);
            return null;
        }
    },
    _initialized: false,

    requestPermissions: async () => {
        // 🔔 نُفضّل إضافة Firebase حين تتوفّر: طلبُ الإذن عبرها يُهيّئ
        //    FirebaseApp ويُسجّل مع APNs ويربط مندوب Messaging في خطوة
        //    واحدة — وهي السلسلة التي يحتاجها iOS ليُصدر توكن FCM أصلاً.
        const PushNotifications = getFirebaseMessaging() || getPushNotifications();
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

        // فشل التسجيل لا يجوز أن يُسقط تدفّق الإقلاع: على جهاز بلا خدمات Google،
        // أو إن تعذّرت تهيئة Firebase، يرفض النداء الأصلي ويصير وعداً مرفوضاً بلا
        // معالج. الإشعارات تتعطّل وحدها، وبقيّة التطبيق تعمل.
        try {
            // إضافة Firebase لا تملك register(): getToken() هي التي تُسجّل
            // وتُعيد التوكن معاً.
            if (typeof PushNotifications.register === 'function') {
                await PushNotifications.register();
            } else {
                await NativeNotifications.pullToken();
            }
        } catch (err) {
            console.warn('🔕 تعذّر تسجيل الإشعارات — التطبيق يعمل بدونها:', err?.message || err);
        }
    },

    addListeners: async () => {
        const PushNotifications = getPushNotifications();
        const Toast = getToast();
        if (!PushNotifications) return;

        // 1. تجدُّد التوكن — FCM يُدوّره من تلقائه (إعادة تثبيت، مسح بيانات،
        //    استعادة نسخة احتياطية). بلا هذا يبقى الخادم على توكنٍ ميت.
        const FM = getFirebaseMessaging();
        if (FM) {
            FM.addListener('tokenReceived', ({ token }) => {
                if (!token) return;
                console.log('🔄 FCM token rotated');
                localStorage.setItem('fcmToken', token);
                NativeNotifications.updateServerToken(token);
            });
        }

        // 2. حدث registration من إضافة Capacitor — احتياطيّ لأندرويد وحده.
        PushNotifications.addListener('registration', token => {
            const value = token && token.value;
            if (!value) return;

            // ⚠️ على iOS هذا **توكن APNs** لا FCM: ٦٤ حرفاً ست‑عشرياً تُعيدها
            //    الإضافة من آبل مباشرة. تخزينه كان يُفسد الحالة — يُرسَل
            //    للخادم فيرفضه FCM ثم يُحذف، ويظنّ التطبيق أن لديه توكناً.
            //    نُسقطه هنا: مصدر التوكن الحقيقي هو FirebaseMessaging.getToken().
            if (/^[0-9a-fA-F]{64}$/.test(value)) {
                console.log('🍏 تجاهُل توكن APNs — التوكن يأتي من Firebase');
                return;
            }

            // لو كانت الإضافة حاضرة فهي المصدر، ولا حاجة لهذا المسار
            if (getFirebaseMessaging()) return;

            console.log('📍 FCM Token (fallback):', value);
            localStorage.setItem('fcmToken', value);
            NativeNotifications.updateServerToken(value);
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
            console.log('👆 Notification Tap (native forward):', event.orderId, event.notifType, event.targetUrl);
            // 🧭 targetUrl: الوجهة المحسوبة في السيرفر حسب دور المستقبِل (لها الأولوية)
            routeNotificationTap({ orderId: event.orderId, type: event.notifType, url: event.targetUrl || '' });
        });
    },

    updateServerToken: async (fcmToken) => {
        // ✅ Guard 1: تجاهل إن كان نفس التوكن أُرسل بنجاح لنفس الحساب من قبل.
        // 🔑 حرج: توكن FCM مرتبط بالجهاز لا بالحساب. عند تبديل الحسابات على نفس الهاتف
        // (عميل ← كابتن ← تاجر ← أدمن أثناء الاختبار) كان الحارس القديم يقارن بالتوكن فقط
        // فيتخطى المزامنة، فلا يُكتب fcmToken للحساب الجديد في القاعدة → لا تصله إشعارات push.
        // الحل: نربط علامة "تمت المزامنة" بمعرّف المستخدم الحالي أيضاً.
        let currentUserId = '';
        try {
            currentUserId = (window.Auth && window.Auth.getUser && (window.Auth.getUser() || {})._id)
                || localStorage.getItem('userId') || '';
        } catch (_) {}
        const syncKey = `${currentUserId}:${fcmToken}`;

        const lastSynced = localStorage.getItem('fcmToken_synced');
        if (lastSynced === syncKey) {
            console.log('🔁 FCM token already synced for this account — skipping');
            return;
        }

        // ✅ Guard 2: Debounce — لا إرسال مزدوج خلال 10 ثوانٍ **لنفس المفتاح فقط**.
        // 🔑 حرج: الـ debounce القديم كان يقارن بالوقت وحده. عند تدوير FCM للتوكن، تُطلق
        // init() مزامنة التوكن المخزّن ثم يصل حدث registration بتوكن *جديد* خلال ثوانٍ —
        // فيُكبح الجديد ويظل السيرفر شايلاً التوكن الميت (ثم يحذفه تلقائياً عند الفشل)،
        // فلا تصل إشعارات لهذا الجهاز حتى إعادة فتح التطبيق. الآن الكبح يخصّ نفس المفتاح.
        const now = Date.now();
        const lastAttemptKey = localStorage.getItem('fcmToken_lastAttemptKey') || '';
        const lastAttempt = parseInt(localStorage.getItem('fcmToken_lastAttempt') || '0', 10);
        if (lastAttemptKey === syncKey && now - lastAttempt < 10000) {
            console.log('⏳ FCM sync debounced — same token/account, too soon since last attempt');
            return;
        }
        localStorage.setItem('fcmToken_lastAttempt', String(now));
        localStorage.setItem('fcmToken_lastAttemptKey', syncKey);

        // ✅ Guard 3: in-flight guard — لا طلبان في نفس الوقت
        if (NativeNotifications._fcmSyncing) {
            console.log('🔒 FCM sync already in progress — skipping');
            return;
        }
        NativeNotifications._fcmSyncing = true;

        // Get token from Auth helper OR fallback to adminToken/token in localStorage
        const authToken = (window.Auth && window.Auth.getToken()) || localStorage.getItem('adminToken') || localStorage.getItem('token');
        if (!authToken) {
            console.warn('⚠️ No auth token available — cannot sync FCM token');
            NativeNotifications._fcmSyncing = false;
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
                // ✅ سجّل النجاح مربوطاً بالحساب الحالي حتى لا نُعيد إرساله بلا داعٍ في نفس الجلسة،
                // مع ضمان إعادة المزامنة تلقائياً عند تبديل الحساب (المفتاح يتضمن userId).
                localStorage.setItem('fcmToken_synced', syncKey);
            } else {
                const errText = await res.text().catch(() => '');
                console.warn('⚠️ Failed to sync FCM token:', res.status, errText);
                // عند 429: امسح طابع الوقت حتى يُعاد المحاولة بعد توقف
                if (res.status === 429) {
                    localStorage.removeItem('fcmToken_lastAttempt');
                }
            }
        } catch (e) {
            console.error('❌ Error syncing FCM token:', e);
            localStorage.removeItem('fcmToken_lastAttempt');
        } finally {
            NativeNotifications._fcmSyncing = false;
        }
    },

    _fcmSyncing: false
};

// تشغيل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {

    NativeNotifications.init();
    // إتاحتها للجلوبال عشان نستدعيها في أي وقت (مثلاً بعد طلب اللوكيشن)
    window.requestPushPermissions = NativeNotifications.requestPermissions;
});

// ✅ تعريض عالمي — يعمل مع <script> العادي و type="module" معاً
window.NativeNotifications = NativeNotifications;
