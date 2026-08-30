const mongoose = require('mongoose');

/**
 * 🪪 عضو فريق بلا حساب في التطبيق.
 *
 * صفحة الفريق تُبنى أساساً من `users` — كل كابتن يُعتمَد أو أدمن يُضاف يظهر
 * تلقائياً بلا تدخّل. لكن بعض من يمثّل الشركة لا يملك حساباً أصلاً ولا يحتاجه:
 * مستشار، أو شريك مؤسس لا يستعمل التطبيق، أو موظّف إداري لا علاقة له بالطلبات.
 * إجبارهم على حساب وهمي يلوّث `users` بسجلات بلا هاتف صالح ولا دور حقيقي،
 * وتظهر في إحصاءات الكباتن والتجّار وفي قوائم التوزيع.
 *
 * لذلك هذه مجموعة منفصلة تماماً: تُقرأ مع المستخدمين عند بناء الصفحة، ولا
 * تمسّ المصادقة ولا الطلبات ولا المحاسبة بأي شكل.
 *
 * ⚠️ الشكل هنا مسطّح، بينما نظيره في User داخل `teamProfile`. المحوّل
 * `teamMemberToUserShape` في utils/teamProfile.js يوحّدهما، فكل منطق العرض
 * والترتيب والإسقاط يبقى نسخةً واحدة لا نسختين تتباعدان.
 */
const TeamMemberSchema = new mongoose.Schema(
    {
        // معرّف البطاقة العام — نفس شكل معرّف المستخدم (24 hex غُفل)، فالروابط
        // المطبوعة لا يُفرَّق بينها ولا يُستدل منها على مصدر العضو
        publicId: { type: String, unique: true, sparse: true },

        name: { type: String, required: [true, 'الاسم مطلوب'], trim: true, maxlength: 100 },

        // نفس أدوار صفحة الفريق كي يعمل ترتيب الأولوية (إدارة ← كباتن ← شركاء)
        // بلا استثناء خاص. الافتراضي إدارة: من يُضاف يدوياً هو غالباً كذلك.
        role: { type: String, enum: ['admin', 'captain', 'merchant'], default: 'admin' },

        jobTitles:  { type: [String], default: [] },
        department: { type: String, default: '', maxlength: 100 },
        photo:      { type: String, default: '' },
        order:      { type: Number, default: 0 },
        show:       { type: Boolean, default: true },

        // من أضافه — للمساءلة، فالإضافة اليدوية تنشر اسماً على صفحة عامة
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    },
    { timestamps: true }
);

// نفس فهرس صفحة الفريق: فلترة بالظهور وترتيب تصاعدي
TeamMemberSchema.index({ show: 1, role: 1, order: 1 });

module.exports = mongoose.model('TeamMember', TeamMemberSchema);
