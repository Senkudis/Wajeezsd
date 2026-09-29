/**
 * 🛵 حركة دبّوس الكابتن — «ظبط الانميشن بتاع التتبع».
 *
 * الموقع يصل كل ثلاث ثوانٍ تقريباً. الحركة القديمة في شاشة العميل كانت
 * تسارعاً ثم تباطؤاً خلال (المسافة × 14 م.ث) ثم وقوفاً حتى القراءة التالية:
 * لثلاثين متراً ٤٢٠ م.ث حركة و٢٥٨٠ م.ث وقوف — «ركضةٌ ووقفة».
 *
 * هنا ساعةٌ مزيّفة تشغّل js/marker-motion.js إطاراً إطاراً، فيُقاس الوقوف
 * رقماً لا انطباعاً.
 */
import { describe, it, expect, beforeEach } from 'vitest';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** بيئة بساعةٍ يدوية: requestAnimationFrame يُنفَّذ حين نقدّم الوقت */
function makeEnv({ reduce = false, hidden = false } = {}) {
    let now = 0;
    let frames = [];
    const win = {
        performance: { now: () => now },
        requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
        matchMedia: () => ({ matches: reduce }),
        document: { hidden }
    };
    win.window = win;
    vm.runInNewContext(read('public_html/js/marker-motion.js'), win);
    return {
        MM: win.MarkerMotion,
        /** قدّم الساعة بإطاراتٍ من 16 م.ث */
        advance(ms) {
            const end = now + ms;
            while (now < end) {
                now = Math.min(end, now + 16);
                const run = frames; frames = [];
                run.forEach(f => f(now));
            }
        },
        get now() { return now; }
    };
}

function fakeMarker(lat, lng) {
    const m = { pos: { lat, lng }, icons: 0 };
    m.getPosition = () => ({ lat: () => m.pos.lat, lng: () => m.pos.lng });
    m.setPosition = (p) => { m.pos = { lat: p.lat, lng: p.lng }; };
    m.setIcon = () => { m.icons++; };
    return m;
}

// 30 م شمالاً تقريباً لكل قراءة
const STEP = 30 / 111320;

describe('سيرٌ متّصل لا «ركضة ووقفة»', () => {
    let env;
    beforeEach(() => { env = makeEnv(); });

    it('🔑 بين القراءات لا يقف الدبّوس — والقديمة كانت تقف ٨٦٪ من الوقت', () => {
        const m = fakeMarker(15.6, 32.5);
        const mover = env.MM.create(m);
        let target = 15.6;
        // عشر قراءات كل 3 ث؛ نقيس الوقوف بعد الثانية (الأولى بلا فاصلٍ معروف)
        let still = 0, samples = 0, prev = m.pos.lat;
        for (let i = 0; i < 10; i++) {
            target += STEP;
            mover.moveTo({ lat: target, lng: 32.5 });
            for (let t = 0; t < 3000; t += 50) {
                env.advance(50);
                if (i >= 2) {
                    samples++;
                    if (Math.abs(m.pos.lat - prev) < 1e-9) still++;
                }
                prev = m.pos.lat;
            }
        }
        const stillPct = still / samples;
        expect(stillPct).toBeLessThan(0.05);

        // الخوارزمية القديمة (tracking.html قبل التعديل): مدّةٌ = المسافة × 14
        // ضمن [420, 2600] م.ث، ثم وقوف حتى القراءة التالية
        const oldMoveMs = Math.max(420, Math.min(2600, 30 * 14));
        expect(1 - oldMoveMs / 3000).toBeGreaterThan(0.85);
    });

    it('سرعةٌ ثابتة داخل الحركة (خطيّة) — لا تسارع ثم كبح', () => {
        const m = fakeMarker(15.6, 32.5);
        const mover = env.MM.create(m);
        mover.moveTo({ lat: 15.6 + STEP, lng: 32.5 });
        env.advance(1300);                           // تنتهي الأولى (1200 م.ث)
        mover.moveTo({ lat: 15.6 + 2 * STEP, lng: 32.5 });   // الفاصل ≈ 1300
        const from = m.pos.lat;
        const deltas = [];
        let last = from;
        for (let i = 0; i < 6; i++) { env.advance(160); deltas.push(m.pos.lat - last); last = m.pos.lat; }
        const max = Math.max(...deltas), min = Math.min(...deltas);
        expect(min / max).toBeGreaterThan(0.85);
    });

    it('تستغرق الحركة الفاصلَ بين القراءتين، ضمن حدّين', () => {
        expect(env.MM.durationFor(0)).toBe(1200);
        expect(env.MM.durationFor(3000)).toBe(3000);
        expect(env.MM.durationFor(100)).toBe(600);
        expect(env.MM.durationFor(60000)).toBe(5000);
    });

    it('القراءة المكرّرة لا تُحسب — فلا تقصّر الحركة التالية', () => {
        const m = fakeMarker(15.6, 32.5);
        const mover = env.MM.create(m);
        mover.moveTo({ lat: 15.6 + STEP, lng: 32.5 });
        env.advance(3000);
        // الاستطلاع الدوريّ يعيد الموقع نفسه بعد 1 ث
        expect(mover.moveTo({ lat: 15.6 + STEP, lng: 32.5 })).toBe('ignored');
    });

    it('🔑 المكرّرة في منتصف الحركة لا تقطعها — كان الدبّوس يقف ثانيتين (29٪)', () => {
        const m = fakeMarker(15.6, 32.5);
        const mover = env.MM.create(m);
        mover.moveTo({ lat: 15.6 + STEP, lng: 32.5 });
        env.advance(3000);
        mover.moveTo({ lat: 15.6 + 2 * STEP, lng: 32.5 });     // فاصل 3 ث ⇒ حركة 3 ث
        env.advance(1500);
        // الاستطلاع يعيد الوجهة نفسها والدبّوس في منتصف الطريق إليها
        expect(mover.moveTo({ lat: 15.6 + 2 * STEP, lng: 32.5 })).toBe('ignored');
        env.advance(1400);
        // ما زال يتحرّك حتى نهاية الثواني الثلاث — لم يُعَد ضبطه بفاصلٍ قصير
        expect(m.pos.lat).toBeLessThan(15.6 + 2 * STEP);
        env.advance(200);
        expect(m.pos.lat).toBeCloseTo(15.6 + 2 * STEP, 9);
    });
});

describe('الحالات الخاصة', () => {
    it('قفزةٌ أبعد من 600 م تُنقل فوراً — لا طيران عبر المدينة', () => {
        const env = makeEnv();
        const m = fakeMarker(15.6, 32.5);
        const mover = env.MM.create(m);
        expect(mover.moveTo({ lat: 15.61, lng: 32.5 })).toBe('placed');   // ≈ 1.1 كم
        expect(m.pos.lat).toBe(15.61);
    });

    it('«تقليل الحركة» في الهاتف، أو صفحةٌ في الخلفية: نقلٌ فوريّ', () => {
        for (const env of [makeEnv({ reduce: true }), makeEnv({ hidden: true })]) {
            const m = fakeMarker(15.6, 32.5);
            expect(env.MM.create(m).moveTo({ lat: 15.6 + STEP, lng: 32.5 })).toBe('placed');
            expect(m.pos.lat).toBe(15.6 + STEP);
        }
    });

    it('اهتزاز GPS (أقلّ من 8 م) لا يُدير السهم', () => {
        const env = makeEnv();
        const m = fakeMarker(15.6, 32.5);
        const mover = env.MM.create(m, { heading: 90, iconFor: () => ({}) });
        mover.moveTo({ lat: 15.6 + 3 / 111320, lng: 32.5 });              // 3 م شمالاً
        env.advance(1500);
        expect(mover.heading).toBe(90);
    });

    it('الدوران بأقصر زاوية — من 350° إلى 10° عشرون درجة لا 340', () => {
        const env = makeEnv();
        expect(env.MM.shortestTurn(350, 10)).toBe(20);
        expect(env.MM.shortestTurn(10, 350)).toBe(-20);
    });

    it('الأيقونة تُبنى لكل 4° مرّةً وتُخبّأ — لا صورةً جديدة كل إطار', () => {
        const env = makeEnv();
        const m = fakeMarker(15.6, 32.5);
        let built = 0;
        const mover = env.MM.create(m, { heading: 0, iconFor: () => { built++; return {}; } });
        // منعطف 90° على 3 ث ≈ 190 إطاراً
        mover.moveTo({ lat: 15.6, lng: 32.5 + 30 / 107000 });
        env.advance(3000);
        expect(built).toBeLessThanOrEqual(24);       // 90° / 4° + هامش
        expect(m.icons).toBeLessThanOrEqual(24);
    });
});

describe('الخرائط كلها على المصدر الواحد', () => {
    it('شاشة العميل', () => {
        const t = read('public_html/tracking.html');
        expect(t).toContain('src="js/marker-motion.js');
        expect(t).toContain('captainMover.moveTo({ lat, lng })');
        expect(t).not.toContain('function animateMarker');
        expect(t).not.toContain('easeInOutCubic');
    });

    it('خريطة الرحلة للإدارة', () => {
        const j = read('public_html/js/admin-trip-map.js');
        expect(read('public_html/admin-trip-map.html')).toContain('src="js/marker-motion.js');
        expect(j).toContain('MarkerMotion.create(mk.captain, { iconFor: capIcon })');
        expect(j).not.toContain('function glide');
    });

    it('الخريطة الحيّة: حركة، وقفزٌ لحظةَ التحديد وحدها، ولا سقوط جماعيّ عند الفتح', () => {
        const j = read('public_html/js/admin-live-map.js');
        expect(read('public_html/admin-live-map.html')).toContain('src="js/marker-motion.js');
        expect(j).toContain('existing.mover.moveTo({ lat, lng })');
        expect(j).toContain('isHighlighted && !existing.hl');
        expect(j).toContain('this._ready && !MarkerMotion.reducedMotion()');
        // الدالة غير المعرّفة التي كانت تُفشل كل تحميل
        expect(j).not.toMatch(/^\s*renderSearchList\(/m);
    });

    it('الكباتن حول العميل في الصفحة الرئيسية', () => {
        expect(read('public_html/index.html')).toContain('src="js/marker-motion.js');
        expect(read('public_html/js/home.js')).toContain('m._mover.moveTo({ lat, lng })');
    });
});

describe('حركات الواجهة', () => {
    it('رادار البحث عن كابتن: transform لا width/height', () => {
        const s = read('public_html/client-my-orders.html');
        const kf = s.slice(s.indexOf('@keyframes radarPulse'), s.indexOf('}', s.indexOf('100%', s.indexOf('@keyframes radarPulse'))));
        expect(kf).toContain('transform: scale(');
        expect(kf).not.toMatch(/width|height/);
    });

    it('«تقليل الحركة» يُحترم في كل صفحة تحمّل ui-states — ويُحقن عند التحميل', () => {
        const u = read('public_html/js/ui-states.js');
        expect(u).toContain("var MOTION_ID = 'ui-motion-style'");
        expect(u).toContain('animation-iteration-count:1!important');
        expect(u).toMatch(/injectMotionPreference\(\);\s*bindNetwork\(\);/);
    });
});
