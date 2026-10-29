# يولّد edit.json (للتجميع والموسيقى) و edit.js (لطبقة الموشن) من segs.json وتوقيتات الكلمات.
# الترجمة مكتوبة يدوياً باللهجة الصحيحة، وكل مقطع مربوط بمدى كلمات من تفريغ Whisper (src/edit_words.json).
import json

W0 = json.load(open('src/edit_words.json', encoding='utf-8'))
SEGS = json.load(open('segs.json'))
# التوقيتات مأخوذة من تفريغ القصّة السابقة (OLD_SEGS)؛ نحوّلها لزمن المصدر ثم للقصّة الحالية
OLD_SEGS = [[1.10, 6.10], [6.80, 11.58], [16.16, 21.70], [22.10, 23.48], [25.78, 33.50], [34.64, 37.44]]
def to_src(t, segs):
    acc = 0
    for a, b in segs:
        if t <= acc + (b - a) + 1e-6: return a + t - acc
        acc += b - a
    return segs[-1][1]
def to_out(x, segs):
    acc = 0
    for a, b in segs:
        if a - .15 <= x <= b + 1e-6: return acc + max(0, x - a)   # كلمة تبدأ قبل القطع بقليل تُثبَّت على بدايته
        acc += b - a
    return None
W = []
for w, s0, e0 in W0:
    s1, e1 = to_out(to_src(s0, OLD_SEGS), SEGS), to_out(to_src(e0, OLD_SEGS), SEGS)
    W.append([w, s1, e1])  # None = كلمة محذوفة في القصّة الحالية
SPEECH = sum(b - a for a, b in SEGS)
END = round(SPEECH + .15, 2)          # بداية بطاقة النهاية
DUR = round(END + 2.9, 2)

# (نص الترجمة، أول كلمة، آخر كلمة، كلمات مميّزة بالذهبي، كبير؟)
CAP = [
    ('يا إبراهيم، كيف!', 0, 2, ['إبراهيم،'], True),
    ('أنا جاي من السعودية', 3, 6, ['السعودية'], False),
    ('لا هنا عندكم تطبيقات توصيل؟', 7, 11, ['توصيل؟'], False),
    ('أمشي السوق', 17, 21, [], False),
    ('في الزحمة والبنزين الغالي', 22, 24, [], False),
    ('والصفوف دي', 25, 26, [], False),
    ('أسوي شنو؟ عندك حل؟', 27, 30, ['حل؟'], True),
    ('حلّك فيه تطبيق وجيز', 31, 34, ['وجيز'], True),
    ('تطبيق وجيز', 35, 36, ['وجيز'], False),
    ('تطبيق بسيط وسهل', 37, 39, [], False),
    ('وبسيط جداً', 40, 41, [], False),
    ('بيتيح ليك خدمة التوصيل', 42, 44, [], False),
    ('السريع والمضمون', 45, 46, ['السريع', 'والمضمون'], False),
    ('وكمان تتابع الطرد بتاعك', 47, 50, [], False),
    ('لحدّي ما يصلك مع الكابتن', 51, 55, ['الكابتن'], False),
    ('وكمان بتقدر تحدد السعر بتاعك', 56, 61, ['السعر'], False),
    ('جوّه التطبيق', 62, 64, [], False),
    ('والواجهة بتاعتو', 65, 66, [], False),
    ('بسيطة وسهلة جداً', 67, 69, [], False),
    ('رأيك شنو بعد كده؟', 70, 73, [], False),
    ('حمّل تطبيق وجيز', 74, 76, ['وجيز'], True),
    ('وأمورك واضحة', 77, 78, [], True),
]

Q_LAST = 'أسوي شنو؟ عندك حل؟'   # آخر جملة للشخص من وراء الكاميرا
def caption(text, i0, i1, hl, big):
    s, e = W[i0][1], W[i1][2]
    if s is None: s = W[i0 + 1][1]          # الكلمة الأولى بدأت داخل فجوة محذوفة
    if e is None: e = W[i1 - 1][2]
    words = text.split()
    # وزّع زمن المقطع على الكلمات حسب طولها (أدقّ من ربط كلمة بكلمة لأن الكتابة تختلف عن التفريغ)
    L = [len(w) + 2 for w in words]; tot = sum(L); out = []; t = s
    for w, l in zip(words, L):
        d = (e - s) * l / tot; out.append({'w': w, 's': round(t, 3), 'e': round(t + d, 3), 'hl': 1 if w in hl else 0}); t += d
    return {'s': round(s, 3), 'e': round(e, 3), 'words': out, 'big': big}

caps = []
qmode = True
for c in CAP:
    cc = caption(*c); cc['q'] = 1 if qmode else 0; caps.append(cc)
    if c[0] == Q_LAST: qmode = False

# امنع التداخل: نهاية كل مقطع ≤ بداية التالي
for a, b in zip(caps, caps[1:]): a['e'] = min(a['e'], b['s'] - .02)
caps[0]['s'] = 0   # الترجمة الأولى ظاهرة كاملة من الإطار الأول
caps[-1]['e'] = END + .35   # آخر جملة تبقى حتى مسح بطاقة النهاية   # الإطار الأول نظيف: العنوان وحده (صورة مصغّرة)

T = lambda i: W[i][1]
TE = lambda i: W[i][2]
# ── v3: لا شيء فوق المتكلّم. المعلومة البصرية = مشهد كامل قصير، ثم عودة للوجه ──
CUT_B = round(SEGS[0][1] - SEGS[0][0], 3)   # القطع بعد «تطبيقات توصيل»: يبدأ عنده مشهد المشكلة فيخفي القفزة في وجه المستمع
scenes = [
    # بطاقة واحدة تتشكّل (لا تُقطع): السوق ← الزحمة ← البنزين ← الصفوف ← «عندك حل؟»، كل تحوّل على كلمته
    {'type': 'morph', 'tone': 'problem', 's': CUT_B, 'e': T(33), 'title': 'مشوار السوق بقى هم؟', 'accent': 'هم؟',
     'states': [[CUT_B, 'market'], [T(22), 'traffic'], [T(23), 'fuel'], [T(25), 'queue'], [T(27), 'q']]},
    {'type': 'logo', 's': T(33), 'e': T(37)},
    {'type': 'phone', 's': T(48), 'e': T(56), 'img': 'tracking', 'title': 'تابع طلبك لحدّي ما يصلك',
     'chip': {'icon': 'pin', 'text': 'الكابتن في الطريق إليك', 'dt': .7}},
    {'type': 'phone', 's': T(65), 'e': T(70), 'img': 'shopBrowse', 'title': 'واجهة بسيطة وسهلة', 'scroll': .35,
     'chip': {'icon': 'bag', 'text': 'اطلب من المتاجر', 'dt': .6}},
]
heads = [   # عناوين في فراغ الرأس أثناء لقطات المتكلّم فقط، كلٌّ بأيقونة من نفس المجموعة
    # الافتتاح: العنوان ظاهر من الإطار الأول (صورة مصغّرة)، والثاني يدخل على «لا هنا»
    {'s': -.4, 'e': CUT_B, 't': 'هنا ما في تطبيق توصيل؟', 'accent': 'توصيل؟', 'icon': 'phone', 'y': 330},
    {'s': T(37) + .05, 'e': T(42), 't': 'بسيط وسهل', 'icon': 'phone', 'y': 330},
    {'s': T(42), 'e': T(47), 't': 'توصيل سريع ومضمون', 'icon': 'zap', 'y': 330},
    {'s': T(58), 'e': T(65), 't': 'حدّد سعرك بنفسك', 'icon': 'tag', 'y': 330},
]
edit = {
    'dur': DUR, 'endcard': END, 'capY': 1500, 'qLabel': 'صاحبو', 'eye_y': 690,
    'bug': [T(37), END],
    'scenes': scenes, 'heads': heads,
    'cta': {'s': T(74), 'e': END + .6, 'y': 330, 'text': 'متوفّر على آيفون وأندرويد'},
    'images': ['tracking', 'shopBrowse'],
    'captions': caps,
    'endText1': 'حمّل التطبيق الآن', 'endText2': 'متوفّر على آيفون وأندرويد',
}

# ── مقاطع الفيديو: نقسم مقاطع الكلام عند بدايات الجمل لدفعات زووم (تغيير بصري كل 2–4 ث) ──
FACES = json.load(open('src/faces.json'))
def face_h(a, b):
    hs = [r[3] for r in FACES if a <= r[0] <= b]; hs.sort(); return hs[len(hs) // 2] if hs else 330
def src_of(t_out):
    acc = 0
    for a, b in SEGS:
        if t_out <= acc + (b - a) + 1e-6: return a + t_out - acc
        acc += b - a
    return SEGS[-1][1]
PUNCH_AT = [T(7), T(31), T(42), T(59), T(74)]          # «أسوي شنو» «حلّك» «بيتيح ليك» «تحدد» «حمّل»
PUNCH_K = 1.08                                           # دفعة خفيفة: التكبير الأكبر يُليّن الوجه (المصدر 1072 عرضاً)
punch_src = sorted(round(src_of(t), 3) for t in PUNCH_AT)
Z_OVERRIDE = {(0.8, 5.31): 1.30,    # الافتتاح أقرب: يخفّف إحساس الزاوية العالية
              (34.64, 35.46): 1.3}  # «رأيك شنو»: يُخرج الباب والكرسي من الكادر
FACE_OUT = 400                                           # ارتفاع الوجه المستهدف في الإطار (لقطة متوسطة قريبة)
segments = []
for a, b in SEGS:
    marks = [a] + [p for p in punch_src if a + .3 < p < b - .3] + [b]
    for k, (x0, x1) in enumerate(zip(marks, marks[1:])):
        base = min(1.4, max(1.04, FACE_OUT / face_h(x0, x1)))   # حجم الوجه من المقطع الفرعي نفسه
        punched = any(abs(x0 - p) < .01 for p in punch_src)
        z = base * (PUNCH_K if punched else 1.0)
        for (o0, o1), zz in Z_OVERRIDE.items():                     # تصحيحات اللجنة لمقاطع بعينها
            if abs(x0 - o0) < .01: z = zz
        segments.append({'s': round(x0, 3), 'e': round(x1, 3), 'z': round(z, 3)})
cuts, acc = [], 0
for a, b in SEGS[:-1]: acc += b - a; cuts.append(round(acc, 3))

F2 = 2 / 30   # الحركات تسبقها الـ whoosh بإطارين
sm = scenes[0]
sfx = [
       {'k': 'whoosh', 't': sm['s'] - F2, 'g': .55}]
sfx += [{'k': 'pop', 't': st[0], 'g': .6} for st in sm['states'][1:-1]]
sfx += [{'k': 'impact', 't': sm['states'][-1][0], 'g': .6}]
sfx += [{'k': 'whoosh', 't': sc['s'] - F2, 'g': .5} for sc in scenes[1:]]
sfx += [{'k': 'impact', 't': scenes[1]['s'] + .05, 'g': .7}]
sfx += [{'k': 'pop', 't': sc['s'] + sc['chip']['dt'], 'g': .45} for sc in scenes if sc.get('chip')]
sfx += [{'k': 'tick', 't': h['s'] + .02, 'g': .35} for h in heads[1:]]
sfx += [{'k': 'pop', 't': edit['cta']['s'], 'g': .5}, {'k': 'riser', 't': END, 'end': True, 'g': .45},
        {'k': 'impact', 't': END, 'g': .65}, {'k': 'ding', 't': END + 1.0, 'g': .5}]

edit.update({'segments': segments, 'audio_segs': SEGS, 'sfx': sfx, 'cuts': cuts, 'music_gain': .2, 'sfx_gain': .4})
json.dump(edit, open('edit.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open('edit.js', 'w', encoding='utf-8').write('window.EDIT = ' + json.dumps(edit, ensure_ascii=False) + ';\n')
print('speech', round(SPEECH, 2), 'endcard', END, 'dur', DUR, 'segments', [(x['s'], x['e'], x['z']) for x in segments])
