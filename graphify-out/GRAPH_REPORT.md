# Graph Report - wajeezsd  (2026-07-14)

## Corpus Check
- 259 files · ~1,199,282 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4533 nodes · 9793 edges · 233 communities (159 shown, 74 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 774 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a963b4cf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 97
- Community 100
- Community 102
- Community 107
- Community 108
- Community 109
- Community 111
- Community 112
- Community 114
- Community 115
- Community 119
- Community 120
- Community 121
- Community 123
- Community 124
- Community 126
- Community 127
- Community 129
- Community 130
- Community 131
- Community 132
- Community 134
- Community 138
- Community 139
- Community 142
- Community 143
- Community 144
- Community 146
- Community 150
- Community 151
- Community 152
- Community 153
- Community 156
- Community 157
- Community 158
- Community 160
- Community 161
- Community 162
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- Community 172
- Community 176
- Community 177
- Community 181
- Community 182
- Community 183
- Community 185
- Community 186
- Community 187
- Community 188
- Community 191
- Community 192
- Community 193
- Community 194
- Community 195
- Community 197
- Community 198
- Community 199
- Community 200
- Community 201
- Community 207
- Community 208
- Community 209
- Community 210
- Community 211
- Community 213
- Community 214
- Community 216
- Community 221
- Community 223
- Community 224
- Community 225
- Community 226
- Community 230
- Community 232
- Community 233
- Community 234
- Community 235
- Community 237
- Community 238
- Community 239
- Community 256
- Community 257
- Community 260
- Community 261
- Community 262
- Community 263
- Community 264
- Community 265
- Community 266
- Community 268
- Community 269
- Community 272
- Community 273
- Community 274
- Community 275
- Community 276
- Community 277
- Community 278
- Community 279
- Community 280
- Community 281
- Community 282
- Community 283

## God Nodes (most connected - your core abstractions)
1. `n()` - 61 edges
2. `an()` - 61 edges
3. `n()` - 61 edges
4. `an()` - 61 edges
5. `ns()` - 55 edges
6. `ns()` - 55 edges
7. `s()` - 54 edges
8. `s()` - 54 edges
9. `o()` - 49 edges
10. `o()` - 49 edges

## Surprising Connections (you probably didn't know these)
- `loadHomeBanners()` --indirect_call--> `banner()`  [INFERRED]
  android/app/src/main/assets/public/js/home-banners.js → scripts/split-admin.js
- `vo()` --references--> `io`  [EXTRACTED]
  android/app/src/main/assets/public/vendor/chartjs/chart.umd.min.js → index.js
- `loadHomeBanners()` --indirect_call--> `banner()`  [INFERRED]
  public_html/js/home-banners.js → scripts/split-admin.js
- `recordStockMovement()` --references--> `StockMovement`  [EXTRACTED]
  utils/erpHelpers.js → routes/merchant-erp.js
- `recordLedgerEntry()` --references--> `ShopLedger`  [EXTRACTED]
  utils/erpHelpers.js → routes/merchant-erp.js

## Import Cycles
- None detected.

## Communities (233 total, 74 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (29): ExpenseSchema, mongoose, mongoose, PosSaleSchema, mongoose, SettlementRequestSchema, mongoose, ShopLedgerSchema (+21 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (61): As(), average(), be(), beforeDatasetDraw(), beforeDatasetsDraw(), Bi(), dataset(), destroy() (+53 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (56): ao(), As(), average(), be(), beforeDatasetDraw(), beforeDatasetsDraw(), beforeDraw(), beforeLayout() (+48 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (84): adminLogSchema, mongoose, mongoose, ratingSchema, mongoose, SessionRequestSchema, AdminLog, adminLoginLimiter (+76 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (9): bn, ei(), je(), pn(), qe(), ti(), un(), xn() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (61): M(), a(), aa(), ai(), ao(), at(), b(), beforeDraw() (+53 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (59): _(), a(), aa(), ai(), at(), b(), bo, cn() (+51 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (22): beforeUpdate(), bn, buildTicks(), ei(), go(), ii(), initialize(), je() (+14 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (21): addBox(), addElements(), afterDatasetsUpdate(), an(), configure(), generateLabels(), Ie(), ke() (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (19): Ae(), afterDraw(), afterEvent(), Ci(), Do(), eo(), f(), gs() (+11 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (8): beforeUpdate(), go(), ii(), initialize(), ns(), parse(), rt(), updateRangeFromParsed()

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (21): BannerSchema, mongoose, AdminLog, Banner, bcrypt, express, imageCompression, jwt (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (61): addNotification(), allCaptains, allOrders, allUsers, applyAdminPermissionsUI(), approveCaptain(), canAccessPage(), captainMarkers (+53 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (18): afterDatasetsUpdate(), an(), ct(), fs(), ge(), generateLabels(), ke(), Mn() (+10 more)

### Community 15 - "Community 15"
Cohesion: 0.06
Nodes (61): addNotification(), allCaptains, allOrders, allUsers, applyAdminPermissionsUI(), approveCaptain(), canAccessPage(), captainMarkers (+53 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (20): emergencyAlertSchema, mongoose, AdminLog, Banner, bcrypt, express, jwt, { logAdminAction } (+12 more)

### Community 17 - "Community 17"
Cohesion: 0.10
Nodes (19): 1. المبادئ الحاكمة, 2.1 تعديل `models/Product.js` (الأرباح والمخزون), 2.2 تعديل `models/ShopOrder.js` (تثبيت التكلفة), 2.3 نموذج جديد `models/StockMovement.js` (سجل حركة المخزون), 2.4 نموذج جديد `models/Expense.js` (المصروفات), 2.5 نموذج جديد `models/ShopLedger.js` (دفتر الأستاذ المالي / كشف الحساب), 2. تغييرات نموذج البيانات, 3. نقاط الربط في الكود الحالي (Hooks) (+11 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (48): adminMapLocateMe(), _adminProducts, adminReverseFillAddress(), adminReverseFillNominatim(), adminToken(), allCategories, autoExtractCoords(), clearEditMenuImage() (+40 more)

### Community 20 - "Community 20"
Cohesion: 0.07
Nodes (48): adminMapLocateMe(), _adminProducts, adminReverseFillAddress(), adminReverseFillNominatim(), adminToken(), allCategories, autoExtractCoords(), clearEditMenuImage() (+40 more)

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (9): validate(), { ZodError }, loginSchema, registerSchema, { z }, AppError, asyncHandler, { registerSchema, loginSchema } (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.16
Nodes (12): assetHashes, bumpServiceWorker(), CHECK_ONLY, crypto, fs, hashAssets(), html, path (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.07
Nodes (19): Ae(), afterDraw(), afterEvent(), Ci(), Ee(), f(), gs(), ki() (+11 more)

### Community 24 - "Community 24"
Cohesion: 0.08
Nodes (4): Ni, Nn, q, remove()

### Community 25 - "Community 25"
Cohesion: 0.07
Nodes (43): addErr(), approximateBelowMaximumCanvasSizeOfBrowser(), canvasToFile(), cleanupCanvasMemory(), compress(), compressOnWebWorker(), compressPNG(), D() (+35 more)

### Community 26 - "Community 26"
Cohesion: 0.06
Nodes (44): addErr(), approximateBelowMaximumCanvasSizeOfBrowser(), canvasToFile(), cleanupCanvasMemory(), compress(), compressOnWebWorker(), compressPNG(), D() (+36 more)

### Community 27 - "Community 27"
Cohesion: 0.14
Nodes (13): 1. نظرة عامة على المشروع (Overview), 2. التقنيات المستخدمة (Tech Stack), 3. هيكل المشروع (Project Structure), 4. الأنظمة الأساسية وتفاصيلها (Core Systems), 5. إعدادات بيئة العمل (Environment Setup), 6. التعامل مع الواجهة الأمامية و Capacitor (Frontend & Mobile), 7. أمن وحماية النظام (Security Notes), أ. نظام المستخدمين والأدوار (Users & Roles) (+5 more)

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (11): اللقطات, سكربت التعليق الصوتي الكامل (للتسجيل — 38 ثانية تقريباً), سيناريو إعلان وجيز — 40 ثانية، 7 لقطات, لقطة 1 — الخطّاف (5 ث), لقطة 2 — الحاجة (5 ث), لقطة 3 — التطبيق (5 ث), لقطة 4 — المتجر (5 ث), لقطة 5 — المندوب (5 ث) ⭐ لقطة الاختبار الأولى (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.08
Nodes (19): ca(), _calculateBarIndexPixels(), _calculateBarValuePixels(), Do(), eo(), getBasePixel(), getLabelAndValue(), getLabelForValue() (+11 more)

### Community 32 - "Community 32"
Cohesion: 0.05
Nodes (45): adminCanActOnUser(), adminOnly(), clientOnly(), getAdminCityFilter(), jwt, protect(), requireAnyPermission(), requirePermission() (+37 more)

### Community 33 - "Community 33"
Cohesion: 0.09
Nodes (45): ae(), Be(), Bt(), Ce(), D(), ee(), F(), Fe() (+37 more)

### Community 34 - "Community 34"
Cohesion: 0.09
Nodes (43): ae(), Be(), Bt(), Ce(), D(), ee(), F(), Fe() (+35 more)

### Community 35 - "Community 35"
Cohesion: 0.08
Nodes (39): A(), Ae(), B(), Be(), c(), $e(), ee(), F() (+31 more)

### Community 36 - "Community 36"
Cohesion: 0.08
Nodes (39): $(), Ae(), B(), Be(), c(), $e(), ee(), F() (+31 more)

### Community 37 - "Community 37"
Cohesion: 0.18
Nodes (10): إعدادات موحّدة, برومبتات Higgsfield — إعلان وجيز, خطة الصرف (الرصيد الحالي: 160 كريدت), لقطة 1 — الخطّاف, لقطة 2 — الحاجة, لقطة 3 — التطبيق (image-to-video), لقطة 4 — المتجر, لقطة 5 — المندوب ⭐ (لقطة الاختبار الأولى) (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.08
Nodes (3): ft, getSelectorFromElement(), ln

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (12): ce(), ct(), de, dt(), fs(), ge(), he(), ms() (+4 more)

### Community 41 - "Community 41"
Cohesion: 0.20
Nodes (9): 1. البراند, 2. الميزات المسموح ذكرها (من الكود مباشرة — لا اختراع), 3. التوطين السوداني (يدخل في كل مشهد), 4. قواعد الدقة (أولوية المستخدم رقم 1), الألوان (بالأكواد — تدخل في البرومبتات والمونتاج), الخط, الشعارات (أصول حقيقية — لا تولَّد بالـ AI أبداً), ممنوع ذكره (غير موجود أو غير مؤكد) (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.10
Nodes (20): axios, bcrypt, express, jwt, logger, loginLimiter, nodemailer, { normalizePhone } (+12 more)

### Community 43 - "Community 43"
Cohesion: 0.05
Nodes (44): mongoose, NotificationSchema, AdminLog, Banner, bcrypt, express, jwt, { logAdminAction } (+36 more)

### Community 44 - "Community 44"
Cohesion: 0.20
Nodes (9): 1. شروط الأهلية والتسجيل, 2. تسعير المنتجات وجودتها, 3. استقبال وتجهيز الطلبات, 4. العمولات والمعاملات المالية, 5. المنتجات والأنشطة المحظورة, 6. إلغاء الطلبات والنزاعات, 7. السرية وحماية بيانات العملاء, 8. التعديلات وإنهاء الخدمة (+1 more)

### Community 46 - "Community 46"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 47 - "Community 47"
Cohesion: 0.06
Nodes (14): beforeLayout(), buildLookupTable(), En, Fo(), _generate(), getDecimalForValue(), _getTimestampsForTable(), init() (+6 more)

### Community 48 - "Community 48"
Cohesion: 0.07
Nodes (63): jn, a(), ae(), at(), bt(), C(), ce(), ct() (+55 more)

### Community 49 - "Community 49"
Cohesion: 0.05
Nodes (41): marketerSchema, mongoose, merchantRequestSchema, mongoose, mongoose, PlaceCategorySchema, express, { logAdminAction } (+33 more)

### Community 50 - "Community 50"
Cohesion: 0.22
Nodes (7): MessageSchema, mongoose, express, jwt, logger, Message, router

### Community 51 - "Community 51"
Cohesion: 0.25
Nodes (7): أدوات التجميع, الترتيب والمدد, الخاتمة (لقطة 7 — تُصنع لا تولَّد), الصوت, النصوص الظاهرة (تضاف في المونتاج — ليست من الـ AI), دليل تجميع إعلان وجيز (المونتاج النهائي), فحص الجودة قبل النشر

### Community 52 - "Community 52"
Cohesion: 0.04
Nodes (42): logger, mongoose, activeUsers, apiRoutes, app, approvedOrigins, captainRoutes, chatRooms (+34 more)

### Community 53 - "Community 53"
Cohesion: 0.29
Nodes (6): 1) قيّد المفتاح في Google Cloud Console, 2) راقب الاستخدام والفوترة, 3) بعد إنشاء مفاتيح جديدة, أ. تقييد التطبيقات (Application restrictions), ب. تقييد الـ APIs (API restrictions), 🔐 تأمين مفتاح Google Maps API

### Community 54 - "Community 54"
Cohesion: 0.07
Nodes (10): bt, color(), Cs, Ft(), It(), te(), wt(), Xt() (+2 more)

### Community 55 - "Community 55"
Cohesion: 0.06
Nodes (66): ce(), de, he(), jn, a(), ae(), at(), bt() (+58 more)

### Community 56 - "Community 56"
Cohesion: 0.07
Nodes (17): bt, color(), Ee(), Ft(), It(), jt(), kt(), Le() (+9 more)

### Community 57 - "Community 57"
Cohesion: 0.05
Nodes (17): io, buildLookupTable(), En, Fo(), _generate(), getDecimalForValue(), _getTimestampsForTable(), init() (+9 more)

### Community 58 - "Community 58"
Cohesion: 0.05
Nodes (37): requireCity(), VALID_CITIES, mongoose, referralSchema, createOrderLimiter, express, logger, negotiateLimiter (+29 more)

### Community 59 - "Community 59"
Cohesion: 0.10
Nodes (18): ca(), _calculateBarIndexPixels(), _calculateBarValuePixels(), getBasePixel(), getLabelAndValue(), getLabelForValue(), getPixelForValue(), _getRuler() (+10 more)

### Community 60 - "Community 60"
Cohesion: 0.38
Nodes (5): getVerificationEmailTemplate(), { getVerificationEmailTemplate }, logger, nodemailer, sendEmail()

### Community 62 - "Community 62"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 63 - "Community 63"
Cohesion: 0.15
Nodes (11): ComplaintSchema, mongoose, replySchema, Complaint, express, logger, Order, { protect, adminOnly } (+3 more)

### Community 64 - "Community 64"
Cohesion: 0.12
Nodes (15): captainPhotoStorage, captainPhotoUpload, dirs, express, fs, jimpModule, mongoose, multer (+7 more)

### Community 65 - "Community 65"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 66 - "Community 66"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 67 - "Community 67"
Cohesion: 0.06
Nodes (33): captainOnly(), debtAdjustmentSchema, mongoose, mongoose, PaymentRequestSchema, logger, mongoose, settingsSchema (+25 more)

### Community 68 - "Community 68"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 69 - "Community 69"
Cohesion: 0.50
Nodes (3): axios, logger, sendSmsOTP()

### Community 70 - "Community 70"
Cohesion: 0.10
Nodes (18): dt(), e(), emit(), En, Ft(), _getHandlersByEventName(), _main(), mt() (+10 more)

### Community 71 - "Community 71"
Cohesion: 0.05
Nodes (41): merchantOnly(), mongoose, OrderSchema, mongoose, ProductSchema, mongoose, PromoCodeSchema, mongoose (+33 more)

### Community 72 - "Community 72"
Cohesion: 0.10
Nodes (18): dt(), e(), emit(), En, Ft(), _getHandlersByEventName(), _main(), mt() (+10 more)

### Community 75 - "Community 75"
Cohesion: 0.17
Nodes (26): a(), ae(), c(), Ce(), d(), e(), Ee(), f() (+18 more)

### Community 77 - "Community 77"
Cohesion: 0.17
Nodes (26): a(), ae(), c(), Ce(), d(), e(), Ee(), f() (+18 more)

### Community 79 - "Community 79"
Cohesion: 0.11
Nodes (25): adminName, adminNameEl, animateValue(), approveCaptain(), closeEditOrderModal(), closeEditUserModal(), closeModal(), createCaptain() (+17 more)

### Community 80 - "Community 80"
Cohesion: 0.11
Nodes (25): adminName, adminNameEl, animateValue(), approveCaptain(), closeEditOrderModal(), closeEditUserModal(), closeModal(), createCaptain() (+17 more)

### Community 82 - "Community 82"
Cohesion: 0.08
Nodes (20): loadHomeBanners(), resolveBannerHref(), loadHomeBanners(), resolveBannerHref(), banner(), cacheBlock, cacheBlockLines, cacheLineSet (+12 more)

### Community 83 - "Community 83"
Cohesion: 0.08
Nodes (3): Ui, W, $

### Community 84 - "Community 84"
Cohesion: 0.08
Nodes (4): $, focusableChildren(), vi, W

### Community 85 - "Community 85"
Cohesion: 0.06
Nodes (21): mongoose, PlaceSchema, express, fs, logger, path, Place, Product (+13 more)

### Community 86 - "Community 86"
Cohesion: 0.06
Nodes (32): bcrypt, mongoose, UserSchema, { VEHICLE_VALUES }, EmergencyAlert, express, logger, { protect } (+24 more)

### Community 87 - "Community 87"
Cohesion: 0.09
Nodes (26): calculateDistance(), calculatePrice(), _darkMapStyles, dropoffAddrEl, fetchPricingConfig(), getToken(), hideMapLoading(), initMap() (+18 more)

### Community 89 - "Community 89"
Cohesion: 0.11
Nodes (4): addElements(), nn(), sn, tn

### Community 90 - "Community 90"
Cohesion: 0.09
Nodes (26): calculateDistance(), calculatePrice(), _darkMapStyles, dropoffAddrEl, fetchPricingConfig(), getToken(), hideMapLoading(), initMap() (+18 more)

### Community 97 - "Community 97"
Cohesion: 0.10
Nodes (3): ci, Ge(), Ze()

### Community 102 - "Community 102"
Cohesion: 0.14
Nodes (11): Override, MainActivity, WebAppDownloader, Override, WassiliFCMService, BridgeActivity, Bundle, FirebaseMessagingService (+3 more)

### Community 108 - "Community 108"
Cohesion: 0.16
Nodes (4): Cs, nn(), os(), sn

### Community 109 - "Community 109"
Cohesion: 0.13
Nodes (18): clearSearch(), closeDropdown(), highlight(), highlightCaptain(), initMapLogic(), loadedOnInit, loadInitialCaptains(), MarkerPool (+10 more)

### Community 111 - "Community 111"
Cohesion: 0.13
Nodes (18): clearSearch(), closeDropdown(), highlight(), highlightCaptain(), initMapLogic(), loadedOnInit, loadInitialCaptains(), MarkerPool (+10 more)

### Community 112 - "Community 112"
Cohesion: 0.08
Nodes (8): afterUpdate(), buildTicks(), d(), determineDataLimits(), Di(), po(), tt(), xa

### Community 114 - "Community 114"
Cohesion: 0.10
Nodes (20): dependencies, axios, bcryptjs, canvas, cors, dotenv, express, express-mongo-sanitize (+12 more)

### Community 119 - "Community 119"
Cohesion: 0.24
Nodes (18): apiBase(), buildOverlay(), clearRecent(), close(), doSearch(), esc(), fmtPrice(), getCity() (+10 more)

### Community 120 - "Community 120"
Cohesion: 0.11
Nodes (19): devDependencies, @capacitor/android, @capacitor/app, @capacitor/assets, @capacitor/cli, @capacitor-community/background-geolocation, @capacitor-community/keep-awake, @capacitor/core (+11 more)

### Community 121 - "Community 121"
Cohesion: 0.24
Nodes (18): apiBase(), buildOverlay(), clearRecent(), close(), doSearch(), esc(), fmtPrice(), getCity() (+10 more)

### Community 126 - "Community 126"
Cohesion: 0.15
Nodes (9): bind(), calculateHaversineDistance(), CAT_COLORS, fetchCategories(), getUserLocation(), loadPlaces(), _openDeepLinkedCategory(), placesData (+1 more)

### Community 127 - "Community 127"
Cohesion: 0.15
Nodes (9): bind(), calculateHaversineDistance(), CAT_COLORS, fetchCategories(), getUserLocation(), loadPlaces(), _openDeepLinkedCategory(), placesData (+1 more)

### Community 129 - "Community 129"
Cohesion: 0.26
Nodes (15): addDotMarker(), cachedZones, clearZoneFully(), drawnPoints, drawZonesFromCache(), fetchZoneForCity(), finishDrawing(), initAdminMap() (+7 more)

### Community 130 - "Community 130"
Cohesion: 0.12
Nodes (15): background_color, categories, description, dir, display, icons, id, lang (+7 more)

### Community 131 - "Community 131"
Cohesion: 0.26
Nodes (15): addDotMarker(), cachedZones, clearZoneFully(), drawnPoints, drawZonesFromCache(), fetchZoneForCity(), finishDrawing(), initAdminMap() (+7 more)

### Community 132 - "Community 132"
Cohesion: 0.12
Nodes (15): background_color, categories, description, dir, display, icons, id, lang (+7 more)

### Community 134 - "Community 134"
Cohesion: 0.12
Nodes (12): express, router, extra, missing, newList, newRouter, newSet, newSorted (+4 more)

### Community 138 - "Community 138"
Cohesion: 0.06
Nodes (13): addBox(), bo, configure(), determineDataLimits(), dt(), getValueForPixel(), j(), ko (+5 more)

### Community 139 - "Community 139"
Cohesion: 0.06
Nodes (5): Ni, Nn, q, remove(), zi

### Community 142 - "Community 142"
Cohesion: 0.22
Nodes (3): N(), parents(), trigger()

### Community 146 - "Community 146"
Cohesion: 0.23
Nodes (12): FOREGROUND_SIZES, fs, ICONS_DIR, LAUNCHER_SIZES, main(), makeIconWithPadding(), makeNotificationIcon(), makeWhiteBackground() (+4 more)

### Community 150 - "Community 150"
Cohesion: 0.10
Nodes (5): afterUpdate(), d(), Di(), kn(), xa

### Community 151 - "Community 151"
Cohesion: 0.23
Nodes (6): a(), b(), d(), g(), r(), s()

### Community 152 - "Community 152"
Cohesion: 0.17
Nodes (11): author, description, engines, node, npm, keywords, license, main (+3 more)

### Community 153 - "Community 153"
Cohesion: 0.23
Nodes (6): a(), b(), d(), g(), r(), s()

### Community 162 - "Community 162"
Cohesion: 0.22
Nodes (4): Auth, copyToClipboard(), exportCSV(), showToast()

### Community 166 - "Community 166"
Cohesion: 0.39
Nodes (8): AppCore, ImpactStyle, PageTransition, requestLocation(), requestPush(), _showManualSettingsAlert(), _webNotificationFallback(), withTimeout()

### Community 167 - "Community 167"
Cohesion: 0.44
Nodes (8): bumpUnreadBadge(), initNotificationSocket(), playNotificationSound(), refreshUnreadBadge(), renderUnreadBadge(), _setChatMerchantBadge(), showToast(), _tryInit()

### Community 169 - "Community 169"
Cohesion: 0.22
Nodes (9): foldersToCompress, fs, jimpModule, path, processImage(), run(), uploadsDir, jimp (+1 more)

### Community 170 - "Community 170"
Cohesion: 0.39
Nodes (8): AppCore, ImpactStyle, PageTransition, requestLocation(), requestPush(), _showManualSettingsAlert(), _webNotificationFallback(), withTimeout()

### Community 171 - "Community 171"
Cohesion: 0.44
Nodes (8): bumpUnreadBadge(), initNotificationSocket(), playNotificationSound(), refreshUnreadBadge(), renderUnreadBadge(), _setChatMerchantBadge(), showToast(), _tryInit()

### Community 176 - "Community 176"
Cohesion: 0.57
Nodes (6): captainPin(), pt(), svgUrl(), sz(), teardropPin(), userDotIcon()

### Community 177 - "Community 177"
Cohesion: 0.57
Nodes (6): captainPin(), pt(), svgUrl(), sz(), teardropPin(), userDotIcon()

### Community 181 - "Community 181"
Cohesion: 0.48
Nodes (5): init(), isDismissed(), isIOS(), isStandalone(), showIOSPrompt()

### Community 182 - "Community 182"
Cohesion: 0.48
Nodes (5): init(), isDismissed(), isIOS(), isStandalone(), showIOSPrompt()

### Community 183 - "Community 183"
Cohesion: 0.29
Nodes (6): b64, fs, imgPath, outPath, path, routeCode

### Community 185 - "Community 185"
Cohesion: 0.40
Nodes (4): compressBtn, pollCompressStatus(), renderCompressState(), token

### Community 187 - "Community 187"
Cohesion: 0.40
Nodes (4): compressBtn, pollCompressStatus(), renderCompressState(), token

### Community 191 - "Community 191"
Cohesion: 0.60
Nodes (3): ExampleInstrumentedTest, Test, RunWith

### Community 192 - "Community 192"
Cohesion: 0.70
Nodes (4): _fetchWebConfig(), _initFirebaseWeb(), refreshAdminWebPushToken(), registerAdminWebPush()

### Community 193 - "Community 193"
Cohesion: 0.60
Nodes (3): apiBase(), getMapsApiKey(), loadGoogleMaps()

### Community 195 - "Community 195"
Cohesion: 0.70
Nodes (4): injectVars(), measureInsets(), padElement(), setup()

### Community 197 - "Community 197"
Cohesion: 0.29
Nodes (7): scripts, build, cache, cache:check, dev, start, test

### Community 198 - "Community 198"
Cohesion: 0.70
Nodes (4): _fetchWebConfig(), _initFirebaseWeb(), refreshAdminWebPushToken(), registerAdminWebPush()

### Community 199 - "Community 199"
Cohesion: 0.60
Nodes (3): apiBase(), getMapsApiKey(), loadGoogleMaps()

### Community 201 - "Community 201"
Cohesion: 0.70
Nodes (4): injectVars(), measureInsets(), padElement(), setup()

### Community 207 - "Community 207"
Cohesion: 0.83
Nodes (3): hasExistingToggle(), scan(), wrapField()

### Community 210 - "Community 210"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 213 - "Community 213"
Cohesion: 0.83
Nodes (3): hasExistingToggle(), scan(), wrapField()

## Knowledge Gaps
- **893 isolated node(s):** `adminName`, `adminNameEl`, `token`, `MarkerPool`, `loadedOnInit` (+888 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **74 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `io` connect `Community 57` to `Community 1`, `Community 52`, `Community 47`?**
  _High betweenness centrality (0.336) - this node is a cross-community bridge._
- **Why does `vo()` connect `Community 1` to `Community 57`?**
  _High betweenness centrality (0.240) - this node is a cross-community bridge._
- **Why does `vo()` connect `Community 57` to `Community 2`?**
  _High betweenness centrality (0.233) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `n()` (e.g. with `ai()` and `cn()`) actually correct?**
  _`n()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **Are the 26 inferred relationships involving `n()` (e.g. with `_()` and `ai()`) actually correct?**
  _`n()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **What connects `adminName`, `adminNameEl`, `token` to the rest of the system?**
  _894 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05547652916073969 - nodes in this community are weakly interconnected._