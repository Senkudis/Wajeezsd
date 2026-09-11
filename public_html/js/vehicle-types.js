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
        // biIcon: أيقونة Bootstrap لواجهاتٍ لا تستعمل الرموز التعبيرية.
        // تعيش هنا مع الاسم لا في كل صفحة على حدة — وإلا افترقت كما افترقت
        // التسميات (كانت «موتر» في نموذج التسجيل و«دراجة نارية» عند العميل
        // و«موتر» في إضافة الأدمن: ثلاث قوائم لقيمةٍ واحدة).
        { value: 'motorcycle', label: 'دراجة نارية',  icon: '🏍️', biIcon: 'bi-scooter',          speedKmh: 30 },
        { value: 'electric',   label: 'سكوتر كهربائي', icon: '⚡', biIcon: 'bi-ev-front-fill',    speedKmh: 25 },
        { value: 'bicycle',    label: 'دراجة هوائية',  icon: '🚲', biIcon: 'bi-bicycle',          speedKmh: 14 },
        { value: 'rickshaw',   label: 'ركشة',          icon: '🛺', biIcon: 'bi-taxi-front-fill',  speedKmh: 22 },
        { value: 'car',        label: 'سيارة',         icon: '🚗', biIcon: 'bi-car-front-fill',   speedKmh: 30 },
        { value: 'van',        label: 'عربة نقل',      icon: '🚐', biIcon: 'bi-truck-front-fill', speedKmh: 28 },
    ];
    const DEFAULT_SPEED = 25;

    const find = (v) => LIST.find(t => t.value === v);

    const VehicleTypes = {
        list: LIST,
        label: (v) => { const t = find(v); return t ? t.label : (v || 'غير محدد'); },
        icon: (v) => { const t = find(v); return t ? t.icon : '🚚'; },
        iconLabel: (v) => { const t = find(v); return t ? `${t.icon} ${t.label}` : (v || 'غير محدد'); },
        speed: (v) => { const t = find(v); return t ? t.speedKmh : DEFAULT_SPEED; },
        biIcon: (v) => { const t = find(v); return t ? t.biIcon : 'bi-truck'; },
        optionsHtml: (selected) => LIST.map(t =>
            `<option value="${t.value}"${t.value === selected ? ' selected' : ''}>${t.icon} ${t.label}</option>`
        ).join(''),
        /** خيارات بلا رموز تعبيرية — للوحات التي لا تستعملها. */
        plainOptionsHtml: (selected) => LIST.map(t =>
            `<option value="${t.value}"${t.value === selected ? ' selected' : ''}>${t.label}</option>`
        ).join(''),
    };

    global.VehicleTypes = VehicleTypes;
})(window);
