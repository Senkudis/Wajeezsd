const mongoose = require('mongoose');

// 📋 سجل نشاط الإدارة — كل عملية حساسة يقوم بها أي أدمن تُسجَّل هنا
const adminLogSchema = new mongoose.Schema({
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    adminName: { type: String, default: '' }, // نسخة مخزنة للعرض السريع
    adminRole: { type: String, default: 'admin' }, // super_admin | sub_admin

    // نوع العملية — مفتاح مقروء يُستخدم للفلترة والعرض
    action: {
        type: String,
        required: true,
        enum: [
            // الكباتن
            'create_captain', 'approve_captain', 'reject_captain',
            'block_captain', 'unblock_captain', 'delete_captain',
            // الطلبات
            'delete_order', 'update_order', 'cancel_order',
            // المتاجر والأقسام
            'approve_store', 'reject_store', 'delete_store',
            'create_category', 'update_category', 'delete_category',
            // المالية
            'debt_zero', 'debt_partial', 'debt_add',
            'approve_payment', 'reject_payment',
            // الإعدادات
            'update_settings', 'update_pricing', 'update_bank',
            'update_zone',
            // الأدمن المساعد
            'create_sub_admin', 'update_sub_admin', 'delete_sub_admin',
            // عام
            'other'
        ],
        index: true
    },

    // وصف مقروء للعملية (يُعرض مباشرة في لوحة المراقبة)
    description: { type: String, required: true },

    // معرّف العنصر المتأثر (مثل ID الكابتن أو الطلب)
    targetId:   { type: String, default: '' },
    targetName: { type: String, default: '' }, // اسم مقروء للعنصر

    // تفاصيل إضافية (JSON) — مثل القيم القديمة والجديدة
    details: { type: mongoose.Schema.Types.Mixed, default: {} },

    // معلومات الجلسة
    city: { type: String, default: '' },
    ip:   { type: String, default: '' },

}, { timestamps: true });

// Indexes للفلترة السريعة
adminLogSchema.index({ createdAt: -1 });
adminLogSchema.index({ admin: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AdminLog', adminLogSchema);
