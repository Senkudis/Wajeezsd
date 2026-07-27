/**
 * ملخّص عروض المفاوضة المعروض للإدارة + ثابت مدة العرض.
 *
 * لماذا: العدّاد الذي تراه الإدارة يجب أن يطابق ما يراه العميل فعلاً. العرض
 * المنتهي زمنياً يبقى status='pending' في قاعدة البيانات حتى يمرّ عليه المجدول
 * كل 5 دقائق — فالاعتماد على الحالة وحدها كان سيُظهر للإدارة عروضاً ميتة.
 */
const {
    NEGOTIATION_TTL_MINUTES,
    NEGOTIATION_TTL_MS,
    summarizeNegotiations
} = require('../utils/negotiation');

const future = (min) => new Date(Date.now() + min * 60 * 1000);
const past = (min) => new Date(Date.now() - min * 60 * 1000);

describe('مدة صلاحية عرض المفاوضة', () => {
    it('عشر دقائق، والمللي ثانية مشتقّة منها لا مكتوبة مرتين', () => {
        expect(NEGOTIATION_TTL_MINUTES).toBe(10);
        expect(NEGOTIATION_TTL_MS).toBe(10 * 60 * 1000);
    });
});

describe('summarizeNegotiations', () => {
    it('بلا عروض يُرجع صفراً لا يرمي', () => {
        for (const input of [undefined, null, [], 'x']) {
            expect(summarizeNegotiations(input)).toEqual({
                count: 0, lowestPrice: null, nextExpiresAt: null
            });
        }
    });

    it('يعدّ العروض المفتوحة فقط ويُرجع أرخصها', () => {
        const s = summarizeNegotiations([
            { status: 'pending', proposedPrice: 5000, expiresAt: future(9) },
            { status: 'pending', proposedPrice: 3000, expiresAt: future(4) },
            { status: 'rejected', proposedPrice: 100, expiresAt: future(9) },
            { status: 'withdrawn', proposedPrice: 200, expiresAt: future(9) }
        ]);
        expect(s.count).toBe(2);
        expect(s.lowestPrice).toBe(3000);
    });

    it('العرض المنتهي زمنياً لا يُعدّ ولو بقيت حالته pending', () => {
        // هذه هي الحالة الحقيقية بين انتهاء العرض ومرور المجدول عليه
        const s = summarizeNegotiations([
            { status: 'pending', proposedPrice: 4000, expiresAt: past(1) },
            { status: 'pending', proposedPrice: 6000, expiresAt: future(3) }
        ]);
        expect(s.count).toBe(1);
        expect(s.lowestPrice).toBe(6000);
    });

    it('nextExpiresAt هو أقرب انتهاء بين العروض المفتوحة', () => {
        const soon = future(2);
        const s = summarizeNegotiations([
            { status: 'pending', proposedPrice: 1000, expiresAt: future(8) },
            { status: 'pending', proposedPrice: 2000, expiresAt: soon }
        ]);
        expect(s.nextExpiresAt.getTime()).toBe(soon.getTime());
    });

    it('عرض بلا expiresAt يُعتبر مفتوحاً (توافق مع سجلات قديمة)', () => {
        const s = summarizeNegotiations([{ status: 'pending', proposedPrice: 700 }]);
        expect(s.count).toBe(1);
        expect(s.lowestPrice).toBe(700);
        expect(s.nextExpiresAt).toBeNull();
    });

    it('سعر غير رقمي لا يفسد أرخص سعر', () => {
        const s = summarizeNegotiations([
            { status: 'pending', proposedPrice: null, expiresAt: future(5) },
            { status: 'pending', proposedPrice: 2500, expiresAt: future(5) }
        ]);
        expect(s.count).toBe(2);
        expect(s.lowestPrice).toBe(2500);
    });

    it('يقبل وقتاً محقوناً فلا يعتمد على ساعة الجهاز', () => {
        const now = new Date('2026-01-01T12:00:00Z');
        const s = summarizeNegotiations([
            { status: 'pending', proposedPrice: 900, expiresAt: new Date('2026-01-01T12:05:00Z') },
            { status: 'pending', proposedPrice: 800, expiresAt: new Date('2026-01-01T11:59:00Z') }
        ], now);
        expect(s.count).toBe(1);
        expect(s.lowestPrice).toBe(900);
    });
});
