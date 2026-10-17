# موسيقى إعلان عطبرة مُركّبة بالكود — 120 BPM (نبضة 0.5 ث).
# سلّمٌ خماسيٌّ (G A B D E) كالأغنية السودانية، ونقرٌ بإيقاع الدلّوكة،
# ونغمة وترٍ مقطوف (Karplus-Strong) قريبة من الطمبور.
#   المقدّمة: طنينٌ وإيقاع «تشك-تشك» القطار، يعلو حتى دخول الشعار (drop)
#   ثم الإيقاع كاملاً، وخاتمةٌ ترنّ عند بطاقة النهاية (end).
import numpy as np, wave, sys, json

T = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {'arrive': 3.4, 'drop': 7.75, 'end': 22.8, 'dur': 27.2}
SR, DUR, BPM = 48000, T['dur'], 120
B = 60 / BPM
n = int(SR * DUR)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(11)
ARR, DROP, END = T['arrive'], T['drop'], T['end']

def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= n or i < 0: return
    j = min(n, i + len(sig)); s = sig[: j - i] * gain
    L[i:j] += s * (1 - max(0, pan)); R[i:j] += s * (1 + min(0, pan))

def env(len_s, a=0.002, d=0.2):
    t = np.arange(int(len_s * SR)) / SR
    return np.minimum(1, t / a) * np.exp(-t / d), t

def onepole(x, fc):
    a = 1 - np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s += a * (x[i] - s); y[i] = s
    return y

# ── الدلّوكة: «دُم» منخفضة مكتومة و«تَك» على الحافّة ──
def dum():
    e, t = env(0.4, 0.001, 0.11)
    f = 70 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * e * 0.95
def tak():
    e, t = env(0.12, 0.0005, 0.025)
    x = rng.standard_normal(len(t)); x = x - np.convolve(x, np.ones(3) / 3, 'same')
    return (x * 0.5 + np.sin(2 * np.pi * 620 * t) * 0.6) * e * 0.5
def kick():
    e, t = env(0.45, 0.001, 0.12)
    f = 45 + 110 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * e
def clap():
    e, t = env(0.25, 0.001, 0.06)
    x = rng.standard_normal(len(t)) * e
    return np.convolve(x, np.ones(6) / 6, 'same') * 0.45
def chug(accent=1.0):                     # «تشك» القطار: ضجيجٌ قصير
    e, t = env(0.09, 0.002, 0.03)
    x = rng.standard_normal(len(t)); x = x - np.convolve(x, np.ones(5) / 5, 'same')
    return x * e * 0.16 * accent

# ── وترٌ مقطوف (Karplus-Strong) ──
_ks = {}
def pluck(freq, length=0.9):
    key = (round(freq, 2), length)
    if key in _ks: return _ks[key]
    N = int(SR / freq); buf = rng.uniform(-1, 1, N); out = np.empty(int(length * SR))
    for i in range(len(out)):
        out[i] = buf[i % N]
        buf[i % N] = 0.5 * (buf[i % N] + buf[(i + 1) % N]) * 0.996
    out *= np.minimum(1, np.arange(len(out)) / (0.002 * SR)) * 0.42
    _ks[key] = out; return out

def bass(freq, length):
    e, t = env(length, 0.006, length * 0.6)
    s = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2 * t)
    return np.tanh(s * 1.5) * e * 0.4

def pad(freqs, length, a=1.2):
    t = np.arange(int(length * SR)) / SR
    e = np.minimum(1, t / a) * np.minimum(1, (length - t) / 0.6)
    s = sum(np.sin(2 * np.pi * f * t + 0.3 * np.sin(2 * np.pi * 0.3 * t)) for f in freqs)
    return s * e * 0.035

def riser(length):
    t = np.arange(int(length * SR)) / SR
    return onepole(rng.standard_normal(len(t)), 3000) * (t / length) ** 2.2 * 0.35

def impact():
    e, t = env(1.8, 0.001, 0.55)
    return np.sin(2 * np.pi * (58 - 24 * t) * t) * e * 0.95 + rng.standard_normal(len(t)) * np.exp(-t / 0.07) * 0.22

# السلّم الخماسي في G والتآلفات: G – Em – C – D
G4, A4, B4, D5, E5, G5 = 392.0, 440.0, 493.88, 587.33, 659.25, 783.99
ROOTS = [98.0, 82.41, 65.41, 73.42]
PADS = [[196, 293.66, 392], [164.81, 246.94, 329.63], [130.81, 196, 329.63], [146.83, 220, 293.66]]
MEL = [[D5, E5, D5, B4, A4, B4, G4, None], [B4, D5, E5, G5, E5, D5, B4, None],
       [A4, B4, D5, B4, A4, G4, A4, None], [B4, A4, G4, A4, B4, D5, None, None]]

# ① المقدّمة: طنينٌ يعلو وإيقاع القطار بالأنصاف الثُّمنية
add(pad([98, 146.83, 196], DROP + 0.4, a=2.5), 0.0, 1.3)
t = 0.0
while t < DROP - 1e-6:
    k = 0.35 + 0.65 * (t / DROP)                    # يعلو كلما اقترب القطار
    i = int(round(t / (B / 4)))
    add(chug(1.0 if i % 2 == 0 else 0.55), t, k, 0.2 if i % 2 else -0.2)
    t += B / 4
# الدلّوكة تدخل خفيفة مع وصول القطار
t = ARR
while t < DROP - B - 1e-6:
    beat = int(round((t - ARR) / B))
    add(dum(), t, 0.55 if beat % 2 == 0 else 0.0)
    add(tak(), t + B * 0.75, 0.5, 0.3); add(tak(), t + B, 0.0)
    t += B
for i, f in enumerate([G4, A4, B4, D5]):           # تمهيدٌ وتريّ قبل الشعار
    add(pluck(f, 0.7), DROP - 2 * B + i * B / 2, 0.8, -0.2)
add(riser(1.6), DROP - 1.6, 1.0)

# ② الدخول: الإيقاع كاملاً
add(impact(), DROP, 0.9)
t = DROP; beat = 0
while t < END - 1e-6:
    bar = beat // 4; pos = beat % 4
    if pos in (0, 2): add(kick(), t, 0.7)
    if pos in (1, 3): add(clap(), t, 0.7)
    # الدلّوكة على الثُّمن: دُم . تك تك | دُم . تك .
    for e8, kind in ((0, 'd'), (2, 't'), (3, 't')) if pos % 2 == 0 else ((0, 'd'), (2, 't')):
        add(dum() if kind == 'd' else tak(), t + e8 * B / 4 * (1.06 if e8 % 2 else 1.0), 0.7 if kind == 'd' else 0.55, 0.25 if kind == 't' else 0)
    add(chug(0.6), t + B / 2, 0.6, -0.3)
    if pos == 0:
        add(bass(ROOTS[bar % 4], B * 4), t, 1.0)
        add(pad(PADS[bar % 4], B * 4 + 0.3, a=0.2), t, 1.0)
    note = MEL[bar % 4][pos * 2], MEL[bar % 4][pos * 2 + 1]
    if note[0]: add(pluck(note[0]), t, 0.85, -0.25)
    if note[1]: add(pluck(note[1]), t + B / 2, 0.7, 0.25)
    t += B; beat += 1

# ③ الخاتمة: ضربةٌ ووترٌ يرنّ على التآلف الأول
add(impact(), END, 1.0)
for i, f in enumerate([G4, B4, D5, G5]):
    add(pluck(f, 2.4), END + 0.02 + i * 0.06, 0.8, -0.3 + i * 0.2)
add(pad([98, 196, 293.66, 392], DUR - END, a=0.05), END, 1.4)

mix = np.stack([L, R], 1)
mix /= max(1e-9, np.abs(mix).max()) / 0.89
pcm = (mix * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'out/music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('music ok')
