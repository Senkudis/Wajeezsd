const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const logger = require('./utils/logger');

// استدعاء ملفات الحماية
const helmet = require('helmet');

// استدعاء الملفات (تأكد من صحة المسارات)
const connectDB = require('./config/db');
const schedulerModule = require('./scheduler');
const startScheduler = typeof schedulerModule === 'function' ? schedulerModule : schedulerModule.startScheduler;
const captainRoutes = require('./routes/captain');
const complaintsRoutes = require('./routes/complaints');
const Message      = require('./models/Message');
const User         = require('./models/User');
const Order        = require('./models/Order');
const Notification = require('./models/Notification');

dotenv.config();

// 🔒 JWT_SECRET strength validation — reject weak secrets at startup
(() => {
    const secret = process.env.JWT_SECRET || '';
    if (secret.length < 32) {
        logger.error('FATAL: JWT_SECRET must be at least 32 bytes in length. Current length: ' + secret.length);
        process.exit(1);
    }
    if (/wassili[_-]?secret/i.test(secret)) {
        logger.error('FATAL: JWT_SECRET matches weak pattern (wassili_secret)');
        process.exit(1);
    }
    if (/123/.test(secret)) {
        logger.error('FATAL: JWT_SECRET matches weak pattern (contains 123)');
        process.exit(1);
    }
    if (/password/i.test(secret)) {
        logger.error('FATAL: JWT_SECRET matches weak pattern (contains password)');
        process.exit(1);
    }
})();

const app = express();
const server = http.createServer(app);

// ✅ Fix Reverse Proxy IP Issue (cPanel/Nginx)
// Allows rate limiters to use real client IP from X-Forwarded-For header
app.set('trust proxy', 1);

// ✅ Approved CORS origins — used by both Socket.io and Express CORS
const approvedOrigins = [
    'https://wajeezsd.com',
    'https://www.wajeezsd.com',      // ✅ www subdomain
    'https://ref.wajeezsd.com',      // ✅ Referral subdomain
    'http://ref.wajeezsd.com',
    'https://localhost',
    'http://localhost',
    'http://localhost:3000',         // ✅ التطوير المحلي (السيرفر نفسه يخدم الواجهة)
    'http://127.0.0.1:3000',         // ✅ التطوير المحلي (بديل localhost)
    'capacitor://localhost',
    'https://wajeezsd.secure.local',
    'http://wajeezsd.secure.local'
];

// إعدادات Socket.io (مع معالجة أخطاء الاتصال والانقطاع للموبايل)
const io = socketIo(server, {
    cors: {
        origin: approvedOrigins,
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
    origin: function (origin, callback) {
        // ✅ FIX #1: التحقق من origin مقابل قائمة النطاقات المعتمدة
        // الطلبات بدون origin (مثل Postman أو mobile) مسموح بها
        if (!origin || approvedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS: النطاق غير مسموح به: ' + origin));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// ✅ CRITICAL: app.options('*', cors()) crashes Express 5 because * requires naming.
// However, app.use(cors(corsOptions)) natively handles OPTIONS requests properly!
app.use(cors(corsOptions));

// 🔥 Security Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false, // Fix: prevents ERR_BLOCKED_BY_RESPONSE.NotSameOrigin for images
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false  // Allow images to load cross-origin
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// ✅ Fallback to ensure req.body is never undefined (prevents destructuring crashes)
app.use((req, res, next) => {
    if (!req.body) req.body = {};
    next();
});

// ✅ Method Override (WAF Bypass): 
// يُحول طلبات POST التي تحتوي على ?_method=PUT أو ?_method=DELETE
// إلى نوعها الأصلي لكي لا يحظرها جدار حماية الاستضافة (ModSecurity)
app.use((req, res, next) => {
    if (req.method === 'POST' && typeof req.query._method === 'string') {
        // قائمة مسموحة فقط — قيمة عشوائية (أو مصفوفة ?_method=A&_method=B) كانت تسبب 500 أو method غير متوقع
        const overridden = req.query._method.toUpperCase();
        if (['PUT', 'DELETE', 'PATCH'].includes(overridden)) {
            req.method = overridden;
        }
    }
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
logger.info('Server is starting...');

// 🖼️ Serve uploaded images with cross-origin headers
app.use(['/uploads', '/api/uploads'], (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Dynamic origin checking — only allow approved origins
    const requestOrigin = req.headers.origin;
    if (requestOrigin && approvedOrigins.includes(requestOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    }
    next();
}, 
// 1. البحث في المجلد الجديد أولاً
express.static(path.join(__dirname, 'public_html', 'uploads')),
// 2. البحث في المجلد القديم للتوافق مع الصور المرفوعة سابقاً
express.static(path.join(__dirname, 'uploads'))
);

// جعل مجلد public متاحاً
app.use(express.static(path.join(__dirname, 'public_html')));

// 2. Database Connection — single source via config/db.js
connectDB();

// Routes - مسارات التطبيق
// 💡 Fix: Allow running on both Root (/) and /api for compatibility
const apiRoutes = express.Router();

apiRoutes.use('/config', require('./routes/config'));
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
apiRoutes.use('/beacon', require('./routes/beacon'));
apiRoutes.use('/merchant', require('./routes/merchant'));
const merchantRequestsRoutes = require('./routes/merchantRequests');
apiRoutes.use('/merchant-requests', merchantRequestsRoutes);
apiRoutes.use('/banners', require('./routes/banners'));
apiRoutes.use('/referral', require('./routes/referral'));


// ✅ Serve logo-transparent.png from embedded base64 (Render-safe)
app.use('/logo-transparent.png', require('./routes/logo-transparent'));

// 🔗 روابط المتاجر القصيرة — wajeezsd.com/s/<code> (صفحة المتجر + معاينة OG لواتساب)
app.use('/s', require('./routes/share'));

// 🔗 روابط المنتجات القصيرة — wajeezsd.com/p/<code> (صفحة المتجر تفتح على المنتج مباشرة)
app.use('/p', require('./routes/product-share'));

// 🤖 Android App Links verification — express.static يتجاهل مجلدات النقطة
// (dotfiles:'ignore' افتراضياً) فكان الملف يرجع 404 رغم وجوده. نخدمه صراحةً.
app.get('/.well-known/assetlinks.json', (req, res) => {
    res.type('application/json');
    // dotfiles:'allow' ضروري هنا أيضاً — sendFile يرفض مسارات النقطة افتراضياً مثل static
    res.sendFile(path.join(__dirname, 'public_html', '.well-known', 'assetlinks.json'), { dotfiles: 'allow' });
});

// ✅ FIX #18: حُذف تعريف /api/auth/app-config المكرر من هنا
// هذا الـ endpoint مُعرَّف بشكل صحيح داخل routes/auth.js
// ويُستدعى عبر apiRoutes المُنضمة على /api


// 🛡️ Global Rate Limiter (500 requests per 5 minutes per IP)
const { rateLimit } = require('express-rate-limit');
const globalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 500,
    message: { message: 'تجاوزت الحد المسموح به. يرجى الانتظار 5 دقائق.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false }
});
// Note: Auth route limiters (login/register) are declared inside routes/auth.js per-route

// ✅ FIX #14: Auth-specific rate limiters are applied PER-ROUTE inside routes/auth.js
// Applying them here (before globalLimiter) caused BOTH limiters to fire on login/register,
// meaning the global 100-req pool could exhaust before the stricter auth limit triggered.
// The authLimiter is now declared and used directly inside routes/auth.js.

// Mount the API router (globalLimiter applies to all /api routes)
app.use('/api', globalLimiter, apiRoutes);

// Socket.io connection handling
const activeUsers = {};
// chatRooms: { userId (string) → Set<orderId (string)> }
// Tracks which users are currently viewing which order chat.
// Used to suppress FCM push when the receiver is already reading the messages.
const chatRooms = {};

// ⚡ Location throttle: max 1 update per 3 seconds per captain
const locationThrottle = {};
// تنظيف دوري: المداخل كانت تبقى للأبد لكل كابتن أرسل موقعاً — نمو ذاكرة بلا حد
setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const id in locationThrottle) {
        if (locationThrottle[id] < cutoff) delete locationThrottle[id];
    }
}, 10 * 60 * 1000).unref();

// Make io and chatRooms accessible to routes
app.set('io', io);
app.set('chatRooms', chatRooms);

// تشغيل المهام المجدولة — فقط بعد اتصال قاعدة البيانات
mongoose.connection.once('connected', () => {
    startScheduler(app);
    logger.info('Scheduler started after DB connection');

    // 🌉 جسر مؤقت: استقبال طلبات تطبيق "وصّلي" القديم كإشعارات في الجديد.
    // يعمل فقط عند ضبط OLD_MONGO_URI — وإلا يبقى معطّلاً بلا أي أثر.
    try {
        const { startLegacyOrderBridge } = require('./services/legacyBridge');
        startLegacyOrderBridge(app);
    } catch (bridgeErr) {
        logger.error({ err: String(bridgeErr) }, 'Legacy bridge failed to start');
    }
});

io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'User connected');

    // ✅ user_join: handles both first-connect and RECONNECT.
    // Mobile clients MUST emit this inside socket.on('connect', ...) — not just once —
    // so that after a network drop the new socket ID rejoins all required rooms.
    socket.on('user_join', async (userId) => {
        if (!userId) return;
        const cleanId = String(userId).trim(); // ✅ Normalise always
        activeUsers[cleanId] = socket.id;
        socket.userId = cleanId;
        socket.join(cleanId); // Personal room for direct messages (chat, notifications)

        // 🌍 City Room — fetch from DB and join city-specific broadcast room.
        // This ensures captains/clients ONLY receive order events for their city.
        // Runs on every connect AND reconnect (new socket ID = must rejoin all rooms).
        try {
            const userDoc = await User.findById(cleanId).select('city role').lean();
            const userCity = userDoc && userDoc.city ? userDoc.city : null;

            // ✅ FIX #3: Store user role on socket for authorization checks (e.g. admin_join)
            socket.userRole = userDoc?.role || null;

            if (userCity) {
                const cityRoom = `room_${userCity}`;
                socket.userCity = userCity;
                socket.join(cityRoom);
                logger.debug({ userId: cleanId, role: userDoc.role, cityRoom }, 'User joined city room');
            } else {
                // Legacy user — city not yet set (migration may not have run).
                // Default to Khartoum so the app keeps working; log a warning.
                socket.userCity = 'Khartoum';
                socket.join('room_Khartoum');
                logger.warn({ userId: cleanId }, '[City] User has no city field — defaulted to room_Khartoum. Run migration.');
            }

            // ✅ FIX #1: If admin reconnects, auto-rejoin admin_room
            if (userDoc?.role === 'admin') {
                socket.join('admin_room');
                logger.info({ userId: cleanId }, 'Admin auto-joined admin_room on user_join');
            }
        } catch (cityErr) {
            // Non-fatal: user still gets their personal room. Log and continue.
            logger.error({ err: cityErr, userId: cleanId }, '[City] Failed to fetch city on user_join');
        }

        // ✅ FIX #3: Only notify admin_room + the user themselves — stop broadcasting to everyone
        socket.emit('user_status', { userId: cleanId, status: 'online' });
        io.to('admin_room').emit('user_status', { userId: cleanId, status: 'online' });
        logger.debug({ userId: cleanId }, 'User is now online and joined room');
    });

    // ✅ FIX #1: admin_join now verifies the user is actually an admin
    // socket.userRole is set during user_join from the DB — cannot be spoofed
    socket.on('admin_join', () => {
        if (socket.userRole !== 'admin') {
            logger.warn({ socketId: socket.id, userId: socket.userId, role: socket.userRole }, 'Unauthorized admin_join attempt — blocked');
            return; // Silently ignore unauthorized attempts
        }
        socket.join('admin_room');
        logger.info({ socketId: socket.id, userId: socket.userId }, 'Admin joined admin_room');
    });

    // ✅ Chat room presence tracking — frontend emits this when chat.html opens
    socket.on('join_chat_room', (orderId) => {
        if (!socket.userId || !orderId) return;
        if (!chatRooms[socket.userId]) chatRooms[socket.userId] = new Set();
        chatRooms[socket.userId].add(String(orderId));
        logger.debug({ userId: socket.userId, orderId }, 'User joined chat room');
    });

    // 🛒 Feature 1: عملاء ينضمون لغرفة المتجر لتلقي تحديثات المخزون فوراً
    socket.on('join_shop_room', (placeId) => {
        if (placeId && /^[0-9a-fA-F]{24}$/.test(String(placeId))) {
            socket.join(`shop_${placeId}`);
            logger.debug({ socketId: socket.id, placeId }, 'Client joined shop room for stock updates');
        }
    });


    // ✅ Frontend emits this on beforeunload / visibilitychange hidden
    socket.on('leave_chat_room', (orderId) => {
        if (!socket.userId || !orderId) return;
        if (chatRooms[socket.userId]) {
            chatRooms[socket.userId].delete(String(orderId));
        }
        logger.debug({ userId: socket.userId, orderId }, 'User left chat room');
    });

    // ✅ FIX: Callback Acknowledgement Pattern
    // الفرونت يبعت: socket.emit('send_message', data, callbackFn)
    // السيرفر يستقبل الـ callback كآخر argument ويستدعيه فور حفظ الرسالة
    // هذا يضمن أن الفرونت يعرف فوراً إن الرسالة اتحفظت وحال تمسح من localStorage
    socket.on('send_message', async (data, ack) => {
        // دالة الرد الآمنة — تتحقق إن الـ ack موجود وهو function قبل استدعائه
        const sendAck = (payload) => {
            if (typeof ack === 'function') ack(payload);
        };

        try {
            const sender = String(data.sender || data.senderId || '').trim();
            const receiver = String(data.receiver || data.receiverId || '').trim();
            const order = String(data.order || data.orderId || '').trim();

            // ✅ FIX #6: Validate required fields FIRST before identity checks
            // Prevents misleading "Unauthorized" errors when fields are simply missing
            if (!sender || !receiver || !order || !data.text) {
                logger.error({ sender: !!sender, receiver: !!receiver, order: !!order, text: !!data.text }, 'Missing fields in send_message');
                return sendAck({ status: 'error', error: 'Missing required fields' });
            }

            // 🚫 Block suspended captains from chatting
            const SenderUser = require('./models/User');
            const senderDoc = await SenderUser.findById(sender).select('is_blocked').lean();
            if (senderDoc?.is_blocked) {
                return sendAck({ status: 'error', error: 'حسابك موقوف بسبب تجاوز الحد الائتماني. يرجى السداد أولاً.' });
            }

            // 🔒 Security: تحقق من هوية المرسل عبر socket.userId المحدد في user_join
            if (!socket.userId) {
                logger.warn('[Chat] socket.userId not set — user_join may not have fired yet');
                return sendAck({ status: 'error', error: 'Not joined yet, please reconnect' });
            }
            if (socket.userId !== sender) {
                logger.warn({ socketUserId: socket.userId, claimedSender: sender }, '[Chat] userId mismatch — blocking');
                return sendAck({ status: 'error', error: 'Unauthorized sender ID' });
            }

            // 🔒 Authorization: verify both sender and receiver are parties to the order
            // First try normal Order, then fall back to ShopOrder (for merchant-client chat)
            const Order = require('./models/Order');
            let chatOrder = await Order.findById(order);
            let isShopOrder = false;

            if (!chatOrder) {
                // Try ShopOrder
                const ShopOrder = require('./models/ShopOrder');
                chatOrder = await ShopOrder.findById(order).populate('place', 'ownerId');
                // ✅ FIX #7: isShopOrder يُعيَّن فقط لو chatOrder وُجد فعلاً
                if (chatOrder) isShopOrder = true;
            }

            if (!chatOrder) {
                return sendAck({ status: 'error', error: 'Order not found' });
            }

            // ✅ FIX #7: isShopOrder يُعيَّن هنا بشكل صحيح بعد التحقق من وجود chatOrder
            let orderClient, orderCaptain;
            if (isShopOrder) {
                // For ShopOrders: client ↔ merchant owner
                orderClient = String(chatOrder.client);
                orderCaptain = chatOrder.place && chatOrder.place.ownerId
                    ? String(chatOrder.place.ownerId)
                    : (chatOrder.captain ? String(chatOrder.captain) : '');
            } else {
                orderClient = String(chatOrder.client);
                orderCaptain = chatOrder.captain ? String(chatOrder.captain) : '';
            }

            if (orderClient !== receiver && orderCaptain !== receiver) {
                return sendAck({ status: 'error', error: 'Receiver not party to order' });
            }
            if (orderClient !== sender && orderCaptain !== sender) {
                return sendAck({ status: 'error', error: 'Sender not party to order' });
            }

            const mongoose = require('mongoose');
            const orderDocId = mongoose.Types.ObjectId.isValid(order)
                ? new mongoose.Types.ObjectId(order) : order;

            // 💾 حفظ الرسالة في MongoDB
            const message = await Message.create({
                sender, receiver, order: orderDocId,
                text: data.text, tempId: data.tempId, isRead: false
            });
            logger.info({ messageId: message._id, orderId: order, sender }, 'Message saved');

            const Notification = require('./models/Notification');
            const orderObjectId = mongoose.Types.ObjectId.isValid(order)
                ? new mongoose.Types.ObjectId(order) : order;

            // 🔔 Upsert إشعار واحد للمحادثة (لا تكرار)
            const upsertedNotif = await Notification.findOneAndUpdate(
                { user: receiver, type: 'chat_message', relatedId: orderObjectId, isRead: false },
                {
                    $set: {
                        title: `💬 رسالة من ${data.senderName || 'مستخدم'}`,
                        message: data.text.substring(0, 200),
                        createdAt: new Date()
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            const messageData = {
                _id: message._id,
                tempId: data.tempId,
                sender: { _id: sender, name: data.senderName },
                text: data.text,
                createdAt: message.createdAt,
                isRead: false,
                order: order
            };

            // 📬 إرسال الرسالة للمستلم — نضيف senderId حتى يستطيع العميل فتح المحادثة مباشرة
            const notifPayload = upsertedNotif.toObject ? upsertedNotif.toObject() : { ...upsertedNotif._doc };
            notifPayload.senderId = sender; // 🔑 مطلوب لبناء رابط chat.html?orderId=...&receiverId=...
            io.to(receiver).emit('new_message', messageData);
            io.to(receiver).emit('new_notification', notifPayload);

            // ✅ ACK للمرسل: هذا يُبلغ الفرونت فوراً بنجاح الحفظ
            // الفرونت سيمسح الرسالة من localStorage فور استلام هذا الـ callback
            sendAck({
                status: 'success',
                tempId: data.tempId,       // لتحديد عنصر DOM
                realId: String(message._id) // المعرف الحقيقي في DB
            });

            // 🔔 FCM Push — فقط لو المستلم مش في غرفة الشات
            try {
                const receiverInRoom = chatRooms[String(receiver)] &&
                    chatRooms[String(receiver)].has(String(order));

                if (!receiverInRoom) {
                    const { sendChatPush } = require('./utils/firebasePush');
                    const receiverUser = await User.findById(receiver).select('fcmToken');
                    if (receiverUser && receiverUser.fcmToken) {
                        await sendChatPush(
                            receiverUser.fcmToken,
                            `💬 رسالة من ${data.senderName || 'مستخدم'}`,
                            data.text.substring(0, 200),
                            {
                                type: 'chat_message',
                                orderId: order.toString(),
                                senderId: sender,
                                senderName: data.senderName || 'مستخدم'
                            }
                        );
                    }
                } else {
                    logger.debug({ receiver, orderId: order }, 'Skipping FCM push — receiver is live in chat room');
                }
            } catch (pushErr) {
                logger.error({ err: pushErr }, 'Chat FCM push failed');
            }

        } catch (error) {
            logger.error({ err: error }, 'Error saving message');
            sendAck({ status: 'error', error: 'Failed to save message: ' + error.message });
        }
    });

    // ✅ FIX: typing events — نرسل للـ room مباشرة بدل activeUsers[socketId]
    // كل مستخدم يجوين room باسم userId عند user_join، فالإرسال للـ room أموثوق
    socket.on('typing', (data) => {
        const receiver = data.receiver || data.receiverId;
        if (receiver) {
            io.to(String(receiver)).emit('user_typing', {
                sender: data.sender || data.senderId || socket.userId,
                receiver
            });
        }
    });

    socket.on('stop_typing', (data) => {
        const receiver = data.receiver || data.receiverId;
        if (receiver) {
            io.to(String(receiver)).emit('user_stop_typing', {
                sender: data.sender || data.senderId || socket.userId,
                receiver
            });
        }
    });

    socket.on('update_location', async (data) => {
        try {
            const { userId, lat, lng, orderId } = data;
            if (!userId || !lat || !lng) return;

            // ⚡ Throttle: ignore if updated less than 3 seconds ago
            const _now = Date.now();
            if (locationThrottle[userId] && _now - locationThrottle[userId] < 3000) return;
            locationThrottle[userId] = _now;

            // 🔒 Identity check: prevent location spoofing
            // Allow if socket.userId matches, OR if socket.userId is not yet set (grace period)
            if (socket.userId && String(data.userId) !== socket.userId) {
                logger.warn({ dataUserId: data.userId, socketUserId: socket.userId }, 'update_location identity mismatch — blocked');
                return;
            }

            await User.findByIdAndUpdate(userId, { currentLocation: { lat, lng, updatedAt: new Date() } });

            if (orderId) {
                // Direct: forward to the specific order's client
                const order = await Order.findById(orderId);
                if (order && order.client) {
                    io.to(order.client.toString()).emit('captain_location_updated', { orderId, lat, lng });
                }
            } else {
                // Auto-find: captain didn't send orderId, look up their active orders
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
            }

            // ✅ Broadcast to admin live map — use isAvailableForWork for status display
            const captainDoc = await User.findById(userId).select('name isAvailableForWork city');
            io.to('admin_room').emit('captain_location_update', {
                userId,
                captainId: userId,
                lat, lng,
                city:   captainDoc?.city || 'Khartoum',
                name:   captainDoc?.name   || 'كابتن',
                status: captainDoc?.isAvailableForWork ? 'available' : 'offline'
            });
        } catch (err) { logger.error({ err }, 'update_location error'); }
    });

    socket.on('disconnect', async () => {
        logger.debug({ socketId: socket.id }, 'User disconnected');
        if (socket.userId) {
            delete activeUsers[socket.userId];
            delete chatRooms[socket.userId];

            // 🔒 حالة توفّر الكابتن (isAvailableForWork) يتحكم فيها الكابتن وحده.
            // كان هنا مؤقّت 90 ثانية يُطفئ الكابتن تلقائياً عند انقطاع السوكت
            // (قفل الشاشة / خروج مؤقت من التطبيق) — فيفقد الطلبات دون علمه.
            // أُزيل: الانقطاع لا يغيّر الحالة؛ فقط زر الحالة أو تسجيل الخروج يغيّرانها.
            // إشعارات FCM تصل أصلاً لكل كباتن المدينة بغضّ النظر عن حالة السوكت.
        }
    });
});

// 🧯 معالجة الأخطاء المركزية — يجب أن تكون بعد كل الـ routes
// notFound يلتقط أي مسار غير معرّف، و errorHandler يوحّد شكل أخطاء الـ API.
const { notFound, errorHandler } = require('./middleware/errorHandler');
app.use('/api', notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server running');
});

// 🧯 المعالجة العالمية للأخطاء غير الملتقَطة
// unhandledRejection: نكتفي بالتسجيل — كثير من رفض الوعود غير حرج، وإسقاط السيرفر عليه مبالغة.
process.on('unhandledRejection', (reason) => {
    logger.error({ reason: String(reason) }, 'Unhandled Promise Rejection');
});

// uncaughtException: بعده تكون حالة العملية غير موثوقة (اتصالات/ذاكرة تالفة).
// الاستمرار في العمل قد يفسد البيانات — الأسلم إغلاق نظيف ثم ترك مدير العملية
// (Passenger/PM2/systemd) يُعيد تشغيل نسخة نظيفة. ⚠️ يتطلب مدير عملية في الإنتاج.
let _shuttingDown = false;
process.on('uncaughtException', (err) => {
    logger.error({ err: err && err.stack ? err.stack : String(err) }, 'Uncaught Exception — restarting cleanly');
    if (_shuttingDown) return;
    _shuttingDown = true;
    // أوقف استقبال طلبات جديدة، أنهِ الحالية، ثم اخرج بكود خطأ ليُعاد التشغيل
    server.close(() => process.exit(1));
    // درع أمان: خروج قسري إذا تعذّر الإغلاق خلال 10 ثوانٍ (اتصالات معلّقة)
    setTimeout(() => process.exit(1), 10000).unref();
});

module.exports = app;
