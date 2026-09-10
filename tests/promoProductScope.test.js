/**
 * 📦 حصر الكوبون بمنتجات، وشرط الكمية، وعرض «اشترِ N خذ M».
 *
 * الفرق الجوهري عن حصر المتاجر: حصرُ المتجر يقيّد **أين** يعمل الكود،
 * وحصرُ المنتج يقيّد **على ماذا يُحسب**. لولا ذلك لكان «خصم ٥٠٪ على العصير»
 * يخصم نصف قيمة الوجبات متى وُجد عصيرٌ في السلة — وهو الخطأ الذي تحرسه
 * أغلب الاختبارات هنا.
 *
 * والتوافق الخلفي شرطٌ صريح: كوبونات قائمة بلا products وبلا items يجب أن
 * تتصرّف حرفياً كما كانت.
 */
import { describe, it, expect } from 'vitest';

const {
    validatePromo, computeDiscount,
    eligibleLines, totalQuantity, linesTotal, computeBogoDiscount
} = require('../utils/promo');
const PromoCode = require('../models/PromoCode');

const JUICE = '507f1f77bcf86cd799430001';
const MEAL  = '507f1f77bcf86cd799430002';
const CAKE  = '507f1f77bcf86cd799430003';

const ctx = (over = {}) => ({
    userId: 'u1', userCity: 'Khartoum', fullOrderValue: 10000, placeId: 'pl1', ...over
});
const base = { usedBy: [], userUsageLimit: 5, city: 'all', appliesTo: 'products' };

describe('eligibleLines — أي الأسطر يشملها الكود', () => {
    const items = [
        { productId: JUICE, price: 1000, quantity: 2 },
        { productId: MEAL,  price: 5000, quantity: 1 }
    ];

    it('قائمة فارغة ⇒ كل الأسطر (السلوك القديم)', () => {
        expect(eligibleLines({ products: [] }, items)).toHaveLength(2);
        expect(eligibleLines({}, items)).toHaveLength(2);
    });

    it('قائمة محدّدة ⇒ الأسطر المذكورة وحدها', () => {
        const out = eligibleLines({ products: [JUICE] }, items);
        expect(out).toHaveLength(1);
        expect(out[0].productId).toBe(JUICE);
    });

    it('يقبل معرّفات ككائنات مأهولة (populate)', () => {
        const out = eligibleLines({ products: [{ _id: JUICE }] }, items);
        expect(out).toHaveLength(1);
    });

    it('بلا أسطر لا يرمي', () => {
        expect(eligibleLines({ products: [JUICE] }, undefined)).toEqual([]);
    });

    it('totalQuantity و linesTotal يحسبان المؤهَّل', () => {
        const only = eligibleLines({ products: [JUICE] }, items);
        expect(totalQuantity(only)).toBe(2);
        expect(linesTotal(only)).toBe(2000);
    });
});

describe('حصر المنتجات يغيّر أساس الحساب', () => {
    const items = [
        { productId: JUICE, price: 1000, quantity: 2 },   // 2000
        { productId: MEAL,  price: 5000, quantity: 1 }    // 5000
    ];
    const promo = { ...base, type: 'percentage', value: 50, products: [JUICE] };

    it('الخصم يُحسب من أسطر المنتج المحصور وحدها', () => {
        const { discount } = computeDiscount(promo, { productsTotal: 7000, items });
        expect(discount).toBe(1000); // ٥٠٪ من ٢٠٠٠ لا من ٧٠٠٠
    });

    it('بلا حصر يبقى الأساس إجمالي المنتجات — التوافق الخلفي', () => {
        const open = { ...base, type: 'percentage', value: 50 };
        expect(computeDiscount(open, { productsTotal: 7000, items }).discount).toBe(3500);
        // ونفس النتيجة بلا items إطلاقاً (نداءات قديمة)
        expect(computeDiscount(open, { productsTotal: 7000 }).discount).toBe(3500);
    });

    it('مبلغ ثابت لا يتجاوز قيمة الأسطر المشمولة', () => {
        const fixed = { ...base, type: 'fixed', value: 9000, products: [JUICE] };
        expect(computeDiscount(fixed, { productsTotal: 7000, items }).discount).toBe(2000);
    });

    it('يُرفض إذا لم يكن أيٌّ من منتجاته في الطلب', () => {
        const r = validatePromo({ ...base, products: [CAKE] }, ctx({ items }));
        expect(r.ok).toBe(false);
        expect(r.error).toContain('غير موجودة');
    });

    it('يُرفض على طلبٍ بلا أسطر معروفة — كحصر المتاجر تماماً', () => {
        const r = validatePromo({ ...base, products: [JUICE] }, ctx());
        expect(r.ok).toBe(false);
    });

    it('يمرّ إذا وُجد منتجٌ مشمول', () => {
        expect(validatePromo({ ...base, products: [JUICE] }, ctx({ items })).ok).toBe(true);
    });
});

describe('الحد الأدنى للكمية', () => {
    const items = [
        { productId: JUICE, price: 1000, quantity: 2 },
        { productId: MEAL,  price: 5000, quantity: 3 }
    ];

    it('يُقاس على المشمول لا على السلة كلها', () => {
        // ٣ عصائر مطلوبة، في السلة عصيران فقط (وإن كان مجموع السلة ٥ قطع)
        const p = { ...base, type: 'percentage', value: 10, products: [JUICE], minQuantity: 3 };
        const r = validatePromo(p, ctx({ items }));
        expect(r.ok).toBe(false);
        expect(r.error).toContain('3');
    });

    it('يمرّ عند بلوغ الحد', () => {
        const p = { ...base, type: 'percentage', value: 10, products: [JUICE], minQuantity: 2 };
        expect(validatePromo(p, ctx({ items })).ok).toBe(true);
    });

    it('بلا حصر منتجات يُقاس على كل السلة', () => {
        const p = { ...base, type: 'percentage', value: 10, minQuantity: 5 };
        expect(validatePromo(p, ctx({ items })).ok).toBe(true);
        expect(validatePromo({ ...p, minQuantity: 6 }, ctx({ items })).ok).toBe(false);
    });

    it('صفر يعني بلا شرط — ولا يتطلّب أسطراً', () => {
        const p = { ...base, type: 'percentage', value: 10, minQuantity: 0 };
        expect(validatePromo(p, ctx()).ok).toBe(true);
    });
});

describe('عرض «اشترِ N واحصل على M مجاناً»', () => {
    const promo = {
        ...base, type: 'bogo', value: 0,
        bogo: { buyQuantity: 2, freeQuantity: 1 }   // مجموعة = 3
    };

    it('يمجّن الأرخص لا الأغلى — وإلا صار باب استغلال', () => {
        const items = [{ productId: JUICE, price: 1000, quantity: 2 },
                       { productId: MEAL,  price: 5000, quantity: 1 }];
        // ٣ قطع = مجموعة واحدة ⇒ قطعة مجانية = الأرخص (١٠٠٠)
        expect(computeDiscount(promo, { items }).discount).toBe(1000);
    });

    it('يتطلّب N+M قطعة لا N — «اشترِ ٢ خذ ١» تعني ٣ في السلة', () => {
        const two = [{ productId: JUICE, price: 1000, quantity: 2 }];
        expect(validatePromo(promo, ctx({ items: two })).ok).toBe(false);
        const three = [{ productId: JUICE, price: 1000, quantity: 3 }];
        expect(validatePromo(promo, ctx({ items: three })).ok).toBe(true);
    });

    it('يتكرّر بعدد المجموعات الكاملة', () => {
        const six = [{ productId: JUICE, price: 500, quantity: 6 }];
        expect(computeBogoDiscount(promo, six)).toBe(1000);  // مجموعتان × ١
        const seven = [{ productId: JUICE, price: 500, quantity: 7 }];
        expect(computeBogoDiscount(promo, seven)).toBe(1000); // ما زال مجموعتين
    });

    it('«اشترِ ٣ خذ ٢» يمجّن اثنتين لكل خمس قطع', () => {
        const p = { ...promo, bogo: { buyQuantity: 3, freeQuantity: 2 } };
        const ten = [{ productId: JUICE, price: 100, quantity: 10 }];
        expect(computeBogoDiscount(p, ten)).toBe(400); // مجموعتان × ٢ قطعة
    });

    it('يحترم حصر المنتجات — لا يمجّن من خارج العرض', () => {
        const p = { ...promo, products: [JUICE] };
        const items = [{ productId: JUICE, price: 1000, quantity: 3 },
                       { productId: CAKE,  price: 50,   quantity: 5 }];
        // الكيك أرخص لكنه غير مشمول ⇒ المجاني عصير بـ١٠٠٠
        expect(computeDiscount(p, { items }).discount).toBe(1000);
    });

    it('لا يتأثّر بـ value أو maxDiscount إطلاقاً', () => {
        const p = { ...promo, value: 99, maxDiscount: 1 };
        const items = [{ productId: JUICE, price: 700, quantity: 3 }];
        expect(computeDiscount(p, { items }).discount).toBe(700);
    });

    it('نطاقه دائماً products — الخصم من جيب التاجر لا من التوصيل', () => {
        const items = [{ productId: JUICE, price: 700, quantity: 3 }];
        expect(computeDiscount(promo, { items }).scope).toBe('products');
    });

    it('كمية غير كافية ⇒ صفر بلا رمي', () => {
        expect(computeBogoDiscount(promo, [{ productId: JUICE, price: 10, quantity: 1 }])).toBe(0);
        expect(computeBogoDiscount(promo, [])).toBe(0);
        expect(computeBogoDiscount(promo, undefined)).toBe(0);
    });

    it('يُرفض على طلبٍ بلا أسطر بدل أن يُنتج صفراً صامتاً', () => {
        const r = validatePromo(promo, ctx());
        expect(r.ok).toBe(false);
    });
});

describe('مخطّط PromoCode', () => {
    it('يقبل النوع bogo', () => {
        const doc = new PromoCode({
            code: 'X', type: 'bogo', value: 0, validUntil: new Date(Date.now() + 86400000)
        });
        expect(doc.validateSync()).toBeUndefined();
    });

    it('يرفض نوعاً مجهولاً', () => {
        const doc = new PromoCode({
            code: 'X', type: 'buy2', value: 0, validUntil: new Date(Date.now() + 86400000)
        });
        expect(doc.validateSync()?.errors?.type).toBeDefined();
    });

    it('القيم الافتراضية لا تغيّر سلوك كوبون قائم', () => {
        const doc = new PromoCode({
            code: 'X', type: 'fixed', value: 100, validUntil: new Date(Date.now() + 86400000)
        });
        expect(doc.products).toHaveLength(0);
        expect(doc.minQuantity).toBe(0);
    });
});
