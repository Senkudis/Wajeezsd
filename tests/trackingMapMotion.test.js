/**
 * 🗺️ حركة الكابتن على خريطة التتبّع.
 *
 * ما كان:
 *   ١) **الأيقونة لا تدور**: قرصٌ ثابت مهما سار الكابتن، فلا يعرف العميل
 *      أمقبلٌ هو أم مبتعد — وهو أوّل ما يأتي ليعرفه.
 *   ٢) **دراجة هوائية دائماً**: أيقونة واحدة لكل الوسائل، ولو كان بسيارة.
 *   ٣) **مدّة ثابتة 500ms** مهما كانت المسافة: قفزةُ مئة متر تزحف، وقفزةُ
 *      كيلومتر تطير. وسرعةٌ خطّية تبدأ وتقف فجأة.
 *   ٤) **ألوانٌ عامة** (#16a34a) لا خضرة وجيز.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const markers  = read('public_html/js/map-markers.js');
const tracking = read('public_html/tracking.html');

describe('🛵 قرص الكابتن', () => {
    it('موجود ومكشوف في الواجهة العامة', () => {
        expect(markers).toContain('function captainPuck');
        expect(markers).toMatch(/captainPuck: function \(vehicle, heading\)/);
    });

    it('🔑 لكل وسيلة رسمها — لا دراجة هوائية للجميع', () => {
        const fn = markers.slice(markers.indexOf('function captainPuck'));
        for (const v of ['motorcycle', 'electric', 'bicycle', 'rickshaw', 'car', 'van']) {
            expect(fn.slice(0, 4000), v).toContain(v + ':');
        }
    });

    it('🔑 المؤشّر وحده يدور — والوسيلة تبقى منتصبة', () => {
        // تدوير القرص كلّه يقلب الدراجة رأساً على عقب حين يتّجه جنوباً
        const fn = markers.slice(markers.indexOf('function captainPuck'), markers.indexOf('/* ─── الواجهة العامة'));
        expect(fn).toMatch(/var cone = deg === null[\s\S]{0,200}rotate\(' \+ deg/);
        // مجموعة الرسم تُترجَم ولا تُدوَّر
        expect(fn).toMatch(/translate\(' \+ gx \+ ',' \+ gy \+ '\) scale\(/);
        const glyphGroup = fn.slice(fn.indexOf("'<g transform=\"translate(' + gx"));
        expect(glyphGroup.slice(0, 160)).not.toContain('rotate(');
    });

    it('وبلا اتجاهٍ معروف لا يُرسم مؤشّر — لا سهم يكذب', () => {
        const fn = markers.slice(markers.indexOf('function captainPuck'));
        expect(fn).toMatch(/var cone = deg === null \? '' :/);
    });

    it('🎨 بهوية وجيز لا بألوان عامة', () => {
        const fn = markers.slice(markers.indexOf('function captainPuck'), markers.indexOf('/* ─── الواجهة العامة'));
        expect(fn).toContain("BRAND = '#04553A'");
        expect(fn).not.toContain('#16a34a');
    });
});

describe('🎞️ الحركة — js/marker-motion.js (المصدر الواحد للعميل والإدارة)', () => {
    // ⚠️ تغيّرت عمداً نقطتان هنا (انظر tests/markerMotion.test.js):
    //   • المدّة كانت «تتبع المسافة» (dist × 14 م.ث) ثم يقف الدبّوس حتى القراءة
    //     التالية — ٨٦٪ من الوقت واقفاً. الآن تتبع **الفاصل بين القراءتين**
    //     فيسير بلا توقّف.
    //   • التسارع الناعم (easeInOutCubic) كان يكبح الدبّوس قبل كل قراءة. الآن
    //     سرعةٌ ثابتة — وهي ما يجعل القراءات المتتالية سيراً واحداً.
    const mm = read('public_html/js/marker-motion.js');
    const move = mm.slice(mm.indexOf('function moveTo'), mm.indexOf('return {', mm.indexOf('function moveTo')));

    it('🔑 المدّة = الفاصل بين القراءتين ضمن حدّين — لا مدّة ثابتة ولا «ركضة ووقفة»', () => {
        expect(mm).toMatch(/Math\.max\(MIN_MS, Math\.min\(MAX_MS, gapMs\)\)/);
        expect(move).toContain('var dur = durationFor(gap)');
    });

    it('🔑 سرعةٌ ثابتة داخل الحركة', () => {
        expect(move).toContain('from.lat + (to.lat - from.lat) * p');
        expect(tracking).not.toContain('easeInOutCubic');
    });

    it('🔑 والقرص يدور نحو وجهته', () => {
        expect(mm).toContain('function bearing(');
        expect(move).toContain('applyIcon(heading)');
    });

    it('🔒 أقصر دوران — لا لفّة كاملة عند عبور 360°', () => {
        expect(mm).toContain('function shortestTurn');
        expect(mm).toMatch(/\(\(to - from \+ 540\) % 360\) - 180/);
    });

    it('🔒 قفزة بعيدة تُنقَل فوراً — الطيران عبر المدينة يكذب على العين', () => {
        expect(mm).toContain('var TELEPORT_M = 600;');
        expect(move).toContain('d > TELEPORT_M');
    });

    it('🔒 وحركةٌ أحدث تُلغي سابقتها فلا تتصارعان', () => {
        expect(move).toContain('var id = ++anim;');
        expect(move).toContain('if (id !== anim) return;');
    });

    it('وضجيج GPS لا يُحرّك شيئاً ولا يُدير السهم', () => {
        expect(move).toContain("if (d < 0.5)");
        expect(move).toContain('d >= HEADING_MIN_M ? bearing(from, to) : heading');
    });

    it('شاشة التتبّع تستعمله', () => {
        expect(tracking).toContain('src="js/marker-motion.js');
        expect(tracking).toContain('MarkerMotion.create(captainMarker, { iconFor: captainIconFor })');
    });
});

describe('💓 الهالة النابضة', () => {
    it('تُرسم عند أول ظهورٍ للكابتن', () => {
        expect(tracking).toContain('function addCaptainPulse');
        expect(tracking).toContain('addCaptainPulse(lat, lng)');
    });

    it('دائرةٌ على الخريطة لا عنصر DOM — تلتصق بالإحداثيات', () => {
        const fn = tracking.slice(tracking.indexOf('function addCaptainPulse'));
        expect(fn.slice(0, 900)).toContain('new google.maps.Circle');
    });

    it('🔋 وتتوقّف حين تُخفى الصفحة — لا rAF في الخلفية بلا فائدة', () => {
        expect(tracking).toContain("addEventListener('visibilitychange'");
        expect(tracking).toContain('cancelAnimationFrame(pulseRaf)');
    });
});

describe('🔗 التتبّع يستعمل القرص لا الدبوس القديم', () => {
    it('عند إنشاء العلامة أول مرّة', () => {
        // placeCaptainMarker ينشئ الدبّوس بـ captainIconFor(null) — والقرص فيها
        const fn = tracking.slice(tracking.indexOf('function captainIconFor'));
        expect(fn.slice(0, 600)).toContain('WajeezMarkers.captainPuck');
        expect(tracking.slice(tracking.indexOf('function placeCaptainMarker')).slice(0, 1200)).toContain('icon: captainIconFor(null)');
    });

    it('وبنوع وسيلة الكابتن الفعليّ', () => {
        expect(tracking).toContain("currentOrder?.captain?.vehicleType");
    });
});
