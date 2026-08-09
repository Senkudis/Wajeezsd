/**
 * Unit tests — utils/shopDispatch (إرسال طلب المتجر للكباتن)
 *
 * الخلفية: طلب متجرٍ جُهّز ورُفع للكباتن اختفى منهم بعد ست ساعات (إلغاء
 * تلقائي)، بينما بقي عند التاجر والعميل «جاري البحث» — لأن العميل كان قد
 * دفع ثمن البضاعة أصلاً ولم يكن يجوز إلغاؤه، ولأن المزامنة لم تصل.
 */
const { canNudgeCaptains, isAwaitingCaptain, mayAutoExpire, NUDGE_COOLDOWN_MIN } =
    require('../utils/shopDispatch');

describe('mayAutoExpire — من يجوز إلغاؤه تلقائياً', () => {
    it('🔒 طلب متجر لا يُلغى مهما طال — العميل دفع والتاجر جهّز', () => {
        expect(mayAutoExpire({ orderType: 'shop' })).toBe(false);
    });

    it('🔒 طلب مرتبط بطلب متجر لا يُلغى ولو لم يُوسم بنوعه', () => {
        // شبكة أمان: وثيقة قديمة قد تحمل الرابط بلا orderType صحيح
        expect(mayAutoExpire({ orderType: 'delivery', shopOrderId: 'abc' })).toBe(false);
    });

    it('طلب توصيل عادي يجوز إلغاؤه', () => {
        expect(mayAutoExpire({ orderType: 'delivery', shopOrderId: null })).toBe(true);
    });

    it('طلب "اشترِ لي" يجوز إلغاؤه (لا بضاعة مدفوعة مسبقاً)', () => {
        expect(mayAutoExpire({ orderType: 'errand', shopOrderId: null })).toBe(true);
    });

    it('مدخل فارغ لا يُلغى', () => {
        expect(mayAutoExpire(null)).toBe(false);
        expect(mayAutoExpire(undefined)).toBe(false);
    });
});

describe('isAwaitingCaptain', () => {
    it('ينتظر كابتناً في ready_for_pickup وحدها', () => {
        expect(isAwaitingCaptain('ready_for_pickup')).toBe(true);
    });
    it('🔒 لا تذكير لطلب في حالة أخرى', () => {
        for (const s of ['shop_pending', 'shop_preparing', 'captain_assigned', 'picked_up', 'delivered', 'cancelled']) {
            expect(isAwaitingCaptain(s)).toBe(false);
        }
    });
});

describe('canNudgeCaptains — مهلة التذكير', () => {
    const T0 = new Date('2026-01-01T10:00:00Z').getTime();
    const at = (min) => T0 + min * 60000;

    it('أول تذكير مسموح دائماً', () => {
        expect(canNudgeCaptains({ lastNudgeAt: null, now: T0 }).allowed).toBe(true);
        expect(canNudgeCaptains({ lastNudgeAt: undefined, now: T0 }).allowed).toBe(true);
    });

    it('🔒 قبل انقضاء الخمس دقائق: ممنوع مع بيان المتبقّي', () => {
        const r = canNudgeCaptains({ lastNudgeAt: new Date(T0), now: at(2) });
        expect(r.allowed).toBe(false);
        expect(r.waitSec).toBe(180);   // 3 دقائق متبقّية
    });

    it('عند انقضائها بالضبط: مسموح (الحدّ مشمول)', () => {
        expect(canNudgeCaptains({ lastNudgeAt: new Date(T0), now: at(NUDGE_COOLDOWN_MIN) }).allowed).toBe(true);
    });

    it('بعدها: مسموح', () => {
        expect(canNudgeCaptains({ lastNudgeAt: new Date(T0), now: at(30) }).allowed).toBe(true);
    });

    it('🔒 المهلة الافتراضية خمس دقائق', () => {
        expect(NUDGE_COOLDOWN_MIN).toBe(5);
        expect(canNudgeCaptains({ lastNudgeAt: new Date(T0), now: at(4.9) }).allowed).toBe(false);
    });

    it('مهلة صفرية تعني بلا تقييد', () => {
        expect(canNudgeCaptains({ lastNudgeAt: new Date(T0), cooldownMin: 0, now: T0 }).allowed).toBe(true);
    });

    it('يقبل الطابع رقماً كما يقبله تاريخاً', () => {
        expect(canNudgeCaptains({ lastNudgeAt: T0, now: at(2) }).allowed).toBe(false);
        expect(canNudgeCaptains({ lastNudgeAt: T0, now: at(6) }).allowed).toBe(true);
    });

    it('طابع تالف لا يمنع التذكير (لا نحبس التاجر بقيمة فاسدة)', () => {
        expect(canNudgeCaptains({ lastNudgeAt: 'خربان', now: T0 }).allowed).toBe(true);
    });
});
