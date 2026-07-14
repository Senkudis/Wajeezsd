/**
 * Firebase Push Notification Utility
 * Initializes Firebase Admin SDK and provides FCM push sending
 */
const admin = require('firebase-admin');
const path = require('path');
const logger = require('./logger');

// Initialize Firebase Admin SDK (only once)
let initialized = false;

function initFirebase() {
    if (initialized) return;
    try {
        let serviceAccount;
        const fs = require('fs');

        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            // Load from JSON string in environment variable
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
            // Load from file path specified in environment variable
            const resolvedPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
            serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
        } else {
            // Auto-detect: ابحث عن ملف الخدمة في جذر المشروع أو مجلد config/
            const projectRoot = path.join(__dirname, '..');
            const searchDirs = [projectRoot, path.join(projectRoot, 'config')];
            let found = null;
            for (const dir of searchDirs) {
                try {
                    const f = fs.readdirSync(dir).find(n => n.includes('firebase-adminsdk') && n.endsWith('.json'));
                    if (f) { found = path.join(dir, f); break; }
                } catch (_) { /* dir may not exist */ }
            }
            if (found) {
                serviceAccount = JSON.parse(fs.readFileSync(found, 'utf8'));
                logger.info({ file: found }, 'Firebase service account auto-detected');
            } else {
                logger.warn('⚠️ [PUSH DISABLED] Firebase service account not configured — إشعارات الخلفية (FCM) معطّلة. ' +
                    'أضِف FIREBASE_SERVICE_ACCOUNT_JSON (متغير بيئة) أو ضع ملف firebase-adminsdk*.json في الجذر أو مجلد config/. ' +
                    'ملاحظة: الإشعارات داخل التطبيق والفورية (Socket.io) تعمل بدونه.');
                return;
            }
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id
        });

        initialized = true;
        logger.info('Firebase Admin SDK initialized successfully');
    } catch (error) {
        logger.error({ err: error }, 'Firebase Admin init failed');
    }
}

// Initialize on load
initFirebase();

// ✅ هل Firebase مهيّأ وجاهز لإرسال الإشعارات؟ (للتشخيص ونقطة الحالة)
function isFirebaseReady() {
    return initialized;
}

// ── بناء الرسالة الهجينة ───────────────────────────────────────────────────────
//
// 🚨 لماذا هجينة (notification + data) بعد أن كانت data-only:
//   رسالة data-only **تحتاج عملية التطبيق حيّة** لتبني الإشعار في onMessageReceived().
//   حين يقتل النظام العملية — تحسين البطارية، مسح التطبيق من الـ recents، أو رومات
//   OEM الشرسة (Xiaomi/Infinix/Tecno/Oppo، وهي الأكثر انتشاراً لدى مستخدمينا) —
//   يوصّل FCM الرسالة ولا يوجد من يعرضها، **فتضيع بصمت**. هذا هو السبب الجذري
//   لشكوى «إشعار الطلب مرة يجي ومرة لا».
//
//   مع notification payload يعرضه نظام أندرويد بنفسه حتى لو كانت العملية ميتة تماماً.
//
// ✅ ولماذا لم نخسر شيئاً بالمقابل:
//   - التطبيق في المقدّمة: FCM لا يعرض تلقائياً، بل يستدعي onMessageReceived() ومعها
//     notification + data معاً → WassiliFCMService يبني إشعار BigText بقناته وصوته كالعادة.
//   - التطبيق في الخلفية/مقتول: النظام يعرض الإشعار من android.notification (نمرّر له
//     channel_id فيأخذ نفس الجرس والاهتزاز واللون من القناة التي ينشئها MainActivity).
//   - لا تكرار: الحالتان متعارضتان — إمّا onMessageReceived أو العرض التلقائي، لا الاثنان.
//   - الـ deep-link سليم: عند العرض التلقائي يضع FCM مفاتيح data في extras الـ Intent،
//     و MainActivity.readPushExtras() يقرأ "orderId" / "type" / "targetUrl". لذلك نرسل
//     targetUrl **داخل data** (إضافةً إلى url) — بدونه يصل المفتاح باسم "url" فقط ولا
//     تجده MainActivity، فيفتح التطبيق على الصفحة الافتراضية بدل الطلب المقصود.

// نفس تعيين WassiliFCMService.resolveChannel — القناة تحدّد الصوت والاهتزاز واللون
function resolveChannel(type) {
    switch (type) {
        case 'chat_message':      return 'chat_alerts';
        case 'admin_order_alert':
        case 'system':            return 'admin_alerts';
        default:                  return 'wassili_notifications';
    }
}

function buildMessage(title, body, data = {}, opts = {}) {
    const type = String(data.type || 'system');
    const url  = data.url ? String(data.url) : '';

    const payload = {
        ...Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        // BigText: النص الكامل بلا اقتطاع — يقرأه WassiliFCMService في حالة المقدّمة
        notif_title: String(title),
        notif_body:  String(body)
    };
    // 🔑 اسم المفتاح الذي تقرأه MainActivity من extras عند العرض التلقائي (خلفية/مقتول)
    if (url) payload.targetUrl = url;

    return {
        // يعرضه النظام بنفسه إن كانت عملية التطبيق ميتة — هذا هو جوهر الإصلاح
        notification: { title: String(title), body: String(body) },
        data: payload,
        android: {
            priority: 'high',
            notification: {
                channelId: resolveChannel(type),     // نفس قناة MainActivity → نفس الجرس واللون
                icon: 'ic_stat_wassili',
                color: type === 'chat_message' ? '#6f42c1'
                     : resolveChannel(type) === 'admin_alerts' ? '#dc3545' : '#0a8754',
                defaultSound: false,
                sound: 'wassili_bell',               // لأندرويد 7 وأقدم (8+ يأخذه من القناة)
                // تجميع الإشعارات لكل طلب/محادثة على حدة — لا يبتلع طلبٌ جديد إشعارَ سابقه
                tag: data.orderId ? `${type}_${data.orderId}` : undefined
            }
        },
        apns: {
            payload: { aps: { sound: 'wassili_bell.wav', badge: 1 } },
            fcmOptions: { imageUrl: 'https://wajeezsd.com/icons/icon-192x192.png' }
        },
        webpush: {
            notification: Object.assign({
                title,
                body,
                icon: 'https://wajeezsd.com/icons/icon-192x192.png'
            }, opts.webpushExtra || {}),
            fcmOptions: { link: opts.link || 'https://wajeezsd.com/' }
        }
    };
}

/**
 * Send FCM Push Notification to a specific user
 * @param {string} fcmToken - User's FCM device token
 * @param {string} title - Notification title
 * @param {string} body - Notification body/message
 * @param {object} data - Optional data payload (for deep linking)
 * @returns {Promise<boolean>} success
 */
async function sendPush(fcmToken, title, body, data = {}) {
    if (!initialized || !fcmToken) return false;

    // ⚠️ يجب أن يبقى `message` خارج بلوك try — كان معرّفاً بداخله، فكانت إعادة المحاولة
    // في catch ترمي ReferenceError ولا تُرسل شيئاً أبداً (كل فشل عابر = إشعار ضائع للأبد).
    const message = {
        token: fcmToken,
        ...buildMessage(title, body, data, {
            webpushExtra: {
                image: 'https://wajeezsd.com/logo-transparent.png',
                vibrate: [200, 100, 200]
            }
        })
    };

    try {
        const response = await admin.messaging().send(message);
        logger.debug({ title, response }, 'FCM Push sent');
        return true;
    } catch (error) {
        // Token expired or invalid — clean it up
        if (error.code === 'messaging/registration-token-not-registered' ||
            error.code === 'messaging/invalid-registration-token') {
            logger.warn({ token: fcmToken.substring(0, 20) }, 'Invalid FCM token — auto-removing from DB');
            try {
                const User = require('../models/User');
                await User.findOneAndUpdate({ fcmToken }, { $unset: { fcmToken: '' } });
            } catch (cleanErr) {
                logger.warn({ err: cleanErr }, 'Failed to auto-remove invalid FCM token');
            }
        } else {
            logger.error({ err: error }, 'FCM Push error — retrying in 2s');
            // ✅ Retry once for transient network/server errors
            try {
                await new Promise(r => setTimeout(r, 2000));
                const response = await admin.messaging().send(message);
                logger.info({ title, response }, 'FCM Push sent on retry ✅');
                return true;
            } catch (retryErr) {
                logger.error({ err: retryErr }, 'FCM Push retry also failed');
            }
        }
        return false;
    }
}

/**
 * Send FCM Push to multiple users
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {string} title
 * @param {string} body
 * @param {object} data
 * @returns {Promise<{success: number, failure: number}>}
 */
async function sendPushToMany(fcmTokens, title, body, data = {}) {
    if (!initialized || !fcmTokens || fcmTokens.length === 0) {
        return { success: 0, failure: 0 };
    }

    // Filter out empty/null tokens + إزالة التكرار (نفس التوكن قد يتكرر عبر مستخدمين)
    const validTokens = [...new Set(fcmTokens.filter(t => t && t.length > 10))];
    if (validTokens.length === 0) return { success: 0, failure: 0 };

    // الرسالة الأساسية — تُعاد لكل دفعة (هجينة: notification + data، انظر buildMessage أعلاه)
    const baseMessage = buildMessage(title, body, data);

    // 🚨 FCM يفرض حداً صارماً قدره 500 توكن لكل استدعاء sendEachForMulticast.
    // الإرسال دفعة واحدة فوق 500 كان يُفشل البث بالكامل ("مستخدمين ما بتصلهم").
    // الحل: نقسّم التوكنات إلى دفعات ≤500 ونرسلها بالتوازي ونجمّع النتائج.
    const FCM_BATCH_SIZE = 500;
    const batches = [];
    for (let i = 0; i < validTokens.length; i += FCM_BATCH_SIZE) {
        batches.push(validTokens.slice(i, i + FCM_BATCH_SIZE));
    }

    let success = 0;
    let failure = 0;
    let errors = [];
    const deadTokens = [];

    const results = await Promise.all(batches.map(async (batch) => {
        // 🔁 إرسال دفعة + إعادة محاولة واحدة للتوكنات التي فشلت لسبب عابر (شبكة/خادم FCM).
        // بدون هذا كان أي خطأ عابر يعني ضياع إشعار الطلب نهائياً لذلك الكابتن — وهو أحد
        // أسباب "الإشعار مرات يجي ومرات لا".
        const isDead = (code) => code === 'messaging/registration-token-not-registered' ||
                                 code === 'messaging/invalid-registration-token' ||
                                 code === 'messaging/invalid-argument';

        const sendBatch = async (tokens) => {
            const response = await admin.messaging().sendEachForMulticast({
                tokens,
                ...baseMessage
            });
            const retryable = [];
            response.responses.forEach((resp, idx) => {
                if (resp.success) return;
                const code = resp.error?.code || '';
                errors.push(resp.error?.message || code || 'Unknown Error');
                if (isDead(code)) deadTokens.push(tokens[idx]);
                else retryable.push(tokens[idx]);   // خطأ عابر — يستحق محاولة ثانية
            });
            return { s: response.successCount, f: response.failureCount, retryable };
        };

        let first;
        try {
            first = await sendBatch(batch);
        } catch (error) {
            // فشل الدفعة كاملةً — أعد المحاولة مرة واحدة بعد ثانيتين (لا يُسقط بقية الدفعات)
            logger.error('❌ FCM batch error — retrying in 2s:', error.message);
            errors.push(error.message);
            try {
                await new Promise(r => setTimeout(r, 2000));
                first = await sendBatch(batch);
            } catch (retryErr) {
                logger.error('❌ FCM batch retry also failed:', retryErr.message);
                errors.push(retryErr.message);
                return { s: 0, f: batch.length };
            }
        }

        if (first.retryable.length === 0) return { s: first.s, f: first.f };

        // إعادة محاولة للتوكنات العابرة الفشل فقط
        try {
            await new Promise(r => setTimeout(r, 2000));
            const second = await sendBatch(first.retryable);
            logger.info(`🔁 FCM retry: ${second.s}/${first.retryable.length} recovered`);
            return { s: first.s + second.s, f: first.f - second.s };
        } catch (retryErr) {
            logger.error('❌ FCM per-token retry failed:', retryErr.message);
            return { s: first.s, f: first.f };
        }
    }));

    results.forEach(r => { success += r.s; failure += r.f; });
    errors = [...new Set(errors)];

    // 🧹 احذف التوكنات الميتة من قاعدة البيانات حتى تصبح عمليات البث القادمة أنظف وأسرع
    if (deadTokens.length > 0) {
        try {
            const User = require('../models/User');
            await User.updateMany(
                { fcmToken: { $in: deadTokens } },
                { $unset: { fcmToken: '' } }
            );
            logger.info(`🧹 Cleaned ${deadTokens.length} dead FCM tokens from DB`);
        } catch (cleanupErr) {
            logger.warn('Dead token cleanup failed:', cleanupErr.message);
        }
    }

    logger.info(`📤 FCM Multicast: ${success} sent, ${failure} failed across ${batches.length} batch(es) (${validTokens.length} tokens)`);
    return { success, failure, errors, cleaned: deadTokens.length };
}

/**
 * Send FCM Chat Push Notification — Uses dedicated `chat_alerts` channel for chat sounds
 * @param {string} fcmToken
 * @param {string} title
 * @param {string} body
 * @param {object} data  Must include orderId, senderId, senderName
 */
async function sendChatPush(fcmToken, title, body, data = {}) {
    if (!initialized || !fcmToken) return false;

    try {
        // القناة (chat_alerts) تُشتقّ من data.type داخل buildMessage — نفس تعيين WassiliFCMService
        const message = {
            token: fcmToken,
            ...buildMessage(title, body, { ...data, type: data.type || 'chat_message' }, {
                webpushExtra: {
                    tag: data.orderId ? `chat_${data.orderId}` : undefined, // يجمّع رسائل نفس المحادثة
                    renotify: true
                },
                link: data.orderId ? `https://wajeezsd.com/chat.html?orderId=${data.orderId}` : 'https://wajeezsd.com/'
            })
        };

        const response = await admin.messaging().send(message);
        logger.info(`💬 Chat FCM Push sent: ${title} → ${response}`);
        return true;
    } catch (error) {
        if (error.code === 'messaging/registration-token-not-registered' ||
            error.code === 'messaging/invalid-registration-token') {
            logger.warn(`⚠️ Invalid FCM token (chat) — auto-removing: ${fcmToken.substring(0, 20)}...`);
            try {
                const User = require('../models/User');
                await User.findOneAndUpdate({ fcmToken }, { $unset: { fcmToken: '' } });
            } catch (cleanErr) {
                logger.warn({ err: cleanErr }, 'Failed to auto-remove invalid chat FCM token');
            }
        } else {
            logger.error('❌ Chat FCM Push error:', error.message);
        }
        return false;
    }
}

/**
 * Send FCM Push to Admins.
 *
 * ⚠️ يفوّض لـ sendPushToMany عمداً: القناة/الصوت/اللون تُحسم في الجهاز من `data.type`
 * (WassiliFCMService.resolveChannel) لا من هذه الدالة — فالرسالتان متطابقتان أصلاً.
 * النسخة السابقة كانت تكرّر بناء الرسالة يدوياً وتفقد بذلك: إزالة التوكنات المكرّرة،
 * التقسيم إلى دفعات ≤500، إعادة المحاولة عند الفشل العابر، وحذف التوكنات الميتة —
 * فكان تنبيه الأدمن يضيع نهائياً عند أول خطأ عابر.
 */
async function sendAdminPushToMany(fcmTokens, title, body, data = {}) {
    return sendPushToMany(fcmTokens, title, body, data);
}

module.exports = { sendPush, sendPushToMany, sendChatPush, sendAdminPushToMany, initFirebase, isFirebaseReady };
