# موسيقى خلفية + مؤثرات، مركّبة بالكود (لا عيّنات خارجية → لا مطالبات حقوق).
# python tools/music.py edit.json out/music.wav out/sfx.wav
# 96 BPM، سلّم خماسي (D E F# A B)، وتر مقطوف قريب من الطمبور + باد دافئ + دلّوكة خفيفة.
# الموسيقى هادئة تحت الكلام (تُخفَّض أكثر بالـ sidechain عند الدمج)، وتعلو في بطاقة النهاية.
import numpy as np, wave, sys, json

E = json.load(open(sys.argv[1], encoding='utf-8'))
SR = 48000; DUR = E['dur']; END = E['endcard']; BPM = 96; B = 60 / BPM
n = int(SR * DUR); rng = np.random.default_rng(7)

def buf(): return np.zeros((2, n))
def add(dst, sig, t, g=1.0, pan=0.0):
    i = int(t * SR)
    if i >= n: return
    if i < 0: sig = sig[-i:]; i = 0
    j = min(n, i + len(sig)); s = sig[:j - i] * g
    dst[0, i:j] += s * (1 - max(0, pan)); dst[1, i:j] += s * (1 + min(0, pan))
def tt(sec): return np.arange(int(sec * SR)) / SR
def lp(x, fc):  # مرشّح تمرير منخفض أحادي القطب (متّجه عبر lfilter بسيط)
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for k in range(len(x)): s = (1 - a) * x[k] + a * s; y[k] = s
    return y

def pluck(f, dur=1.4, bright=.5):  # Karplus-Strong
    N = int(SR / f); L = int(dur * SR); y = np.zeros(L)
    y[:N] = rng.uniform(-1, 1, N) * np.hanning(N) ** .3
    for k in range(N, L): y[k] = .5 * (y[k - N] + y[k - N + 1]) * (.994 + .004 * bright)
    return y * np.exp(-tt(dur) * .6) * .5
def pad(f, dur):
    t = tt(dur); x = sum(np.sin(2 * np.pi * f * m * t + rng.uniform(0, 6)) / (m ** 1.3) for m in (1, 2, 3, 4))
    x += .6 * np.sin(2 * np.pi * f * 1.003 * t)
    a = np.minimum(1, t / .8) * np.minimum(1, (dur - t) / .8)
    return x * a * .12
def dum():
    t = tt(.4); f = 60 + 80 * np.exp(-t * 30); return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .11) * .8
def tak():
    t = tt(.1); x = rng.standard_normal(len(t)); x = x - np.convolve(x, np.ones(3) / 3, 'same')
    return (x * .4 + np.sin(2 * np.pi * 700 * t) * .5) * np.exp(-t / .02) * .35
def shaker():
    t = tt(.07); x = rng.standard_normal(len(t)); x = x - np.convolve(x, np.ones(2) / 2, 'same'); return x * np.exp(-t / .012) * .045
def bass(f, dur):
    t = tt(dur); return np.tanh(1.6 * np.sin(2 * np.pi * f * t)) * np.exp(-t / .5) * .32

D, Em, Fs, A, Bn = 146.83, 164.81, 185.0, 220.0, 246.94
SCALE = [D, Em, Fs, A, Bn, 2 * D, 2 * Em, 2 * Fs]
CH = [(D, A), (Bn / 2, Fs), (Em, Bn), (A / 2, Em)]  # تقدّم 4 مازورات

M = buf()
bars = int(DUR / (4 * B)) + 2
mel = [0, 2, 3, 2, 4, 3, 2, 1, 0, 2, 3, 5, 4, 3, 2, 0]
for bar in range(bars):
    t0 = bar * 4 * B
    if t0 > DUR: break
    r, fth = CH[bar % 4]
    add(M, pad(r, 4 * B + .8), t0, .9, -.2); add(M, pad(fth, 4 * B + .8), t0, .7, .2)
    add(M, bass(r / 2, 2 * B), t0, 1.0); add(M, bass(r / 2, 2 * B), t0 + 2.5 * B, .7)
    for beat in range(4):
        tb = t0 + beat * B
        add(M, dum(), tb, .9 if beat in (0, 2) else .5)
        add(M, tak(), tb + .5 * B, .8, .3); add(M, tak(), tb + .75 * B, .4, -.3)
        for s in (1, 3): add(M, shaker(), tb + s * B / 4, 1, .5)
    # لحن خفيف كل مازورة ثانية
    if bar % 2 == 1:
        for k in range(8):
            note = SCALE[mel[(bar * 8 + k) % len(mel)] % len(SCALE)] * 2
            if rng.random() < .75: add(M, pluck(note, 1.2, .3), t0 + k * B / 2, .55, (-.4 if k % 2 else .4))

# الخاتمة: نغمة طويلة + صعود يكتمل عند بطاقة النهاية
t = tt(DUR - END)
end_env = np.minimum(1, t / .05) * np.exp(-t / 1.6)
for f in (D, A, 2 * D, 2 * Fs): add(M, np.sin(2 * np.pi * f * t) * end_env * .14, END)
add(M, pluck(2 * D, 2.5, .8), END, 1.0); add(M, pluck(2 * A, 2.5, .8), END + .12, .8, .3)
# تلاشي نهاية الملف
fade = np.ones(n); k = int(1.2 * SR); fade[-k:] = np.linspace(1, 0, k); M *= fade
# الموسيقى قبل الخطّاف تبدأ بلطف
k = int(.03 * SR); M[:, :k] *= np.linspace(0, 1, k)   # تبدأ فوراً مع الهوك

# ── المؤثرات ──
S = buf()
def whoosh(dur=.45):
    t = tt(dur); x = rng.standard_normal(len(t)); env = np.sin(np.pi * t / dur) ** 2
    lo = lp(x, 900) ; hi = x - lo
    sweep = np.interp(t, [0, dur], [0, 1]); return (lo * (1 - sweep) + hi * .35 * sweep) * env * .5
def pop():
    t = tt(.12); f = 900 * np.exp(-t * 18) + 300; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .03) * .45
def impact():
    t = tt(1.6); f = 45 + 70 * np.exp(-t * 12); x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .5)
    nz = rng.standard_normal(len(t)) * np.exp(-t / .08) * .3; return (x + lp(nz, 3000)) * .8
def riser(dur):
    t = tt(dur); x = rng.standard_normal(len(t)); y = np.zeros_like(x); s = 0.
    a = np.exp(-2 * np.pi * np.interp(t, [0, dur], [300, 6000]) / SR)
    for k in range(len(x)): s = (1 - a[k]) * x[k] + a[k] * s; y[k] = s
    return y * (t / dur) ** 2 * .6
def chime():
    t = tt(1.2); return sum(np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, d in ((1318.5, .5), (1975.5, .35), (2637, .2))) * .12

for c in E.get('sfx', []):
    kind, at, g = c['k'], c['t'], c.get('g', 1)
    if kind == 'whoosh': add(S, whoosh(), at - .2, g)
    elif kind == 'pop': add(S, pop(), at, g)
    elif kind == 'chime': add(S, chime(), at, g)
    elif kind == 'impact': add(S, impact(), at, g)
    elif kind == 'riser': add(S, riser(c.get('d', 1.2)), at - c.get('d', 1.2), g)

def save(p, x):
    x = x / max(1e-6, np.abs(x).max()) * .89
    w = wave.open(p, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((x.T * 32767).astype('<i2').tobytes()); w.close()
save(sys.argv[2], M); save(sys.argv[3], S); print('music+sfx', DUR)
