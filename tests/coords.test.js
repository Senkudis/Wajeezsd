/**
 * Unit tests — utils/coords
 *
 * خلفية: طلبٌ حقيقي في الإنتاج (طلب متجر في بورتسودان) حُفظ بإحداثيات تسليم
 * (0, 0)، فرسمته لوحة الإدارة في خليج غينيا بينما بدا سليماً للكابتن لأن
 * فحصه `lat && lng` يتخطّى الصفر مصادفةً. هذه الاختبارات تحرس الحدّ الفاصل
 * بين «موقع» و«قيمة افتراضية لم تُملأ».
 */
const { isUsableCoord, normalizePoint } = require('../utils/coords');

describe('isUsableCoord', () => {
    it('يقبل مدن الخدمة الفعلية', () => {
        expect(isUsableCoord(15.5007, 32.5599)).toBe(true);   // الخرطوم
        expect(isUsableCoord(19.6158, 37.2164)).toBe(true);   // بورتسودان
        expect(isUsableCoord(19.621076, 37.203182)).toBe(true); // نقطة استلام حقيقية
    });

    it('🔒 يرفض (0, 0) — الحالة التي رُصدت في الإنتاج', () => {
        // إحداثيات صالحة رياضياً لكنها في المحيط الأطلسي: دائماً «لم تُملأ»
        expect(isUsableCoord(0, 0)).toBe(false);
    });

    it('يقبل صفراً واحداً مع قيمة حقيقية للآخر', () => {
        // خط الاستواء وخط غرينتش مواقع مشروعة ما لم يجتمعا
        expect(isUsableCoord(0, 32.5)).toBe(true);
        expect(isUsableCoord(15.5, 0)).toBe(true);
    });

    it('🔒 يرفض الغائب والنصّي وغير الرقمي', () => {
        for (const [a, b] of [[15.5, undefined], [15.5, null], [undefined, undefined],
                              [NaN, 32.5], ['abc', 'def'], [{}, []]]) {
            expect(isUsableCoord(a, b)).toBe(false);
        }
    });

    it('يقبل الأرقام النصّية الصالحة — الواجهات ترسلها أحياناً كنصّ', () => {
        expect(isUsableCoord('15.5007', '32.5599')).toBe(true);
    });

    it('🔒 يرفض ما خرج عن المدى الجغرافي', () => {
        expect(isUsableCoord(91, 32)).toBe(false);
        expect(isUsableCoord(15, 181)).toBe(false);
        expect(isUsableCoord(-91, -181)).toBe(false);
    });
});

describe('normalizePoint', () => {
    it('يحوّل الإحداثيات غير الصالحة إلى null صراحةً', () => {
        const r = normalizePoint({ address: 'J6C9+W3R، بورتسودان', lat: 0, lng: 0 });
        expect(r.lat).toBeNull();
        expect(r.lng).toBeNull();
    });

    it('لا يمسّ بقية الحقول', () => {
        const r = normalizePoint({ address: 'الرياض', receiverName: 'أحمد', receiverPhone: '0912', lat: 0, lng: 0 });
        expect(r.address).toBe('الرياض');
        expect(r.receiverName).toBe('أحمد');
        expect(r.receiverPhone).toBe('0912');
    });

    it('يحوّل النصّ الصالح إلى رقم', () => {
        const r = normalizePoint({ lat: '15.5', lng: '32.5' });
        expect(r.lat).toBe(15.5);
        expect(typeof r.lat).toBe('number');
    });

    it('لا ينفجر على مدخل غير كائن', () => {
        expect(normalizePoint(null)).toBeNull();
        expect(normalizePoint(undefined)).toBeUndefined();
    });
});
