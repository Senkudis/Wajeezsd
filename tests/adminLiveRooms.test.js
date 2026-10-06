/**
 * 📡 بثّ الإدارة الحيّ محصورٌ بالمدن، وثغراتٌ أخرى أُغلقت في مراجعة الدرجات:
 *   - كانت غرفة سوكت واحدة (admin_room) لكل أدمن: إداري عطبرة يرى لحظياً
 *     مواقع كباتن الخرطوم ونجداتها وطلباتها.
 *   - دخول الأدمن يفشل لمن حُفظ هاتفه بصيغةٍ غير موحَّدة (0905…).
 *   - تعديل المحفظة يدوياً للأكبر وحده.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const rooms = require('../utils/adminRooms');

describe('غرف الإدارة', () => {
    it('الأكبر (أو القديم بلا درجة) في admin_room وحدها', () => {
        expect(rooms.adminRoomsFor({ role: 'admin', adminRole: 'super_admin' })).toEqual(['admin_room']);
        expect(rooms.adminRoomsFor({ role: 'admin', adminRole: null })).toEqual(['admin_room']);
    });

    it('الإداري والموظف في غرف مدنهم — لا admin_room', () => {
        expect(rooms.adminRoomsFor({ role: 'admin', adminRole: 'sub_admin', cities: ['Atbara', 'Bogus'] }))
            .toEqual(['admin_city_Atbara']);
        expect(rooms.adminRoomsFor({ role: 'admin', adminRole: 'staff', cities: [], city: 'Khartoum' }))
            .toEqual(['admin_city_Khartoum']);
        expect(rooms.adminRoomsFor({ role: 'captain' })).toEqual([]);
    });

    it('البثّ: الأكبر + غرفة المدينة، وبلا مدينةٍ صالحة الأكبر وحده', () => {
        const calls = [];
        const io = { to: (r) => { calls.push(r); return { emit() {} }; } };
        rooms.toAdmins(io, 'Atbara');
        rooms.toAdmins(io, undefined);
        rooms.toAdmins(io, 'Nowhere');
        expect(calls).toEqual([['admin_room', 'admin_city_Atbara'], 'admin_room', 'admin_room']);
    });

    it('لا بثّ مباشر لـ admin_room باقٍ في الخادم', () => {
        const files = ['index.js', 'routes/orders.js', 'routes/admin/orders.js', 'routes/captain.js', 'routes/merchant.js',
            'routes/complaints.js', 'routes/emergency.js', 'routes/feedback.js', 'utils/notificationHelper.js'];
        for (const f of files) expect(read(f), f).not.toMatch(/\.to\('admin_room'\)/);
        expect(read('index.js')).not.toMatch(/socket\.join\('admin_room'\)/);
        expect(read('index.js')).toContain('socket.join(adminRoomsFor(socket.adminIdentity))');
    });

    it('تغيير درجة أو حذفٌ يقطع اتصال السوكت فيعود بغرفه الجديدة', () => {
        const src = read('routes/admin/subadmins.js');
        expect(src).toContain('disconnectSockets(true)');
        expect((src.match(/dropLiveSessions\(req, target\._id\)/g) || []).length).toBe(2);
    });

    it('ما يُنزع من الإداري يُنزع من موظفيه', () => {
        const src = read('routes/admin/subadmins.js');
        expect(src).toContain('$pull: { permissions: { $in: lostPerms }, cities: { $in: lostCities } }');
    });
});

describe('دخول الأدمن بأي صيغةٍ للهاتف', () => {
    it('البحث بالموحَّد والمحلّي (0…) والمكتوب', () => {
        const src = read('routes/admin/auth.js');
        expect(src).toContain("user = await User.findOne({ phone: { $in: forms }, role: 'admin' });");
        expect(src).toContain("'0' + normalizedPhone.slice(3)");
    });
    it('تعديل المستخدم يحفظ الهاتف موحَّداً', () => {
        expect(read('routes/admin/users.js')).toContain('if (phone) user.phone = normalizePhone(phone);');
    });
});

describe('المحفظة للأكبر وحده', () => {
    it('تعديل مديونية الكابتن يدوياً: superAdminOnly', () => {
        expect(read('routes/admin/finance.js')).toMatch(/router\.put\('\/captains\/:id\/adjust-debt', protect, superAdminOnly/);
    });
    it('حقل wallet داخل كتلة الأكبر في تعديل المستخدم', () => {
        const src = read('routes/admin/users.js');
        expect(src).toMatch(/if \(!isSubAdmin\) \{\s*if \(wallet !== undefined\) user\.wallet = wallet;/);
    });
});
