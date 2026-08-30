/**
 * Captain Service - Background Location Tracking
 * Uses Capacitor native plugins when available, falls back to web API
 */

// نستخدم Auth Helper من النافذة العامة
const Auth = window.Auth;
let watcherId = null;

// الحصول على الـ Capacitor plugins مباشرة من النافذة
function getBackgroundGeolocation() {
    if (window.Capacitor && window.Capacitor.Plugins) {
        return window.Capacitor.Plugins.BackgroundGeolocation;
    }
    return null;
}

function getKeepAwake() {
    if (window.Capacitor && window.Capacitor.Plugins) {
        return window.Capacitor.Plugins.KeepAwake;
    }
    return null;
}

function getCapacitorApp() {
    if (window.Capacitor && window.Capacitor.Plugins) {
        return window.Capacitor.Plugins.App;
    }
    return null;
}

// ── حالة التطبيق (foreground / background) ──
let _appInBackground = false;

// ── HTTP throttle: مرة كل 5 ثوانٍ كحد أقصى ──
let _lastHttpSend = 0;
const HTTP_THROTTLE_MS = 5000;

// ── Offline GPS Queue — يُخزّن الإحداثيات أثناء انقطاع الشبكة ──
const _offlineQueue = [];
const _MAX_QUEUE = 120; // أقصى 120 نقطة (~20 دقيقة)
let _isOnline = navigator.onLine;

window.addEventListener('online', () => {
    _isOnline = true;
    
    CaptainService._flushOfflineQueue();
});
window.addEventListener('offline', () => {
    _isOnline = false;
    
});

const CaptainService = {
    init: async () => {
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform();
        if (!isNative) {
            
            return;
        }

        // ✅ استمع لتغير حالة التطبيق (foreground/background)
        // عند الانتقال للخلفية: نضمن إرسال الموقع عبر HTTP لأن الـ socket مجمّد
        const CapApp = getCapacitorApp();
        if (CapApp) {
            CapApp.addListener('appStateChange', ({ isActive }) => {
                _appInBackground = !isActive;
                
            });
        }

        
    },

    startTracking: async (userId) => {
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform();

        try {
            // 1. تفعيل الشاشة (Keep Awake)
            if (isNative) {
                const KeepAwake = getKeepAwake();
                if (KeepAwake) {
                    await KeepAwake.keepAwake();
                    
                }
            }

            // 2. بدء التتبع
            if (isNative) {
                const BackgroundGeolocation = getBackgroundGeolocation();
                if (BackgroundGeolocation) {
                    watcherId = await BackgroundGeolocation.addWatcher(
                        {
                            backgroundMessage: "جاري مشاركة موقعك مع العملاء لإستقبال الطلبات.",
                            backgroundTitle: "أنت متصل الآن 🟢",
                            requestPermissions: true,
                            stale: true,
                            distanceFilter: 10  // ✅ رُفع من 3m إلى 10m لتقليل الاستهلاك
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
                            CaptainService.sendLocationToServer(userId, location.latitude, location.longitude);
                        }
                    );
                    
                    // طلب إذن تخطي توفير طاقة البطارية للحفاظ على اتصال Socket في الخلفية
                    if (window.AndroidDownloader && typeof window.AndroidDownloader.requestBatteryBypass === 'function') {
                        setTimeout(() => {
                            window.AndroidDownloader.requestBatteryBypass();
                        }, 1000); // تأخير قليل لتجنب تداخل النوافذ المنبثقة
                    }
                } else {
                    console.warn('⚠️ BackgroundGeolocation plugin not available, using web fallback');
                    CaptainService._startWebTracking(userId);
                }
            } else {
                CaptainService._startWebTracking(userId);
            }

            

            // 💓 Heartbeat: يُرسل الموقع الأخير كل 10 ثوانٍ عند عدم الحركة
            CaptainService.startHeartbeat(userId);

        } catch (e) {
            console.error("❌ Tracking Failed:", e);
            CaptainService._startWebTracking(userId);
        }
    },

    _startWebTracking: (userId) => {
        if (navigator.geolocation) {
            watcherId = navigator.geolocation.watchPosition(
                (pos) => {
                    CaptainService.sendLocationToServer(userId, pos.coords.latitude, pos.coords.longitude);
                },
                (err) => console.error(err),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        }
    },

    stopTracking: async () => {
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform();

        if (CaptainService.heartbeatInterval) {
            clearInterval(CaptainService.heartbeatInterval);
            CaptainService.heartbeatInterval = null;
        }

        try {
            if (isNative && watcherId) {
                const BackgroundGeolocation = getBackgroundGeolocation();
                const KeepAwake = getKeepAwake();
                if (BackgroundGeolocation) await BackgroundGeolocation.removeWatcher({ id: watcherId });
                if (KeepAwake) await KeepAwake.allowSleep();
            } else if (watcherId) {
                navigator.geolocation.clearWatch(watcherId);
            }
            watcherId = null;
            
        } catch (e) {
            console.error("Stop Error:", e);
        }
    },

    // 💓 Heartbeat Logic
    lastLocationTime: 0,
    lastLocation: null,
    heartbeatInterval: null,

    startHeartbeat: (userId) => {
        if (CaptainService.heartbeatInterval) clearInterval(CaptainService.heartbeatInterval);

        CaptainService.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            if (now - CaptainService.lastLocationTime > 8000 && CaptainService.lastLocation) {
                
                const { lat, lng } = CaptainService.lastLocation;
                // الـ heartbeat يُجبر HTTP في الخلفية لضمان التحديث
                CaptainService.sendLocationToServer(userId, lat, lng, true);
            }
        }, 8000);
    },

    /**
     * إرسال الموقع للسيرفر
     * ──────────────────────────────────────────────────────────
     * الاستراتيجية:
     *   • في المقدمة (foreground): Socket أولاً + HTTP كل 5 ثوانٍ كنسخة احتياطية
     *   • في الخلفية (background): HTTP فقط لأن الـ socket مجمّد من Android
     *   • forceHttp=true (heartbeat): يُرسل HTTP دائماً بغض النظر عن الحالة
     * ──────────────────────────────────────────────────────────
     */
    sendLocationToServer: (userId, lat, lng, forceHttp = false) => {
        CaptainService.lastLocation = { lat, lng };
        CaptainService.lastLocationTime = Date.now();

        const now = Date.now();
        const shouldSendHttp = forceHttp || _appInBackground || (now - _lastHttpSend >= HTTP_THROTTLE_MS);

        // ── Socket (في المقدمة فقط) ──
        if (!_appInBackground && window.socket && window.socket.connected) {
            window.socket.emit('update_location', { userId, lat, lng });
        }

        // ── HTTP (دائماً في الخلفية، أو كنسخة احتياطية كل 5 ثوانٍ) ──
        if (shouldSendHttp) {
            _lastHttpSend = now;
            if (!_isOnline) {
                // 📴 لا يوجد إنترنت — أضف الموقع لقائمة الانتظار
                if (_offlineQueue.length < _MAX_QUEUE) {
                    _offlineQueue.push({ lat, lng, timestamp: now });
                    
                }
                return;
            }
            const apiBase = (typeof API_URL !== 'undefined') ? API_URL : 'https://wajeezsd.com';
            const token = localStorage.getItem('token');
            if (token) {
                fetch(`${apiBase}/api/captain/update-location`, {
                    method: 'PUT',
                    keepalive: true,   // ✅ يضمن إتمام الطلب حتى لو أُغلق التطبيق
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ lat, lng })
                }).catch(() => {
                    // صامت — لا يُطبع خطأ في الخلفية لتجنب التشويش
                });
            }
        }
    }
    ,
    _flushOfflineQueue: async () => {
        if (!_offlineQueue.length) return;
        const apiBase = (typeof API_URL !== 'undefined') ? API_URL : 'https://wajeezsd.com';
        const token = localStorage.getItem('token');
        if (!token) { _offlineQueue.length = 0; return; }

        // أرسل آخر موقع فقط (الأحدث) — لا داعي لإرسال كل النقاط للسيرفر
        const last = _offlineQueue[_offlineQueue.length - 1];
        _offlineQueue.length = 0; // امسح القائمة فوراً

        try {
            await fetch(`${apiBase}/api/captain/update-location`, {
                method: 'PUT',
                keepalive: true,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ lat: last.lat, lng: last.lng })
            });
            
        } catch (e) {
            console.warn('Failed to flush GPS queue:', e);
        }
    }
};

window.CaptainService = CaptainService;

// ✅ تلقائياً نُهيئ الخدمة فور تحميل الملف لتسجيل الـ App State Listeners
CaptainService.init().catch(console.error);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CaptainService;
}

