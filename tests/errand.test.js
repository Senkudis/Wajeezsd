/**
 * Unit tests — utils/errand (خدمة "اشترِ لي")
 * تحقّق الإدخال + آلة حالة عرض السعر/التأكيد.
 */
const {
    validateErrandInput, canSubmitQuote, canRespondQuote, canMarkPurchased, validateQuoteAmount
} = require('../utils/errand');

const OID = '507f1f77bcf86cd799439011';
const PIN = { lat: 15.5, lng: 32.55 };

describe('validateErrandInput', () => {
    it('يقبل محلاً منسّقاً (shopId) مع أصناف', () => {
        const r = validateErrandInput({ shopId: OID, items: ['شاورما', 'عصير'] });
        expect(r.valid).toBe(true);
        expect(r.items).toEqual(['شاورما', 'عصير']);
    });

    it('يقبل محلاً مخصّصاً (اسم + دبوس) مع أصناف', () => {
        expect(validateErrandInput({ shopName: 'مطعم الركن', pickup: PIN, items: ['برجر'] }).valid).toBe(true);
    });

    it('🔒 يرفض بلا محل (لا منسّق ولا دبوس باسم)', () => {
        expect(validateErrandInput({ items: ['x'] }).valid).toBe(false);
        expect(validateErrandInput({ shopName: 'اسم بلا دبوس', items: ['x'] }).valid).toBe(false);
        expect(validateErrandInput({ pickup: PIN, items: ['x'] }).valid).toBe(false); // دبوس بلا اسم
    });

    it('🔒 يرفض بلا أصناف', () => {
        expect(validateErrandInput({ shopId: OID, items: [] }).valid).toBe(false);
        expect(validateErrandInput({ shopId: OID, items: ['', '  '] }).valid).toBe(false);
        expect(validateErrandInput({ shopId: OID }).valid).toBe(false);
    });

    it('ينظّف الأصناف (trim + إسقاط الفارغ) ويقبل نصاً مفرداً', () => {
        expect(validateErrandInput({ shopId: OID, items: [' شاي ', '', 'خبز'] }).items).toEqual(['شاي', 'خبز']);
        expect(validateErrandInput({ shopId: OID, items: 'دواء' }).items).toEqual(['دواء']);
    });

    it('🔒 يرفض shopId غير صالح الصيغة (ليس 24-hex) بلا دبوس', () => {
        expect(validateErrandInput({ shopId: 'abc', items: ['x'] }).valid).toBe(false);
    });
});

describe('validateQuoteAmount', () => {
    it('يقبل مبلغاً موجباً ويقرّبه', () => {
        expect(validateQuoteAmount(3200)).toEqual({ valid: true, amount: 3200 });
        expect(validateQuoteAmount('150.5')).toEqual({ valid: true, amount: 150.5 });
    });
    it('🔒 يرفض صفراً/سالباً/غير رقم/مبالغاً فيه', () => {
        for (const v of [0, -5, 'abc', null, undefined, 20000000]) {
            expect(validateQuoteAmount(v).valid).toBe(false);
        }
    });
});

const mk = (over = {}) => ({ orderType: 'errand', status: 'accepted', errand: { quoteStatus: 'none' }, ...over });

describe('canSubmitQuote (الكابتن)', () => {
    it('يسمح عند accepted وحالة none/quoted/declined', () => {
        expect(canSubmitQuote(mk()).ok).toBe(true);
        expect(canSubmitQuote(mk({ errand: { quoteStatus: 'quoted' } })).ok).toBe(true); // تحديث السعر
    });
    it('🔒 يمنع بعد التأكيد', () => {
        expect(canSubmitQuote(mk({ errand: { quoteStatus: 'confirmed' } })).ok).toBe(false);
    });
    it('🔒 يمنع قبل القبول', () => {
        expect(canSubmitQuote(mk({ status: 'pending' })).ok).toBe(false);
    });
    it('🔒 يمنع لغير errand', () => {
        expect(canSubmitQuote(mk({ orderType: 'delivery' })).ok).toBe(false);
    });
});

describe('canRespondQuote (العميل)', () => {
    it('يسمح فقط عند quoted', () => {
        expect(canRespondQuote(mk({ errand: { quoteStatus: 'quoted' } })).ok).toBe(true);
    });
    it('🔒 يمنع بلا سعر مطروح', () => {
        expect(canRespondQuote(mk({ errand: { quoteStatus: 'none' } })).ok).toBe(false);
        expect(canRespondQuote(mk({ errand: { quoteStatus: 'confirmed' } })).ok).toBe(false);
    });
    it('🔒 يمنع الرد على طلب أُلغي وسعره ما زال quoted (إلغاء إداري)', () => {
        expect(canRespondQuote(mk({ status: 'cancelled', errand: { quoteStatus: 'quoted' } })).ok).toBe(false);
    });
});

describe('canMarkPurchased (شرط الشراء)', () => {
    it('🔒 يمنع الشراء قبل تأكيد السعر', () => {
        expect(canMarkPurchased(mk({ errand: { quoteStatus: 'quoted' } })).ok).toBe(false);
        expect(canMarkPurchased(mk({ errand: { quoteStatus: 'none' } })).ok).toBe(false);
    });
    it('يسمح بعد التأكيد', () => {
        expect(canMarkPurchased(mk({ errand: { quoteStatus: 'confirmed' } })).ok).toBe(true);
    });
    it('لا يقيّد الطلبات غير errand', () => {
        expect(canMarkPurchased({ orderType: 'delivery' }).ok).toBe(true);
    });
});
