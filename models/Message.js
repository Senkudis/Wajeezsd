const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
    {
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        receiver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        order: { // تأكد من الاسم هنا
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
        },
        // 📝 النص اختياري الآن: رسالة الصورة قد تُرسل بلا تعليق.
        // التحقق في pre('validate') أدناه يمنع الرسالة الفارغة تماماً.
        text: {
            type: String,
            default: ''
        },

        // 🖼️ صورة مرفقة — مسار نسبي مثل /uploads/chat/xxx.jpg
        // صور فقط بقرار المنتج: الملفات العامة (PDF/APK) سطح هجوم ومساحة تخزين
        // بلا فائدة في محادثة توصيل.
        imageUrl: { type: String, default: null },

        // ⏳ صور الدردشة تُحذف من القرص بعد 48 ساعة (scheduler.js).
        // نُبقي الرسالة ونضع هذا الطابع، فيعرض التطبيق "انتهت صلاحية الصورة"
        // بدل صورة مكسورة — وسجلّ المحادثة يبقى متّصلاً للمراجعة.
        imageExpiredAt: { type: Date, default: null },
        tempId: {
            type: String, // To sync optimistic UI messages
        },
        isRead: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// رسالة بلا نص وبلا صورة لا معنى لها — ونصّ `required` وحده كان يمنع رسالة
// الصورة الصامتة، فالتحقق هنا يقبل أيّاً منهما ويرفض الفراغ.
MessageSchema.pre('validate', function (next) {
    const hasText = typeof this.text === 'string' && this.text.trim().length > 0;
    if (!hasText && !this.imageUrl) {
        return next(new Error('الرسالة يجب أن تحتوي نصاً أو صورة'));
    }
    next();
});

// 🔎 الفهرس الذي تعتمد عليه كل قراءة للمحادثة (routes/chat.js وعارض الأدمن):
// البحث بالطلب مع الترتيب زمنياً. بدونه يمسح Mongo المجموعة كاملة لكل فتح دردشة.
MessageSchema.index({ order: 1, createdAt: -1 });
// 🧹 مهمة حذف الصور تبحث عن الرسائل التي لها صورة حيّة أقدم من 48 ساعة
MessageSchema.index({ imageUrl: 1, createdAt: 1 });
// 👁️ عارض محادثات الإدارة يجمع رسائل نافذة زمنية (آخر 30 يوماً افتراضياً).
// الفهرسان أعلاه يبدآن بحقل آخر فلا يخدمان نطاقاً على التاريخ وحده.
MessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);