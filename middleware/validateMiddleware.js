const validateOrder = (req, res, next) => {
    const { pickup, dropoff, details, price, distanceType } = req.body;

    if (!pickup || !pickup.address || !pickup.contactName || !pickup.contactPhone) {
        return res.status(400).json({ message: 'بيانات الاستلام غير مكتملة' });
    }

    if (!dropoff || !dropoff.address || !dropoff.receiverName || !dropoff.receiverPhone) {
        return res.status(400).json({ message: 'بيانات التسليم غير مكتملة' });
    }

    if (!price || isNaN(price) || price <= 0) {
        return res.status(400).json({ message: 'السعر غير صالح' });
    }

    if (!['short', 'medium', 'long'].includes(distanceType)) {
        return res.status(400).json({ message: 'نوع المسافة غير صالح' });
    }

    if (req.body.parcelImage && typeof req.body.parcelImage !== 'string') {
        return res.status(400).json({ message: 'صيغة الصورة غير صالحة' });
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
