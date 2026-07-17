/**
 * Unit tests — utils/orderTimeline
 */
const { buildTimeline } = require('../utils/orderTimeline');

const t0 = new Date('2026-07-17T10:00:00Z');
const t1 = new Date('2026-07-17T10:05:00Z');
const t2 = new Date('2026-07-17T10:20:00Z');
const t3 = new Date('2026-07-17T10:45:00Z');

describe('buildTimeline', () => {
    it('طلب معلّق: أول مرحلة فقط مُنجَزة', () => {
        const tl = buildTimeline({ status: 'pending', createdAt: t0 });
        expect(tl.current).toBe('placed');
        expect(tl.cancelled).toBe(false);
        expect(tl.steps.find(s => s.key === 'placed').done).toBe(true);
        expect(tl.steps.find(s => s.key === 'accepted').done).toBe(false);
    });

    it('طلب مقبول: المرحلة الحالية accepted', () => {
        const tl = buildTimeline({ status: 'accepted', createdAt: t0, acceptedAt: t1 });
        expect(tl.current).toBe('accepted');
        expect(tl.steps.find(s => s.key === 'accepted').at).toBe(t1);
    });

    it('طلب مُسلَّم: كل المراحل مُنجَزة والحالية delivered', () => {
        const tl = buildTimeline({
            status: 'delivered', createdAt: t0, acceptedAt: t1, pickedUpAt: t2, deliveredAt: t3
        });
        expect(tl.current).toBe('delivered');
        expect(tl.steps.every(s => s.done)).toBe(true);
    });

    it('طلب ملغى: يعرض ما تحقّق + مرحلة إلغاء نهائية', () => {
        const cancelledAt = new Date('2026-07-17T10:10:00Z');
        const tl = buildTimeline({ status: 'cancelled', createdAt: t0, acceptedAt: t1, cancelledAt });
        expect(tl.cancelled).toBe(true);
        expect(tl.current).toBe('cancelled');
        const last = tl.steps[tl.steps.length - 1];
        expect(last.key).toBe('cancelled');
        expect(last.cancelled).toBe(true);
        // لم يُستلم فلا مرحلة picked_up
        expect(tl.steps.some(s => s.key === 'picked_up')).toBe(false);
    });

    it('يتحمّل طلباً فارغاً', () => {
        const tl = buildTimeline(null);
        expect(tl.steps).toEqual([]);
    });
});
