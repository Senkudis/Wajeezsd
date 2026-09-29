/**
 * 🎯 كل رفضٍ يسمّي خانته (`field`) مع رسالةٍ تقول ما يُصلَح — واجهة الطلب
 * تعرضه تحت الخانة نفسها (public_html/js/home.js ← SERVER_FIELD_TO_INPUT).
 * كان «بيانات الاستلام غير مكتملة» يُقال لمن نسي الاسم، فيبحث العميل في
 * العنوان والهاتف ولا يدري ما الناقص.
 *
 * ⚠️ شروط القبول نفسها لم تتغيّر — الرسائل وحدها صارت دقيقة. (تشديد الفحص
 *    يرفض طلباتٍ تقبلها نسخ التطبيق المثبّتة اليوم.)
 */
const reject = (res, field, message) => res.status(400).json({ message, field });

/** أعلى سعرٍ لأيّ طلب — الحدّ نفسه في التفاوض (routes/orders.js MAX_PRICE) */
const MAX_ORDER_PRICE = 1000000;

const validateOrder = (req, res, next) => {
    const { pickup, dropoff, details, price, distanceType } = req.body;

    // 🏪 طلب من متجر: جهة الاستلام هي المتجر، واسمه ورقمه يُشتقّان في السيرفر من
    // مستند المتجر (routes/orders.js) لا من العميل — لأن رقم المتجر محجوب عنه
    // أصلاً. فمطالبته بإرسالهما تعني رفض كل طلبات المتاجر بـ 400.
    const isShopOrder = req.body.orderType === 'shop';

    if (!pickup || !pickup.address) return reject(res, 'pickup.address', 'حدّد موقع الاستلام من الخريطة');
    if (!isShopOrder && !pickup.contactName) return reject(res, 'pickup.contactName', 'اكتب اسم المرسل');
    if (!isShopOrder && !pickup.contactPhone) return reject(res, 'pickup.contactPhone', 'اكتب رقم هاتف المرسل');

    if (!dropoff || !dropoff.address) return reject(res, 'dropoff.address', 'حدّد وجهة التسليم من الخريطة');
    if (!dropoff.receiverName) return reject(res, 'dropoff.receiverName', 'اكتب اسم المستلم');
    if (!dropoff.receiverPhone) return reject(res, 'dropoff.receiverPhone', 'اكتب رقم هاتف المستلم');

    // كان السقف 100,000 — أدنى من سقف التفاوض (مليون) ومن «سقف الزيادة» في
    // الإعدادات: مشوارٌ طويل بسعرٍ مسموحٍ في الإعدادات يُرفض هنا بلا سبب.
    if (!price || isNaN(price) || price <= 0) return reject(res, 'price', 'حدّد سعر العرض');
    if (price > MAX_ORDER_PRICE) {
        return reject(res, 'price', `أعلى سعر لأي طلب ${MAX_ORDER_PRICE.toLocaleString('en-US')} ج.س`);
    }

    if (!['short', 'medium', 'long', 'custom'].includes(distanceType)) {
        return res.status(400).json({ message: 'نوع المسافة غير صالح' });
    }

    // ✅ maxLength: منع الـ payloads الضخمة
    if (details && typeof details === 'string' && details.length > 500) {
        return reject(res, 'details', 'وصف الطلب طويل جداً (الحد الأقصى 500 حرف)');
    }

    if (pickup.address && pickup.address.length > 300) {
        return reject(res, 'pickup.address', 'عنوان الاستلام طويل جداً (الحد الأقصى 300 حرف)');
    }

    if (dropoff.address && dropoff.address.length > 300) {
        return reject(res, 'dropoff.address', 'عنوان التسليم طويل جداً (الحد الأقصى 300 حرف)');
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

module.exports = { validateOrder, validateAuth, MAX_ORDER_PRICE };
