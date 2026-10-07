/**
 * ✏️ نافذة تعديل المتجر كانت تقرأ المسار العام /api/places/:id — وهو يردّ
 * 404 لمتجرٍ مخفيّ أو في قسمٍ مخفيّ، فيظهر «فشل جلب بيانات المحل» على
 * المتجر الذي يحتاج تعديله. للإدارة مسارها: يقرأ المخفيّ، مقيّداً بالنطاق.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('قراءة المتجر لنافذة التعديل', () => {
    const src = read('routes/places.js');
    const i = src.indexOf("router.get('/:id/admin'");
    const b = src.slice(i, src.indexOf("router.get('/:id', async", i));

    it('مسار إدارةٍ بصلاحية ونطاق، بلا شرط الظهور للعملاء', () => {
        expect(i).toBeGreaterThan(0);
        expect(b).toContain("protect, requirePermission('view_stores')");
        expect(b).toContain('placeOutsideCity(req, res, req.params.id)');
        expect(b).not.toContain('isActive');
        expect(b).toContain('select(PLACE_CLIENT_EXCLUDE)');
    });
    it('يسبق المسار العام، والنافذة تستعمله', () => {
        expect(i).toBeLessThan(src.indexOf("router.get('/:id', async"));
        expect(read('public_html/js/admin-places.js')).toContain('/api/places/${id}/admin`');
    });
});
