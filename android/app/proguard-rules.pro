# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# If you keep the line number information, uncomment this to hide the original source file name.
-renamesourcefileattribute SourceFile

# --- Capacitor & Plugins Rules ---
# حماية ملفات كاباسيتور الأساسية وجسور الجافاسكريبت
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep public class * extends com.getcapacitor.Plugin
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public *;
}
-keep class com.getcapacitor.Bridge { *; }
-keep class com.getcapacitor.JSObject { *; }
-keep class com.getcapacitor.JSArray { *; }

# حماية إضافة تحديد الموقع بالخلفية
-keep class com.equimaps.capacitor_background_geolocation.** { *; }

# حماية إضافة الإشعارات 
-keep class com.capacitorjs.plugins.pushnotifications.** { *; }

# حماية إضافة تسجيل الدخول بجوجل
-keep class com.codetrixstudio.capacitor.GoogleAuth.** { *; }

# حماية إضافات كوردوفا الأساسية
-keep class org.apache.cordova.** { *; }

# حماية مكتبات جوجل بلاي سيرفيسز وفايربيس
-keep class com.google.android.gms.auth.** { *; }
-keep class com.google.android.gms.common.** { *; }
-keep class com.google.android.gms.tasks.** { *; }
-keep class com.google.firebase.messaging.** { *; }
-keep class com.google.firebase.iid.** { *; }
-dontwarn com.google.firebase.**
-dontwarn javax.annotation.**