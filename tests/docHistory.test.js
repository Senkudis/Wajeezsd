/**
 * 🗄️ أرشيف وثائق الكابتن — utils/docHistory.js
 * الكابتن يحدّث وثائقه بعد مشكلة فتضيع النسخة المطلوبة للتحقيق.
 */
const fs = require('fs');
const path = require('path');
const { historyEntries, withHistory, MAX_ENTRIES } = require('../utils/docHistory');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const NOW = new Date('2026-10-07T12:00:00Z');

describe('historyEntries', () => {
    it('يُؤرشف القيمة السابقة لما يُستبدل فقط', () => {
        const e = historyEntries(
            { idImage: '/api/files/documents/old.jpg', vehiclePhoto: '/uploads/documents/v.jpg' },
            { idImage: '/api/files/documents/new.jpg', vehiclePhoto: '/uploads/documents/v.jpg' },
            'captain_upload', NOW);
        expect(e).toEqual([{ field: 'idImage', value: '/api/files/documents/old.jpg', replacedAt: NOW, source: 'captain_upload' }]);
    });

    it('أول رفعٍ (لا قيمة سابقة) لا يُنتج أرشيفاً', () => {
        expect(historyEntries({}, { idImage: 'x' }, 'captain_upload')).toEqual([]);
        expect(historyEntries({ idImage: '' }, { idImage: 'x' }, 'captain_upload')).toEqual([]);
    });
});

describe('withHistory', () => {
    it('يضيف $push بحدٍّ أقصى، ويحوّل الحقول المباشرة إلى $set', () => {
        const u = withHistory({ 'documents.idImage': 'n' }, [{ field: 'idImage', value: 'o' }]);
        expect(u.$set).toEqual({ 'documents.idImage': 'n' });
        expect(u.$push.documentsHistory.$slice).toBe(-MAX_ENTRIES);
        expect(u.$push.documentsHistory.$each).toHaveLength(1);
    });

    it('بلا $set فارغ — يرفضه MongoDB', () => {
        const u = withHistory({}, [{ field: 'name', value: 'أ' }]);
        expect(u.$set).toBeUndefined();
        expect(u.$push).toBeDefined();
    });

    it('بلا أرشيف ⇒ التحديث كما هو', () => {
        expect(withHistory({ a: 1 }, [])).toEqual({ $set: { a: 1 } });
    });
});

describe('موصولٌ في كل طرق التغيير', () => {
    it('رفع الوثائق، وصورة البروفايل، وإعادة التقديم، وتعديل الإدارة', () => {
        expect(read('routes/upload.js')).toContain("historyEntries(before, next, 'captain_upload')");
        expect(read('routes/upload.js')).toContain("'profile_photo'");
        expect(read('routes/auth.js')).toContain("'reapply'");
        expect(read('routes/admin/users.js')).toContain("{ name: user.name, phone: user.phone, email: user.email, vehicleType: user.vehicleType }, 'admin'");
    });

    it('🔑 ملف صورة الكابتن القديمة لا يُحذف', () => {
        expect(read('routes/upload.js')).toContain('if (!isCaptain && previous && previous !== fileUrl');
    });

    it('الأرشيف لا يخرج مع المستخدم إلا لمن يطلبه', () => {
        const model = read('models/User.js');
        const i = model.indexOf('documentsHistory: {');
        expect(model.slice(i, i + 600)).toContain('select: false');
    });

    it('واللوحة تعرضه، والهوية فيه بروابط موقّعة لمن يحقّ له وحده', () => {
        const route = read('routes/admin/users.js');
        expect(route).toContain("router.get('/captains/:id/history'");
        expect(route).toContain('value = seeIds ? sign(value) : \'\'');
        expect(read('public_html/admin-captains.html')).toContain("'/api/admin/captains/' + id + '/history'");
    });
});
