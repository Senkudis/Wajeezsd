/**
 * نموذج خصم المنتج عند التاجر (merchant-products.html).
 *
 *   ١) التواريخ تُرسل بمنطقتها: datetime-local بلا منطقة زمنية، وكان يُرسل
 *      كما هو («2026-10-06T09:40») فيقرؤه الخادم بتوقيته (UTC) — فيبدأ
 *      العرض بعد ساعتين من وقته في السودان ولا يراه العميل.
 *   ٢) تغيير السعر الأصلي يعيد حساب المعاينة: كانت تبقى رسالة «يجب أن يكون
 *      أقل من السعر الأصلي» بعد رفع السعر.
 *   ٣) نسبة الخصم والسعر بعد الخصم مترابطان، والمُرسَل هو السعر وحده.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'public_html', 'merchant-products.html'), 'utf8');

describe('نموذج خصم المنتج', () => {
    it('تواريخ العرض تُحوَّل إلى ISO بمنطقتها قبل الإرسال', () => {
        expect(html).toMatch(/saleStartsAt:\s*_localToIso\(/);
        expect(html).toMatch(/saleEndsAt:\s*_localToIso\(/);
        const fn = html.match(/function _localToIso\(v\) \{[\s\S]*?\n    \}/);
        expect(fn).toBeTruthy();
        // بتوقيت السودان (UTC+2): 09:40 المحلية = 07:40Z
        const ctx = { process: { env: { TZ: 'Africa/Khartoum' } } };
        vm.runInNewContext(fn[0] + '; this._localToIso = _localToIso;', ctx);
        const iso = ctx._localToIso('2026-10-06T09:40');
        expect(iso).toMatch(/Z$/);
        expect(new Date(iso).getTime()).toBe(new Date('2026-10-06T09:40').getTime());
        expect(ctx._localToIso('')).toBe(null);
    });

    it('حقل السعر الأصلي يعيد حساب معاينة الخصم', () => {
        const priceInput = html.match(/<input[^>]*id="pPrice"[^>]*>/)[0];
        expect(priceInput).toContain('updateSalePreview()');
        expect(priceInput).toContain('onPriceInput()');
    });

    it('نسبة الخصم والسعر بعد الخصم مترابطان', () => {
        expect(html).toMatch(/id="pSalePct"[^>]*oninput="syncSaleFromPct\(\)/);
        expect(html).toMatch(/id="pSalePrice"[^>]*oninput="syncPctFromSale\(\)/);
        // التقريب للأسفل: لا يصل للسعر الأصلي فيرفضه الخادم
        expect(html).toMatch(/Math\.floor\(price \* \(1 - pct \/ 100\)\)/);
    });
});
