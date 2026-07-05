package com.wajeezsd.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * WassiliFCMService — Intercepts FCM messages and builds BigText expandable notifications.
 *
 * ✅ Why: utils/firebasePush.js sends Android messages as data-only (no top-level
 *    `notification`, no `android.notification`). Per documented, stable FCM behavior,
 *    that guarantees onMessageReceived() below runs in EVERY app state — foreground,
 *    background, and killed — instead of the OS auto-displaying (and bypassing this
 *    method) whenever a notification payload is present. This is what lets the tap
 *    PendingIntent's orderId/type extras reach MainActivity.java reliably every time.
 *    We read notif_title & notif_body from the data payload (sent by the Node.js server)
 *    and display them using NotificationCompat.BigTextStyle, which lets the user
 *    expand the notification by swiping down on it — exactly like WhatsApp.
 *
 * ✅ Channels used:
 *    - wassili_notifications  → general & order notifications  (green)
 *    - chat_alerts            → chat messages                  (purple)
 *    - admin_alerts           → admin-only notifications       (red)
 */
public class WassiliFCMService extends FirebaseMessagingService {

    // Thread-safe unique ID generator for each notification
    private static final AtomicInteger NOTIF_ID = new AtomicInteger(1000);

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();

        // ── Read title & body ───────────────────────────────────────────────────────
        // Priority: data payload (full text) → notification payload (may be truncated)
        String title = getOrFallback(data, "notif_title",
                remoteMessage.getNotification() != null
                        ? remoteMessage.getNotification().getTitle()
                        : "وصل-لي");

        String body = getOrFallback(data, "notif_body",
                remoteMessage.getNotification() != null
                        ? remoteMessage.getNotification().getBody()
                        : "");

        if (title == null) title = "وصل-لي";
        if (body  == null) body  = "";

        // ── Determine channel & accent color from notification type ─────────────────
        String type      = getOrFallback(data, "type", "system");
        String channelId = resolveChannel(type);
        int    accentColor = resolveColor(channelId);

        // ── Build the tap intent (opens the app) ────────────────────────────────────
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        // Pass orderId so the app can deep-link to the right screen
        String orderId = getOrFallback(data, "orderId", "");
        if (orderId != null && !orderId.isEmpty()) {
            intent.putExtra("orderId", orderId);
            intent.putExtra("type", type);
        }

        int requestCode = NOTIF_ID.getAndIncrement();
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // ── Custom sound URI ─────────────────────────────────────────────────────────
        Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/raw/wassili_bell");

        // ── Build BigText notification ───────────────────────────────────────────────
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.drawable.ic_stat_wassili)   // monochrome icon (required)
                .setContentTitle(title)
                .setContentText(body)                        // one-line preview when collapsed
                .setStyle(new NotificationCompat.BigTextStyle()
                        .bigText(body)                       // full text when expanded ✅
                        .setBigContentTitle(title))
                .setColor(accentColor)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_VIBRATE)
                .setSound(soundUri)
                .setAutoCancel(true)                         // dismiss on tap
                .setContentIntent(pendingIntent)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        // ── Deliver the notification ─────────────────────────────────────────────────
        NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(requestCode, builder.build());
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────────

    /** Returns data[key] if non-empty, otherwise fallback. */
    private String getOrFallback(Map<String, String> data, String key, String fallback) {
        String val = data.get(key);
        return (val != null && !val.isEmpty()) ? val : fallback;
    }

    /** Maps notification type → channel ID. */
    private String resolveChannel(String type) {
        if (type == null) return "wassili_notifications";
        switch (type) {
            case "chat_message":
                return "chat_alerts";
            case "admin_order_alert":
            case "system":
                // Only route to admin_alerts if explicitly admin type
                return "admin_alerts";
            default:
                return "wassili_notifications";
        }
    }

    /** Maps channel ID → brand accent color. */
    private int resolveColor(String channelId) {
        if (channelId == null) return Color.parseColor("#0a8754");
        switch (channelId) {
            case "chat_alerts":   return Color.parseColor("#6f42c1"); // purple
            case "admin_alerts":  return Color.parseColor("#dc3545"); // red
            default:              return Color.parseColor("#0a8754"); // teal (brand)
        }
    }
}
