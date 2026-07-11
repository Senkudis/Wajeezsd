# 🔐 تأمين مفتاح Google Maps API

مفتاح الخرائط مكشوف في صفحات الويب (هذا طبيعي — مفاتيح الخرائط تُستخدم في المتصفح)،
لكن **يجب تقييده** في Google Cloud Console وإلا يمكن لأي شخص نسخه واستخدامه على حسابك
وتفجير فاتورتك. المفتاح موجود حالياً في **11 صفحة** داخل `public_html/`.

> ملاحظة: لا يمكن «إخفاء» مفتاح خرائط المتصفح من الكود — الحماية الحقيقية هي **التقييد**.

---

## 1) قيّد المفتاح في Google Cloud Console

افتح: <https://console.cloud.google.com/google/maps-apis/credentials>
ثم اختر المفتاح الحالي، وطبّق التالي:

### أ. تقييد التطبيقات (Application restrictions)
نظراً لاستخدام المفتاح في الويب **و** تطبيق Android، الأفضل **إنشاء مفتاحين منفصلين**:

**مفتاح الويب** → `HTTP referrers (web sites)` وأضف:
```
https://wajeezsd.com/*
https://www.wajeezsd.com/*
```

**مفتاح Android** → `Android apps` وأضف اسم الحزمة + بصمة SHA-1:
```
اسم الحزمة: com.wajeezsd.app
SHA-1: (احصل عليها بالأمر أدناه)
```
للحصول على SHA-1:
```bash
cd android
./gradlew signingReport
```

### ب. تقييد الـ APIs (API restrictions)
اختر `Restrict key` وفعّل فقط ما يستخدمه التطبيق:
- **Maps JavaScript API**
- **Places API**
- **Geocoding API**
- **Directions API**

---

## 2) راقب الاستخدام والفوترة
- فعّل **تنبيهات الميزانية**: <https://console.cloud.google.com/billing/budgets>
- راجع **Metrics** أسبوعياً لاكتشاف أي قفزة غير معتادة في الطلبات.

---

## 3) بعد إنشاء مفاتيح جديدة
استبدل المفتاح القديم في الصفحات (ابحث عن الروابط التي تحتوي `maps.googleapis.com`).
المفتاح يظهر في **11 ملف HTML** داخل `public_html/`. بعد الاستبدال:
```bash
npx cap copy android   # لمزامنة الويب داخل تطبيق Android
```
ثم أعد بناء الـ APK.

> **مهم:** المفتاح القديم غير المقيّد يجب **حذفه** من Cloud Console بعد التأكد أن المفاتيح الجديدة تعمل.
