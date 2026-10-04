const mongoose = require('mongoose');
const { CITY_KEYS } = require('../config/cities');   // 🌍 المدن — مصدرٌ واحد

const emergencyAlertSchema = new mongoose.Schema({
    captain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    location: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
    },
    // 🌍 مدينة الكابتن — تُستخدم لتوجيه التنبيه للأدمن المساعد المسؤول عنها
    city: {
        type: String,
        enum: CITY_KEYS,
        default: 'Khartoum'
    },
    status: {
        type: String,
        enum: ['pending', 'acknowledged', 'resolved'],
        default: 'pending'
    },
    acknowledgedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    acknowledgedAt: Date,
    resolvedAt: Date,
    notes: String
}, {
    timestamps: true
});

module.exports = mongoose.model('EmergencyAlert', emergencyAlertSchema);
