/**
 * المصدر المركزي لوسائل التوصيل (Backend).
 * كل وسيلة: المعرّف، الاسم العربي، الأيقونة، والسرعة المتوسطة (كم/س) لحساب الزمن المتبقي.
 * أي إضافة وسيلة جديدة تتم هنا وفي public_html/js/vehicle-types.js (نفس القائمة).
 */
const VEHICLE_TYPES = [
    // biIcon: أيقونة Bootstrap لواجهاتٍ بلا رموز تعبيرية — تُحفظ هنا مع
    // الاسم لتبقى المرآة مطابقة لـ public_html/js/vehicle-types.js حرفياً.
    { value: 'motorcycle', label: 'دراجة نارية',  icon: '🏍️', biIcon: 'bi-scooter',          speedKmh: 30 },
    { value: 'electric',   label: 'سكوتر كهربائي', icon: '⚡', biIcon: 'bi-ev-front-fill',    speedKmh: 25 },
    { value: 'bicycle',    label: 'دراجة هوائية',  icon: '🚲', biIcon: 'bi-bicycle',          speedKmh: 14 },
    { value: 'rickshaw',   label: 'ركشة',          icon: '🛺', biIcon: 'bi-taxi-front-fill',  speedKmh: 22 },
    { value: 'car',        label: 'سيارة',         icon: '🚗', biIcon: 'bi-car-front-fill',   speedKmh: 30 },
    { value: 'van',        label: 'عربة نقل',      icon: '🚐', biIcon: 'bi-truck-front-fill', speedKmh: 28 },
];

const VEHICLE_VALUES = VEHICLE_TYPES.map(v => v.value);

const DEFAULT_SPEED_KMH = 25; // سرعة افتراضية لأي وسيلة غير معروفة

function getVehicleSpeed(value) {
    const v = VEHICLE_TYPES.find(t => t.value === value);
    return v ? v.speedKmh : DEFAULT_SPEED_KMH;
}

function getVehicleLabel(value) {
    const v = VEHICLE_TYPES.find(t => t.value === value);
    return v ? v.label : (value || 'غير محدد');
}

module.exports = { VEHICLE_TYPES, VEHICLE_VALUES, DEFAULT_SPEED_KMH, getVehicleSpeed, getVehicleLabel };
