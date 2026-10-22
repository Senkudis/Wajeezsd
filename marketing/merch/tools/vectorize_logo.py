# شعار وجيز الكامل الأبيض — نسخة متّجهة نظيفة للطباعة والشاشات.
#   المصدر: public_html/logo-white.png (1706×699 نقطي)
#   الناتج:  marketing/merch/print/wajeez-logo-white.svg          (أبيض + أصفر مسطّح — للطباعة)
#            marketing/merch/print/wajeez-logo-white-gradient.svg (السهم بتدرّجه — للشاشات)
#
# الكتابة (وجيز، WAJEEZ، الشعار النصّي، المربع الأصفر) تُتتبَّع من الصورة بعد تكبير
# القناع 6× بنعومة. أمّا العلامة (الحلقة والسهم) فتُعاد بنائها **هندسياً** بالقياسات
# الحقيقية: دائرةٌ تامّة، وسهمٌ بطرفين مستديرين، وفجوةٌ متساوية بينهما — التتبّع
# وحده يترك تموّجاً خفيفاً في الدائرة يظهر في الطباعة الكبيرة على الظهر.
import numpy as np, potrace
from PIL import Image, ImageDraw, ImageFilter

SRC = 'public_html/logo-white.png'
OUT = 'marketing/merch/print/'
UP = 6
im = Image.open(SRC).convert('RGBA')
W0, H0 = im.size
a = np.asarray(im).astype(np.float32) / 255
r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
yellow = (al > 0.05) & (r > 0.6) & (b < 0.45) & (r - b > 0.35)
xs = np.arange(W0)[None, :]
TEXT_MAX_X = 930                           # الكتابة كلها يسار هذا الخط، والعلامة يمينه
text_white = (al > 0.05) & ~yellow & (xs < TEXT_MAX_X)
text_yellow = yellow & (xs < TEXT_MAX_X)   # المربع فوق «وجيز»

# ── قياسات العلامة (من الصورة: ملاءمة دائرة + مقاطع شعاعية) ───────────────
CX, CY = 1289.0, 332.0
R_IN, R_OUT = 230.0, 318.0
STROKE = 82.0                              # سماكة السهم
GAP = 22.0                                 # الفجوة بين الحلقة والسهم
OPEN = 42.0                                # نصف زاوية فتحة الحلقة يميناً
CHEV = [(1522.0, 196.0), (1651.0, 332.0), (1522.0, 468.0)]   # خط مركز السهم: طرف ⇐ رأس ⇐ طرف


TAGLINE_Y = 600                           # سطر «توصيل وجيز لكل ما تحتاجه» تحت هذا الخط


def soft(mask, alpha, blur=0.45):
    # القناع بشفافية حوافه ⇐ تكبير LANCZOS (يحفظ دقّة ما بين البكسلات) ⇐ تنعيم ⇐ عتبة
    m = Image.fromarray((np.where(mask, alpha, 0) * 255).astype('uint8'))
    m = m.resize((W0 * UP, H0 * UP), Image.LANCZOS).filter(ImageFilter.GaussianBlur(UP * blur))
    return np.asarray(m) > 127


ys_ = np.arange(H0)[:, None]


def polyline(draw, pts, width, fill):
    # خطٌّ بأطرافٍ ومفاصل مستديرة
    draw.line(pts, fill=fill, width=int(round(width)), joint='curve')
    for x, y in (pts[0], pts[1], pts[-1]):
        draw.ellipse([x - width / 2, y - width / 2, x + width / 2, y + width / 2], fill=fill)


def geo_layers():
    # العلامة بدقة UP×: الحلقة ناقص (السهم مُوسَّعاً بالفجوة)، والسهم وحده
    S = UP
    ring = Image.new('L', (W0 * S, H0 * S), 0)
    d = ImageDraw.Draw(ring)
    d.ellipse([(CX - R_OUT) * S, (CY - R_OUT) * S, (CX + R_OUT) * S, (CY + R_OUT) * S], fill=255)
    d.ellipse([(CX - R_IN) * S, (CY - R_IN) * S, (CX + R_IN) * S, (CY + R_IN) * S], fill=0)
    pts = [(x * S, y * S) for x, y in CHEV]
    # الحلقة مفتوحة يميناً بقطاعٍ ±42° (نهايتاها في الأصل عند هذه الزاوية من المركز)
    import math
    k = R_OUT * 1.6
    wedge = [(CX * S, CY * S), ((CX + k * math.cos(math.radians(-OPEN))) * S, (CY + k * math.sin(math.radians(-OPEN))) * S),
             ((CX + k) * S, (CY - k) * S), ((CX + k) * S, (CY + k) * S),
             ((CX + k * math.cos(math.radians(OPEN))) * S, (CY + k * math.sin(math.radians(OPEN))) * S)]
    d.polygon(wedge, fill=0)
    polyline(d, pts, (STROKE + 2 * GAP) * S, 0)
    chev = Image.new('L', (W0 * S, H0 * S), 0)
    polyline(ImageDraw.Draw(chev), pts, STROKE * S, 255)
    return np.asarray(ring) > 127, np.asarray(chev) > 127


def trace(mask, alphamax=1.0, opttolerance=0.2):
    bm = potrace.Bitmap(~mask)             # potracer يتتبّع القيم الكاذبة — نعكس القناع
    plist = bm.trace(turdsize=40 * UP, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=alphamax, opticurve=True, opttolerance=opttolerance)
    d = []
    for curve in plist:
        s = curve.start_point
        d.append(f'M{s.x:.1f},{s.y:.1f}')
        for seg in curve.segments:
            if seg.is_corner:
                d.append(f'L{seg.c.x:.1f},{seg.c.y:.1f}L{seg.end_point.x:.1f},{seg.end_point.y:.1f}')
            else:
                d.append(f'C{seg.c1.x:.1f},{seg.c1.y:.1f} {seg.c2.x:.1f},{seg.c2.y:.1f} {seg.end_point.x:.1f},{seg.end_point.y:.1f}')
        d.append('Z')
    return ''.join(d)


ring, chev = geo_layers()
# الكتابة الكبيرة والعلامة بزوايا حادّة؛ والشعار النصّي الصغير (~25 بكسل في الأصل)
# بتنعيمٍ أكبر ومنحنياتٍ أنعم — وإلا ظهرت درجات البكسل حين يُكبَّر للطباعة
white_d = trace(soft(text_white & (ys_ < TAGLINE_Y), al) | ring) +           trace(soft(text_white & (ys_ >= TAGLINE_Y), al, 0.8), alphamax=1.25, opttolerance=0.5)
yellow_d = trace(soft(text_yellow, al) | chev)

W, H = W0 * UP, H0 * UP
PAD = 40 * UP
vb = f'{-PAD} {-PAD} {W + 2 * PAD} {H + 2 * PAD}'
size = f'width="{(W + 2 * PAD) / UP:.0f}" height="{(H + 2 * PAD) / UP:.0f}"'
WHITE, YELLOW = '#FFFFFF', '#F5A800'      # أصفر مسطّح للطباعة (وسط تدرّج السهم)


def svg(title, yellow_fill, defs=''):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" {size}>
  <title>{title}</title>{defs}
  <path fill="{WHITE}" fill-rule="evenodd" d="{white_d}"/>
  <path fill="{yellow_fill}" fill-rule="evenodd" d="{yellow_d}"/>
</svg>
'''


open(OUT + 'wajeez-logo-white.svg', 'w', encoding='utf8').write(svg('Wajeez — الشعار الكامل الأبيض', YELLOW))
grad = '\n  <defs><linearGradient id="y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7B500"/><stop offset="1" stop-color="#E08F00"/></linearGradient></defs>'
open(OUT + 'wajeez-logo-white-gradient.svg', 'w', encoding='utf8').write(svg('Wajeez — الشعار الكامل الأبيض (تدرّج)', 'url(#y)', grad))
print('white', white_d.count('M'), 'yellow', yellow_d.count('M'))
