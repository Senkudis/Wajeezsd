# تركيب الـ Preview العمودي 1080×1920 من إطارات التطبيق الحقيقية (seq/).
# الهاتف مركز المشهد؛ الكاميرا تتحرّك بهدوء نحو العنصر الذي يُستعمل؛ مؤشّر لمسٍ على الضغطات الحقيقية.
# لا عناصر واجهة مرسومة: كل ما داخل الشاشة لقطةٌ من التطبيق. ثم صوت مؤقت (نقرات + جرس التطبيق) و ‎-16 LUFS.
#   python tools/compose.py out/wajeez-real-preview.mp4
import json, math, os, re, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H, FPS = 1080, 1920, 30
OUT = sys.argv[1] if len(sys.argv) > 1 else 'out/wajeez-real-preview.mp4'
TL = json.load(open('seq/timeline.json', encoding='utf8'))
SA, SB = TL['segments']
XF = 5                                     # تداخل القطع A←B (إطارات)
B0 = SA['frames'] - XF                     # بداية B على الخط الزمني
N = B0 + SB['frames']

# الكاميرا: موضع الزاوية العليا لشاشة الهاتف (ox, oy) والمقياس s (بكسل الإخراج لكل بكسل CSS)
K = [(0, 111, 150, 2.2), (62, 111, 150, 2.2), (80, 111, 40, 2.2), (101, 111, 40, 2.2), (116, 111, -110, 2.2),
     (B0 + 60, 111, -100, 2.2), (B0 + 74, 111, -100, 2.2), (B0 + 100, 72, -181, 2.34), (B0 + 132, 72, -181, 2.34),
     (B0 + 156, 111, -100, 2.2), (N, 111, -100, 2.2)]
ease = lambda k: k * k * (3 - 2 * k)
def cam(f):
    for (f0, *a), (f1, *b) in zip(K, K[1:]):
        if f0 <= f <= f1:
            k = ease((f - f0) / max(1, f1 - f0)); return [x + (y - x) * k for x, y in zip(a, b)]
    return K[-1][1:]

# الخلفية: أخضر العلامة بتدرّجٍ هادئ
yy, xx = np.mgrid[0:H, 0:W]
r = np.clip(np.hypot((xx - W / 2) / W, (yy - H * 0.45) / H) * 1.6, 0, 1)[..., None]
BG = Image.fromarray((np.array([10, 106, 73]) * (1 - r) + np.array([4, 70, 48]) * r).astype(np.uint8))

def rounded_mask(w, h, rad, scale=3):
    m = Image.new('L', (w * scale, h * scale), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * scale - 1, h * scale - 1), rad * scale, fill=255)
    return m.resize((w, h), Image.LANCZOS)
_masks = {}
def mask(w, h, rad):
    k = (w, h, rad)
    if k not in _masks: _masks[k] = rounded_mask(w, h, rad)
    return _masks[k]

def screen(f):
    """إطار شاشة التطبيق (RGB 1170×2532) للحظة f، مع تداخل القطع."""
    if f < B0: return Image.open(f"seq/{SA['name']}/{f:04d}.jpg")
    b = Image.open(f"seq/{SB['name']}/{f - B0:04d}.jpg")
    if f < SA['frames']:
        a = Image.open(f"seq/{SA['name']}/{f:04d}.jpg"); return Image.blend(a, b, ease((f - B0 + 1) / (XF + 1)))
    return b

# اللمسات: (إطار البداية العام، x، y بـ CSS، مدة الضغط بالإطارات، يُرفع؟)
touches = []
for seg, off in ((SA, 0), (SB, B0)):
    for t in seg['touches']:
        dur = 6 if t['kind'] == 'tap' else (seg['frames'] - t['f'])
        if seg is SB and t['kind'] == 'tap': dur = 5
        touches.append((t['f'] + off, t['x'], t['y'], dur, t['kind'] == 'tap'))

def draw_touch(im, f, ox, oy, s):
    ov = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(ov); hit = False
    for f0, x, y, dur, rel in touches:
        cx, cy = (ox + x * s) * 2, (oy + y * s) * 2
        if f0 <= f < f0 + dur:
            k = min(1, (f - f0 + 1) / 3); rr = 2 * 34 * (0.7 + 0.3 * ease(k)); hit = True
            d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=(255, 255, 255, int(110 * k)), outline=(255, 255, 255, int(235 * k)), width=6)
        elif rel and f0 + dur <= f < f0 + dur + 9:
            k = (f - f0 - dur) / 9; rr = 2 * (34 + 40 * ease(k)); hit = True
            d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(255, 255, 255, int(200 * (1 - k))), width=5)
    if hit: im.alpha_composite(ov.resize((W, H), Image.LANCZOS))

BEZ, RAD = 16, 62
def frame(f):
    ox, oy, s = cam(f)
    sw, sh = round(390 * s), round(844 * s)
    im = BG.copy().convert('RGBA')
    # ظلّ هادئ تحت الهاتف
    sh_l = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sh_l).rounded_rectangle((ox - BEZ + 10, oy - BEZ + 34, ox + sw + BEZ - 10, oy + sh + BEZ + 40), RAD + BEZ, fill=120)
    im.paste((0, 25, 15), (0, 0), sh_l.filter(ImageFilter.GaussianBlur(28)))
    # الهيكل
    body = mask(sw + 2 * BEZ, sh + 2 * BEZ, RAD + BEZ)
    im.paste((14, 20, 17), (round(ox - BEZ), round(oy - BEZ)), body)
    # الشاشة الحقيقية
    sc = screen(f).convert('RGB').resize((sw, sh), Image.LANCZOS)
    im.paste(sc, (round(ox), round(oy)), mask(sw, sh, RAD))
    draw_touch(im, f, ox, oy, s)
    return im.convert('RGB')

FF = os.environ.get('FFMPEG', 'ffmpeg')
os.makedirs('out', exist_ok=True)
silent = OUT.replace('.mp4', '_silent.mp4')
p = subprocess.Popen([FF, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', silent], stdin=subprocess.PIPE)
for f in range(N):
    p.stdin.write(frame(f).tobytes())
    if f % 60 == 0: print('frame', f, '/', N, flush=True)
p.stdin.close(); p.wait()

# ── الصوت المؤقت: نقرة لكل ضغطة حقيقية، وجرس التطبيق مع «قبلت السعر!» — لا موسيقى ──
import soundfile as sf
from scipy.signal import resample_poly
SR, DUR = 48000, N / FPS
SFX = '../../.claude/skills/sound-effects/sfx/'
def load(pth):
    a, sr = sf.read(pth, dtype='float32', always_2d=True)
    if a.shape[1] == 1: a = np.repeat(a, 2, 1)
    return resample_poly(a, SR, sr, axis=0).astype(np.float32) if sr != SR else a
POP = B0 + SB['touches'][0]['f'] + 6           # تظهر النافذة بعد ردّ الخادم مباشرة
CUES = [((f0) / FPS, SFX + 'click/kenney-interface-select-002.ogg', -16) for f0, *_ in touches] + [(POP / FPS, '../../public_html/sounds/wajeezsd-bell.wav', -13)]
mix = np.zeros((int(DUR * SR), 2), np.float32)
for t, fp, db in CUES:
    a = load(fp) * 10 ** (db / 20); i = int(t * SR); k = min(len(a), len(mix) - i); mix[i:i + k] += a[:k]
fl = int(0.3 * SR); mix[-fl:] *= np.linspace(1, 0, fl)[:, None]
sf.write('out/preview_mix.wav', mix, SR)
def export(g):
    subprocess.run([FF, '-y', '-v', 'error', '-i', silent, '-i', 'out/preview_mix.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-af', f'volume={g}dB,alimiter=limit=0.8:level=false', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', OUT], check=True)
def measure():
    o = subprocess.run([FF, '-nostats', '-i', OUT, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+([-\d.]+) LUFS', o)[-1]), float(re.findall(r'Peak:\s+([-\d.]+) dBFS', o)[-1])
g = 0.0
for _ in range(6):
    export(g); I, P = measure()
    if abs(I + 16) <= 0.7: break
    g += -16 - I
print(f'{OUT}: {N} frames ({N / FPS:.2f} s), {I:.1f} LUFS, true peak {P:.1f} dBFS; cues at', [round(c[0], 2) for c in CUES])
