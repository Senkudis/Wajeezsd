/**
 * 💰 تسعير الرحلة — مصدرٌ واحد.
 *
 * كان الحساب مكتوباً **داخل مسار إنشاء الطلب** سطوراً متتابعة لا دالّة.
 * وأيّ شاشة جديدة تحتاج السعر — تعديل المسار عند الأدمن مثلاً — كانت
 * ستنسخه. ونسختان تعنيان أن يُغيَّر رسمُ النقطة الإضافية في الإعدادات
 * فيتبعه أحدهما ولا يتبعه الآخر، فيصير للمشوار الواحد سعران بحسب من أنشأه.
 *
 * وليست فرضية: هذا المشروع وقع فيها في إنشاء طلب التوصيل حتى جُمع في
 * utils/shopDelivery.js للسبب نفسه.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { tripDistanceKm, extraStopCount, calculateTripPricing, sanitizeStops } = require('../utils/tripPricing');

const S = {
    baseFare: 1500, costPerKm: 300, extraStopFee: 250,
    maxDiscountPercent: 10, maxPriceSurgePercent: 100
};
const A = { lat: 15.60, lng: 32.53 };
const B = { lat: 15.64, lng: 32.49 };
const C = { lat: 15.67, lng: 32.45 };

describe('📏 المسافة', () => {
    it('🔑 تجمع كل القطاعات لا المسافة بين الطرفين', () => {
        // الكابتن يمرّ بالمحطات كلّها، فمسار A→B→C أطول من A→C
        const viaB = tripDistanceKm({ stops: [A, B, C] });
        const direct = tripDistanceKm({ stops: [A, C] });
        expect(viaB).toBeGreaterThan(direct);
    });

    it('وتعمل على pickup/dropoff حين لا محطات', () => {
        expect(tripDistanceKm({ pickup: A, dropoff: B })).toBeGreaterThan(0);
    });

    it('🔒 وتُعيد صفراً بلا مدخلات بدل أن ترمي', () => {
        expect(tripDistanceKm({})).toBe(0);
        expect(tripDistanceKm({ stops: [A] })).toBe(0);
    });
});

describe('🧮 النقاط الإضافية', () => {
    it('ما زاد عن محطتين', () => {
        expect(extraStopCount([A, B])).toBe(0);
        expect(extraStopCount([A, B, C])).toBe(1);
        expect(extraStopCount([A, B, C, A])).toBe(2);
        expect(extraStopCount(null)).toBe(0);
    });
});

describe('💵 التسعيرة', () => {
    it('🔑 إضافة محطة ترفع السعر — بالمسافة وبرسم النقطة', () => {
        const two = calculateTripPricing(S, { stops: [A, B] });
        const three = calculateTripPricing(S, { stops: [A, B, C] });
        expect(three.calculatedPrice).toBeGreaterThan(two.calculatedPrice);
        expect(three.extraStops).toBe(1);
    });

    it('تُقرَّب إلى أعلى مئة — والحدّان كذلك', () => {
        const p = calculateTripPricing(S, { stops: [A, B, C] });
        for (const v of [p.calculatedPrice, p.minAllowedPrice, p.maxAllowedPrice]) {
            expect(v % 100).toBe(0);
        }
    });

    it('🔒 أرضيّة لا يُنزَل عنها مهما بلغ التخفيض', () => {
        // مشوارٌ قصير جداً بخمس محطات: الأجرة + رسوم النقاط هي الحدّ
        const tiny = { lat: 15.600, lng: 32.530 };
        const p = calculateTripPricing(
            { ...S, maxDiscountPercent: 90 },
            { stops: [tiny, tiny, tiny, tiny, tiny] }
        );
        expect(p.minAllowedPrice).toBeGreaterThanOrEqual(S.baseFare + S.extraStopFee * 3);
    });

    it('والسقف يتبع نسبة الزيادة من الإعدادات', () => {
        const p = calculateTripPricing({ ...S, maxPriceSurgePercent: 50 }, { stops: [A, B] });
        expect(p.maxAllowedPrice).toBeLessThan(p.calculatedPrice * 1.6);
        expect(p.maxAllowedPrice).toBeGreaterThan(p.calculatedPrice);
    });

    it('🔒 وإعداداتٌ فارغة لا تُسقط الحساب', () => {
        const p = calculateTripPricing({}, { stops: [A, B] });
        expect(p.calculatedPrice).toBeGreaterThan(0);
    });
});

describe('🧹 تعقيم المحطات', () => {
    it('يقصّ النصوص ويُثبّت النوع', () => {
        const [s] = sanitizeStops([{ type: 'x', address: 'ش'.repeat(400), lat: '15.6', lng: '32.5' }], false);
        expect(s.type).toBe('dropoff');
        expect(s.address.length).toBe(300);
        expect(s.lat).toBe(15.6);
    });

    it('🔑 ويُصفّر التقدّم عند الإنشاء ويحفظه عند التعديل', () => {
        const raw = [{ type: 'pickup', address: 'a', lat: 1, lng: 2, done: true, doneAt: '2026-01-01' }];
        expect(sanitizeStops(raw, false)[0].done).toBe(false);
        expect(sanitizeStops(raw, true)[0].done).toBe(true);
    });
});

describe('🔗 لا أحد يحسب سعراً خارج الوحدة', () => {
    const orders = read('routes/orders.js');
    const admin = read('routes/admin/orders.js');

    it('🔑 مسار الإنشاء يستدعيها ولا يكرّر الصيغة', () => {
        expect(orders).toContain("require('../utils/tripPricing')");
        expect(orders).toContain('calculateTripPricing(settings');
        // الصيغة القديمة المكرّرة اختفت
        expect(orders).not.toContain('let calculatedPrice = base + (totalDistanceKm * costPerKm)');
    });

    it('🔑 ومسار تعديل المسار عند الأدمن يستدعي نفسها', () => {
        expect(admin).toContain("require('../../utils/tripPricing')");
        expect(admin).toContain('calculateTripPricing(settings, { stops })');
    });

    it('والمعاينة الحيّة تسعّر في الخادم لا في المتصفّح', () => {
        const page = read('public_html/admin-order-details.html');
        expect(page).toContain('/route-quote');
        // لا ثوابت تسعير في الواجهة
        expect(page).not.toContain('costPerKm *');
        expect(page).not.toContain('baseFare +');
    });
});
