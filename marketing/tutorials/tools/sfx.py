"""
مؤثّرات صوتية قصيرة لفيديوهات الشرح — مؤلَّفة بالكود (لا حقوق لطرفٍ ثالث).

    python tools/sfx.py <مجلد>   → tap.wav و whoosh.wav و chime.wav

خافتةٌ عمداً: تُشعر بالحركة ولا تزاحم الكلام.
  tap    نقرةٌ ناعمة (لمسة إصبع على زر)
  whoosh هواءٌ خفيف عند تبديل الشاشة
  chime  نغمتان صاعدتان عند بطاقة الفصل
"""
import sys, os, wave
import numpy as np

SR = 48000

# وضع المسار: python tools/sfx.py track <events.json> <ثوانٍ> <out.wav>
#   events.json = [[الثانية, "tap"|"whoosh"|"chime", الحجم], ...]
if len(sys.argv) > 1 and sys.argv[1] == 'track':
    import json
    ev, dur, out = json.load(open(sys.argv[2], encoding='utf-8')), float(sys.argv[3]), sys.argv[4]
    lib = {}
    for name in ('tap', 'whoosh', 'chime'):
        with wave.open(os.path.join(os.path.dirname(out), 'sfx', name + '.wav')) as w:
            a = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, 2)[:, 0] / 32767
        lib[name] = a
    track = np.zeros(int(dur * SR) + SR)
    for t0, name, g in ev:
        i = int(t0 * SR); a = lib[name][: len(track) - i] * g
        if i >= 0 and len(a): track[i:i + len(a)] += a
    st = np.stack([track, track], axis=1)
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(st, -1, 1) * 32767).astype(np.int16).tobytes())
    print(f'sfx track: {out}  {len(ev)} events')
    sys.exit(0)

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def save(name, x):
    x = x / max(1e-9, np.abs(x).max()) * 0.9
    st = np.stack([x, x], axis=1)
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())


def band(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * ((f > lo) & (f < hi)), len(x))


# نقرة: نبضةٌ قصيرة مُرشَّحة + رنينٌ خشبيّ عند ١٫٨ كيلوهرتز يتلاشى في ٤٠ م.ث
n = int(0.09 * SR); t = np.arange(n) / SR
click = band(rng.uniform(-1, 1, n) * np.exp(-t / 0.004), 1500, 9000)
body = np.sin(2 * np.pi * 1800 * t) * np.exp(-t / 0.018) * 0.6
save('tap.wav', click + body)

# هواء: ضجيجٌ يكتسح ترشيحه صعوداً ثم نزولاً، بغلافٍ ناعم (٠٫٤٥ ث)
n = int(0.45 * SR); t = np.arange(n) / SR
noise = rng.uniform(-1, 1, n)
out = np.zeros(n); win = 2048; hop = 512
for i in range(0, n - win, hop):
    k = i / n
    fc = 400 + 3200 * np.sin(np.pi * k)
    seg = band(noise[i:i + win] * np.hanning(win), fc * 0.5, fc * 1.6)
    out[i:i + win] += seg
env = np.sin(np.pi * np.clip(t / 0.45, 0, 1)) ** 1.5
save('whoosh.wav', out * env)

# نغمتان: ري ثم لا (خامسة صاعدة) بجرسٍ ناعم
def bell(f, d):
    m = int(d * SR); tt = np.arange(m) / SR
    return (np.sin(2 * np.pi * f * tt) + .3 * np.sin(2 * np.pi * 2 * f * tt)) * np.exp(-tt / 0.35) * np.minimum(1, tt / 0.004)
n = int(1.2 * SR); x = np.zeros(n)
a = bell(587.33, 1.0); x[:len(a)] += a
b = bell(880.0, 1.0); o = int(0.14 * SR); x[o:o + len(b)] += b[:n - o]
save('chime.wav', x * 0.8)
print('sfx:', OUT)
