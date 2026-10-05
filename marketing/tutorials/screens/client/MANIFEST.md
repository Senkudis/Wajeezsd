# لقطات فيديو العميل

مولّدة بـ `node tools/shots-client.js` (كل لقطة: PNG بكثافة 2.5 + JSON بمواضع العناصر بالبكسل المنطقي للصفحة). علامة (?) = المحدِّد لم يجد العنصر.
أُعيد إنشاء هذا الملف بـ `node tools/manifest-client.js`.

| الاسم | الصفحة | ما تعرضه | صفحة كاملة؟ والارتفاع | العلامات (marks) | ملاحظات |
|---|---|---|---|---|---|
| cityPicker | index.html | اختيار المدينة أول مرة: «أم درمان/الخرطوم»، «بورتسودان»، «عطبرة» | لا (390×844) | khartoum, portsudan, atbara |  |
| cityPicked | index.html | نفس الشاشة بعد اختيار الخرطوم وزر التأكيد | لا (390×844) | khartoum, confirm |  |
| register | client-register.html | إنشاء حساب: الاسم، الهاتف، البريد، كلمة المرور، المدينة | نعم، 942px | name, phone, email, password, city, submit |  |
| login | client-login.html | تسجيل الدخول: الهاتف/البريد، كلمة المرور، «نسيت كلمة المرور» | لا (390×844) | id, password, submit, forgot |  |
| home | index.html | الرئيسية: التحية، البانر، العناوين المحفوظة، نموذج التوصيل، الشريط السفلي | لا (390×844) | menu, greeting, banners, saved, pickupBtn, navHome, navShop, navOrders, navNotif | البانر يستعمل assets/app/home.jpg (لقطة تطبيق) كصورة |
| menu | index.html | القائمة الجانبية باسم «أحمد محمد»: طلباتي، تسجيل الخروج، سجّل ككابتن، الدعم والشكاوى، شرح التطبيق… | لا (390×844) | — | أعيد التقاطها مع userName (كانت تعرض «زائر») |
| orderForm | index.html | نموذج طلب توصيل معبّأ: الاستلام والتسليم، التفاصيل، الصورة، السعر ±، «اطلب الكابتن الآن» | نعم، 1480px | saved, savedChip, pickupBtn, pickupAddr, pickupName, pickupPhone, dropoffBtn, dropoffAddr, dropoffName, dropoffPhone, saveAddr, multi, addDrop, addPick, details, photo, price, minus, plus, cityLine, submit |  |
| multiStop | index.html | توصيل متعدد النقاط: وجهتان إضافيتان، «أضف وجهة تسليم/نقطة استلام» | نعم، 844px | extra, multi, hint, price |  |
| mapPicker | index.html | منتقي الخريطة: «حدد موقع الاستلام»، البحث، المدينة، «تأكيد الموقع» | لا (390×844) | modeLabel, cityChip, search, locate, layer, theme, sheet, preview, linkHost, confirm |  |
| citySheet | index.html | ورقة تغيير المدينة فوق الخريطة | لا (390×844) | khartoum, portsudan, atbara |  |
| cityAway | index.html | سطر «الطلب في عطبرة» حين المدينة المختارة غير مدينة الحساب | نعم، 1459px | cityLine, submit |  |
| shopBrowse | client-order.html | تسوّق: البحث، «ما لقيت محلك؟ اطلب أي شيء»، التصنيفات، «متاجرك المفضّلة»، «المحلات القريبة منك» (مفتوح/مغلق، تقييم، مسافة، «تسوق») | نعم، 1891px | search, errandPromo, categories, catFirst, favorites, favCard, favHeart, nearby, nearbyCard, shopBtn, closedBadge | لا صور للمحلات — الغلاف البديل للتطبيق (أيقونة القسم) |
| storeSheet | client-order.html | ورقة المتجر: «مطعم الساحة»، «يبعد 2.0 كم»، «محادثة التاجر»، «الموقع على الخريطة»، «تصفح المنتجات واطلب»، «المنيو»، «كيف تطلب؟» | لا (390×844) | sheet, name, status, distance, chat, map, browse, menu | شارة «مفتوح الآن» لا تظهر (عطل في التطبيق) |
| shopDetail | shop-detail.html?placeId=… | صفحة المتجر: مفتوح، مشاركة، ♥ المفضّلة، 4.8 (214 تقييم)، «عرض الآراء»، بحث المنتجات، تبويبات الكل/وجبات/فطور/مشروبات، شارات -15%/-20%، «12 متبقية»، «نفدت الكمية» | نعم، 1647px | back, openBadge, share, fav, name, rating, reviews, search, tabs, tabMeals, saleCard, saleBadge, oldPrice, stock, outOfStock, addBtn, details | المنتجات بلا صور (أيقونة الصندوق) |
| shopReviews | shop-detail.html | ورقة «آراء العملاء» 4.8 مع ثلاثة آراء و«إبلاغ» | لا (390×844) | sheet |  |
| productDrawer | shop-detail.html | تفاصيل المنتج: 4250 ج.س، 5000 مشطوب، «وفّر 15%»، «12 متبقية»، الوصف، «مشاركة المنتج»، «أضف للسلة» | لا (390×844) | drawer, price, saleBadge, desc, share, add |  |
| cartBar | shop-detail.html | بعد الإضافة: عدّاد الكمية على البطاقة + شريط «4 عناصر · 13000 ج.س · عرض السلة» | لا (390×844) | qty, plus, minus, fab, fabCount, fabTotal |  |
| cart | shop-detail.html | السلة: ثلاثة أصناف بكميات ±، الإجمالي 13000، «متابعة الطلب» | لا (390×844) | drawer, items, firstItem, qty, total, proceed, close |  |
| checkout | shop-detail.html | تأكيد الطلب: ملخّص، «تحديد من الخريطة»، العنوان، «الصق رابط خرائط جوجل»، سعر التوصيل 2500 مع ±، أقل سعر مسموح، المستلم، الملاحظات، كوبون WAJEEZ500 مطبّق، ملخّص المبالغ، «توضيح مهم للدفع»، «إرسال الطلب للمتجر» | لا (390×1640) | modal, summary, mapBtn, address, linkBox, fee, feeMinus, feePlus, feeHint, name, phone, notes, promo, promoApply, promoResult, totals, discount, payNote, submit, edit | نافذة عرض أطول h=1640 لتظهر النافذة كاملة |
| errandPicker | client-order.html | ورقة «اطلب من أي محل»: بحث «بقالة»، تصنيفات، «متاجر وجيز» (متجر مسجّل)، «أماكن قريبة»، «مكان آخر» | لا (390×844) | sheet, search, cats, groupOurs, ourCard, mapBtn, other | اسم «سوبر ماركت النيل» يُقصّ آخر حرفه بجانب الشارة (تخطيط التطبيق) |
| errandForm | index.html?mode=errand | طلب شراء: «سوبر ماركت النيل»، موقع الشراء، الأصناف، «ميزانية تقديرية» 12000، «اشترِ مباشرة إذا كان ضمن ميزانيتي» ✓، التسليم، أجرة 2500، «اطلب الكابتن الآن» | نعم، 1547px | shopBanner, pickupSummary, items, budget, autoApprove, dropoffBtn, dropoffAddr, dropoffName, dropoffPhone, price, submit |  |
| ordersSearching | client-my-orders.html | طلب «في الانتظار» مع رادار «جاري البحث عن أقرب كابتن لك» وعدّاد 7:57، «إلغاء الطلب» | لا (390×844) | tabs, card, status, radar, title, countdown, cancel |  |
| ordersOffers | client-my-orders.html | «وصلك 2 عرض»: محمد عبدالله 4.9 دراجة نارية 3500، عثمان الطيب 4.7 ركشة 4000، «ينتهي خلال»، «قبول العرض»/«رفض» | نعم، 989px | header, offer1, avatar, rating, price, expires, accept, reject, offer2, cancel |  |
| ordersTimeout | client-my-orders.html | «لم نجد كابتناً متاحاً بعد» مع «واصل البحث» و«ألغِ الطلب» | لا (390×844) | panel, title, keep, cancel |  |
| cancelModal | client-my-orders.html | «لماذا تريد إلغاء الطلب؟» ستة أسباب (مختار: سعر التوصيل مرتفع)، ملاحظة، «تأكيد الإلغاء»/«تراجع» | لا (390×844) | popup, reasons, picked, note, confirm, back |  |
| acceptedPopup | client-my-orders.html | نافذة «تم قبول طلبك!» و«الكابتن في الطريق إليك الآن.» و«تتبع الطلب» | لا (390×844) | popup, title, track | العنوان يحمل رمز معبد 🛕 — من كود التطبيق |
| errandQuote | tracking.html | نافذة «سعر طلبك جاهز»: 13500 ج.س، أجرة التوصيل، «أعلى من ميزانيتك (12000) بمقدار 1500»، «وافق وابدأ الشراء»/«رفض» | لا (390×844) | popup, title, amount, accept, reject |  |
| errandQuoteCard | client-my-orders.html | بطاقة الطلب بسعر البضاعة 10500 «ضمن ميزانيتك» مع «وافق وابدأ الشراء»/«رفض» | لا (390×844) | card, quote, accept, reject |  |
| tracking | tracking.html?orderId=… | التتبّع: خريطة بمسار عبيد ختم→المشتل وموقع الكابتن، «الكابتن استلم الطرد»، المراحل بأوقاتها، بطاقة الكابتن 4.9 (312) 1.2 ألف رحلة «يتحرّك الآن» واتصال ومحادثة | لا (390×844) | back, map, status, steps, captain, captainName, rating, call, chat, route, eta, etaTime, distance, price, tip | المسار يُرسم بـ Leaflet (المحوّل لا ينفّذ Directions)؛ الوقت/المسافة/السعر أسفل اللوحة (انظر tipSheet) |
| tipSheet | tracking.html | أسفل لوحة التتبّع: وقت الوصول ~4 دقيقة، المسافة 1.6 كم، السعر 4,500، «إكرامية للكابتن» 500/1,000(مختار)/2,000/«مبلغ آخر»/«إلغاء» | لا (390×844) | tipBox, current, chips, chip500, chip1000, chip2000, other, clear, price |  |
| tipCustom | tracking.html | نافذة «إكرامية الكابتن» بمبلغ 1500 و«تأكيد»/«إلغاء» | لا (390×844) | popup, input, confirm |  |
| chat | chat.html?orderId=… | محادثة مع الكابتن محمد عبدالله: رسائل نصية وصورة فاتورة، «تتبع»، قائمة ⋮، إرفاق صورة، إرسال | لا (390×844) | back, name, track, safety, image, attach, input, send | صورة الفاتورة مرسومة (tools/assets/chat-receipt.jpg) |
| chatMenu | chat.html | نافذة «خيارات السلامة»: «الإبلاغ عن إساءة»، «حظر المستخدم»، «إلغاء» | لا (390×844) | popup, report, block, cancel |  |
| payShop | client-my-orders.html | طلب متجر «بانتظار موافقة المتجر» و«في انتظار الدفع للمتجر»: 12250 ج.س، طرق الدفع بنكك/ماي كاشي/فوري/أوكاش، بيانات بنكك و«نسخ الرقم»، «ارفع صورة إشعار الدفع»، «محادثة التاجر» | نعم، 1537px | card, status, payBox, amount, methods, bankak, copy, upload, merchantChat, waiting, cost, cancel |  |
| payReview | client-my-orders.html | بطاقتان: «جاري مراجعة الإشعار»، و«المتجر يُجهّز طلبك» مع «تم تأكيد الدفع وجاري التجهيز!» و«المتبقي (للكابتن)» | نعم، 1511px | reviewCard, reviewing, confirmedCard, confirmed, remaining |  |
| confirmReceipt | client-my-orders.html | نافذة «هل استلمت طلبك؟» «نعم، استلمت»/«لا، لم استلم» | لا (390×844) | popup, yes, no |  |
| rating | client-my-orders.html | «تقييم الكابتن»: خمس نجوم «ممتاز»، وسوم سريع/محترم مختارة، تعليق، «إرسال»/«تخطّي» | لا (390×844) | popup, stars, star5, label, tags, comment, send, skip |  |
| storeRating | client-my-orders.html | «قيّم المتجر»: خمس نجوم، تعليق، «إرسال»/«تخطّي» (الخطوة التالية لطلبات المتاجر) | لا (390×844) | popup, stars, comment, send, skip |  |
| ordersHistory | client-my-orders.html | تبويبات (معروض: مكتملة 2، ملغاة 1، الكل 3 مفعّل)، طلب متجر مُسلَّم بتفصيل المبالغ و«قيِّم الطلب»، توصيل مُسلَّم، ملغي مع «إعادة الطلب» | نعم، 1610px | tabs, tabActive, tabWaiting, tabDone, tabCancelled, tabAll, shopCard, breakdown, rate, timeline, reorder, cancelledCard | شريط التبويبات مُمرَّر ليظهر «الكل»؛ «جارية/بانتظار كابتن» خارج الإطار يميناً |
| notifications | notifications.html | الإشعارات مجمّعة: اليوم/أمس/هذا الأسبوع/أقدم، غير مقروء، الكل/غير المقروء/تحديد الكل كمقروء | نعم، 1304px | subtitle, chipAll, chipUnread, markAll, groupToday, firstItem, unreadItem |  |
| support | client-complaint.html | «تذكرة جديدة»: موضوع الشكوى، نوع المشكلة، رقم الطلب، التفاصيل، «إرسال الشكوى» | لا (390×844) | tabNew, tabMine, subject, type, orderNo, details, submit | قائمة الأنواع تحوي رموزاً تعبيرية (من التطبيق) |
| supportTickets | client-complaint.html | «تذاكري»: تذكرتان (قيد المعالجة، محلولة) مع عدد الردود | لا (390×844) | tabMine, badge, ticket, status, replies |  |
| supportThread | client-complaint.html | محادثة التذكرة مع ردّ «فريق الدعم» وخانة الرد | لا (390×844) | modal, clientMsg, adminMsg, reply |  |
| deleteMenu | index.html | أسفل القائمة الجانبية: «حذف الحساب نهائياً» | لا (390×844) | deleteBtn |  |
| deleteAccount | index.html | الخطوة الأولى: «هل تواجه مشكلة؟» «تواصل مع الإدارة»/«أريد حذف حسابي» | لا (390×844) | popup, contact, wantDelete |  |
| deleteConfirm | index.html | الخطوة الثانية: «حذف الحساب نهائياً» وخانة رقم الهاتف و«حذف حسابي»/«إلغاء» | لا (390×844) | popup, phone, del, cancel |  |
| mapPickerFilled | index.html | منتقي الخريطة بعنوان «أم درمان، شارع الأربعين — قرب استاد الهلال» | لا (390×844) | modeLabel, cityChip, search, locate, layer, sheet, preview, linkToggle, confirm | نصّ العنوان مكتوب في before (لا جيوكودر) |
| mapLink | index.html | حقل «رابط الموقع» مفتوحاً برابط maps.app.goo.gl و«تحقّق» | لا (390×844) | linkBox, host, input, use, confirm |  |
