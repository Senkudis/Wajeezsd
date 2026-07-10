const validateOrder = (req, res, next) => {
    const { pickup, dropoff, details, price, distanceType } = req.body;

    if (!pickup || !pickup.address || !pickup.contactName || !pickup.contactPhone) {
        return res.status(400).json({ message: 'بيانات الاستلام غير مكتملة' });
    }

    if (!dropoff || !dropoff.address || !dropoff.receiverName || !dropoff.receiverPhone) {
        return res.status(400).json({ message: 'بيانات التسليم غير مكتملة' });
    }

    if (!price || isNaN(price) || price <= 0 || price > 100000) {
        return res.status(400).json({ message: 'السعر غير صالح (الحد الأقصى 100,000)' });
    }

    if (!['short', 'medium', 'long', 'custom'].includes(distanceType)) {
        return res.status(400).json({ message: 'نوع المسافة غير صالح' });
    }

    // ✅ maxLength: منع الـ payloads الضخمة
    if (details && typeof details === 'string' && details.length > 500) {
        return res.status(400).json({ message: 'وصف الطلب طويل جداً (الحد الأقصى 500 حرف)' });
    }

    if (pickup.address && pickup.address.length > 300) {
        return res.status(400).json({ message: 'عنوان الاستلام طويل جداً (الحد الأقصى 300 حرف)' });
    }

    if (dropoff.address && dropoff.address.length > 300) {
        return res.status(400).json({ message: 'عنوان التسليم طويل جداً (الحد الأقصى 300 حرف)' });
    }

    if (req.body.receiptImage && typeof req.body.receiptImage === 'string' && req.body.receiptImage.length > 2000000) {
        return res.status(400).json({ message: 'حجم صورة الإيصال كبير جداً (الحد الأقصى 1.5MB)' });
    }

    if (req.body.parcelImage && typeof req.body.parcelImage !== 'string') {
        return res.status(400).json({ message: 'صيغة الصورة غير صالحة' });
    }

    // 🧭 توصيل متعدد النقاط — pickup/dropoff أعلاه دائماً مرآة لأول استلام/آخر تسليم،
    // فنكتفي هنا بالتحقق من بنية stops إن وُجدت (الفحص الجغرافي في route عبر validateStopsLocations).
    const { stops } = req.body;
    if (stops !== undefined) {
        if (!Array.isArray(stops) || stops.length < 2 || stops.length > 12) {
            return res.status(400).json({ message: 'عدد نقاط الرحلة غير صالح (من 2 إلى 12 نقطة)' });
        }
        const hasPickup = stops.some(s => s && s.type === 'pickup');
        const hasDropoff = stops.some(s => s && s.type === 'dropoff');
        if (!hasPickup || !hasDropoff) {
            return res.status(400).json({ message: 'يجب أن تحتوي الرحلة على نقطة استلام ونقطة تسليم على الأقل' });
        }
        for (const s of stops) {
            if (!s || !['pickup', 'dropoff'].includes(s.type) || !s.address) {
                return res.status(400).json({ message: 'إحدى نقاط الرحلة غير مكتملة' });
            }
            if (s.address.length > 300) {
                return res.status(400).json({ message: 'عنوان إحدى النقاط طويل جداً (الحد الأقصى 300 حرف)' });
            }
        }
    }

    next();
};


const validateAuth = (req, res, next) => {
    const { email, password, name, phone } = req.body;

    if (req.path === '/register') {
        if (!email || !password || !name || !phone) {
            return res.status(400).json({ message: 'يرجى ملء جميع الحقول' });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
        }
    } else if (req.path === '/login') {
        if (!email || !password) {
            return res.status(400).json({ message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
        }
    }

    next();
};

module.exports = { validateOrder, validateAuth };
