const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

// استدعاء ملفات الحماية
const helmet = require('helmet');

// استدعاء الملفات (تأكد من صحة المسارات)
const startScheduler = require('./scheduler');
const captainRoutes = require('./routes/captain');
const complaintsRoutes = require('./routes/complaints');
const Message = require('./models/Message');

dotenv.config();

const app = express();
const server = http.createServer(app);

// إعدادات Socket.io (مع معالجة أخطاء الاتصال والانقطاع للموبايل)
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

// ✅ CORS — يجب أن يكون قبل كل شيء آخر
// Capacitor Android WebView يستخدم origin: https://localhost
// Capacitor iOS يستخدم capacitor://localhost
const corsOptions = {
    origin: ['https://wassili.site', 'https://localhost', 'http://localhost', 'capacitor://localhost'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// ✅ CRITICAL: Handle OPTIONS preflight explicitly BEFORE any other middleware
app.options('*', cors(corsOptions));
// ✅ Apply CORS to ALL routes
app.use(cors(corsOptions));

// 🔥 Security Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false, // Fix: prevents ERR_BLOCKED_BY_RESPONSE.NotSameOrigin for images
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false  // Allow images to load cross-origin
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ✅ Fallback to ensure req.body is never undefined (prevents destructuring crashes)
app.use((req, res, next) => {
    if (!req.body) req.body = {};
    next();
});

// ✅✅✅ الحماية من NoSQL Injection (متوافق مع Express v5) ✅✅✅
// في Express v5، المتغيرات (req.query, req.params) هي getters للقراءة فقط ولا يمكن إعادة تعيينها.
// لذا نقوم بتعديل الحقول الداخلية بشكل مباشر بدلاً من استخدام express-mongo-sanitize الذي يسبب Crash.
const sanitizeObject = (obj) => {
    if (obj instanceof Object) {
        for (const key in obj) {
            if (/^\$/.test(key)) {
                delete obj[key]; // حذف المفاتيح التي تبدأ بـ $ (مثل $gt او $ne)
            } else if (typeof obj[key] === 'object') {
                sanitizeObject(obj[key]);
            }
        }
    }
};

app.use((req, res, next) => {
    if (req.body) sanitizeObject(req.body);
    if (req.query) sanitizeObject(req.query);
    if (req.params) sanitizeObject(req.params);
    next();
});
// ---------------------------------------------------------

// 1. طباعة رسالة بداية
console.log("🚀 Server is starting...");

// جعل مجلد public متاحاً
app.use(express.static(path.join(__dirname, 'public_html')));

// 🖼️ Serve uploaded images — allow cross-origin access
app.use('/uploads', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
}, express.static(path.join(__dirname, 'public_html', 'uploads')));

// 2. التحقق من رابط قاعدة البيانات
const dbUri = process.env.MONGO_URI;
if (!dbUri) {
    console.error("❌ FATAL ERROR: MONGO_URI is missing in Environment Variables!");
} else {
    console.log(`📡 Attempting to connect to DB...`);
}

// Database Connection
mongoose.connect(dbUri)
    .then(() => console.log('✅ MongoDB Connected Successfully!'))
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err.message);
    });

// Routes - مسارات التطبيق
// 💡 Fix: Allow running on both Root (/) and /api for compatibility
const apiRoutes = express.Router();

apiRoutes.use('/auth', require('./routes/auth'));
apiRoutes.use('/orders', require('./routes/orders'));
apiRoutes.use('/admin', require('./routes/admin'));
apiRoutes.use('/complaints', complaintsRoutes);
apiRoutes.use('/chat', require('./routes/chat'));
apiRoutes.use('/notifications', require('./routes/notifications'));
apiRoutes.use('/captain', captainRoutes);
apiRoutes.use('/emergency', require('./routes/emergency'));
apiRoutes.use('/upload', require('./routes/upload'));
apiRoutes.use('/places', require('./routes/places'));

// ✅ Serve logo-transparent.png from embedded base64 (Render-safe)
app.use('/logo-transparent.png', require('./routes/logo-transparent'));


// 🛡️ Global Rate Limiter (100 requests per 5 minutes per IP)
const { rateLimit } = require('express-rate-limit');
const globalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100,
    message: { message: 'تجاوزت الحد المسموح به. يرجى الانتظار 5 دقائق.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false }
});

// Mount the API router
app.use('/api', globalLimiter, apiRoutes);

// Make io and chatRooms accessible to routes
app.set('io', io);
app.set('chatRooms', chatRooms);

// تشغيل المهام المجدولة
startScheduler(app);

// Socket.io connection handling
const activeUsers = {};
// chatRooms: { userId (string) → Set<orderId (string)> }
// Tracks which users are currently viewing which order chat.
// Used to suppress FCM push when the receiver is already reading the messages.
const chatRooms = {};

io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    socket.on('user_join', (userId) => {
        if (!userId) return;
        activeUsers[userId] = socket.id;
        socket.userId = userId;
        socket.join(userId);
        io.emit('user_status', { userId, status: 'online' });
        console.log(`👤 User ${userId} is now online and joined room: ${userId}`);
    });

    // ✅ Chat room presence tracking — frontend emits this when chat.html opens
    socket.on('join_chat_room', (orderId) => {
        if (!socket.userId || !orderId) return;
        if (!chatRooms[socket.userId]) chatRooms[socket.userId] = new Set();
        chatRooms[socket.userId].add(String(orderId));
        console.log(`💬 User ${socket.userId} joined chat room for order ${orderId}`);
    });

    // ✅ Frontend emits this on beforeunload / visibilitychange hidden
    socket.on('leave_chat_room', (orderId) => {
        if (!socket.userId || !orderId) return;
        if (chatRooms[socket.userId]) {
            chatRooms[socket.userId].delete(String(orderId));
        }
        console.log(`💬 User ${socket.userId} left chat room for order ${orderId}`);
    });

    socket.on('send_message', async (data) => {
        try {
            const sender = data.sender || data.senderId;
            const receiver = data.receiver || data.receiverId;
            const order = data.order || data.orderId;

            // ✅ FIX 1: تحقق صارم لمنع انتحال الشخصية في السوكت
            if (!socket.userId || socket.userId !== String(sender).trim()) {
                console.warn(`[Chat] Security Blocked: socket.userId=${socket.userId} tried to send as ${sender}`);
                return socket.emit('message_error', { error: 'Unauthorized sender ID' });
            }

            if (!sender || !receiver || !order || !data.text) {
                console.error('❌ Missing fields:', { sender: !!sender, receiver: !!receiver, order: !!order, text: !!data.text });
                return socket.emit('message_error', { error: 'Missing required fields' });
            }

            const mongoose = require('mongoose');
            const orderDocId = mongoose.Types.ObjectId.isValid(order) ? new mongoose.Types.ObjectId(order) : order;

            const message = await Message.create({
                sender, receiver, order: orderDocId, text: data.text, tempId: data.tempId, isRead: false
            });
            console.log(`✅ Message saved: id=${message._id}, order=${order}, sender=${sender}`);

            const Notification = require('./models/Notification');
            const newNotif = await Notification.create({
                user: receiver,
                title: `رسالة جديدة من ${data.senderName || 'مستخدم'}`,
                message: data.text,
                type: 'chat',
                relatedId: order
            });

            const messageData = {
                _id: message._id,
                tempId: data.tempId, // ✅ Included so receiver's UI can de-duplicate
                sender: { _id: sender, name: data.senderName },
                text: data.text,
                createdAt: message.createdAt,
                isRead: false,
                order: order
            };

            // ✅ FIX 2: الإرسال عبر room (userId) بدلاً من socketId مباشرةً
            // socket.join(userId) يضيف المستخدم لـ room باسمه، نستخدم ذلك
            io.to(String(receiver)).emit('new_message', messageData);
            io.to(String(receiver)).emit('new_notification', newNotif);

            // ✅ FIX 3: أرسل message_sent فقط للمرسل (ليس new_message ثانية لتفادي التكرار)
            socket.emit('message_sent', { success: true, messageId: message._id, tempId: data.tempId });

            // 🔔 FCM Push — only if receiver is NOT actively in this chat room
            try {
                const receiverInRoom = chatRooms[String(receiver)] &&
                    chatRooms[String(receiver)].has(String(order));

                if (!receiverInRoom) {
                    const { sendPush } = require('./utils/firebasePush');
                    const User = require('./models/User');
                    const receiverUser = await User.findById(receiver).select('fcmToken');
                    if (receiverUser && receiverUser.fcmToken) {
                        await sendPush(
                            receiverUser.fcmToken,
                            `💬 رسالة من ${data.senderName || 'مستخدم'}`,
                            data.text.substring(0, 100),
                            {
                                type: 'chat',
                                orderId: order.toString(),
                                senderId: String(sender),
                                senderName: data.senderName || 'مستخدم'
                            }
                        );
                    }
                } else {
                    console.log(`[Chat] Skipping FCM push — receiver ${receiver} is live in chat room ${order}`);
                }
            } catch (pushErr) {
                console.error('⚠️ Chat FCM push failed:', pushErr.message);
            }

        } catch (error) {
            console.error('❌ Error saving message:', error.message);
            console.error('❌ Message data was:', { sender: data.sender, receiver: data.receiver, order: data.order });
            socket.emit('message_error', { error: 'Failed to save message: ' + error.message });
        }
    });

    // ... (باقي كود الـ Socket كما هو: typing, location, disconnect) ...
    socket.on('typing', (data) => {
        const receiverSocket = activeUsers[data.receiver || data.receiverId];
        if (receiverSocket) {
            io.to(receiverSocket).emit('user_typing', {
                sender: data.sender || data.senderId || socket.userId,
                receiver: data.receiver || data.receiverId
            });
        }
    });

    socket.on('stop_typing', (data) => {
        const receiverSocket = activeUsers[data.receiver || data.receiverId];
        if (receiverSocket) {
            io.to(receiverSocket).emit('user_stop_typing', {
                sender: data.sender || data.senderId || socket.userId,
                receiver: data.receiver || data.receiverId
            });
        }
    });

    socket.on('update_location', async (data) => {
        try {
            const { userId, lat, lng, orderId } = data;
            if (!userId || !lat || !lng) return;
            const User = require('./models/User');
            await User.findByIdAndUpdate(userId, { currentLocation: { lat, lng, updatedAt: new Date() } });

            if (orderId) {
                // Direct: forward to the specific order's client
                const Order = require('./models/Order');
                const order = await Order.findById(orderId);
                if (order && order.client) {
                    io.to(order.client.toString()).emit('captain_location_updated', { orderId, lat, lng });
                }
            } else {
                // Auto-find: captain didn't send orderId, look up their active orders
                const Order = require('./models/Order');
                const activeOrders = await Order.find({
                    captain: userId,
                    status: { $in: ['accepted', 'picked_up'] }
                }).select('_id client');

                for (const order of activeOrders) {
                    if (order.client) {
                        io.to(order.client.toString()).emit('captain_location_updated', {
                            orderId: order._id,
                            lat, lng
                        });
                    }
                }

                // Also broadcast for admin live map
                io.emit('captain_location_update', { userId, lat, lng });
            }
        } catch (err) { console.error(err); }
    });

    socket.on('captain_status_change', (data) => {
        io.emit('captain_status_changed', data);
    });

    socket.on('disconnect', async () => {
        if (socket.userId) {
            delete activeUsers[socket.userId];
            // Clean up all chat room presence for this user
            delete chatRooms[socket.userId];
            io.emit('user_status', { userId: socket.userId, status: 'offline' });
            console.log(`👤 User ${socket.userId} is now offline`);

            // ✅ FIX: Do NOT auto-set captain offline when they disconnect.
            // This prevents "tab switching" from making them offline.
            // A long-polling or heartbeat system would be better for accurate online status,
            // but for now we only remove from active socket list.
        }
    });
});

// ✅ API 404 handler — must come BEFORE the SPA catch-all
app.use('/api', (req, res) => {
    res.status(404).json({ message: 'API endpoint not found' });
});

// SPA catch-all — only for non-API routes (frontend routing)
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public_html', 'index.html'));
});

// 🛡️ Global Error Handler - يمنع السيرفر من التوقف عند حدوث خطأ برمجي غير متوقع
app.use((err, req, res, next) => {
    console.error('❌ Unhandled Server Error:', err.message || err);
    res.status(500).json({
        message: 'حدث خطأ غير متوقع في الخادم',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});