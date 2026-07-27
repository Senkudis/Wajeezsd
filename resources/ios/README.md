# رفع وجيز على App Store — الدليل التنفيذي

كل ما في هذا المجلد جاهز. ما يلي هو الخطوات التي تحتاج **macOS + Xcode 16 أو أحدث**
(لا يمكن تنفيذها من ويندوز).

## 0. قبل الـ Mac (منجَز في المستودع)

| العنصر | الحالة | الملف |
|---|---|---|
| حذف الحساب داخل التطبيق (شرط 5.1.1(v)) | ✅ | `routes/auth.js` → `DELETE /api/auth/me`، `public_html/js/delete-account.js` |
| صفحة سياسة الخصوصية | ✅ | `public_html/privacy-policy.html` |
| Universal Links (نظير assetlinks) | ✅ يحتاج `APPLE_TEAM_ID` | `index.js` → `/.well-known/apple-app-site-association` |
| أصل CORS الخاص بـ iOS | ✅ | `index.js` → `capacitor://wajeezsd.secure.local` |
| أيقونة 1024×1024 بلا قناة ألفا | ✅ | `resources/ios/icon.png` (`npm run assets:ios`) |
| شاشة البداية | ✅ | `resources/ios/splash.png` + `splash-dark.png` |
| بيان الخصوصية | ✅ | `resources/ios/PrivacyInfo.xcprivacy` |
| مفاتيح Info.plist | ✅ سكربت | `scripts/patch-ios-plist.js` |
| `@capacitor/ios` | ✅ 8.0.2 | `package.json` |

## 1. إنشاء المنصة (على الـ Mac)

```bash
npm install
npx cap add ios
node scripts/patch-ios-plist.js
npx capacitor-assets generate --ios --assetPath resources/ios
cp resources/ios/PrivacyInfo.xcprivacy ios/App/App/
npx cap sync ios
npx cap open ios
```

## 2. داخل Xcode

1. **Signing & Capabilities** → فريقك، ثم أضف:
   - Push Notifications
   - Background Modes → Location updates + Remote notifications
   - Associated Domains → `applinks:wajeezsd.com` و `applinks:www.wajeezsd.com`
2. أضف `PrivacyInfo.xcprivacy` إلى هدف **App** (Build Phases → Copy Bundle Resources).
3. Deployment Info → iPhone فقط (إلغاء iPad يوفّر مجموعة لقطات كاملة).
4. General → Version = نفس `package.json` (حالياً 1.1.1)، Build = 1 ثم يُرفع مع كل رفع.

## 3. Firebase و Google

- Firebase Console → أضف تطبيق iOS بمعرّف `com.wajeezsd.app` → نزّل
  `GoogleService-Info.plist` → ضعه في `ios/App/App/` وأضفه للهدف.
- Firebase → Project settings → Cloud Messaging → ارفع **مفتاح APNs (.p8)**
  من حساب Apple (Keys → Apple Push Notifications service). بدونه لا إشعارات على iOS.
- Google Cloud Console → أنشئ OAuth Client ID نوع **iOS** لنفس Bundle ID، ثم في Xcode
  أضف URL Type بقيمة `REVERSED_CLIENT_ID` من `GoogleService-Info.plist`.

## 4. متغيّر بيئة على السيرفر

```bash
APPLE_TEAM_ID=XXXXXXXXXX
```

معرّف الفريق من Apple Developer → Membership. بدونه يُرجع
`/.well-known/apple-app-site-association` رقم 404 وتفتح روابط `/s/` و`/p/`
في Safari بدل التطبيق. تحقّق بعد الضبط:

```bash
curl -i https://wajeezsd.com/.well-known/apple-app-site-association
```

يجب أن يكون `200` و`Content-Type: application/json` وبلا أي redirect.

## 5. App Store Connect

- **اسم التطبيق**: وجيز — تحقّق أنه غير محجوز، والاسم الاحتياطي `Wajeez`.
- **رابط سياسة الخصوصية**: `https://wajeezsd.com/privacy-policy.html`
- **لقطات الشاشة**: iPhone 6.9 بوصة (1290×2796) — 3 لقطات كحد أدنى، والأفضل 5:
  الرئيسية، إنشاء طلب، تتبّع الطلب على الخريطة، المتاجر، سجل الطلبات.
- **استبيان الخصوصية**: الموقع (دقيق، مرتبط بالهوية، لوظائف التطبيق)، الاسم، الهاتف،
  البريد، الصور، معرّف الجهاز — كلها *ليست* للتتبّع الإعلاني.
- **حساب تجريبي**: أنشئ حساب عميل وحساب كابتن **مفعّلين مسبقاً** (`isVerified: true`
  و`approvalStatus: 'approved'`) لأن التحقق برمز SMS لن يصل لمراجع Apple. ضع
  الرقم وكلمة المرور في App Review Information.

### ملاحظات المراجعة (انسخها كما هي)

> التطبيق خدمة توصيل في السودان بثلاثة أدوار: عميل، كابتن (مندوب توصيل)، صاحب متجر.
> إذن الموقع في الخلفية يخص تطبيق الكابتن فقط، ويُستخدم حصراً أثناء وجود مهمة توصيل
> نشطة لعرض موقع المندوب للعميل على الخريطة، ويتوقف بانتهاء المهمة. حساب العميل
> التجريبي لا يطلب هذا الإذن. الدفع نقداً عند الاستلام — لا مدفوعات داخل التطبيق.
> حذف الحساب متاح داخل التطبيق: القائمة الجانبية ← حذف الحساب.

## 6. نقاط مخاطرة متبقية

- **الموقع في الخلفية** أكثر بند تُرفض عليه تطبيقات التوصيل. أرفق فيديو قصير يوضّح
  المهمة النشطة إن طُلب توضيح.
- **البند 4.8**: التطبيق يوفّر Google Sign-In مع تسجيل بالهاتف/كلمة المرور. إن طلب
  المراجع بديلاً، الحل المعتمد هو إضافة **Sign in with Apple**
  (`@capacitor-community/apple-sign-in` + التحقق من identity token في السيرفر).
  لم يُضف الآن لأنه يحتاج Services ID ومفتاح توقيع من حساب المطوّر.
- **ATS**: كل نداءات API تذهب إلى `https://wajeezsd.com` — سليم. لا تُضف
  `NSAllowsArbitraryLoads` مهما اقترحت أدوات أخرى؛ استثناء HTTP يستدعي أسئلة مراجعة.
