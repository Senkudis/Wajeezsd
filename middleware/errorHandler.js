const logger = require('../utils/logger');

/**
 * notFound — يُستدعى عندما لا يطابق أي route الطلب (404).
 * يجب وضعه بعد كل الـ routes وقبل errorHandler.
 */
const notFound = (req, res, next) => {
    res.status(404).json({ message: 'المسار المطلوب غير موجود' });
};

/**
 * errorHandler — معالج الأخطاء المركزي (4 معاملات = Express error middleware).
 * يحوّل أخطاء Mongoose/JWT/Zod الشائعة إلى ردود نظيفة بالعربية،
 * ويُخفي تفاصيل الأخطاء غير المتوقعة في الإنتاج.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'حدث خطأ غير متوقع في الخادم';

    // أخطاء التحقق من Mongoose
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = Object.values(err.errors).map((e) => e.message).join('، ');
    }
    // معرّف غير صالح (CastError) — مثل ObjectId خاطئ
    else if (err.name === 'CastError') {
        statusCode = 400;
        message = 'معرّف غير صالح';
    }
    // مفتاح مكرر (duplicate key)
    else if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue || {})[0] || 'القيمة';
        message = `${field} مستخدم بالفعل`;
    }
    // أخطاء JWT
    else if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'رمز الدخول غير صالح';
    } else if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً';
    }
    // أخطاء التحقق من Zod
    else if (err.name === 'ZodError' && Array.isArray(err.issues)) {
        statusCode = 400;
        message = err.issues.map((i) => i.message).join('، ');
    }

    // سجّل كل خطأ 500 بالتفصيل (الأخطاء غير المتوقعة)
    if (statusCode >= 500) {
        logger.error({ err, path: req.originalUrl, method: req.method }, 'Unhandled route error');
    } else {
        logger.warn({ message, path: req.originalUrl }, 'Handled request error');
    }

    res.status(statusCode).json({ message });
};

module.exports = { notFound, errorHandler };
