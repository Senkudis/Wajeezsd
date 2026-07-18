/**
 * Unit tests — utils/geofence
 * يتحقق من حصر نطاق الخدمة داخل حدود السودان.
 */
// describe/it/expect متاحة كـ globals (globals: true في vitest.config.js)
const { isInsideSudan, validateOrderLocations, validateStopsLocations } = require('../utils/geofence');

// الخرطوم تقريباً
const KHARTOUM = { lat: 15.5007, lng: 32.5599 };
// القاهرة (خارج السودان)
const CAIRO = { lat: 30.0444, lng: 31.2357 };

// محطات داخل الخرطوم لاختبار قواعد الترتيب
const P = (extra = {}) => ({ type: 'pickup', address: 'استلام', lat: 15.50, lng: 32.55, ...extra });
const D = (extra = {}) => ({ type: 'dropoff', address: 'تسليم', lat: 15.55, lng: 32.60, ...extra });

describe('validateStopsLocations — قواعد الترتيب', () => {
    it('يقبل رحلة صحيحة (استلامات ثم تسليمات)', () => {
        expect(validateStopsLocations([P(), P(), D(), D()]).valid).toBe(true);
    });

    it('🔒 يرفض تسليماً قبل استلام', () => {
        const r = validateStopsLocations([D(), P()]);
        expect(r.valid).toBe(false);
        expect(r.message).toContain('الاستلام قبل');
    });

    it('🔒 يرفض استلاماً متأخّراً بعد تسليم', () => {
        expect(validateStopsLocations([P(), D(), P(), D()]).valid).toBe(false);
    });

    it('يرفض رحلة بلا استلام أو بلا تسليم', () => {
        expect(validateStopsLocations([P(), P()]).valid).toBe(false);
        expect(validateStopsLocations([D(), D()]).valid).toBe(false);
    });

    it('يرفض أقل من نقطتين', () => {
        expect(validateStopsLocations([P()]).valid).toBe(false);
    });

    it('يرفض محطة خارج السودان', () => {
        expect(validateStopsLocations([P(), D({ lat: CAIRO.lat, lng: CAIRO.lng })]).valid).toBe(false);
    });
});

describe('isInsideSudan', () => {
    it('returns true for a point inside Sudan (Khartoum)', () => {
        expect(isInsideSudan(KHARTOUM.lat, KHARTOUM.lng)).toBe(true);
    });

    it('returns false for a point outside Sudan (Cairo)', () => {
        expect(isInsideSudan(CAIRO.lat, CAIRO.lng)).toBe(false);
    });

    it('returns false when coordinates are missing', () => {
        expect(isInsideSudan(null, 32)).toBe(false);
        expect(isInsideSudan(15, undefined)).toBe(false);
    });
});

describe('validateOrderLocations', () => {
    it('accepts pickup and dropoff both inside Sudan', () => {
        const result = validateOrderLocations(KHARTOUM, { lat: 15.6, lng: 32.5 });
        expect(result.valid).toBe(true);
    });

    it('rejects a missing pickup location', () => {
        const result = validateOrderLocations(null, KHARTOUM);
        expect(result.valid).toBe(false);
        expect(result.message).toContain('الاستلام');
    });

    it('rejects a dropoff outside Sudan', () => {
        const result = validateOrderLocations(KHARTOUM, CAIRO);
        expect(result.valid).toBe(false);
        expect(result.message).toContain('خارج نطاق الخدمة');
    });
});
