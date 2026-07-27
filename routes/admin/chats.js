// routes/admin/chats.js — عارض محادثات العميل ↔ الكابتن للإدارة (قراءة فقط).
//
// لماذا مستقلّ عن routes/chat.js: مسار الدردشة العادي يبني كل شيء حول "أنا طرف في
// هذا الطلب"، والأدمن ليس طرفاً. وخلطهما يعني إضافة استثناءات أدمن داخل منطق
// التخويل نفسه — وهي أسرع طريقة لثقب فيه. هنا: قراءة فقط، بصلاحية view_chats
// المستقلة، وكل فتح محادثة يُسجَّل في AdminLog.
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const validateObjectId = require('../../middleware/validateObjectId');
router.param('orderId', validateObjectId);

const Message = require('../../models/Message');
const Order = require('../../models/Order');
// populate('client'/'captain') يحتاج تسجيل مخطط User — لا نتّكل على أن ملفاً
// آخر سجّله قبلنا (نفس ما تفعله بقية وحدات routes/admin)
require('../../models/User');
const { protect, requirePermission, getAdminCityFilter } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const { CHAT_IMAGE_TTL_HOURS } = require('../../utils/chatImage');
const logger = require('../../utils/logger');

// @route   GET /api/admin/chats
// @desc    آخر المحادثات: طلب واحد لكل صف مع آخر رسالة وعدد الرسائل
// @access  view_chats
router.get('/chats', protect, requirePermission('view_chats'), async (req, res) => {
    try {
        const limit = Math.min(100, parseInt(req.query.limit, 10) || 40);

        // نجمع من الرسائل لا من الطلبات: الطلبات التي لا محادثة فيها لا تعنينا،
        // والترتيب المطلوب هو "آخر نشاط محادثة" لا تاريخ إنشاء الطلب.
        //
        // ⚠️ الحدّ بالكمّ لا بالتاريخ: النسخة الأولى قصّت على آخر 30 يوماً، وأحدث
        // رسالة في قاعدة الإنتاج عمرها 38 يوماً — فكانت الصفحة تقول "لا محادثات"
        // مع وجود 480 رسالة، فيبدو أن الميزة معطّلة. الفرز التنازلي ثم حدّ الكمّ
        // يكبّس الحساب دائماً ويُظهر أحدث المحادثات مهما كان عمرها.
        const SCAN_LIMIT = 4000;

        const grouped = await Message.aggregate([
            { $sort: { createdAt: -1 } },   // مدعوم بفهرس createdAt في models/Message.js
            { $limit: SCAN_LIMIT },
            {
                $group: {
                    _id: '$order',
                    // الفرز تنازلي ⇒ $first هو الأحدث
                    lastAt: { $first: '$createdAt' },
                    lastText: { $first: '$text' },
                    lastImage: { $first: '$imageUrl' },
                    count: { $sum: 1 },
                    // صور حيّة فقط — المحذوفة بعد 48 ساعة لا تُعدّ
                    images: { $sum: { $cond: [{ $ifNull: ['$imageUrl', false] }, 1, 0] } }
                }
            },
            { $sort: { lastAt: -1 } },
            { $limit: limit }
        ]);

        if (grouped.length === 0) return res.json([]);

        // 🌍 عزل المدينة: sub_admin لا يرى محادثات خارج مدينته
        const cityFilter = getAdminCityFilter(req);
        const orders = await Order.find({
            _id: { $in: grouped.map(g => g._id).filter(id => mongoose.Types.ObjectId.isValid(id)) },
            ...cityFilter
        })
            .select('status city price createdAt client captain')
            .populate('client', 'name phone')
            .populate('captain', 'name phone')
            .lean();

        const byId = new Map(orders.map(o => [String(o._id), o]));

        // محادثات طلبات المتاجر (ShopOrder) لا تظهر هنا: الطلب صراحةً كان
        // "المحادثة بين الكابتن والعميل"، وShopOrder بلا حقل city فيتعذّر عزلها.
        const rows = grouped
            .map(g => {
                const order = byId.get(String(g._id));
                if (!order) return null;
                return {
                    orderId: g._id,
                    lastAt: g.lastAt,
                    preview: (g.lastText || '').trim() || (g.lastImage ? '📷 صورة' : ''),
                    count: g.count,
                    images: g.images,
                    status: order.status,
                    city: order.city,
                    price: order.price,
                    client: order.client ? { name: order.client.name, phone: order.client.phone } : null,
                    captain: order.captain ? { name: order.captain.name, phone: order.captain.phone } : null
                };
            })
            .filter(Boolean);

        res.json(rows);
    } catch (err) {
        logger.error({ err }, 'Admin chats list error');
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/admin/chats/:orderId
// @desc    رسائل محادثة طلب واحد — قراءة فقط
// @access  view_chats
router.get('/chats/:orderId', protect, requirePermission('view_chats'), async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId)
            .select('status city price createdAt client captain')
            .populate('client', 'name phone')
            .populate('captain', 'name phone')
            .lean();
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        if (req.user.adminRole === 'sub_admin' && order.city !== req.user.city) {
            return res.status(403).json({ message: 'غير مصرح — هذا الطلب خارج مدينتك' });
        }

        // ⚠️ معرّف الطلب مخزَّن في الرسائل كـ ObjectId أحياناً وكنص أحياناً (أخطاء
        // حفظ قديمة) — نفس المعالجة الموجودة في routes/chat.js
        const messages = await Message.find({
            $or: [{ order: orderId }, { order: new mongoose.Types.ObjectId(orderId) }]
        })
            .populate('sender', 'name role')
            .sort({ createdAt: 1 })
            .limit(500)
            .lean();

        // 📋 قراءة محتوى خاص — تُسجَّل دائماً مع عدد الرسائل المقروءة
        await logAdminAction(
            req, 'view_chat',
            `اطّلع على محادثة الطلب #${String(orderId).slice(-6).toUpperCase()} (${messages.length} رسالة)`,
            orderId,
            order.client?.name || ''
        );

        res.json({
            order: {
                _id: order._id,
                status: order.status,
                city: order.city,
                price: order.price,
                createdAt: order.createdAt,
                client: order.client ? { _id: order.client._id, name: order.client.name, phone: order.client.phone } : null,
                captain: order.captain ? { _id: order.captain._id, name: order.captain.name, phone: order.captain.phone } : null
            },
            imageTtlHours: CHAT_IMAGE_TTL_HOURS,
            messages
        });
    } catch (err) {
        logger.error({ err }, 'Admin chat read error');
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE /api/admin/chats/:orderId
// @desc    حذف محادثة طلب بالكامل من قاعدة البيانات + صورها من القرص
// @access  manage_chats
//
// ⚠️ لا رجعة فيه. لذلك:
//   • صلاحية manage_chats منفصلة عن view_chats — من يراقب ليس بالضرورة من يمحو.
//   • تُحذف ملفات الصور أيضاً، وإلا بقيت على القرص بلا أي مرجع يدلّ عليها
//     (مهمة الكنس في scheduler.js تلتقطها بعد 48 ساعة، لكن الحذف الفوري أنظف).
//   • تُحذف إشعارات chat_message المرتبطة، وإلا بقيت للمستخدم شارة رسائل غير
//     مقروءة تفتح على محادثة فارغة.
//   • يُسجَّل في AdminLog بعدد الرسائل — هو الأثر الوحيد الباقي بعد المحو.
router.delete('/chats/:orderId', protect, requirePermission('manage_chats'), async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId).select('city client').populate('client', 'name').lean();
        // الطلب قد يكون محذوفاً وبقيت رسائله — نسمح بالتنظيف، لكن عزل المدينة
        // يُطبَّق متى ما كان الطلب موجوداً
        if (order && req.user.adminRole === 'sub_admin' && order.city !== req.user.city) {
            return res.status(403).json({ message: 'غير مصرح — هذا الطلب خارج مدينتك' });
        }

        const orderFilter = {
            $or: [{ order: orderId }, { order: new mongoose.Types.ObjectId(orderId) }]
        };

        const messages = await Message.find(orderFilter).select('_id imageUrl').lean();
        if (messages.length === 0) {
            return res.status(404).json({ message: 'لا رسائل في هذا الطلب' });
        }

        // 1) ملفات الصور من القرص — بفحص المجلد قبل أي unlink
        const fs = require('fs');
        const path = require('path');
        const { safeUnlink } = require('../../utils/imageUpload');
        const WEB_ROOT = path.join(__dirname, '..', '..', 'public_html');
        let filesRemoved = 0;
        for (const m of messages) {
            if (!m.imageUrl || !/^\/uploads\/chat\//.test(m.imageUrl)) continue;
            const full = path.join(WEB_ROOT, m.imageUrl);
            if (fs.existsSync(full)) {
                await safeUnlink(full);
                filesRemoved++;
            }
        }

        // 2) الرسائل
        const del = await Message.deleteMany(orderFilter);

        // 3) إشعارات المحادثة المعلّقة لهذا الطلب
        const Notification = require('../../models/Notification');
        const notifFilter = {
            type: 'chat_message',
            $or: [{ relatedId: orderId }, { relatedId: new mongoose.Types.ObjectId(orderId) }]
        };
        const notifDel = await Notification.deleteMany(notifFilter);

        await logAdminAction(
            req, 'delete_chat',
            `حذف محادثة الطلب #${String(orderId).slice(-6).toUpperCase()} — ${del.deletedCount} رسالة و${filesRemoved} صورة`,
            orderId,
            order?.client?.name || '',
            { messages: del.deletedCount, images: filesRemoved, notifications: notifDel.deletedCount }
        );

        logger.warn({
            adminId: String(req.user._id), orderId,
            messages: del.deletedCount, images: filesRemoved
        }, 'Admin deleted chat conversation');

        res.json({
            message: `تم حذف ${del.deletedCount} رسالة`,
            deleted: del.deletedCount,
            images: filesRemoved,
            notifications: notifDel.deletedCount
        });
    } catch (err) {
        logger.error({ err }, 'Admin chat delete error');
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
