const mongoose = require('mongoose');

const merchantRequestSchema = new mongoose.Schema({
    // 🌍 مدينة المتجر — يُشتقّ من إحداثياته، وإلا من مدينة صاحبه.
    //
    // ⚠️ لم يكن موجوداً إطلاقاً، فطلبات المتاجر كانت **بلا تقييد مدينة**:
    //    أدمنٌ مساعد معيَّن على بورتسودان يرى كل المتقدّمين في السودان —
    //    أسماءهم وهواتفهم وأرقام حساباتهم البنكية وصور هوياتهم. وبقيّة
    //    الكيانات (الطلبات، الكباتن، المتاجر) كلّها مقيَّدة بالمدينة منذ
    //    البداية؛ هذه وحدها كانت مفتوحة.
    city: {
        type: String,
        enum: ['Khartoum', 'PortSudan'],
        default: 'Khartoum',
        index: true
    },

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    businessName: {
        type: String,
        required: true
    },
    ownerName: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    location: {
        lat: { type: Number },
        lng: { type: Number }
    },
    address: {
        type: String
    },
    bankName: {
        type: String
    },
    bankAccountNumber: {
        type: String
    },
    bankAccountOwner: {
        type: String
    },
    bankAccount: {
        type: String  // حقل موحّد: "اسم البنك / رقم الحساب"
    },
    category: {
        type: String
    },
    description: {
        type: String  // نبذة موجزة عن المتجر
    },
    referralSource: {
        type: String,  // كيف عرف علينا
        enum: ['social', 'person', 'captain', 'whatsapp', 'google', 'ad', 'market', 'other', ''],
        default: ''
    },
    referralDetail: {
        type: String,  // رقم الشخص (لو person) أو اسم الصفحة/المنصة (لو social)
        default: ''
    },
    logoImage: {
        type: String
    },
    idImage: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    rejectReason: {
        type: String
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('MerchantRequest', merchantRequestSchema);
