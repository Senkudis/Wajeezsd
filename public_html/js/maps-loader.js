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

    // ⚠️ مع loading=async يعرّف السكربت google.maps.importLibrary فقط عند onload،
    // ولا تتوفّر المُنشئات (Map / DirectionsService …) إلا بعد استيراد مكتبتها فعلاً.
    // لذلك لا نحلّ الوعد عند onload مباشرة، بل بعد ضمان جاهزية المكتبات المطلوبة.
    //
    // ملاحظة: أسماء importLibrary ليست نفس قيم معامل libraries في الرابط —
    // «routes» (خدمة الاتجاهات) غير مقبول في الرابط ويجب استيراده برمجياً،
    // لذلك يُطلب عبر opts.need وليس opts.libraries.
    var URL_LIBS = ['places', 'geometry', 'marker', 'drawing', 'visualization', 'journeySharing'];

    function ensureLibraries(names) {
        if (!(window.google && window.google.maps)) {
            return Promise.reject(new Error('Google Maps not loaded'));
        }
        // تحميل قديم متزامن (بلا importLibrary): كل شيء متاح أصلاً
        if (typeof google.maps.importLibrary !== 'function') return Promise.resolve(google.maps);

        var wanted = {};
        ['core', 'maps'].concat(names || []).forEach(function (n) {
            n = String(n || '').trim();
            if (n) wanted[n] = true;
        });

        return Promise.all(Object.keys(wanted).map(function (n) {
            return google.maps.importLibrary(n);
        })).then(function () { return google.maps; });
    }

    // كل المكتبات التي تحتاجها هذه الصفحة: من الرابط (libraries) + الإضافية (need).
    // بلا تكرار — صفحة تكتب 'geometry,marker' كانت تُنتج marker مرتين في الرابط.
    function neededLibs(opts) {
        var list = String(opts.libraries || '').split(',').map(function (x) { return x.trim(); });
        var seen = {}, out = [];
        list.concat(opts.need || []).concat(['marker']).forEach(function (n) {
            n = String(n || '').trim();
            if (n && !seen[n]) { seen[n] = true; out.push(n); }
        });
        return out;
    }

    // يحقن سكربت Google Maps الكلاسيكي بالمفتاح المركزي، مع الحفاظ على callback المُسمّى للصفحة
    function loadGoogleMaps(opts) {
        opts = opts || {};

        // محمّل بالفعل: يبقى علينا ضمان أن المكتبة المطلوبة استُوردت فعلاً
        // (صفحة حمّلت geometry فقط ثم احتاجت routes لاحقاً)
        if (window.google && window.google.maps) {
            return ensureLibraries(neededLibs(opts)).then(function (maps) {
                if (opts.callback && typeof window[opts.callback] === 'function') window[opts.callback]();
                return maps;
            });
        }

        return getMapsApiKey().then(function (key) {
            return new Promise(function (resolve, reject) {
                if (!key) { reject(new Error('Google Maps key unavailable')); return; }

                var params = new URLSearchParams();
                params.set('key', key);
                // معامل libraries لا يقبل إلا الأسماء المعروفة — نُسقِط ما عداها (routes مثلاً)
                var all = neededLibs(opts);
                var urlLibs = all.filter(function (n) { return URL_LIBS.indexOf(n) !== -1; });
                if (urlLibs.indexOf('marker') === -1) urlLibs.push('marker');
                params.set('libraries', urlLibs.join(','));

                // ⚠️ سباق: جوجل يستدعي callback المُسمّى بمجرد جاهزية مكتبات الرابط، بينما
                // مكتبات opts.need (مثل routes) تُستورد بوعدٍ مستقلٍّ متوازٍ. فكانت صفحة
                // التتبّع تنفّذ new DirectionsService() قبل اكتمال استيراد routes.
                // الحل: حين تُطلب مكتبة خارج الرابط، لا نُمرّر callback لجوجل بل نستدعيه
                // بأنفسنا بعد ضمان جاهزية كل المكتبات.
                var extraLibs = all.filter(function (n) { return URL_LIBS.indexOf(n) === -1; });
                var googleWillCall = !!opts.callback && extraLibs.length === 0;
                if (googleWillCall) params.set('callback', opts.callback);

                params.set('loading', 'async');
                if (opts.extra) {
                    Object.keys(opts.extra).forEach(function (k) { params.set(k, opts.extra[k]); });
                }

                var s = document.createElement('script');
                s.src = 'https://maps.googleapis.com/maps/api/js?' + params.toString();
                s.async = true;
                s.defer = true;
                s.onerror = function () { reject(new Error('Google Maps script failed to load')); };
                s.onload = function () {
                    ensureLibraries(all).then(function (maps) {
                        // استدعاء ذاتي فقط حين لم نُسنده لجوجل (طُلبت مكتبة خارج الرابط)
                        if (opts.callback && !googleWillCall && typeof window[opts.callback] === 'function') {
                            window[opts.callback]();
                        }
                        resolve(maps);
                    }, reject);
                };
                document.head.appendChild(s);
            });
        });
    }

    // إنشاء دبوس حديث (AdvancedMarkerElement) إذا كان متاحاً، مع الحفاظ على التوافق الخلفي
    function createModernMarker(opts) {
        opts = opts || {};
        if (window.google && window.google.maps && window.google.maps.marker && window.google.maps.marker.AdvancedMarkerElement) {
            try {
                if (opts.map && opts.map.getMapCapabilities && opts.map.getMapCapabilities().isAdvancedMarkersAvailable) {
                    var advOpts = {
                        map: opts.map,
                        position: opts.position,
                        title: opts.title || '',
                        gmpDraggable: !!opts.draggable,
                        zIndex: opts.zIndex || 1
                    };
                    // 🎨 دعم أيقونات WajeezMarkers ({url, scaledSize}) — الدبوس الحديث لا يفهم
                    // خاصية icon، فنحوّلها لعنصر <img> يُمرَّر كـ content ليحافظ على هوية الدبابيس
                    if (opts.icon && opts.icon.url) {
                        var img = document.createElement('img');
                        img.src = opts.icon.url;
                        if (opts.icon.scaledSize) {
                            img.style.width = opts.icon.scaledSize.width + 'px';
                            img.style.height = opts.icon.scaledSize.height + 'px';
                        }
                        advOpts.content = img;
                    }
                    var advMarker = new google.maps.marker.AdvancedMarkerElement(advOpts);
                    // 🔒 توافق خلفي: position قد يكون literal بلا دوال lat()/lng() —
                    // كل النداءات القائمة تستعمل getPosition().lat() فنعيد كائناً موحّداً دائماً
                    advMarker.getPosition = function() {
                        var p = this.position;
                        if (!p) return null;
                        var la = (typeof p.lat === 'function') ? p.lat() : p.lat;
                        var ln = (typeof p.lng === 'function') ? p.lng() : p.lng;
                        return { lat: function() { return la; }, lng: function() { return ln; } };
                    };
                    advMarker.setPosition = function(pos) { this.position = pos; };
                    advMarker.setIcon = function() {};
                    return advMarker;
                }
            } catch(e) {}
        }
        return new google.maps.Marker(opts);
    }

    // ════════════════════════════════════════════════════════════
    // 🔑 فشل مصادقة مفتاح الخرائط — كان صامتاً تماماً.
    //
    // العطل الذي يُغلقه هذا: حين يرفض Google المفتاح (أصل غير مسموح، فوترة
    // موقوفة، مفتاح مُبطَل) لا يرمي السكربت خطأً ولا يفشل تحميله — بل يرسم
    // خريطةً رماديةً صامتة ويكتب سطراً في وحدة تحكّم لا يراها أحد على الهاتف.
    // فيبدو العطل «الخريطة ما شغالة» بلا سبب، وهو أسوأ أشكال الفشل: يستهلك
    // ساعات تخمين بينما السبب سطرٌ واحد في إعدادات المفتاح.
    //
    // gm_authFailure هو الخطّاف الرسمي الذي يستدعيه Google في هذه الحالة
    // وحدها. نعرض الأصل الفعلي للصفحة لأنه بالضبط ما يجب لصقه في قيود
    // المفتاح — وهو يختلف بين المنصّات في تطبيقات Capacitor:
    //     المتصفّح : https://wajeezsd.com
    //     أندرويد  : https://wajeezsd.secure.local   (androidScheme: https)
    //     آيفون    : capacitor://wajeezsd.secure.local (iosScheme: capacitor)
    // فمفتاحٌ مقيَّد بأصلَي الأول والثاني يعمل فيهما ويفشل في الثالث وحده.
    // ════════════════════════════════════════════════════════════
    window.gm_authFailure = function () {
        var origin = (window.location && window.location.origin) || 'unknown';
        console.error('[maps-loader] Google رفض مفتاح الخرائط. أصل هذه الصفحة: ' + origin);

        var msg = 'تعذّر تحميل الخريطة — مفتاح الخرائط غير مصرَّح لهذا التطبيق.';
        var detail = 'الأصل: ' + origin;

        // نضع اللافتة داخل كل حاوية خريطة ظاهرة بدل نافذة واحدة: الصفحة قد
        // تحمل أكثر من خريطة، والمستخدم ينظر إلى المستطيل الرمادي لا إلى
        // أعلى الشاشة.
        var boxes = document.querySelectorAll('#map, #shopOrderMapActual, [data-map-container]');
        for (var i = 0; i < boxes.length; i++) {
            var el = boxes[i];
            if (el.getAttribute('data-map-auth-failed')) continue;
            el.setAttribute('data-map-auth-failed', '1');
            var b = document.createElement('div');
            b.setAttribute('dir', 'rtl');
            b.style.cssText = 'position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;' +
                'align-items:center;justify-content:center;gap:6px;padding:20px;text-align:center;' +
                'background:#f8fafc;color:#475569;font-family:inherit;';
            b.innerHTML = '<div style="font-size:28px;">🗺️</div>' +
                '<div style="font-weight:800;font-size:14px;">' + msg + '</div>' +
                '<div style="font-size:11px;color:#94a3b8;direction:ltr;">' + detail + '</div>';
            if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
            el.appendChild(b);
        }

        // لا نُظهر نافذة منبثقة للمستخدم العادي — الخريطة المعطّلة واضحة
        // بذاتها، والنافذة تُقاطع بلا أن تُصلح. التفصيل في وحدة التحكّم
        // وفي اللافتة، وكلاهما يكفي من يُصلح.
    };

    window.getMapsApiKey = getMapsApiKey;
    window.loadGoogleMaps = loadGoogleMaps;
    window.ensureMapsLibraries = ensureLibraries;
    window.createModernMarker = createModernMarker;
})();

