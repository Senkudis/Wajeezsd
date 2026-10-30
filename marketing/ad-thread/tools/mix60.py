# صوت الـ Animatic (مؤقّت): لا موسيقى ولا تعليق — مؤثرات CC0 قليلة على أحداثٍ حقيقية + جرس التطبيق مرّتين.
# لا صوت للرادار ولا لتبدّل حالات المتجر؛ صمتٌ قبل القرار. القياس على الملف المُصدَّر (‎-16 LUFS، ذروة < ‎-2 dBFS).
#   python tools/mix60.py out/animatic60_silent.mp4 out/wajeez-animatic-60.mp4
import re, subprocess, sys, numpy as np, soundfile as sf
from scipy.signal import resample_poly
SR, DUR = 48000, 60.0
SFX = '../../.claude/skills/sound-effects/sfx/'
BELL = '../../public_html/sounds/wajeezsd-bell.wav'
run = lambda c: subprocess.run(c, capture_output=True, text=True)
def load(p):
    a, sr = sf.read(p, dtype='float32', always_2d=True)
    if a.shape[1] == 1: a = np.repeat(a, 2, 1)
    return resample_poly(a, SR, sr, axis=0).astype(np.float32) if sr != SR else a
CUES = [
    # الخطّاف: ثلاث بطاقات، ثم الخيوط تلتفّ في الشعار
    (0.15, 'click/kenney-interface-select-001.ogg', -15), (1.35, 'click/kenney-interface-select-002.ogg', -15), (2.55, 'click/kenney-interface-select-003.ogg', -15),
    (4.25, 'pop/kenney-interface-pluck-001.ogg', -13),
    # الطلب والعروض
    (6.60, 'click/fs788933.ogg', -18), (8.80, 'click/kenney-interface-select-002.ogg', -13),
    (11.10, 'ding/fs-349504-triangle-open-04.ogg', -15), (12.35, 'ding/kenney-interface-glass-001.ogg', -24),
    (13.55, 'pop/kenney-interface-pluck-002.ogg', -18), (15.30, 'click/kenney-interface-toggle-001.ogg', -11), (15.35, 'BELL', -13),
    # المحطات
    (17.30, 'impact/kenney-impact-impactsoft-heavy-000.ogg', -19),
    (19.20, 'ding/kenney-interface-confirmation-001.ogg', -17), (20.80, 'ding/kenney-interface-confirmation-002.ogg', -17),
    (26.00, 'tick/fs384187.ogg', -15), (27.25, 'tick/fs528561.ogg', -15), (28.50, 'tick/fs721514.ogg', -15),
    # المتجر
    (31.70, 'click/kenney-interface-select-001.ogg', -16), (32.40, 'pop/kenney-interface-drop-001.ogg', -15),
    (33.10, 'click/kenney-interface-select-003.ogg', -16), (33.80, 'pop/kenney-interface-drop-002.ogg', -15),
    (34.20, 'click/fs788933.ogg', -17), (35.10, 'click/kenney-interface-toggle-001.ogg', -12), (36.60, 'click/kenney-interface-select-002.ogg', -15),
    # التتبّع: الوصول
    (47.60, 'BELL', -11),
    # الختام
    (56.05, 'pop/kenney-interface-pluck-002.ogg', -16),
]
n = int(DUR * SR); mix = np.zeros((n, 2), np.float32)
for t, f, db in CUES:
    a = load(BELL if f == 'BELL' else SFX + f) * 10 ** (db / 20); i = int(t * SR); k = min(len(a), n - i); mix[i:i + k] += a[:k]
f = int(0.5 * SR); mix[-f:] *= np.linspace(1, 0, f)[:, None]
sf.write('out/animatic60_mix.wav', mix, SR)
def export(gain):
    r = run(['ffmpeg', '-y', '-v', 'error', '-i', sys.argv[1], '-i', 'out/animatic60_mix.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
             '-af', f'volume={gain}dB,alimiter=limit=0.8:level=false', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', sys.argv[2]])
    if r.returncode: sys.exit(r.stderr)
def measure(p):
    o = run(['ffmpeg', '-nostats', '-i', p, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr
    return float(re.findall(r'I:\s+([-\d.]+) LUFS', o)[-1]), float(re.findall(r'Peak:\s+([-\d.]+) dBFS', o)[-1])
g = 0.0
for _ in range(6):
    export(g); I, P = measure(sys.argv[2])
    if abs(I + 16) <= 0.7: break
    g += -16 - I
print(f'animatic audio: {I:.1f} LUFS, true peak {P:.1f} dBFS (gain {g:+.1f} dB); {len(CUES)} cues')
