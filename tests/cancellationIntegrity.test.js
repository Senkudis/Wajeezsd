/**
 * 🧾 سلامة الإلغاء — أخطاءٌ وُجدت في مراجعة دورة الطلب:
 *
 *   ١) الكوبون يُحتسب عند إنشاء الطلب ولا يعود عند إلغائه: عميلٌ استعمل
 *      كوبوناً لمرّة واحدة وألغى قبل أن يقبله أحد — خسره بلا فائدة.
 *   ٢) إلغاء طلب المتجر (من العميل ومن الإدارة) فحصٌ ثم save(): ضغطتان
 *      تمرّان كلتاهما فيُعاد المخزون مرّتين.
 *   ٣) مهمّة «٦ ساعات بلا كابتن» تُرسل الإشعارات ثم تُلغي بلا شرط: كابتنٌ
 *      يقبل في تلك الثواني يجد مهمّته ملغاة وهو في الطريق.
 *   ٤) تنازل الكابتن يُبقي مفاتيح التنبيهات الآلية وسعر البضاعة (اشترِ لي)
 *      لمن يقبل بعده.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('إعادة الكوبون', () => {
    const promoPath = require.resolve('../models/PromoCode');
    const helperPath = require.resolve('../utils/promoRelease');
    let saved, calls, present;

    beforeEach(() => {
        saved = require.cache[promoPath];
        calls = [];
        present = new Set(['o1', 's1']);   // الطلبات المسجَّلة في usedBy
        require.cache[promoPath] = {
            id: promoPath, filename: promoPath, loaded: true,
            exports: {
                updateOne: async (filter, update) => {
                    calls.push({ filter, update });
                    const id = filter['usedBy.orderId'];
                    if (!present.has(String(id))) return { modifiedCount: 0 };
                    present.delete(String(id));
                    return { modifiedCount: 1 };
                }
            }
        };
        delete require.cache[helperPath];
    });
    afterEach(() => {
        if (saved) require.cache[promoPath] = saved; else delete require.cache[promoPath];
        delete require.cache[helperPath];
    });

    it('🔑 يُنقص العدّاد ويُزيل سطر الطلب — بشرط أن يكون مسجّلاً', async () => {
        const { releasePromoUsage } = require('../utils/promoRelease');
        expect(await releasePromoUsage(['o1'])).toBe(1);
        expect(calls[0].filter).toEqual({ 'usedBy.orderId': 'o1', usedCount: { $gt: 0 } });
        expect(calls[0].update).toEqual({ $inc: { usedCount: -1 }, $pull: { usedBy: { orderId: 'o1' } } });
    });

    it('🔑 آمنٌ للتكرار: الإلغاء المزدوج لا يُنقص مرّتين', async () => {
        const { releasePromoUsage } = require('../utils/promoRelease');
        expect(await releasePromoUsage(['o1'])).toBe(1);
        expect(await releasePromoUsage(['o1'])).toBe(0);
    });

    it('يتجاهل الفارغ (طلب متجرٍ بلا توصيلٍ مرتبط)', async () => {
        const { releasePromoUsage } = require('../utils/promoRelease');
        expect(await releasePromoUsage(['s1', null, undefined])).toBe(1);
        expect(calls).toHaveLength(1);
    });

    it('فشل الإعادة لا يُفشل الإلغاء', async () => {
        require.cache[promoPath].exports.updateOne = async () => { throw new Error('db down'); };
        const { releasePromoUsage } = require('../utils/promoRelease');
        await expect(releasePromoUsage(['o1'])).resolves.toBe(0);
    });
});

describe('كل طريق إلغاءٍ يعيد الكوبون', () => {
    const orders = read('routes/orders.js');
    const admin = read('routes/admin/orders.js');
    const merchant = read('routes/merchant.js');
    const sched = read('scheduler.js');

    it('إلغاء العميل: الطلب العاديّ وطلب المتجر', () => {
        const c = orders.slice(orders.indexOf("router.put('/:id/cancel'"), orders.indexOf("router.put('/shop/:id/upload-receipt'"));
        expect(c).toContain('await releasePromoUsage([order._id])');
        expect(c).toContain('await releasePromoUsage([shopOrder._id, linkedOrder && linkedOrder._id])');
    });
    it('رفض العميل سعر البضاعة', () => {
        expect(orders).toContain('await releasePromoUsage([order._id, order.shopOrderId]);   // 🎟️');
    });
    it('الإلغاء الإداريّ (الطلب وطلب المتجر)', () => {
        expect(admin).toContain('await releasePromoUsage([order._id, order.shopOrderId])');
        expect(admin).toContain('await releasePromoUsage([shopOrder._id])');
    });
    it('رفض التاجر', () => {
        expect(merchant).toContain("releasePromoUsage([order._id, linkedDelivery && linkedDelivery._id])");
    });
    it('المُجدوِل: ٦ ساعات بلا كابتن، وانتهاء مهلة سعر البضاعة', () => {
        expect(sched.match(/await releasePromoUsage\(\[order\._id\]\)/g)).toHaveLength(2);
    });
});

describe('انتقالاتٌ ذرّية', () => {
    it('🔑 إلغاء العميل لطلب المتجر بشرط الحالة — لا فحصٌ ثم save()', () => {
        const orders = read('routes/orders.js');
        const c = orders.slice(orders.indexOf("router.put('/:id/cancel'"), orders.indexOf('// --- NORMAL ORDER CANCELLATION ---'));
        expect(c).toContain("{ _id: shopOrder._id, client: req.user._id, status: 'shop_pending' }");
        expect(c).not.toContain('await shopOrder.save()');
    });
    it('وإلغاء الإدارة لطلب المتجر', () => {
        const admin = read('routes/admin/orders.js');
        const c = admin.slice(admin.indexOf("'/shop-orders/:id/cancel-force'"), admin.indexOf("'/orders/:id/cancel-force'"));
        expect(c).toContain('ShopOrder.findOneAndUpdate(');
        expect(c).not.toContain('await shopOrder.save()');
    });
    it('🔑 مهمّة الست ساعات تُلغي بشرط «ما زال معلّقاً» قبل أيّ إشعار', () => {
        const s = read('scheduler.js');
        const loop = s.slice(s.indexOf('for (const order of staleOrders) {'));
        const guard = loop.indexOf("status: 'pending',");
        expect(guard).toBeGreaterThan(-1);
        expect(guard).toBeLessThan(loop.indexOf('negotiation_resolved'));
        expect(loop).toContain('if (!claimed.modifiedCount) {');
        expect(s).not.toContain('await Order.findByIdAndUpdate(order._id, {\n                    status: \'cancelled\'');
    });
});

describe('تنازل الكابتن', () => {
    it('🔑 من يقبل بعده يبدأ نظيفاً', () => {
        const o = read('routes/orders.js');
        const r = o.slice(o.indexOf("router.put('/:id/release'"), o.indexOf("router.put('/:id/pickup'"));
        expect(r).toContain('captainNudges: []');
        expect(r).toContain('captainAssignedAt: null');
        expect(r).toContain("'errand.quoteStatus': 'none'");
        expect(r).toContain("'errand.goodsQuote': null");
        // الشرط الذرّيّ باقٍ: قبل الاستلام وحده (لم يُشترَ شيءٌ بعد)
        expect(r).toContain("{ _id: req.params.id, captain: req.user.id, status: 'accepted' }");
    });
});
