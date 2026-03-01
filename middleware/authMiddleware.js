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
    // 3. Try to get token from request body (used by navigator.sendBeacon which cannot set headers)
    else if (req.body && req.body._token) {
        token = req.body._token;
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

        // 🔒 Security: Verify role consistency between JWT and DB
        if (decoded.role && decoded.role !== req.user.role) {
            return res.status(401).json({ message: 'Token role mismatch — please login again' });
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

module.exports = { protect, adminOnly, captainOnly, clientOnly };