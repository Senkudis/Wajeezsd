const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const protect = async (req, res, next) => {
    let token;

    // 1. Try to get token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // 2. Try to get token from cookies (if used)
    else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    // Validation: Missing token
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    // Validation: Malformed JWT (must have 2 dots)
    if (token.split('.').length !== 3) {
        return res.status(401).json({ message: 'Malformed token' });
    }

    try {
        // 🔓 Try the current strong JWT_SECRET first
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (primaryErr) {
            // 🛟 Fallback: accept tokens signed with the legacy secret (old mobile apps)
            // Set JWT_SECRET_LEGACY in env to enable. Remove once all clients have re-logged in.
            const legacy = process.env.JWT_SECRET_LEGACY;
            if (legacy && legacy.length > 0) {
                try {
                    decoded = jwt.verify(token, legacy);
                } catch (legacyErr) {
                    throw primaryErr; // both failed — original error wins
                }
            } else {
                throw primaryErr;
            }
        }

        req.user = await User.findById(decoded.userId).select('-password');

        if (!req.user) {
            return res.status(401).json({ message: 'المستخدم غير موجود' });
        }

        if (!req.user.isActive) {
            return res.status(403).json({ message: 'حسابك موقوف. يرجى التواصل مع الإدارة.' });
        }

        // 🔒 إبطال الجلسات: أي توكن صدر قبل آخر رفع لـ tokenVersion يسقط هنا.
        //    بدون هذا الفحص كان تغيير كلمة المرور لا يُنهي الجلسات القائمة،
        //    فيبقى التوكن المسروق صالحاً حتى انتهاء مدته (سبعة أيام).
        //    التوكنات القديمة لا تحمل `tv` فتُعامَل كـ 0 — تبقى صالحة حتى أول
        //    رفع للنسخة، وإلا خرج كل المستخدمين لحظة النشر.
        const tokenVersion = typeof decoded.tv === 'number' ? decoded.tv : 0;
        if ((req.user.tokenVersion || 0) !== tokenVersion) {
            return res.status(401).json({ message: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول من جديد.' });
        }

        // 🔒 Security: Log role mismatch but ALLOW the request to proceed.
        // Hard-blocking here would prevent /me from working when admin changes a user's role
        // (e.g., client→merchant), since the JWT still contains the old role.
        // The DB role (req.user.role) is always authoritative for access control.
        if (decoded.role && decoded.role !== req.user.role) {
            // Log for monitoring, but don't block — the user may need to call /me to discover their new role
            logger.warn({ jwtRole: decoded.role, dbRole: req.user.role, userId: req.user._id }, '[Auth] Role mismatch');
        }

        // 🔒 Security: Check scope for restricted tokens (e.g. upload_only)
        if (decoded.scope && decoded.scope !== 'full') {
            const allowedPaths = ['/api/auth/upload-documents'];
            if (!allowedPaths.some(p => req.originalUrl.includes(p))) {
                return res.status(403).json({ message: 'هذا التوكن مقيّد بمهام محددة فقط' });
            }
        }

        next();
    } catch (error) {
        // Return 401 instead of throwing
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

// ==========================================
// 🔒 Role-Based Access Middleware
// ==========================================

const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'غير مصرح، هذه الصلاحية للمسؤولين فقط' });
    }
};

// 🔐 Super Admin Only — يسمح فقط للأدمن الرئيسي (super_admin أو من لم يُعيَّن له adminRole بعد)
// الأدمن القديمين في DB (adminRole=null) يُعاملون كـ super_admin تلقائياً للتوافق مع النسخ السابقة
const superAdminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'غير مصرح — هذه الصفحة للمسؤول الرئيسي فقط' });
    }
    // null يعني أدمن قديم → يُعامل كـ super_admin
    if (req.user.adminRole === 'sub_admin') {
        return res.status(403).json({ message: 'غير مصرح — هذه الصلاحية للمسؤول الرئيسي فقط' });
    }
    next();
};

// 🔑 Permission-based middleware — يتحقق من صلاحية محددة
// super_admin يمر دائماً. sub_admin يحتاج أن تكون الصلاحية في permissions[]
const requirePermission = (permission) => (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'غير مصرح' });
    }
    // super_admin يمر دائماً
    if (!req.user.adminRole || req.user.adminRole === 'super_admin') return next();
    // sub_admin يحتاج الصلاحية
    if (req.user.permissions && req.user.permissions.includes(permission)) return next();
    return res.status(403).json({ message: `غير مصرح — تحتاج صلاحية: ${permission}` });
};

// 🔑 يمرّ إذا امتلك الأدمن المساعد أيّاً من الصلاحيات المذكورة (OR)
// مفيد لمسارات تُستخدم من أكثر من صفحة (مثل بيانات الكباتن للخريطة + صفحة الكباتن)
const requireAnyPermission = (permissions) => (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'غير مصرح' });
    }
    if (!req.user.adminRole || req.user.adminRole === 'super_admin') return next();
    if (req.user.permissions && permissions.some(p => req.user.permissions.includes(p))) return next();
    return res.status(403).json({ message: 'غير مصرح — صلاحيات غير كافية' });
};

// ==========================================
// 🌍 City Scoping for Admins
// ==========================================
const VALID_CITIES = ['Khartoum', 'PortSudan'];

// يُرجع جزء فلتر Mongo الخاص بالمدينة حسب نوع الأدمن:
// - sub_admin: مقيّد بمدينته فقط (يتجاهل أي ?city يرسله العميل)
// - super_admin/قديم: فلتر اختياري عبر ?city، وإلا كل المدن
function getAdminCityFilter(req) {
    if (req.user && req.user.adminRole === 'sub_admin') {
        return { city: req.user.city };
    }
    if (VALID_CITIES.includes(req.query.city)) {
        return { city: req.query.city };
    }
    return {};
}

// المدينة التي تُختم بها السجلات الجديدة (إنشاء كابتن…)
// sub_admin: مدينته إجبارياً. super_admin: المدينة المُرسلة أو الافتراضية
function resolveCreationCity(req, requestedCity) {
    if (req.user && req.user.adminRole === 'sub_admin') {
        return req.user.city;
    }
    return VALID_CITIES.includes(requestedCity) ? requestedCity : 'Khartoum';
}

// يتحقق أن الأدمن المساعد لا يتصرّف في مستخدم خارج صلاحيته.
// يُرجع true إذا مسموح، false إذا محظور.
function adminCanActOnUser(req, targetUser) {
    if (!req.user || req.user.adminRole !== 'sub_admin') return true; // super_admin/قديم
    if (!targetUser) return false;
    // 🔒 الأدمن المساعد ممنوع من التصرّف في أي حساب أدمن (منع تصعيد الصلاحيات)
    if (targetUser.role === 'admin') return false;
    // ولا في مستخدم خارج مدينته
    return targetUser.city === req.user.city;
}

const captainOnly = (req, res, next) => {
    if (req.user && req.user.role === 'captain') {
        next();
    } else {
        res.status(403).json({ message: 'غير مصرح، هذه الصلاحية للكباتن فقط' });
    }
};

const clientOnly = (req, res, next) => {
    if (req.user && (req.user.role === 'client' || req.user.role === 'customer')) {
        next();
    } else {
        res.status(403).json({ message: 'غير مصرح، هذه الصلاحية للعملاء فقط' });
    }
};

const merchantOnly = (req, res, next) => {
    if (req.user && req.user.role === 'merchant') {
        next();
    } else {
        res.status(403).json({ message: 'غير مصرح، هذه الصلاحية للتجار فقط' });
    }
};

module.exports = {
    protect, adminOnly, superAdminOnly,
    requirePermission, requireAnyPermission,
    getAdminCityFilter, resolveCreationCity, adminCanActOnUser,
    captainOnly, clientOnly, merchantOnly
};