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
    // ⏱️ مهلتا الردّ على سعر البضاعة في "اشترِ لي" (بالدقائق).
    // كان العرض يُعلَّق إلى الأبد: الكابتن واقف في المحل والعميل هاتفه في جيبه،
    // ولا شيء يقرأ quotedAt. الآن تذكيرٌ ثم انتهاء صلاحية.
    // 0 في أيّهما = تعطيل تلك المرحلة.
    errandQuoteReminderMin: {
        type: Number,
        default: 5,
        min: 0
    },
    errandQuoteExpiryMin: {
        type: Number,
        default: 20,
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

    // 📉 الحد الأقصى لنسبة تخفيض السعر المسموحة للعميل من تسعيرة التطبيق (0% - 90%)
    maxDiscountPercent: {
        type: Number,
        default: 10,
        min: 0,
        max: 90
    },

    // 📈 الحد الأقصى لنسبة زيادة السعر / سقف السعر التقديري (0% - 500%)
    maxPriceSurgePercent: {
        type: Number,
        default: 100,
        min: 0,
        max: 500
    },

    // 📍 إثبات التسليم — فحص قرب الكابتن من نقطة التسليم قبل إغلاق الطلب.
    //    'observe' افتراضاً: يحسب ويُسجّل على الطلب ولا يمنع أحداً، فيتيح رؤية
    //    التوزيع الحقيقي للمسافات قبل قرار المنع. يُرفع إلى 'enforce' بعد ذلك.
    deliveryProofMode: {
        type: String,
        enum: ['off', 'observe', 'enforce'],
        default: 'observe'
    },
    deliveryProofRadiusMeters: {
        type: Number,
        default: 500,
        min: 50,
        max: 5000
    },
    deliveryProofMaxLocationAgeMin: {
        type: Number,
        default: 10,
        min: 1,
        max: 120
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
    // 📱 المصدر الوحيد لرقم الإصدار هو package.json — تضبطه
    //    `node scripts/check-version.js --set x.y.z` مع build.gradle و app-core.js.
    //    كتابته حرفياً هنا كانت تُنتج انحرافاً صامتاً: بقي 1.2.1 في ثلاثة ملفات
    //    بينما التطبيق 1.2.2، فرأى المستخدمون "تحديث متاح" لنسخة مثبّتة أصلاً.
    appVersion: {
        type: String,
        default: () => require('../package.json').version   // أحدث إصدار للتطبيق
    },
    minVersion: {
        type: String,
        default: () => require('../package.json').version   // أقل إصدار مقبول (ما دونه يُجبر على التحديث)
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

    // ⏱️ عتبات التنبيهات الاستباقية — بالدقائق ما لم يُذكر غير ذلك.
    // كانت ثابتة في scheduler.js، ونقلها هنا يتيح للإدارة ضبطها لكل مدينة
    // على حدة: مدينة صغيرة يُقبل فيها الطلب خلال دقائق تحتاج عتبات أضيق
    // من مدينة تمتدّ فيها المسافات.
    nudges: {
        // مفتاح إيقاف عام — يوقف كل التنبيهات الاستباقية لهذه المدينة
        enabled: { type: Boolean, default: true },

        // العميل: الطلب معلّق ولم يقبله كابتن
        clientDelay1: { type: Number, default: 30,  min: 1, max: 1440 },
        clientDelay2: { type: Number, default: 120, min: 1, max: 1440 },

        // الكابتن: قَبِل الطلب ولم يستلم الطرد
        captainPickup1: { type: Number, default: 15, min: 1, max: 1440 },
        captainPickup2: { type: Number, default: 40, min: 1, max: 1440 },

        // الكابتن: استلم الطرد ولم يسلّمه
        captainDeliver1: { type: Number, default: 30, min: 1, max: 1440 },
        captainDeliver2: { type: Number, default: 75, min: 1, max: 1440 },

        // تتبّع الموقع متوقّف أثناء مهمة نشطة
        gpsStale: { type: Number, default: 12, min: 1, max: 240 },

        // رسالة عميل بلا قراءة
        chatUnread: { type: Number, default: 8, min: 1, max: 240 },

        // تحذير الحد الائتماني — نسبة مئوية لا دقائق.
        // warnPct: عند بلوغها يُرسل التحذير. resetPct: عند الهبوط دونها
        // يُصفَّر التحذير كي يعمل في دورة المديونية التالية.
        creditWarnPct:  { type: Number, default: 80, min: 50, max: 99 },
        creditResetPct: { type: Number, default: 60, min: 0,  max: 98 }
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

// القيم الافتراضية لعتبات التنبيه — مصدر واحد يقرأ منه الخادم والواجهة.
// ⚠️ لا يمكن الاعتماد على defaults في المخطّط وحدها: getSettings تستخدم
// .lean() فتُعيد BSON خاماً بلا تطبيق الافتراضيات، ووثائق الإعدادات
// المنشأة قبل هذه الميزة لا تحتوي حقل nudges أصلاً.
const NUDGE_DEFAULTS = Object.freeze({
    enabled: true,
    clientDelay1: 30,
    clientDelay2: 120,
    captainPickup1: 15,
    captainPickup2: 40,
    captainDeliver1: 30,
    captainDeliver2: 75,
    gpsStale: 12,
    chatUnread: 8,
    creditWarnPct: 80,
    creditResetPct: 60
});

/**
 * عتبات التنبيه لمدينة، مدموجة فوق الافتراضيات.
 * أي حقل ناقص أو غير رقمي يعود لقيمته الافتراضية — إعداد واحد تالف
 * يجب ألا يُعطّل كل التنبيهات.
 */
settingsSchema.statics.getNudgeSettings = async function (city = 'Khartoum') {
    const settings = await this.getSettings(city);
    const stored = (settings && settings.nudges) || {};
    const merged = { ...NUDGE_DEFAULTS };

    for (const key of Object.keys(NUDGE_DEFAULTS)) {
        const val = stored[key];
        if (key === 'enabled') {
            if (typeof val === 'boolean') merged.enabled = val;
        } else if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
            merged[key] = val;
        }
    }
    return merged;
};

// Helper method to get profit percentage for a specific city
settingsSchema.statics.getProfitPercentage = async function (city = 'Khartoum') {
    const settings = await this.getSettings(city);
    return (settings.commissionRate * 100) || 15;
};

module.exports = mongoose.model('Settings', settingsSchema);
// تُصدَّر ليعرضها مسار الإدارة كقيم مرجعية في نموذج الضبط
module.exports.NUDGE_DEFAULTS = NUDGE_DEFAULTS;
