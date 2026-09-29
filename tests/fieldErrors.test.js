/**
 * 🎯 أخطاء الطلب في خاناتها — وتسجيل تعثّر العملاء.
 *
 * ما حدث: عميلٌ قال «كتبت الرقم وقال غير موجود». الأسباب:
 *   • النافذة تقول «رقم هاتف المرسل غير صحيح» ولا تشير إلى خانة — ومن ملأ
 *     هاتف المستلم لا يعرف أيّ خانةٍ يُقصد.
 *   • الفحص عدّ الأحرف: الرقم الصحيح بلا صفرٍ في أوّله (912345678) يُرفض.
 *   • الاسمان لا يُفحصان، فيرفض الخادم بـ«بيانات الاستلام غير مكتملة».
 *   • إعادة طلب «اشترِ لي» تنسخ '-' إلى هاتف المرسل.
 */
import { describe, it, expect, beforeAll } from 'vitest';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// field-errors.js يُحمَّل في سياقٍ معزول بنافذةٍ مصغّرة — SudanPhone منطقٌ خالص
let SudanPhone;
beforeAll(() => {
    const win = {};
    vm.runInNewContext(read('public_html/js/field-errors.js'), { window: win, document: {}, localStorage: { getItem: () => null } });
    SudanPhone = win.SudanPhone;
});

describe('الهاتف كما يحكم الخادم', () => {
    const server = require('../utils/phoneNormalizer');

    it('🔑 الصحيح بكل صوره مقبول — ومنه الرقم بلا صفر', () => {
        for (const p of ['0912345678', '912345678', '+249912345678', '249912345678', '00249912345678',
            '٠٩١٢٣٤٥٦٧٨', '091 234 5678', '0912-345-678', '0112345678']) {
            expect(SudanPhone.isValid(p), p).toBe(true);
        }
    });

    it('ومطابقٌ لحكم الخادم حرفاً بحرف', () => {
        for (const p of ['0912345678', '912345678', '٠٩١٢٣٤٥٦٧٨', '0912', '09123456789', '0812345678', '-', '', 'abc', '+249 91 234 5678']) {
            expect(SudanPhone.isValid(p), p).toBe(server.isValidSudanPhone(p));
        }
    });

    it('سبب الرفض بلغة المستخدم', () => {
        expect(SudanPhone.problem('')).toBe('empty');
        expect(SudanPhone.problem('-')).toBe('empty');
        expect(SudanPhone.problem('0912')).toBe('short');
        expect(SudanPhone.problem('09123456789')).toBe('invalid');
        expect(SudanPhone.problem('912345678')).toBe(null);
    });

    it('يُرسَل بالصيغة المحلية النظيفة — الكابتن يتّصل بضغطة', () => {
        expect(SudanPhone.toLocal('٠٩١٢ ٣٤٥ ٦٧٨')).toBe('0912345678');
        expect(SudanPhone.toLocal('+249912345678')).toBe('0912345678');
        expect(SudanPhone.toLocal('912345678')).toBe('0912345678');
    });
});

describe('نموذج الطلب', () => {
    const home = read('public_html/js/home.js');
    const fn = home.slice(home.indexOf('function collectOrderErrors()'), home.indexOf('function reportOrderErrors('));

    it('🔑 لا فحص بطول الأحرف بعد الآن', () => {
        expect(home).not.toMatch(/Phone\.length < 10/);
        expect(fn).toContain("SudanPhone.problem(val('pickup-phone'))");
        expect(fn).toContain("SudanPhone.problem(val('dropoff-phone'))");
    });

    it('🔑 كل خطأٍ يسمّي خانته — والاسمان يُفحصان', () => {
        for (const t of ["add('pickup-name'", "add('pickup-phone'", "add('dropoff-name'", "add('dropoff-phone'", "add('price'", "add('details'", "add('errand-items'"]) {
            expect(fn, t).toContain(t);
        }
    });

    it('الأخطاء في خاناتها، لا في نافذةٍ تحجب النموذج', () => {
        const v = home.slice(home.indexOf('function validateOrder()'));
        expect(v.slice(0, 400)).toContain('reportOrderErrors(errors');
        expect(home).toContain('FieldErrors.showAll(errors)');
    });

    it('خطأ الخادم يُعرض في خانته حين يسمّيها', () => {
        expect(home).toContain("'dropoff.receiverPhone': 'dropoff-phone'");
        expect(home).toContain('SERVER_FIELD_TO_INPUT[err.field]');
    });

    it('خطأ «حدّد من الخريطة» يزول حين يُحدَّد الموقع', () => {
        const c = home.slice(home.indexOf('window.confirmLocationSelection'));
        expect(c.slice(0, 2500)).toContain('FieldErrors.clear(addrEl)');
    });

    it("إعادة الطلب لا تنسخ '-' إلى هاتف المرسل", () => {
        expect(home).toContain("set('pickup-phone', realPhone(d.pPhone))");
    });

    it('field-errors.js يُحمَّل قبل home.js', () => {
        const idx = read('public_html/index.html');
        expect(idx.indexOf('js/field-errors.js')).toBeGreaterThan(-1);
        expect(idx.indexOf('js/field-errors.js')).toBeLessThan(idx.indexOf('js/home.js'));
    });

    it('بلا إيموجي في ما يراه العميل', () => {
        expect(home).not.toContain("title: 'تم! 🎉'");
    });
});

describe('الخادم يسمّي الخانة', () => {
    const { validateOrder, MAX_ORDER_PRICE } = require('../middleware/validateMiddleware');
    const run = (body) => {
        let out = null;
        const res = { status: (c) => ({ json: (j) => { out = { code: c, ...j }; } }) };
        let passed = false;
        validateOrder({ body }, res, () => { passed = true; });
        return passed ? 'next' : out;
    };
    const ok = {
        pickup: { address: 'أ', contactName: 'أحمد', contactPhone: '0912345678' },
        dropoff: { address: 'ب', receiverName: 'سارة', receiverPhone: '0912345679' },
        price: 3000, distanceType: 'custom'
    };

    it('🔑 اسم المستلم الناقص: الخانة والرسالة', () => {
        const r = run({ ...ok, dropoff: { ...ok.dropoff, receiverName: '' } });
        expect(r).toMatchObject({ code: 400, field: 'dropoff.receiverName', message: 'اكتب اسم المستلم' });
    });
    it('هاتف المرسل الناقص', () => {
        expect(run({ ...ok, pickup: { ...ok.pickup, contactPhone: '' } })).toMatchObject({ field: 'pickup.contactPhone' });
    });
    it('طلب المتجر لا يُطالَب باسم المرسل ولا هاتفه (يُشتقّان من المتجر)', () => {
        expect(run({ ...ok, orderType: 'shop', pickup: { address: 'متجر' } })).toBe('next');
    });
    it('🔑 السقف مليون كالتفاوض — لا 100,000', () => {
        expect(MAX_ORDER_PRICE).toBe(1000000);
        expect(run({ ...ok, price: 250000 })).toBe('next');
        expect(run({ ...ok, price: 1000001 })).toMatchObject({ field: 'price' });
    });
    it('السليم يمرّ', () => {
        expect(run(ok)).toBe('next');
    });
});

describe('تسجيل تعثّر العملاء', () => {
    const route = read('routes/clientErrors.js');
    const { canonicalField, FIELD_LABELS } = require('../routes/clientErrors');

    it('🔑 لا يُخزَّن ما كتبه العميل — الخانة والرسالة فقط', () => {
        const fe = read('public_html/js/field-errors.js');
        const rep = fe.slice(fe.indexOf('const ClientErrors'));
        expect(rep).toContain("field: typeof e.target === 'string'");
        expect(rep).not.toMatch(/\.value/);
        const schema = require('../models/ClientError').schema;
        expect(Object.keys(schema.paths)).not.toContain('value');
    });

    it('يُمحى بعد 60 يوماً', () => {
        const idx = require('../models/ClientError').schema.indexes().find(([k, o]) => k.createdAt === 1 && o.expireAfterSeconds);
        expect(idx[1].expireAfterSeconds).toBe(60 * 24 * 60 * 60);
    });

    it('النقاط الإضافية تُجمَع معاً، ولكل خانةٍ اسمٌ بلغة الإدارة', () => {
        expect(canonicalField('stop-7-phone')).toBe('stop-phone');
        expect(canonicalField('pickup-phone')).toBe('pickup-phone');
        expect(FIELD_LABELS['pickup-phone']).toBe('هاتف المرسل');
    });

    it('مسار الإبلاغ مُصادَق ومحدود، والقراءة بصلاحيةٍ ونطاق مدينة', () => {
        expect(route).toContain("router.post('/client-errors', protect, reportLimiter");
        expect(route).toContain('FIELD_RE.test(f.field)');
        expect(route).toContain("requireAnyPermission(['view_orders', 'view_complaints'])");
        expect(route).toContain('...getAdminCityFilter(req)');
    });

    it('مركّبٌ قبل /admin، والصفحة في القائمة', () => {
        const idx = read('index.js');
        expect(idx.indexOf("apiRoutes.use(require('./routes/clientErrors'))")).toBeLessThan(idx.indexOf("apiRoutes.use('/admin'"));
        expect(read('public_html/admin.html')).toContain("location.href='admin-client-errors.html'");
        expect(read('public_html/admin-client-errors.html')).toMatch(/data-perm="view_orders,view_complaints"/);
    });
});
