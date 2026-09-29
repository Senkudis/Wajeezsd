/**
 * 📈 سقف زيادة سعر المشوار — 5000% (كان 500%).
 *
 * الحدّ مكتوبٌ في أربعة أماكن: المخطّط، ومسار الحفظ، وحقلا الإدخال في
 * صفحتي الإعدادات والمالية. رفعُ أحدها دون البقية يعني أن الأدمن يكتب
 * 1000 فيقبلها الحقل ويرفضها الخادم — أو العكس. هنا تُحرس معاً.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('سقف زيادة السعر', () => {
    it('المخطّط يقبل حتى 5000%', () => {
        const p = require('../models/Settings').schema.path('maxPriceSurgePercent');
        const maxV = p.validators.find(v => v.type === 'max');
        expect(maxV.max).toBe(5000);
    });

    it('ومسار الحفظ بالحدّ نفسه', () => {
        const src = read('routes/admin/settings.js');
        expect(src).toContain('if (val < 0 || val > 5000) return res.status(400)');
        expect(src).not.toMatch(/maxPriceSurgePercent'\) \{\s*if \(val < 0 \|\| val > 500\)/);
    });

    it('وحقلا الإدخال في الصفحتين', () => {
        expect(read('public_html/admin-settings.html')).toMatch(/id="maxPriceSurgePercent"[^>]*max="5000"/);
        const fin = read('public_html/admin-finance.html');
        expect(fin).toMatch(/id="settingMaxPriceSurgePercent"[^>]*max="5000"/);
        expect(fin).toContain('surge > 5000');
    });

    it('والتسعير يحسب السقف العالي كما هو', () => {
        const { calculateTripPricing } = require('../utils/tripPricing');
        const here = { lat: 15.6, lng: 32.5 };
        // نقطتان متطابقتان: السعر = الأجرة الأساسية وحدها
        const r = calculateTripPricing({ baseFare: 1000, maxPriceSurgePercent: 2000 }, { pickup: here, dropoff: here });
        expect(r.calculatedPrice).toBe(1000);
        expect(r.maxAllowedPrice).toBe(21000);   // 1000 × (1 + 2000/100)
    });
});
