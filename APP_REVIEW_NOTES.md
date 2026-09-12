# ردّ مراجعة آبل — الرفض الثاني لإصدار 1.4.2 (32)

> تاريخ المراجعة: 12 سبتمبر 2026 — Submission ID: 31f7ffd2-76f8-45c0-aacb-6207f97caa2c
>
> ⚠️ **اقرأ «ملاحظات لك» في الأسفل قبل الإرسال.** فيها سؤالان لا أعرف
> إجابتهما، وبلا إجابتهما يُرفض الإصدار مرّةً ثالثة بنفس السبب 2.1.

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

**Guideline 2.1 — Information Needed (regulated services / sensitive data)**

- **Which companies or institutions provide the services offered in the app?**

  <<<FILL IN — انظر «ملاحظات لك» رقم ١>>>

- **What is the relationship between Mohamed Hamza and the providers of these
  services?**

  <<<FILL IN — انظر «ملاحظات لك» رقم ٢>>>

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

### ثانياً: السؤالان اللذان أحتاج إجابتهما منك

آبل تسأل تحت 5.1.1(ix) — «الخدمات شديدة التنظيم». والأرجح أن ما أثارها
**الصيدليات**: توصيل الأدوية مجالٌ منظَّم في كل الدول، ويُطلب فيه إثبات أن
من يقدّم الخدمة مرخَّصٌ لها.

**١. من يقدّم الخدمات؟** الجواب الصحيح — إن كان ينطبق — هو:

> «وجيز منصّة توصيل ووساطة. لا نبيع أي منتج بأنفسنا ولا نملك مخزوناً ولا
> صيدلية. البائع في كل طلب هو المتجر المستقلّ المسجَّل لدينا، وهو صاحب
> الترخيص التجاري الخاص به. والصيدليات المدرجة صيدليات مرخّصة من [الجهة
> المانحة في السودان — المجلس القومي للأدوية والسموم؟]، ولا تُباع عبر
> التطبيق أدوية تستلزم وصفة / أو: تُسلَّم الأدوية الموصوفة بعد إبراز الوصفة
> عند التسليم.»

املأ ما بين الأقواس بما ينطبق فعلاً. **لا تكتب ما ليس صحيحاً** — آبل قد
تطلب صوراً من التراخيص، والإجابة غير الدقيقة تُغلق الحساب لا الإصدار.

وإن كنت **لا** تعرض صيدليات ولا أي خدمة منظَّمة، فالجواب أبسط: «التطبيق
يوصّل مشتريات من متاجر بقالة ومطاعم مستقلّة، ولا يقدّم أي خدمة في مجال
منظَّم (لا صحّة ولا مال ولا سفر)» — مع حذف التصنيف من التطبيق إن وُجد.

**٢. علاقة Mohamed Hamza بمقدّمي الخدمة؟** آبل تريد معرفة صفة صاحب حساب
المطوّر. الجواب المتوقَّع شيءٌ مثل:

> «Mohamed Hamza هو [مالك/مدير] شركة [الاسم القانوني الكامل] المسجَّلة في
> السودان برقم [رقم السجل التجاري]، وهي مالكة تطبيق وجيز ومشغّلته. الشركة
> ليست مالكةً لأيٍّ من المتاجر المعروضة؛ علاقتها بها عقد اشتراك/عمولة
> كمنصّة وسيطة.»

أرسِل مع الردّ — إن توفّرت — صورة **السجل التجاري** أو رخصة النشاط. آبل
تقبل المرفقات في ردّ App Store Connect، ووجودها يختصر جولةً كاملة.

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
- لم أكتب جواب 2.1 بنفسي: هو إقرارٌ قانوني عن شركتك وتراخيصها، وأي كلمة
  أخترعها فيه قد تُغلق حساب المطوّر لا الإصدار وحده.
