/**
 * Unit tests — utils/errand (خدمة "اشترِ لي")
 * تحقّق الإدخال + آلة حالة عرض السعر/التأكيد.
 */
const {
    validateErrandInput, canSubmitQuote, canRespondQuote, canMarkPurchased, validateQuoteAmount,
    evaluateQuote, quoteTimeoutState
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

describe('evaluateQuote — السعر مقابل ميزانية العميل', () => {
    it('بلا ميزانية: لا مقارنة ولا تأكيد تلقائي مهما كان الإذن', () => {
        expect(evaluateQuote({ budget: null, autoApprove: true, amount: 5000 }))
            .toEqual({ hasBudget: false, overBudget: false, overBy: 0, autoConfirm: false });
        expect(evaluateQuote({ budget: 0, autoApprove: true, amount: 5000 }).autoConfirm).toBe(false);
    });

    it('ضمن الميزانية مع إذن مسبق ⇒ تأكيد تلقائي', () => {
        const r = evaluateQuote({ budget: 5000, autoApprove: true, amount: 4800 });
        expect(r.autoConfirm).toBe(true);
        expect(r.overBudget).toBe(false);
    });

    it('مساوٍ للميزانية بالضبط ⇒ ضمنها (الحدّ مشمول)', () => {
        expect(evaluateQuote({ budget: 5000, autoApprove: true, amount: 5000 }).autoConfirm).toBe(true);
    });

    it('🔒 فوق الميزانية ⇒ لا تأكيد تلقائي أبداً حتى مع الإذن', () => {
        // الإذن كان بمبلغٍ محدّد لا بثقة مطلقة — تجاوزه إنفاقٌ لم يوافق عليه العميل
        const r = evaluateQuote({ budget: 5000, autoApprove: true, amount: 5001 });
        expect(r.autoConfirm).toBe(false);
        expect(r.overBudget).toBe(true);
        expect(r.overBy).toBe(1);
    });

    it('ضمن الميزانية بلا إذن ⇒ يُسأل العميل كالمعتاد', () => {
        expect(evaluateQuote({ budget: 5000, autoApprove: false, amount: 4000 }).autoConfirm).toBe(false);
    });

    it('يحسب مقدار التجاوز بمنزلتين', () => {
        expect(evaluateQuote({ budget: 1000, autoApprove: false, amount: 1234.567 }).overBy).toBe(234.57);
    });

    it('مبلغ غير صالح لا يُنتج تأكيداً', () => {
        expect(evaluateQuote({ budget: 5000, autoApprove: true, amount: 0 }).autoConfirm).toBe(false);
        expect(evaluateQuote({ budget: 5000, autoApprove: true, amount: NaN }).autoConfirm).toBe(false);
    });
});

describe('quoteTimeoutState — مؤقّت الردّ على السعر', () => {
    const T0 = new Date('2026-01-01T10:00:00Z').getTime();
    const at = (min) => T0 + min * 60000;
    const base = { quotedAt: new Date(T0), reminderMin: 5, expiryMin: 20 };

    it('قبل مهلة التذكير: لا شيء', () => {
        expect(quoteTimeoutState({ ...base, now: at(4.9) })).toBe('none');
    });

    it('عند مهلة التذكير وبعدها: تذكير', () => {
        expect(quoteTimeoutState({ ...base, now: at(5) })).toBe('remind');
        expect(quoteTimeoutState({ ...base, now: at(12) })).toBe('remind');
    });

    it('🔒 لا يتكرّر التذكير بعد إرساله', () => {
        // بلا هذا يُرسَل تذكير كل دقيقة حتى انتهاء المهلة — إزعاجٌ يُفقد العميل
        expect(quoteTimeoutState({ ...base, reminderSentAt: new Date(at(5)), now: at(12) })).toBe('none');
    });

    it('عند مهلة الانتهاء: انتهاء صلاحية', () => {
        expect(quoteTimeoutState({ ...base, now: at(20) })).toBe('expire');
        expect(quoteTimeoutState({ ...base, reminderSentAt: new Date(at(5)), now: at(25) })).toBe('expire');
    });

    it('🔒 تأخّرٌ طويل (سيرفر متوقّف) ينتهي مباشرةً ولا يبدأ بتذكير', () => {
        // الانتهاء يسبق التذكير في الفحص، وإلا انتظر الطلب دورةً كاملة أخرى
        expect(quoteTimeoutState({ ...base, now: at(90) })).toBe('expire');
    });

    it('صفر يعطّل المرحلة المقابلة', () => {
        expect(quoteTimeoutState({ ...base, reminderMin: 0, now: at(10) })).toBe('none');
        expect(quoteTimeoutState({ ...base, expiryMin: 0, now: at(90) })).toBe('remind');
        expect(quoteTimeoutState({ ...base, reminderMin: 0, expiryMin: 0, now: at(999) })).toBe('none');
    });

    it('بلا quotedAt: لا شيء (لا يُلغى طلبٌ بحساب على قيمة غائبة)', () => {
        expect(quoteTimeoutState({ ...base, quotedAt: null, now: at(90) })).toBe('none');
        expect(quoteTimeoutState({ ...base, quotedAt: undefined, now: at(90) })).toBe('none');
    });
});
