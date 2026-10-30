# خطة الأصول — «الخيط»

| Asset | من داخل المشروع | المكان | الاستعمال | الحالة |
|---|---|---|---|---|
| نص «طلبك وين ماشي اليوم؟» | الصفحة الرئيسية `index.html` | — | الخطّاف | مستعمل |
| خط Cairo (متغيّر الأوزان) | `public_html/vendor/fonts/` | — | السؤال، أي نص واجهة | مستعمل |
| أيقونات Bootstrap: `geo-alt-fill` (الدبوس)، `scooter` (دراجة)، `taxi-front-fill` (ركشة) | `public_html/vendor/bootstrap-icons/` | — | الدبوس وعلامتا الكابتنين | مستعمل |
| ألوان العلامة `#04553A`، `#048c5b`، `#BF8B1F` | `style.css` | — | الترويسة، الخيط، خيط السعر | مستعمل |
| بطاقتا العرض الحقيقيتان | `client-my-orders.html` مصوّرة بدقة 3× | `marketing/ad-thread/assets/card1.png`، `card2.png` | العروض | مستعمل — **بيانات Preview** |
| حقل السعر «3500 ج.س» بزرّي +/− | `index.html#price` مصوّر | `marketing/ad-thread/assets/price.png` | سعر العميل | مستعمل — **بيانات Preview** |
| زرّ «قبول العرض» (داخل البطاقة) | — | — | الاختيار | مستعمل |
| جرس الإشعار | `public_html/sounds/wajeezsd-bell.wav` | — | القبول (والوصول لاحقاً) | مستعمل |
| شبكة الطرق والمباني الحقيقية | OpenStreetMap (ODbL) | `marketing/ad-thread/data/streets.json`، `buildings.json` | «مدينة وجيز» | مستعمل، والنسبة ظاهرة |
| المسار الحقيقي عبيد ختم ← المشتل ← الرياض | `marketing/wajeez-ad-v2/tools/path.json` | — | الطريق إلى العميل | مستعمل جزئياً |
| بطاقة التتبّع «الكابتن في الطريق إليك» + شارة الدقائق | `tracking.html` (التصميم الجديد) | `marketing/ad-30/assets/screens/` + تصوير جديد | المشهد 10 | مخطّط |
| «تم التوصيل» + «المطلوب نقداً عند التسليم» | `tracking.html` | `marketing/ad-30/assets/screens/delivered.png` | المشهد 11 | مخطّط |
| الشعار الرسمي (بلا الشعار الفرعي) | `public_html/logo-white.png` | `marketing/ad-30/assets/brand/logo-white-notag.png` | الختام | مخطّط |
| شارتا App Store (إنجليزية) و Google Play (عربية) | — | `marketing/ad-30/assets/badges/` | الختام | مخطّط |
| مؤثرات CC0 | مهارة sound-effects | `.claude/skills/sound-effects/sfx/` | Cue sheet | مستعمل |
| صوت Kedy | ElevenLabs `67MziYXQq91v7N0FxfTq` | — | التعليق | **بانتظار موافقتك على النص** |

## بيانات Preview (توضيحية، لا تُقدَّم كحقائق)
اسما الكابتنين (محمد عبدالله، عثمان الطيب)، التقييمات (4.9 / 312، 4.7 / 88)، السعران (3500 و 4000 ج.س)، سعر العميل 3500، عدّادا انتهاء العرض (3:40، 2:22)، ومواقع الكابتنين على الخريطة (نقاط حقيقية على شوارع حقيقية، لكن وجود كابتن فيها توضيحي). عدد العروض (اثنان) يطابق ما تعرضه شاشة التطبيق «وصلك 2 عرض» في بيانات Preview — ليس ادّعاءً بعدد كباتن.

## لا يُستعمل
صور أو فيديو مولّدة، أيقونات من مكتبات أخرى، بلاطات خرائط، خرائط Google، أي رقم أو ادّعاء خارج `ad-product-understanding.md` §10.
