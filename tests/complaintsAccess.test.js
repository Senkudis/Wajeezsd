/**
 * 🔐 تذاكر الدعم — الصلاحية ونطاق المدينة والمدخلات.
 *
 * كانت مسارات الإدارة `adminOnly` وحده: أدمنٌ مساعد بلا view_complaints أو
 * من مدينةٍ أخرى يقرأ كل التذاكر بأسماء العملاء وهواتفهم ويغلقها. وصفحة
 * الشكاوى محروسةٌ بـ data-perm في المتصفّح فقط.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'routes/complaints.js'), 'utf8');
const route = (sig) => src.slice(src.indexOf(sig), src.indexOf('\n});', src.indexOf(sig)));

describe('الصلاحية على الخادم لا في المتصفّح وحده', () => {
    it('🔑 لا adminOnly بعد الآن — كل مسار إدارةٍ يتطلّب view_complaints', () => {
        // لا وسيطاً على أيّ مسار، ولا مستورداً (التعليق يذكره تاريخاً)
        expect(src).not.toMatch(/protect,\s*adminOnly\b/);
        expect(src).not.toMatch(/\{[^}]*\badminOnly\b[^}]*\}\s*=\s*require/);
        expect(src).toContain("const STAFF = requirePermission('view_complaints')");
        for (const sig of [
            "router.get('/stats', protect, STAFF",
            "router.get('/', protect, STAFF",
            "router.put('/:id/resolve', protect, STAFF",
            "router.put('/:id/dismiss', protect, STAFF",
            "router.put('/:id/assign', protect, STAFF",
            "router.put('/:id/priority', protect, STAFF"
        ]) expect(src).toContain(sig);
    });

    it('المساران المشتركان (تفاصيل وردّ) يفحصان الصلاحية للأدمن', () => {
        for (const sig of ["router.get('/:id', protect", "router.post('/:id/reply', protect"]) {
            const r = route(sig);
            expect(r).toContain('if (asAdmin && !isStaff(req.user))');
            expect(r).toContain('coversTicket(req.user, complaint)');
        }
    });
});

describe('نطاق المدينة', () => {
    it('🔑 القائمة والعدّادات بمدن الأدمن', () => {
        expect(route("router.get('/', protect, STAFF")).toContain('...getAdminCityFilter(req)');
        expect(route("router.get('/stats', protect, STAFF")).toContain('{ $match: scope }');
    });
    it('والتعديل على تذكرةٍ في نطاقه وحده', () => {
        for (const sig of ["'/:id/resolve'", "'/:id/dismiss'", "'/:id/assign'", "'/:id/priority'"]) {
            expect(route(`router.put(${sig}`)).toContain('await scopedTicket(req, res)');
        }
    });
    it('التذكرة تُختم بمدينة الطلب أو العميل', () => {
        expect(route("router.post('/', protect")).toContain('city,');
        const Complaint = require('../models/Complaint');
        expect(Complaint.schema.path('city').enumValues).toEqual(['Khartoum', 'PortSudan']);
        // بلا افتراضيّ: القديم يبقى بلا مدينة حتى يُملأ بدليل
        expect(Complaint.schema.path('city').defaultValue).toBeUndefined();
    });
    it('والتنبيه لمن يعمل على تذاكر مدينتها — لا كل الأدمنية', () => {
        expect(route("router.post('/', protect")).toContain('await staffFor(city)');
        expect(src).not.toContain("await User.find({ role: 'admin', isActive: true });");
    });
});

describe('المدخلات', () => {
    it('🔑 وصفٌ غائب ← 400 لا 500 (كان description.substring على undefined)', () => {
        const r = route("router.post('/', protect");
        expect(r).toContain('const description = cleanText(');
        expect(r).toContain('if (!description)');
    });
    it('ردٌّ غير نصّيّ أو أطول من الحدّ ← 400', () => {
        expect(route("router.post('/:id/reply', protect")).toContain('const message = cleanText(');
    });
    it('معرّف طلبٍ غير صالح ← 400، وتصنيفٌ غريب ← «أخرى»', () => {
        const r = route("router.post('/', protect");
        expect(r).toContain('mongoose.isValidObjectId(orderId)');
        expect(r).toContain("CATEGORIES.includes(category) ? category : 'other'");
    });
    it('فلاتر القائمة من قوائم معروفة — لا كائنات استعلام', () => {
        const r = route("router.get('/', protect, STAFF");
        expect(r).toContain('STATUSES.includes(req.query.status)');
        expect(r).toContain('mongoose.isValidObjectId(req.query.assigned)');
    });
    it('🔑 التعيين لأدمنٍ يعمل على التذاكر في مدينتها — لا لأيّ معرّف', () => {
        const r = route("router.put('/:id/assign'");
        expect(r).toContain("role: 'admin', isActive: true");
        expect(r).toContain('isStaff(target)');
        expect(r).toContain('adminCoversCity(target, complaint.city)');
    });
    it('الصور: نصوصٌ من مسار الرفع أو https، بحدٍّ أعلى', () => {
        expect(src).toContain('/^(\\/uploads\\/|\\/api\\/uploads\\/|https:\\/\\/)/');
        expect(src).toContain('.slice(0, 5)');
    });
});

describe('المسار القديم للشكاوى أُزيل', () => {
    it('POST /api/orders/:id/complain لم يعد موجوداً', () => {
        const orders = fs.readFileSync(path.join(__dirname, '..', 'routes/orders.js'), 'utf8');
        expect(orders).not.toContain("router.post('/:id/complain'");
    });
});

describe('سكربت ملء المدينة', () => {
    it('معاينةٌ افتراضياً، ولا يُخمّن', () => {
        const s = fs.readFileSync(path.join(__dirname, '..', 'scripts/backfill-complaint-city.js'), 'utf8');
        expect(s).toContain("const APPLY = process.argv.includes('--apply')");
        expect(s).toContain('if (APPLY && ops.length)');
        expect(s).toContain('بلا دليل');
    });
});
