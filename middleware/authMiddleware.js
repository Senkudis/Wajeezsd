const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.userId).select('-password');

        if (!req.user) {
            return res.status(401).json({ message: 'المستخدم غير موجود' });
        }

        next();
    } catch (error) {
        // Return 401 instead of throwing
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

// --- هذا هو الجزء الذي كان ناقصاً عندك ---
const adminOnly = (req, res, next) => {
    // نتحقق مما إذا كان المستخدم موجوداً، وأن دوره هو 'admin'
    // ملاحظة: تأكد أن اسم الحقل في الداتابيز هو 'role' وقيمته 'admin'
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'غير مصرح، هذه الصلاحية للمسؤولين فقط' });
    }
};
// ---------------------------------------

module.exports = { protect, adminOnly };