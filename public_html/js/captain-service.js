/**
 * Captain Service - Background Location Tracking
 * Uses Capacitor native plugins when available, falls back to web API
 */

// نستخدم Auth Helper من النافذة العامة
const Auth = window.Auth;
let watcherId = null;

// ⏱️ أقصى عمرٍ لقراءةٍ نُعيد إرسالها في النبض. فوقه لا نرسل شيئاً: إرسال
//    قراءةٍ قديمة بختمٍ جديد يُخفي العطل عن الخادم وعن العميل معاً.
const MAX_FIX_AGE_MS = 45 * 1000;
// لا نُغرق الكابتن بالتنبيه نفسه — مرّة كل دقيقتين تكفي
const DEGRADED_WARN_EVERY_MS = 2 * 60 * 1000;
let _lastDegradedWarnAt = 0;
let _lastWatchRestartAt = 0;
let _trackingUserId = null;
// 'native' = خدمة خلفية، 'web' = watchPosition داخل WebView.
// ⚠️ بدونه كان الإيقاف يخطئ الطريق: حين تغيب الإضافة نسقط إلى watchPosition
//    لكن الإيقاف يدخل فرع «الأصلي» (لأن المنصّة أصلية) فلا يُلغى المراقب
//    إطلاقاً — يبقى يقرأ الموقع ويُرسله بعد أن أعلن الكابتن أنه غير متصل.
let _watchMode = null;

// الحصول على الـ Capacitor plugins مباشرة من النافذة
function getBackgroundGeolocation() {
    if (window.Capacitor && window.Capacitor.Plugins) {
        return window.Capacitor.Plugins.BackgroundGeolocation;
    }
    return null;
}

/**
 * 🌐 ناقل HTTP أصليّ (CapacitorHttp).
 *
 * ⚠️ ضروريٌّ لا تحسين: بعد خمس دقائق في الخلفية **يخنق أندرويد طلبات HTTP
 *    الصادرة من WebView**. أي أن إضافة التتبّع الخلفي وحدها لا تكفي — تصل
 *    القراءة إلى الكود ثم يموت الطلب في الطريق، فيبقى العطل كما هو بينما
 *    يبدو أن كل شيء مضبوط. الناقل الأصليّ خارج هذا الخنق.
 *    https://github.com/capacitor-community/background-geolocation/issues/14
 */
function getNativeHttp() {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
        && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
        return window.Capacitor.Plugins.CapacitorHttp;
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
        _trackingUserId = userId;
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform();

        try {
            // 🔋 لا تُبقِ الشاشة مضاءة حين تعمل الخدمة الخلفية.
            //    كانت الشاشة تُجبَر على البقاء مضاءة طوال الوردية لأن التتبّع
            //    كان يموت بدونها — وهو استنزافٌ هائل للبطارية. مع الخدمة
            //    الخلفية لم يعد لذلك معنى؛ يبقى فقط في مسار الاحتياط
            //    (_startWebTracking) حيث التتبّع فعلاً لا يعمل إلا والشاشة حيّة.
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
                            CaptainService.lastFix = {
                                lat: location.latitude, lng: location.longitude,
                                at: location.time || Date.now()
                            };
                            CaptainService.sendLocationToServer(userId, location.latitude, location.longitude);
                        }
                    );
                    
                    _watchMode = 'native';

                    // طلب إذن تخطي توفير طاقة البطارية للحفاظ على اتصال Socket في الخلفية
                    if (window.AndroidDownloader && typeof window.AndroidDownloader.requestBatteryBypass === 'function') {
                        setTimeout(() => {
                            window.AndroidDownloader.requestBatteryBypass();
                        }, 1000); // تأخير قليل لتجنب تداخل النوافذ المنبثقة
                    }
                } else {
                    console.warn('⚠️ BackgroundGeolocation plugin not available, using web fallback');
                    await CaptainService._startFallbackTracking(userId, true);
                }
            } else {
                CaptainService._startWebTracking(userId);
            }

            

            // 💓 Heartbeat: يُرسل الموقع الأخير كل 10 ثوانٍ عند عدم الحركة
            CaptainService.startHeartbeat(userId);

        } catch (e) {
            console.error("❌ Tracking Failed:", e);
            await CaptainService._startFallbackTracking(userId, isNative);
        }
    },

    /**
     * مسار الاحتياط: watchPosition داخل WebView.
     * هنا **وهنا وحده** نُبقي الشاشة مضاءة — بلا خدمةٍ خلفية يموت التتبّع
     * لحظة انطفائها، فإبقاؤها ثمنٌ مقابل تتبّعٍ يعمل. أمّا مع الخدمة الخلفية
     * فهو استنزافُ بطاريةٍ بلا مقابل.
     */
    _startFallbackTracking: async (userId, isNative) => {
        if (isNative) {
            try {
                const KeepAwake = getKeepAwake();
                if (KeepAwake) await KeepAwake.keepAwake();
            } catch (_) {}
        }
        CaptainService._startWebTracking(userId);
    },

    _startWebTracking: (userId) => {
        if (!navigator.geolocation) return;
        _trackingUserId = userId;
        _watchMode = 'web';
        watcherId = navigator.geolocation.watchPosition(
            (pos) => {
                // لحظة القياس من الجهاز نفسه إن توفّرت — أصدق من ساعة الاستلام
                const at = pos.timestamp || Date.now();
                CaptainService.lastFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, at };
                CaptainService.sendLocationToServer(userId, pos.coords.latitude, pos.coords.longitude);
            },
            (err) => {
                // خطأ الإذن يُقال للكابتن لا يُبتلع في الـ console وحده:
                // هو يظنّ التتبّع يعمل، والعميل يرى مؤشّراً جامداً.
                if (err && err.code === 1 && typeof window.showToast === 'function') {
                    window.showToast('إذن الموقع مرفوض — فعّله ليرى العميل تحرّكك', 'error');
                }
                console.error(err);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    },

    stopTracking: async () => {
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform();

        if (CaptainService.heartbeatInterval) {
            clearInterval(CaptainService.heartbeatInterval);
            CaptainService.heartbeatInterval = null;
        }

        try {
            if (_watchMode === 'native' && watcherId) {
                const BackgroundGeolocation = getBackgroundGeolocation();
                if (BackgroundGeolocation) await BackgroundGeolocation.removeWatcher({ id: watcherId });
            } else if (watcherId != null && navigator.geolocation) {
                navigator.geolocation.clearWatch(watcherId);
            }

            // إطلاق الشاشة دائماً: طُلب إبقاؤها في مسار الاحتياط، وتركُها
            // مضاءة بعد انتهاء الوردية أسوأ ما يمكن للبطارية.
            if (isNative) {
                const KeepAwake = getKeepAwake();
                if (KeepAwake) await KeepAwake.allowSleep();
            }

            watcherId = null;
            _watchMode = null;
            
        } catch (e) {
            console.error("Stop Error:", e);
        }
    },

    // 💓 Heartbeat Logic
    lastLocationTime: 0,
    lastLocation: null,
    // 🛰️ آخر قراءةٍ فعلية مع لحظة قياسها — لا مجرّد إحداثيات بلا عمر
    lastFix: null,
    heartbeatInterval: null,

    /**
     * إعادة تشغيل مراقب الموقع.
     * مراقب `watchPosition` يموت صامتاً أحياناً (تعليق WebView، انقطاع مزوّد
     * الموقع)، والإذن سليم. فإعادة التشغيل تُصلح أكثر الحالات بلا تدخّل.
     */
    _restartWatch: () => {
        const now = Date.now();
        if (now - _lastWatchRestartAt < 60000) return;   // لا حلقة إعادةٍ محمومة
        _lastWatchRestartAt = now;
        if (!_trackingUserId) return;
        try {
            if (watcherId != null && navigator.geolocation) navigator.geolocation.clearWatch(watcherId);
        } catch (_) {}
        watcherId = null;
        CaptainService._startWebTracking(_trackingUserId);
    },

    startHeartbeat: (userId) => {
        if (CaptainService.heartbeatInterval) clearInterval(CaptainService.heartbeatInterval);

        CaptainService.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            if (now - CaptainService.lastLocationTime <= 8000) return;   // وصلت قراءةٌ لتوّها
            if (!CaptainService.lastFix) return;

            const age = now - CaptainService.lastFix.at;

            // ⛔ قراءةٌ ميتة لا تُعاد. كان النبض يبعث آخر إحداثيات كل ٨ ثوانٍ
            //    مهما قدُمت، فيبقى ختم الخادم طازجاً بموقعٍ عمره دقائق:
            //    العميل يرى مؤشّراً يبدو حيّاً وهو جامد، والخادم لا يرى عطلاً
            //    فلا ينبّه أحداً. الآن نتوقّف ونقول للكابتن إن التتبّع تعثّر.
            if (age > MAX_FIX_AGE_MS) {
                CaptainService._onTrackingDegraded(age);
                return;
            }

            // الـ heartbeat يُجبر HTTP في الخلفية لضمان التحديث
            CaptainService.sendLocationToServer(userId, CaptainService.lastFix.lat, CaptainService.lastFix.lng, true);
        }, 8000);
    },

    /**
     * التتبّع تعثّر: لا قراءة جديدة منذ مدّة.
     * يُقال للكابتن **في التطبيق وفوراً** لا بإشعارٍ من الخادم بعد دقائق —
     * وهو غالباً لا يعرف أن شيئاً توقّف أصلاً.
     */
    _onTrackingDegraded: (ageMs) => {
        const now = Date.now();
        if (now - _lastDegradedWarnAt < DEGRADED_WARN_EVERY_MS) return;
        _lastDegradedWarnAt = now;

        const mins = Math.max(1, Math.round(ageMs / 60000));
        try {
            if (typeof window.showToast === 'function') {
                window.showToast(`تعذّر تحديث موقعك منذ ${mins} دقيقة — العميل لا يرى تحرّكك`, 'warning');
            }
        } catch (_) {}

        // إعادة تشغيل المراقبة: الإذن قد يكون سليماً والمراقب هو من مات
        try { CaptainService._restartWatch(); } catch (_) {}
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
    /** عمر آخر قراءةٍ فعلية بالمللي ثانية (0 إن كانت لحظية أو مجهولة) */
    _fixAge: () => {
        const f = CaptainService.lastFix;
        return f ? Math.max(0, Date.now() - f.at) : 0;
    },

    sendLocationToServer: (userId, lat, lng, forceHttp = false) => {
        CaptainService.lastLocation = { lat, lng };
        CaptainService.lastLocationTime = Date.now();
        if (!CaptainService.lastFix) CaptainService.lastFix = { lat, lng, at: Date.now() };

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
            if (!token) return;

            const url = `${apiBase}/api/captain/update-location`;
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
            // ⏱️ عمر القراءة: الخادم يميّز به بين «وصلنا الموقع الآن»
            //    و«الكابتن هنا الآن» — وهما ليسا الشيء نفسه.
            const payload = { lat, lng, fixAge: CaptainService._fixAge() };

            const nativeHttp = getNativeHttp();
            if (nativeHttp) {
                // الناقل الأصليّ: لا يخنقه أندرويد بعد خمس دقائق في الخلفية
                nativeHttp.request({ url, method: 'PUT', headers, data: payload })
                    .catch(() => { /* صامت — الخلفية لا مكان فيها للضجيج */ });
            } else {
                fetch(url, {
                    method: 'PUT',
                    keepalive: true,   // ✅ يضمن إتمام الطلب حتى لو أُغلق التطبيق
                    headers,
                    body: JSON.stringify(payload)
                }).catch(() => {});
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

