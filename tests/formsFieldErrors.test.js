/**
 * 🎯 أخطاء الإدخال في خاناتها — التسجيل وتسجيل الكابتن وانضمام المتجر
 * والطلب من صفحة متجر (بعد نموذج الطلب في fieldErrors.test.js).
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('الخادم يسمّي الخانة', () => {
    it('🔑 مُتحقِّق Zod يعيد field وerrors — وmessage كما كان للنسخ القديمة', () => {
        const { z } = require('zod');
        const { validate } = require('../middleware/validate');
        const schema = z.object({ name: z.string().min(2, 'الاسم قصير'), phone: z.string().min(6, 'الهاتف غير صالح') });
        let out = null;
        const res = { status: (c) => ({ json: (j) => { out = { code: c, ...j }; } }) };
        validate(schema)({ body: { name: 'أ', phone: '1' } }, res, () => {});
        expect(out.code).toBe(400);
        expect(out.message).toBe('الاسم قصير، الهاتف غير صالح');
        expect(out.field).toBe('name');
        expect(out.errors).toEqual([{ field: 'name', message: 'الاسم قصير' }, { field: 'phone', message: 'الهاتف غير صالح' }]);
    });

    it('المسجّل مسبقاً والرقم الوطني المكرّر يسمّيان خانتهما', () => {
        const auth = read('routes/auth.js');
        expect(auth).toContain("field: 'email' });");
        expect(auth).toContain("field: 'phone' });");
        expect((auth.match(/field: 'nationalId'/g) || []).length).toBeGreaterThanOrEqual(3);
    });
});

describe('تسجيل العميل', () => {
    const page = read('public_html/client-register.html');

    it('🔑 كل خانةٍ بخطئها — لا «الرجاء ملء جميع الحقول»', () => {
        // لا تُعرض بعد الآن (ذكرها في تعليق الشرح تاريخٌ لا واجهة)
        expect(page).not.toContain('errorDiv.innerText = "الرجاء ملء جميع الحقول"');
        for (const t of ["target: 'name'", "target: 'phone'", "target: 'email'", "target: 'password'", "target: 'registerCity'"]) {
            expect(page, t).toContain(t);
        }
        expect(page).toContain("FieldErrors.report(errs, { form: 'register'");
    });
    it('الهاتف كالخادم: لا /^(09|01)\\d{8}$/ الذي يرفض الأرقام العربية والرقم بلا صفر', () => {
        expect(page).not.toMatch(/const phoneRegex = /);
        expect(page).toContain('SudanPhone.problem(');
    });
    it('خطأ الخادم في خانته', () => {
        expect(page).toContain('FieldErrors.fromServer(data, REGISTER_SERVER_FIELDS)');
    });
    it('بلا إيموجي في الخيارات', () => {
        expect(page).not.toMatch(/🏙️|🌊|⚠️ لا يمكن تغيير المدينة/);
    });
});

describe('تسجيل الكابتن', () => {
    const page = read('public_html/captain-signup.html');

    it('🔑 هاتف الحساب يُفحص في الخطوة الأولى لا بعد الإرسال', () => {
        const g = page.slice(page.indexOf('function goToStep(step)'));
        expect(g).toContain('SudanPhone.isValid(phone)');
    });
    it('واتساب والطوارئ: رقمٌ يُتّصل به (قد يكون خارجياً)', () => {
        expect(page).toContain("[['whatsapp', 'رقم الواتساب'], ['emergencyPhone', 'رقم الطوارئ']]");
    });
    it('🔑 خطأ الخادم يعيد إلى خطوة الخانة ويعلّمها', () => {
        expect(page).toContain('function showServerFieldError(data)');
        expect(page).toContain("nationalId: ['nationalId', 3]");
        expect(page).toContain("phone: ['phone', 1]");
        expect(page).toContain('} else if (showServerFieldError(data)) {');
    });
    it('والتعثّر يُسجَّل', () => {
        expect(page).toContain("ClientErrors.report('captain_signup'");
        expect(page.indexOf('js/field-errors.js')).toBeGreaterThan(-1);
    });
});

describe('انضمام متجر', () => {
    const page = read('public_html/client-register-shop.html');

    it('🔑 فقاعات المتصفّح معطّلة — كل الأخطاء معاً في خاناتها', () => {
        expect(page).toContain('<form id="merchantForm" onsubmit="submitForm(event)" novalidate>');
        expect(page).toContain("FieldErrors.report(errs, { form: 'shop_register'");
    });
    it('الموقع والشعار والهوية والشروط تحت خاناتها لا في نوافذ', () => {
        for (const t of ["add('locationBtn'", "add('box-logo'", "add('box-id'", "add('termsRow'"]) expect(page, t).toContain(t);
        expect(page).not.toContain("Swal.fire('تنبيه', 'يرجى رفع شعار المتجر', 'warning')");
    });
    it('وهاتف المتجر يُفحص ويُرسَل بصيغةٍ نظيفة', () => {
        expect(page).toContain("SudanPhone.problem(v('fPhone'))");
        expect(page).toContain("SudanPhone.toLocal(document.getElementById('fPhone').value)");
    });
    it('الخطأ يزول حين يُحدَّد الموقع أو يُرفع الملف', () => {
        expect(page).toContain("FieldErrors.clear('locationBtn')");
        expect(page).toContain('FieldErrors.clear(`box-${type}`)');
    });
});

describe('الطلب من صفحة متجر', () => {
    const page = read('public_html/shop-detail.html');
    const fn = page.slice(page.indexOf('async function placeOrder()'), page.indexOf('function handleManualPriceEdit()'));

    it('🔑 لا نافذةٌ تعدّد أربعة أشياء لمن نقصه واحد', () => {
        expect(fn).not.toContain('يرجى تحديد موقعك على الخريطة لحساب سعر التوصيل، وإدخال عنوان التوصيل واسم ورقم المستلم');
        for (const t of ["target: 'deliveryAddress'", "target: 'receiverName'", "target: 'receiverPhone'", "target: 'deliveryFee'"]) {
            expect(fn, t).toContain(t);
        }
    });
    it('سعر التوصيل بحدود التلميح نفسه', () => {
        expect(fn).toContain('getShopDeliveryLimits()');
        expect(fn).toContain('أقل سعر توصيل لهذا المشوار');
    });
    it('الهاتف بالصيغة المحلية، والتعثّر يُسجَّل', () => {
        expect(fn).toContain('SudanPhone.toLocal(receiverPhone)');
        expect(fn).toContain("form: 'shop_order'");
    });
    it('بلا إيموجي في رسائل النجاح', () => {
        expect(fn).not.toContain('✅ تم إرسال طلبك!');
        expect(fn).not.toContain('🎉 وفّرت');
    });
});

describe('تسجيل التعثّر لكل النماذج', () => {
    const route = read('routes/clientErrors.js');
    it('🔑 النماذج الخمسة', () => {
        const forms = require('../models/ClientError').schema.path('form').enumValues;
        expect(forms).toEqual(['order', 'register', 'captain_signup', 'shop_register', 'shop_order']);
    });
    it('🔑 نموذجا التسجيل يُبلَّغ عنهما قبل الدخول — بحدٍّ ضيّق لكل عنوان', () => {
        expect(route).toContain("const ANON_FORMS = ['register', 'captain_signup']");
        expect(route).toContain("router.post('/client-errors/anonymous', anonLimiter");
        const fe = read('public_html/js/field-errors.js');
        expect(fe).toContain("const anon = !token && (form === 'register' || form === 'captain_signup')");
    });
    it('الإدارة تصفّي بالنموذج', () => {
        expect(route).toContain('if (FORMS.includes(req.query.form)) match.form = req.query.form');
        expect(read('public_html/admin-client-errors.html')).toContain('<option value="shop_register">انضمام متجر</option>');
    });
});
