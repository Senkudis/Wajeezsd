const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema(
    {
        client: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        captain: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },

        // 👇 التعديل الجذري: تفاصيل الاستلام 👇
        pickup: {
            address: { type: String, required: true },
            contactName: { type: String, required: true },
            contactPhone: { type: String, required: true },
            lat: { type: Number },
            lng: { type: Number }
        },

        dropoff: {
            address: { type: String, required: true },
            receiverName: { type: String, required: true },
            receiverPhone: { type: String, required: true },
            lat: { type: Number },
            lng: { type: Number }
        },

        details: { type: String },

        // 👇 السعر والمسافة 👇
        distanceType: {
            type: String,
            enum: ['short', 'medium', 'long'], // قريب، وسط، بعيد
            required: true
        },
        price: { type: Number, required: true }, // السعر الإجمالي
        appFee: { type: Number, default: 0 }, // نسبة التطبيق
        netRevenue: { type: Number, default: 0 }, // صافي ربح الكابتن

        parcelImage: { type: String }, // 📷 صورة الطرد (اختياري)

        status: {
            type: String,
            enum: ['pending', 'accepted', 'picked_up', 'delivered', 'cancelled'],
            default: 'pending',
        },
        location: {
            lat: { type: Number },
            lng: { type: Number }
        },
        rating: {
            score: { type: Number, min: 1, max: 10 },
            comment: { type: String }
        },
        isRated: { type: Boolean, default: false }, // Prevent repeated rating prompts
        complaint: {
            text: { type: String },
            status: { type: String, enum: ['none', 'pending', 'resolved'], default: 'none' },
            createdAt: { type: Date }
        },
    },
    { timestamps: true }
);

// ✅ Adding Indexes for Performance
OrderSchema.index({ client: 1 });
OrderSchema.index({ captain: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ captain: 1, status: 1 }); // 🔒 Compound index for trips query
OrderSchema.index({ client: 1, createdAt: -1 }); // 🚀 PERFORMANCE: Queries for "My Orders"
OrderSchema.index({ status: 1, createdAt: -1 }); // 🚀 PERFORMANCE: Captain sorting pending orders
OrderSchema.index({ createdAt: -1 }); // For sorting by date

module.exports = mongoose.model('Order', OrderSchema);