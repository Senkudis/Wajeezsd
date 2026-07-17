/**
 * Unit tests — utils/eta + geofence.haversineKm
 */
const { estimateEtaMinutes, formatEta, DEFAULTS } = require('../utils/eta');
const { haversineKm } = require('../utils/geofence');

describe('haversineKm', () => {
    it('يحسب مسافة معلومة تقريباً (الخرطوم ↔ بورتسودان ~660كم)', () => {
        const d = haversineKm({ lat: 15.5007, lng: 32.5599 }, { lat: 19.6158, lng: 37.2164 });
        expect(d).toBeGreaterThan(600);
        expect(d).toBeLessThan(720);
    });

    it('صفر لنفس النقطة', () => {
        expect(haversineKm({ lat: 15.5, lng: 32.5 }, { lat: 15.5, lng: 32.5 })).toBeCloseTo(0, 5);
    });

    it('null عند نقص إحداثيات', () => {
        expect(haversineKm({ lat: 15 }, { lat: 16, lng: 33 })).toBeNull();
        expect(haversineKm(null, { lat: 16, lng: 33 })).toBeNull();
    });
});

describe('estimateEtaMinutes', () => {
    it('يزيد الزمن مع المسافة', () => {
        expect(estimateEtaMinutes(10)).toBeGreaterThan(estimateEtaMinutes(2));
    });

    it('يحترم الحدّ الأدنى للمسافات القصيرة جداً', () => {
        // 0كم = زمن المناولة الثابت فقط (8د)، ولا يقل عن الحدّ الأدنى (5د)
        expect(estimateEtaMinutes(0)).toBeGreaterThanOrEqual(DEFAULTS.minMinutes);
        expect(estimateEtaMinutes(0.1)).toBeGreaterThanOrEqual(DEFAULTS.minMinutes);
    });

    it('قيمة معقولة لمسافة 5كم داخل المدينة', () => {
        // 5كم × 1.3 التفاف ÷ 22 كم/س × 60 + 8 مناولة ≈ 26 دقيقة
        const m = estimateEtaMinutes(5);
        expect(m).toBeGreaterThan(15);
        expect(m).toBeLessThan(40);
    });

    it('يضيف زمناً لكل محطة إضافية', () => {
        expect(estimateEtaMinutes(5, { extraStops: 2 })).toBeGreaterThan(estimateEtaMinutes(5));
    });

    it('null لمدخل غير صالح', () => {
        expect(estimateEtaMinutes(-1)).toBeNull();
        expect(estimateEtaMinutes('abc')).toBeNull();
        expect(estimateEtaMinutes(null)).toBeNull();
    });
});

describe('formatEta', () => {
    it('يبني نطاقاً ونصاً عربياً', () => {
        const f = formatEta(20);
        expect(f.minutes).toBe(20);
        expect(f.min).toBeLessThanOrEqual(20);
        expect(f.max).toBeGreaterThanOrEqual(20);
        expect(f.text).toContain('دقيقة');
    });

    it('null لمدخل فارغ', () => {
        expect(formatEta(null)).toBeNull();
        expect(formatEta(undefined)).toBeNull();
    });
});
