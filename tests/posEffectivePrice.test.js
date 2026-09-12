/**
 * 💸 نقطة البيع كانت تبيع بالسعر الأصلي رغم سريان التخفيض.
 *
 * `pos/sale` كان يحسب `product.price` الخام، بينما طلب التطبيق يمرّ على
 * `effectivePrice`. أي أن الصنف نفسه له سعران في اللحظة نفسها: الزبون في
 * المحل يدفع أكثر ممّا يدفعه عميل التطبيق. والشاشة كانت تعرض السعر الأصلي
 * كذلك، فلا الكاشير ولا الزبون يعرف أن ثمّة تخفيضاً.
 *
 * وسبب الافتراق أن قاعدة «هل العرض سارٍ؟» كانت مكتوبةً ثلاث مرّات: الخادم،
 * وصفحة المنتجات، ولا شيء في نقطة البيع. صارت مصدراً واحداً في كل جهة.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const readPub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public_html', f), 'utf8');

const erp = fs.readFileSync(path.join(__dirname, '..', 'routes', 'merchant-erp.js'), 'utf8');
const pos = readPub('merchant-pos.html');
const productsPage = readPub('merchant-products.html');
const clientMod = readPub('js/product-price.js');
const { effectivePrice } = require('../utils/productPricing');

describe('الخادم يحصّل السعر الفعّال', () => {
    it('pos/sale يستعمل effectivePrice لا price الخام', () => {
        const i = erp.indexOf("router.post('/pos/sale'");
        const blk = erp.slice(i, i + 2500);
        expect(blk).toContain('const eff = effectivePrice(product);');
        expect(blk).toContain('const subtotal = eff.price * qty;');
        expect(blk).toContain('price: eff.price');
        expect(blk).not.toContain('product.price * qty');
    });

    it('ومن نفس الوحدة التي يستعملها طلب التطبيق', () => {
        expect(erp).toContain("require('../utils/productPricing')");
    });

    it('الفاتورة تحفظ السعر المعلن عند التخفيض — وإلا لم يُعرف سببه لاحقاً', () => {
        expect(erp).toContain('listPrice: eff.onSale ? eff.listPrice : undefined');
        const model = fs.readFileSync(path.join(__dirname, '..', 'models', 'PosSale.js'), 'utf8');
        expect(model).toContain('listPrice: { type: Number, default: null }');
    });
});

describe('شاشة نقطة البيع تعرض ما يُحصَّل', () => {
    it('السعر والمجموع وسطر الفاتورة كلّها بالسعر الفعّال', () => {
        expect(pos).toContain('function unitPrice(p)');
        expect(pos).toContain('total += unitPrice(p) * qty');
        expect(pos).toContain('${fmt(unitPrice(p) * qty)}');
        expect(pos).not.toMatch(/total \+= p\.price \* qty/);
    });

    it('والسعر المعلن مشطوباً بجانبه — الكاشير يرى أن الخصم مقصود', () => {
        expect(pos).toContain('class="p-was"');
        expect(pos).toContain('function onSale(p)');
    });

    it('وتسقط بأمان لو تعذّر تحميل الوحدة المشتركة', () => {
        expect(pos).toContain('window.ProductPrice ? ProductPrice.priceOf(p) : Number(p.price) || 0');
    });
});

describe('قاعدةٌ واحدة لا ثلاث نسخ', () => {
    it('الوحدة محمّلة في نقطة البيع وصفحة المنتجات', () => {
        for (const p of [pos, productsPage]) {
            expect(p).toMatch(/<script src="js\/product-price\.js[^"]*"><\/script>/);
        }
    });

    it('صفحة المنتجات لم تعد تكتب الشروط بيدها', () => {
        expect(productsPage).toContain('ProductPrice.effective(p).onSale');
        expect(productsPage).not.toContain('if (p.saleStartsAt && now < new Date');
    });

    it('نسخة الواجهة تطابق الخادم في الحالات الحدّية', () => {
        // نُقيّم ملف الواجهة على window صوري ونقارن بالخادم
        const sandbox = { window: {} };
        new Function('window', clientMod).call(sandbox, sandbox.window);
        const client = sandbox.window.ProductPrice;

        const now = new Date('2026-06-15T12:00:00Z');
        const cases = [
            { price: 1000, salePrice: 800 },                                      // تخفيض سارٍ
            { price: 1000, salePrice: null },                                     // لا تخفيض
            { price: 1000, salePrice: '' },                                       // فارغ
            { price: 1000, salePrice: 1000 },                                     // مساوٍ ⇒ ليس تخفيضاً
            { price: 1000, salePrice: 1200 },                                     // أعلى ⇒ ليس تخفيضاً
            { price: 1000, salePrice: 0 },                                        // صفر تخفيضٌ صالح
            { price: 1000, salePrice: 800, saleStartsAt: '2026-07-01T00:00:00Z' },// مجدول
            { price: 1000, salePrice: 800, saleEndsAt: '2026-01-01T00:00:00Z' },  // منتهٍ
            { price: 1000, salePrice: 800, saleStartsAt: '2026-01-01T00:00:00Z',
              saleEndsAt: '2026-12-01T00:00:00Z' },                               // داخل النافذة
            { price: 0, salePrice: null }                                         // سعر صفر
        ];
        for (const c of cases) {
            const a = effectivePrice(c, now);
            const b = client.effective(c, now);
            expect({ ...b }).toEqual({ ...a });
        }
    });
});
