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

// إعدادات Socket.io
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());

// 🔥 Security Middleware
app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ✅✅✅ الحل اليدوي لمشكلة Node v24 (بديل المكتبات) ✅✅✅
// هذه الدالة تنظف البيانات من أي علامة $ (لمنع MongoDB Injection)
// دون أن تحاول استبدال الـ req.query وتسبب الخطأ
app.use((req, res, next) => {
    const clean = (obj) => {
        if (obj && typeof obj === 'object') {
            for (const key in obj) {
                if (key.startsWith('$')) {
                    delete obj[key]; // حذف المفاتيح الخطرة فقط
                } else {
                    clean(obj[key]); // تنظيف متداخل
                }
            }
        }
    };

    if (req.body) clean(req.body);
    if (req.query) clean(req.query);
    if (req.params) clean(req.params);

    next();
});
// ---------------------------------------------------------

// 1. طباعة رسالة بداية
console.log("🚀 Server is starting...");

// جعل مجلد public متاحاً
app.use(express.static(path.join(__dirname, 'public_html')));

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

// 👇 انسخ السطرين ديل بدل السطر الواحد القديم
// ده عشان لو السيبانل مرر الرابط كامل (/api/auth/...)
app.use('/api', apiRoutes);

// وده عشان لو السيبانل قص الرابط ووصلنا بس (/auth/...)
app.use('/', apiRoutes);

// Make io accessible to routes
app.set('io', io);

// تشغيل المهام المجدولة
startScheduler();

// Socket.io connection handling
const activeUsers = {};

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

    socket.on('send_message', async (data) => {
        try {
            // ... (نفس كود الرسائل السابق كما هو) ...
            if (socket.userId && socket.userId !== (data.sender || data.senderId)) {
                return socket.emit('message_error', { error: 'Unauthorized' });
            }

            const sender = data.sender || data.senderId;
            const receiver = data.receiver || data.receiverId;
            const order = data.order || data.orderId;

            if (!sender || !receiver || !order) return;

            const message = await Message.create({
                sender, receiver, order, text: data.text, isRead: false
            });

            const Notification = require('./models/Notification');
            const newNotif = await Notification.create({
                user: receiver,
                title: `رسالة جديدة من ${data.senderName}`,
                message: data.text,
                type: 'chat',
                relatedId: order
            });

            const messageData = {
                _id: message._id,
                sender: { _id: sender, name: data.senderName },
                text: data.text,
                createdAt: message.createdAt,
                isRead: false,
                order: order // 🔥 Added Order ID field
            };

            if (activeUsers[receiver]) {
                io.to(activeUsers[receiver]).emit('new_message', messageData);
                io.to(activeUsers[receiver]).emit('new_notification', newNotif);
            }
            socket.emit('new_message', messageData);
            socket.emit('message_sent', { success: true, messageId: message._id });

        } catch (error) {
            console.error('❌ Error saving message:', error.message);
        }
    });

    // ... (باقي كود الـ Socket كما هو: typing, location, disconnect) ...
    socket.on('typing', (data) => {
        const receiverSocket = activeUsers[data.receiver || data.receiverId];
        if (receiverSocket) io.to(receiverSocket).emit('user_typing', data);
    });

    socket.on('stop_typing', (data) => {
        const receiverSocket = activeUsers[data.receiver || data.receiverId];
        if (receiverSocket) io.to(receiverSocket).emit('user_stop_typing', data);
    });

    socket.on('update_location', async (data) => {
        try {
            const { userId, lat, lng, orderId } = data;
            if (!userId || !lat || !lng) return;
            const User = require('./models/User');
            await User.findByIdAndUpdate(userId, { currentLocation: { lat, lng, updatedAt: new Date() } });
            if (orderId) {
                const Order = require('./models/Order');
                const order = await Order.findById(orderId);
                if (order && order.client) {
                    io.to(order.client.toString()).emit('captain_location_updated', { orderId, lat, lng });
                }
            } else {
                // Public broadcast for "Nearby Captains" map
                io.emit('public_captain_location', { userId, lat, lng });
            }
        } catch (err) { console.error(err); }
    });

    socket.on('captain_status_change', (data) => {
        io.emit('captain_status_changed', data);
    });

    socket.on('disconnect', async () => {
        if (socket.userId) {
            delete activeUsers[socket.userId];
            io.emit('user_status', { userId: socket.userId, status: 'offline' });
            console.log(`👤 User ${socket.userId} is now offline`);

            // ✅ FIX: Do NOT auto-set captain offline when they disconnect.
            // This prevents "tab switching" from making them offline.
            // They strictly go offline if they press "Offline" or Logout.

            // Only remove from activeUsers list (already done above)
        }
    });
});

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public_html', 'index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});