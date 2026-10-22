# تحويل شعار وجيز إلى vector (SVG) للطباعة والتطريز.
# المصدر: public_html/logo-white.png (النسخة البيضاء بالسهم الأصفر)، مكبَّرٌ 4×
# قبل التتبّع لتنعم المنحنيات. يُفصل لونان مسطّحان: الأبيض، والأصفر (السهم
# ونقطة الجيم) — التطريز والطباعة بالشاشة لا تحمل تدرّجات.
#   python tools/vectorize.py   ⇐ src/lockup.svg, src/mark.svg, src/wordmark.svg
import numpy as np, potrace
from PIL import Image

WHITE, YELLOW = '#FFFFFF', '#F6B40E'
SRC = '../../public_html/logo-white.png'
UP = 4

im = Image.open(SRC).convert('RGBA')
W0, H0 = im.size
big = im.resize((W0 * UP, H0 * UP), Image.LANCZOS)
a = np.asarray(big).astype(np.float32) / 255
r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
solid = al > 0.5
yellow = solid & (r > 0.75) & (b < 0.45) & (r - b > 0.35)
white = solid & ~yellow

def trace(mask, crop):
    x0, y0, x1, y1 = [v * UP for v in crop]
    m = mask[y0:y1, x0:x1]
    bm = potrace.Bitmap(~m)  # potracer يتتبّع القيمة الصفرية — نعكس ليُتتبَّع الشكل لا خلفيته
    path = bm.trace(turdsize=40, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=True, opttolerance=0.2)
    d = []
    for curve in path:
        sx, sy = curve.start_point.x, curve.start_point.y
        d.append(f'M{sx:.1f} {sy:.1f}')
        for seg in curve.segments:
            if seg.is_corner:
                d.append(f'L{seg.c.x:.1f} {seg.c.y:.1f}L{seg.end_point.x:.1f} {seg.end_point.y:.1f}')
            else:
                d.append(f'C{seg.c1.x:.1f} {seg.c1.y:.1f} {seg.c2.x:.1f} {seg.c2.y:.1f} {seg.end_point.x:.1f} {seg.end_point.y:.1f}')
        d.append('Z')
    return ''.join(d), (x1 - x0, y1 - y0)

def svg(name, crop, layers):
    parts, size = [], None
    for color, mask in layers:
        d, size = trace(mask, crop)
        if d: parts.append(f'<path fill="{color}" fill-rule="evenodd" d="{d}"/>')
    w, h = size
    open(f'src/{name}.svg', 'w', encoding='utf8').write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{"".join(parts)}</svg>')
    print(name, w, h, sum(len(p) for p in parts))

# الأجزاء على الصورة الأصلية (1706×699)، من فحص الأعمدة والصفوف الفارغة:
#   الكلمة + WAJEEZ: x 12–806، y 59–550 · الشعار الدائري: x 974–1693، y 12–652
#   سطر «توصيل وجيز لكل ما تحتاجه» (y 631–686) يُترك: لا يُطرَّز بهذا الصغر
WORD = (6, 52, 812, 556)
MARK = (968, 6, 1700, 658)

def group(crop, dx=0, dy=0):
    out = []
    for color, mask in ((WHITE, white), (YELLOW, yellow)):
        d, size = trace(mask, crop)
        if d: out.append(f'<path fill="{color}" fill-rule="evenodd" d="{d}"/>')
    return f'<g transform="translate({dx},{dy})">{"".join(out)}</g>', size

def write(name, body, w, h, ink=None):
    if ink:  # نسخة بلونٍ واحد (للتطريز بخيطٍ واحد أو الطباعة بلون)
        import re
        body = re.sub(r'fill="#[0-9A-Fa-f]{6}"', f'fill="{ink}"', body)
    open(f'src/{name}.svg', 'w', encoding='utf8').write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{body}</svg>')
    print(name, w, h)

wg, (ww, wh) = group(WORD)
mg, (mw, mh) = group(MARK)
write('wordmark', wg, ww, wh)
write('mark', mg, mw, mh)
# التشكيل الأفقي كما في الشعار الأصلي: الكلمة يساراً والدائرة يميناً
gap = (MARK[0] - WORD[2]) * UP
H = max(wh, mh)
lock = group(WORD, 0, (WORD[1] - MARK[1]) * UP)[0] + group(MARK, ww + gap, 0)[0]  # المواضع كما في الأصل
write('lockup', lock, ww + gap + mw, H)
write('lockup-white', lock, ww + gap + mw, H, ink=WHITE)
write('mark-white', mg, mw, mh, ink=WHITE)

# أجزاء الكاب: السهم الأصفر وحده (للجانب)، وكلمة WAJEEZ وحدها (للخلف فوق الحزام)
d, (cw, ch) = trace(yellow, MARK)
write('chevron', f'<path fill="{YELLOW}" fill-rule="evenodd" d="{d}"/>', cw, ch)
LATIN = (6, 484, 812, 556)
d, (lw, lh) = trace(white, LATIN)
write('wajeez-latin', f'<path fill="{WHITE}" fill-rule="evenodd" d="{d}"/>', lw, lh)
