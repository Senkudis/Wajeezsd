# برومبتات Higgsfield — إعلان وجيز
> الموديل الأساسي: **Seedance 2.0** (يدعم 9:16، مراجع صور لثبات الهوية، صوت محيطي أصلي).
> البديل للقطات الحركة: Kling 3.0.
> كل التوليد بنسبة **9:16**. التجارب بوضع `fast` 720p، والاعتماد النهائي `std` 1080p.

## إعدادات موحّدة
- **aspect_ratio:** 9:16
- **duration:** 5 ثوانٍ
- **generate_audio:** true (صوت محيطي فقط — لا كلام؛ التعليق الصوتي يضاف في المونتاج)
- **Style suffix (يُلحق بكل برومبت):**
  `Cinematic realism, warm golden-hour light with soft dust haze, Khartoum Sudan, natural African skin tones, shallow depth of field, smooth camera motion, brand palette accents of deep green (#04553A) and warm gold, vertical 9:16 composition.`
- **Negative prompt (موحّد):**
  `on-screen text, captions, subtitles, watermarks, generated logos, Arabic lettering, distorted faces, extra fingers, deformed hands, western suburban houses, snow, skyscrapers, low quality, oversaturated`

> **قاعدة:** لا نطلب من الموديل كتابة أي نص أو رسم شعار — النصوص والشعار في المونتاج حصراً.

---

## لقطة 1 — الخطّاف
**Prompt:**
`Forward-tracking street-level shot moving through a busy Khartoum avenue at sunset: neem trees lining the road, motorcycles and a blue rickshaw (tuk-tuk) passing, Sudanese pedestrians in white jallabiyas and casual clothes crossing, golden dust glowing in backlight, market stalls at the edges, lively but warm atmosphere.` + Style suffix

## لقطة 2 — الحاجة
**Prompt:**
`Interior scene, late afternoon: a young Sudanese man in his twenties sits on a sofa in a modest warm living room, ceiling fan spinning above, he glances toward an almost empty kitchen shelf then looks at his phone with a mild frustrated smile, soft golden window light, homely Sudanese interior details.` + Style suffix

## لقطة 3 — التطبيق (image-to-video)
**المرجع:** لقطة شاشة حقيقية من صفحة المتجر (shop-detail) تُرفع عبر `media_upload` وتُستخدم `start_image`/`image_references`.
**Prompt:**
`Close-up of a hand holding a smartphone displaying the exact app interface from the reference image, thumb taps the screen naturally, subtle screen glow on the fingers, blurred warm living-room background, the phone UI stays crisp and unchanged from the reference.` + Style suffix

## لقطة 4 — المتجر
**Prompt:**
`A cheerful middle-aged Sudanese shopkeeper in a small neighborhood grocery store packs items into a paper bag and smiles, wearing a deep green apron, neatly stacked shelves behind him, warm tungsten shop lighting mixed with daylight from the entrance, authentic Sudanese market character.` + Style suffix

## لقطة 5 — المندوب ⭐ (لقطة الاختبار الأولى)
**Prompt:**
`Side-tracking shot of a young Sudanese delivery rider on a motorcycle riding through a Khartoum street at golden hour, wearing a deep green (#04553A) delivery uniform and helmet, a matching deep green delivery box with a gold arrow emblem mounted on the back, Nile bridge silhouette in the far background, light traffic and neem trees passing by, confident energetic ride, dust particles glowing in the sunset light.` + Style suffix
**ملاحظة:** عند نجاحها، يُحفظ فريم واضح للمندوب ويُستخدم `image_references` في لقطة 6 لثبات الشخصية.

## لقطة 6 — التتبع والوصول (image-to-video + مرجع شخصية)
**المراجع:** لقطة شاشة حقيقية من صفحة التتبع (خريطة حية) + فريم المندوب من لقطة 5.
**Prompt:**
`Over-the-shoulder view: a hand holds a smartphone showing the live delivery tracking map from the reference image, then the camera tilts up as a house door opens and the same Sudanese delivery rider from the reference (deep green uniform, helmet under his arm) hands over a paper bag with a warm smile, golden light spilling through the doorway, friendly handshake-like exchange.` + Style suffix

## لقطة 7 — الخاتمة
**لا توليد AI** — تُبنى في المونتاج من `logo-white.png` على تدرج أخضر `#04553A` (انظر `03-assembly.md`).

---

## خطة الصرف (الرصيد الحالي: 160 كريدت)
| مرحلة | ماذا | الوضع |
|---|---|---|
| اختبار | لقطة 5 فقط | fast / 720p |
| مراجعة | ضبط البرومبتات حسب النتيجة | — |
| إنتاج | اللقطات المعتمدة واحدة-واحدة | fast ثم std للنهائي حسب الرصيد |

- قبل كل توليد: التحقق من الكلفة، وبعده: `balance`.
- عند اقتراب النفاد: توقف وإبلاغ (تقليص لقطات أو شحن) — لا صرف أعمى.
