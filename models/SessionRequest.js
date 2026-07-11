const mongoose = require('mongoose');

/**
 * SessionRequest — طلب دخول من جهاز جديد
 * عندما يحاول sub_admin الدخول من جهاز لم يُسجَّل من قبل،
 * يُنشأ سجل هنا ويبقى معلقاً حتى يوافق super_admin أو يرفض.
 */
const SessionRequestSchema = new mongoose.Schema({
    // الأدمن المساعد صاحب الطلب
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    adminName: { type: String }, // للعرض السريع دون populate
    adminPhone: { type: String },

    // بصمة الجهاز الجديد
    deviceId:   { type: String, required: true },
    deviceInfo: { type: String, default: 'جهاز غير معروف' }, // Chrome على Android

    // حالة الطلب
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },

    // Token مؤقت يُرسل للفرونت-إند ويُفعَّل فقط بعد الموافقة
    tempToken: { type: String },

    // انتهاء صلاحية الطلب (5 دقائق)
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 5 * 60 * 1000)
    }
}, { timestamps: true });

// حذف تلقائي للطلبات المنتهية (TTL Index)
SessionRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SessionRequest', SessionRequestSchema);
