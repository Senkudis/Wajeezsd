/**
 * 🎯 كلمات البحث الفاشلة كقائمة عمل لا تقرير ساكن.
 *
 * السجلّ كان يجمع "ما بحث عنه العملاء ولم يجدوه" ويعرضه — نفس الخمس عشرة
 * كلمة في كل فتح، بلا أثر لما عالجه فريق التسجيل. الحقول الجديدة تُخرج
 * المعالَج من القائمة فيبقى فيها ما ينتظر فعلاً.
 *
 * الفخّ المعالَج هنا: المستندات المسجَّلة قبل إضافة leadStatus لا تحمل
 * الحقل إطلاقاً، فقراءةٌ بـ { leadStatus: 'open' } كانت ستُخفي كل تاريخ
 * البحث السابق دفعةً واحدة. $nin يطابق الغياب — ولهذا هو المستعمل.
 */
import { describe, it, expect } from 'vitest';

const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
// الفحوص السلبية أدناه تُطبَّق على الكود وحده: التعليقات هنا تذكر
// `upsert` و`leadStatus: 'open'` لشرح سبب تجنّبهما، فمطابقة النص الخام
// كانت تُفشل الاختبار على شرحه نفسه.
const codeOnly = (src) => src
    .split(/\r?\n/)
    .filter(l => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
    .join('\n');

const PlaceSearchQuery = require('../models/PlaceSearchQuery');
const AdminLog = require('../models/AdminLog');

describe('مخطّط PlaceSearchQuery — حقول المتابعة', () => {

    it('كلمة جديدة تبدأ مفتوحة بلا مُعالِج ولا وقت', () => {
        const doc = new PlaceSearchQuery({ city: 'Khartoum', query: 'صيدلية النور' });
        expect(doc.leadStatus).toBe('open');
        expect(doc.leadNote).toBe('');
        expect(doc.leadAt).toBeNull();
        expect(doc.leadBy).toBeNull();
    });

    it('يقبل الحالات الثلاث ويرفض ما عداها', () => {
        for (const s of ['open', 'handled', 'ignored']) {
            const doc = new PlaceSearchQuery({ city: 'Khartoum', query: 'س', leadStatus: s });
            expect(doc.validateSync()).toBeUndefined();
        }
        const bad = new PlaceSearchQuery({ city: 'Khartoum', query: 'س', leadStatus: 'done' });
        expect(bad.validateSync()?.errors?.leadStatus).toBeDefined();
    });

    it('الملاحظة محدودة الطول — حقل حرّ في مستند يتضخّم بلا سقف', () => {
        const doc = new PlaceSearchQuery({
            city: 'Khartoum', query: 'س', leadNote: 'ط'.repeat(301)
        });
        expect(doc.validateSync()?.errors?.leadNote).toBeDefined();
    });

    it('فهرس قائمة العمل موجود — القراءة تفلتر بالحالة وترتّب بالفشل', () => {
        const idx = PlaceSearchQuery.schema.indexes().map(([keys]) => keys);
        expect(idx).toContainEqual({ city: 1, leadStatus: 1, emptyCount: -1 });
    });
});

describe('AdminLog — الفعل الجديد قابل للتدقيق', () => {
    it('search_lead_status ضمن القائمة المسموحة', () => {
        // لولا ذلك لسقط السجلّ صامتاً داخل try/catch في utils/adminLogger
        const doc = new AdminLog({
            admin: '507f1f77bcf86cd799439011',
            action: 'search_lead_status',
            description: 'Khartoum: "صيدلية" ⇐ handled'
        });
        expect(doc.validateSync()).toBeUndefined();
    });
});

describe('مسار PATCH /api/places/errand-stats/lead', () => {
    const src = read('routes/places.js');
    const start = src.indexOf("'/errand-stats/lead'");
    const block = codeOnly(src.slice(start, src.indexOf('router.', start + 20)));

    it('موجود ومحروس بـ manage_stores لا view_stats', () => {
        expect(start).toBeGreaterThan(-1);
        expect(src).toMatch(
            /router\.patch\(\s*'\/errand-stats\/lead',\s*protect,\s*requirePermission\('manage_stores'\)/
        );
    });

    it('يرفض حالة غير معروفة', () => {
        expect(block).toContain("['open', 'handled', 'ignored'].includes(status)");
    });

    it('بلا upsert — لا يُنشئ كلمة لم يبحث عنها أحد', () => {
        expect(block).not.toContain('upsert');
    });

    it('يقصّ الكلمة والملاحظة قبل الكتابة', () => {
        expect(block).toContain('slice(0, 120)');
        expect(block).toContain('slice(0, 300)');
    });

    it('يحصر المدينة في المدن المعروفة — لا قيمة حرّة من الجسم', () => {
        expect(block).toContain("VALID_CITIES.includes(req.body.city)");
    });

    it('التراجع إلى open يمسح المُعالِج والوقت', () => {
        expect(block).toContain("leadAt: status === 'open' ? null : new Date()");
        expect(block).toContain("leadBy: status === 'open' ? null : req.user._id");
    });

    it('يُسجَّل في سجلّ الإدارة', () => {
        expect(block).toContain("logAdminAction(req, 'search_lead_status'");
    });
});

describe('قراءة errand-stats — استبعاد المعالَج', () => {
    const src = read('routes/places.js');

    it('يستعمل $nin لا leadStatus:open — المستندات القديمة بلا الحقل', () => {
        const code = codeOnly(src);
        expect(code).toContain("leadStatus: { $nin: ['handled', 'ignored'] }");
        expect(code).not.toContain("leadStatus: 'open' }");
    });

    it('يُرجع عدّاد ما عولج حتى لا تبدو القائمة منكمشة بلا سبب', () => {
        expect(src).toContain('leadsClosed');
        expect(src).toMatch(/topPlaces,\s*leadsClosed/);
    });
});
