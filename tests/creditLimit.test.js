import { describe, it, expect } from 'vitest';
const { resolveCreditLimit } = require('../utils/creditLimit');

describe('💳 الحد الائتماني — مصدرٌ واحد', () => {
    it('الحدّ الخاص للكابتن يغلب حدّ المدينة', () => {
        expect(resolveCreditLimit({ credit_limit: -12000 }, { defaultCreditLimit: -3000 })).toBe(-12000);
    });
    it('القيمة الافتراضية للمخطّط تعني «يتبع المدينة»', () => {
        expect(resolveCreditLimit({ credit_limit: -5000 }, { defaultCreditLimit: -3000 })).toBe(-3000);
    });
    it('حدّ المدينة صفراً قيمةٌ صالحة لا تسقط إلى ‎-5000', () => {
        expect(resolveCreditLimit({}, { defaultCreditLimit: 0 })).toBe(0);
    });
    it('بلا شيء ⇒ ‎-5000', () => {
        expect(resolveCreditLimit(null, null)).toBe(-5000);
    });
});
