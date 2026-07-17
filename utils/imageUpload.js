// utils/imageUpload.js
// Handles saving Base64 images to the server filesystem

const fs = require('fs');
const path = require('path');

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ✅ القائمة البيضاء الوحيدة للأنواع المسموحة وامتداداتها.
// ⚠️ الامتداد يُشتق من هذه الخريطة فقط — لا من اسم الملف الذي يرسله العميل
// ولا من نوع MIME الخام. سابقاً كان data:image/(\w+) يسمح بكتابة .phtml.
const MIME_EXT = {
    'image/jpeg': '.jpg',
    'image/jpg':  '.jpg',
    'image/png':  '.png',
    'image/webp': '.webp'
};

// بصمات الملفات (magic bytes) — المصدر الوحيد الموثوق لنوع الملف.
// ترويسة Content-Type يتحكم بها العميل بالكامل ولا تصلح للتحقق.
const SIGNATURES = [
    { ext: '.jpg',  check: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
    { ext: '.png',  check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
                                  b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A },
    // WebP: "RIFF" .... "WEBP"
    { ext: '.webp', check: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' &&
                                  b.slice(8, 12).toString('ascii') === 'WEBP' }
];

/**
 * يفحص المحتوى الفعلي للـ buffer ويُرجع الامتداد المطابق أو null.
 * @param {Buffer} buffer أول 12 بايت على الأقل
 * @returns {string|null}
 */
function detectImageExt(buffer) {
    if (!buffer || buffer.length < 12) return null;
    for (const sig of SIGNATURES) {
        if (sig.check(buffer)) return sig.ext;
    }
    return null;
}

/**
 * يقرأ ترويسة ملف على القرص ويتحقق أنه صورة حقيقية من الأنواع المسموحة.
 * @param {string} filePath
 * @returns {Promise<string|null>} الامتداد المكتشف أو null
 */
async function detectImageExtOfFile(filePath) {
    let fh;
    try {
        fh = await fs.promises.open(filePath, 'r');
        const buffer = Buffer.alloc(12);
        const { bytesRead } = await fh.read(buffer, 0, 12, 0);
        if (bytesRead < 12) return null;
        return detectImageExt(buffer);
    } catch (_) {
        return null;
    } finally {
        if (fh) await fh.close().catch(() => {});
    }
}

/**
 * حذف آمن — يبتلع الأخطاء (الملف قد يكون حُذف مسبقاً).
 */
async function safeUnlink(filePath) {
    try { await fs.promises.unlink(filePath); } catch (_) {}
}

/**
 * Save a Base64 image string to the server filesystem.
 * @param {string} base64String - The full Base64 data URI (e.g., data:image/jpeg;base64,...)
 * @returns {string|null} - The public URL path to the saved image, or null if invalid
 */
function saveBase64Image(base64String) {
    if (!base64String || !base64String.startsWith('data:image')) {
        return null;
    }

    const matches = base64String.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) return null;

    const declaredMime = matches[1].toLowerCase();
    // ⚠️ الامتداد من القائمة البيضاء — رفض أي نوع خارجها بدل الوثوق بالمُعلَن
    const ext = MIME_EXT[declaredMime];
    if (!ext) return null;

    const buffer = Buffer.from(matches[2], 'base64');

    // 🔒 المحتوى الفعلي يجب أن يطابق النوع المُعلَن — لا يكفي ادّعاء العميل
    if (detectImageExt(buffer) !== ext) return null;

    const filename = `img_${Date.now()}_${require('crypto').randomBytes(6).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

    return `/uploads/${filename}`;
}

/**
 * Delete an image from the server filesystem.
 * @param {string} imageUrl - The public URL path (e.g., /uploads/img_xxx.jpg)
 */
function deleteImage(imageUrl) {
    if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
    const filename = imageUrl.replace('/uploads/', '');

    // 🔒 اسم الملف فقط — بلا أي مكوّن مسار. بدون هذا كان
    // "/uploads/../../index.js" يخرج من المجلد ويحذف ملفات المشروع.
    const safeName = path.basename(filename);
    if (!safeName || safeName !== filename) return;

    const target = path.join(UPLOADS_DIR, safeName);
    // تحقق أخير أن المسار الناتج ما زال داخل مجلد الرفع
    if (!target.startsWith(UPLOADS_DIR + path.sep)) return;

    if (fs.existsSync(target)) fs.unlinkSync(target);
}

/**
 * يشتق اسم ملف رفع آمناً — الامتداد من القائمة البيضاء لا من اسم العميل.
 * هذا هو بالضبط موضع الثغرة السابقة: path.extname(file.originalname).
 * @param {string} prefix   بادئة (عادةً معرّف المستخدم أو captain_<id>)
 * @param {string} mimetype نوع MIME من multer
 * @returns {string} اسم ملف بامتداد آمن مضمون
 */
function safeUploadName(prefix, mimetype) {
    const ext = MIME_EXT[mimetype] || '.jpg'; // fallback آمن — لا يقبل أبداً امتداد العميل
    const rand = require('crypto').randomBytes(6).toString('hex');
    const cleanPrefix = String(prefix || 'file').replace(/[^a-zA-Z0-9_]/g, '');
    return `${cleanPrefix}_${Date.now()}_${rand}${ext}`;
}

module.exports = {
    saveBase64Image, deleteImage, safeUploadName,
    MIME_EXT, detectImageExt, detectImageExtOfFile, safeUnlink
};
