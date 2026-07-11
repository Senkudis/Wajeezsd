const { ZodError } = require('zod');

/**
 * validate(schema, source) — مصنع middleware للتحقق من المدخلات عبر Zod.
 *
 *   router.post('/login', validate(loginSchema), handler);
 *   router.get('/list', validate(listQuerySchema, 'query'), handler);
 *
 * عند النجاح: يستبدل req[source] بالبيانات المُحقَّقة والمُنظَّفة (parsed).
 * عند الفشل: يرد 400 برسالة عربية واضحة تجمع كل أخطاء الحقول.
 *
 * ملاحظة: في Express 5 لا يمكن إعادة تعيين req.query (getter للقراءة فقط)،
 * لذا نحفظ النتيجة في req.validatedQuery بدلاً من req.query.
 */
const validate = (schema, source = 'body') => (req, res, next) => {
    try {
        const parsed = schema.parse(req[source]);
        if (source === 'query') {
            req.validatedQuery = parsed;
        } else {
            req[source] = parsed;
        }
        next();
    } catch (err) {
        if (err instanceof ZodError) {
            const message = err.issues.map((i) => i.message).join('، ');
            return res.status(400).json({ message });
        }
        next(err);
    }
};

module.exports = { validate };
