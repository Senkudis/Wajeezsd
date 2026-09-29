/**
 * 🔒 GET /api/files/:kind/:name?exp=&sig=
 *
 * يخدم الملفات الحسّاسة (utils/privateFiles.js) برابطٍ موقّعٍ مؤقّت فقط.
 * لا دخول هنا: التوقيع هو الإذن — يصدره الخادم لمن يحقّ له الاطّلاع، وينتهي.
 */
const express = require('express');
const fs = require('fs');
const { verify, resolvePrivate } = require('../utils/privateFiles');

const router = express.Router();

router.get('/:kind/:name', (req, res) => {
    const file = resolvePrivate(req.params.kind, req.params.name);
    const pathname = `/api/files/${req.params.kind}/${req.params.name}`;
    // الرفض بلا تفصيل: رابطٌ منتهٍ ورابطٌ مزوّر وملفٌّ غير موجود سواء
    if (!file || !verify(pathname, req.query.exp, req.query.sig) || !fs.existsSync(file)) {
        return res.status(404).json({ message: 'الملف غير موجود أو انتهت صلاحية رابطه' });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.sendFile(file);
});

module.exports = router;
