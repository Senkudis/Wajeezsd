/**
 * 📩 رسائل القبول — مجموعةُ واتساب، وزرٌّ لا يفوت.
 *
 * ثلاثة مطالب من المستخدم:
 *
 * ١) رابط مجموعة واتساب في رسالة قبول الكابتن، مع تنبيهٍ بأهميّة الانضمام.
 * ٢) وزرُّ الإرسال يبقى دائماً: «لو بالغلط ما رسلتها أقدر أضغط الزر تاني».
 *    كانت تُعرض مرّةً في نافذةٍ بعد القبول، فمن أغلقها فقدها ولا سبيل
 *    لبنائها إلا بإلغاء القبول وإعادته.
 * ٣) ورسالة قبولٍ للتجار كذلك — لم تكن موجودة أصلاً: التاجر يُقبل فيتغيّر
 *    صفٌّ في جدول ولا يعلم هو بشيء، وهو الطرف الذي عليه العمل بعد القبول.
 *
 * والروابط تُقرأ من الإعدادات لا من الكود: مجموعات واتساب يُعاد إنشاؤها
 * ويتغيّر رابطها، ورابطٌ ميت في رسالة قبولٍ أسوأ من لا رابط — يضغطه
 * المقبول فيجد باباً مغلقاً في أول تعامله معنا.
 *
 * والوثيقة مُخزَّنة لكل مدينة أصلاً، فحقلٌ واحد لكل دور يكفي: كابتنُ
 * بورتسودان تُقرأ إعداداتُ مدينته فيصله رابطُها.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const root = (...p) => path.join(__dirname, '..', ...p);
const read = (...p) => fs.readFileSync(root(...p), 'utf8');

const Settings = require('../models/Settings');
const {
    buildCaptainApprovalMessage,
    buildMerchantApprovalMessage
} = require('../utils/captainApprovalMessage');

const GROUP = 'https://chat.whatsapp.com/Ivgh1zKjiS848XxefVeXUc';

describe('👥 رابط المجموعة في رسالة الكابتن', () => {
    it('يظهر مع تنبيهٍ بأهميّته', () => {
        const m = buildCaptainApprovalMessage({ name: 'ك', phone: '0912345678', groupLink: GROUP });
        expect(m).toContain('*مهم — انضم لمجموعة الكباتن*');
        expect(m).toContain(GROUP);
    });

    it('🔴 ولا عنوانَ بلا رابطٍ تحته', () => {
        // عنوانٌ يَعِد برابطٍ ثم لا يعطيه يبدو عطلاً في الرسالة
        const m = buildCaptainApprovalMessage({ name: 'ك', phone: '0912345678' });
        expect(m).not.toContain('انضم لمجموعة الكباتن');
    });

    it('ويسبق روابط التحميل — هو أول ما نريده أن يفعل', () => {
        const m = buildCaptainApprovalMessage({ name: 'ك', phone: '0912345678', groupLink: GROUP });
        expect(m.indexOf('مجموعة الكباتن')).toBeLessThan(m.indexOf('تحميل التطبيق'));
    });
});

describe('🏪 رسالة قبول التاجر', () => {
    const full = {
        name: 'حسين', businessName: 'قهوة و كتاب', phone: '0101946361',
        groupLink: GROUP, supportPhone: '249112046348'
    };

    it('تُرحّب باسم المتجر وتقول إنه صار ظاهراً', () => {
        const m = buildMerchantApprovalMessage(full);
        expect(m).toContain('قهوة و كتاب');
        expect(m).toContain('ظاهر للزبائن');
    });

    it('وتعطي معرّف الدخول ولا تَعِد بكلمة مرور', () => {
        const m = buildMerchantApprovalMessage(full);
        expect(m).toContain('0101946361');
        expect(m).toContain('كلمة السر: هي الكتبتها وقت التسجيل');
        expect(m).not.toMatch(/كلمة السر\s*:\s*[A-Za-z0-9!@#$%^&*]{4,}/);
    });

    it('وتقول له ما يفعله أولاً — المتجر الفاضي لا يطلب منه أحد', () => {
        const m = buildMerchantApprovalMessage(full);
        expect(m).toContain('ضيف منتجاتك');
        expect(m).toContain('أوقات الفتح');
    });

    it('وفيها مجموعة التجار', () => {
        expect(buildMerchantApprovalMessage(full)).toContain('*مهم — انضم لمجموعة التجار*');
    });

    it('🔴 ورابطا المتجرين يصلان ولو خلت الإعدادات', () => {
        const m = buildMerchantApprovalMessage({ name: 'ت' });
        expect(m).toContain('play.google.com');
        expect(m).toContain('apps.apple.com');
    });

    it('ولا ترمي على مُدخلٍ غائب', () => {
        expect(() => buildMerchantApprovalMessage()).not.toThrow();
        expect(buildMerchantApprovalMessage({})).toContain('صاحب المتجر');
    });

    it('بلا رموز تعبيرية', () => {
        expect(buildMerchantApprovalMessage(full))
            .not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });
});

describe('⚙️ الروابط تُضبط من الإعدادات', () => {
    it('الحقلان في المخطّط', () => {
        expect(Settings.schema.path('captainGroupLink')).toBeTruthy();
        expect(Settings.schema.path('merchantGroupLink')).toBeTruthy();
    });

    it('🔴 ومسار الحفظ يقبلهما — القائمة البيضاء تُسقط ما ليس فيها بصمت', () => {
        const s = read('routes', 'admin', 'settings.js');
        const allow = s.slice(s.indexOf('const allowedFields'), s.indexOf('const updates'));
        expect(allow).toContain('captainGroupLink');
        expect(allow).toContain('merchantGroupLink');
    });

    it('🔴 ويرفض ما ليس رابط دعوةٍ صحيحاً', () => {
        // رابطٌ خاطئ يُرسَل إلى كل مقبولٍ بعده ولا يُكتشف إلا بشكوى
        const s = read('routes', 'admin', 'settings.js');
        expect(s).toContain('chat\\.whatsapp\\.com');
        expect(s).toContain('رابط المجموعة يجب أن يبدأ');
    });

    it('والواجهة تعرض الحقلين وتحفظهما', () => {
        expect(read('public_html', 'admin-settings.html')).toContain('id="captainGroupLink"');
        expect(read('public_html', 'admin-settings.html')).toContain('id="merchantGroupLink"');
        const js = read('public_html', 'js', 'admin-settings.js');
        expect(js).toContain('data.captainGroupLink');
        expect(js).toContain('data.merchantGroupLink');
    });
});

describe('📲 زرُّ الإرسال لا يفوت', () => {
    const users = read('routes', 'admin', 'users.js');
    const merch = read('routes', 'merchantRequests.js');

    it('🔴 مسارٌ يُعيد رسالة الكابتن في أي وقت', () => {
        expect(users).toContain("router.get('/captains/:id/approval-message'");
    });

    it('ومسارٌ مثله للتاجر', () => {
        expect(merch).toContain("router.get('/admin/:id/approval-message'");
    });

    it('🔒 وكلاهما محروسٌ بصلاحية', () => {
        const cap = users.slice(users.indexOf("'/captains/:id/approval-message'"));
        expect(cap.slice(0, 300)).toContain('requireAnyPermission');
        const m = merch.slice(merch.indexOf("'/admin/:id/approval-message'"));
        expect(m.slice(0, 300)).toContain('requireAnyPermission');
    });

    it('🔒 ونطاق الأدمن المساعد يسري على رسالة الكابتن', () => {
        const cap = users.slice(users.indexOf("'/captains/:id/approval-message'"),
                                users.indexOf('merchants-list'));
        expect(cap).toContain('adminCanActOnUser');
    });

    it('والزرّ ظاهرٌ في ملفّ الكابتن', () => {
        const page = read('public_html', 'admin-captains.html');
        expect(page).toContain('sendApprovalMessage');
        expect(page).toContain('إرسال رسالة القبول عبر واتساب');
    });

    it('وفي تفاصيل طلب التاجر المقبول', () => {
        const page = read('public_html', 'admin-merchant-requests.html');
        expect(page).toContain('sendMerchantApproval');
        expect(page).toContain('إرسال رسالة القبول عبر واتساب');
    });

    it('🔴 ويُنبَّه الأدمن إن لم يُضبط رابط المجموعة — قبل الإرسال لا بعده', () => {
        for (const f of ['admin-captains.html', 'admin-merchant-requests.html']) {
            const page = read('public_html', f);
            expect(page, f).toContain('groupLinkSet');
            expect(page, f).toContain('أرسل بدونه');
        }
        expect(users).toContain('groupLinkSet');
        expect(merch).toContain('groupLinkSet');
    });

    it('وبلا رقم واتساب تُنسَخ الرسالة بدل أن يُقال «تعذّر»', () => {
        for (const f of ['admin-captains.html', 'admin-merchant-requests.html']) {
            expect(read('public_html', f), f).toContain('clipboard.writeText');
        }
    });
});
