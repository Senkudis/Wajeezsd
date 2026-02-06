const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
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

    // Metadata
    updatedAt: {
        type: Date,
        default: Date.now
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Ensure only one settings document exists
settingsSchema.statics.getSettings = async function () {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

// Helper method to get profit percentage
settingsSchema.statics.getProfitPercentage = async function () {
    const settings = await this.getSettings();
    return settings.profitPercentage || settings.commissionRate * 100 || 10;
};

module.exports = mongoose.model('Settings', settingsSchema);
