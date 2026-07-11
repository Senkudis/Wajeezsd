/**
 * Unit tests — utils/geofence
 * يتحقق من حصر نطاق الخدمة داخل حدود السودان.
 */
// describe/it/expect متاحة كـ globals (globals: true في vitest.config.js)
const { isInsideSudan, validateOrderLocations } = require('../utils/geofence');

// الخرطوم تقريباً
const KHARTOUM = { lat: 15.5007, lng: 32.5599 };
// القاهرة (خارج السودان)
const CAIRO = { lat: 30.0444, lng: 31.2357 };

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
