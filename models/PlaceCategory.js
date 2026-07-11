const mongoose = require('mongoose');

const PlaceCategorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    icon: { type: String, default: 'bi-shop' }, // Bootstrap Icons class
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('PlaceCategory', PlaceCategorySchema);
