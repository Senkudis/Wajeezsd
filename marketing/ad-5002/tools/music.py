# موسيقى شهادة إبراهيم (IMG_5002) — مأخوذة من موسيقى «بتشيل كم؟» بزمنٍ جديد: 41.1 ث،
# متوترة خافتة حتى «وجيز» (8.24)، ثم دافئة تحت الكلام، وضربة الختام 38.11.
# لا عيّنات ولا مقاطع لطرفٍ ثالث. سلّمٌ خماسي صغير في D (D F G A C)، وترٌ مقطوف
# (Karplus-Strong) كإيماءةٍ للطمبور، فوق باصٍ ناعم وإيقاعٍ نظيف.
#   0.0–2.5   صمت (الخطّاف)
#   2.5–7.5   وترٌ منفرد متباعد، ووسادةٌ خفيفة من 5.0
#   7.5       الإيقاع كاملاً — منخفضٌ وهادئ (الموسيقى خلفية لا قائدة)
#   16.9–17.5 صعودٌ قصير ← 17.5 القبول: طبقةٌ إضافية حتى 20.0
#   25.0      المرشّح ينفتح ← 27.5 ضربة الختام ووترٌ يرنّ، ينتهي قبل 30.0
#   python tools/music.py src/music.wav
import numpy as np, wave, sys

SR, DUR, BPM = 48000, 41.11, 96
OPEN, END = 8.24, 38.11
B = 60 / BPM
n = int(SR * DUR)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(29)

def add(sig, t, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if i >= n or i < 0: return
    j = min(n, i + len(sig)); s = sig[: j - i] * gain
    L[i:j] += s * (1 - max(0, pan)); R[i:j] += s * (1 + min(0, pan))

def env(len_s, a=0.002, d=0.2):
    t = np.arange(int(len_s * SR)) / SR
    return np.minimum(1, t / a) * np.exp(-t / d), t

def lowpass(x, fc):
    a = 1 - np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s += a * (x[i] - s); y[i] = s
    return y

def kick():
    e, t = env(0.5, 0.001, 0.14)
    f = 48 + 95 * np.exp(-t * 26)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * e
def rim():
    e, t = env(0.1, 0.0005, 0.02)
    x = rng.standard_normal(len(t)); x = x - np.convolve(x, np.ones(3) / 3, 'same')
    return (x * 0.35 + np.sin(2 * np.pi * 820 * t) * 0.5) * e * 0.42
def shaker(acc=1.0):
    e, t = env(0.07, 0.004, 0.022)
    x = rng.standard_normal(len(t)); x = x - np.convolve(x, np.ones(7) / 7, 'same')
    return x * e * 0.07 * acc

_ks = {}
def pluck(freq, length=1.1, bright=0.5):
    key = (round(freq, 2), length, bright)
    if key in _ks: return _ks[key]
    N = int(SR / freq); buf = rng.uniform(-1, 1, N); out = np.empty(int(length * SR))
    for i in range(len(out)):
        out[i] = buf[i % N]
        buf[i % N] = (bright * buf[i % N] + (1 - bright) * buf[(i + 1) % N]) * 0.9965
    out *= np.minimum(1, np.arange(len(out)) / (0.002 * SR)) * 0.4
    _ks[key] = out; return out

def bass(freq, length):
    e, t = env(length, 0.01, length * 0.55)
    s = np.sin(2 * np.pi * freq * t) + 0.22 * np.sin(2 * np.pi * freq * 2 * t)
    return np.tanh(s * 1.3) * e * 0.38

def pad(freqs, length, a=1.0, bright=0.0):
    t = np.arange(int(length * SR)) / SR
    e = np.minimum(1, t / a) * np.minimum(1, np.maximum(0, (length - t)) / 0.5)
    s = sum(np.sin(2 * np.pi * f * t + 0.25 * np.sin(2 * np.pi * 0.27 * t + k)) + bright * 0.18 * np.sin(2 * np.pi * f * 2 * t)
            for k, f in enumerate(freqs))
    return s * e * 0.03

def riser(length):
    t = np.arange(int(length * SR)) / SR
    return lowpass(rng.standard_normal(len(t)), 2400) * (t / length) ** 2.4 * 0.22

def hit():
    e, t = env(2.4, 0.001, 0.7)
    return np.sin(2 * np.pi * (55 - 18 * t) * t) * e * 0.8 + lowpass(rng.standard_normal(len(t)), 900) * np.exp(-t / 0.09) * 0.25

# D صغير خماسي: D F G A C — التآلفات: Dm – Bb – F – C
D4, F4, G4, A4, C5, D5, F5 = 293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 698.46
ROOTS = [73.42, 58.27, 87.31, 65.41]
PADS = [[146.83, 220.0, 349.23], [116.54, 174.61, 293.66], [174.61, 261.63, 349.23], [130.81, 196.0, 329.63]]
# لحنٌ متباعد: نغمةٌ على الضربة أو لا شيء — الفراغ جزءٌ من الفخامة
MEL = [[A4, None, D5, None, C5, None, A4, None], [G4, None, A4, None, None, None, F4, None],
       [A4, None, C5, D5, None, None, C5, None], [A4, None, G4, None, None, None, None, None]]

# ① المشكلة (0–8.24): وسادةٌ صغيرة خافتة ونبضٌ منخفض على الضربة، بلا لحن
add(pad([73.42, 110.0, 174.61], OPEN + 0.3, a=2.0), 0.0, 0.9)
t = 0.0
while t < OPEN - 1e-6:
    add(kick(), t, 0.22 if int(round(t / B)) % 2 == 0 else 0.0); t += B
add(riser(1.0), OPEN - 1.0, 0.55)
# ② الدفء (8.24–38.11)
t = OPEN; beat = 0
while t < END - 1e-6:
    bar, pos = beat // 4, beat % 4
    lift = 1.0
    quiet = 0.85
    if pos in (0, 2): add(kick(), t, 0.55 * lift)
    if pos in (1, 3): add(rim(), t, 0.55 * quiet, 0.2)
    for k in range(2): add(shaker(1.0 if k == 0 else 0.6), t + k * B / 2, quiet, -0.35)
    if pos == 0:
        add(bass(ROOTS[bar % 4], B * 4), t, 0.9 * lift)
        bright = min(1.0, max(0.0, (t - (END - 3.0)) / 3.0))
        add(pad(PADS[bar % 4], B * 4 + 0.3, a=0.25, bright=bright), t, 1.0 + 0.5 * bright + 0.3 * (lift - 1) * 4)
    for half in range(2):
        f = MEL[bar % 4][pos * 2 + half]
        if f and not half: add(pluck(f, 1.2, 0.5), t + half * B / 2, 0.62 * quiet, 0.25 if half else -0.2)
    t += B; beat += 1
# ③ الختام: ضربة ووترٌ يرنّ على Dm، وذيلٌ ينتهي قبل 30.0
add(hit(), END, 0.9)
for i, f in enumerate([D4, F4, A4, D5]):
    add(pluck(f, 2.8, 0.5), END + 0.02 + i * 0.07, 0.75, -0.3 + i * 0.2)
add(pad([73.42, 146.83, 220.0, 293.66], DUR - END, a=0.04), END, 1.3)

mix = np.stack([L, R], 1)
fade = np.ones(n); m = int(0.35 * SR); fade[-m:] = np.linspace(1, 0, m); mix *= fade[:, None]
mix /= max(1e-9, np.abs(mix).max()) / 0.89
pcm = (mix * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'out/music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('music ok')
