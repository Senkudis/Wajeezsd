const mongoose = require('mongoose');

// 💬 رد واحد داخل تذكرة الدعم الفني
const replySchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderRole: {
        type: String,
        enum: ['client', 'admin'],
        required: true
    },
    message: {
        type: String,
        required: true,
        maxlength: 2000
    },
    images: [{ type: String }] // روابط صور مرفقة
}, { timestamps: true });

const ComplaintSchema = new mongoose.Schema(
    {
        // ── معلومات العميل ──
        client: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        // ── معلومات الطلب (اختياري — بعض الشكاوى لا ترتبط بطلب) ──
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'orderModel',
            default: null
        },
        orderModel: {
            type: String,
            enum: ['Order', 'ShopOrder'],
            default: 'Order'
        },

        // ── عنوان التذكرة ──
        subject: {
            type: String,
            required: true,
            default: 'شكوى جديدة',
            maxlength: 200
        },

        // ── تصنيف المشكلة ──
        category: {
            type: String,
            enum: [
                'late_delivery',   // تأخر التوصيل
                'wrong_item',      // منتج خاطئ
                'captain_behavior',// سلوك الكابتن
                'payment',         // مشكلة في الدفع
                'app_bug',         // خطأ في التطبيق
                'missing_item',    // منتج ناقص
                'store_issue',     // مشكلة في المتجر
                'other'            // أخرى
            ],
            default: 'other'
        },

        // ── السبب (للتوافق مع النظام القديم) ──
        reason: {
            type: String,
            default: ''
        },

        // ── الوصف الأولي ──
        description: {
            type: String,
            required: true,
            maxlength: 2000
        },

        // ── صور مرفقة من العميل ──
        images: [{ type: String }],

        // ── الحالة ──
        status: {
            type: String,
            enum: ['open', 'in_progress', 'resolved', 'dismissed', 'pending'],
            default: 'open',
            index: true
        },

        // ── الأولوية ──
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'urgent'],
            default: 'medium',
            index: true
        },

        // ── الأدمن المعيَّن لهذه التذكرة ──
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },

        // ── سلسلة الردود (محادثة داخل التذكرة) ──
        replies: [replySchema],

        // ── وقت الحل ──
        resolvedAt: { type: Date, default: null },

        // ── وقت آخر رد (للفرز السريع) ──
        lastReplyAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// Indexes للفلترة والعرض السريع
ComplaintSchema.index({ status: 1, priority: -1, createdAt: -1 });
ComplaintSchema.index({ assignedTo: 1, status: 1 });

module.exports = mongoose.model('Complaint', ComplaintSchema);
