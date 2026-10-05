/**
 * بنرا لوحة التاجر (نقص المخزون، تفعيل الصوت) يُظهرهما الجافاسكربت
 * بتبديل d-none ← d-flex. في d58513d أُضيف لهما style="display:none!important"
 * مضمَّناً فلم يعد أي صنفٍ قادراً على إظهارهما. d-none وحدها كافية للإخفاء
 * الابتدائي (هي !important في Bootstrap).
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
    path.join(__dirname, '..', 'public_html', 'merchant-dashboard.html'), 'utf8');

describe('merchant-dashboard: البنرات قابلة للإظهار', () => {
    it.each(['shop-sound-banner', 'lowStockBanner'])('%s', (id) => {
        const tag = html.match(new RegExp(`<div id="${id}"[^>]*>`));
        expect(tag).toBeTruthy();
        expect(tag[0]).toContain('d-none');
        expect(tag[0]).not.toMatch(/display\s*:\s*none/);
    });
});
