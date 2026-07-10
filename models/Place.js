const mongoose = require('mongoose');

const PlaceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PlaceCategory',
        required: true
    },
    image_url: { type: String, default: '' },
    phone: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    location: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
    },
    address: { type: String, default: '' },
    map_url: { type: String, default: '' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // 👤 صاحب المتجر
    bankAccountName: { type: String, default: '' }, // 🏦 اسم صاحب الحساب البنكي
    bankAccountNumber: { type: String, default: '' }, // 🔢 رقم الحساب (بنكك)
    bankName: { type: String, default: '' }, // 🏢 اسم البنك
    shopWalletBalance: { type: Number, default: 0 }, // 💰 رصيد محفظة المتجر
    // 💼 ERP: باقة المتجر — basic (ناشئ: منتجات وطلبات ومستحقات فقط)
    // أو pro (كبير: + نقطة بيع وتقارير ومخزون متقدم ومصروفات). الأدمن يتحكم بها.
    tier: { type: String, enum: ['basic', 'pro'], default: 'basic' },
    description: { type: String, default: '' }, // وصف المتجر
    city: { type: String, default: 'Khartoum', index: true }, // 🌍 Multi-city isolation
    workingHours: {
        open: { type: String, default: '08:00' },  // HH:MM
        close: { type: String, default: '22:00' }, // HH:MM
        days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] } // 0=Sun, 6=Sat
    },
    isOpenOverride: { type: Boolean, default: null }, // null = auto-compute
    isActive: { type: Boolean, default: true },
    deliveryAvailable: { type: Boolean, default: true },
    menu: { type: String, default: '' },
    notes: { type: String, default: '' },

    // ⭐ نظام التقييم
    ratingAvg:   { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },

    // 👁️ عداد المشاهدات
    viewsCount:  { type: Number, default: 0 },

    // 🔗 كود المشاركة القصير — wajeezsd.com/s/<shareCode>
    // 6 أحرف base58، يُولَّد مرة واحدة ولا يتغيّر. sparse لأن المتاجر القديمة تُعبّأ تدريجياً.
    shareCode: { type: String, unique: true, sparse: true, index: true },

}, { timestamps: true });

// Virtual: compute is_open from workingHours (Sudan timezone UTC+3)
PlaceSchema.virtual('is_open').get(function () {
    // Safety: if workingHours not loaded (partial populate), return true as default
    if (!this.workingHours) return true;

    if (this.isOpenOverride !== null && this.isOpenOverride !== undefined) {
        return this.isOpenOverride;
    }
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // UTC+3
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const currentMinutes = hour * 60 + minute;

    const openStr = this.workingHours.open || '08:00';
    const closeStr = this.workingHours.close || '22:00';
    const [openH, openM] = openStr.split(':').map(Number);
    const [closeH, closeM] = closeStr.split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    const days = this.workingHours.days || [0, 1, 2, 3, 4, 5, 6];
    return days.includes(day) &&
        currentMinutes >= openMinutes &&
        currentMinutes < closeMinutes;
});

PlaceSchema.set('toJSON', { virtuals: true });
PlaceSchema.set('toObject', { virtuals: true });

PlaceSchema.index({ category: 1 });
PlaceSchema.index({ isActive: 1 });
PlaceSchema.index({ city: 1, isActive: 1 }); // 🌍 Composite index for city-filtered queries

module.exports = mongoose.model('Place', PlaceSchema);
