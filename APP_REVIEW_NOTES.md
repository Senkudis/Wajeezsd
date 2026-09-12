# ردّ مراجعة آبل — الرفض الثاني لإصدار 1.4.2 (32)

> تاريخ المراجعة: 12 سبتمبر 2026 — Submission ID: 31f7ffd2-76f8-45c0-aacb-6207f97caa2c
>
> ⚠️ **قبل الإرسال:** يلزم سطرٌ واحد منك — اسم العمل كما في الشهادة —
> وبيانات الحسابات التجريبية الثلاثة. انظر «ملاحظات لك» في الأسفل.

---

## English — paste this in App Store Connect (reply) and in App Review Notes

Submission ID: 31f7ffd2-76f8-45c0-aacb-6207f97caa2c
Version: 1.4.2 — new build attached.

Thank you for the follow-up. Both remaining issues are addressed below.

---

**Guideline 5.1.1(v) — Registration required before browsing**

You are right, and our previous reply was inaccurate — we apologise. We had
removed one registration gate (the "buy-for-me" place picker) but a second gate
remained on the main Shop tab, which is the screen your reviewer opened. On that
screen the category grid was replaced by a card reading "you must sign in or
create an account to view stores". That gate is now removed.

With **no account at all**, a user can now:

- open the Shop tab and see every store category
- see the "Stores near you" list with names, ratings, open/closed status
- open any category and browse the stores in it
- open any store page and see its full product list, prices, offers, ratings
  and reviews
- search across stores and products

Registration is requested only for account-based actions, exactly as the
guideline allows: adding to cart, placing an order, order history, favourites,
and chatting with a store or driver. Tapping "Add to cart" as a guest shows a
prompt with two choices — sign in, or **continue browsing as a guest** — and
choosing the second keeps the user on the store page.

The only remaining signed-in search is the optional "search places outside our
own stores" feature inside the buy-for-me flow. It calls a paid third-party
place-search API on every request, so it is limited per account to control cost.
It is not our catalogue: all wajeez stores and products are fully browsable
without an account. If you would prefer this to be open to guests as well, we
will change it immediately.

**Guideline 2.1 — Information Needed**

*Which companies or institutions provide the services offered in the app?*

wajeez is a local delivery platform. We do not sell any goods ourselves and we
hold no inventory. In every order the goods are supplied by independent local
businesses — restaurants, grocery stores, supermarkets, bakeries and cafés —
which register on the platform, are reviewed by us, and remain responsible for
their own products and their own trade licences. wajeez provides the ordering
interface and the delivery of the purchased items by contracted drivers.

The app does not operate in any highly regulated field:

- No healthcare services and no pharmacies. Medicines are not sold, listed or
  searchable in the app in any form. (An earlier build listed a pharmacy
  category; it has been removed from this build, and pharmacy results are now
  filtered out of the place search as well.)
- No banking or financial services. The app processes no payments at all: every
  order is paid in cash on delivery. There is no card, wallet or in-app payment
  of any kind.
- No gambling, no cannabis, no air travel.

The categories available in the app are: restaurants, groceries and
supermarkets, bakeries, cafés, and general retail shops.

*What is the relationship between Mohamed Hamza and the providers of these
services?*

There is no ownership relationship. Mohamed Hamza holds no interest, financial
or otherwise, in any of the merchants listed in the app. Each merchant applies
through the app, is reviewed, and is listed as an independent seller under a
standard platform-merchant agreement; wajeez earns a delivery fee on orders.

Mohamed Hamza is the developer of the app and the holder of this Apple Developer
account, acting for wajeez, which is registered in Sudan under the business name
"<<<اسم العمل كما في الشهادة>>>". The registration certificate can be provided
on request.

**Demo accounts**

Customer:
  Phone / Email: <<<FILL IN>>>
  Password: <<<FILL IN>>>

Driver (captain) — pre-approved, reaches the full driver experience:
  In-app → Menu → "دخول الكابتن" (Captain login)
  Phone / Email: <<<FILL IN>>>
  Password: <<<FILL IN>>>

Merchant (store owner):
  Phone / Email: <<<FILL IN>>>
  Password: <<<FILL IN>>>

All three accounts are verified and will not ask for an SMS code.

Please let us know if anything else is needed — we will respond the same day.

---

## ملاحظات لك (لا تُرسَل)

### أولاً: لماذا تكرّر رفض 5.1.1(v) — وهو خطئي

ردّي السابق قال إن التصفّح صار مفتوحاً، وكان ذلك **ناقصاً**: أزلتُ بوّابة
واحدة (منتقي «اشترِ لي») وبقيت البوّابة الأهمّ في **صفحة التسوّق نفسها** —
وهي الشاشة التي يفتحها المراجع. أُصلحت الآن، ومقيسةٌ في المتصفّح بلا حساب:
التصنيفات والمحلات والمنتجات والأسعار كلّها تظهر، والإضافة للسلة وحدها
تطلب الدخول.

### ثانياً: الأوراق — ما يلزم وما لا يلزم

بعد إخراج الصيدليات، التطبيق صار توصيل مطاعم وبقالات: **مجالٌ غير منظَّم**.
وعليه:

- **5.1.1(ix) لم يعد ينطبق** — لا حاجة لحساب مؤسسة، ولا تراخيص، ولا نقل
  الحساب. هذا الشرط يخصّ المجالات شديدة التنظيم وحدها.
- **سؤال 2.1 يُجاب بالكتابة لا بالمرفقات.** آبل تطلب المستندات حين تشير
  الإجابة إلى مجال منظَّم أو بيانات حسّاسة. والإجابة أعلاه لا تشير لأيٍّ
  منهما: لا صحّة، ولا دفع داخل التطبيق (كلّه نقداً عند التسليم)، ولا بيانات
  حسّاسة.

**فالمطلوب منك سطرٌ واحد فقط**: اسم العمل كما هو مكتوب في الشهادة، ليحلّ
محلّ `<<<اسم العمل كما في الشهادة>>>`.

**وخطاب التفويض؟** غير مطلوب الآن. السؤال الذي طرحته آبل هو عن علاقة محمد
بـ**مقدّمي الخدمات** — أي المتاجر — والجواب الصادق أنه لا علاقة ملكية به،
وهذا ما كُتب. لم تسأل عمّن يملك وجيز، فلا تتطوّع بفتح ملفٍّ لم يُفتح.

**لكن احتفظ بالورقتين جاهزتين**: صورة الشهادة، وخطاب تفويض موقَّع من صاحب
العمل. إن سألت آبل سؤالاً متابعاً عن صفة صاحب الحساب، الردّ في اليوم نفسه
بمرفقٍ جاهز يُنهي الأمر — والتأخّر أو التردّد هو ما يطيل الملف.

⚠️ **وإن رجعت الصيدليات يوماً**: لا تُعِدها من لوحة الإدارة بعد القبول. هذا
ما تسمّيه آبل bait-and-switch (2.3.1)، وعقوبته إزالة التطبيق أو إغلاق
الحساب لا رفض إصدار. الطريق: شركة مسجَّلة + تراخيص + إصدار جديد يُراجَع.

### ثالثاً: قبل الإرسال

1. **املأ الحسابات التجريبية الثلاثة.** حساب الكابتن تحديداً يجب أن يكون
   `approvalStatus: 'approved'` و`isVerified: true` — الكابتن المعلّق يرى
   شاشة انتظار، والمراجع لا يملك هاتفاً سودانياً لاستقبال كود OTP.
2. **ابنِ إصداراً جديداً.** بناء 32 يحمل البوّابة القديمة؛ لا فائدة من
   إعادة إرساله. رقم البناء يأتي تلقائياً من `github.run_number`، والإصدار
   يبقى 1.4.2 (مسموحٌ رفع بناءٍ جديد على نسخةٍ مرفوضة).
3. بعد القبول: اضبط «أحدث إصدار» في لوحة الأدمن على 1.4.2.

### ما لم أفعله وسبب ذلك

- لم أنشئ الحسابات التجريبية — قاعدة الإنتاج، والقرار قرارك.
- لم أضع اسم العمل ولا رقم الشهادة: لا أعرفهما، وأي اسمٍ أخترعه في إقرارٍ
  رسمي يضرّ الحساب لا الإصدار وحده.
- لم أنقل حساب المطوّر ولا لمست إعدادات App Store Connect.
