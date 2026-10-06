/**
 * 🌍 الأدمن المساعد مقيّدٌ بمدنه في **كل** صلاحية — لا في القوائم وحدها.
 *
 * كانت القوائم تُصفّى، لكن مسارات التعديل بالمعرّف (تعديل/إلغاء طلب، اعتماد
 * سداد، تسوية دين، تسويات المتاجر، تعديل متجر ومنتجاته) والبثّ والإحصاءات
 * لا تفحص المدينة: أدمن مساعدٌ بصلاحيات كاملة لمدينةٍ واحدة كان يتصرّف في
 * كل المدن متى عرف المعرّف، وبثّه يصل البلد كله.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const auth = require('../middleware/authMiddleware');

const sub = (cities) => ({ user: { adminRole: 'sub_admin', city: cities[0], cities }, query: {} });
const superAdmin = { user: { adminRole: 'super_admin' }, query: {} };
const res = () => {
    const r = { code: null, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
};

describe('المساعدات', () => {
    it('denyOutsideCity: يرفض خارج المدن ويمرّر داخلها وللمدير العام', () => {
        const r1 = res();
        expect(auth.denyOutsideCity(sub(['Atbara']), r1, 'Khartoum')).toBe(true);
        expect(r1.code).toBe(403);
        expect(auth.denyOutsideCity(sub(['Atbara']), res(), 'Atbara')).toBe(false);
        expect(auth.denyOutsideCity(superAdmin, res(), 'PortSudan')).toBe(false);
    });

    it('سجلٌّ قديم بلا مدينة يُعدّ الخرطوم', () => {
        expect(auth.denyOutsideCity(sub(['Khartoum']), res(), undefined)).toBe(false);
        expect(auth.denyOutsideCity(sub(['Atbara']), res(), '')).toBe(true);
    });

    it('cityScopeQuery: الحقل المطلوب، ومدنٌ متعدّدة بـ $in', () => {
        expect(auth.cityScopeQuery(sub(['Atbara']), 'place.city')).toEqual({ 'place.city': 'Atbara' });
        expect(auth.cityScopeQuery(sub(['Atbara', 'PortSudan']))).toEqual({ city: { $in: ['Atbara', 'PortSudan'] } });
        expect(auth.cityScopeQuery(superAdmin)).toEqual({});
    });

    it('scopedUserIds/scopedPlaceIds: null للمدير العام (بلا تقييد)', async () => {
        expect(await auth.scopedUserIds(superAdmin)).toBe(null);
        expect(await auth.scopedPlaceIds(superAdmin)).toBe(null);
    });
});

/** جسم المسار من تعريفه حتى المسار التالي */
function handler(file, head) {
    const src = read(file);
    const i = src.indexOf(head);
    expect(i, `${file}: ${head}`).toBeGreaterThan(-1);
    const next = src.slice(i + head.length).search(/\nrouter\.(get|post|put|patch|delete)\(/);
    return src.slice(i, next < 0 ? undefined : i + head.length + next);
}

describe('كل مسار تعديلٍ بالمعرّف يفحص المدينة', () => {
    const CASES = [
        ['routes/admin/orders.js', "router.put('/orders/:id', protect", 'denyOutsideCity'],
        ['routes/admin/orders.js', "router.put('/orders/:id/cancel-force'", 'denyOutsideCity'],
        ['routes/admin/orders.js', "router.put('/orders/:id/route'", 'denyOutsideCity'],
        ['routes/admin/orders.js', "router.post('/orders/:id/route-quote'", 'denyOutsideCity'],
        ['routes/admin/orders.js', "router.put('/shop-orders/:id/cancel-force'", 'denyOutsideCity'],
        ['routes/admin/orders.js', "router.post('/shop-orders/:id/republish'", 'denyOutsideCity'],
        ['routes/admin/orders.js', "router.post('/orders/:id/remind-captains'", 'adminCoversCity'],
        ['routes/admin/finance.js', "router.put('/captains/:id/adjust-debt'", 'denyOutsideCity'],
        ['routes/admin/finance.js', "router.put('/payment-requests/:id/approve'", 'denyOutsideCity'],
        ['routes/admin/finance.js', "router.put('/payment-requests/:id/reject'", 'denyOutsideCity'],
        ['routes/admin/finance.js', "router.get('/payment-requests'", 'scopedUserIds'],
        ['routes/admin/finance.js', "router.get('/debt-adjustments'", 'scopedUserIds'],
        ['routes/admin/finance.js', "router.post('/promo-codes'", 'promoCityFor'],
        ['routes/admin/finance.js', "router.put('/promo-codes/:id'", 'isSubAdmin'],
        ['routes/admin/finance.js', "router.delete('/promo-codes/:id'", 'isSubAdmin'],
        ['routes/merchant-erp.js', "router.get('/admin/settlements'", 'scopedPlaceIds'],
        ['routes/merchant-erp.js', "router.put('/admin/settlements/:id/approve'", 'settlementOutsideCity'],
        ['routes/merchant-erp.js', "router.put('/admin/settlements/:id/reject'", 'settlementOutsideCity'],
        ['routes/merchant-erp.js', "router.put('/admin/places/:id/tier'", 'denyOutsideCity'],
        ['routes/places.js', "router.put('/:id', protect", 'placeOutsideCity'],
        ['routes/places.js', "router.delete('/:id', protect", 'placeOutsideCity'],
        ['routes/places.js', "router.post('/:placeId/products'", 'placeOutsideCity'],
        ['routes/places.js', "router.put('/:placeId/products/:productId'", 'placeOutsideCity'],
        ['routes/places.js', "router.delete('/:placeId/products/:productId'", 'placeOutsideCity'],
        ['routes/places.js', "router.get('/:placeId/products/admin'", 'placeOutsideCity'],
        ['routes/admin/complaints.js', "router.get('/complaints'", 'getAdminCityFilter'],
        ['routes/admin/complaints.js', "router.put('/complaints/:id/resolve'", 'denyOutsideCity'],
        ['routes/admin/reports.js', "router.get('/reports'", 'scopedUserIds'],
        ['routes/admin/ratings.js', "router.get('/ratings'", 'scopedUserIds'],
        ['routes/admin/feedback.js', "router.put('/feedback/:id/review'", 'denyOutsideCity'],
        ['routes/admin/notifications.js', "router.post('/broadcast'", 'getAdminCityFilter'],
        ['routes/admin/notifications.js', "router.post('/send-notification'", 'getAdminCityFilter'],
        ['routes/admin/dashboard.js', "router.get('/dashboard'", 'isSubAdmin'],
        ['routes/banners.js', "router.get('/admin/all'", 'isSubAdmin'],
        ['routes/banners.js', "router.put('/admin/:id'", 'bannerOutsideCity'],
        ['routes/banners.js', "router.delete('/admin/:id'", 'bannerOutsideCity'],
        ['routes/admin/subadmins.js', "router.get('/activity-log'", 'isSubAdmin'],
    ];
    it.each(CASES)('%s — %s', (file, head, guard) => {
        expect(handler(file, head)).toContain(guard);
    });

    it('إنشاء متجرٍ يُختم بمدن الأدمن المساعد', () => {
        expect(handler('routes/places.js', "router.post('/', protect")).toContain('resolveCreationCity(req');
    });

    it('الإحصاءات لا تُخدم من ذاكرةٍ مؤقتة مشتركة للأدمن المساعد', () => {
        const blk = handler('routes/admin/dashboard.js', "router.get('/dashboard'");
        expect(blk).toContain('if (!sub && _dashboardCache');
        expect(blk).toMatch(/if \(!sub\) \{\s*_dashboardCache = responseData;/);
    });
});
