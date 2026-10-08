/**
 * 🪪 تحديث وثائق الكابتن المعتمد بطلبٍ تراجعه الإدارة — utils/docChangeRequests.js
 */
const fs = require('fs');
const path = require('path');
const { needsReview, splitUpdates, requestStatusByField, REVIEWED_FIELDS } = require('../utils/docChangeRequests');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const approved = { role: 'captain', approvalStatus: 'approved' };
const pending = { role: 'captain', approvalStatus: 'pending' };

describe('من يمرّ بالمراجعة', () => {
    it('الكابتن المعتمد: الهوية والسيلفي والرخصة والمركبة', () => {
        for (const f of ['idImage', 'selfieImage', 'driverLicense', 'vehiclePhoto']) expect(needsReview(approved, f), f).toBe(true);
        expect(REVIEWED_FIELDS).toHaveLength(4);
    });

    it('🔑 صورة الملف الشخصي لا تحتاج طلباً', () => {
        expect(needsReview(approved, 'profilePhoto')).toBe(false);
    });

    it('من لم يُعتمد بعد يرفع مباشرة — ملفّه كلّه قيد المراجعة أصلاً', () => {
        expect(needsReview(pending, 'idImage')).toBe(false);
        expect(needsReview({ role: 'client', approvalStatus: 'approved' }, 'idImage')).toBe(false);
    });
});

describe('splitUpdates', () => {
    it('يفصل المباشر عن الطلب', () => {
        const { direct, requests } = splitUpdates(approved, {
            'documents.profilePhoto': '/p.jpg', 'documents.idImage': '/api/files/documents/i.jpg'
        });
        expect(direct).toEqual({ 'documents.profilePhoto': '/p.jpg' });
        expect(requests).toEqual([{ field: 'idImage', value: '/api/files/documents/i.jpg' }]);
    });
});

describe('requestStatusByField', () => {
    it('أحدث طلبٍ لكل وثيقة يحدّد حالتها، والرفض بسببه', () => {
        const st = requestStatusByField([
            { field: 'idImage', status: 'rejected', reason: 'غير واضحة', requestedAt: new Date('2026-10-01') },
            { field: 'idImage', status: 'pending', requestedAt: new Date('2026-10-05') },
            { field: 'vehiclePhoto', status: 'rejected', reason: 'ليست المركبة', requestedAt: new Date('2026-10-03') }
        ]);
        expect(st.idImage.status).toBe('pending');
        expect(st.vehiclePhoto).toMatchObject({ status: 'rejected', reason: 'ليست المركبة' });
    });
});

describe('موصولٌ من الرفع إلى القرار', () => {
    it('الرفع يحوّل وثائق المعتمد إلى طلب، ويخبر الكابتن والإدارة', () => {
        const up = read('routes/upload.js');
        expect(up).toContain('splitUpdates(req.user, updates)');
        expect(up).toContain("type: 'captain_doc_change'");
        expect(up).toContain('pendingReview: requests.map(r => r.field)');
    });

    it('القرار ذرّي، والقبول يُؤرشف السابقة، والرفض يحتاج سبباً', () => {
        const r = read('routes/admin/users.js');
        expect(r).toContain("router.put('/captains/:id/doc-requests/:reqId', protect, requirePermission('manage_captains')");
        expect(r).toContain("docChangeRequests: { $elemMatch: { _id: reqId, status: 'pending' } }");
        expect(r).toContain("historyEntries(before, { [r.field]: r.value }, 'change_request', now)");
        expect(r).toContain("اكتب سبب الرفض");
    });

    it('الأنواع الجديدة مسجّلة — وإلا رمى insertMany وضاع الإشعار', () => {
        const n = read('models/Notification.js');
        expect(n).toContain("'captain_doc_change', 'doc_change_result'");
        expect(read('utils/pushRouting.js')).toContain("case 'doc_change_result':");
        expect(read('models/AdminLog.js')).toContain("'approve_doc_change', 'reject_doc_change'");
    });

    it('الكابتن يُبلَّغ قبل الرفع، ويرى «بانتظار المراجعة» أو سبب الرفض', () => {
        const p = read('public_html/captain-profile.html');
        expect(p).toContain('ووثيقتك الحالية تبقى سارية حتى الموافقة');
        expect(p).toContain('تحديثك بانتظار مراجعة الإدارة');
        expect(p).toContain('لم يُقبل آخر تحديث');
    });

    it('واللوحة: شريط الطلبات، والحالية بجانب المطلوبة', () => {
        const a = read('public_html/admin-captains.html');
        expect(a).toContain('loadDocRequestsBanner();');
        expect(a).toContain("'/api/admin/captains/' + id + '/doc-requests'");
    });
});
