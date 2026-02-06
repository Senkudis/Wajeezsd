const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        phone: { type: String, required: true, unique: true },
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        resetCode: { type: String },

        // ✅ حافظنا على الأدوار القديمة
        role: {
            type: String,
            enum: ['customer', 'client', 'captain', 'admin'],
            default: 'client'
        },

        // ✅ حافظنا على نوع المركبة للكابتن
        vehicleType: {
            type: String,
            enum: ['bicycle', 'electric', 'motorcycle']
        },
        currentLocation: {
            lat: { type: Number },
            lng: { type: Number },
            updatedAt: { type: Date }
        },

        isActive: { type: Boolean, default: true },

        // 👇 الإضافات الجديدة للتفعيل والأمان 👇
        isVerified: { type: Boolean, default: false },
        verificationCode: { type: String },
        verificationCodeExpires: { type: Date }, // ⏰ وقت انتهاء الكود

        isWhatsappSubscribed: { type: Boolean, default: false }, // ✅ WhatsApp Subscription
        otpCode: { type: String }, // ✅ For SMS/WhatsApp OTP
        otpExpires: { type: Date },

        // 🌟 Rating System
        ratingSum: { type: Number, default: 0 },
        ratingCount: { type: Number, default: 0 },
        averageRating: { type: Number, default: 5.0 }, // Default starts high or neutral

        // 💰 Earnings
        wallet: { type: Number, default: 0 },

        // 🔔 FCM for Native Notifications
        fcmToken: { type: String }
    },
    { timestamps: true }
);

UserSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// 🔒 PERFORMANCE: Database Indexes
// unique: true already creates indexes for these fields; avoid duplicate indexes
UserSchema.index({ role: 1, isActive: 1 }); // For finding active captains

module.exports = mongoose.model('User', UserSchema);
