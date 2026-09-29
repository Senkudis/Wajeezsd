/**
 * 🛒 طلب المتجر في الخادم: حدود سعر التوصيل، والكوبون محجوزٌ ذرّياً.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { shopDeliveryLimits } = require('../utils/shopDeliveryLimits');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** دالة الصفحة نفسها، مُشغَّلةً في سياقٍ معزول — المرجع الذي يجب أن يطابقه الخادم */
function pageLimits(settings, shop, dest) {
    const html = read('public_html/shop-detail.html');
    const grab = (sig) => {
        const i = html.indexOf(sig);
        let depth = 0, j = html.indexOf('{', i);
        for (let k = j; k < html.length; k++) {
            if (html[k] === '{') depth++;
            else if (html[k] === '}' && --depth === 0) return html.slice(i, k + 1);
        }
        throw new Error('not found ' + sig);
    };
    const ctx = { pricingConfig: settings, shopData: shop ? { location: shop } : null, _chosenCoords: null, Math };
    vm.createContext(ctx);
    vm.runInContext(grab('function calculateDistance(') + '\n' + grab('function getShopDeliveryLimits('), ctx);
    return ctx.getShopDeliveryLimits(dest && dest.lat, dest && dest.lng);
}

describe('حدود سعر التوصيل', () => {
    const S = { baseFare: 1000, costPerKm: 300, maxDiscountPercent: 10, maxPriceSurgePercent: 200 };
    const shop = { lat: 15.60, lng: 32.50 };

    it('🔑 مطابقةٌ للصفحة حرفاً بحرف — وإلا قبلت الصفحة ما يرفضه الخادم', () => {
        for (const dest of [{ lat: 15.61, lng: 32.51 }, { lat: 15.70, lng: 32.55 }, { lat: 15.6001, lng: 32.5001 }]) {
            const a = shopDeliveryLimits(S, shop, dest);
            const b = pageLimits(S, shop, dest);
            expect(a.minAllowed, JSON.stringify(dest)).toBe(b.minAllowed);
            expect(a.maxAllowed).toBe(b.maxAllowed);
            expect(a.estimated).toBe(b.estimated);
        }
    });
    it('بلا موقع تسليم: الأجرة الأساسية أرضيّة', () => {
        expect(shopDeliveryLimits(S, shop, { lat: null, lng: null })).toMatchObject({ minAllowed: 1000, maxAllowed: 1000000 });
    });
    it('🔑 الخادم يرفض ما تحت الحدّ ويسمّي الخانة', () => {
        const m = read('routes/merchant.js');
        const r = m.slice(m.indexOf("router.post('/shop/:placeId/order'"));
        expect(r).toContain('shopDeliveryLimits(settings, place.location, dropoff)');
        expect(r).toContain("field: 'deliveryFee', minAllowed: lim.minAllowed");
        expect(read('public_html/shop-detail.html')).toContain("deliveryFee: 'deliveryFee', promoCode: 'promoCodeInput'");
    });
});

describe('الكوبون في طلب المتجر', () => {
    const m = read('routes/merchant.js');
    const r = m.slice(m.indexOf("router.post('/shop/:placeId/order'"), m.indexOf('// Notify the merchant', m.indexOf("router.post('/shop/:placeId/order'")));

    it('🔑 يُحجز ذرّياً قبل إنشاء الطلب — الحدّ العام وحدّ المستخدم في شرط التحديث', () => {
        expect(r).toContain("{ $expr: { $lt: ['$usedCount', '$usageLimit'] } }");
        expect(r).toContain("cond: { $eq: ['$$u.user', req.user._id] }");
        expect(r.indexOf('PromoCode.findOneAndUpdate(')).toBeLessThan(r.indexOf('ShopOrder.create('));
        expect(r).toContain("field: 'promoCode'");
    });
    it('لا تسجيلٌ ثانٍ بعد الإنشاء (كان $inc بلا شرط)', () => {
        expect(r).not.toMatch(/PromoCode\.findByIdAndUpdate\(promoDoc\._id,\s*\{\s*\$inc/);
    });
    it('🔑 يعود الكوبون إن فشل المخزون أو الإنشاء بعد الحجز', () => {
        expect((r.match(/releasePromoUsage\(\[orderId\]\)/g) || []).length).toBe(2);
        expect(r).toContain('_id: orderId,');
    });
});
