# ردّ Apple — Guideline 2.1 Information Needed

> **كيف تستعمله:** انسخ قسم *English reply* كاملاً والصقه مرّتين:
> 1. في **Messages** داخل صفحة المراجعة (ردّاً على رسالة Apple).
> 2. في **App Review Information → Notes** — Apple طلبت ذلك صراحةً
>    («also add this information to the Notes field … for reference on future submissions»).
>
> استبدل ما بين `[ ]` ببياناتك قبل الإرسال.
>
> ⚠️ **حقل Notes محدود بـ 4000 محرف** — والنصّ الكامل أطول منه. للصقه في
> Notes استعمل النسخة المقتضبة: `resources/ios/apple-review-notes.txt`.
> النصّ الكامل هنا للصقه في **Messages** حيث لا حدّ.
>
> ⚠️ **صُحِّح موضعان كانا يناقضان التطبيق:**
> - **الصيدليات**: أُخرجت من التطبيق كلّياً (5.1.1ix). والنصّ القديم كان
>   يقول إنها موجودة — أي أنه يستدعي سؤالاً نجا منه التطبيق بالحذف.
> - **الموقع في الخلفية**: النصّ القديم قال «أثناء رحلة نشطة فقط»، ونصّ
>   الإذن داخل التطبيق يقول «من تفعيل متصل حتى إيقافه». والمراجع يقرأ
>   الاثنين — ووصفٌ أضيق من الواقع يُقرأ تضليلاً.
>
> ⚠️ **لا حساب تاجر:** `create-review-accounts.js` يُنشئ عميلاً وكابتناً فقط.
> حُذف ذكر حساب التاجر من هنا — الوعد بحساب لا تُعطيه سببُ رفضٍ مستقلّ.
>
> **الفيديو — موضعان لا واحد:**
> 1. **مرفقاً** في رسالة Messages (زرّ المشبك). هذا الموضع الوحيد الذي يقبل ملفاً.
> 2. **رابطاً** في `[VIDEO_LINK]` أعلاه. ضروريّ لأن حقل *Notes* لا يقبل مرفقات
>    إطلاقاً — والرابط وحده هو ما يبقى مع التطبيق للمراجعات القادمة، وهو ما
>    طلبته Apple صراحةً. ارفعه على YouTube غير مُدرَج (unlisted) أو Drive
>    برابطٍ يفتحه أي شخص، وتأكّد أن الرابط يعمل في نافذة تصفّح خفيّة.

---

## English reply

Thank you for the review. Below is the information requested.

### 1. Screen recording

A screen recording captured on a physical iPhone running the latest iOS is
attached to this message, and is also available here:

**[VIDEO_LINK]**

It begins with launching the app from the home screen and shows:
account registration and login, creating and tracking a delivery order,
the content **reporting** flow on a store review, the **report and block**
controls inside the in-app chat, and the in-app **account deletion** flow.
The app has no paid content and no in-app purchases.

### 2. Purpose of the app and target audience

Wajeez is a local delivery service operating in Sudan (Khartoum and Port Sudan).

**Problem it solves.** In Sudan there is no reliable, transparent way to have
something delivered. Customers negotiate prices by phone with individual
couriers, have no visibility of where their parcel is, and have no record of
the transaction if something goes wrong. Merchants have no way to reach
customers outside their immediate neighbourhood.

**What the app does.** A customer states what they need and marks pickup and
drop-off points on a map. The request is broadcast to nearby couriers
("captains"), who can accept the listed price or propose a different one; the
customer chooses. The customer then follows the captain live on a map until
delivery, and pays in cash on arrival. Customers can also browse registered
local stores, order products directly, and chat with the captain or the store
inside the app.

**Target audience.** Adults in Sudan who need parcels, groceries, restaurant
orders, or purchases delivered — and small local merchants who want to sell
beyond walk-in customers. Rated 4+; there is no age-restricted content.

**Distribution note.** This is a public consumer app available to anyone in
the region. It is not an internal or employee-only app.

### 3. Setting up and accessing the main features

Demo credentials are provided in the App Review Information section. The app
contains three user roles in a single binary; the role is determined by the
account used to sign in.

- **Customer account** — `[CLIENT_PHONE]` / `[CLIENT_PASSWORD]`
  Sign in with the phone number and password. This is the account to use for
  the main review. From the home screen: set pickup and drop-off on the map,
  choose a price, and submit. The order then appears under "My Orders" with
  live tracking.
- **Captain (courier) account** — `[CAPTAIN_PHONE]` / `[CAPTAIN_PASSWORD]`
  Shows the courier side: available orders, accepting a job, and delivery.

No sample files are required. All features are reachable without payment.

**Content reporting and blocking** (Guideline 1.2). The app displays
user-written reviews on store pages, so both mechanisms are provided:

- **Reporting a review:** open any store → "آراء العملاء" (Customer Reviews)
  → tap **إبلاغ** (Report) under any review → choose a reason → submit.
- **Reporting or blocking a user:** open a chat with a captain or store → tap
  the **⋮** button in the header → choose **الإبلاغ عن إساءة** (Report abuse)
  or **حظر المستخدم** (Block user). A blocked user can no longer send or
  receive messages with the person who blocked them.
- Reports are reviewed by our moderation team in an internal dashboard, where
  offending reviews are hidden and abusive accounts are suspended.

**Account deletion** is available in-app for every role: side menu → **حذف
الحساب** (Delete Account) for customers; Profile → Delete Account permanently
for captains and merchants.

**Location permission.** Customers use location in the foreground only, to see
nearby stores and place the drop-off pin. Background location is requested for
the **captain role only**, and is used during a work shift — from the moment
the captain switches to "Online" until they switch it off — so that nearby
orders reach them and the waiting customer can watch the courier move on the
map while the app is in the background. No location is collected while a
captain is offline, and the customer role never requests background location.
This is exactly what the in-app permission text states.

### 4. External services used

| Service | Purpose |
|---|---|
| Google Maps SDK & Places API | Maps, address search, geocoding, route display |
| Google Sign-In | Optional third-party authentication |
| Firebase Cloud Messaging | Push notifications for order status |
| BRQ SMS gateway | One-time passcodes for phone verification |
| WhatsApp Business API | Optional order notifications for users who opt in |
| SMTP email | Password reset and transactional email |
| MongoDB Atlas | Application database |

We do **not** use any payment processor: all payments are made in cash
directly to the courier on delivery, and the app never collects or stores card
or bank details. We do **not** use any AI service, advertising network, or
analytics SDK that tracks users across apps or websites. This matches the
App Privacy answers, where "used for tracking" is declared as **No**.

### 5. Regional differences

There are none. The app is a single build with identical features and content
in every region. The delivery service itself currently operates in two
Sudanese cities (Khartoum and Port Sudan), and a user's city determines which
couriers and stores they see — but no feature, screen, or content is enabled
or disabled by region, and nothing changes based on the device's country or
App Store storefront.

### 6. Regulated industry / third-party material

The app does not operate in a regulated industry. It is a general courier and
local-delivery service: no financial services, no healthcare services, no
gambling. There are **no pharmacies and no medicines anywhere in the app** —
that category was removed entirely and cannot be selected, searched, browsed
or ordered through any path in the app.

All content in the app is our own or is uploaded by the merchants themselves
through their merchant accounts, and each merchant accepts our terms granting
us the right to display their store name, products, and images. We do not use
any protected third-party material.

---

Please let us know if anything further is needed.

[YOUR NAME]
[YOUR EMAIL] · [YOUR PHONE]

---

## ملخّص عربي (لك، لا تُرسله)

- **البند ١** فيديو من جهاز حقيقي — يجب أن يُظهر: الفتح، التسجيل والدخول،
  إنشاء طلب وتتبّعه، **زر الإبلاغ على رأي**، **الإبلاغ والحظر في المحادثة**،
  و**حذف الحساب**.
- **البند ٣** استبدل `[CLIENT_PHONE]` وأخواتها بمخرجات
  `node scripts/create-review-accounts.js`.
- **الخدمات الخارجية** مأخوذة من `.env.example` فعلاً — لا تخمين.
- **نقطة الصيدليات** ذُكرت صراحةً في البند ٦ قبل أن يسأل عنها المراجع:
  الصمت عنها يجعلها تبدو إخفاءً حين يراها في التطبيق.
- **الموقع في الخلفية** شُرح في البند ٣ لأنه أكثر ما يُسأل عنه في تطبيقات
  التوصيل، وتفسيرُه قبل السؤال يقصّر جولة أسئلة كاملة.
