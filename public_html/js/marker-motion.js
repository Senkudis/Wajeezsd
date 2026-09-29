/**
 * 🛵 حركة دبّوس الكابتن على الخريطة — مصدرٌ واحد لخرائط العميل والإدارة.
 *
 * المشكلة: الموقع يصل كل ٣–٥ ثوانٍ، وكانت كل خريطةٍ تحرّك الدبّوس بطريقتها:
 *   • شاشة العميل: تسارعٌ ثم تباطؤ (ease-in-out) خلال ثانيتين ثم **وقوف**
 *     حتى القراءة التالية — فيمشي الكابتن «ركضةً ووقفة» لا سيراً.
 *   • خريطة الرحلة للإدارة: ٩٠٠ م.ث ثم وقوف — نفس التقطّع.
 *   • الخريطة الحيّة: قفزٌ بلا حركة أصلاً.
 *
 * الحلّ المعروف في تطبيقات التوصيل: تستغرق الحركة **الفاصلَ بين القراءتين**
 * نفسه، بسرعةٍ ثابتة (خطيّة). فحين تصل القراءة التالية يكون الدبّوس قد وصل
 * للتوّ، ويستمرّ بلا توقّف. الثمن تأخّرٌ بمقدار قراءةٍ واحدة — لا يُرى.
 *
 * وما عدا ذلك:
 *   • قفزةٌ بعيدة (> 600 م: عودة شبكة بعد انقطاع) تُنقل فوراً — الطيران عبر
 *     المدينة يكذب على العين.
 *   • الاتجاه لا يتغيّر إلا بحركةٍ حقيقية (≥ 8 م) — اهتزاز GPS والكابتن واقف
 *     كان يُدير السهم يميناً ويساراً.
 *   • الدوران بأقصر زاوية ويسبق الحركة قليلاً، كما يميل الراكب قبل المنعطف.
 *   • الأيقونة تُبنى لكل ٤° مرّة وتُخبّأ — كانت تُولَّد صورةً جديدة ٦٠ مرّة
 *     في الثانية فتُثقل الهواتف الضعيفة.
 *   • «تقليل الحركة» في إعدادات الهاتف، أو صفحةٌ في الخلفية: نقلٌ فوريّ.
 *
 * الاستعمال:
 *   const mover = MarkerMotion.create(marker, {
 *       iconFor: (heading) => WajeezMarkers.captainPuck('motorcycle', heading),  // اختياري
 *       onFrame: (pos) => pulse.setCenter(pos)                                   // اختياري
 *   });
 *   mover.moveTo({ lat, lng });
 */
(function (global) {
    'use strict';

    var TELEPORT_M = 600;      // أبعد من هذا: نقلٌ فوريّ
    var HEADING_MIN_M = 8;     // أقلّ من هذا: ضجيج GPS، لا يغيّر الاتجاه
    var MIN_MS = 600;          // أقصر حركة — لا يرتجف
    var MAX_MS = 5000;         // أطول حركة — قراءةٌ متأخّرة جداً لا تجرّ الدبّوس دهراً
    var FIRST_MS = 1200;       // أوّل حركة: لا فاصل معروف بعد
    var ICON_STEP = 4;         // دقّة الدوران بالدرجات

    function reducedMotion() {
        try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); }
        catch (_) { return false; }
    }

    function meters(a, b) {
        var R = 6371000, rad = function (d) { return d * Math.PI / 180; };
        var dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
        var x = Math.pow(Math.sin(dLat / 2), 2) +
                Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * R * Math.asin(Math.sqrt(x));
    }

    /** زاوية السير بالدرجات (0 = شمال) */
    function bearing(a, b) {
        var rad = function (d) { return d * Math.PI / 180; };
        var y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
        var x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
                Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    /** أقصر فرقٍ زاويّ — لا دورة كاملة عند عبور 360°/0° */
    function shortestTurn(from, to) {
        return ((to - from + 540) % 360) - 180;
    }

    /** مدّة الحركة: الفاصل بين القراءتين، ضمن حدّين */
    function durationFor(gapMs) {
        if (!gapMs) return FIRST_MS;
        return Math.max(MIN_MS, Math.min(MAX_MS, gapMs));
    }

    function create(marker, opts) {
        opts = opts || {};
        var anim = 0;              // رقم الحركة الجارية — الأحدث يُلغي الأقدم
        var lastAt = null;         // متى وصلت آخر قراءةٍ حرّكت الدبّوس
        var target = null;         // آخر وجهةٍ أُرسل إليها — لتمييز القراءة المكرّرة
        var heading = (typeof opts.heading === 'number') ? opts.heading : null;
        var iconKey = null;
        var icons = {};

        function applyIcon(h) {
            if (!opts.iconFor) return;
            var key = (h === null) ? 'none' : String((Math.round(h / ICON_STEP) * ICON_STEP) % 360);
            if (key === iconKey) return;
            iconKey = key;
            if (!icons[key]) icons[key] = opts.iconFor(key === 'none' ? null : Number(key));
            marker.setIcon(icons[key]);
        }

        function current() {
            var p = marker.getPosition && marker.getPosition();
            return p ? { lat: p.lat(), lng: p.lng() } : null;
        }

        function frame(pos) {
            if (opts.onFrame) { try { opts.onFrame(pos); } catch (_) {} }
        }

        function place(to, h) {
            anim++;
            marker.setPosition(to);
            if (h !== null && h !== undefined) heading = h;
            applyIcon(heading);
            frame(to);
        }

        /**
         * حرّك الدبّوس إلى to. { instant: true } للنقل الفوريّ (أوّل رسم مثلاً).
         * @returns {'moved'|'placed'|'ignored'}
         */
        function moveTo(to, o) {
            o = o || {};
            if (!to || !isFinite(to.lat) || !isFinite(to.lng)) return 'ignored';
            to = { lat: Number(to.lat), lng: Number(to.lng) };
            var from = current();
            var now = (global.performance && performance.now) ? performance.now() : Date.now();

            if (!from) { lastAt = now; target = to; place(to, null); return 'placed'; }

            // القراءة نفسها مكرّرة (الاستطلاع الدوريّ بجانب البثّ): لا شيء، ولا
            // تُحسب «قراءة». ⚠️ تُقارَن بالوجهة الأخيرة لا بموقع الدبّوس الآن:
            // في منتصف الحركة يكون الدبّوس بعيداً عن وجهته، فكانت القراءة
            // المكرّرة تُعدّ جديدة وتعيد الحركة بفاصلٍ قصير — فتنتهي التالية
            // مبكّراً ويقف الدبّوس ثانيتين (قيس في الصفحة الحقيقية: 29٪ وقوف).
            if (target && meters(target, to) < 0.5) return 'ignored';

            var d = meters(from, to);
            if (d < 0.5) { target = to; return 'ignored'; }
            target = to;

            var gap = lastAt === null ? 0 : now - lastAt;
            lastAt = now;
            var newHeading = d >= HEADING_MIN_M ? bearing(from, to) : heading;

            if (o.instant || d > TELEPORT_M || reducedMotion() || (global.document && document.hidden)) {
                place(to, newHeading);
                return 'placed';
            }

            var dur = durationFor(gap);
            var h0 = heading === null ? newHeading : heading;
            var turn = (h0 === null || newHeading === null) ? 0 : shortestTurn(h0, newHeading);
            var id = ++anim;
            var t0 = now;

            var step = function (t) {
                if (id !== anim) return;                         // ألغتها قراءةٌ أحدث
                var p = Math.min(1, (t - t0) / dur);
                // خطيّة عمداً: السرعة الثابتة هي ما يجعل القراءات المتتالية سيراً واحداً
                var pos = { lat: from.lat + (to.lat - from.lat) * p, lng: from.lng + (to.lng - from.lng) * p };
                marker.setPosition(pos);
                if (h0 !== null) {
                    // الدوران يكتمل في أوّل ٤٠٪ من الحركة
                    heading = (h0 + turn * Math.min(1, p * 2.5) + 360) % 360;
                    applyIcon(heading);
                }
                frame(pos);
                if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
            return 'moved';
        }

        return {
            moveTo: moveTo,
            /** أوقف أيّ حركةٍ جارية في مكانها */
            stop: function () { anim++; },
            /** أعد بناء الأيقونة (تغيّرت وسيلة الكابتن مثلاً) */
            refreshIcon: function () { icons = {}; iconKey = null; applyIcon(heading); },
            /** انسَ الفاصل — القراءة التالية بعد انقطاعٍ ليست امتداداً للسابقة */
            reset: function () { lastAt = null; },
            get heading() { return heading; }
        };
    }

    global.MarkerMotion = {
        create: create,
        meters: meters,
        bearing: bearing,
        shortestTurn: shortestTurn,
        durationFor: durationFor,
        reducedMotion: reducedMotion,
        TELEPORT_M: TELEPORT_M,
        HEADING_MIN_M: HEADING_MIN_M
    };
})(window);
