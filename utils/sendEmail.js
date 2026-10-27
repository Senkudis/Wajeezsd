const nodemailer = require("nodemailer");
const { getVerificationEmailTemplate } = require("./emailTemplate");
const logger = require('./logger');

/**
 * إرسال بريد إلكتروني باستخدام SMTP مع إعدادات Secure SSL/TLS
 */
const sendEmail = async (email, subject, content, isVerification = false, templateOpts = {}) => {
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: Number(process.env.EMAIL_PORT) || 465,
            secure: process.env.EMAIL_SECURE === 'true',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                // 🔒 التحقق من شهادة الخادم مُفعَّل افتراضياً. كان معطَّلاً دائماً،
                //    ومعه يستطيع من يعترض الاتصال انتحال خادم البريد والتقاط
                //    EMAIL_USER/EMAIL_PASS. يُعطَّل فقط بضبط صريح لخوادم داخلية
                //    بشهادة موقَّعة ذاتياً.
                rejectUnauthorized: process.env.EMAIL_TLS_INSECURE !== 'true'
            },
            connectionTimeout: 10000 
        });

        // إذا كانت الرسالة هي كود تفعيل، نستخدم القالب الجميل
        let htmlContent = content;
        let textContent = content.toString().replace(/<[^>]*>?/gm, '');
        if (isVerification) {
            htmlContent = getVerificationEmailTemplate(content, templateOpts);
            textContent = `${subject}: ${content}`;
        }

        const info = await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'تطبيق وجيز'}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: subject,
            html: htmlContent, 
            text: textContent
        });

        logger.info({ messageId: info.messageId }, 'Email sent successfully');
        return info;
    } catch (error) {
        logger.error({ err: error }, 'Email send failed');
        return null;
    }
};

/**
 * كود تحقق بالبريد — قناة احتياطية لا تعتمد على مزوّد الرسائل القصيرة (حساب BRQ محظور منذ 2026-10-15).
 * @param {'verify'|'reset'} purpose
 */
const OTP_EMAIL = {
    verify: { subject: 'كود تفعيل حساب وجيز', title: 'تفعيل حسابك' },
    reset: {
        subject: 'كود استعادة كلمة المرور — وجيز', title: 'استعادة كلمة المرور',
        intro: 'وصلنا طلب لاستعادة كلمة مرور حسابك في <strong>وجيز</strong>. استخدم الكود أدناه خلال 10 دقائق:',
    },
};
sendEmail.otp = (email, code, purpose = 'verify') => {
    if (!email) return Promise.resolve(null);
    const t = OTP_EMAIL[purpose] || OTP_EMAIL.verify;
    return sendEmail(email, t.subject, String(code), true, { title: t.title, intro: t.intro });
};

module.exports = sendEmail;
