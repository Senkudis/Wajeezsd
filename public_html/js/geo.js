/**
 * WajeezGeo — مصدر واحد لتحديد الموقع، بدقّة صريحة.
 *
 * ⚠️ لماذا وُجد هذا الملف:
 *   1) `getCurrentPosition` تعيد **أول** fix يتوفّر. على أندرويد يكون غالباً من الشبكة/الواي-فاي
 *      بدقّة 500–2000م، حتى مع enableHighAccuracy:true — لأن شريحة الـ GPS تحتاج ثوانٍ لتتقارب.
 *      لذلك «حدّد موقعي» كانت تضع الدبوس بعيداً عن المستخدم. الحلّ: watchPosition ونحتفظ
 *      بـ **أفضل** قراءة حتى تنزل الدقّة تحت العتبة أو تنتهي المهلة.
 *   2) كان `window.userLocation` كاشاً واحداً مشتركاً: تكتب فيه دالةُ ترتيب المتاجر موقعاً
 *      خشناً عمداً (enableHighAccuracy:false, maximumAge:120000)، ثم تقرأه خريطةُ الطلب
 *      لتثبيت الدبوس. أي: دبوس الطلب كان يُبنى من موقع خشن ومتقادم. الحلّ: كاشان منفصلان،
 *      والخشن لا يدهس الدقيق أبداً.
 *
 * الاستخدام:
 *   const fix = await WajeezGeo.getPrecise();              // {lat,lng,accuracy} — للدبوس/الملاحة
 *   const fix = await WajeezGeo.getPrecise({ onProgress }); // لعرض الدقّة أثناء التقارب
 *   const loc = await WajeezGeo.getCoarse();               // {lat,lng} — لترتيب المتاجر بالمسافة
 */
(function () {
    'use strict';

    var GOOD_ENOUGH_M = 30;      // دقّة نعتبرها ممتازة → نتوقّف فوراً
    var ACCEPTABLE_M  = 100;     // دون ذلك مقبول للدبوس
    var MAX_WAIT_MS   = 12000;   // أقصى انتظار لتقارب الـ GPS

    // كاشان منفصلان — الخشن لا يدهس الدقيق أبداً
    var preciseFix = null;   // { lat, lng, accuracy, ts }
    var coarseFix  = null;   // { lat, lng, ts }

    function isFresh(fix, maxAgeMs) {
        return !!fix && (Date.now() - fix.ts) < maxAgeMs;
    }

    /**
     * أدقّ موقع ممكن خلال مهلة معقولة.
     * @param {{minAccuracy?:number, maxWait?:number, maxAge?:number, onProgress?:function}} opts
     * @returns {Promise<{lat:number,lng:number,accuracy:number}>}
     */
    function getPrecise(opts) {
        opts = opts || {};
        var minAccuracy = opts.minAccuracy || GOOD_ENOUGH_M;
        var maxWait     = opts.maxWait     || MAX_WAIT_MS;
        var maxAge      = opts.maxAge      != null ? opts.maxAge : 30000;

        // قراءة دقيقة حديثة؟ أعِدها فوراً بلا انتظار
        if (isFresh(preciseFix, maxAge) && preciseFix.accuracy <= minAccuracy) {
            return Promise.resolve({ lat: preciseFix.lat, lng: preciseFix.lng, accuracy: preciseFix.accuracy });
        }

        return new Promise(function (resolve, reject) {
            if (!navigator.geolocation) {
                reject(new Error('متصفحك لا يدعم تحديد الموقع'));
                return;
            }

            var best = null;
            var watchId = null;
            var timer = null;
            var settled = false;

            function cleanup() {
                if (watchId !== null) { try { navigator.geolocation.clearWatch(watchId); } catch (_) {} watchId = null; }
                if (timer) { clearTimeout(timer); timer = null; }
            }

            function finish() {
                if (settled) return;
                settled = true;
                cleanup();

                if (!best) {
                    // ما وصلنا أي قراءة — استعمل آخر قراءة دقيقة مهما كان عمرها قبل أن نفشل
                    if (preciseFix) {
                        resolve({ lat: preciseFix.lat, lng: preciseFix.lng, accuracy: preciseFix.accuracy });
                        return;
                    }
                    reject(new Error('تعذّر تحديد موقعك — تأكد من تفعيل الـ GPS'));
                    return;
                }

                preciseFix = { lat: best.lat, lng: best.lng, accuracy: best.accuracy, ts: Date.now() };
                resolve({ lat: best.lat, lng: best.lng, accuracy: best.accuracy });
            }

            watchId = navigator.geolocation.watchPosition(
                function (pos) {
                    var fix = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: pos.coords.accuracy != null ? pos.coords.accuracy : 9999
                    };
                    // احتفظ بالأدقّ فقط — القراءات تتحسّن تدريجياً ولا تأتي مرتّبة دائماً
                    if (!best || fix.accuracy < best.accuracy) {
                        best = fix;
                        if (typeof opts.onProgress === 'function') {
                            try { opts.onProgress(fix); } catch (_) {}
                        }
                    }
                    if (best.accuracy <= minAccuracy) finish();   // دقّة كافية — لا داعي للانتظار
                },
                function (err) {
                    // خطأ صريح (إذن مرفوض / GPS مطفأ) — لا فائدة من انتظار المهلة
                    if (err && err.code === 1) { settled = true; cleanup(); reject(new Error('تم رفض إذن الموقع')); return; }
                    if (!best) { settled = true; cleanup(); reject(new Error('تعذّر تحديد موقعك — تأكد من تفعيل الـ GPS')); }
                },
                { enableHighAccuracy: true, timeout: maxWait, maximumAge: 0 }
            );

            timer = setTimeout(finish, maxWait);   // انتهت المهلة — سلّم أفضل ما وصلنا
        });
    }

    /**
     * موقع تقريبي رخيص وسريع — لترتيب المتاجر بالمسافة فقط.
     * ⚠️ لا تستعمله لدبوس الطلب أو للملاحة: قد يكون بعيداً بكيلومترات.
     */
    function getCoarse(opts) {
        opts = opts || {};
        var maxAge = opts.maxAge != null ? opts.maxAge : 180000;

        // موقع دقيق حديث؟ فهو بالتأكيد أفضل من الخشن
        if (isFresh(preciseFix, maxAge)) {
            return Promise.resolve({ lat: preciseFix.lat, lng: preciseFix.lng });
        }
        if (isFresh(coarseFix, maxAge)) {
            return Promise.resolve({ lat: coarseFix.lat, lng: coarseFix.lng });
        }

        return new Promise(function (resolve, reject) {
            if (!navigator.geolocation) {
                if (coarseFix) return resolve({ lat: coarseFix.lat, lng: coarseFix.lng });
                return reject(new Error('متصفحك لا يدعم تحديد الموقع'));
            }
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    coarseFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
                    resolve({ lat: coarseFix.lat, lng: coarseFix.lng });
                },
                function () {
                    if (coarseFix) return resolve({ lat: coarseFix.lat, lng: coarseFix.lng });
                    reject(new Error('يرجى تفعيل الـ GPS لنتمكن من عرض المحلات القريبة منك!'));
                },
                { enableHighAccuracy: false, timeout: 6000, maximumAge: 120000 }
            );
        });
    }

    /** آخر قراءة دقيقة معروفة (أو null) — بدون إطلاق قراءة جديدة. */
    function lastPrecise() {
        return preciseFix ? { lat: preciseFix.lat, lng: preciseFix.lng, accuracy: preciseFix.accuracy } : null;
    }

    /** نصّ عربي يصف جودة القراءة — يُعرض للمستخدم بدل رقم خام. */
    function describeAccuracy(m) {
        if (m == null) return '';
        if (m <= GOOD_ENOUGH_M) return 'دقة ممتازة (±' + Math.round(m) + ' م)';
        if (m <= ACCEPTABLE_M)  return 'دقة جيدة (±' + Math.round(m) + ' م)';
        return 'دقة ضعيفة (±' + Math.round(m) + ' م) — اخرج للعراء أو حرّك الدبوس يدوياً';
    }

    window.WajeezGeo = {
        getPrecise: getPrecise,
        getCoarse: getCoarse,
        lastPrecise: lastPrecise,
        describeAccuracy: describeAccuracy,
        GOOD_ENOUGH_M: GOOD_ENOUGH_M,
        ACCEPTABLE_M: ACCEPTABLE_M
    };
})();
