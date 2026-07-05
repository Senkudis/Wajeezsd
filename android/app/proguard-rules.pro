# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
-renamesourcefileattribute SourceFile

# --- Capacitor & Plugins Rules ---
# حماية ملفات كاباسيتور الأساسية من التشويه
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep public class * extends com.getcapacitor.Plugin

# حماية إضافة تحديد الموقع بالخلفية
-keep class com.equimaps.capacitor_background_geolocation.** { *; }

# حماية إضافة الإشعارات 
-keep class com.capacitorjs.plugins.pushnotifications.** { *; }

# حماية إضافة تسجيل الدخول بجوجل
-keep class com.codetrixstudio.capacitor.GoogleAuth.** { *; }

# حماية إضافات كوردوفا الأساسية
-keep class org.apache.cordova.** { *; }
# حماية مكتبات جوجل بلاي سيرفيسز الأساسية
-keep class com.google.android.gms.auth.** { *; }
-keep class com.google.android.gms.common.** { *; }