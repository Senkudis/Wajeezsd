const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Order = require('../models/Order'); // Added for debug endpoint
const { protect } = require('../middleware/authMiddleware');
const { sendNotification } = require('../utils/notificationHelper');
const { sanitizeChatImageUrl } = require('../utils/chatImage');
const logger = require('../utils/logger');

// نصّ الإشعار لرسالة بلا نص (صورة صامتة) — `text.substring` كانت ترمي على undefined
const previewOf = (text, imageUrl) => {
    const t = (text || '').trim();
    if (t) return t.substring(0, 200);
    return imageUrl ? '📷 صورة' : '';
};

// @route   GET /api/chat/conversations
// @desc    Get user conversations list (works for all roles including merchants)
router.get('/conversations', protect, async (req, res) => {
    try {
        const userId = req.user.id;

        const mongoose = require('mongoose');
        const userObjectId = new mongoose.Types.ObjectId(userId);

        const conversations = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { sender: userObjectId },
                        { receiver: userObjectId }
                    ]
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    // Group by the OTHER user (not by order), so merchant sees one thread per client
                    _id: {
                        $cond: [
                            { $eq: ['$sender', userObjectId] },
                            '$receiver',
                            '$sender'
                        ]
                    },
                    lastMessage:    { $first: '$text' },
                    lastMessageAt:  { $first: '$createdAt' },
                    lastSender:     { $first: '$sender' },
                    lastOrderId:    { $first: '$order' },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ['$receiver', userObjectId] }, { $eq: ['$isRead', false] }] },
                                1, 0
                            ]
                        }
                    }
                }
            },
            { $sort: { lastMessageAt: -1 } }
        ]);

        if (!conversations.length) return res.json([]);

        const User = require('../models/User');

        const otherUserIds = conversations.map(c => c._id).filter(Boolean);
        const orderIds     = conversations.map(c => c.lastOrderId).filter(Boolean);

        const [usersArr, ordersArr] = await Promise.all([
            User.find({ _id: { $in: otherUserIds } }).select('name phone role').lean(),
            orderIds.length ? Order.find({ _id: { $in: orderIds } }).select('status').lean() : Promise.resolve([])
        ]);

        const userMap  = Object.fromEntries(usersArr.map(u => [u._id.toString(), u]));
        const orderMap = Object.fromEntries(ordersArr.map(o => [o._id.toString(), o]));

        const result = conversations
            .map(conv => {
                const otherUser = userMap[conv._id?.toString()];
                if (!otherUser) return null;

                const order = orderMap[conv.lastOrderId?.toString()];

                return {
                    orderId:      conv.lastOrderId || null,
                    userId:       otherUser._id,
                    user: {
                        name:  otherUser.name,
                        role:  otherUser.role,
                        phone: otherUser.phone
                    },
                    lastMessage:   conv.lastMessage,
                    lastSender:    conv.lastSender,
                    lastMessageAt: conv.lastMessageAt,
                    unreadCount:   conv.unreadCount,
                    orderStatus:   order ? order.status : 'unknown'
                };
            })
            .filter(Boolean);

        res.json(result);
    } catch (error) {
        logger.error('[Chat] Get Conversations Error:', error);
        res.status(500).json({ message: 'فشل في جلب المحادثات', detail: error.message });
    }
});


// @route   POST /api/chat
// @desc    Send a message via HTTP fallback
router.post('/', protect, async (req, res) => {
    try {
        const { receiver, order, text, tempId } = req.body;
        const sender = req.user.id;
        const senderName = req.user.name; // assuming req.user has name from authMiddleware populate

        // 🖼️ صورة مرفقة (اختيارية) — تُقبل فقط من مجلد الدردشة، انظر utils/chatImage.js
        const imageUrl = sanitizeChatImageUrl(req.body.imageUrl);
        if (req.body.imageUrl && !imageUrl) {
            return res.status(400).json({ message: 'رابط الصورة غير صالح' });
        }

        if (!receiver || !order || (!text && !imageUrl)) {
            return res.status(400).json({ message: 'البيانات ناقصة' });
        }

        if (sender.toString() === receiver.toString()) {
            return res.status(400).json({ message: 'لا يمكنك مراسلة نفسك' });
        }

        // ✅ maxLength: منع الرسائل الضخمة
        if (typeof text === 'string' && text.length > 1000) {
            return res.status(400).json({ message: 'الرسالة طويلة جداً (الحد الأقصى 1000 حرف)' });
        }

        // 🚫 Block suspended captains from chatting
        const SenderUser = require('../models/User');
        const senderDoc = await SenderUser.findById(sender).select('is_blocked').lean();
        if (senderDoc?.is_blocked) {
            return res.status(403).json({ message: 'حسابك موقوف بسبب تجاوز الحد الائتماني. يرجى السداد أولاً.' });
        }

        // Security Check: Verify order and participants — try Order first, then ShopOrder
        const Order = require('../models/Order');
        let orderDoc = await Order.findById(order).lean();
        let isShopOrderChat = false;

        if (!orderDoc) {
            const ShopOrder = require('../models/ShopOrder');
            const shopDoc = await ShopOrder.findById(order)
                .populate('place', 'ownerId')
                .select('client place status')
                .lean();

            if (!shopDoc) {
                return res.status(404).json({ message: 'الطلب غير موجود' });
            }

            // Validate parties
            const shopClient = String(shopDoc.client);
            const shopMerchant = shopDoc.place && shopDoc.place.ownerId ? String(shopDoc.place.ownerId) : '';
            if (sender !== shopClient && sender !== shopMerchant) {
                return res.status(403).json({ message: 'غير مصرح' });
            }
            if (receiver !== shopClient && receiver !== shopMerchant) {
                return res.status(403).json({ message: 'المستلم غير صالح' });
            }

            if (shopDoc.status === 'cancelled') {
                return res.status(403).json({ message: 'الدردشة مغلقة لهذا الطلب الملغي' });
            }

            isShopOrderChat = true;
        }

        // ✅ For regular orders: check if closed
        if (!isShopOrderChat && (orderDoc.status === 'delivered' || orderDoc.status === 'cancelled')) {
            return res.status(403).json({ message: 'الدردشة مغلقة لهذا الطلب المكتمل' });
        }

        const message = await Message.create({
            sender,
            receiver,
            order,
            text: text || '',
            imageUrl,
            tempId,
            isRead: false
        });

        // Try to push notification and socket event via global app.get('io')
        try {
            const mongoose = require('mongoose');
            const orderObjectId = mongoose.Types.ObjectId.isValid(order)
                ? new mongoose.Types.ObjectId(order) : order;

            // ✅ Upsert: keep exactly ONE unread chat_message notification per order
            const upsertedNotif = await Notification.findOneAndUpdate(
                {
                    user: receiver,
                    type: 'chat_message',
                    relatedId: orderObjectId,
                    isRead: false
                },
                {
                    $set: {
                        title: `💬 رسالة من ${senderName || 'مستخدم'}`,
                        message: previewOf(text, imageUrl),
                        createdAt: new Date()
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            const io = req.app.get('io');
            if (io) {
                const messageData = {
                    _id: message._id,
                    tempId: tempId, // Pass tempId so UI knows this is the message it sent optimistically
                    sender: { _id: sender, name: senderName },
                    text: text || '',
                    imageUrl,
                    createdAt: message.createdAt,
                    isRead: false,
                    order: order
                };
                // since user joins room with their userId!
                io.to(receiver).emit('new_message', messageData);
                io.to(receiver).emit('new_notification', upsertedNotif);
            }

            // FCM chat push — only if receiver is NOT live in this chat room
            const chatRooms = req.app.get('chatRooms') || {};
            const receiverInRoom = chatRooms[String(receiver)] &&
                chatRooms[String(receiver)].has(String(order));

            if (!receiverInRoom) {
                const { sendChatPush } = require('../utils/firebasePush');
                const User = require('../models/User');
                const receiverUser = await User.findById(receiver).select('fcmToken');
                if (receiverUser && receiverUser.fcmToken) {
                    await sendChatPush(
                        receiverUser.fcmToken,
                        `💬 رسالة من ${senderName || 'مستخدم'}`,
                        previewOf(text, imageUrl),
                        {
                            type: 'chat_message',
                            orderId: order.toString(),
                            senderId: String(sender),
                            senderName: senderName || 'مستخدم'
                        }
                    );
                }
            } else {
                logger.info(`[Chat] HTTP: Skipping FCM push — receiver ${receiver} is live in chat room ${order}`);
            }
        } catch (e) {
            logger.error('[Chat] POST push error:', e);
        }

        // Return standard Mongoose doc, but include tempId so HTTP caller can map it
        const responseData = message.toObject();
        if (tempId) {
            responseData.tempId = tempId;
        }

        res.status(201).json(responseData);
    } catch (error) {
        logger.error('[Chat] Send Message HTTP Error:', error);
        res.status(500).json({ message: 'فشل إرسال الرسالة' });
    }
});

// @route   POST /api/chat/leave-room
// @desc    Reliably leave chat room via navigator.sendBeacon when app goes to background
router.post('/leave-room', async (req, res) => {
    try {
        let orderId, userId;
        if (req.headers['content-type'] === 'text/plain;charset=UTF-8') {
            try {
                const parsed = JSON.parse(req.body);
                orderId = parsed.orderId;
                userId = parsed.userId;
            } catch(e) {}
        } else {
            orderId = req.body.orderId;
            userId = req.body.userId;
        }

        if (orderId && userId && req.app.get('chatRooms')) {
            const chatRooms = req.app.get('chatRooms');
            if (chatRooms[String(userId)]) {
                chatRooms[String(userId)].delete(String(orderId));
            }
        }
        res.status(200).send('OK');
    } catch (error) {
        res.status(500).send('Error');
    }
});

// @route   POST /api/chat/read
// @desc    Mark messages as read for a specific order and emit socket event
router.post('/read', protect, async (req, res) => {
    try {
        const { orderId } = req.body;
        const mongoose = require('mongoose');

        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'معرف الطلب غير صحيح' });
        }

        // Find unread messages where the current user is the receiver
        const filter = {
            $or: [
                { order: orderId },
                { order: new mongoose.Types.ObjectId(orderId) }
            ],
            receiver: req.user.id,
            isRead: false
        };

        const unreadMessages = await Message.find(filter).select('sender');

        if (unreadMessages.length > 0) {
            await Message.updateMany(filter, { isRead: true });

            // Notify the sender(s) that their messages were read
            const sendersToNotify = [...new Set(unreadMessages.map(m => String(m.sender)))];
            const io = req.app.get('io');

            if (io) {
                sendersToNotify.forEach(senderId => {
                    io.to(senderId).emit('messages_read', { orderId });
                });
            }
        }

        res.json({ success: true, count: unreadMessages.length });
    } catch (error) {
        logger.error('[Chat] Mark Read Error:', error);
        res.status(500).json({ message: 'فشل في تحديث حالة الرسائل' });
    }
});

// @route   GET /api/chat/:orderId
// @desc    Get messages for an order (with pagination)
router.get('/:orderId', protect, async (req, res) => {
    try {
        const orderId = req.params.orderId.trim(); // ✅ Trim whitespace
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const skip = (page - 1) * limit;

        // Validate orderId format
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            logger.error(`[Chat] Invalid orderId format: "${orderId}"`);
            return res.status(400).json({ message: 'معرف الطلب غير صحيح' });
        }

        // ✅ Authorization — check Order first, then fall back to ShopOrder
        let orderDoc = await Order.findById(orderId).select('client captain').lean();
        let isShopOrder = false;
        
        if (!orderDoc) {
            // Try ShopOrder (merchant ↔ client chat)
            const ShopOrder = require('../models/ShopOrder');
            const shopDoc = await ShopOrder.findById(orderId)
                .populate('place', 'ownerId')
                .select('client place')
                .lean();

            if (!shopDoc) {
                return res.status(404).json({ message: 'الطلب غير موجود' });
            }

            // Treat client as client, merchant owner as captain for auth purposes
            orderDoc = {
                client: shopDoc.client,
                captain: shopDoc.place && shopDoc.place.ownerId
                    ? shopDoc.place.ownerId
                    : null
            };
            isShopOrder = true;
        }

        const userId = req.user.id;
        const isClient  = orderDoc.client  && String(orderDoc.client)  === userId;
        const isCaptain = orderDoc.captain && String(orderDoc.captain) === userId;
        const isAdmin   = req.user.role === 'admin';
        if (!isClient && !isCaptain && !isAdmin) {
            return res.status(403).json({ message: 'غير مصرح — أنت لست طرفاً في هذا الطلب' });
        }

        // ✅ Force query with both String and ObjectId to handle past mistakes in data saving
        // Sort descending first to get latest messages, then skip/limit, then we'll reverse in array
        const messagesQuery = Message.find({
            $or: [
                { order: orderId },
                { order: new mongoose.Types.ObjectId(orderId) }
            ]
        })
            .populate('sender', 'name role profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const messages = await messagesQuery;

        // ✅ FIX: Only mark as read on page 1 — skip during pagination (page 2, 3...)
        if (page === 1) {
            await Message.updateMany(
                {
                    $or: [
                        { order: orderId },
                        { order: new mongoose.Types.ObjectId(orderId) }
                    ],
                    receiver: req.user.id,
                    isRead: false
                },
                { isRead: true }
            );
        }

        // Reverse to return in chronological order for UI: oldest to newest
        res.json({
            messages: messages.reverse(),
            page,
            limit,
            hasMore: messages.length === limit
        });
    } catch (error) {
        logger.error('[Chat] Get Messages Error:', error);
        res.status(500).json({ message: 'فشل في جلب الرسائل' });
    }
});

module.exports = router;