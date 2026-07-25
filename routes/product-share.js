/**
 * 🔗 صفحة رابط المنتج القصير — GET /p/:id
 *
 * يخدم shop-detail.html مع حقن:
 *   1. <base href="/">
 *   2. وسوم Open Graph للمنتج (اسمه، صورته، وصفه، واسم متجره)
 *   3. window.__SHARED_PLACE_ID و window.__SHARED_PRODUCT_ID
 */
const express = require('express');
const router = express.Router();
const validateObjectId = require('../middleware/validateObjectId');
// 🆔 أي :id ليس ObjectId ⇒ 404 لا 500 (انظر الملف للسبب)
router.param('id', validateObjectId);
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const Place = require('../models/Place');
const logger = require('../utils/logger');

const SITE_URL = process.env.SITE_URL || 'https://wajeezsd.com';
const TEMPLATE_PATH = path.join(__dirname, '..', 'public_html', 'shop-detail.html');

let templateCache = null;
function getTemplate() {
    if (!templateCache) {
        templateCache = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    }
    return templateCache;
}

function escapeAttr(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function absoluteImageUrl(imageUrl) {
    if (!imageUrl) return SITE_URL + '/logo-transparent.png';
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
    const clean = String(imageUrl).replace(/\\/g, '/');
    const withSlash = clean.startsWith('/') ? clean : '/' + clean;
    if (withSlash.startsWith('/uploads')) return SITE_URL + '/api' + withSlash;
    return SITE_URL + withSlash;
}

router.get('/:id', async (req, res) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            return res.redirect('/');
        }

        const product = await Product.findById(id).lean();
        if (!product) return res.redirect('/');

        const place = await Place.findById(product.placeId).select('name isActive shareCode').lean();
        if (!place || !place.isActive) return res.redirect('/');

        const title = escapeAttr(product.name + ' من ' + place.name);
        const desc = escapeAttr(product.description || `تسوق ${product.name} بسعر ${product.price} ج.س من ${place.name} عبر وجيز`);
        const image = escapeAttr(absoluteImageUrl(product.image));
        const pageUrl = escapeAttr(`${SITE_URL}/p/${id}`);

        const injection =
            `<base href="/">\n` +
            `<meta property="og:type" content="product">\n` +
            `<meta property="og:site_name" content="وجيز">\n` +
            `<meta property="og:title" content="${title}">\n` +
            `<meta property="og:description" content="${desc}">\n` +
            `<meta property="og:image" content="${image}">\n` +
            `<meta property="og:url" content="${pageUrl}">\n` +
            `<meta name="twitter:card" content="summary_large_image">\n` +
            `<meta name="twitter:title" content="${title}">\n` +
            `<meta name="twitter:image" content="${image}">\n` +
            `<script>window.__SHARED_PLACE_ID=${JSON.stringify(String(place._id))}; window.__SHARED_PRODUCT_ID=${JSON.stringify(String(product._id))};</script>\n` +
            `<script>
                document.addEventListener('DOMContentLoaded', function() {
                    var isAndroid = /android/i.test(navigator.userAgent || navigator.vendor || window.opera);
                    if (isAndroid && !window.Capacitor) {
                        var intentUrl = "intent://wajeezsd.com/p/${id}#Intent;scheme=https;package=com.wajeezsd.app;S.browser_fallback_url=https://play.google.com/store/apps/details?id=com.wajeezsd.app;end";
                        var btn = document.createElement('a');
                        btn.href = intentUrl;
                        btn.innerHTML = "فتح في تطبيق وجيز للحصول على أفضل تجربة";
                        btn.style.cssText = "position:fixed;top:0;left:0;right:0;background:#10b981;color:#fff;text-align:center;padding:15px;font-weight:bold;z-index:999999;text-decoration:none;box-shadow:0 4px 6px rgba(0,0,0,0.1);font-family:sans-serif;";
                        document.body.prepend(btn);
                        setTimeout(function() { window.location.href = intentUrl; }, 500);
                    }
                });
            </script>\n`;

        const html = getTemplate().replace(/<head([^>]*)>/i, `<head$1>\n${injection}`);

        res.set('Cache-Control', 'public, max-age=300'); // 5 mins cache
        res.type('html').send(html);
    } catch (err) {
        logger.error({ err }, 'Product Share link render error');
        res.redirect('/');
    }
});

module.exports = router;
