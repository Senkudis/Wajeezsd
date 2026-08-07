/**
 * Unit tests — utils/captainDispatch.planDispatch
 * التوزيع الذكي: الأقرب أولاً، مع ضمان وصول البقية كموجة ثانية.
 */
const { planDispatch } = require('../utils/captainDispatch');

const PICKUP = { lat: 15.5007, lng: 32.5599 }; // الخرطوم
// كباتن على مسافات متزايدة
const near = { fcmToken: 'near',  currentLocation: { lat: 15.5020, lng: 32.5610 } }; // ~0.2كم
const mid  = { fcmToken: 'mid',   currentLocation: { lat: 15.5300, lng: 32.5900 } }; // ~4كم
const far  = { fcmToken: 'far',   currentLocation: { lat: 15.6500, lng: 32.7000 } }; // ~20كم
const noLoc = { fcmToken: 'noloc' };                                                  // بلا موقع

describe('planDispatch', () => {
    it('يرتّب الأقرب أولاً', () => {
        const { near: n } = planDispatch([far, near, mid], PICKUP, { nearCount: 3 });
        expect(n).toEqual(['near', 'mid', 'far']);
    });

    it('كل الكباتن في موجة واحدة إذا عددهم ≤ nearCount', () => {
        const { near: n, rest } = planDispatch([near, mid], PICKUP, { nearCount: 8 });
        expect(n.sort()).toEqual(['mid', 'near']);
        expect(rest).toEqual([]);
    });

    it('🌊 يقسّم لموجتين: الأقرب في الأولى والبقية في الثانية', () => {
        const many = Array.from({ length: 12 }, (_, i) => ({
            fcmToken: 't' + i,
            currentLocation: { lat: 15.50 + i * 0.01, lng: 32.56 } // الأبعد كلما زاد i
        }));
        const { near: n, rest } = planDispatch(many, PICKUP, { nearCount: 5 });
        expect(n).toHaveLength(5);
        expect(rest).toHaveLength(7);
        expect(n[0]).toBe('t0'); // الأقرب
    });

    it('الكباتن بلا موقع يُعامَلون كأبعد (آخر الترتيب)', () => {
        const { near: n } = planDispatch([noLoc, near], PICKUP, { nearCount: 2 });
        expect(n[0]).toBe('near');
        expect(n[1]).toBe('noloc');
    });

    it('🔒 يزيل تكرار التوكن (جهاز واحد) ويُبقي الأقرب', () => {
        const dup = { fcmToken: 'near', currentLocation: { lat: 15.60, lng: 32.70 } }; // نفس التوكن، أبعد
        const { near: n } = planDispatch([dup, near], PICKUP, { nearCount: 8 });
        expect(n).toEqual(['near']); // مرّة واحدة
    });

    it('بلا إحداثيات طلب: الجميع بعيد لكن يُوزَّعون (لا انهيار)', () => {
        const { near: n } = planDispatch([near, mid, far], {}, { nearCount: 8 });
        expect(n.sort()).toEqual(['far', 'mid', 'near']);
    });

    // ── حجم الموجة الأولى الافتراضي (بلا nearCount صريح) ──
    it('افتراضياً: الموجة الأولى بنصف القطر لا بعدد ثابت — البعيدون في الثانية', () => {
        // 40 كابتناً: 30 داخل ~1كم و10 على مسافات كبيرة
        const close = Array.from({ length: 30 }, (_, i) => ({
            fcmToken: 'c' + i,
            currentLocation: { lat: 15.5007 + i * 0.0002, lng: 32.5599 }
        }));
        const distant = Array.from({ length: 10 }, (_, i) => ({
            fcmToken: 'd' + i,
            currentLocation: { lat: 15.5007 + 0.3 + i * 0.05, lng: 32.5599 }
        }));
        const { near: n, rest } = planDispatch([...distant, ...close], PICKUP);
        expect(n).toHaveLength(25);              // maxNear يمنع البثّ الشامل
        expect(rest).toHaveLength(15);           // البقية شبكة أمان بعد 18ث
        expect(n.every(t => t.startsWith('c'))).toBe(true);
    });

    it('افتراضياً: منطقة متفرقة — minNear يضمن ألا تكون الموجة الأولى ضئيلة', () => {
        // كابتن واحد قريب و11 بعيدين ⇒ لولا minNear لكانت الموجة الأولى بواحد فقط
        const only = { fcmToken: 'close', currentLocation: { lat: 15.5010, lng: 32.5601 } };
        const distant = Array.from({ length: 11 }, (_, i) => ({
            fcmToken: 'd' + i,
            currentLocation: { lat: 15.5007 + 0.3 + i * 0.05, lng: 32.5599 }
        }));
        const { near: n, rest } = planDispatch([...distant, only], PICKUP);
        expect(n).toHaveLength(8);
        expect(n[0]).toBe('close');
        expect(rest).toHaveLength(4);
    });

    it('nearCount الصريح يتجاوز حساب نصف القطر', () => {
        const many = Array.from({ length: 30 }, (_, i) => ({
            fcmToken: 't' + i,
            currentLocation: { lat: 15.5007 + i * 0.0002, lng: 32.5599 }
        }));
        expect(planDispatch(many, PICKUP, { nearCount: 3 }).near).toHaveLength(3);
    });

    it('يتجاهل المدخلات بلا توكن ويتحمّل قائمة فارغة', () => {
        expect(planDispatch([{ currentLocation: PICKUP }], PICKUP)).toEqual({ near: [], rest: [] });
        expect(planDispatch([], PICKUP)).toEqual({ near: [], rest: [] });
        expect(planDispatch(null, PICKUP)).toEqual({ near: [], rest: [] });
    });
});
