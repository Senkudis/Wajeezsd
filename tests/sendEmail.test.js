import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer');
const sendEmail = require('../utils/sendEmail.js');

describe('sendEmail.otp — كود التحقق بالبريد', () => {
    let sent;
    beforeEach(() => {
        sent = [];
        vi.restoreAllMocks();
        vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
            sendMail: async (m) => { sent.push(m); return { messageId: 'test' }; },
        });
        process.env.EMAIL_USER = 'info@wajeezsd.com';
    });

    it('كود التفعيل بالقالب وعنوان التفعيل', async () => {
        await sendEmail.otp('a@b.com', '482913', 'verify');
        expect(sent).toHaveLength(1);
        expect(sent[0].to).toBe('a@b.com');
        expect(sent[0].subject).toBe('كود تفعيل حساب وجيز');
        expect(sent[0].html).toContain('482913');
        expect(sent[0].html).toMatch(/<h1[^>]*>تفعيل حسابك<\/h1>/);
        expect(sent[0].html).toContain('صالح لمدة');
        expect(sent[0].html).toContain('10 دقائق');
        expect(sent[0].text).toContain('482913');
        expect(sent[0].from).toContain('<info@wajeezsd.com>');
    });

    it('كود الاستعادة لا يرحّب بمستخدم جديد', async () => {
        await sendEmail.otp('a@b.com', '111222', 'reset');
        expect(sent[0].subject).toContain('استعادة كلمة المرور');
        expect(sent[0].html).toMatch(/<h1[^>]*>استعادة كلمة المرور<\/h1>/);
        expect(sent[0].html).not.toContain('مرحباً بك في');
    });

    it('كود تسجيل Google صالح 5 دقائق — مدة سجلّ Otp', async () => {
        await sendEmail.otp('a@b.com', '333444', 'google');
        expect(sent[0].html).toMatch(/<h1[^>]*>إكمال التسجيل<\/h1>/);
        expect(sent[0].html).toContain('5 دقائق');
    });

    it('بلا بريد لا يُرسل شيئاً', async () => {
        expect(await sendEmail.otp('', '123456')).toBeNull();
        expect(sent).toHaveLength(0);
    });
});
