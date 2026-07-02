/**
 * Google Maps loader — مصدر واحد لمفتاح الخريطة.
 *
 * لماذا: كان المفتاح مكتوباً صراحةً في ~15 موضعاً داخل الواجهة. الآن يُجلب مرة واحدة
 * من /api/config (المصدر: متغيّر البيئة GOOGLE_MAPS_API_KEY) ويُخزَّن مؤقتاً.
 *
 * ملاحظة أمنية: مفتاح Maps للمتصفح ظاهر للمستخدم بطبيعته مهما فعلنا — الحماية الفعلية
 * هي تقييده في Google Cloud Console (HTTP referrers + APIs). هذا الملف يزيله من git فقط.
 *
 * الاستخدام:
 *   // للسكربت الكلاسيكي (يحل محل <script src="...maps...&callback=fn">):
 *   loadGoogleMaps({ libraries: 'places,geometry', callback: 'initAdminMap' });
 *
 *   // للحصول على المفتاح الخام (Capacitor GoogleMap.create):
 *   const key = await getMapsApiKey();
 */
(function () {
    'use strict';

    var cachedKey = null;
    var keyPromise = null;

    function apiBase() {
        return (window.API_URL) ||
               (window.API_CONFIG && window.API_CONFIG.baseURL) ||
               'https://wajeezsd.com';
    }

    // يجلب المفتاح مرة واحدة ويخزّنه (ذاكرة + sessionStorage لتفادي طلبات متكررة)
    function getMapsApiKey() {
        if (cachedKey) return Promise.resolve(cachedKey);

        var stored = null;
        try { stored = sessionStorage.getItem('gmapsKey'); } catch (_) {}
        if (stored) { cachedKey = stored; return Promise.resolve(stored); }

        if (keyPromise) return keyPromise;
        keyPromise = fetch(apiBase() + '/api/config')
            .then(function (r) { return r.json(); })
            .then(function (cfg) {
                cachedKey = (cfg && cfg.googleMapsApiKey) || '';
                try { sessionStorage.setItem('gmapsKey', cachedKey); } catch (_) {}
                return cachedKey;
            })
            .catch(function (err) {
                console.error('[maps-loader] failed to fetch Maps key:', err);
                keyPromise = null; // اسمح بإعادة المحاولة
                return '';
            });
        return keyPromise;
    }

    // يحقن سكربت Google Maps الكلاسيكي بالمفتاح المركزي، مع الحفاظ على callback المُسمّى للصفحة
    function loadGoogleMaps(opts) {
        opts = opts || {};

        // إذا كان محمّلاً بالفعل، نفّذ callback فوراً وارجع
        if (window.google && window.google.maps) {
            if (opts.callback && typeof window[opts.callback] === 'function') window[opts.callback]();
            return Promise.resolve(window.google.maps);
        }

        return getMapsApiKey().then(function (key) {
            return new Promise(function (resolve, reject) {
                if (!key) { reject(new Error('Google Maps key unavailable')); return; }

                var params = new URLSearchParams();
                params.set('key', key);
                if (opts.libraries) params.set('libraries', opts.libraries);
                if (opts.callback)  params.set('callback', opts.callback);
                params.set('loading', 'async');
                if (opts.extra) {
                    Object.keys(opts.extra).forEach(function (k) { params.set(k, opts.extra[k]); });
                }

                var s = document.createElement('script');
                s.src = 'https://maps.googleapis.com/maps/api/js?' + params.toString();
                s.async = true;
                s.defer = true;
                s.onerror = function () { reject(new Error('Google Maps script failed to load')); };
                // بدون callback مُسمّى: نحلّ الوعد عند التحميل
                if (!opts.callback) {
                    s.onload = function () { resolve(window.google && window.google.maps); };
                }
                document.head.appendChild(s);
            });
        });
    }

    window.getMapsApiKey = getMapsApiKey;
    window.loadGoogleMaps = loadGoogleMaps;
})();
