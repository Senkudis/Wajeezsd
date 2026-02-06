/**
 * قالب بريد إلكتروني احترافي لتطبيق وصل-لي
 * @param {string} code - كود التفعيل
 * @returns {string} HTML content
 */
const getVerificationEmailTemplate = (code) => {
    return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {
                font-family: 'Cairo', Arial, sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                padding: 0;
            }
            .container {
                max-width: 600px;
                margin: 20px auto;
                background-color: #ffffff;
                border-radius: 15px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            }
            .header {
                background-color: #0a8754; /* اللون الأخضر الخاص بالموقع */
                padding: 30px;
                text-align: center;
            }
            .header img {
                max-width: 150px;
            }
            .content {
                padding: 40px 30px;
                text-align: center;
                color: #2c3e50;
            }
            .content h1 {
                font-size: 24px;
                margin-bottom: 20px;
                color: #0a8754;
            }
            .content p {
                font-size: 16px;
                line-height: 1.6;
                margin-bottom: 30px;
            }
            .code-box {
                background-color: #f8f9fa;
                border: 2px dashed #0a8754;
                padding: 20px;
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 5px;
                color: #0a8754;
                border-radius: 10px;
                display: inline-block;
                margin-bottom: 30px;
            }
            .footer {
                background-color: #2c3e50;
                color: #ffffff;
                padding: 20px;
                text-align: center;
                font-size: 14px;
            }
            .footer p {
                margin: 5px 0;
            }
            .btn {
                background-color: #0a8754;
                color: white;
                padding: 12px 25px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
                display: inline-block;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <!-- يمكن استبدال هذا الرابط برابط شعار موقعك الفعلي -->
                <h2 style="color: white; margin: 0;">وصل-لي</h2>
            </div>
            <div class="content">
                <h1>تفعيل حسابك</h1>
                <p>مرحباً بك في تطبيق <strong>وصل-لي</strong>. يسعدنا انضمامك إلينا! يرجى استخدام كود التفعيل أدناه لإتمام عملية التسجيل:</p>
                <div class="code-box">${code}</div>
                <p>إذا لم تكن قد طلبت هذا الكود، يرجى تجاهل هذا البريد الإلكتروني.</p>
            </div>
            <div class="footer">
                <p>جميع الحقوق محفوظة &copy; 2026 تطبيق وصل-لي</p>
                <p>خدمة توصيل سريعة وآمنة</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

module.exports = { getVerificationEmailTemplate };
