/**
 * Centralized Phone Normalizer
 * Forces ALL phone numbers into the format: 249XXXXXXXXX
 */
function normalizePhone(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().replace(/[^0-9]/g, '');

    // Handle 24909... case (Common user error)
    if (cleaned.startsWith('2490')) return '249' + cleaned.substring(4);

    // Handle 2499... case (Already correct)
    if (cleaned.startsWith('249') && cleaned.length === 12) return cleaned;

    // Handle 09... or 01... case (Local format)
    if (cleaned.startsWith('0')) return '249' + cleaned.substring(1);

    // Handle 9123... case (No prefix)
    if (cleaned.length === 9) return '249' + cleaned;

    // Fallback
    return '249' + cleaned;
}

// ✅ Export both ways for compatibility
module.exports = normalizePhone;
module.exports.normalizePhone = normalizePhone;
