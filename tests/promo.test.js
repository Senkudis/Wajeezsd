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

/**
 * 🏪 حصر الكوبون بمتاجر بعينها.
 *
 * القاعدة: `places` فارغة = كل المتاجر (السلوك القديم، فالكوبونات القائمة
 * تبقى عاملة بلا ترحيل). غير فارغة = قائمة بيضاء صارمة، ويسقط معها الكوبون
 * عن طلبات التوصيل العادية لأنها بلا متجر تُطابَق به.
 *
 * الفحص يعيش في validatePromo وحدها لا في المسارات الثلاثة، فنسخةٌ تُنسى في
 * أحدها تعني كوبوناً «محصوراً» يمرّ من الباب الخلفي.
 */
const PLACE_A = '507f1f77bcf86cd799439011';
const PLACE_B = '507f1f77bcf86cd799439012';

describe('validatePromo — حصر المتاجر', () => {
    const ctx = { userId: USER, userCity: 'Khartoum', fullOrderValue: 1000 };

    it('بلا حصر: يعمل في أي متجر وبلا متجر إطلاقاً', () => {
        expect(validatePromo(basePromo, ctx).ok).toBe(true);
        expect(validatePromo(basePromo, { ...ctx, placeId: PLACE_A }).ok).toBe(true);
        expect(validatePromo({ ...basePromo, places: [] }, ctx).ok).toBe(true);
    });

    it('محصور: يقبل المتجر المدرَج', () => {
        const promo = { ...basePromo, places: [PLACE_A, PLACE_B] };
        expect(validatePromo(promo, { ...ctx, placeId: PLACE_A }).ok).toBe(true);
        expect(validatePromo(promo, { ...ctx, placeId: PLACE_B }).ok).toBe(true);
    });

    it('🔒 محصور: يرفض متجراً غير مدرَج', () => {
        const r = validatePromo({ ...basePromo, places: [PLACE_A] }, { ...ctx, placeId: PLACE_B });
        expect(r.ok).toBe(false);
        expect(r.error).toContain('هذا المتجر');
    });

    it('🔒 محصور: يرفض طلباً بلا متجر (توصيل عادي)', () => {
        const r = validatePromo({ ...basePromo, places: [PLACE_A] }, ctx);
        expect(r.ok).toBe(false);
        expect(r.error).toContain('متاجر محدّدة');
    });

    it('يطابق المعرّف نصّاً — ObjectId مقابل string لا يكسر المقارنة', () => {
        const asObjectIdLike = { _id: PLACE_A, toString: () => PLACE_A };
        const promo = { ...basePromo, places: [asObjectIdLike] };
        expect(validatePromo(promo, { ...ctx, placeId: PLACE_A }).ok).toBe(true);
    });

    it('يقبل المتاجر المُعبّأة (populate) لا المعرّفات وحدها', () => {
        // لوحة الإدارة تجلب الكوبونات بـ populate('places','name')، فقد يصل
        // المستند كاملاً بدل المعرّف
        const promo = { ...basePromo, places: [{ _id: PLACE_A, name: 'متجر' }] };
        expect(validatePromo(promo, { ...ctx, placeId: PLACE_A }).ok).toBe(true);
        expect(validatePromo(promo, { ...ctx, placeId: PLACE_B }).ok).toBe(false);
    });

    it('places بقيمة غير مصفوفة تُعامَل كـ«بلا حصر» لا كخطأ', () => {
        for (const bad of [null, undefined, 'x', 5, {}]) {
            expect(validatePromo({ ...basePromo, places: bad }, ctx).ok).toBe(true);
        }
    });
});

describe('🔗 المسارات الثلاثة تمرّر placeId', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

    it('طلب المتجر يمرّر معرّف المتجر', () => {
        expect(read('routes/merchant.js')).toContain('placeId: place._id');
    });

    it('إنشاء الطلب يمرّر shopId', () => {
        expect(read('routes/orders.js')).toContain('placeId: shopId || null');
    });

    it('المعاينة تمرّره أيضاً — وإلا أخبرنا العميل بصلاحية ثم رفضناها عند الإتمام', () => {
        expect(read('routes/orders.js')).toContain('placeId: placeId || null');
    });

    it('واجهة المتجر ترسل placeId مع طلب المعاينة', () => {
        expect(read('public_html/shop-detail.html')).toContain('deliveryFee, placeId');
    });
});
