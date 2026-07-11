/**
 * AppError — خطأ تشغيلي معروف يمكن رميه من أي route handler
 * مع رسالة عربية ورمز حالة HTTP. يلتقطه errorHandler ويرد به للعميل.
 *
 *   throw new AppError('الطلب غير موجود', 404);
 */
class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true; // يميّز الأخطاء المتوقعة عن الأخطاء البرمجية
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
