const mongoose = require('mongoose');
const logger = require('../utils/logger');

const settingsSchema = new mongoose.Schema({
    // 🌍 Multi-City Isolation — one Settings document per city.
    // This is the partition key for all pricing, banking, and zone config.
    city: {
        type: String,
        enum: ['Khartoum', 'PortSudan'],
        default: 'Khartoum',
        required: true
    },

    // Pricing Settings
    baseFare: {
        type: Number,
        default: 10,
        required: true,
        min: 0
    },
    costPerKm: {
        type: Number,
        default: 5,
        required: true,
        min: 0
    },
    // 🧭 رسم اختياري لكل نقطة إضافية في التوصيل متعدد النقاط (بعد النقطتين). 0 = تسعير بالمسافة فقط.
    extraStopFee: {
        type: Number,
        default: 0,
        min: 0
    },
    // 🚕 رسوم انتقال خدمة "اشترِ لي" عند رفض العميل السعر بعد وصول الكابتن (0 = بلا رسوم)
    errandTripFee: {
        type: Number,
        default: 0,
        min: 0
    },
    costPerMinute: {
        type: Number,
        default: 2,
        required: true,
        min: 0
    },
    commissionRate: {
        type: Number,
        default: 0.15,
        required: true,
        min: 0,
        max: 1
    },

    // Profit Percentage (for backward compatibility with old Setting.js)
    profitPercentage: {
        type: Number,
        default: 10,
        min: 0,
        max: 100
    },

    // Admin Contact for Emergencies
    adminPhone: {
        type: String,
        default: '249112046348'
    },
    availableBanks: { 
        type: [String], 
        default: ['بنك الخرطوم', 'بنك أمدرمان الوطني', 'بنك فيصل الإسلامي'] 
    },

    // 🏦 Bank Details for Captain Payments
    bankName: {
        type: String,
        default: 'بنك الخرطوم'
    },
    bankAccountName: {
        type: String,
        default: 'ضياء الدين ابراهيم محمد'
    },
    bankAccountNumber: {
        type: String,
        default: '7702038'
    },

    // 💳 Financial System — Default Credit Limit for new captains
    defaultCreditLimit: {
        type: Number,
        default: -5000,
        max: 0,
        min: -1000000
    },

    // 📱 App Update System
    appVersion: {
        type: String,
        default: '1.0.4'  // أحدث إصدار للتطبيق
    },
    minVersion: {
        type: String,
        default: '1.0.4'  // أقل إصدار مقبول (ما دونه يُجبر على التحديث)
    },
    playStoreLink: {
        type: String,
        default: 'https://play.google.com/store/apps/details?id=com.wajeezsd.app'
    },
    forceUpdate: {
        type: Boolean,
        default: false
    },

    // Delivery Zone (Geofencing Polygon)
    deliveryZone: {
        type: [{
            lat: { type: Number, required: true },
            lng: { type: Number, required: true }
        }],
        default: [
            { lat: 15.750, lng: 32.400 },
            { lat: 15.750, lng: 32.650 },
            { lat: 15.450, lng: 32.650 },
            { lat: 15.450, lng: 32.400 }
        ]
    },

    // Metadata (updatedAt is auto-managed by timestamps: true)
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// 🌍 Unique index: enforce ONE settings document per city
settingsSchema.index({ city: 1 }, { unique: true });

// Returns the settings document for the given city.
// If none exists, auto-creates one with all defaults for that city.
// Replaces the old singleton pattern — each city is now its own isolated doc.
settingsSchema.statics.getSettings = async function (city = 'Khartoum') {
    const VALID_CITIES = ['Khartoum', 'PortSudan'];
    const targetCity = VALID_CITIES.includes(city) ? city : 'Khartoum';

    let doc = await this.findOne({ city: targetCity }).lean();
    if (!doc) {
        logger.info({ city: targetCity }, 'Settings: no doc found for city — creating with defaults');
        const created = await this.create({ city: targetCity });
        return created.toObject();
    }
    return doc;
};

// Helper method to get profit percentage for a specific city
settingsSchema.statics.getProfitPercentage = async function (city = 'Khartoum') {
    const settings = await this.getSettings(city);
    return (settings.commissionRate * 100) || 15;
};

module.exports = mongoose.model('Settings', settingsSchema);
