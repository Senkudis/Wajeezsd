/**
 * 📍 حقل «الصق رابط الموقع» — مكوّنٌ واحد يُركَّب في أي صفحة.
 *
 * المشكلة التي يحلّها: كثيرٌ من الناس لا يُحسنون وضع الدبوس على خريطة، لكن
 * كلّهم تقريباً يُحسنون الضغط على «مشاركة» في خرائط جوجل أو إرسال موقعهم
 * في واتساب. فالرابط أقصر طريقٍ بينهم وبين عنوانٍ صحيح — وأدقّه، لأنه
 * مأخوذٌ من مكانهم لا من تخمينهم.
 *
 * التركيب:
 *   MapsLinkInput.mount('#host', {
 *       onPick(lat, lng, meta) { ... },   // تُستدعى عند التأكيد
 *       label: 'موقع التسليم'             // اختياري
 *   });
 *
 * ⚠️ لا يحسب هذا الملف شيئاً بنفسه: التحليل من js/maps-link.js (نفس الملف
 *    الذي يستعمله الخادم)، وفكّ المختصر من /api/maps/resolve. فلا يفترق
 *    ما يقبله المتصفّح عمّا يقبله الخادم.
 */
(function () {
    'use strict';

    var seq = 0;

    function el(tag, attrs, html) {
        var n = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
        if (html != null) n.innerHTML = html;
        return n;
    }

    function apiBase() {
        return (typeof API_URL !== 'undefined' && API_URL) ||
               (typeof window.API_URL !== 'undefined' && window.API_URL) || '';
    }

    function authHeaders() {
        var h = { 'Content-Type': 'application/json' };
        var t = (window.Auth && window.Auth.getToken && window.Auth.getToken())
             || localStorage.getItem('token') || localStorage.getItem('adminToken');
        if (t) h.Authorization = 'Bearer ' + t;
        return h;
    }

    function injectStyles() {
        if (document.getElementById('mli-styles')) return;
        var s = el('style', { id: 'mli-styles' });
        s.textContent =
            '.mli{border:1.5px dashed #bfdbfe;background:#f8fbff;border-radius:14px;padding:12px;}' +
            '.mli-head{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;color:#1d4ed8;margin-bottom:4px;}' +
            '.mli-hint{font-size:11.5px;color:#64748b;line-height:1.7;margin-bottom:9px;}' +
            '.mli-row{display:flex;gap:7px;}' +
            '.mli-row input{flex:1;min-width:0;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px;' +
              'font-family:inherit;font-size:13px;background:#fff;}' +
            '.mli-row input:focus{outline:none;border-color:#60a5fa;box-shadow:0 0 0 3px #dbeafe;}' +
            '.mli-row button{border:0;border-radius:10px;padding:0 15px;font-weight:800;font-family:inherit;' +
              'background:#2563eb;color:#fff;cursor:pointer;white-space:nowrap;font-size:13px;}' +
            '.mli-row button:disabled{opacity:.6;cursor:default;}' +
            '.mli-msg{font-size:12.5px;font-weight:700;margin-top:8px;line-height:1.7;}' +
            '.mli-msg.err{color:#b91c1c;}' +
            '.mli-msg.warn{color:#b45309;}' +
            '.mli-msg.ok{color:#15803d;}' +
            '.mli-prev{margin-top:10px;display:none;}' +
            '.mli-prev.show{display:block;}' +
            '.mli-map{width:100%;height:170px;border-radius:12px;border:1px solid #e2e8f0;background:#eef2f7;}' +
            '.mli-addr{font-size:12.5px;color:#334155;margin-top:7px;font-weight:700;}' +
            '.mli-coords{font-size:11px;color:#94a3b8;margin-top:2px;}' +
            '.mli-confirm{width:100%;margin-top:9px;border:0;border-radius:11px;padding:11px;' +
              'background:linear-gradient(135deg,#16a34a,#047857);color:#fff;font-weight:800;' +
              'font-family:inherit;cursor:pointer;font-size:13.5px;}';
        document.head.appendChild(s);
    }

    function mount(host, opts) {
        opts = opts || {};
        var root = typeof host === 'string' ? document.querySelector(host) : host;
        if (!root) return null;

        injectStyles();
        var id = 'mli' + (++seq);

        root.innerHTML =
            '<div class="mli">' +
              '<div class="mli-head"><i class="bi bi-link-45deg"></i> ' +
                (opts.label || 'لصق رابط الموقع من خرائط جوجل') + '</div>' +
              '<div class="mli-hint">افتح الموقع في خرائط جوجل ← <b>مشاركة</b> ← <b>نسخ الرابط</b>، ثم الصقه هنا. ' +
                'يمكنك أيضاً لصق إحداثيات مباشرة مثل <span dir="ltr">15.60, 32.53</span></div>' +
              '<div class="mli-row">' +
                '<input id="' + id + '-in" type="url" dir="ltr" inputmode="url" ' +
                  'placeholder="https://maps.app.goo.gl/..." autocomplete="off">' +
                '<button id="' + id + '-go" type="button">تحقّق</button>' +
              '</div>' +
              '<div class="mli-msg" id="' + id + '-msg"></div>' +
              '<div class="mli-prev" id="' + id + '-prev">' +
                '<div class="mli-map" id="' + id + '-map"></div>' +
                '<div class="mli-addr" id="' + id + '-addr"></div>' +
                '<div class="mli-coords" id="' + id + '-coords" dir="ltr"></div>' +
                '<button class="mli-confirm" id="' + id + '-ok" type="button">' +
                  '<i class="bi bi-check-circle-fill"></i> تأكيد هذا الموقع</button>' +
              '</div>' +
            '</div>';

        var input = document.getElementById(id + '-in');
        var go    = document.getElementById(id + '-go');
        var msg   = document.getElementById(id + '-msg');
        var prev  = document.getElementById(id + '-prev');
        var okBtn = document.getElementById(id + '-ok');
        var picked = null, map = null, marker = null;

        function say(text, kind) {
            msg.className = 'mli-msg' + (kind ? ' ' + kind : '');
            msg.innerHTML = text || '';
        }

        function showPreview(lat, lng) {
            picked = { lat: lat, lng: lng };
            document.getElementById(id + '-coords').textContent = lat.toFixed(6) + ', ' + lng.toFixed(6);
            prev.classList.add('show');

            if (typeof google !== 'undefined' && google.maps) {
                var pos = { lat: lat, lng: lng };
                if (!map) {
                    map = new google.maps.Map(document.getElementById(id + '-map'), {
                        center: pos, zoom: 16, disableDefaultUI: true, gestureHandling: 'cooperative'
                    });
                }
                map.setCenter(pos);
                if (marker) marker.setMap(null);
                marker = new google.maps.Marker({
                    position: pos, map: map,
                    icon: (window.WajeezMarkers && WajeezMarkers.dropoff) ? WajeezMarkers.dropoff() : undefined
                });
                reverseGeocode(lat, lng);
            } else {
                document.getElementById(id + '-map').style.display = 'none';
            }
        }

        function reverseGeocode(lat, lng) {
            var out = document.getElementById(id + '-addr');
            out.textContent = 'جارٍ قراءة العنوان…';
            try {
                new google.maps.Geocoder().geocode(
                    { location: { lat: lat, lng: lng }, language: 'ar', region: 'SD' },
                    function (r, status) {
                        out.textContent = (status === 'OK' && r && r[0])
                            ? (r[0].formatted_address || '').replace(/،?\s*السودان\s*$/, '').trim()
                            : 'موقع محدّد على الخريطة';
                    }
                );
            } catch (e) { out.textContent = 'موقع محدّد على الخريطة'; }
        }

        async function check() {
            var raw = (input.value || '').trim();
            prev.classList.remove('show');
            picked = null;
            if (!raw) { say('الصق الرابط أولاً', 'warn'); return; }

            // ١) تحليل فوريّ — أغلب الروابط تحمل إحداثياتها
            var found = window.MapsLink && MapsLink.parse(raw);
            if (found) { say('تم استخراج الموقع من الرابط', 'ok'); showPreview(found.lat, found.lng); return; }

            // ٢) رابط مختصر ⇒ الخادم وحده يفكّه
            if (!(window.MapsLink && MapsLink.isShortLink(raw))) {
                say(MapsLink && MapsLink.looksLikeMapsLink(raw)
                    ? 'لم نجد إحداثيات في هذا الرابط — جرّب زرّ «مشاركة» في خرائط جوجل'
                    : 'هذا لا يبدو رابط خرائط جوجل', 'err');
                return;
            }

            go.disabled = true; go.textContent = '...';
            say('جارٍ فكّ الرابط المختصر…');
            try {
                var res = await fetch(apiBase() + '/api/maps/resolve', {
                    method: 'POST', headers: authHeaders(), body: JSON.stringify({ url: raw })
                });
                var data = await res.json().catch(function () { return {}; });
                if (!res.ok) { say(data.message || 'تعذّر قراءة الرابط', 'err'); return; }
                say('تم استخراج الموقع من الرابط', 'ok');
                showPreview(data.lat, data.lng);
            } catch (e) {
                say('تعذّر الاتصال — تحقّق من الإنترنت', 'err');
            } finally {
                go.disabled = false; go.textContent = 'تحقّق';
            }
        }

        go.addEventListener('click', check);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); check(); } });
        // اللصق يفحص من تلقائه — خطوةٌ أقلّ على من لا يعرف
        input.addEventListener('paste', function () { setTimeout(check, 60); });

        okBtn.addEventListener('click', function () {
            if (!picked) return;
            var addr = (document.getElementById(id + '-addr').textContent || '').trim();
            if (typeof opts.onPick === 'function') opts.onPick(picked.lat, picked.lng, { address: addr });
            say('تم اعتماد الموقع', 'ok');
        });

        return {
            reset: function () { input.value = ''; say(''); prev.classList.remove('show'); picked = null; },
            get value() { return picked; }
        };
    }

    window.MapsLinkInput = { mount: mount };
})();
