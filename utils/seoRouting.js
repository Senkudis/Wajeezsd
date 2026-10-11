/**
 * 🔎 ظهور الموقع في جوجل — نطاقٌ واحد، وصفحات التطبيق خارج الفهرس.
 *
 * ما رآه المستخدم في نتائج البحث:
 *   • www.wajeezsd.com بعنوان «وجيز: طلب جديد» — صفحة الطلب لا صفحة الهبوط،
 *     وعلى www بينما canonical يقول wajeezsd.com. الموقع يجيب على النطاقين
 *     بلا تحويل، فاختار جوجل أحدهما ووزّع الإشارات بينهما.
 *   • «دخول الإدارة» نتيجةً ثانية. robots.txt يمنع الزحف إليها — وهذا نفسه
 *     يمنع جوجل من رؤية أي «لا تفهرس»، فتبقى النتيجة القديمة معلّقة.
 *
 * الحلّ: تحويلٌ دائم من www إلى النطاق الرئيسي، ورأس X-Robots-Tag: noindex
 * على صفحات التطبيق واللوحات (وrobots.txt يسمح بزحفها ليراه جوجل).
 */

const CANONICAL_HOST = 'wajeezsd.com';

/**
 * رابط التحويل الدائم إن جاء الطلب على www — وإلا null.
 * لا يُحوَّل: غير GET/HEAD (POST يفقد جسمه)، ولا /api (التطبيقات)، ولا
 * /.well-known (مُتحقّق App Links لا يتبع التحويل — روابط www في التطبيق).
 */
function wwwRedirectTarget({ method, host, originalUrl }) {
    const h = String(host || '').toLowerCase().split(':')[0];
    if (h !== 'www.' + CANONICAL_HOST) return null;
    if (method !== 'GET' && method !== 'HEAD') return null;
    const url = String(originalUrl || '/');
    if (url.startsWith('/api/') || url.startsWith('/.well-known/')) return null;
    return `https://${CANONICAL_HOST}${url}`;
}

// صفحاتٌ عامة مقصودة في البحث — كل ما سواها من صفحات التطبيق لا يُفهرس
const PUBLIC_PAGES = new Set([
    '/captain-signup.html', '/client-register-shop.html'
]);

/** هل تُرسَل هذه الصفحة مع X-Robots-Tag: noindex؟ */
function isNoindexPath(pathname) {
    const p = String(pathname || '').split('?')[0].toLowerCase();
    if (PUBLIC_PAGES.has(p)) return false;
    if (p === '/index.html') return true;                 // صفحة الطلب — الهبوط هو «/»
    if (/^\/(admin|merchant|captain|client)[-.]/.test(p)) return true;
    if (p === '/admin' || p.startsWith('/admin/')) return true;
    return ['/tracking.html', '/chat.html', '/conversations.html',
        '/notifications.html', '/offline.html'].includes(p);
}

module.exports = { CANONICAL_HOST, wwwRedirectTarget, isNoindexPath };
