/**
 * Unit tests — utils/orderEnrich
 * المصدر المشترك لإثراء الطلبات بـ timeline و eta (يُستخدم في /:id و /my-orders و my-missions).
 */
const { enrichOrder } = require('../utils/orderEnrich');

const KH = { lat: 15.5007, lng: 32.5599 };
const KH2 = { lat: 15.55, lng: 32.60 };

describe('enrichOrder', () => {
    it('يضيف timeline لكل طلب', () => {
        const o = enrichOrder({ status: 'accepted', createdAt: new Date(), acceptedAt: new Date() });
        expect(o.timeline).toBeTruthy();
        expect(o.timeline.current).toBe('accepted');
    });

    it('يضيف eta لطلب جارٍ فيه إحداثيات', () => {
        const o = enrichOrder({ status: 'accepted', pickup: KH, dropoff: KH2, createdAt: new Date() });
        expect(o.eta).toBeTruthy();
        expect(o.eta.text).toContain('دقيقة');
        expect(o.eta.distanceKm).toBeGreaterThan(0);
    });

    it('🔒 لا eta للطلبات المسلَّمة أو الملغاة', () => {
        expect(enrichOrder({ status: 'delivered', pickup: KH, dropoff: KH2 }).eta).toBeUndefined();
        expect(enrichOrder({ status: 'cancelled', pickup: KH, dropoff: KH2 }).eta).toBeUndefined();
    });

    it('لا eta عند غياب الإحداثيات (طلب متجر باسم نصي)', () => {
        const o = enrichOrder({ status: 'accepted', pickup: { address: '🏪 متجر' }, dropoff: KH2 });
        expect(o.eta).toBeUndefined();
        expect(o.timeline).toBeTruthy(); // الخط الزمني ما زال يُبنى
    });

    it('يحسب محطات إضافية في ETA لمتعدد النقاط', () => {
        const multi = enrichOrder({ status: 'accepted', pickup: KH, dropoff: KH2, isMultiStop: true, stops: [{}, {}, {}, {}] });
        const single = enrichOrder({ status: 'accepted', pickup: KH, dropoff: KH2 });
        expect(multi.eta.minutes).toBeGreaterThan(single.eta.minutes);
    });

    it('يتحمّل طلباً فارغاً/معدوماً', () => {
        expect(enrichOrder(null)).toBeNull();
        const empty = enrichOrder({});
        expect(empty.timeline).toBeTruthy();
    });
});
