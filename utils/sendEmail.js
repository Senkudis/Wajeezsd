const nodemailer = require("nodemailer");
const { getVerificationEmailTemplate } = require("./emailTemplate");
const logger = require('./logger');

/**
 * إرسال بريد إلكتروني باستخدام SMTP مع إعدادات Secure SSL/TLS
 */
const sendEmail = async (email, subject, content, isVerification = false) => {
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT || 465,
            secure: process.env.EMAIL_SECURE === 'true',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                rejectUnauthorized: false
            },
            connectionTimeout: 10000 
        });

        // إذا كانت الرسالة هي كود تفعيل، نستخدم القالب الجميل
        let htmlContent = content;
        if (isVerification) {
            htmlContent = getVerificationEmailTemplate(content);
        }

        const info = await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'تطبيق وجيز'}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: subject,
            html: htmlContent, 
            text: content.toString().replace(/<[^>]*>?/gm, '') 
        });

        logger.info({ messageId: info.messageId }, 'Email sent successfully');
        return info;
    } catch (error) {
        logger.error({ err: error }, 'Email send failed');
        return null;
    }
};

module.exports = sendEmail;
