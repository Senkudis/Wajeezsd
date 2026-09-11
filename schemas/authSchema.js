const { z } = require('zod');
const { VEHICLE_VALUES } = require('../utils/vehicleTypes');

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

// تسجيل الكابتن. كان المسار الوحيد بلا مخطّط رغم أنه يُنشئ حساباً كاملاً.
// vehicleType خصوصاً: قيمة خارج القائمة كانت تصل إلى Mongoose فيرفضها enum
// ويسقط الطلب في catch العام ⇒ 500 بدل 400 برسالة مفهومة.
// 🪪 حقول طلب الانتساب — منقولة من موقع التسجيل المعتمد بنفس قواعده.
//    الرقم الوطني 11 رقماً بالضبط (قاعدة الموقع حرفياً)، والمسافات تُزال
//    قبل الفحص لأن الناس يكتبونه مقسّماً.
const sudaneseNationalId = z.string()
    .trim()
    .transform(v => v.replace(/\s/g, ''))
    .refine(v => /^\d{11}$/.test(v), 'الرقم الوطني يجب أن يتكون من 11 رقماً بالضبط (أرقام فقط)');

const captainRegisterSchema = registerSchema.extend({
    vehicleType: z.enum(VEHICLE_VALUES, { message: 'وسيلة التوصيل غير صالحة' }),

    nationalId: sudaneseNationalId,
    address:    z.string().trim().min(2, 'المنطقة مطلوبة').max(120, 'المنطقة طويلة جداً'),
    whatsapp:   z.string().trim().min(6, 'رقم الواتساب غير صالح').max(20, 'رقم الواتساب غير صالح'),

    emergencyPhone:       z.string().trim().min(6, 'رقم الطوارئ غير صالح').max(20, 'رقم الطوارئ غير صالح'),
    emergencyContactName: z.string().trim().min(2, 'اسم جهة الطوارئ مطلوب').max(60, 'الاسم طويل جداً'),
    emergencyRelation:    z.string().trim().min(2, 'صلة القرابة مطلوبة').max(40, 'صلة القرابة طويلة جداً'),

    // الإقرار الخطي: دليل الموافقة على الشروط، فحدٌّ أدنى معقول يمنع «.»
    pledgeText: z.string().trim().min(10, 'الإقرار الخطي مطلوب').max(2000, 'الإقرار طويل جداً'),

    // اختيارية في الموقع الأصلي كذلك
    plateNumber: z.string().trim().max(30, 'رقم اللوحة طويل جداً').optional().or(z.literal('')),
    hasCarrier:  z.string().trim().max(20).optional().or(z.literal('')),
});

module.exports = { registerSchema, loginSchema, captainRegisterSchema };
