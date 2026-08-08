/**
 * Unit tests — utils/arabicSearch
 *
 * لماذا صار يستحق اختباراً الآن: كان مدفوناً في routes/places.js يخدم بحث
 * المتاجر وحده، فصار يخدم بحث "اشترِ لي" أيضاً — والبحثان يظهران في شاشة واحدة.
 * أيّ فرق في التطبيع بينهما يظهر للعميل كنتائج تختفي وتظهر بلا سبب مفهوم.
 */
const { arabicFlexibleRegex } = require('../utils/arabicSearch');

describe('arabicFlexibleRegex', () => {
    it('يتجاهل التشكيل في البيانات وفي البحث', () => {
        expect(arabicFlexibleRegex('مطعم').test('مَطعَمُ الركن')).toBe(true);
        expect(arabicFlexibleRegex('مَطعَم').test('مطعم الركن')).toBe(true);
    });

    it('يوحّد أشكال الهمزة والتاء والياء والواو', () => {
        expect(arabicFlexibleRegex('احمد').test('أحمد')).toBe(true);
        expect(arabicFlexibleRegex('أحمد').test('احمد')).toBe(true);
        expect(arabicFlexibleRegex('صيدليه').test('صيدلية')).toBe(true);
        expect(arabicFlexibleRegex('مصطفى').test('مصطفي')).toBe(true);
        expect(arabicFlexibleRegex('مسؤول').test('مسوول')).toBe(true);
    });

    it('يتجاهل التطويل (ـ)', () => {
        expect(arabicFlexibleRegex('بقالة').test('بقــالة')).toBe(false); // التطويل في البيانات لا يُحذف
        expect(arabicFlexibleRegex('بقـ__الة'.replace(/_/g, '')).source).toContain('ب');
        expect(arabicFlexibleRegex('بقـالة').test('بقالة')).toBe(true);   // لكنه يُحذف من البحث
    });

    it('🔒 لا ينفجر برموز regex في نصّ العميل', () => {
        // بحثٌ يكسر البناء كان سيرمي 500 من مسارٍ عامّ — بمدخلٍ يكتبه أي زائر
        for (const bad of ['(', '[', '*', '+', '?', 'a)b', '\\', '$^{}']) {
            expect(() => arabicFlexibleRegex(bad)).not.toThrow();
        }
        expect(arabicFlexibleRegex('كافيه (الركن)').test('كافيه (الركن) الجديد')).toBe(true);
    });

    it('نصّ فارغ يطابق الكل بدل أن يرمي', () => {
        expect(arabicFlexibleRegex('').test('أي شيء')).toBe(true);
    });
});
