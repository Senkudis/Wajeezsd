const { z } = require('zod');

// مخططات التحقق من مسارات المصادقة (auth).
// رسائل الأخطاء بالعربية لتظهر مباشرة للمستخدم.

const registerSchema = z.object({
    name: z.string().trim().min(2, 'الاسم قصير جداً').max(60, 'الاسم طويل جداً'),
    email: z.string().trim().toLowerCase().email('البريد الإلكتروني غير صالح'),
    phone: z.string().trim().min(6, 'رقم الهاتف غير صالح').max(20, 'رقم الهاتف غير صالح'),
    password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل').max(128, 'كلمة المرور طويلة جداً'),
}).passthrough(); // اسمح بالحقول الإضافية (role, city, deviceId...) دون رفضها

// ملاحظة: حقل "email" هنا هو في الواقع "معرّف الدخول" — يقبل بريداً إلكترونياً
// أو رقم هاتف. مسار /login نفسه يفرّق بينهما عبر وجود "@". لذلك نتحقق فقط
// من أنه نص غير فارغ، ولا نفرض صيغة بريد إلكتروني.
const loginSchema = z.object({
    email: z.string().trim().min(1, 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف'),
    password: z.string().min(1, 'يرجى إدخال كلمة المرور'),
}).passthrough();

module.exports = { registerSchema, loginSchema };
