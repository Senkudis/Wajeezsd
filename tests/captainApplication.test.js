/**
 * 🪪 نقل تسجيل الكابتن من الموقع الخارجي إلى داخل التطبيق.
 *
 * السبب مباشر: آبل رفضت الإصدار 1.4.1 بالإرشاد 4 —
 *   «يُنقل المستخدم (حساب السائق) إلى المتصفّح الافتراضي للتسجيل، وهي
 *    تجربة استخدام رديئة».
 * الرابط كان `<a href="https://captain.wajeezsd.com" target="_blank">`.
 *
 * والموقع لم يكن نسخةً من نموذج التطبيق بل شيئاً آخر: يجمع الرقم الوطني
 * وجهة الطوارئ والإقرار الخطي وصورتَي الهوية والسيلفي، ويخزّن في SQLite
 * منفصلة. هذه الاختبارات تحرس أن ما كان يجمعه صار يُجمع داخل التطبيق،
 * وأن آلية القبول/الرفض القائمة (approvalStatus) هي التي تستقبله.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const codeOnly = (s) => s.split(/\r?\n/)
    .filter(l => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
    .join('\n');

const { captainRegisterSchema } = require('../schemas/authSchema');
const User = require('../models/User');

const valid = {
    name: 'محمد أحمد الطيب', email: 'cap@example.com', phone: '0912345678',
    password: '123456', vehicleType: 'motorcycle',
    nationalId: '12345678901', address: 'الرياض - مربع 5', whatsapp: '0912345678',
    emergencyPhone: '0911111111', emergencyContactName: 'أخي', emergencyRelation: 'أخ',
    pledgeText: 'أقرّ بأنني قرأت الشروط أعلاه وأوافق عليها وأتعهّد بالالتزام بها.'
};

describe('مخطّط طلب الانتساب', () => {
    it('يقبل طلباً مكتملاً', () => {
        expect(captainRegisterSchema.safeParse(valid).success).toBe(true);
    });

    it('الرقم الوطني 11 رقماً بالضبط — نفس قاعدة الموقع المعتمد', () => {
        for (const bad of ['1234567890', '123456789012', 'abcdefghijk', '']) {
            expect(captainRegisterSchema.safeParse({ ...valid, nationalId: bad }).success).toBe(false);
        }
    });

    it('يقبل الرقم مكتوباً بمسافات ويطبّعه — الناس يكتبونه مقسّماً', () => {
        const r = captainRegisterSchema.safeParse({ ...valid, nationalId: '123 4567 8901' });
        expect(r.success).toBe(true);
        expect(r.data.nationalId).toBe('12345678901');
    });

    it('جهة الطوارئ بأجزائها الثلاثة مطلوبة', () => {
        for (const f of ['emergencyPhone', 'emergencyContactName', 'emergencyRelation']) {
            expect(captainRegisterSchema.safeParse({ ...valid, [f]: '' }).success).toBe(false);
        }
    });

    it('الإقرار الخطي مطلوب ولا يمرّ بنقطة', () => {
        expect(captainRegisterSchema.safeParse({ ...valid, pledgeText: '' }).success).toBe(false);
        expect(captainRegisterSchema.safeParse({ ...valid, pledgeText: '.' }).success).toBe(false);
    });

    it('رقم اللوحة وصندوق الحمل اختياريان — كما في الموقع', () => {
        const r = captainRegisterSchema.safeParse({ ...valid, plateNumber: '', hasCarrier: '' });
        expect(r.success).toBe(true);
    });

    it('ما زال يرفض وسيلة توصيل مجهولة', () => {
        expect(captainRegisterSchema.safeParse({ ...valid, vehicleType: 'tank' }).success).toBe(false);
    });
});

describe('مخطّط المستخدم', () => {
    it('يحمل ملفّ الانتساب وصورتَي الهوية والسيلفي', () => {
        const u = new User({
            name: 'ك', phone: '0912345678', password: 'x', role: 'captain',
            captainApplication: { nationalId: '12345678901', pledgeText: 'أقرّ' },
            documents: { idImage: '/uploads/documents/a.png', selfieImage: '/uploads/documents/b.png' }
        });
        expect(u.validateSync()).toBeUndefined();
        expect(u.captainApplication.nationalId).toBe('12345678901');
        expect(u.documents.selfieImage).toBe('/uploads/documents/b.png');
    });

    it('حساب بلا ملفّ انتساب يبقى صالحاً — الكباتن القدامى لا تُكسر', () => {
        const u = new User({ name: 'ك', phone: '0912345679', password: 'x', role: 'captain' });
        expect(u.validateSync()).toBeUndefined();
        expect(u.captainApplication.nationalId).toBe('');
    });
});

describe('مسار التسجيل', () => {
    const src = codeOnly(read('routes/auth.js'));
    const i = src.indexOf("'/register-captain'");
    const block = src.slice(i, src.indexOf('\nrouter.', i + 20));

    it('يمنع تكرار الرقم الوطني — نفس حماية الموقع', () => {
        // بدونها يسجّل الشخص نفسه مراراً ببريد وهاتف مختلفين
        expect(block).toContain("'captainApplication.nationalId': nationalId");
        expect(block).toContain('409');
    });

    it('يحفظ الملفّ كاملاً على الحساب', () => {
        expect(block).toContain('captainApplication: {');
        for (const f of ['nationalId', 'address', 'whatsapp', 'emergencyPhone',
                         'emergencyContactName', 'emergencyRelation', 'pledgeText']) {
            expect(block).toContain(f);
        }
    });

    it('الحساب يبدأ معلّقاً — القبول يبقى على الآلية القائمة', () => {
        expect(block).toContain("approvalStatus: 'pending'");
    });
});

describe('رفع الوثائق', () => {
    const src = codeOnly(read('routes/upload.js'));

    it('يقبل صورتَي الهوية والسيلفي', () => {
        expect(src).toContain("{ name: 'idImage', maxCount: 1 }");
        expect(src).toContain("{ name: 'selfieImage', maxCount: 1 }");
        expect(src).toContain("updates['documents.idImage']");
        expect(src).toContain("updates['documents.selfieImage']");
    });
});

describe('الإرشاد 4 — لا خروج إلى المتصفّح', () => {
    const index = read('public_html/index.html');

    it('«التسجيل ككابتن» يفتح صفحة داخل التطبيق', () => {
        // نفحص **رابطاً** لا مجرّد ورود النصّ: التعليق فوق السطر يذكر العنوان
        // القديم شرحاً لسبب إزالته، ومطابقة النصّ الخام كانت تُفشل الاختبار
        // على شرحه نفسه.
        expect(index).not.toMatch(/href=["']https:\/\/captain\.wajeezsd\.com/);
        expect(index).not.toMatch(/target=["']_blank["'][^>]*>\s*<i[^>]*><\/i>\s*التسجيل ككابتن/);
        expect(index).toMatch(/href="captain-signup\.html"[\s\S]{0,200}التسجيل ككابتن/);
    });

    it('صفحة التسجيل تجمع حقول الموقع كلها', () => {
        const page = read('public_html/captain-signup.html');
        for (const id of ['nationalId', 'address', 'whatsapp', 'emergencyContactName',
                          'emergencyPhone', 'emergencyRelation',
                          'idImage', 'selfieImage', 'plateNumber', 'hasCarrier']) {
            expect(page).toContain(`id="${id}"`);
        }
        // الإقرار لم يعد مربّع نصّ حرّ: صار نصّاً جاهزاً بفراغَي الاسم والرقم
        // (انظر tests/signupUx.test.js) ويُركَّب عند الإرسال.
        expect(page).toContain('id="pledgeName"');
        expect(page).toContain('id="pledgePhone"');
        expect(page).toContain('pledgeText:           buildPledgeText()');
    });

    it('تعرض الوثيقة الرسمية حرفياً لا نصّاً مُعاد صوغه', () => {
        // الكابتن يوقّع إقراراً بأنه قرأ **هذه** البنود. نصٌّ مختصر أو معاد
        // صوغه يجعل الإقرار موقّعاً على وثيقة أخرى غير المعتمدة.
        const page = read('public_html/captain-signup.html');
        expect(page).toContain('وثيقة ضوابط وشروط عمل الكابتن');
        for (const clause of [
            'دستور العمل',            // الديباجة
            'صندوق التوصيل',          // أولاً
            'متوسط زمن التوصيل',      // ثانياً
            'باب العميل',             // ثالثاً
            'تحديد النسبة',           // رابعاً
            'لائحة الجزاءات',         // خامساً
            'مخالفات الشرف والأمانة'  // جدول الجزاءات
        ]) {
            expect(page).toContain(clause);
        }
    });

    it('صيغة الإقرار هي نصّ البند السادس', () => {
        expect(read('public_html/captain-signup.html'))
            .toContain('بأنني قرأت جميع الشروط والضوابط المذكورة أعلاه');
    });
});

describe('الإرشاد 5.1.1(v) — التصفّح بلا تسجيل', () => {
    const src = codeOnly(read('public_html/js/errand-picker.js'));

    it('فتح منتقي المحلات لا يحوّل الزائر لتسجيل الدخول', () => {
        // كان أول سطر في openErrandPicker يحوّل فوراً — وهو تصفّح لا ميزة حسابية
        const i = src.indexOf('window.openErrandPicker');
        const head = src.slice(i, i + 400);
        expect(head).not.toContain("client-login.html");
    });

    it('بوّابة بدء الطلب تبقى — ذاك فعلٌ حسابي', () => {
        const ctx = codeOnly(read('public_html/js/errand-context.js'));
        expect(ctx).toContain("client-login.html");
    });
});

describe('لوحة المراجعة', () => {
    const src = read('public_html/js/admin-panel.js');
    const css = read('public_html/css/admin-panel.css');
    const i = src.indexOf('function _captainDossier');
    const block = src.slice(i, src.indexOf('function renderPendingCaptains', i));

    it('تعرض ملفّ الانتساب والوثائق للأدمن', () => {
        // بلا العرض تصير المراجعة قراراً باسمٍ وهاتف فقط
        expect(src).toContain('_captainDossier');
        expect(block).toContain('captainApplication');
        expect(block).toContain("['selfieImage', 'سيلفي']");
    });

    it('تهرب النصوص القادمة من الكابتن', () => {
        expect(block).toContain('esc(a.pledgeText)');
    });

    it('كل وثيقة تحمل تسميتها — المطابقة بين الهوية والسيلفي هي الغرض', () => {
        // خمس مصغّرات رمادية بلا أسماء تجعل المراجعة تخميناً
        expect(block).toContain('cap-doc-name');
        for (const label of ['الهوية', 'سيلفي', 'الرخصة', 'المركبة', 'شخصية']) {
            expect(block).toContain(label);
        }
        // الهوية والسيلفي متجاورتان في الترتيب — تُقارنان بالعين
        expect(block.indexOf("'idImage'")).toBeLessThan(block.indexOf("'selfieImage'"));
    });

    it('الوثيقة الناقصة تُعرض باهتة لا تُحذف — غيابها معلومة للمراجع', () => {
        expect(block).toContain('cap-doc is-missing');
        expect(css).toContain('.cap-doc.is-missing');
    });

    it('الشبكة تستجيب للعرض بلا media query — البطاقة قد تكون في عمود ضيّق', () => {
        expect(css).toContain('grid-template-columns: repeat(auto-fit, minmax(210px, 1fr))');
        expect(css).toContain('grid-template-columns: repeat(auto-fill, minmax(78px, 1fr))');
    });

    it('القيم الطويلة لا تمدّ البطاقة ولا تنقلب أرقامها', () => {
        const rule = css.slice(css.indexOf('.cap-fact-value'), css.indexOf('.cap-fact-value') + 200);
        expect(rule).toContain('overflow-wrap: anywhere');
        expect(rule).toContain('unicode-bidi: isolate');
    });

    it('تستعمل رموز التصميم لا ألواناً مكتوبة', () => {
        expect(css).toContain('var(--gv-primary)');
        expect(css).toContain('var(--gv-border)');
        expect(css).toContain('var(--gv-radius-sm)');
    });

    it('لها وضعٌ ليلي', () => {
        expect(css).toContain('body.dark-mode .cap-fact');
    });
});
