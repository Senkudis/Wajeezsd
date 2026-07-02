/**
 * 🔗 صفحة رابط المتجر القصير — GET /s/:code
 *
 * يخدم shop-detail.html مع حقن:
 *   1. <base href="/"> — المسارات النسبية (vendor/, js/) تنكسر تحت /s/ بدونه
 *   2. وسوم Open Graph (اسم المتجر، لوغوه، وصفه) → معاينة غنية في واتساب/فيسبوك
 *   3. window.__SHARED_PLACE_ID → الصفحة تعرف أي متجر تعرض بدون query param
 *
 * ملاحظة: يُركَّب خارج /api (بلا rate limiter الـ API ولا الـ 404 الخاص به).
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Place = require('../models/Place');
const logger = require('../utils/logger');

const SITE_URL = process.env.SITE_URL || 'https://wajeezsd.com';
const TEMPLATE_PATH = path.join(__dirname, '..', 'public_html', 'shop-detail.html');

// قالب الصفحة يُقرأ مرة واحدة ويُخزَّن — يقلّل I/O لكل مشاركة
let templateCache = null;
function getTemplate() {
    if (!templateCache) {
        templateCache = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    }
    return templateCache;
}

// هروب النصوص داخل قيم سمات HTML (منع XSS عبر اسم/وصف المتجر)
function escapeAttr(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// رابط مطلق لصورة المتجر — منطق /uploads → /api/uploads مطابق لـ getFullImageUrl في config.js
function absoluteImageUrl(imageUrl) {
    if (!imageUrl) return SITE_URL + '/logo-transparent.png';
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
    const clean = String(imageUrl).replace(/\\/g, '/');
    const withSlash = clean.startsWith('/') ? clean : '/' + clean;
    if (withSlash.startsWith('/uploads')) return SITE_URL + '/api' + withSlash;
    return SITE_URL + withSlash;
}

router.get('/:code', async (req, res) => {
    try {
        const code = String(req.params.code || '').trim();
        // أبجدية الكود base58 بطول 6 — أي شيء آخر ليس كود مشاركة
        if (!/^[2-9A-HJ-NP-Za-km-z]{4,12}$/.test(code)) {
            return res.redirect('/');
        }

        const place = await Place.findOne({ shareCode: code, isActive: true })
            .select('name description address image_url city')
            .lean();
        if (!place) return res.redirect('/');

        const title = escapeAttr(place.name + ' | وجيز');
        const desc = escapeAttr(
            place.description || place.address || 'تصفح المنتجات واطلب توصيل سريع عبر وجيز'
        );
        const image = escapeAttr(absoluteImageUrl(place.image_url));
        const pageUrl = escapeAttr(`${SITE_URL}/s/${code}`);

        const injection =
            `<base href="/">\n` +
            `<meta property="og:type" content="website">\n` +
            `<meta property="og:site_name" content="وجيز">\n` +
            `<meta property="og:title" content="${title}">\n` +
            `<meta property="og:description" content="${desc}">\n` +
            `<meta property="og:image" content="${image}">\n` +
            `<meta property="og:url" content="${pageUrl}">\n` +
            `<meta name="twitter:card" content="summary_large_image">\n` +
            `<meta name="twitter:title" content="${title}">\n` +
            `<meta name="twitter:image" content="${image}">\n` +
            `<script>window.__SHARED_PLACE_ID=${JSON.stringify(String(place._id))};</script>\n`;

        // الحقن مباشرة بعد <head...> — أول موضع يضمن سبق <base> لكل الموارد النسبية
        const html = getTemplate().replace(/<head([^>]*)>/i, `<head$1>\n${injection}`);

        res.set('Cache-Control', 'public, max-age=300'); // 5 دقائق — يخفف الضغط ويبقي المعاينة محدثة
        res.type('html').send(html);
    } catch (err) {
        logger.error({ err }, 'Share link render error');
        res.redirect('/');
    }
});

module.exports = router;
