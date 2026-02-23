/**
 * Firebase Push Notification Utility
 * Initializes Firebase Admin SDK and provides FCM push sending
 */
const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK (only once)
let initialized = false;

function initFirebase() {
    if (initialized) return;
    try {
        const serviceAccountPath = path.join(__dirname, '..', 'wassili249-c3e83-firebase-adminsdk-fbsvc-480767f2cf.json');
        const serviceAccount = require(serviceAccountPath);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id
        });

        initialized = true;
        console.log('🔥 Firebase Admin SDK initialized successfully');
    } catch (error) {
        console.error('❌ Firebase Admin init failed:', error.message);
    }
}

// Initialize on load
initFirebase();

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

    try {
        const message = {
            token: fcmToken,
            notification: {
                title,
                body,
                // 🖼️ Large image shown in notification shade (Android 13+, web)
                imageUrl: 'https://wassili.site/logo-transparent.png'
            },
            data: {
                ...Object.fromEntries(
                    Object.entries(data).map(([k, v]) => [k, String(v)])
                ),
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'wassili_notifications',
                    // Small monochrome icon (from app drawable resources)
                    icon: 'ic_notification',
                    // Teal brand color for notification LED & accent
                    color: '#0a8754',
                    // Large circular icon (app logo) shown next to notification text
                    imageUrl: 'https://wassili.site/logo-transparent.png'
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1
                    }
                },
                fcmOptions: {
                    // Image shown in iOS notification
                    imageUrl: 'https://wassili.site/icons/icon-192x192.png'
                }
            },
            // Web push (PWA in browser)
            webpush: {
                notification: {
                    icon: 'https://wassili.site/icons/icon-192x192.png',
                    badge: 'https://wassili.site/icons/icon-192x192.png',
                    image: 'https://wassili.site/logo-transparent.png',
                    vibrate: [200, 100, 200]
                },
                fcmOptions: {
                    link: 'https://wassili.site/'
                }
            }
        };

        const response = await admin.messaging().send(message);
        console.log(`📤 FCM Push sent: ${title} → ${response}`);
        return true;
    } catch (error) {
        // Token expired or invalid — clean it up
        if (error.code === 'messaging/registration-token-not-registered' ||
            error.code === 'messaging/invalid-registration-token') {
            console.warn(`⚠️ Invalid FCM token, should be cleaned: ${fcmToken.substring(0, 20)}...`);
        } else {
            console.error('❌ FCM Push error:', error.message);
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

    // Filter out empty/null tokens
    const validTokens = fcmTokens.filter(t => t && t.length > 10);
    if (validTokens.length === 0) return { success: 0, failure: 0 };

    try {
        const message = {
            notification: {
                title,
                body
            },
            data: {
                ...Object.fromEntries(
                    Object.entries(data).map(([k, v]) => [k, String(v)])
                )
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'wassili_notifications',
                    icon: 'ic_notification',
                    color: '#0a8754',
                    imageUrl: 'https://wassili.site/logo-transparent.png'
                }
            },
            apns: {
                payload: { aps: { sound: 'default', badge: 1 } },
                fcmOptions: { imageUrl: 'https://wassili.site/icons/icon-192x192.png' }
            },
            webpush: {
                notification: {
                    icon: 'https://wassili.site/icons/icon-192x192.png',
                    badge: 'https://wassili.site/icons/icon-192x192.png',
                    image: 'https://wassili.site/logo-transparent.png'
                },
                fcmOptions: { link: 'https://wassili.site/' }
            }
        };

        const response = await admin.messaging().sendEachForMulticast({
            tokens: validTokens,
            ...message
        });

        console.log(`📤 FCM Multicast: ${response.successCount} sent, ${response.failureCount} failed`);
        return { success: response.successCount, failure: response.failureCount };
    } catch (error) {
        console.error('❌ FCM Multicast error:', error.message);
        return { success: 0, failure: validTokens.length };
    }
}

module.exports = { sendPush, sendPushToMany, initFirebase };
