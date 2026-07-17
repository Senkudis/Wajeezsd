/**
 * Unit tests — utils/promo
 *
 * يغطّي الخلل: إنشاء الطلب كان يخزّن discountAmount من العميل كما هو (حتى لكود
 * وهمي/منتهٍ) ويتخطّى فحوصات المدينة/الحد الأدنى/حد المستخدم. الآن المسار
 * يستدعي هاتين الدالتين، وهما نفساهما اللتان يستدعيهما /apply-promo.
 */
const { validatePromo, computeDiscount } = require('../utils/promo');

const USER = 'user-1';
const basePromo = {
    code: 'SAVE20', type: 'percentage', value: 20, appliesTo: 'total',
    maxDiscount: null, minOrderValue: 0, usageLimit: null, usedCount: 0,
    userUsageLimit: 1, usedBy: [], city: 'all'
};

describe('validatePromo', () => {
    const ctx = { userId: USER, userCity: 'Khartoum', fullOrderValue: 1000 };

    it('يقبل كوبوناً صالحاً', () => {
        expect(validatePromo(basePromo, ctx).ok).toBe(true);
    });

    it('🔒 يرفض كوبوناً غير موجود (كود وهمي)', () => {
        expect(validatePromo(null, ctx).ok).toBe(false);
    });

    it('🔒 يرفض عند بلوغ الحد الإجمالي للاستخدام', () => {
        const r = validatePromo({ ...basePromo, usageLimit: 5, usedCount: 5 }, ctx);
        expect(r.ok).toBe(false);
    });

    it('🔒 يرفض عند بلوغ المستخدم حدّه الشخصي', () => {
        const used = { ...basePromo, userUsageLimit: 1, usedBy: [{ user: USER }] };
        expect(validatePromo(used, ctx).ok).toBe(false);
    });

    it('يسمح لمستخدم آخر لم يبلغ حدّه', () => {
        const used = { ...basePromo, userUsageLimit: 1, usedBy: [{ user: 'someone-else' }] };
        expect(validatePromo(used, ctx).ok).toBe(true);
    });

    it('🔒 يرفض تحت الحد الأدنى لقيمة الطلب', () => {
        const r = validatePromo({ ...basePromo, minOrderValue: 5000 }, ctx);
        expect(r.ok).toBe(false);
        expect(r.error).toContain('5000');
    });

    it('🔒 يرفض كوبون مدينة أخرى', () => {
        const r = validatePromo({ ...basePromo, city: 'PortSudan' }, { ...ctx, userCity: 'Khartoum' });
        expect(r.ok).toBe(false);
    });

    it('يقبل كوبون city=all في أي مدينة', () => {
        expect(validatePromo({ ...basePromo, city: 'all' }, { ...ctx, userCity: 'PortSudan' }).ok).toBe(true);
    });

    it('يتخطّى فحص المدينة عند غياب مدينة المستخدم/المتجر (تساهل مقصود)', () => {
        // مسار ShopOrder يمرّر place.city؛ متجر قديم بلا مدينة يجب ألا يُرفض كوبونه
        expect(validatePromo({ ...basePromo, city: 'Khartoum' }, { ...ctx, userCity: undefined }).ok).toBe(true);
        expect(validatePromo({ ...basePromo, city: 'Khartoum' }, { ...ctx, userCity: '' }).ok).toBe(true);
    });
});

describe('computeDiscount', () => {
    it('نسبة مئوية على الإجمالي', () => {
        expect(computeDiscount(basePromo, { fullOrderValue: 1000 }).discount).toBe(200);
    });

    it('يحترم سقف maxDiscount', () => {
        const p = { ...basePromo, value: 50, maxDiscount: 100 };
        expect(computeDiscount(p, { fullOrderValue: 1000 }).discount).toBe(100);
    });

    it('مبلغ ثابت لا يتجاوز الأساس', () => {
        const p = { ...basePromo, type: 'fixed', value: 5000 };
        expect(computeDiscount(p, { fullOrderValue: 800 }).discount).toBe(800);
    });

    it('🔒 الخصم لا يكون سالباً ولا يتجاوز الأساس أبداً', () => {
        const p = { ...basePromo, type: 'percentage', value: 999 };
        const r = computeDiscount(p, { fullOrderValue: 1000 });
        expect(r.discount).toBeLessThanOrEqual(1000);
        expect(r.discount).toBeGreaterThanOrEqual(0);
    });

    it('نطاق products يستخدم مبلغ المنتجات', () => {
        const p = { ...basePromo, appliesTo: 'products', type: 'percentage', value: 10 };
        expect(computeDiscount(p, { productsTotal: 500, fullOrderValue: 1500 }).discount).toBe(50);
    });

    it('يرفض نطاق products بلا منتجات (يُرجع خطأ لا خصماً)', () => {
        const p = { ...basePromo, appliesTo: 'products' };
        const r = computeDiscount(p, { productsTotal: 0, fullOrderValue: 1000 });
        expect(r.discount).toBe(0);
        expect(r.error).toBeTruthy();
    });

    it('نطاق delivery يستخدم سعر التوصيل', () => {
        const p = { ...basePromo, appliesTo: 'delivery', type: 'fixed', value: 300 };
        expect(computeDiscount(p, { deliveryFee: 1000, fullOrderValue: 1000 }).discount).toBe(300);
    });

    it('🔒 سيناريو الاستغلال: كود وهمي لا ينتج خصماً (يُرفض في validate قبل الوصول هنا)', () => {
        // في المسار الفعلي: promoDoc=null ⇒ validatePromo يفشل ⇒ discount يبقى 0.
        // هنا نتحقق أن computeDiscount نفسها لا تُنتج خصماً من العدم بمدخلات صفرية.
        expect(computeDiscount(basePromo, { fullOrderValue: 0 }).discount).toBe(0);
    });
});
