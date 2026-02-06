const mongoose = require('mongoose');

const ComplaintSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true
        },
        client: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        reason: {
            type: String,
            enum: ["Didn't receive", "Damaged", "Wrong Item", "Other"],
            required: true
        },
        description: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ['pending', 'resolved', 'dismissed'],
            default: 'pending'
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Complaint', ComplaintSchema);
