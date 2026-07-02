/**
 * map-markers.js — مكتبة الدبابيس الموحدة لجميع خرائط التطبيق
 * ════════════════════════════════════════════════════════════════
 * نمط التصميم: دبوس قطرة (teardrop pin) احترافي بظل وأيقونة داخلية
 * اللون الرئيسي: #04553A (أخضر وجيز)  |  ثانوي: #e63946 (أحمر)
 *
 * الاستخدام:
 *   WajeezMarkers.captain(status)         → أيقونة كابتن (دراجة)
 *   WajeezMarkers.pickup()                → نقطة استلام (A)
 *   WajeezMarkers.dropoff()               → نقطة تسليم (B)
 *   WajeezMarkers.store(label?)           → موقع متجر (🏪)
 *   WajeezMarkers.place()                 → موقع منشأة قابل للسحب
 *   WajeezMarkers.userDot()               → نقطة موقع المستخدم الحالية
 *   WajeezMarkers.zoneDot(index)          → نقطة رسم منطقة
 *
 *   كل دالة تعيد { url, scaledSize, anchor } متوافق مع google.maps.Marker + icon
 */

(function () {
    'use strict';

    /* ─── مساعدات ───────────────────────────────────────────── */
    function svgUrl(svg) {
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }
    function sz(w, h) { return new google.maps.Size(w, h); }
    function pt(x, y) { return new google.maps.Point(x, y); }

    /**
     * دبوس القطرة الأساسي
     * @param {string} fill   - لون الخلفية
     * @param {string} inner  - HTML داخل الدائرة البيضاء (نص / أيقونة unicode)
     * @param {object} opts   - { w:48, h:58, fontSize:16, shadow:true }
     */
    function teardropPin(fill, inner, opts) {
        opts = Object.assign({ w: 48, h: 58, fontSize: 16, shadow: true }, opts || {});
        var w = opts.w, h = opts.h, r = w / 2;
        var cx = r, topR = r - 2;
        var shadowEl = opts.shadow
            ? '<ellipse cx="' + cx + '" cy="' + (h - 2) + '" rx="' + (r * 0.55) + '" ry="3.5" fill="rgba(0,0,0,0.22)"/>'
            : '';
        /* رأس الدبوس = دائرة + مثلث سفلي متصل */
        var tipY = h - 5;
        var pinPath = 'M' + cx + ',' + (h - 5) +
            'C' + (cx) + ',' + (h - 5) + ' ' + (cx - topR + 2) + ',' + (topR * 1.65) + ' ' + (cx - topR) + ',' + topR +
            'a' + topR + ',' + topR + ' 0 1,1 ' + (topR * 2) + ',0' +
            'C' + (cx + topR - 2) + ',' + (topR * 1.65) + ' ' + cx + ',' + (h - 5) + ' ' + cx + ',' + (h - 5) + 'Z';

        /* دائرة داخلية بيضاء */
        var innerR = topR * 0.62;
        var innerEl = '<circle cx="' + cx + '" cy="' + topR + '" r="' + innerR + '" fill="white" opacity="0.95"/>' +
            '<text x="' + cx + '" y="' + (topR + opts.fontSize * 0.38) + '" text-anchor="middle"' +
            ' font-family="Cairo,Arial,sans-serif" font-size="' + opts.fontSize + '" font-weight="800" fill="' + fill + '">' +
            inner + '</text>';

        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
            '<defs><filter id="ps" x="-40%" y="-40%" width="180%" height="180%">' +
            '<feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.28"/></filter></defs>' +
            shadowEl +
            '<path d="' + pinPath + '" fill="' + fill + '" filter="url(#ps)"/>' +
            innerEl +
            '</svg>';
        return { url: svgUrl(svg), scaledSize: sz(w, h), anchor: pt(cx, h - 3) };
    }

    /**
     * دبوس الكابتن (دراجة نارية داخل pin)
     * @param {'available'|'busy'|'offline'} status
     * @param {boolean} highlighted - نجمة وتضخيم
     */
    function captainPin(status, highlighted) {
        var colors = { available: '#16a34a', busy: '#d97706', offline: '#6b7280' };
        var fill = highlighted ? '#f59e0b' : (colors[status] || colors.available);
        var w = highlighted ? 42 : 34, h = highlighted ? 52 : 44;
        var r = w / 2, topR = r - 2;
        var shadowEl = '<ellipse cx="' + r + '" cy="' + (h - 2) + '" rx="' + (r * 0.55) + '" ry="3.5" fill="rgba(0,0,0,0.22)"/>';
        var pinPath = 'M' + r + ',' + (h - 5) +
            'C' + r + ',' + (h - 5) + ' ' + (r - topR + 2) + ',' + (topR * 1.65) + ' ' + (r - topR) + ',' + topR +
            'a' + topR + ',' + topR + ' 0 1,1 ' + (topR * 2) + ',0' +
            'C' + (r + topR - 2) + ',' + (topR * 1.65) + ' ' + r + ',' + (h - 5) + ' ' + r + ',' + (h - 5) + 'Z';

        /* دائرة بيضاء داخلية */
        var iR = topR * 0.66;
        var starBadge = highlighted
            ? '<circle cx="' + (r + topR - 2) + '" cy="6" r="7" fill="#92400e" stroke="white" stroke-width="1.5"/>' +
              '<text x="' + (r + topR - 2) + '" y="10" text-anchor="middle" font-size="9" fill="white">★</text>'
            : '';

        /* أيقونة الدراجة (مبسّطة ونظيفة) */
        var bx = r - iR + 2, by = topR - iR + 2;
        var bs = iR * 2 - 4; /* مقياس الرسم */
        var sc = bs / 24;
        var bike = '<g transform="translate(' + bx + ',' + by + ') scale(' + sc + ')">' +
            '<circle cx="5" cy="17" r="3.8" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>' +
            '<circle cx="19" cy="17" r="3.8" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>' +
            '<path d="M5 17 L9 9 L15 9 L19 17" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M9 9 L12 5 L18 5" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"/>' +
            '<circle cx="15" cy="10.5" r="1.8" fill="white"/>' +
            '</g>';

        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
            '<defs><filter id="ps" x="-40%" y="-40%" width="180%" height="180%">' +
            '<feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.28"/></filter></defs>' +
            shadowEl +
            '<path d="' + pinPath + '" fill="' + fill + '" filter="url(#ps)"/>' +
            '<circle cx="' + r + '" cy="' + topR + '" r="' + iR + '" fill="white" opacity="0.92"/>' +
            bike +
            starBadge +
            '</svg>';
        return { url: svgUrl(svg), scaledSize: sz(w, h), anchor: pt(r, h - 3) };
    }

    /* نقطة موقع المستخدم (دائرة نابضة صغيرة) */
    function userDotIcon() {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">' +
            '<circle cx="14" cy="14" r="11" fill="white" opacity="0.9"/>' +
            '<circle cx="14" cy="14" r="7.5" fill="#04553A"/>' +
            '<circle cx="14" cy="14" r="11" fill="none" stroke="#25d366" stroke-width="2" opacity="0.7"/>' +
            '</svg>';
        return { url: svgUrl(svg), scaledSize: sz(28, 28), anchor: pt(14, 14) };
    }

    /* نقطة رسم المناطق */
    function zoneDotIcon() {
        return {
            path: (typeof google !== 'undefined') ? google.maps.SymbolPath.CIRCLE : 0,
            scale: 7,
            fillColor: '#04553A',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2.5
        };
    }

    /* ─── الواجهة العامة ─────────────────────────────────────── */
    window.WajeezMarkers = {
        /**
         * دبوس الكابتن متعدد الحالات
         * @param {'available'|'busy'|'offline'} status
         * @param {boolean} [highlighted]
         */
        captain: function (status, highlighted) {
            return captainPin(status || 'available', !!highlighted);
        },

        /** نقطة الاستلام A — خضراء */
        pickup: function () {
            return teardropPin('#10b981', 'A', { w: 34, h: 44, fontSize: 13 });
        },

        /** نقطة التسليم B — حمراء */
        dropoff: function () {
            return teardropPin('#e63946', 'B', { w: 34, h: 44, fontSize: 13 });
        },

        /** موقع المتجر — أخضر مع أيقونة متجر */
        store: function (label) {
            return teardropPin('#04553A', label || '🏪', { w: 34, h: 44, fontSize: 12 });
        },

        /** موقع منشأة قابل للسحب — أخضر مع دبوس */
        place: function () {
            return teardropPin('#04553A', '📍', { w: 32, h: 40, fontSize: 12 });
        },

        /** موقع المستخدم الحالي — نقطة دائرية خضراء */
        userDot: function () {
            return userDotIcon();
        },

        /** نقطة رسم منطقة التسعير */
        zoneDot: function () {
            return zoneDotIcon();
        }
    };

})();
