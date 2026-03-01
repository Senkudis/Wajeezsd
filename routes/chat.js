const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Order = require('../models/Order'); // Added for debug endpoint
const { protect } = require('../middleware/authMiddleware');
const { sendNotification } = require('../utils/notificationHelper');

// @route   GET /api/chat/conversations
// @desc    Get user conversations list
router.get('/conversations', protect, async (req, res) => {
    try {
        const userId = req.user.id;

        // Aggregate messages where the user is either sender or receiver
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
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: "$order",
                    lastMessage: { $first: "$text" },
                    lastMessageAt: { $first: "$createdAt" },
                    lastSender: { $first: "$sender" },
                    participants: { $first: ["$sender", "$receiver"] },
                    unreadCount: {
                        $sum: {
                            $cond: [{ $and: [{ $eq: ["$receiver", userObjectId] }, { $eq: ["$isRead", false] }] }, 1, 0]
                        }
                    }
                }
            }
        ]);

        // Populate order and other user details
        const User = require('../models/User');

        const populatedConversations = [];

        for (const conv of conversations) {
            const otherUserId = conv.participants.find(p => p.toString() !== userId.toString());
            if (!otherUserId) continue;

            const otherUser = await User.findById(otherUserId).select('name phone role profileImage vehicleType');
            if (!otherUser) continue;

            // Try to find order to check if it's active
            const order = await Order.findById(conv._id).select('status');

            populatedConversations.push({
                orderId: conv._id,
                userId: otherUser._id,
                user: {
                    name: otherUser.name,
                    role: otherUser.role,
                    phone: otherUser.phone
                },
                lastMessage: conv.lastMessage,
                lastSender: conv.lastSender,
                lastMessageAt: conv.lastMessageAt,
                unreadCount: conv.unreadCount,
                orderStatus: order ? order.status : 'unknown'
            });
        }

        // Sort explicitly by date
        populatedConversations.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

        res.json(populatedConversations);
    } catch (error) {
        console.error('[Chat] Get Conversations Error:', error);
        res.status(500).json({ message: 'فشل في جلب المحادثات' });
    }
});

// @route   POST /api/chat
// @desc    Send a message via HTTP fallback
router.post('/', protect, async (req, res) => {
    try {
        const { receiver, order, text, tempId } = req.body;
        const sender = req.user.id;
        const senderName = req.user.name; // assuming req.user has name from authMiddleware populate

        if (!receiver || !order || !text) {
            return res.status(400).json({ message: 'البيانات ناقصة' });
        }

        // Security Check: Verify order status and participants
        const Order = require('../models/Order');
        const orderDoc = await Order.findById(order);
        if (!orderDoc) {
            return res.status(404).json({ message: 'الطلب غير موجود' });
        }

        if (orderDoc.status === 'delivered' || orderDoc.status === 'canceled') {
            return res.status(403).json({ message: 'الدردشة مغلقة لهذا الطلب المكتمل' });
        }

        const message = await Message.create({
            sender,
            receiver,
            order,
            text,
            tempId,
            isRead: false
        });

        // Try to push notification and socket event via global app.get('io')
        try {
            const newNotif = await Notification.create({
                user: receiver,
                title: `رسالة جديدة من ${senderName || 'مستخدم'}`,
                message: text,
                type: 'chat',
                relatedId: order
            });

            const io = req.app.get('io');
            if (io) {
                const messageData = {
                    _id: message._id,
                    tempId: tempId, // Pass tempId so UI knows this is the message it sent optimistically
                    sender: { _id: sender, name: senderName },
                    text: text,
                    createdAt: message.createdAt,
                    isRead: false,
                    order: order
                };
                // since user joins room with their userId!
                io.to(receiver).emit('new_message', messageData);
                io.to(receiver).emit('new_notification', newNotif);
            }

            // FCM push — only if receiver is NOT live in this chat room
            const chatRooms = req.app.get('chatRooms') || {};
            const receiverInRoom = chatRooms[String(receiver)] &&
                chatRooms[String(receiver)].has(String(order));

            if (!receiverInRoom) {
                const { sendPush } = require('../utils/firebasePush');
                const User = require('../models/User');
                const receiverUser = await User.findById(receiver).select('fcmToken');
                if (receiverUser && receiverUser.fcmToken) {
                    await sendPush(
                        receiverUser.fcmToken,
                        `💬 رسالة من ${senderName || 'مستخدم'}`,
                        text.substring(0, 100),
                        {
                            type: 'chat',
                            orderId: order.toString(),
                            senderId: String(sender),
                            senderName: senderName || 'مستخدم'
                        }
                    );
                }
            } else {
                console.log(`[Chat] HTTP: Skipping FCM push — receiver ${receiver} is live in chat room ${order}`);
            }
        } catch (e) {
            console.error('[Chat] POST push error:', e);
        }

        // Return standard Mongoose doc, but include tempId so HTTP caller can map it
        const responseData = message.toObject();
        if (tempId) {
            responseData.tempId = tempId;
        }

        res.status(201).json(responseData);
    } catch (error) {
        console.error('[Chat] Send Message HTTP Error:', error);
        res.status(500).json({ message: 'فشل إرسال الرسالة' });
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
        console.error('[Chat] Mark Read Error:', error);
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
            console.error(`[Chat] Invalid orderId format: "${orderId}"`);
            return res.status(400).json({ message: 'معرف الطلب غير صحيح' });
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

        // Mark incoming messages as read (Only if it's the first page usually, or all if preferred)
        // Since we have a real-time read endpoint now, we still mark here as a fallback
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

        // Reverse to return in chronological order for UI: oldest to newest
        res.json({
            messages: messages.reverse(),
            page,
            limit,
            hasMore: messages.length === limit
        });
    } catch (error) {
        console.error('[Chat] Get Messages Error:', error);
        res.status(500).json({ message: 'فشل في جلب الرسائل' });
    }
});

module.exports = router;