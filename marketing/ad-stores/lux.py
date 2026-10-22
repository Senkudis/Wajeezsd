# موسيقى فاخرة لكشف الزيّ: وسادة أوتارٍ هادئة على Am9 ⇐ Fmaj7 ⇐ C ⇐ G،
# وضربات عميقة على لحظات الكشف، وأجراسٌ متباعدة. بلا إيقاعٍ راقص.
#   python lux.py out/lux.wav '{"hits":[3,7.4,9.6,11.8],"dur":15.6}'
import numpy as np, wave, sys, json
T = json.loads(sys.argv[2]); SR = 48000; DUR = T['dur']; n = int(SR * DUR)
L = np.zeros(n); R = np.zeros(n); rng = np.random.default_rng(4)
def add(s, t, g=1.0, pan=0.0):
    i = int(t * SR); j = min(n, i + len(s))
    if i >= n: return
    L[i:j] += s[:j-i] * g * (1 - max(0, pan)); R[i:j] += s[:j-i] * g * (1 + min(0, pan))
def pad(freqs, length, att=1.4, rel=1.2):
    t = np.arange(int(length * SR)) / SR
    e = np.minimum(1, t / att) * np.minimum(1, np.maximum(0, (length - t) / rel))
    s = sum(np.sin(2*np.pi*f*t + 0.4*np.sin(2*np.pi*0.21*t + i)) + 0.5*np.sin(2*np.pi*f*1.003*t) for i, f in enumerate(freqs))
    return s * e * 0.05
def boom():
    t = np.arange(int(2.6 * SR)) / SR
    return np.sin(2*np.pi*(52 - 18*t)*t) * np.exp(-t*1.6) * 0.9 + rng.standard_normal(len(t)) * np.exp(-t*18) * 0.06
def swell(length):
    t = np.arange(int(length * SR)) / SR; x = rng.standard_normal(len(t)); y = np.zeros_like(x); a = 0.03; s = 0.0
    for i in range(len(x)): s += a * (x[i] - s); y[i] = s
    return y * (t / length) ** 2.5 * 1.6
def bell(f, length=2.4):
    t = np.arange(int(length * SR)) / SR
    return (np.sin(2*np.pi*f*t) + 0.4*np.sin(2*np.pi*f*2.76*t) * np.exp(-t*3)) * np.exp(-t*1.8) * 0.09
CH = [[110, 164.8, 246.9, 261.6, 329.6], [87.3, 130.8, 220, 261.6, 329.6], [130.8, 196, 261.6, 329.6, 392], [98, 146.8, 246.9, 293.7, 392]]
seg = DUR / 4
for i, c in enumerate(CH): add(pad(c, seg + 1.6), i * seg - (0.8 if i else 0), 1.0)
for h in T['hits']:
    add(swell(1.2), h - 1.2, 0.5); add(boom(), h, 1.0)
for i, (t, f) in enumerate([(1.0, 659.3), (2.2, 987.8), (4.6, 784), (8.3, 1046.5), (10.4, 880), (12.6, 1318.5), (13.4, 987.8)]):
    if t < DUR: add(bell(f), t, 1.0, -0.4 + 0.15 * i)
mix = np.stack([L, R], 1); mix /= max(1e-9, np.abs(mix).max()) / 0.89
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('lux ok')
