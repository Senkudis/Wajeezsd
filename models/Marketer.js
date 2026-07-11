const mongoose = require('mongoose');

// توليد كود فريد بصيغة WJZ-XXXX
function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'WJZ-';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

const marketerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    referralCode: {
        type: String,
        unique: true,
        default: generateReferralCode
    },
    notes: {
        type: String,
        default: ''
    },
    reward: {
        type: String,
        default: '' // مثال: "500 جنيه لكل متجر" — يحدده الأدمن
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'inactive'],
        default: 'pending'
    },
    createdBy: {
        type: String,
        enum: ['admin', 'self'],
        default: 'self'
    }
}, { timestamps: true });

// index للبحث السريع
marketerSchema.index({ phone: 1 });
marketerSchema.index({ status: 1 });

module.exports = mongoose.model('Marketer', marketerSchema);
