/**
 * 🔐 مساراتٌ إدارية كان يحرسها adminOnly وحده — «أيّ أدمن» — بينما تفعل ما
 * يحتاج صلاحيةً بعينها ونطاق مدينة. حارس الصفحة في المتصفّح لا يكفي: الـ API
 * يُستدعى مباشرة.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('حرّاس المسارات الإدارية', () => {
    it('🔑 نقل ملكية متجر: manage_stores ومدينة المتجر', () => {
        const s = read('routes/merchant.js');
        const r = s.slice(s.indexOf("router.put('/admin/assign-merchant'"));
        expect(r).toMatch(/^router\.put\('\/admin\/assign-merchant', protect, requirePermission\('manage_stores'\)/);
        expect(r).toContain('adminCoversCity(req.user, existing.city)');
        expect(r).toContain('mongoose.isValidObjectId(placeId)');
    });

    it('🔑 صورة الكابتن وبطاقة الفريق: manage_captains والكابتن في نطاقه — قبل حفظ الملف', () => {
        const s = read('routes/upload.js');
        expect(s).toContain("requirePermission('manage_captains')");
        expect(s).toContain('adminCanActOnUser(req, target)');
        expect(s).toContain("router.post('/admin/captain-photo/:id', protect, canEditCaptainPhoto,");
        expect(s).toContain("router.post('/admin/team-photo/:id', protect, canEditCaptainPhoto,");
    });

    it('الإشعار اليدويّ: send_notifications', () => {
        expect(read('routes/notifications.js')).toContain("router.post('/', protect, requirePermission('send_notifications')");
    });

    it('المسوّقون ومكافآتهم: للمسؤول الرئيسيّ', () => {
        expect(read('routes/referral.js')).toContain("superAdminOnly: adminOnly } = require('../middleware/authMiddleware')");
    });

    it('ولا adminOnly وحده على مسارٍ يُعدّل في هذه الملفات', () => {
        for (const f of ['routes/merchant.js', 'routes/upload.js', 'routes/notifications.js', 'routes/complaints.js']) {
            expect(read(f)).not.toMatch(/router\.(post|put|patch|delete)\([^)]*protect,\s*adminOnly\b/);
        }
    });
});
