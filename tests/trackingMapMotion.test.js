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

describe('🎞️ الحركة', () => {
    const fn = tracking.slice(tracking.indexOf('function animateMarker'), tracking.indexOf('async function fetchOrder'));

    it('🔑 المدّة تتبع المسافة — لا 500ms لكل شيء', () => {
        expect(fn).toMatch(/Math\.max\(420, Math\.min\(2600, dist \* 14\)\)/);
    });

    it('🔑 وتسارعٌ ناعم الطرفين لا سرعة خطّية', () => {
        expect(tracking).toContain('easeInOutCubic');
    });

    it('🔑 والقرص يدور نحو وجهته', () => {
        expect(tracking).toContain('function bearing(');
        expect(fn).toContain('setCaptainIcon(marker, h)');
    });

    it('🔒 أقصر دوران — لا لفّة كاملة عند عبور 360°', () => {
        expect(tracking).toContain('function shortestTurn');
        expect(tracking).toMatch(/\(\(to - from \+ 540\) % 360\) - 180/);
    });

    it('🔒 قفزة بعيدة تُنقَل فوراً — الطيران عبر المدينة يكذب على العين', () => {
        expect(fn).toMatch(/if \(dist > 600\)/);
        expect(fn).toMatch(/marker\.setPosition\(to\)/);
    });

    it('🔒 وحركةٌ أحدث تُلغي سابقتها فلا تتصارعان', () => {
        expect(fn).toContain('captainAnimId');
        expect(fn).toMatch(/if \(id !== captainAnimId\) return;/);
    });

    it('وضجيج GPS دون المتر لا يُحرّك شيئاً', () => {
        expect(fn).toMatch(/if \(dist < 1\) return;/);
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
        const fn = tracking.slice(tracking.indexOf('function placeCaptainMarker'));
        expect(fn.slice(0, 900)).toContain('WajeezMarkers.captainPuck');
    });

    it('وبنوع وسيلة الكابتن الفعليّ', () => {
        expect(tracking).toContain("currentOrder?.captain?.vehicleType");
    });
});
