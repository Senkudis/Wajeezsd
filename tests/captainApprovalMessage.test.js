/**
 * 📩 رسالة قبول الكابتن.
 *
 * القيد الحاكم: **لا كلمة مرور في الرسالة، ولا يمكن أن تكون.** مخزَّنة
 * مُعمّاة (bcrypt) ولا تُقرأ حتى من القاعدة — وهذا صحيحٌ أمنياً. والكابتن
 * هو من اختارها. فالرسالة تذكّر بمعرّف الدخول وتدلّ على الاستعادة.
 * أي صياغة تَعِد بإرسال كلمة المرور تَعِد بما لا يُنفَّذ.
 *
 * وواتساب لا إشعار التطبيق: الكابتن المقبول لم يدخل التطبيق بعد — سجّل
 * ثم انتظر، فإشعارٌ داخله قد لا يراه أحد.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const { buildCaptainApprovalMessage, localPhone } = require('../utils/captainApprovalMessage');

const full = {
    name: 'محمد أحمد الطيب',
    phone: '249912345678',
    email: 'cap@example.com',
    appLink: 'https://play.google.com/store/apps/details?id=com.wajeezsd.app',
    supportPhone: '249112046348'
};

describe('localPhone', () => {
    it('يحوّل الصيغة الدولية إلى محلية مقروءة', () => {
        expect(localPhone('249912345678')).toBe('0912345678');
        expect(localPhone('+249 91 234 5678')).toBe('0912345678');
    });
    it('يترك المحلي كما هو', () => {
        expect(localPhone('0912345678')).toBe('0912345678');
    });
    it('لا يرمي على الفارغ', () => {
        expect(localPhone('')).toBe('');
        expect(localPhone(null)).toBe('');
    });
});

describe('بناء الرسالة', () => {
    const msg = buildCaptainApprovalMessage(full);

    it('لا تحتوي كلمة مرور — تُذكّر بالتي اختارها', () => {
        expect(msg).toContain('كلمة المرور: هي التي اخترتها عند التسجيل');
        expect(msg).not.toMatch(/كلمة المرور\s*:\s*[A-Za-z0-9!@#$%^&*]{4,}/);
    });

    it('تدلّ على الاستعادة لمن نسيها', () => {
        expect(msg).toContain('نسيت كلمة المرور');
    });

    it('تعطي معرّفَي الدخول بصيغة محلية', () => {
        expect(msg).toContain('0912345678');
        expect(msg).toContain('cap@example.com');
    });

    it('تذكر الخطوة التي بدونها لا تصل طلبات', () => {
        // زرّ «متصل» و أذونات الموقع/الإشعارات — أكثر ما يُشكى منه
        expect(msg).toContain('متصل');
        expect(msg).toContain('الإشعارات');
    });

    it('تُنسب البنود للوثيقة لا تخترع قواعد', () => {
        expect(msg).toContain('التوريد في نهاية كل يوم عمل');
        expect(msg).toContain('الإلغاء بعد القبول يعرّض الحساب للتجميد');
    });

    it('بلا رموز تعبيرية', () => {
        expect(msg).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });

    it('تستعمل تنسيق واتساب للعريض', () => {
        expect(msg).toContain('*بيانات الدخول*');
        expect(msg).toContain('*كيف تبدأ*');
    });

    it('قصيرة بما يكفي لرسالة واتساب واحدة', () => {
        expect(msg.length).toBeLessThan(1500);
    });
});

describe('الحقول الناقصة', () => {
    it('بلا بريد: يبقى الهاتف معرّفاً', () => {
        const m = buildCaptainApprovalMessage({ name: 'ك', phone: '0912345678' });
        expect(m).toContain('رقم الهاتف: 0912345678');
        expect(m).not.toContain('أو البريد');
    });

    it('بلا أي معرّف: إرشادٌ عامّ لا سطرٌ فارغ', () => {
        const m = buildCaptainApprovalMessage({ name: 'ك' });
        expect(m).toContain('استخدم رقم هاتفك الذي سجّلت به');
    });

    it('بلا رابط أو دعم: لا عناوين فارغة', () => {
        const m = buildCaptainApprovalMessage({ name: 'ك', phone: '0912345678' });
        expect(m).not.toContain('*تحميل التطبيق*');
        expect(m).not.toContain('لأي استفسار');
    });

    it('بلا اسم: صيغة محايدة لا فراغ', () => {
        expect(buildCaptainApprovalMessage({})).toContain('مبروك الكابتن');
    });

    it('لا يرمي على مُدخل غائب', () => {
        expect(() => buildCaptainApprovalMessage()).not.toThrow();
    });
});

describe('التوصيل', () => {
    const route = read('routes/admin/users.js');
    const i = route.indexOf("approve-captain/:id");
    const block = route.slice(i, route.indexOf('router.', i + 30));

    it('تُرسَل واتساب على رقم نموذج الانتساب', () => {
        expect(block).toContain('captainApplication.whatsapp');
        expect(block).toContain('sendWhatsAppNotification');
    });

    it('فشل الإرسال لا يُفشل القبول — وقع في القاعدة فعلاً', () => {
        expect(block).toContain('.catch(e => logger.warn');
    });

    it('تُعاد في الرد دائماً — الإرسال قد يكون معطّلاً كلياً', () => {
        // services/whatsappService يعطّل الإرسال حين لا يُضبط WHATSAPP_BOT_URL
        expect(block).toContain('approvalMessage');
        expect(block).toContain("res.json({ message: 'تمت الموافقة على الكابتن بنجاح', captain, approvalMessage })");
    });

    it('اللوحة تعرضها للنسخ ولفتح واتساب', () => {
        const panel = read('public_html/js/admin-panel.js');
        expect(panel).toContain('function showApprovalMessage');
        expect(panel).toContain('wa.me/');
        expect(panel).toContain('navigator.clipboard');
    });

    it('اللوحة تقرأ الرقم قبل إعادة التحميل — الصفّ يختفي بعدها', () => {
        const panel = read('public_html/js/admin-panel.js');
        const i2 = panel.indexOf('async function approveCaptain');
        const blk = panel.slice(i2, i2 + 900);
        expect(blk.indexOf('_pendingCaptains')).toBeLessThan(blk.indexOf('loadCaptains()'));
    });
});
