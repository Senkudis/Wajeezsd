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
    isOfferOpen,
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

describe('canRestoreOffer — استرجاع عرض فات العميل', () => {
    const { canRestoreOffer, NEGOTIATION_RESTORE_WINDOW_MS } = require('../utils/negotiation.js');
    const now = Date.parse('2026-10-27T12:00:00Z');
    const ago = (ms) => new Date(now - ms);

    it('عرض انتهى قبل دقائق يُسترجع', () => {
        expect(canRestoreOffer({ status: 'expired', expiresAt: ago(5 * 60 * 1000) }, now)).toEqual({ ok: true });
    });

    it('المنتهي زمنياً ولم يمرّ عليه المجدول (ما زال pending) يُسترجع', () => {
        expect(canRestoreOffer({ status: 'pending', expiresAt: ago(60 * 1000) }, now).ok).toBe(true);
    });

    it('العرض الساري لا يُسترجع — يُقبل مباشرة', () => {
        expect(canRestoreOffer({ status: 'pending', expiresAt: new Date(now + 60 * 1000) }, now).reason).toBe('still_open');
    });

    it('بعد نافذة الاسترجاع يُرفض', () => {
        expect(canRestoreOffer({ status: 'expired', expiresAt: ago(NEGOTIATION_RESTORE_WINDOW_MS + 1000) }, now).reason).toBe('too_old');
    });

    it('المرفوض والمسحوب والمقبول لا تُسترجع', () => {
        for (const status of ['rejected', 'withdrawn', 'accepted']) {
            expect(canRestoreOffer({ status, expiresAt: ago(60 * 1000) }, now).reason).toBe('not_expired');
        }
    });

    it('بلا عرض أو بلا تاريخ انتهاء', () => {
        expect(canRestoreOffer(null, now).reason).toBe('not_found');
        expect(canRestoreOffer({ status: 'expired' }, now).reason).toBe('too_old');
    });
});

describe('isOfferOpen', () => {
    it('المعلّق الساري مفتوح، والمنتهي زمنياً مغلق ولو بقي pending', () => {
        expect(isOfferOpen({ status: 'pending', expiresAt: future(3) })).toBe(true);
        expect(isOfferOpen({ status: 'pending', expiresAt: past(1) })).toBe(false);
    });
    it('غير المعلّق مغلق، وبلا تاريخ انتهاء يُعتمد على الحالة', () => {
        expect(isOfferOpen({ status: 'expired', expiresAt: future(3) })).toBe(false);
        expect(isOfferOpen({ status: 'rejected' })).toBe(false);
        expect(isOfferOpen({ status: 'pending' })).toBe(true);
        expect(isOfferOpen(null)).toBe(false);
    });
});
