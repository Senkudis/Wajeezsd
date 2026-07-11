/**
 * Unit tests — utils/phoneNormalizer
 * يتحقق من توحيد كل صيغ الأرقام السودانية إلى 249XXXXXXXXX.
 */
// describe/it/expect متاحة كـ globals (globals: true في vitest.config.js)
const { normalizePhone } = require('../utils/phoneNormalizer');

describe('normalizePhone', () => {
    it('returns null for empty/falsy input', () => {
        expect(normalizePhone(null)).toBeNull();
        expect(normalizePhone(undefined)).toBeNull();
        expect(normalizePhone('')).toBeNull();
    });

    it('keeps an already-correct 249 number unchanged', () => {
        expect(normalizePhone('249912345678')).toBe('249912345678');
    });

    it('converts local 09... format to 249...', () => {
        expect(normalizePhone('0912345678')).toBe('249912345678');
    });

    it('fixes the common 2490... typo', () => {
        expect(normalizePhone('2490912345678')).toBe('249912345678');
    });

    it('adds prefix to a 9-digit number without prefix', () => {
        expect(normalizePhone('912345678')).toBe('249912345678');
    });

    it('strips non-digit characters before normalizing', () => {
        expect(normalizePhone('+249 91 234 5678')).toBe('249912345678');
        expect(normalizePhone('091-234-5678')).toBe('249912345678');
    });

    it('accepts numeric input as well as strings', () => {
        expect(normalizePhone(912345678)).toBe('249912345678');
    });
});
