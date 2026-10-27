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
        if a - 1e-6 <= x <= b + 1e-6: return acc + x - a
        acc += b - a
    return None
W = []
for w, s0, e0 in W0:
    s1, e1 = to_out(to_src(s0, OLD_SEGS), SEGS), to_out(to_src(e0, OLD_SEGS), SEGS)
    W.append([w, s1, e1])  # None = كلمة محذوفة في القصّة الحالية
SPEECH = sum(b - a for a, b in SEGS)
END = round(SPEECH + .15, 2)          # بداية بطاقة النهاية
DUR = round(END + 4.2, 2)

# (نص الترجمة، أول كلمة، آخر كلمة، كلمات مميّزة بالذهبي، كبير؟)
CAP = [
    ('أنا جاي من السعودية', 3, 6, ['السعودية'], False),
    ('لا هنا عندكم تطبيقات توصيل', 7, 11, ['توصيل'], False),
    ('لا عندكم أي حاجة؟', 12, 15, [], False),
    ('كان داير لي حاجة', 16, 16, [], False),
    ('أمشي ليها السوق', 17, 21, ['السوق'], False),
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
caps[0]['s'] = max(caps[0]['s'], .3)   # الإطار الأول نظيف: العنوان وحده (صورة مصغّرة)

T = lambda i: W[i][1]
edit = {
    'dur': DUR, 'endcard': END, 'capY': 1470, 'qLabel': 'صاحبو',
    'bug': [T(37), END],
    'hook': {'s': -1, 'e': W[15][2] + .1, 'y': 300, 'lines': [   # ظاهر كاملاً من الإطار الأول (صورة مصغّرة)
        {'t': 'جاي من برّه؟', 'size': 64, 'box': '#048c5b'},
        {'t': 'وين تطبيقات التوصيل؟', 'size': 96}]},
    'pains': {'y': 300, 'e': T(33) + .1, 'strike': T(31), 'items': [
        {'t': T(22), 'icon': 'car', 'label': 'الزحمة'},
        {'t': T(23), 'icon': 'fuel', 'label': 'البنزين الغالي'},
        {'t': T(25), 'icon': 'queue', 'label': 'الصفوف'}]},
    'logoPop': {'s': T(33), 'e': T(37) - .05, 'y': 330},
    'cards': [
        {'s': T(37), 'e': T(42) - .1, 'y': 1150, 'icon': 'phone', 'title': 'بسيط وسهل جداً'},
        {'s': T(42), 'e': T(47) - .1, 'y': 1150, 'icon': 'moto', 'title': 'توصيل سريع ومضمون'},
        {'s': T(47), 'e': T(56) - .1, 'y': 1180, 'icon': 'pin', 'title': 'تابع طلبك لحدّي ما يصلك'},
        {'s': T(56), 'e': T(65) - .1, 'y': 1150, 'icon': 'wallet', 'title': 'حدّد سعرك بنفسك'},
        {'s': T(65), 'e': T(70) - .1, 'y': 1180, 'icon': 'check', 'title': 'واجهة بسيطة وسهلة'},
    ],
    'phones': [
        {'s': T(48), 'e': T(55) + .2, 'img': 'tracking', 'x': 235, 'y': 150, 'w': 480, 'rot': 0.03},
        {'s': T(65) + .1, 'e': T(70) - .1, 'img': 'shopBrowse', 'x': 235, 'y': 150, 'w': 480, 'rot': -0.03},
    ],
    'cta': {'s': T(74), 'e': END + .65, 'y': 330, 'text': 'حمّل التطبيق الآن'},
    'images': ['tracking', 'shopBrowse'],
    'flashes': [],
    'captions': caps,
    'endText1': 'حمّل التطبيق الآن', 'endText2': 'متوفّر على آيفون وأندرويد',
}

# المقاطع (زمن المصدر) مع الزووم: دفعات خفيفة تخفي القطعات وتعطي إيقاعاً
Z = [  # (z, z2, cy)
    (1.00, 1.06, .40),   # السؤال: دفع بطيء نحو الوجه
    (1.24, 1.28, .36),   # بعد القطع: لقطة أقرب بوضوح (قطعة مقصودة لا خلل)
    (1.00, 1.05, .40),   # بداية الحل
    (1.20, 1.22, .36),   # «والمضمون وكمان»
    (1.02, 1.08, .32),   # المميزات
    (1.12, 1.20, .34),   # الدعوة
]
segments = [{'s': a, 'e': b, 'z': z, 'z2': z2, 'cy': cy} for (a, b), (z, z2, cy) in zip(SEGS, Z)]
# نقاط القطع على الخط الزمني النهائي (لمؤثرات الانتقال)
cuts, acc = [], 0
for a, b in SEGS[:-1]: acc += b - a; cuts.append(round(acc, 3))

sfx = [{'k': 'pop', 't': p['t'], 'g': .7} for p in edit['pains']['items']]
sfx += [{'k': 'whoosh', 't': edit['pains']['strike'], 'g': .8}, {'k': 'riser', 't': T(33), 'd': .6, 'g': .5}, {'k': 'impact', 't': T(33), 'g': .9}]
sfx += [{'k': 'whoosh', 't': c['s'], 'g': .55} for c in edit['cards']]
sfx += [{'k': 'pop', 't': edit['cta']['s'], 'g': .6}, {'k': 'riser', 't': END, 'd': 1.2, 'g': .6}, {'k': 'impact', 't': END, 'g': .8}, {'k': 'chime', 't': END + 1.6, 'g': .7}]
sfx += [{'k': 'whoosh', 't': c, 'g': .55} for c in cuts if not any(abs(c - s['t']) < .4 for s in sfx)]

edit.update({'segments': segments, 'sfx': sfx, 'cuts': cuts, 'music_gain': .2, 'sfx_gain': .45})
json.dump(edit, open('edit.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open('edit.js', 'w', encoding='utf-8').write('window.EDIT = ' + json.dumps(edit, ensure_ascii=False) + ';\n')
print('speech', round(SPEECH, 2), 'endcard', END, 'dur', DUR, 'cuts', cuts)
