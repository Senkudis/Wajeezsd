/**
 * Captain Service - Background Location Tracking
 * Uses Capacitor native plugins when available, falls back to web API
 *
 * ── لماذا كان التتبّع يتوقّف والتطبيق مفتوح (أكتوبر 2026) ──────────────
 *  ١) كان هذا الملف يُحمَّل في لوحة الكابتن وحدها. صفحات التطبيق مستقلّة،
 *     فحين ينتقل الكابتن للطلبات أو المهام (أثناء التوصيل بالذات!) يموت
 *     كود الإرسال مع الصفحة، وتبقى الخدمة الأصلية تقرأ الموقع بلا مُستمع.
 *     الآن: يُحمَّل في كل صفحات الكابتن، ويستأنف التتبّع وحده إن كانت
 *     الوردية قائمة، ويزيل مراقب الصفحة السابقة الأصليّ قبل أن يضيف غيره.
 *  ٢) distanceFilter: 10 في الإضافة = setSmallestDisplacement — الكابتن
 *     الواقف لا تصله قراءةٌ واحدة، فيتوقّف النبض بعد ٤٥ ثانية وتقول
 *     الإدارة «التتبّع متوقّف منذ ٣٢ د». الآن 0، والإرسال نفسه مُقنَّن.
 *  ٣) stale: true يسلّم «آخر موقع معروف» فوراً — قد يكون من أمس في أم درمان
 *     والكابتن الآن في الخرطوم. وقراءات الأبراج (دقّة كيلومترات) تضعه في
 *     حيٍّ آخر. الآن تُرفض القراءة الأقدم من دقيقتين أو الأسوأ من ١٫٥ كم.
 *  ٤) أخطاء الإذن والـ GPS المقفول كانت تُبتلع في console. الآن نافذةٌ تقول
 *     للكابتن ما المشكلة وتفتح له مكانها في الإعدادات.
 */

// نستخدم Auth Helper من النافذة العامة
const Auth = window.Auth;
let watcherId = null;

// ⏱️ أقصى عمرٍ لقراءةٍ نُعيد إرسالها في النبض. فوقه لا نرسل شيئاً: إرسال
//    قراءةٍ قديمة بختمٍ جديد يُخفي العطل عن الخادم وعن العميل معاً.
const MAX_FIX_AGE_MS = 45 * 1000;
// قراءةٌ أقدم من هذا عند وصولها ليست «الكابتن هنا الآن» — هي آخر موقعٍ
// معروف (stale) قد يكون من مدينةٍ أخرى. لا تُرسل.
const STALE_FIX_MS = 2 * 60 * 1000;
// دقّة أسوأ من هذا = تقدير برج اتصالات لا GPS — يضع الكابتن في حيٍّ آخر
const MAX_ACCURACY_M = 1500;
// دقّة متوسّطة تُقبل فقط إن لم تكن عندنا قراءةٌ جيدة حديثة
const GOOD_ACCURACY_M = 150;
// لا نُغرق الكابتن بالتنبيه نفسه — مرّة كل دقيقتين تكفي
const DEGRADED_WARN_EVERY_MS = 2 * 60 * 1000;
// بلا قراءةٍ صالحة هذه المدّة ⇒ نفحص السبب ونعرضه
const DIAGNOSE_AFTER_MS = 90 * 1000;
let _lastDegradedWarnAt = 0;
let _lastWatchRestartAt = 0;
let _lastFreshFixAt = 0;
let _trackingUserId = null;
let _trackingStartedAt = 0;
let _lastGoodAccuracyAt = 0;
// 'native' = خدمة خلفية، 'web' = watchPosition داخل WebView.
// ⚠️ بدونه كان الإيقاف يخطئ الطريق: حين تغيب الإضافة نسقط إلى watchPosition
//    لكن الإيقاف يدخل فرع «الأصلي» (لأن المنصّة أصلية) فلا يُلغى المراقب
//    إطلاقاً — يبقى يقرأ الموقع ويُرسله بعد أن أعلن الكابتن أنه غير متصل.
let _watchMode = null;

// الوردية تعيش بين الصفحات: لوحة الكابتن تكتبها، وكل صفحةٍ تقرؤها فتستأنف
const ON_SHIFT_KEY = 'captain_on_shift';
// معرّف المراقب الأصليّ يعيش في الخدمة لا في الصفحة — نحفظه لنزيله حين
// تستأنف صفحةٌ جديدة، وإلا تراكمت مراقباتٌ بلا مستمع مع كل تنقّل
const WATCHER_KEY = 'bg_watcher_id';

const _ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
    del: (k) => { try { localStorage.removeItem(k); } catch (_) {} }
};

// الحصول على الـ Capacitor plugins مباشرة من النافذة
function getBackgroundGeolocation() {
    if (window.Capacitor && window.Capacitor.Plugins) {
        return window.Capacitor.Plugins.BackgroundGeolocation;
    }
    return null;
}

function getCapGeolocation() {
    if (window.Capacitor && window.Capacitor.Plugins) {
        return window.Capacitor.Plugins.Geolocation;
    }
    return null;
}

// جسر التطبيق الأصليّ (MainActivity.WebAppDownloader). الدوالّ الجديدة
// (فتح إعدادات الموقع، فحص البطارية) تصل مع النسخة التالية من التطبيق —
// فكلّ استدعاءٍ يُفحص وجوده أولاً ويسقط لبديلٍ إن غاب.
function bridge(fn) {
    const b = window.AndroidDownloader;
    return b && typeof b[fn] === 'function' ? b : null;
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

/** المسافة بالأمتار (تقريب مسطّح — يكفي لمسافاتٍ قصيرة داخل مدينة) */
function _meters(a, b) {
    if (!a || !b) return Infinity;
    const R = 6371000, toRad = (d) => d * Math.PI / 180;
    const x = toRad(b.lng - a.lng) * Math.cos(toRad((a.lat + b.lat) / 2));
    const y = toRad(b.lat - a.lat);
    return Math.sqrt(x * x + y * y) * R;
}

// ── حالة التطبيق (foreground / background) ──
let _appInBackground = false;

// ── تقنين الإرسال: الإضافة تسلّم قراءةً كل ثانية الآن (distanceFilter: 0)
//    فنرسل حين يتحرّك الكابتن فعلاً أو يمضي وقتٌ كافٍ — لا كل ثانية.
let _lastHttpSend = 0;
let _lastSocketSend = 0;
let _lastSentPos = null;
const HTTP_THROTTLE_MS = 5000;          // المقدّمة: نسخةٌ احتياطية عبر HTTP
const BG_HTTP_EVERY_MS = 10000;         // الخلفية: كل ١٠ ث…
const BG_HTTP_MOVE_M = 30;              // …أو حين يتحرّك ٣٠ م
const SOCKET_EVERY_MS = 3000;           // المقدّمة: socket كل ٣ ث…
const SOCKET_MOVE_M = 15;               // …أو حين يتحرّك ١٥ م

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
                // عاد من الإعدادات: ربما فعّل الإذن أو الموقع — نعيد الفحص
                if (isActive && _trackingUserId) {
                    setTimeout(() => CaptainService.checkLocationHealth({ quiet: true }), 1500);
                }
            });
        }


    },

    /** هل التتبّع شغّالٌ في هذه الصفحة؟ (لوحة الكابتن تستدعي البدء بعد الاستئناف) */
    isTracking: () => _watchMode !== null,

    startTracking: async (userId) => {
        // استدعاءٌ ثانٍ في الصفحة نفسها (الاستئناف ثم اللوحة) لا يكرّر المراقب
        if (_watchMode !== null && _trackingUserId === userId) return;
        _trackingUserId = userId;
        _trackingStartedAt = Date.now();
        _ls.set(ON_SHIFT_KEY, '1');
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
                    await CaptainService._addNativeWatcher(userId);
                    _watchMode = 'native';

                    // طلب إذن تخطي توفير طاقة البطارية للحفاظ على اتصال Socket في الخلفية
                    // (يفتح نافذة النظام فقط إن لم يكن مستثنى — مرّةً في اليوم تكفي)
                    const today = new Date().toDateString();
                    if (bridge('requestBatteryBypass') && _ls.get('battery_bypass_asked') !== today) {
                        _ls.set('battery_bypass_asked', today);
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

            // فحصٌ أوّل بعد البدء: إذنٌ ناقص أو موقعٌ مقفول يُقال الآن لا بعد دقائق
            setTimeout(() => CaptainService.checkLocationHealth({ quiet: true }), 4000);

        } catch (e) {
            console.error("❌ Tracking Failed:", e);
            await CaptainService._startFallbackTracking(userId, isNative);
        }
    },

    /**
     * المراقب الأصليّ: يُزال مراقب الصفحة السابقة أولاً (معرّفه محفوظ)، ثم
     * يُضاف واحدٌ يرسل إلى هذه الصفحة.
     */
    _addNativeWatcher: async (userId) => {
        const BackgroundGeolocation = getBackgroundGeolocation();
        const prevId = _ls.get(WATCHER_KEY);
        if (prevId) {
            try { await BackgroundGeolocation.removeWatcher({ id: prevId }); } catch (_) {}
            _ls.del(WATCHER_KEY);
        }
        watcherId = await BackgroundGeolocation.addWatcher(
            {
                backgroundMessage: "جاري مشاركة موقعك مع العملاء لإستقبال الطلبات.",
                backgroundTitle: "أنت متصل الآن",
                requestPermissions: true,
                // آخر موقعٍ معروف يُسلَّم فوراً — لكن _acceptFix يرفضه إن قدُم
                stale: true,
                // 0 لا 10: setSmallestDisplacement(10) يحرم الواقف من أي قراءة
                distanceFilter: 0
            },
            (location, error) => {
                if (error) {
                    if (error.code === "NOT_AUTHORIZED") {
                        // الإضافة ترفض بالرمز نفسه للحالتين — الرسالة تفرّق
                        const off = /disabled/i.test(error.message || '');
                        CaptainService.showLocationProblem(off ? 'gps_off' : 'permission');
                    }
                    return console.error(error);
                }
                CaptainService._onFix(userId, location.latitude, location.longitude,
                    location.accuracy, location.time || Date.now());
            }
        );
        _ls.set(WATCHER_KEY, watcherId);
    },

    /**
     * قراءةٌ وصلت: تُقبل أو تُرفض قبل أن تصير «موقع الكابتن».
     * @returns {boolean} قُبلت؟
     */
    _acceptFix: (lat, lng, accuracy, at) => {
        const now = Date.now();
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        // آخر موقعٍ معروف من ساعات (stale) — ليس مكان الكابتن الآن
        if (at && now - at > STALE_FIX_MS) return false;
        const acc = Number(accuracy);
        if (Number.isFinite(acc)) {
            // تقدير برج اتصالات: قد يضعه في أم درمان وهو في الخرطوم
            if (acc > MAX_ACCURACY_M) return false;
            // متوسّطة الدقّة: مقبولة فقط إن لم تصلنا قراءةٌ جيدة منذ دقيقة
            if (acc > GOOD_ACCURACY_M && now - _lastGoodAccuracyAt < 60000) return false;
            if (acc <= GOOD_ACCURACY_M) _lastGoodAccuracyAt = now;
        }
        return true;
    },

    _onFix: (userId, lat, lng, accuracy, at) => {
        if (!CaptainService._acceptFix(lat, lng, accuracy, at)) return;
        CaptainService.lastFix = { lat, lng, at, accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null };
        CaptainService.sendLocationToServer(userId, lat, lng);
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
                if (!CaptainService._acceptFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, at)) return;
                CaptainService.lastFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, at, accuracy: pos.coords.accuracy };
                CaptainService.sendLocationToServer(userId, pos.coords.latitude, pos.coords.longitude);
            },
            (err) => {
                // خطأ الإذن يُقال للكابتن لا يُبتلع في الـ console وحده:
                // هو يظنّ التتبّع يعمل، والعميل يرى مؤشّراً جامداً.
                if (err && err.code === 1) {
                    if (typeof window.showToast === 'function') {
                        window.showToast('إذن الموقع مرفوض — فعّله ليرى العميل تحرّكك', 'error');
                    }
                    CaptainService.showLocationProblem('permission');
                }
                console.error(err);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    },

    stopTracking: async () => {
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform();
        _ls.del(ON_SHIFT_KEY);

        if (CaptainService.heartbeatInterval) {
            clearInterval(CaptainService.heartbeatInterval);
            CaptainService.heartbeatInterval = null;
        }

        try {
            if (_watchMode === 'native' && watcherId) {
                const BackgroundGeolocation = getBackgroundGeolocation();
                if (BackgroundGeolocation) await BackgroundGeolocation.removeWatcher({ id: watcherId });
                _ls.del(WATCHER_KEY);
            } else if (watcherId != null && navigator.geolocation) {
                navigator.geolocation.clearWatch(watcherId);
            }
            // مراقبٌ أصليّ من صفحةٍ سابقة (لم تبدأه هذه الصفحة) يُزال أيضاً
            const orphan = _ls.get(WATCHER_KEY);
            if (orphan && isNative) {
                const BackgroundGeolocation = getBackgroundGeolocation();
                try { if (BackgroundGeolocation) await BackgroundGeolocation.removeWatcher({ id: orphan }); } catch (_) {}
                _ls.del(WATCHER_KEY);
            }

            // إطلاق الشاشة دائماً: طُلب إبقاؤها في مسار الاحتياط، وتركُها
            // مضاءة بعد انتهاء الوردية أسوأ ما يمكن للبطارية.
            if (isNative) {
                const KeepAwake = getKeepAwake();
                if (KeepAwake) await KeepAwake.allowSleep();
            }

            watcherId = null;
            _watchMode = null;
            _trackingUserId = null;

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
     * المراقب يموت صامتاً أحياناً (تعليق WebView، انقطاع مزوّد الموقع)
     * والإذن سليم. فإعادة التشغيل تُصلح أكثر الحالات بلا تدخّل.
     * الأصليّ يُعاد أصلياً — كان يُستبدل بـ watchPosition فيضيع معرّفه ولا
     * يُزال عند انتهاء الوردية.
     */
    _restartWatch: () => {
        const now = Date.now();
        if (now - _lastWatchRestartAt < 60000) return;   // لا حلقة إعادةٍ محمومة
        _lastWatchRestartAt = now;
        if (!_trackingUserId) return;
        if (_watchMode === 'native' && getBackgroundGeolocation()) {
            CaptainService._addNativeWatcher(_trackingUserId).catch(console.error);
            return;
        }
        try {
            if (watcherId != null && navigator.geolocation) navigator.geolocation.clearWatch(watcherId);
        } catch (_) {}
        watcherId = null;
        CaptainService._startWebTracking(_trackingUserId);
    },

    /**
     * قراءةٌ لحظية واحدة حين يسكت المراقب — الكابتن الواقف، أو مراقبٌ تعثّر.
     * مرّةً كل ٣٠ ثانية على الأكثر.
     */
    _requestFreshFix: () => {
        const now = Date.now();
        if (now - _lastFreshFixAt < 30000 || !_trackingUserId) return;
        _lastFreshFixAt = now;
        const userId = _trackingUserId;
        const opts = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
        const onPos = (pos) => {
            if (!pos || !pos.coords) return;
            CaptainService._onFix(userId, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp || Date.now());
        };
        const Geo = getCapGeolocation();
        if (Geo && typeof Geo.getCurrentPosition === 'function') {
            Geo.getCurrentPosition(opts).then(onPos).catch(() => {});
        } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(onPos, () => {}, opts);
        }
    },

    startHeartbeat: (userId) => {
        if (CaptainService.heartbeatInterval) clearInterval(CaptainService.heartbeatInterval);

        CaptainService.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            if (now - CaptainService.lastLocationTime <= 8000) return;   // وصلت قراءةٌ لتوّها

            // لا قراءة صالحة أصلاً منذ البدء: نطلب واحدة، ونفحص السبب إن طال
            if (!CaptainService.lastFix) {
                CaptainService._requestFreshFix();
                if (now - _trackingStartedAt > DIAGNOSE_AFTER_MS) CaptainService.checkLocationHealth();
                return;
            }

            const age = now - CaptainService.lastFix.at;

            // ⛔ قراءةٌ ميتة لا تُعاد. كان النبض يبعث آخر إحداثيات كل ٨ ثوانٍ
            //    مهما قدُمت، فيبقى ختم الخادم طازجاً بموقعٍ عمره دقائق:
            //    العميل يرى مؤشّراً يبدو حيّاً وهو جامد، والخادم لا يرى عطلاً
            //    فلا ينبّه أحداً. الآن نتوقّف ونقول للكابتن إن التتبّع تعثّر.
            if (age > MAX_FIX_AGE_MS) {
                // أوّلاً قراءةٌ لحظية — أغلب الحالات كابتنٌ واقف لا عطل
                CaptainService._requestFreshFix();
                if (age > DIAGNOSE_AFTER_MS) CaptainService._onTrackingDegraded(age);
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
        // وإن لم يكن سليماً: نعرف السبب ونعرضه بمكان حلّه
        CaptainService.checkLocationHealth();
    },

    /**
     * 🩺 لماذا لا يتحدّث الموقع؟ يفحص بالترتيب: خدمة الموقع (GPS) مقفولة،
     * ثم إذن الموقع، ثم موفّر البطارية — ويعرض أول مشكلةٍ يجدها.
     * @param {{quiet?:boolean}} opts quiet: لا نافذة «لا يتحدّث» إن لم يُعرف سبب
     * @returns {Promise<string|null>} نوع المشكلة أو null
     */
    checkLocationHealth: async (opts = {}) => {
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
        if (!isNative || !_trackingUserId) return null;
        let problem = null;
        try {
            const b = bridge('isLocationEnabled');
            if (b && b.isLocationEnabled() === false) problem = 'gps_off';
        } catch (_) {}
        if (!problem) {
            try {
                const Geo = getCapGeolocation();
                if (Geo && typeof Geo.checkPermissions === 'function') {
                    const p = await Geo.checkPermissions();
                    if (p && p.location && p.location !== 'granted') problem = 'permission';
                }
            } catch (e) {
                // الإضافة ترمي حين تكون خدمة الموقع مقفولة
                if (/disabled|services/i.test((e && e.message) || '')) problem = 'gps_off';
            }
        }
        if (!problem) {
            try {
                const b = bridge('isIgnoringBatteryOptimizations');
                if (b && b.isIgnoringBatteryOptimizations() === false) problem = 'battery';
            } catch (_) {}
        }
        if (!problem && !opts.quiet) {
            const f = CaptainService.lastFix;
            if (!f || Date.now() - f.at > DIAGNOSE_AFTER_MS) problem = 'stale';
        }
        if (problem) CaptainService.showLocationProblem(problem);
        return problem;
    },

    /**
     * 🪟 نافذةٌ تشرح المشكلة وتفتح مكان حلّها في الإعدادات.
     * مستقلّة عن SweetAlert (غير محمَّلة في كل صفحات الكابتن)، ولا تتكرّر
     * للنوع نفسه أكثر من مرّة كل عشر دقائق.
     */
    showLocationProblem: (kind) => {
        const SPEC = CaptainService._problemSpec(kind);
        if (!SPEC) return;
        const key = 'locprob_' + kind;
        const last = Number(_ls.get(key)) || 0;
        if (Date.now() - last < 10 * 60 * 1000) return;
        if (document.getElementById('capLocProblem')) return;
        _ls.set(key, String(Date.now()));

        if (!document.getElementById('capLocProblemCss')) {
            const st = document.createElement('style');
            st.id = 'capLocProblemCss';
            st.textContent = `
#capLocProblem{position:fixed;inset:0;z-index:100000;background:rgba(2,20,14,.55);display:flex;align-items:flex-end;justify-content:center;
  padding:0 0 calc(var(--sab,0px) + 12px);font-family:inherit;direction:rtl;animation:clpIn .2s ease}
@keyframes clpIn{from{opacity:0}to{opacity:1}}
#capLocProblem .clp{background:#fff;color:#0f172a;width:min(440px,calc(100% - 24px));border-radius:22px;padding:20px 18px 16px;box-shadow:0 20px 50px rgba(0,0,0,.35)}
#capLocProblem .clp-ic{width:52px;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:10px;background:#fef3c7;color:#b45309}
#capLocProblem h3{font-size:18px;font-weight:900;margin:0 0 6px}
#capLocProblem p{font-size:14px;line-height:1.7;color:#334155;margin:0 0 10px}
#capLocProblem ol{margin:0 0 14px;padding-inline-start:20px;font-size:13.5px;line-height:1.9;color:#334155}
#capLocProblem button{width:100%;border:0;border-radius:14px;padding:13px;font-size:15px;font-weight:800;font-family:inherit;cursor:pointer}
#capLocProblem .clp-go{background:#04553A;color:#fff;margin-bottom:8px}
#capLocProblem .clp-alt{background:#ecfdf5;color:#04553A;margin-bottom:8px}
#capLocProblem .clp-later{background:transparent;color:#64748b;font-weight:700}
body.dark-mode #capLocProblem .clp{background:#0f172a;color:#e2e8f0}
body.dark-mode #capLocProblem p,body.dark-mode #capLocProblem ol{color:#cbd5e1}`;
            document.head.appendChild(st);
        }

        const box = document.createElement('div');
        box.id = 'capLocProblem';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.innerHTML = `<div class="clp">
            <div class="clp-ic"><i class="bi ${SPEC.icon}"></i></div>
            <h3>${SPEC.title}</h3>
            <p>${SPEC.text}</p>
            ${SPEC.steps ? `<ol>${SPEC.steps.map(s => `<li>${s}</li>`).join('')}</ol>` : ''}
            ${SPEC.go ? `<button type="button" class="clp-go">${SPEC.go.label}</button>` : ''}
            ${SPEC.alt ? `<button type="button" class="clp-alt">${SPEC.alt.label}</button>` : ''}
            <button type="button" class="clp-later">لاحقاً</button>
        </div>`;
        const close = () => box.remove();
        box.querySelector('.clp-later').onclick = close;
        if (SPEC.go) box.querySelector('.clp-go').onclick = () => { close(); SPEC.go.run(); };
        if (SPEC.alt) box.querySelector('.clp-alt').onclick = () => { close(); SPEC.alt.run(); };
        (document.body || document.documentElement).appendChild(box);
    },

    /** النصوص والأفعال لكل مشكلة — كل زرٍّ يفتح أقرب شاشةٍ لمكان الحلّ */
    _problemSpec: (kind) => {
        const BG = getBackgroundGeolocation();
        const appSettings = () => {
            const b = bridge('openAppSettings');
            if (b) return b.openAppSettings();
            if (BG && typeof BG.openSettings === 'function') return BG.openSettings();
        };
        const locationSettings = () => {
            const b = bridge('openLocationSettings');
            if (b) return b.openLocationSettings();
            return appSettings();
        };
        const batterySettings = () => {
            const b = bridge('requestBatteryBypass');
            if (b) return b.requestBatteryBypass();
            return appSettings();
        };
        const autoStart = bridge('openAutoStartSettings')
            ? { label: 'السماح بالتشغيل التلقائي', run: () => { if (!window.AndroidDownloader.openAutoStartSettings()) appSettings(); } }
            : null;

        switch (kind) {
            case 'gps_off': return {
                icon: 'bi-geo-alt-fill',
                title: 'الموقع (GPS) مقفول في جهازك',
                text: 'بدون الموقع لا يرى العميل ولا الإدارة مكانك، ولا تصلك الطلبات القريبة منك.',
                steps: bridge('openLocationSettings') ? null
                    : ['اسحب شريط الإشعارات من أعلى الشاشة', 'اضغط على «الموقع» حتى يصير مفعّلاً'],
                go: { label: bridge('openLocationSettings') ? 'تشغيل الموقع' : 'فتح إعدادات التطبيق', run: locationSettings }
            };
            case 'permission': return {
                icon: 'bi-shield-lock-fill',
                title: 'إذن الموقع غير مفعّل لوجيز',
                text: 'لازم تسمح لوجيز بالموقع عشان يشتغل تتبّعك وإنت متصل — وإشعار «أنت متصل الآن» يخلّيه يشتغل حتى والتطبيق في الخلفية.',
                steps: ['اضغط «فتح الإعدادات» تحت', 'اختر «الأذونات» ثم «الموقع»',
                    'اختر «السماح أثناء استخدام التطبيق» وفعّل «الموقع الدقيق»'],
                go: { label: 'فتح الإعدادات', run: appSettings }
            };
            case 'battery': return {
                icon: 'bi-battery-charging',
                title: 'توفير البطارية يوقف تتبّعك',
                text: 'جهازك يقفل وجيز في الخلفية لتوفير البطارية، فيتوقّف إرسال موقعك والعميل يحسبك واقف.',
                steps: ['اضغط «إيقاف توفير البطارية لوجيز»', 'اختر «السماح» أو «غير مقيّد»'],
                go: { label: 'إيقاف توفير البطارية لوجيز', run: batterySettings },
                alt: autoStart
            };
            case 'stale': return {
                icon: 'bi-broadcast',
                title: 'موقعك لا يتحدّث',
                text: 'ما وصلنا موقعك من فترة. غالباً السبب واحد من دول:',
                steps: ['الموقع (GPS) مقفول — شغّله من الشريط العلوي',
                    'إذن الموقع لوجيز مرفوض أو بدون «الموقع الدقيق»',
                    'توفير البطارية أو «التشغيل التلقائي» مقفول لوجيز'],
                go: { label: 'فتح إعدادات وجيز', run: appSettings },
                alt: bridge('openLocationSettings') ? { label: 'إعدادات الموقع', run: locationSettings } : autoStart
            };
            default: return null;
        }
    },

    /**
     * إرسال الموقع للسيرفر
     * ──────────────────────────────────────────────────────────
     * الاستراتيجية:
     *   • في المقدمة (foreground): Socket (كل ٣ ث أو ١٥ م) + HTTP كل 5 ثوانٍ احتياطاً
     *   • في الخلفية (background): HTTP فقط لأن الـ socket مجمّد من Android،
     *     كل ١٠ ث أو حين يتحرّك ٣٠ م
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
        const moved = _meters(_lastSentPos, { lat, lng });
        const shouldSendHttp = forceHttp
            || (_appInBackground ? (now - _lastHttpSend >= BG_HTTP_EVERY_MS || moved >= BG_HTTP_MOVE_M)
                                 : (now - _lastHttpSend >= HTTP_THROTTLE_MS));
        const accuracy = CaptainService.lastFix && Number.isFinite(CaptainService.lastFix.accuracy)
            ? Math.round(CaptainService.lastFix.accuracy) : undefined;

        // ── Socket (في المقدمة فقط) ──
        if (!_appInBackground && window.socket && window.socket.connected
            && (now - _lastSocketSend >= SOCKET_EVERY_MS || moved >= SOCKET_MOVE_M)) {
            _lastSocketSend = now;
            _lastSentPos = { lat, lng };
            // عمر القراءة مع الـ socket أيضاً — كان يصل بلا عمر فيُعدّ كل
            // إرسالٍ قياساً جديداً
            window.socket.emit('update_location', { userId, lat, lng, fixAge: CaptainService._fixAge(), accuracy });
        }

        // ── HTTP (دائماً في الخلفية، أو كنسخة احتياطية كل 5 ثوانٍ) ──
        if (shouldSendHttp) {
            _lastHttpSend = now;
            _lastSentPos = { lat, lng };
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
            const payload = { lat, lng, fixAge: CaptainService._fixAge(), accuracy };

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
                // موقعٌ قيس قبل الانقطاع ليس «الكابتن هنا الآن» — عمره يسافر معه
                body: JSON.stringify({ lat: last.lat, lng: last.lng, fixAge: Math.max(0, Date.now() - last.timestamp) })
            });

        } catch (e) {
            console.warn('Failed to flush GPS queue:', e);
        }
    },

    /**
     * ▶️ استئناف الوردية في أي صفحة كابتن: إن كانت الوردية قائمة (علامة
     * اللوحة) والجلسة جلسة كابتن، يبدأ التتبّع هنا — فلا يموت الإرسال حين
     * ينتقل الكابتن من اللوحة إلى الطلبات أو المهام.
     */
    resumeIfOnShift: () => {
        if (_ls.get(ON_SHIFT_KEY) !== '1') return false;
        if (!_ls.get('token')) { _ls.del(ON_SHIFT_KEY); return false; }
        let user = null;
        try { user = JSON.parse(_ls.get('user') || 'null'); } catch (_) {}
        if (!user || user.role !== 'captain') return false;
        // المعرّف نفسه الذي تستعمله لوحة الكابتن — فاستدعاؤها بعد الاستئناف لا يكرّر البدء
        const uid = _ls.get('userId') || user._id || user.id;
        if (!uid) return false;
        CaptainService.startTracking(uid).catch(console.error);
        return true;
    }
};

window.CaptainService = CaptainService;

// ✅ تلقائياً نُهيئ الخدمة فور تحميل الملف لتسجيل الـ App State Listeners
CaptainService.init().catch(console.error);
// ثم نستأنف الوردية إن كانت قائمة — في أي صفحة كابتن
try { CaptainService.resumeIfOnShift(); } catch (e) { console.error(e); }

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CaptainService;
}
