# موسيقى الإعلان مُركّبة بالكود: 120 BPM (نبضة = 0.5 ث، مازورة = 2 ث).
# بناءٌ خفيف قبل 2.0 ث، ثم «الدخول» مع لقطة الشارع، وخاتمة ترنّ بعد 13.6 ث.
import numpy as np, wave, sys

import json
T = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {'drop': 2.0, 'end': 13.6, 'dur': 15.5}
SR, DUR, BPM = 48000, T['dur'], 120
B = 60 / BPM
n = int(SR * DUR)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(7)
DROP, END = T['drop'], T['end']

def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR); j = min(n, i + len(sig))
    if i >= n: return
    s = sig[: j - i] * gain
    L[i:j] += s * (1 - max(0, pan)); R[i:j] += s * (1 + min(0, pan))

def env(len_s, a=0.002, d=0.2):
    t = np.arange(int(len_s * SR)) / SR
    return np.minimum(1, t / a) * np.exp(-t / d), t

def kick():
    e, t = env(0.45, 0.001, 0.12)
    f = 45 + 110 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * e * 1.0

def clap():
    e, t = env(0.25, 0.001, 0.06)
    x = rng.standard_normal(len(t)) * e
    return np.convolve(x, np.ones(6) / 6, 'same') * 0.55

def hat(open_=False):
    e, t = env(0.18 if open_ else 0.05, 0.0005, 0.06 if open_ else 0.012)
    x = rng.standard_normal(len(t))
    x = x - np.convolve(x, np.ones(4) / 4, 'same')     # تمرير عالٍ تقريبي
    return x * e * 0.22

def bass(freq, length):
    e, t = env(length, 0.005, length * 0.7)
    s = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t)
    return np.tanh(s * 1.6) * e * 0.38

def pluck(freq, length=0.35):
    e, t = env(length, 0.002, 0.09)
    s = np.sign(np.sin(2 * np.pi * freq * t)) * 0.5 + np.sin(2 * np.pi * freq * 2 * t) * 0.5
    return s * e * 0.10

def riser(length):
    t = np.arange(int(length * SR)) / SR
    x = rng.standard_normal(len(t)) * (t / length) ** 2
    return x * 0.10

def impact():
    e, t = env(1.6, 0.001, 0.5)
    sub = np.sin(2 * np.pi * (60 - 25 * t) * t) * e
    nz = rng.standard_normal(len(t)) * np.exp(-t / 0.08)
    return sub * 0.9 + nz * 0.25

# المقامات: Am – F – C – G (جذورٌ منخفضة للباص، ونغماتٌ للنقر)
ROOTS = [55.0, 43.65, 65.41, 49.0]
ARP = [[440, 523.25, 659.25, 523.25], [349.23, 440, 523.25, 440], [392, 523.25, 659.25, 523.25], [392, 493.88, 587.33, 493.88]]

# البناء 0–2: نقرٌ وهاتٌ ورايزر — بلا كيك ثقيل
add(riser(DROP), 0.0, 1.0)
for i in range(int(DROP / B)):
    add(hat(), i * B + B / 2, 0.8, 0.3)
for i, f in enumerate((ARP[0] * 4)[: int(DROP / B)]):
    add(pluck(f), i * B, 0.9, -0.2)
add(kick(), 0.02, 0.6)

add(impact(), DROP, 0.9)
t = DROP
while t < END - 1e-6:
    beat = int(round((t - DROP) / B))
    bar = beat // 4
    add(kick(), t, 1.0)
    if beat % 2 == 1: add(clap(), t, 1.0)
    add(hat(), t + B / 2, 1.0, 0.25)
    if beat % 4 == 3: add(hat(True), t + B * 0.75, 0.7, -0.25)
    if beat % 4 == 0: add(bass(ROOTS[bar % 4], B * 4), t, 1.0)
    arp = ARP[bar % 4]
    add(pluck(arp[beat % 4] * 2, 0.25), t + B / 2, 0.75, -0.3 if beat % 2 else 0.3)
    t += B

# خاتمة: ضربة وذيل وتر
add(impact(), END, 1.0)
for f in [220, 261.63, 329.63, 440]:
    e, tt = env(1.9, 0.01, 0.9)
    add(np.sin(2 * np.pi * f * tt) * e * 0.08, END + 0.02, 1.0)

mix = np.stack([L, R], 1)
mix /= max(1e-9, np.abs(mix).max()) / 0.89
pcm = (mix * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'out/music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('music ok')
