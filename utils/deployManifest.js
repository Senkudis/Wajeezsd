/**
 * 🧾 بصمة الملفات المنشورة فعلاً على السيرفر.
 *
 * لماذا بصمة لكل ملف لا رقم إصدار واحد: النشر هنا يدوي ملفاً ملفاً، وأخطر أعطاله
 * النشر الجزئي — ملف حُدِّث وآخر لا. رقمُ إصدارٍ واحد لا يكشف ذلك أبداً (وهو أصلاً
 * غير موجود على سيرفر لا يُنشر بـ git). بصمة كل ملف تقول أيّها بالضبط قديم.
 *
 * كلّف هذا يوماً كاملاً فعلاً: routes/places.js نُشر و utils/placesSearch.js لا،
 * فبدا الأمر عطلاً في مفتاح جوجل بينما كان الملف ناقصاً.
 *
 * تُحسب مرة واحدة عند الإقلاع: الملفات لا تتغيّر بعد بدء العملية، وإعادة القراءة
 * في كل طلب هدرٌ بلا فائدة.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

// مجلدات كود السيرفر — لا يمكن للعميل فحصها بأي طريقة أخرى.
// ملفات public_html يفحصها السكربت بتنزيلها مباشرةً، فلا داعي لإدراجها هنا.
const WATCHED_DIRS = ['routes', 'routes/admin', 'utils', 'models', 'middleware'];
const WATCHED_FILES = ['index.js'];

let cached = null;

function hashFile(abs) {
    try {
        return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 12);
    } catch (_) {
        return null;
    }
}

/**
 * @returns {{files: Object<string,string>, count: number, digest: string, builtAt: string}}
 *          digest = بصمة المجموع كلها — مقارنة سطر واحد تكفي للحكم بالتطابق
 */
function manifest() {
    if (cached) return cached;

    const files = {};
    for (const dir of WATCHED_DIRS) {
        const abs = path.join(ROOT, dir);
        let entries = [];
        try { entries = fs.readdirSync(abs); } catch (_) { continue; }
        for (const name of entries) {
            if (!name.endsWith('.js')) continue;
            const rel = `${dir}/${name}`;
            const full = path.join(abs, name);
            try { if (!fs.statSync(full).isFile()) continue; } catch (_) { continue; }
            const h = hashFile(full);
            if (h) files[rel] = h;
        }
    }
    for (const rel of WATCHED_FILES) {
        const h = hashFile(path.join(ROOT, rel));
        if (h) files[rel] = h;
    }

    const digest = crypto.createHash('sha256')
        .update(Object.keys(files).sort().map(k => `${k}:${files[k]}`).join('\n'))
        .digest('hex').slice(0, 12);

    cached = { files, count: Object.keys(files).length, digest, builtAt: new Date().toISOString() };
    return cached;
}

module.exports = { manifest, WATCHED_DIRS, WATCHED_FILES };
