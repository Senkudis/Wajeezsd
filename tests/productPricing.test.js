/**
 * 🏷️ السعر الفعّال بعد العرض الظاهر.
 *
 * الخطر الحقيقي هنا ليس الحساب بل اختلاف المصدر: لو حسبت الواجهة السعر
 * المعروض وحسب الخادم سعر الطلب، لأمكن أن يُعرض عرضٌ انتهى ثم يُحصَّل —
 * أو العكس. لذلك الدالة واحدة، ويستدعيها الخادم عند بناء الطلب وعند إرسال
 * المنتجات للعرض معاً.
 */
import { describe, it, expect } from 'vitest';

const { effectivePrice, decorateProduct, validateSaleFields } = require('../utils/productPricing');
const Product = require('../models/Product');
const ShopOrder = require('../models/ShopOrder');

const AT = (iso) => new Date(iso);

describe('effectivePrice', () => {

    it('بلا عرض ⇒ السعر الأصلي ونسبة صفر', () => {
        expect(effectivePrice({ price: 1000 })).toEqual({
            price: 1000, listPrice: 1000, onSale: false, percent: 0
        });
    });

    it('عرض صالح ⇒ السعر المخفَّض والنسبة', () => {
        const r = effectivePrice({ price: 1000, salePrice: 800 });
        expect(r.price).toBe(800);
        expect(r.listPrice).toBe(1000);
        expect(r.onSale).toBe(true);
        expect(r.percent).toBe(20);
    });

    it('سعر عرض مساوٍ للأصلي ليس عرضاً — لا يُعرض «-0%»', () => {
        expect(effectivePrice({ price: 1000, salePrice: 1000 }).onSale).toBe(false);
    });

    it('سعر عرض أعلى من الأصلي يُتجاهل — لا نسبة سالبة', () => {
        const r = effectivePrice({ price: 1000, salePrice: 1500 });
        expect(r.onSale).toBe(false);
        expect(r.price).toBe(1000);
        expect(r.percent).toBe(0);
    });

    it('صفر سعرٌ صالح للعرض (مجاناً) لا قيمة فارغة', () => {
        const r = effectivePrice({ price: 500, salePrice: 0 });
        expect(r.onSale).toBe(true);
        expect(r.price).toBe(0);
        expect(r.percent).toBe(100);
    });

    it('القيم الفارغة كلها تعني «لا عرض»', () => {
        for (const v of [null, undefined, '']) {
            expect(effectivePrice({ price: 900, salePrice: v }).onSale).toBe(false);
        }
    });

    it('عرض لم يبدأ بعد لا يُطبَّق', () => {
        const p = { price: 1000, salePrice: 700, saleStartsAt: AT('2026-06-01T00:00:00Z') };
        expect(effectivePrice(p, AT('2026-05-31T23:59:00Z')).onSale).toBe(false);
        expect(effectivePrice(p, AT('2026-06-01T00:01:00Z')).onSale).toBe(true);
    });

    it('عرض انتهى لا يُطبَّق — وهذا ما يمنع تحصيل سعرٍ منتهٍ', () => {
        const p = { price: 1000, salePrice: 700, saleEndsAt: AT('2026-06-30T23:59:59Z') };
        expect(effectivePrice(p, AT('2026-06-30T12:00:00Z')).onSale).toBe(true);
        expect(effectivePrice(p, AT('2026-07-01T00:00:01Z')).onSale).toBe(false);
    });

    it('نافذة مغلقة الطرفين تُحترم من الجهتين', () => {
        const p = {
            price: 200, salePrice: 150,
            saleStartsAt: AT('2026-03-01T00:00:00Z'),
            saleEndsAt: AT('2026-03-10T00:00:00Z')
        };
        expect(effectivePrice(p, AT('2026-02-28T00:00:00Z')).price).toBe(200);
        expect(effectivePrice(p, AT('2026-03-05T00:00:00Z')).price).toBe(150);
        expect(effectivePrice(p, AT('2026-03-11T00:00:00Z')).price).toBe(200);
    });

    it('لا يرمي على مُدخل ناقص', () => {
        expect(effectivePrice(null).price).toBe(0);
        expect(effectivePrice({}).price).toBe(0);
    });
});

describe('decorateProduct', () => {
    it('يُلحق حقول العرض بلا تغيير السعر الأصلي', () => {
        const out = decorateProduct({ price: 1000, salePrice: 750, name: 'س' });
        expect(out.price).toBe(1000);           // الأصلي كما هو
        expect(out.effectivePrice).toBe(750);
        expect(out.onSale).toBe(true);
        expect(out.discountPercent).toBe(25);
    });

    it('عرض منتهٍ لا يُرسل للواجهة إطلاقاً', () => {
        const out = decorateProduct(
            { price: 1000, salePrice: 750, saleEndsAt: AT('2020-01-01T00:00:00Z') },
            AT('2026-01-01T00:00:00Z')
        );
        expect(out.onSale).toBe(false);
        expect(out.salePrice).toBeNull();
        expect(out.saleEndsAt).toBeNull();
        expect(out.effectivePrice).toBe(1000);
    });
});

describe('validateSaleFields', () => {
    it('يرفض سعر عرض لا يقلّ عن الأصلي', () => {
        expect(validateSaleFields({ salePrice: 100 }, 100).ok).toBe(false);
        expect(validateSaleFields({ salePrice: 120 }, 100).ok).toBe(false);
        expect(validateSaleFields({ salePrice: 99 }, 100).ok).toBe(true);
    });

    it('يرفض القيم غير الرقمية والسالبة', () => {
        expect(validateSaleFields({ salePrice: 'كثير' }, 100).ok).toBe(false);
        expect(validateSaleFields({ salePrice: -5 }, 100).ok).toBe(false);
    });

    it('إلغاء العرض يمسح نافذته معه', () => {
        const r = validateSaleFields({ salePrice: '' }, 100);
        expect(r.ok).toBe(true);
        expect(r.values).toEqual({ salePrice: null, saleStartsAt: null, saleEndsAt: null });
    });

    it('يرفض نهاية قبل البداية', () => {
        const r = validateSaleFields({
            salePrice: 50,
            saleStartsAt: '2026-05-10T00:00:00Z',
            saleEndsAt: '2026-05-01T00:00:00Z'
        }, 100);
        expect(r.ok).toBe(false);
    });

    it('يرفض تاريخاً غير صالح', () => {
        expect(validateSaleFields({ salePrice: 50, saleEndsAt: 'غداً' }, 100).ok).toBe(false);
    });

    it('لا يلمس الحقول غير المُرسَلة', () => {
        const r = validateSaleFields({ salePrice: 50 }, 100);
        expect(r.values).toEqual({ salePrice: 50 });
    });
});

describe('المخطّطات', () => {
    it('Product يحمل حقول العرض بقيم فارغة افتراضاً', () => {
        const p = new Product({ placeId: '507f1f77bcf86cd799439011', name: 'س', price: 10 });
        expect(p.salePrice).toBeNull();
        expect(p.saleStartsAt).toBeNull();
        expect(p.saleEndsAt).toBeNull();
    });

    it('ShopOrder يثبّت listPrice — بدونه يضيع مقدار التنازل تاريخياً', () => {
        const o = new ShopOrder({
            client: '507f1f77bcf86cd799439011',
            place:  '507f1f77bcf86cd799439012',
            items: [{ name: 'س', price: 800, listPrice: 1000, quantity: 2, subtotal: 1600 }],
            itemsTotal: 1600, totalAmount: 1600
        });
        expect(o.items[0].listPrice).toBe(1000);
        expect(o.items[0].price).toBe(800);
    });
});

describe('الخادم هو من يسعّر', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes/merchant.js'), 'utf8');

    it('بناء الطلب يستدعي effectivePrice لا product.price مباشرة', () => {
        const start = src.indexOf('Validate products & compute totals');
        const block = src.slice(start, start + 2500);
        expect(block).toContain('effectivePrice(product)');
        expect(block).toContain('pricing.price * qty');
    });

    it('تعديل المنتج بقائمة بيضاء — ratingAvg لا يُصطنع من التاجر', () => {
        expect(src).toContain('MERCHANT_EDITABLE');
        const start = src.indexOf('MERCHANT_EDITABLE');
        const list = src.slice(start, src.indexOf('];', start));
        expect(list).toContain("'salePrice'");
        expect(list).not.toContain('ratingAvg');
        expect(list).not.toContain('ratingCount');
        expect(list).not.toContain('viewsCount');
    });
});
