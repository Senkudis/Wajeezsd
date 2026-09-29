/**
 * 🔒 الملفات الحسّاسة — هوية الكابتن وسيلفيه ورخصته، وهوية التاجر.
 *
 * كانت تُحفظ في public_html/uploads فيخدمها الخادم (LiteSpeed) لكل من يملك
 * الرابط، بلا دخولٍ ولا صلاحية. اسم الملف عشوائيّ فلا يُخمَّن — لكن الرابط
 * يتسرّب: سجلّات، لقطات شاشة، نسخٌ ولصق. وصورة بطاقةٍ قومية لا تُعاد.
 *
 * الآن تُحفظ خارج public_html (private_uploads/) فلا يخدمها أحدٌ مباشرة،
 * وتُقرأ عبر /api/files/<نوع>/<ملف> **برابطٍ موقّعٍ مؤقّت**: الخادم يوقّعه
 * لمن يحقّ له الاطّلاع (الأدمن بصلاحيته) حين يُرسل إليه بيانات الكابتن،
 * فيعمل في <img> كأيّ صورة، وينتهي بعد ساعتين.
 *
 * الروابط القديمة (/uploads/documents/…) تبقى تعمل حتى تُنقل بـ
 * scripts/migrate-private-docs.js.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIVATE_DIR = path.join(__dirname, '..', 'private_uploads');
const KINDS = ['documents', 'merchant-ids'];
const NAME_RE = /^[A-Za-z0-9_.-]{1,120}$/;
const TTL_SEC = 2 * 60 * 60;

/** حقول الكابتن الحسّاسة — الصورة الشخصية وصورة المركبة تُعرضان للعملاء فتبقيان عامّتين */
const SENSITIVE_DOC_FIELDS = ['idImage', 'selfieImage', 'driverLicense'];

function secret() {
    const s = process.env.FILES_SECRET || process.env.JWT_SECRET;
    if (!s) throw new Error('FILES_SECRET/JWT_SECRET غير مضبوط');
    return s;
}

const isPrivateUrl = (u) => typeof u === 'string' && /^\/api\/files\/[a-z-]+\/[A-Za-z0-9_.-]+$/.test(u.split('?')[0]);

function mac(pathname, exp) {
    return crypto.createHmac('sha256', secret()).update(`${pathname}:${exp}`).digest('base64url').slice(0, 32);
}

/** رابطٌ موقّعٌ مؤقّت — لغير الخاصّ يعيده كما هو */
function sign(url, ttlSec = TTL_SEC, now = Date.now()) {
    if (!isPrivateUrl(url)) return url;
    const pathname = url.split('?')[0];
    const exp = Math.floor(now / 1000) + ttlSec;
    return `${pathname}?exp=${exp}&sig=${mac(pathname, exp)}`;
}

function verify(pathname, exp, sig, now = Date.now()) {
    const e = Number(exp);
    if (!Number.isFinite(e) || e < Math.floor(now / 1000) || typeof sig !== 'string') return false;
    const expected = mac(pathname, e);
    const a = Buffer.from(expected), b = Buffer.from(sig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** وثائق كابتن بروابط موقّعة (نسخةٌ جديدة — لا يُعدَّل الأصل) */
function signDocs(documents) {
    if (!documents || typeof documents !== 'object') return documents;
    const plain = typeof documents.toObject === 'function' ? documents.toObject() : { ...documents };
    for (const k of SENSITIVE_DOC_FIELDS) if (plain[k]) plain[k] = sign(plain[k]);
    return plain;
}

/** مستخدمٌ أو قائمة: وثائقه موقّعة — لما يُرسَل للأدمن */
function withSignedDocs(users) {
    const one = (u) => {
        if (!u) return u;
        const o = typeof u.toObject === 'function' ? u.toObject() : { ...u };
        if (o.documents) o.documents = signDocs(o.documents);
        return o;
    };
    return Array.isArray(users) ? users.map(one) : one(users);
}

/**
 * ينقل ملفاً رُفع للتوّ إلى المجلد الخاصّ ويعيد رابطه الخاصّ.
 * @param {string} absPath مكانه الذي كتبه multer
 * @param {string} kind    documents | merchant-ids
 */
function moveToPrivate(absPath, kind) {
    if (!KINDS.includes(kind)) throw new Error('نوعٌ غير معروف');
    const name = path.basename(absPath);
    const dir = path.join(PRIVATE_DIR, kind);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, name);
    try {
        fs.renameSync(absPath, dest);
    } catch (e) {
        // قرصان مختلفان (EXDEV): نسخٌ ثم حذف
        fs.copyFileSync(absPath, dest);
        fs.unlinkSync(absPath);
    }
    return `/api/files/${kind}/${name}`;
}

/** المسار على القرص لرابطٍ خاصّ — أو null إن لم يصحّ */
function resolvePrivate(kind, name) {
    if (!KINDS.includes(kind) || !NAME_RE.test(name) || name.includes('..')) return null;
    return path.join(PRIVATE_DIR, kind, name);
}

module.exports = {
    PRIVATE_DIR, KINDS, SENSITIVE_DOC_FIELDS, TTL_SEC,
    isPrivateUrl, sign, verify, signDocs, withSignedDocs, moveToPrivate, resolvePrivate
};
