/**
 * صفحة أكواد الخصم تقرأ منتجات التاجر من GET /api/merchant/products.
 *
 *   المسار يُعيد { place, products } لا مصفوفة. كانت الصفحة تُسند الجسم
 *   كلّه إلى myProducts، فيرمي fillProductOptions عند ‎.map‎ ولا تُفتح
 *   نافذة «كود خصم جديد» ولا نافذة التعديل.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
    path.join(__dirname, '..', 'public_html', 'merchant-promos.html'), 'utf8');
const route = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'merchant.js'), 'utf8');

describe('merchant-promos: قائمة المنتجات', () => {
    it('المسار ما زال يُعيد { place, products }', () => {
        expect(route).toMatch(/res\.json\(\{\s*place,\s*products\s*\}\)/);
    });

    it('الصفحة لا تُسند الجسم الخام إلى myProducts', () => {
        expect(html).not.toMatch(/myProducts\s*=\s*prodRes\.ok\s*\?\s*await\s+prodRes\.json\(\)/);
    });

    it('الصفحة تقرأ ‎.products‎ وتقبل المصفوفة المجرّدة', () => {
        const m = html.match(/const prodData = [\s\S]*?;\s*myProducts = [\s\S]*?;/);
        expect(m).toBeTruthy();
        const run = (body) => {
            const fn = new Function('body', `
                const prodRes = { ok: true };
                let myProducts;
                ${m[0].replace('await prodRes.json()', 'body')}
                return myProducts;`);
            return fn(body);
        };
        expect(run({ place: {}, products: [{ _id: 'a' }] })).toEqual([{ _id: 'a' }]);
        expect(run([{ _id: 'b' }])).toEqual([{ _id: 'b' }]);
        expect(run({})).toEqual([]);
        expect(run(null)).toEqual([]);
    });
});
