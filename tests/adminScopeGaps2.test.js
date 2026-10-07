/**
 * 🌍 ثغرات نطاق الإداري التي ظهرت بالاستعمال (أكتوبر 2026): إداري عطبرة
 * يرى أزرار مدنٍ أخرى، وكشف الحساب لكل البلاد، والحساب البنكي والتسعير.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const body = (src, start) => {
    const i = src.indexOf(start);
    const j = src.indexOf('\nrouter.', i + 10);
    return src.slice(i, j < 0 ? undefined : j);
};

describe('الخادم', () => {
    it('كشف الحساب: مدن الإداري وحدها حين لا مدينة أو مدينةٌ خارجه', () => {
        const b = body(read('routes/admin/finance.js'), "router.get('/ledger'");
        expect(b).toContain('const scopedCities = isSubAdmin(req) ? adminCities(req.user) : null;');
        expect(b).toContain('else if (scopedCities) orderMatch.city = { $in: scopedCities };');
        expect(b).toContain("filter(a => inScope(a.captain?.city || 'Khartoum'))");
    });
    it('حذف طلبٍ يفحص مدينته قبل الحذف', () => {
        const b = body(read('routes/admin/orders.js'), "router.delete('/orders/:id'");
        expect(b.indexOf('denyOutsideCity')).toBeGreaterThan(0);
        expect(b.indexOf('denyOutsideCity')).toBeLessThan(b.indexOf('findByIdAndDelete'));
    });
    it('debug-settings و push-status للأكبر وحده', () => {
        expect(read('routes/admin/settings.js')).toContain("router.get('/debug-settings', protect, superAdminOnly");
        expect(read('routes/admin/dashboard.js')).toContain("router.get('/push-status', protect, superAdminOnly");
    });
    it('إنشاء متجر: المدينة قبل أي كتابة، ولا ربطٌ لحساب إدارة', () => {
        const b = body(read('routes/places.js'), "router.post('/', protect");
        const guard = b.indexOf("'موقع المتجر خارج نطاق مدينتك'");
        expect(guard).toBeGreaterThan(0);
        expect(guard).toBeLessThan(b.indexOf('new User('));
        expect(b).toContain("if (target.role === 'admin') return res.status(403)");
    });
});

describe('الواجهة على قدّ النطاق', () => {
    const guard = read('public_html/js/admin-guard.js');
    it('الحارس يقصّ أزرار المدن وخياراتها وأقسام الأكبر', () => {
        expect(guard).toContain("document.querySelectorAll('option[value=\"' + c + '\"]')");
        expect(guard).toContain("document.querySelectorAll('[data-super-only]')");
        expect(guard).toContain('MutationObserver');
    });
    it('تبويب التسعيرة والإعدادات وتعديل المديونية: للأكبر', () => {
        const f = read('public_html/admin-finance.html');
        expect(f).toMatch(/class="tab-btn" data-super-only onclick="switchTab\('settings'/);
        expect(f).toContain('<div id="tab-settings" class="tab-content" data-super-only>');
        expect(f).toContain('id="debtAdjustCard" data-super-only');
    });
});
