const express = require('express');
const router = express.Router();

/**
 * GET /api/config — إعدادات عامة للواجهة (public).
 * لا تحتوي على أي أسرار خادمية — فقط قيم يحتاجها المتصفح أصلاً (مثل مفتاح Maps الظاهر).
 * الهدف: إزالة المفتاح من كود الواجهة (git) وتمكين تدويره من env دون تعديل الكود.
 */
router.get('/', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600'); // يُخزَّن ساعة — المفتاح نادر التغيّر
    res.json({
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ''
    });
});

module.exports = router;
