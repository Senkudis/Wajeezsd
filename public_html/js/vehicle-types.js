/**
 * المصدر المركزي لوسائل التوصيل (Frontend).
 * يجب أن يطابق utils/vehicleTypes.js في الباك إند.
 * كل وسيلة: المعرّف، الاسم العربي، الأيقونة، والسرعة المتوسطة (كم/س) لحساب الزمن المتبقي.
 *
 * الاستخدام:
 *   VehicleTypes.label('motorcycle')   → "دراجة نارية"
 *   VehicleTypes.iconLabel('motorcycle') → "🏍️ دراجة نارية"
 *   VehicleTypes.speed('bicycle')      → 14
 *   VehicleTypes.optionsHtml('electric') → "<option ...>...</option>" (مع تحديد المختار)
 */
(function (global) {
    const LIST = [
        { value: 'motorcycle', label: 'دراجة نارية', icon: '🏍️', speedKmh: 30 },
        { value: 'electric',   label: 'سكوتر كهربائي', icon: '⚡', speedKmh: 25 },
        { value: 'bicycle',    label: 'دراجة هوائية', icon: '🚲', speedKmh: 14 },
        { value: 'rickshaw',   label: 'ركشة',        icon: '🛺', speedKmh: 22 },
        { value: 'car',        label: 'سيارة',       icon: '🚗', speedKmh: 30 },
        { value: 'van',        label: 'عربة نقل',     icon: '🚐', speedKmh: 28 },
    ];
    const DEFAULT_SPEED = 25;

    const find = (v) => LIST.find(t => t.value === v);

    const VehicleTypes = {
        list: LIST,
        label: (v) => { const t = find(v); return t ? t.label : (v || 'غير محدد'); },
        icon: (v) => { const t = find(v); return t ? t.icon : '🚚'; },
        iconLabel: (v) => { const t = find(v); return t ? `${t.icon} ${t.label}` : (v || 'غير محدد'); },
        speed: (v) => { const t = find(v); return t ? t.speedKmh : DEFAULT_SPEED; },
        optionsHtml: (selected) => LIST.map(t =>
            `<option value="${t.value}"${t.value === selected ? ' selected' : ''}>${t.icon} ${t.label}</option>`
        ).join(''),
    };

    global.VehicleTypes = VehicleTypes;
})(window);
