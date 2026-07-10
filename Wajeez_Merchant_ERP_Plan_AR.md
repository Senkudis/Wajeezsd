# خطة تطوير نظام التجار إلى ERP Mini — وجيز

مستند معماري شامل. الهدف: ترقية نظام التاجر الحالي (منتجات + طلبات + لوحة بسيطة)
إلى نظام تخطيط موارد مصغّر يغطي: التقارير والتحليلات، الأرباح والتكلفة،
إدارة المخزون المتقدمة، والمحاسبة والمصروفات.

---

## 1. المبادئ الحاكمة

- **البناء فوق الموجود، لا استبداله.** نُبقي `ShopOrder`, `Product`, `Place` كما هي
  ونُضيف حقولاً وجداول جديدة، مع قيم افتراضية كسولة (lazy defaults) حتى لا نحتاج
  migration إلزامي للمتاجر القديمة.
- **دقة تاريخية.** تقارير الأرباح يجب أن تبقى صحيحة حتى لو تغيّر سعر التكلفة لاحقاً،
  لذلك نُثبّت (snapshot) التكلفة داخل بنود الطلب وقت الشراء.
- **مصدر حقيقة واحد للمال والمخزون.** كل حركة مخزون تُكتب في سجل، وكل حركة مالية
  تُكتب في دفتر أستاذ (ledger). لا أرصدة "معلّقة في الهواء".
- **نفس الطابع البصري.** صفحات HTML عربية RTL مطابقة لبقية لوحة التاجر،
  بدون إيموجي في عناصر الواجهة، مع cache-busting عند كل تعديل CSS/JS.
- **عزل المدن (multi-city).** كل الاستعلامات مقيّدة بمتجر التاجر تلقائياً عبر `place._id`.

---

## 2. تغييرات نموذج البيانات

### 2.1 تعديل `models/Product.js` (الأرباح والمخزون)
```
cost:               Number, default 0      // سعر التكلفة/الشراء
lowStockThreshold:  Number, default null   // حد التنبيه للمخزون المنخفض (null = بلا تنبيه)
sku:                String, default ''     // رمز المنتج (اختياري)
```
- الربح لكل قطعة = `price - cost`. الهامش٪ = `(price-cost)/price`.

### 2.2 تعديل `models/ShopOrder.js` (تثبيت التكلفة)
في `items[]` نضيف:
```
cost: Number, default 0   // snapshot لتكلفة المنتج وقت الطلب
```
- عند إنشاء الطلب في `POST /shop/:placeId/order` نُخزّن `product.cost` في البند.
- ربح الطلب = `Σ (price-cost)*qty` على البضاعة (لا يشمل التوصيل — التوصيل للكابتن).

### 2.3 نموذج جديد `models/StockMovement.js` (سجل حركة المخزون)
```
placeId, productId (ref)
type:        'purchase' | 'sale' | 'adjustment' | 'return'
quantity:    Number            // موجب = دخول، سالب = خروج
balanceAfter:Number            // المخزون بعد الحركة (لقطة)
unitCost:    Number, default 0 // لحركات الشراء
reason:      String
refModel:    'ShopOrder' | null
refId:       ObjectId | null
createdBy:   ref User
createdAt:   Date
```
- كل تغيير مخزون (بيع/رفض/توريد/تسوية) يكتب سطراً هنا → سجل تدقيق كامل + تاريخ توريد.
- index: `{ placeId, createdAt: -1 }`, `{ productId, createdAt: -1 }`.

### 2.4 نموذج جديد `models/Expense.js` (المصروفات)
```
placeId (ref)
category:   'rent'|'salaries'|'supplies'|'utilities'|'transport'|'other'
amount:     Number (>0)
description:String
date:       Date, default now
createdBy:  ref User
```
- index: `{ placeId, date: -1 }`.

### 2.5 نموذج جديد `models/ShopLedger.js` (دفتر الأستاذ المالي / كشف الحساب)
```
placeId (ref)
type:        'sale_income' | 'expense' | 'settlement' | 'adjustment'
amount:      Number            // موجب = دخل، سالب = صرف/تسوية
balanceAfter:Number            // رصيد المتجر بعد الحركة (لقطة)
refModel:    'ShopOrder'|'Expense'|null
refId:       ObjectId|null
note:        String
createdAt:   Date
```
- يُغذّي `Place.shopWalletBalance` (الموجود أصلاً وغير مُستخدَم) كرصيد جارٍ.
- index: `{ placeId, createdAt: -1 }`.

---

## 3. نقاط الربط في الكود الحالي (Hooks)

| الحدث | الملف/السطر الحالي | ما نضيفه |
|------|--------------------|----------|
| إنشاء طلب متجر | `routes/merchant.js` (POST `/shop/:placeId/order`) | تثبيت `cost` في البنود؛ كتابة StockMovement بنوع `sale` عند حجز المخزون |
| رفض التاجر (إعادة مخزون) | `routes/merchant.js` `/orders/:id/reject` | StockMovement بنوع `return` |
| **توصيل الطلب** | `routes/orders.js:1236` (مزامنة ShopOrder→delivered) | **قيد `sale_income` في ShopLedger + `shopWalletBalance += صافي البضاعة`** — هذه اللحظة هي إغلاق البيع محاسبياً |
| تعديل مخزون سريع | `routes/merchant.js` `/products/:id/stock` | StockMovement بنوع `adjustment` |

> ملاحظة: قيد الدخل يُسجَّل عند **التوصيل** (لا عند القبول) لضمان عدم احتساب طلبات مُلغاة.

---

## 4. واجهات الـ API الجديدة (ملف مقترح: `routes/merchant-erp.js`)

كلها خلف `protect, merchantOnly` وتُقيَّد بـ `place = findOne({ ownerId: req.user._id })`.

### 4.1 التقارير والتحليلات
```
GET /api/merchant/reports/summary?period=today|week|month|custom&from&to
    → { revenue, ordersCount, avgOrderValue, itemsSold, grossProfit }
GET /api/merchant/reports/sales-series?period      → سلسلة زمنية للرسم البياني
GET /api/merchant/reports/top-products?period&limit→ الأكثر مبيعاً (كمية/إيراد/ربح)
GET /api/merchant/reports/customers?period         → أفضل العملاء + نسبة التكرار
```
التنفيذ: MongoDB aggregation على `ShopOrder` (status=delivered + نطاق تاريخ + place).

### 4.2 الأرباح والتكلفة
- حقل `cost` يُضاف لنماذج إنشاء/تعديل المنتج.
- `GET /api/merchant/reports/profit?period` → إيراد، تكلفة بضاعة مباعة (COGS)، ربح إجمالي، ثم بعد خصم المصروفات = صافي الربح.

### 4.3 إدارة المخزون المتقدمة
```
GET  /api/merchant/inventory/low-stock                 → منتجات ≤ حد التنبيه
GET  /api/merchant/inventory/movements?productId&type  → سجل الحركات (pagination)
POST /api/merchant/inventory/restock  {productId, quantity, unitCost}
     → +stock, StockMovement(purchase), (اختياري) Expense(supplies)
POST /api/merchant/inventory/adjust   {productId, newStock, reason}
     → تسوية يدوية + StockMovement(adjustment)
```
- تنبيه لحظي: عند هبوط المخزون تحت الحد → socket `low_stock_alert` + push للتاجر.

### 4.4 المحاسبة والمصروفات
```
GET    /api/merchant/finance/overview   → رصيد المحفظة، دخل الشهر، مصروفات الشهر، الصافي
GET    /api/merchant/finance/ledger     → كشف حساب (pagination)
GET    /api/merchant/expenses           → قائمة المصروفات (فلترة بالفئة/التاريخ)
POST   /api/merchant/expenses           → إضافة مصروف (+قيد ledger)
PUT    /api/merchant/expenses/:id
DELETE /api/merchant/expenses/:id
```

---

## 5. الواجهات الأمامية الجديدة (`public_html/`)

| الصفحة | المحتوى |
|--------|---------|
| `merchant-reports.html` | بطاقات KPI + رسم بياني للمبيعات + جدول الأكثر مبيعاً + أفضل العملاء. فلتر الفترة (اليوم/أسبوع/شهر/مخصص). |
| `merchant-inventory.html` | تبويب "منخفض المخزون" + سجل الحركات + نموذج توريد/تسوية. |
| `merchant-finance.html` | نظرة عامة مالية + كشف حساب + إدارة المصروفات (CRUD). |
| تعديل `merchant-products.html` | إضافة حقلي **سعر التكلفة** و**حد تنبيه المخزون** + عرض هامش الربح. |
| تعديل شريط التنقل السفلي | إضافة روابط: تقارير، مخزون، محاسبة (في كل صفحات التاجر). |

- الرسوم البيانية: مكتبة خفيفة (Chart.js عبر CDN كما في بقية صفحات التطبيق) أو canvas بسيط.

---

## 6. المراحل والترتيب المقترح

1. **الأساس (Data layer):** حقول `cost`/`lowStockThreshold` + النماذج الثلاثة الجديدة
   + تثبيت التكلفة في بنود الطلب. لا تغيير مرئي بعد — بنية فقط.
2. **التقارير والتحليلات:** aggregations للقراءة فقط + `merchant-reports.html`.
   (قيمة فورية، مخاطرة منخفضة، لا يكتب بيانات.)
3. **الأرباح والتكلفة:** حقل التكلفة في واجهة المنتجات + تقرير الأرباح/COGS.
4. **المخزون المتقدم:** StockMovement فعلي + توريد/تسوية + تنبيهات + `merchant-inventory.html`.
5. **المحاسبة والمصروفات:** ShopLedger + ربط قيد الدخل عند التوصيل + المصروفات
   + `merchant-finance.html`.

> كل مرحلة تُسلَّم كاملة (backend + واجهة + اختبار) وتُودَع في commit مستقل.

---

## 7. القرارات النهائية (مُنفَّذة)

1. **البند الخامس:** نقطة بيع مباشرة (Walk-in POS) — نُفِّذت في `merchant-pos.html`
   ونموذج `PosSale`. نظام صلاحيات الموظفين مؤجَّل لدورة تطوير مستقلة (يمس المصادقة).
2. **المصروفات:** للتقارير فقط (حساب صافي الربح) — لا تمس `shopWalletBalance` إطلاقاً.
3. **رصيد المتجر:** مستحقات التاجر لدى التطبيق (Clearing) — يزيد بقيمة البضاعة عند
   التوصيل الناجح، ويُخصم بقيد `settlement` عند تحويل الأدمن للمال.
4. **دورة التسوية:** يدوية — التاجر يطلب سحباً من `merchant-finance.html`، الأدمن يراجع
   في `admin-settlements.html` ويحوّل عبر بنكك ثم يوافق (الخصم ذري ومحمي من التكرار).
5. **مبيعات POS:** نقد مباشر بيد التاجر — تدخل التقارير والأرباح وتخصم المخزون،
   لكنها لا تدخل دفتر المستحقات.

## 8. حالة التنفيذ (2026-07-10)

- المرحلة 1 (طبقة البيانات): منفَّذة — commit `9a7d9c1`
- المرحلة 2 (واجهات API): منفَّذة — commit `e5c8d33` (`routes/merchant-erp.js`)
- المرحلة 3 (الواجهات الأمامية): منفَّذة — commit `2cf323e`
  (تقارير، مخزون، محاسبة، نقطة بيع، تسويات الأدمن، حقول التكلفة في المنتجات)
- اختبار تكاملي شامل: 24 فحصاً على كل المسارات ضد قاعدة البيانات الحقيقية — كلها سليمة
  (بما فيها رفض السحب فوق الرصيد، منع الإلغاء المزدوج، حجب غير المصرح لهم).
- مؤجل: نظام صلاحيات موظفي المتجر (كاشير/مدير مخزن).
