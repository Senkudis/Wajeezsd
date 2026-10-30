# صوت الـ Preview (مؤقّت): لا موسيقى ولا تعليق صوتي — جرس التطبيق الحقيقي ومؤثرات CC0 خافتة،
# كلٌّ مربوطٌ بحدثٍ فيزيائي في الصورة. القياس على الملف المُصدَّر (‎-16 LUFS، ذروة < ‎-2 dBFS).
#   python tools/mix_preview.py out/preview_silent.mp4 out/preview.mp4
import re, subprocess, sys, numpy as np, soundfile as sf
from scipy.signal import resample_poly
SR, DUR = 48000, 10.0
SFX = '../../.claude/skills/sound-effects/sfx/'
BELL = '../../public_html/sounds/wajeezsd-bell.wav'   # جرس التطبيق الحقيقي (Mixkit Loud bike bell)
run = lambda c: subprocess.run(c, capture_output=True, text=True)
def load(p):
    a, sr = sf.read(p, dtype='float32', always_2d=True)
    if a.shape[1] == 1: a = np.repeat(a, 2, 1)
    return resample_poly(a, SR, sr, axis=0).astype(np.float32) if sr != SR else a
CUES = [  # الزمن، الملف، الربح dB — كلٌّ مربوطٌ بحدثٍ في الصورة (التوقيتات بعد تعديل الافتتاحية)
    (2.02, SFX + 'tick/fs721514.ogg', -16),                         # «؟» صارت خرزة
    (3.10, SFX + 'impact/kenney-impact-impactsoft-heavy-000.ogg', -15),  # الخرزة تهبط — ثم سكون
    (3.60, SFX + 'pop/kenney-interface-pluck-001.ogg', -14),        # الدبوس ينبت
    (3.95, SFX + 'click/kenney-interface-select-001.ogg', -14),     # priceBump: «سعرك» يثبت
    (5.10, SFX + 'pop/fs527522.ogg', -16), (5.30, SFX + 'pop/kenney-interface-drop-001.ogg', -16),   # الخيط يصل الكابتنين
    (5.40, SFX + 'transition/kenney-interface-maximize-005.ogg', -17), (5.75, SFX + 'transition/kenney-interface-maximize-006.ogg', -17),  # العرضان ينهضان
    (7.50, SFX + 'click/kenney-interface-toggle-001.ogg', -12),     # قبول العرض
    (7.57, BELL, -14),                                              # جرس التطبيق: تم القبول
    (7.70, SFX + 'transition/kenney-interface-minimize-001.ogg', -18),  # العرض الآخر يهبط
]
n = int(DUR * SR); mix = np.zeros((n, 2), np.float32)
for t, f, db in CUES:
    a = load(f) * 10 ** (db / 20); i = int(t * SR); k = min(len(a), n - i); mix[i:i + k] += a[:k]
f = int(0.4 * SR); mix[-f:] *= np.linspace(1, 0, f)[:, None]
sf.write('out/preview_mix.wav', mix, SR)
def export(gain):
    run(['ffmpeg', '-y', '-v', 'error', '-i', sys.argv[1], '-i', 'out/preview_mix.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
         '-af', f'volume={gain}dB,alimiter=limit=0.8:level=false', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', sys.argv[2]])
def measure(p):
    o = run(['ffmpeg', '-nostats', '-i', p, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr
    return float(re.findall(r'I:\s+([-\d.]+) LUFS', o)[-1]), float(re.findall(r'Peak:\s+([-\d.]+) dBFS', o)[-1])
g = 0.0
for _ in range(6):
    export(g); I, P = measure(sys.argv[2])
    if abs(I + 16) <= 0.7: break
    g += -16 - I
print(f'preview audio: {I:.1f} LUFS, true peak {P:.1f} dBFS (gain {g:+.1f} dB)')
