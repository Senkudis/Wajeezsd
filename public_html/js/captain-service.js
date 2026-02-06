import { BackgroundGeolocation } from 'https://cdn.jsdelivr.net/npm/@capacitor-community/background-geolocation@latest/+esm';
import { KeepAwake } from 'https://cdn.jsdelivr.net/npm/@capacitor-community/keep-awake@latest/+esm';

// نستخدم Auth Helper من النافذة العامة
const Auth = window.Auth;
let watcherId = null;

const CaptainService = {
    init: async () => {
        // التحقق من أننا في بيئة Native
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform();

        if (!isNative) {
            console.log('🌐 Web Mode: Using standard Geolocation API.');
            return;
        }

        console.log('🚀 Initializing Captain Service (Native)...');
        // طلب الأذونات عند التحميل أو عند الحاجة
    },

    startTracking: async (userId) => {
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform();

        try {
            // 1. تفعيل الشاشة (Keep Awake)
            if (isNative) {
                await KeepAwake.keepAwake();
                console.log('💡 KeepAwake Enabled');
            }

            // 2. بدء التتبع
            if (isNative) {
                // إضافة مستمع للموقع في الخلفية
                watcherId = await BackgroundGeolocation.addWatcher(
                    {
                        backgroundMessage: "جاري مشاركة موقعك مع العملاء لإستقبال الطلبات.",
                        backgroundTitle: "أنت متصل الآن 🟢",
                        requestPermissions: true,
                        stale: false,
                        distanceFilter: 10 // تحديث كل 10 أمتار
                    },
                    (location, error) => {
                        if (error) {
                            if (error.code === "NOT_AUTHORIZED") {
                                if (window.confirm("التطبيق بحاجة لإذن الموقع ليعمل في الخلفية، هل تريد فتح الإعدادات؟")) {
                                    BackgroundGeolocation.openSettings();
                                }
                            }
                            return console.error(error);
                        }

                        console.log('📍 New Location:', location);
                        CaptainService.sendLocationToServer(userId, location.latitude, location.longitude);
                    }
                );
            } else {
                // Fallback for Web
                if (navigator.geolocation) {
                    watcherId = navigator.geolocation.watchPosition(
                        (pos) => {
                            CaptainService.sendLocationToServer(userId, pos.coords.latitude, pos.coords.longitude);
                        },
                        (err) => console.error(err),
                        { enableHighAccuracy: true }
                    );
                }
            }

            console.log("✅ Tracking Started");

        } catch (e) {
            console.error("❌ Link Failed:", e);
        }
    },

    stopTracking: async () => {
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform();

        try {
            if (isNative && watcherId) {
                await BackgroundGeolocation.removeWatcher({ id: watcherId });
                await KeepAwake.allowSleep();
            } else if (watcherId) {
                navigator.geolocation.clearWatch(watcherId);
            }

            watcherId = null;
            console.log("🛑 Tracking Stopped");
        } catch (e) {
            console.error("Stop Error:", e);
        }
    },

    sendLocationToServer: (userId, lat, lng) => {
        // 1. Send via Socket.io if connected
        if (window.socket && window.socket.connected) {
            window.socket.emit('update_location', { userId, lat, lng });
        }

        // 2. (Optional) Send via API for persistence/logging every X times?
        // For now, Socket is enough for realtime.
    }
};

window.CaptainService = CaptainService;
export default CaptainService;
