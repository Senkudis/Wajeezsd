/**
 * صفحات نقطة البيع والمخزون والتقارير ترسم أسماء المنتجات والعملاء عبر
 * innerHTML. الاسم نصٌّ يكتبه مستخدم (التاجر، أو العميل في اسمه)، فاسمٌ مثل
 * <img src=x onerror=...> كان يُنفَّذ في جلسة التاجر. يُهرَّب بـ
 * window.escapeHtml (js/config.js).
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public_html');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const INLINE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

const PAGES = ['merchant-pos.html', 'merchant-inventory.html', 'merchant-reports.html'];

describe('أسماء المستخدمين مهرَّبة في صفحات ERP التاجر', () => {
    it.each(PAGES)('%s: لا اسم خام بين وسمين', (f) => {
        const html = read(f);
        expect(html).toContain('const esc = window.escapeHtml');
        expect(html).toContain('js/config.js');
        expect(html).not.toMatch(/>\$\{(p|c|i)\.name\}</);
        expect(html).not.toMatch(/>\$\{m\.productName/);
    });

    it.each(PAGES)('%s: النصوص المضمَّنة تُحلَّل', (f) => {
        const blocks = [...read(f).matchAll(INLINE)].map(m => m[1]);
        blocks.forEach(b => expect(() => new Function(b)).not.toThrow());
    });

    it('merchant-pos: سجل الفواتير والإيصال المطبوع', () => {
        const html = read('merchant-pos.html');
        expect(html).toContain('const itemsTxt = s.items.map(i => `${i.quantity}× ${esc(i.name)}`)');
        expect(html).toContain('<tr><td>${i.quantity}× ${esc(i.name)}</td>');
        expect(html).toContain('<h2>${esc(shopName)}</h2>');
    });

    it('merchant-inventory: سبب الحركة', () => {
        expect(read('merchant-inventory.html')).toContain("esc(m.reason)");
    });
});
