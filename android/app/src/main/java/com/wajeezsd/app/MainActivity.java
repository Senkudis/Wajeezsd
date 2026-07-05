package com.wajeezsd.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    // orderId/type from a push notification's tap Intent (set by WassiliFCMService),
    // buffered here until the WebView has a real page loaded to receive them.
    private String pendingOrderId;
    private String pendingNotifType;
    // True once a page has finished loading at least once. Evaluating JS before that
    // targets a not-yet-navigated WebView and is silently lost (JS state doesn't survive
    // the subsequent real navigation), so delivery must wait for the first onPageLoaded.
    private boolean webViewReady = false;

    // آخر قيم insets معروفة (بوحدة CSS px) — تُحقن في كل صفحة عند اكتمال تحميلها،
    // لأن قيم documentElement.style لا تنجو من التنقّل بين الصفحات.
    private int safeTop = 0, safeBottom = 0, safeLeft = 0, safeRight = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // BridgeActivity.onCreate() builds the Bridge and immediately calls
        // this.onNewIntent(getIntent()) internally, so the launch intent's extras are
        // already captured by the time this line returns.
        super.onCreate(savedInstanceState);
        createNotificationChannels();

        if (getBridge() != null) {
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    webViewReady = true;
                    injectSafeAreaVars();
                    deliverPendingPushTap();
                }
            });
            setupSafeAreaInsets();
        }
    }

    /**
     * الحل الجذري لمشكلة دخول المحتوى تحت شريط الحالة وأزرار النظام:
     * التطبيق يعمل edge-to-edge (أشرطة شفافة في styles.xml) لكن WebView أندرويد
     * يُرجع صفراً لـ env(safe-area-inset-*)، فكل معالجات CSS كانت بلا مفعول.
     * هنا نقرأ قيم الـ insets الحقيقية من النظام ونحقنها كمتغيرات CSS
     * (--sat/--sab/--sal/--sar) يعتمد عليها mobile-overrides.css و safe-area.js.
     */
    private void setupSafeAreaInsets() {
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            float density = getResources().getDisplayMetrics().density;
            if (density <= 0) density = 1f;

            int top = Math.round(bars.top / density);
            int bottom = Math.round(bars.bottom / density);
            int left = Math.round(bars.left / density);
            int right = Math.round(bars.right / density);

            if (top != safeTop || bottom != safeBottom || left != safeLeft || right != safeRight) {
                safeTop = top;
                safeBottom = bottom;
                safeLeft = left;
                safeRight = right;
                injectSafeAreaVars();
            }
            return windowInsets;
        });
        // اطلب تمريرة insets أولى (قد تكون وصلت قبل تركيب الـ listener)
        webView.post(() -> ViewCompat.requestApplyInsets(webView));
    }

    /** يحقن قيم الـ safe area كمتغيرات CSS ويعلم صفحات الويب بالتحديث. */
    private void injectSafeAreaVars() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null || !webViewReady) return;

        String js = "(function(){var s=document.documentElement.style;" +
                "s.setProperty('--sat','" + safeTop + "px');" +
                "s.setProperty('--sab','" + safeBottom + "px');" +
                "s.setProperty('--sal','" + safeLeft + "px');" +
                "s.setProperty('--sar','" + safeRight + "px');" +
                "document.dispatchEvent(new CustomEvent('wj-safe-area'));})();";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        capturePushExtras(intent);
        // Warm start (app already running): the current page is already loaded and no
        // further onPageLoaded will fire for this tap, so deliver right away. On cold
        // start webViewReady is still false here — onPageLoaded will deliver it once
        // the first page finishes loading.
        if (webViewReady) {
            deliverPendingPushTap();
        }
    }

    /** Reads orderId/type extras placed by WassiliFCMService's tap PendingIntent. */
    private void capturePushExtras(Intent intent) {
        if (intent == null) return;
        String orderId = intent.getStringExtra("orderId");
        if (orderId == null || orderId.isEmpty()) return;
        pendingOrderId = orderId;
        pendingNotifType = intent.getStringExtra("type");
    }

    /**
     * Forwards a buffered push tap into the JS deep-link router (public_html/js/native-notifications.js)
     * via a window CustomEvent, mirroring the routing pushNotificationActionPerformed would
     * normally do — that Capacitor event never fires here since WassiliFCMService builds the
     * notification and its tap Intent manually, bypassing Capacitor's push plugin entirely.
     */
    private void deliverPendingPushTap() {
        if (pendingOrderId == null || getBridge() == null) return;

        String orderId = pendingOrderId;
        String type = pendingNotifType != null ? pendingNotifType : "";
        // Clear before firing so a later onPageLoaded (triggered by the routing JS's own
        // navigation to the target page) doesn't re-deliver and redirect again in a loop.
        pendingOrderId = null;
        pendingNotifType = null;

        // Field is named notifType (not "type") to avoid colliding with the native,
        // read-only Event.type property that the Capacitor bridge event is built from.
        String eventData = "{\"orderId\":" + JSONObject.quote(orderId) +
                ",\"notifType\":" + JSONObject.quote(type) + "}";
        getBridge().triggerWindowJSEvent("wajeezPushTapped", eventData);
    }

    /**
     * Create notification channels with the custom Wassili bell sound.
     * ⚠️ IMPORTANT: On Android, once a channel is created, its sound CANNOT be changed.
     * If you change the sound, you must use a new channel ID, or the user must
     * uninstall & reinstall the app. That's why we use versioned channel IDs.
     */
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // ✅ Delete old channels so we can re-create them with the new custom sound.
        // On Android, channel sound CANNOT be changed once created — must delete & recreate.
        try {
            nm.deleteNotificationChannel("wassili_notifications");
            nm.deleteNotificationChannel("chat_alerts");
            nm.deleteNotificationChannel("admin_alerts");
        } catch (Exception ignored) {}

        // URI of the custom sound in res/raw/wassili_bell.wav
        Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/raw/wassili_bell");

        AudioAttributes audioAttrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();

        // 1. Main notifications channel
        NotificationChannel main = new NotificationChannel(
                "wassili_notifications",
                "إشعارات وصل-لي",
                NotificationManager.IMPORTANCE_HIGH
        );
        main.setDescription("الإشعارات العامة في تطبيق وصل-لي");
        main.setSound(soundUri, audioAttrs);
        main.enableVibration(true);
        main.setVibrationPattern(new long[]{0, 300, 200, 300});
        main.setLightColor(0xFF0A8754);
        main.enableLights(true);
        nm.createNotificationChannel(main);

        // 2. Chat channel
        NotificationChannel chat = new NotificationChannel(
                "chat_alerts",
                "رسائل المحادثة",
                NotificationManager.IMPORTANCE_HIGH
        );
        chat.setDescription("إشعارات الرسائل الجديدة");
        chat.setSound(soundUri, audioAttrs);
        chat.enableVibration(true);
        chat.setLightColor(0xFF6F42C1);
        nm.createNotificationChannel(chat);

        // 3. Admin alerts channel (for admin push notifications)
        NotificationChannel adminCh = new NotificationChannel(
                "admin_alerts",
                "تنبيهات الإدارة",
                NotificationManager.IMPORTANCE_HIGH
        );
        adminCh.setDescription("تنبيهات خاصة بالمسؤولين");
        adminCh.setSound(soundUri, audioAttrs);
        adminCh.enableVibration(true);
        adminCh.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
        adminCh.setLightColor(0xFFDC3545);
        adminCh.enableLights(true);
        nm.createNotificationChannel(adminCh);
    }
}
