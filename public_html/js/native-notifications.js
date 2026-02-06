import { PushNotifications } from 'https://cdn.jsdelivr.net/npm/@capacitor/push-notifications@latest/+esm';
import { Toast } from 'https://cdn.jsdelivr.net/npm/@capacitor/toast@latest/+esm';

// نستخدم Auth Helper من النافذة العامة
const Auth = window.Auth;

const NativeNotifications = {
    init: async () => {
        // التحقق من أننا في بيئة Native (موبايل)
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform();

        if (!isNative) {
            console.log('🌐 Web Mode: Notification logic skipped (FCM requires native).');
            return;
        }

        console.log('📲 Initializing Native Notifications...');
        await NativeNotifications.requestPermissions();
        await NativeNotifications.addListeners();
    },

    requestPermissions: async () => {
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn('🚫 Push notification permission denied');
            return;
        }

        await PushNotifications.register();
    },

    addListeners: async () => {
        // 1. عند نجاح التسجيل والحصول على التوكن
        PushNotifications.addListener('registration', token => {
            console.log('📍 FCM Token:', token.value);
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
            Toast.show({
                text: `${notification.title}: ${notification.body}`,
                duration: 'long',
                position: 'top'
            });

            // يمكن تحديث الواجهة هنا إذا لزم الأمر (مثل تحديث قائمة الطلبات)
            // window.dispatchEvent(new CustomEvent('notification-received'));
        });

        // 4. عند الضغط على الإشعار (Action Performed)
        PushNotifications.addListener('pushNotificationActionPerformed', notification => {
            console.log('👆 Notification Action:', notification);

            const data = notification.notification.data;
            if (data && data.url) {
                window.location.href = data.url;
            } else if (data && data.orderId) {
                window.location.href = `tracking.html?orderId=${data.orderId}`;
            }
        });
    },

    updateServerToken: async (fcmToken) => {
        if (!Auth || !Auth.isAuthenticated()) return;

        try {
            // ✅ Reverted: Use /api prefix as required
            const res = await fetch(`${API_URL}/api/auth/update-fcm`, {
                method: 'PUT',
                headers: {
                    ...Auth.getAuthHeader(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fcmToken })
            });

            if (res.ok) {
                console.log('✅ FCM Token Synced with Server');
            } else {
                console.warn('⚠️ Failed to sync FCM token:', res.status);
            }
        } catch (e) {
            console.error('❌ Error syncing FCM token:', e);
        }
    }
};

// تشغيل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    NativeNotifications.init();
});

export default NativeNotifications;
