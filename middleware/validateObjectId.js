const mongoose = require('mongoose');

/**
 * 🆔 حارس معرّفات المسار.
 *
 * لماذا: مسار مثل GET /api/places/:id يلتقط أي عنوان لا يطابق مساراً معرّفاً قبله.
 * فحين يغيب مسار (خطأ إملائي، أو ملف لم يُنشر بعد)، يصل اسمه إلى findById فيرمي
 * mongoose خطأ CastError، فيتحوّل "المسار غير موجود" إلى "خطأ في السيرفر" (500).
 *
 * حدث هذا فعلاً وكلّف ساعات: /api/places/errand-featured غير المنشور ردّ
 * 500 "Server Error"، فبدا عطلاً في السيرفر بينما كان الملف ناقصاً فقط —
 * ولو ردّ 404 لاتّضح السبب في ثانية.
 *
 * الاستخدام في أعلى ملف المسارات:
 *   router.param('id', validateObjectId);
 */
function validateObjectId(req, res, next, value) {
    if (!mongoose.Types.ObjectId.isValid(String(value))) {
        return res.status(404).json({ message: 'المسار أو المعرّف غير موجود' });
    }
    next();
}

module.exports = validateObjectId;
