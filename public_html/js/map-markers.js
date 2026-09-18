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

    /**
     * 🛵 قرص الكابتن المتحرّك — لشاشة التتبّع.
     *
     * لماذا قرصٌ لا دبوس قطرة: الدبوس يشير إلى أسفل، فإن دُوِّر ليواجه اتجاه
     * السير انقلب رأسه وبدا مكسوراً. والقرص دائريّ متماثل يدور بلا أن ينكسر.
     *
     * ⚠️ والأهمّ: **الوسيلة لا تدور، المؤشّر وحده يدور.**
     *    أوّل محاولةٍ هنا كانت تُدوّر القرص كلّه بأيقونته، فتصير الدراجة
     *    مقلوبةً حين يتّجه الكابتن جنوباً — شكلٌ لا يُقرأ. هكذا تفعل تطبيقات
     *    التوصيل: الأيقونة ثابتة مقروءة، ومخروطٌ على المحيط يدور وحده.
     *
     * وثلاثة أمور كانت غائبة عن دبوس التتبّع القديم:
     *   ١) الاتجاه: أيقونة ثابتة مهما سار، فلا يعرف العميل أمقبلٌ هو أم مبتعد.
     *   ٢) الوسيلة: دراجةٌ هوائية دائماً، ولو كان الكابتن بسيارة.
     *   ٣) الهوية: ألوانٌ عامة (#16a34a) لا خضرة وجيز.
     *
     * @param {string} vehicle نوع الوسيلة من utils/vehicleTypes
     * @param {number} heading زاوية السير بالدرجات (0 = شمال)
     */
    function captainPuck(vehicle, heading) {
        var BRAND = '#04553A', BRAND_LIT = '#0d7a56', GOLD = '#D8B765';
        var w = 58, h = 58, c = w / 2;
        var deg = (typeof heading === 'number' && isFinite(heading)) ? heading : null;

        /* مظلّلاتٌ مصمتة داخل مربّع 24×24 — تُقرأ عند 24px، بخلاف الخطوط الرفيعة */
        var GLYPHS = {
            motorcycle: '<path d="M16.6 6.4h-3a.9.9 0 0 0 0 1.8h1.1l1 1.9-3.3 3.6H8.9L7.4 12H9a.9.9 0 0 0 0-1.8H4.2a.9.9 0 0 0 0 1.8h1.1l1.8 2.7h5.8l4-4.4 1 2.1a4.3 4.3 0 1 0 1.7-.8l-2.2-4.6a.9.9 0 0 0-.8-.6z"/>' +
                        '<circle cx="5.6" cy="16.6" r="3.1"/><circle cx="18.4" cy="16.6" r="1.6" fill="' + BRAND + '"/>',
            electric:   '<path d="M13.4 3.6l-4.6 7h3l-1.4 5.2 5-7.3h-3.1z"/>' +
                        '<circle cx="5.6" cy="17.4" r="3"/><circle cx="18.4" cy="17.4" r="3"/>' +
                        '<path d="M8.6 17.4h6.8v1.6H8.6z"/>',
            bicycle:    '<path d="M11.8 6.2l1.6 3.1-3.5 4.1-2-3.6h2.3a.85.85 0 0 0 0-1.7H4.4a.85.85 0 0 0 0 1.7h1.2l2.4 4.4h4.3l4-4.7 1 2 1.6-.8-2.6-5.1z"/>' +
                        '<circle cx="5.4" cy="16.8" r="3.2"/><circle cx="18.6" cy="16.8" r="3.2"/>' +
                        '<circle cx="5.4" cy="16.8" r="1.5" fill="' + BRAND + '"/>' +
                        '<circle cx="18.6" cy="16.8" r="1.5" fill="' + BRAND + '"/>',
            rickshaw:   '<path d="M12 3.4A7.4 7.4 0 0 0 4.6 11v5.2h14.8V11A7.4 7.4 0 0 0 12 3.4zm-5.6 7.8A5.7 5.7 0 0 1 12 5.5v5.7z"/>' +
                        '<circle cx="7.2" cy="18" r="2.4"/><circle cx="16.8" cy="18" r="2.4"/>',
            car:        '<path d="M18.9 9.4l-1.3-3.2a2 2 0 0 0-1.9-1.3H8.3a2 2 0 0 0-1.9 1.3L5.1 9.4a2.2 2.2 0 0 0-1.5 2.1v4.2c0 .5.4.9.9.9h1.3c.5 0 .9-.4.9-.9v-.8h10.6v.8c0 .5.4.9.9.9h1.3c.5 0 .9-.4.9-.9v-4.2a2.2 2.2 0 0 0-1.5-2.1zM8.3 6.6h7.4l1.1 2.7H7.2zM6.9 13.3a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zm10.2 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4z"/>',
            van:        '<path d="M3.4 5.6h9.8v8.9H3.4zM14.4 8.3h3.1l2.6 3.1v3.1h-5.7z"/>' +
                        '<circle cx="7" cy="17.2" r="2.3"/><circle cx="17" cy="17.2" r="2.3"/>' +
                        '<circle cx="7" cy="17.2" r="1" fill="' + BRAND + '"/>' +
                        '<circle cx="17" cy="17.2" r="1" fill="' + BRAND + '"/>'
        };
        var glyph = GLYPHS[vehicle] || GLYPHS.motorcycle;

        /* 🧭 مخروط الاتجاه على المحيط — وحده يدور */
        var cone = deg === null ? '' :
            '<g transform="rotate(' + deg + ' ' + c + ' ' + c + ')">' +
              '<path d="M' + c + ',1.4 L' + (c + 6.4) + ',11.2 L' + (c - 6.4) + ',11.2 Z" ' +
                    'fill="' + GOLD + '" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>' +
            '</g>';

        var gs = 24 / 24 * 0.98;
        var gx = c - 11.8, gy = c - 11.8;

        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
            '<defs>' +
              '<radialGradient id="cg" cx="50%" cy="34%" r="66%">' +
                '<stop offset="0%" stop-color="' + BRAND_LIT + '"/>' +
                '<stop offset="100%" stop-color="' + BRAND + '"/>' +
              '</radialGradient>' +
              '<filter id="cs" x="-50%" y="-50%" width="200%" height="200%">' +
                '<feDropShadow dx="0" dy="2.5" stdDeviation="2.6" flood-color="#000" flood-opacity="0.34"/>' +
              '</filter>' +
            '</defs>' +
            '<circle cx="' + c + '" cy="' + c + '" r="21.5" fill="#ffffff" filter="url(#cs)"/>' +
            cone +
            '<circle cx="' + c + '" cy="' + c + '" r="18.6" fill="url(#cg)"/>' +
            /* الوسيلة ثابتة دائماً — لا تدور مع الاتجاه */
            '<g transform="translate(' + gx + ',' + gy + ') scale(' + gs + ')" fill="#ffffff">' + glyph + '</g>' +
            '</svg>';

        return { url: svgUrl(svg), scaledSize: sz(w, h), anchor: pt(c, c) };
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

        /**
         * قرص الكابتن في شاشة التتبّع — يدور باتجاه السير.
         * @param {string} vehicle نوع الوسيلة
         * @param {number} [heading] زاوية السير بالدرجات
         */
        captainPuck: function (vehicle, heading) {
            return captainPuck(vehicle, heading);
        },

        /** نقطة الاستلام A — خضراء */
        pickup: function () {
            return teardropPin('#10b981', 'A', { w: 34, h: 44, fontSize: 13 });
        },

        /** نقطة التسليم B — حمراء */
        dropoff: function () {
            return teardropPin('#e63946', 'B', { w: 34, h: 44, fontSize: 13 });
        },

        /** موقع المتجر — أخضر مع أيقونة متجر SVG (بدون emoji لتفادي المستطيل الأسود) */
        store: function (label) {
            // إذا تم تمرير label نصي (ليس emoji) استخدم teardropPin العادي
            if (label && typeof label === 'string' && label.length <= 2 && label.charCodeAt(0) < 256) {
                return teardropPin('#04553A', label, { w: 34, h: 44, fontSize: 12 });
            }
            // وإلا استخدم SVG مخصص مع أيقونة متجر path (بدلاً من emoji)
            var w = 38, h = 50, cx = w / 2, topR = cx - 2;
            var pinPath = 'M' + cx + ',' + (h - 5) +
                'C' + cx + ',' + (h - 5) + ' ' + (cx - topR + 2) + ',' + (topR * 1.65) + ' ' + (cx - topR) + ',' + topR +
                'a' + topR + ',' + topR + ' 0 1,1 ' + (topR * 2) + ',0' +
                'C' + (cx + topR - 2) + ',' + (topR * 1.65) + ' ' + cx + ',' + (h - 5) + ' ' + cx + ',' + (h - 5) + 'Z';
            var innerR = topR * 0.62;
            // أيقونة متجر مبسطة بـ SVG path داخل دائرة بيضاء
            var storeIcon =
                '<circle cx="' + cx + '" cy="' + topR + '" r="' + innerR + '" fill="white" opacity="0.95"/>' +
                '<g transform="translate(' + (cx - innerR * 0.75) + ',' + (topR - innerR * 0.75) + ') scale(' + (innerR * 1.5 / 24) + ')">' +
                '<path d="M2 7h20l-1.5 9H3.5L2 7z" fill="#04553A"/>' +
                '<path d="M7 7V5a5 5 0 0110 0v2" fill="none" stroke="#04553A" stroke-width="2" stroke-linecap="round"/>' +
                '<circle cx="9" cy="13" r="1.5" fill="white"/>' +
                '<circle cx="15" cy="13" r="1.5" fill="white"/>' +
                '</g>';
            var shadowEl = '<ellipse cx="' + cx + '" cy="' + (h - 2) + '" rx="' + (cx * 0.55) + '" ry="3.5" fill="rgba(0,0,0,0.22)"/>';
            var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
                '<defs><filter id="ps" x="-40%" y="-40%" width="180%" height="180%">' +
                '<feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.28"/></filter></defs>' +
                shadowEl +
                '<path d="' + pinPath + '" fill="#04553A" filter="url(#ps)"/>' +
                storeIcon +
                '</svg>';
            return { url: svgUrl(svg), scaledSize: new google.maps.Size(w, h), anchor: new google.maps.Point(cx, h - 3) };
        },

        /** موقع منشأة قابل للسحب — أخضر مع دبوس */
        place: function () {
            // استخدام SVG path بدلاً من emoji 📍 لتفادي المستطيل الأسود
            var w = 32, h = 40, cx = w / 2, topR = cx - 2;
            var pinPath = 'M' + cx + ',' + (h - 5) +
                'C' + cx + ',' + (h - 5) + ' ' + (cx - topR + 2) + ',' + (topR * 1.65) + ' ' + (cx - topR) + ',' + topR +
                'a' + topR + ',' + topR + ' 0 1,1 ' + (topR * 2) + ',0' +
                'C' + (cx + topR - 2) + ',' + (topR * 1.65) + ' ' + cx + ',' + (h - 5) + ' ' + cx + ',' + (h - 5) + 'Z';
            var innerR = topR * 0.62;
            var dot = '<circle cx="' + cx + '" cy="' + topR + '" r="' + innerR + '" fill="white" opacity="0.95"/>' +
                '<circle cx="' + cx + '" cy="' + topR + '" r="' + (innerR * 0.45) + '" fill="#04553A"/>';
            var shadowEl = '<ellipse cx="' + cx + '" cy="' + (h - 2) + '" rx="' + (cx * 0.55) + '" ry="3" fill="rgba(0,0,0,0.22)"/>';
            var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
                '<defs><filter id="ps2" x="-40%" y="-40%" width="180%" height="180%">' +
                '<feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.28"/></filter></defs>' +
                shadowEl +
                '<path d="' + pinPath + '" fill="#04553A" filter="url(#ps2)"/>' +
                dot + '</svg>';
            return { url: svgUrl(svg), scaledSize: new google.maps.Size(w, h), anchor: new google.maps.Point(cx, h - 3) };
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
