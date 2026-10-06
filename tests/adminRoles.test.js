/**
 * 👥 درجات الإدارة الثلاث (أكتوبر 2026): الأكبر (الشركاء)، الإداري، الموظف المسؤول.
 *
 * أخطر ما في الإضافة: كانت فحوصٌ كثيرة **سلبية** («ليس sub_admin ⇒ رئيسي»)،
 * فدرجةٌ جديدة كانت ستمرّ رئيسيةً في superAdminOnly وفي نجدات كل المدن وفي
 * تنبيهات الإدارة. الفحص الآن إيجابيّ: الأكبر من سُمّي super_admin (أو أدمن
 * قديم بلا درجة) — وكل ما سواه مقيّد.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const auth = require('../middleware/authMiddleware');

const A = (adminRole, extra = {}) => ({ role: 'admin', adminRole, ...extra });

describe('الفحص الإيجابيّ للدرجات', () => {
    it('الأكبر: super_admin أو أدمن قديم بلا درجة', () => {
        expect(auth.isSuperUser(A('super_admin'))).toBe(true);
        expect(auth.isSuperUser(A(null))).toBe(true);
        expect(auth.isSuperUser(A(undefined))).toBe(true);
    });

    it('الإداري والموظف وأي قيمةٍ غريبة: مقيَّدون — لا رئيسيون', () => {
        for (const r of ['sub_admin', 'staff', 'owner', 'SUPER_ADMIN']) {
            expect(auth.isSuperUser(A(r)), r).toBe(false);
            expect(auth.isScopedUser(A(r)), r).toBe(true);
        }
    });

    it('غير الأدمن ليس هذا ولا ذاك', () => {
        expect(auth.isSuperUser({ role: 'captain' })).toBe(false);
        expect(auth.isScopedUser({ role: 'client' })).toBe(false);   // بلا درجة = ليس إدارياً
    });

    it('superAdminOnly يردّ الموظف (كان يمرّره: فحصه «ليس sub_admin»)', () => {
        let passed = false, code = null;
        const res = { status: (c) => { code = c; return res; }, json: () => res };
        auth.superAdminOnly({ user: A('staff') }, res, () => { passed = true; });
        expect(passed).toBe(false);
        expect(code).toBe(403);
        auth.superAdminOnly({ user: A('super_admin') }, res, () => { passed = true; });
        expect(passed).toBe(true);
    });

    it('requirePermission: الموظف يحتاج الصلاحية كالإداري', () => {
        const run = (user) => { let ok = false; const res = { status: () => res, json: () => res };
            auth.requirePermission('manage_orders')({ user }, res, () => { ok = true; }); return ok; };
        expect(run(A('staff', { permissions: [] }))).toBe(false);
        expect(run(A('staff', { permissions: ['manage_orders'] }))).toBe(true);
    });

    it('فلتر المدينة يقيّد الموظف كالإداري', () => {
        expect(auth.getAdminCityFilter({ user: A('staff', { cities: ['Atbara'] }), query: {} })).toEqual({ city: 'Atbara' });
    });
});

describe('الموظف المحصور في متاجر', () => {
    it('بلا متاجر = كل متاجر مدنه، وبها = هي وحدها', () => {
        expect(auth.staffPlaceList(A('staff', { staffPlaces: [] }))).toBe(null);
        expect(auth.staffPlaceList(A('sub_admin', { staffPlaces: ['p1'] }))).toBe(null);   // الحصر للموظف وحده
        expect(auth.placeInStaffScope(A('staff', { staffPlaces: ['p1'] }), 'p1')).toBe(true);
        expect(auth.placeInStaffScope(A('staff', { staffPlaces: ['p1'] }), 'p2')).toBe(false);
        expect(auth.placeInStaffScope(A('super_admin'), 'p2')).toBe(true);
    });
});

describe('لا فحص سلبيّ باقٍ في الخادم', () => {
    it('لا «adminRole !== \'sub_admin\'» ولا «$ne: \'sub_admin\'»', () => {
        const files = ['middleware/authMiddleware.js', 'utils/notificationHelper.js', 'routes/emergency.js',
            'routes/admin/dashboard.js', 'routes/admin/notifications.js', 'routes/admin/users.js'];
        for (const f of files) {
            const src = read(f);
            expect(src, f).not.toMatch(/adminRole\s*!==\s*'sub_admin'/);
            expect(src, f).not.toMatch(/\$ne:\s*'sub_admin'/);
        }
    });

    it('الأدوار في النموذج ثلاثة، ومتاجر الموظف ومُعيِّنه محفوظة', () => {
        const User = require('../models/User');
        expect(User.schema.path('adminRole').enumValues).toEqual(['super_admin', 'sub_admin', 'staff']);
        expect(User.schema.path('staffPlaces')).toBeTruthy();
        expect(User.schema.path('adminCreatedBy')).toBeTruthy();
    });
});

describe('إدارة الفريق', () => {
    const src = read('routes/admin/subadmins.js');

    it('مسارات الفريق للأكبر والإداري — لا للموظف', () => {
        for (const m of ['get', 'post', 'put', 'delete']) {
            expect(src).toMatch(new RegExp(`router\\.${m}\\('/sub-admins(/:id)?', protect, adminManagerOnly`));
        }
        expect(src).toContain("return res.status(403).json({ message: 'غير مصرح — الموظف لا يدير الإداريين' });");
    });

    it('الإداري يُنشئ موظفين فقط، ولا يمنح ما لا يملك، ولا خارج مدنه', () => {
        expect(src).toContain(": 'staff';");
        expect(src).toContain("'لا يمكنك منح صلاحياتٍ لا تملكها: '");
        expect(src).toContain("'لا يمكنك تعيين موظفٍ في مدينةٍ خارج مدنك'");
    });

    it('الإداري لا يغيّر الدرجات، ولا يمسّ إلا موظفيه', () => {
        expect(src).toContain("'الإداري لا يغيّر الدرجات'");
        expect(src).toMatch(/if \(!managesStaff\(req\.user, target\)\)[\s\S]{0,80}لا تملك إدارة هذا الحساب/);
    });

    it('لا يُنزَّل ولا يُوقَف ولا يُحذف آخر إداري أكبر', () => {
        expect(src).toContain("'لا يمكن تنزيل آخر إداري أكبر'");
        expect(src).toContain("'لا يمكن إيقاف آخر إداري أكبر'");
        expect(src).toContain("'لا يمكن حذف آخر إداري أكبر'");
    });

    it('متاجر الموظف داخل مدنه وحدها', () => {
        expect(src).toContain("const rows = await Place.find({ _id: { $in: ids }, city: { $in: cities } })");
    });

    it('الصفحة للأكبر والإداري (__manager__)، والحارس يفهمها', () => {
        expect(read('public_html/admin-sub-admins.html')).toContain('data-perm="__manager__"');
        expect(read('public_html/js/admin-guard.js')).toContain("required === MANAGER_ONLY && !!user && user.adminRole === 'sub_admin'");
    });
});

describe('ما يخصّ الأكبر وحده', () => {
    it('الإعدادات (ومنها الحساب البنكي) وروابط المجموعات ومنطقة التوصيل', () => {
        const s = read('routes/admin/settings.js');
        expect(s).toMatch(/router\.put\('\/settings', protect, superAdminOnly/);
        expect(s).toMatch(/router\.put\('\/group-links', protect, superAdminOnly/);
        expect(s).toMatch(/router\.put\('\/delivery-zone', protect, superAdminOnly/);
    });
});
