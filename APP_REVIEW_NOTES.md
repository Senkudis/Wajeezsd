# ردّ مراجعة آبل — 1.4.2 (32)

> انسخ القسم الإنجليزي أدناه في **App Review Information → Notes**،
> وردّ به أيضاً على رسالة آبل في App Store Connect.
> ⚠️ املأ بيانات الحسابين التجريبيين أولاً — بدونها يتكرّر رفض 2.1(a).

---

## English — paste this

Submission ID of previous review: 31f7ffd2-76f8-45c0-aacb-6207f97caa2c
Previous version: 1.4.1 (31) — this build: 1.4.2 (32)

Thank you for the detailed review. All four issues are addressed in this build.

**Guideline 4 — Design (sign in / register in the default browser)**

You are right. The "Register as a Captain (driver)" menu item opened an external
website (captain.wajeezsd.com) in the default browser. That entire registration
form is now built into the app as a native in-app screen. No sign-in or
registration step leaves the app, and the external link has been removed
completely. Captains register and sign in fully inside the app.

Note: the app already offers in-app account deletion (Menu → Delete my account),
as required for apps that support account creation.

**Guideline 5.1.1(v) — Data Collection and Storage (registration required to browse)**

Correct — the store/product browsing screen redirected guests to the login page
as soon as it opened. That gate is removed. Without any account, a user can now:

- choose a city and browse all store categories
- open any store and view its full product list, prices, offers and ratings
- use search across stores and products
- read reviews and store details

Registration is now requested only for account-based actions: adding to cart,
placing an order, chat with a store or driver, order history, and favourites.

**Guideline 5.1.5 — Location Services (app not functional when disabled)**

The app is fully functional with Location Services turned off, and this build
was tested in exactly that state (Location Services denied, no account):

- The city is chosen manually from a list on first launch — location is never
  used to determine it.
- Browsing, searching, opening stores and viewing products all work normally.
- Location is optional and used only to (a) sort nearby stores by distance and
  (b) pre-centre the map pin when a signed-in user places a delivery order. When
  it is unavailable, stores are simply listed without distance sorting and the
  user sets the delivery pin manually on the map.

**Guideline 2.1(a) — Information Needed (cannot access driver accounts)**

Demo credentials for all account types are below. The driver (captain) account is
pre-approved, so it reaches the full driver experience — going online, receiving
and accepting orders, navigation, and the earnings wallet.

Driver (captain):
  Login URL: in-app → Menu → "دخول الكابتن" (Captain login)
  Phone / Email: <<<FILL IN>>>
  Password: <<<FILL IN>>>

Customer:
  Phone / Email: <<<FILL IN>>>
  Password: <<<FILL IN>>>

Merchant (store owner):
  Phone / Email: <<<FILL IN>>>
  Password: <<<FILL IN>>>

Note on OTP: if a verification code is requested during sign-in, the accounts
above are already verified and will not ask for one.

Please let us know if anything else is needed — we will respond quickly.

---

## ملاحظات لك (لا تُرسَل)

**قبل الإرسال:**

1. **أنشئ الحسابات الثلاثة** واملأ `<<<FILL IN>>>`. الأهم **حساب الكابتن**
   ويجب أن يكون `approvalStatus: 'approved'` — الكابتن المعلّق لا يستقبل
   طلبات، فيرى المراجع شاشة انتظار ويعيد الرفض بنفس السبب 2.1(a).
2. تأكّد أن الحسابات **مفعّلة** (`isVerified: true`) حتى لا تطلب كود OTP —
   المراجع لا يملك هاتفاً سودانياً لاستقبال الرسالة، وهذا وحده سببُ رفضٍ متكرّر.
3. اضبط «أحدث إصدار» في لوحة الأدمن على **1.4.2** بعد قبول الإصدار، وإلا لن
   يُبلَّغ المستخدمون بالتحديث.

**ما لم أغيّره وسبب ذلك:**

- لم أنشئ الحسابات التجريبية: قاعدة الإنتاج، والقرار قرارك.
- لم ألمس نصّ سياسة الخصوصية ولا إعدادات App Store Connect.

**الحجّة إن سألوا عن الموقع (5.1.5):**

القياس الذي أجريته: زائر بلا حساب + خدمات الموقع مرفوضة ⇒ شاشة التصفّح تُفتح
وتعرض المحلات، بلا أي تحويل أو رسالة خطأ. كان قبل الإصلاح يُحوَّل فوراً إلى
صفحة تسجيل الدخول — وأرجّح أن هذا ما جعل المراجع يصف التطبيق بأنه «غير وظيفي»،
فاختلط عليه سببا 5.1.1(v) و5.1.5.
