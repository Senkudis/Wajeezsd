/**
 * ⌨️ حقول الدخول والتسجيل — أن يعرف المستخدم ماذا يضع فيها.
 *
 * البلاغ: «أغلب المستخدمين ما بعرفوا يتعاملوا مع الحقول، بالذات في تسجيل
 * الدخول أو التسجيل ككابتن».
 *
 * وأشدّها لم يكن غموضاً بل منعاً: حقل دخول الكابتن كان type="email"
 * وعنوانه «البريد الإلكتروني» وحده — بينما الخادم يقبل الهاتف والبريد
 * جميعاً (/login يبحث بالهاتف إن خلا المُدخَل من @). فالكابتن الذي يذكر
 * رقمه — وهو الأغلب — كان المتصفّح يرفض إدخاله قبل أن يصل الخادم.
 *
 * وبقيّتها إهمال سمات: بلا autocomplete لا يعرض مدير كلمات المرور ما حفظه
 * ولا يعرضه الهاتف، وبلا inputmode تفتح لوحةُ الحروف على حقل أرقام، وبلا
 * one-time-code لا يملأ iOS رمزَ الرسالة وحده — فيُنسَخ يدوياً أو يُخطأ.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'public_html', f), 'utf8');

/** يلتقط وسم <input> صاحب المعرّف، ولو امتدّ على أسطر. */
const tagOf = (html, id) => {
    const m = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'));
    return m ? m[0] : '';
};

describe('🔴 دخول الكابتن يقبل الهاتف كما يقبل البريد', () => {
    const page = read('captain-login.html');

    it('الحقل نصّي — لا يرفض المتصفّحُ رقماً قبل أن يصل الخادم', () => {
        const tag = tagOf(page, 'email');
        expect(tag).toBeTruthy();
        expect(tag).not.toContain('type="email"');
    });

    it('والعنوان يقول الاثنين', () => {
        const label = page.match(/<label for="email"[\s\S]*?<\/label>/)[0];
        expect(label).toContain('رقم الهاتف');
        expect(label).toContain('البريد');
    });

    it('والتلميح يُظهر الصيغتين', () => {
        expect(tagOf(page, 'email')).toContain('09');
    });

    it('ورسالة النقص لا تطلب بريداً وحده', () => {
        const msg = page.match(/showAlert\("يرجى إدخال[^"]*"/)[0];
        expect(msg).toContain('هاتف');
    });

    it('والخادم فعلاً يقبل الاثنين — لا نَعِد بما لا يُنفَّذ', () => {
        const auth = fs.readFileSync(path.join(__dirname, '..', 'routes', 'auth.js'), 'utf8');
        const login = auth.slice(auth.indexOf("router.post('/login'"));
        expect(login).toContain("identifier.includes('@')");
        expect(login).toContain('normalizePhone(identifier)');
    });
});

describe('السمات التي تملأ الحقل نيابةً عن المستخدم', () => {
    const cases = [
        ['client-login.html',    'email',            'username'],
        ['client-login.html',    'password',         'current-password'],
        ['client-login.html',    'forgot-identifier','username'],
        ['client-login.html',    'forgot-new-password', 'new-password'],
        ['captain-login.html',   'email',            'username'],
        ['captain-login.html',   'password',         'current-password'],
        ['admin-login.html',     'password',         'current-password'],
        ['client-register.html', 'name',             'name'],
        ['client-register.html', 'phone',            'tel'],
        ['client-register.html', 'email',            'email'],
        ['client-register.html', 'password',         'new-password'],
        ['captain-signup.html',  'name',             'name'],
        ['captain-signup.html',  'email',            'email'],
        ['captain-signup.html',  'phone',            'tel'],
        ['captain-signup.html',  'password',         'new-password'],
    ];
    for (const [file, id, want] of cases) {
        it(`${file} → #${id} = ${want}`, () => {
            expect(tagOf(read(file), id)).toContain(`autocomplete="${want}"`);
        });
    }
});

describe('رموز الرسائل تُملأ وحدها', () => {
    const codes = [
        ['client-login.html',    'forgot-code'],
        ['client-login.html',    'activation-code'],
        ['client-login.html',    'otp-code'],
        ['client-register.html', 'verificationCode'],
        ['client-register.html', 'otp-code'],
    ];
    for (const [file, id] of codes) {
        it(`${file} → #${id} يقبل رمز الرسالة ولوحةَ أرقام`, () => {
            const tag = tagOf(read(file), id);
            expect(tag).toContain('autocomplete="one-time-code"');
            expect(tag).toContain('inputmode="numeric"');
        });
    }
});

describe('🔴 رقم الطوارئ ليس رقم صاحب الجهاز', () => {
    it('لا يُملأ تلقائياً برقم المستخدم نفسه', () => {
        // autocomplete="tel" هنا يملؤه برقمه هو، فيصير جهةُ الطوارئ نفسه
        const tag = tagOf(read('captain-signup.html'), 'emergencyPhone');
        expect(tag).toContain('autocomplete="off"');
        expect(tag).toContain('inputmode="tel"');
    });
});

describe('الحقول المطلوبة مُعلَّمة', () => {
    it('الخطوة الأولى تُعلّم مطلوباتها كما تفعل الثالثة', () => {
        const page = read('captain-signup.html');
        for (const l of ['الاسم الكامل *', 'المدينة / المنطقة *', 'البريد الإلكتروني *',
                         'رقم الهاتف *', 'كلمة المرور *']) {
            expect(page).toContain(l);
        }
    });
});
