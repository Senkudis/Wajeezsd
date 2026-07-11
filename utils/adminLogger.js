const AdminLog = require('../models/AdminLog');
const logger = require('./logger');

// ══════════════════════════════════════════
// 📋 Admin Activity Logger Helper
// ══════════════════════════════════════════
async function logAdminAction(req, action, description, targetId = '', targetName = '', details = {}) {
    try {
        if (!req.user || req.user.role !== 'admin') return; // Only log admin actions
        
        await AdminLog.create({
            admin:       req.user._id,
            adminName:   req.user.name  || '',
            adminRole:   req.user.adminRole || 'super_admin',
            action,
            description,
            targetId:    String(targetId),
            targetName:  String(targetName),
            details,
            city:        req.user.city  || '',
            ip:          req.ip         || req.headers['x-forwarded-for'] || ''
        });
    } catch(e) {
        logger.warn({ err: e.message }, 'AdminLog write failed (non-fatal)');
    }
}

module.exports = { logAdminAction };
