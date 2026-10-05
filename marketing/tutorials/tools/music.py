"""
موسيقى خلفية لفيديوهات الشرح — مؤلَّفة بالكود (لا حقوق لطرفٍ ثالث).

    python tools/music.py <ثوانٍ> <ملف.wav>

هادئةٌ عمداً: الكلام هو البطل. وسائد دافئة على تتابع (ري صغير ← سي بيمول ←
فا ← دو)، وباصٌ ناعم، وشاكرٌ خفيف، ونقراتُ وترٍ خماسية متباعدة (إيماءة
للطنبور السوداني). تبدأ وتنتهي بتلاشٍ، وتُكرَّر بلا خياطةٍ ظاهرة.
"""
import sys, wave
import numpy as np

SR = 44100
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 60.0
OUT = sys.argv[2] if len(sys.argv) > 2 else 'bed.wav'
BPM = 84
BEAT = 60 / BPM
BAR = BEAT * 4
N = int(SR * DUR)
rng = np.random.default_rng(11)
L = np.zeros(N); R = np.zeros(N)


def note(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def lp_fft(x, fc, order=2):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / np.sqrt(1 + (f / fc) ** (2 * order)), len(x))


def add(sig, t0, gain=1.0, pan=0.0):
    i0 = int(t0 * SR)
    if i0 >= N: return
    sig = sig[: N - i0] * gain
    gl = np.cos((pan + 1) * np.pi / 4); gr = np.sin((pan + 1) * np.pi / 4)
    L[i0:i0 + len(sig)] += sig * gl * 1.414
    R[i0:i0 + len(sig)] += sig * gr * 1.414


def pad(freqs, dur):
    """وسادة: موجاتٌ منشارية منزاحة قليلاً، مُرشَّحة، بهجومٍ وخفوتٍ ناعمين"""
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            ff = f * 2 ** (det / 12)
            s += 2 * ((t * ff) % 1.0) - 1
    s = lp_fft(s, 1100, 2)
    env = np.minimum(1, t / 1.2) * np.minimum(1, (dur - t) / 1.4)
    return s * env / (len(freqs) * 3)


def bass(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    env = np.minimum(1, t / 0.05) * np.exp(-t / (dur * 0.9))
    return s * env


_PLUCKS = {}
def pluck(f, dur=1.6):
    """وترٌ منقور (Karplus-Strong) — يُحسب مرّةً لكل نغمة (الحلقة بطيئة في بايثون)"""
    key = (round(f, 3), dur)
    if key not in _PLUCKS: _PLUCKS[key] = _pluck(f, dur)
    return _PLUCKS[key]


def _pluck(f, dur):
    n = int(dur * SR); p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p); out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.996 * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return lp_fft(out, 3200)


def shaker(dur=0.08):
    n = int(dur * SR); t = np.arange(n) / SR
    s = rng.uniform(-1, 1, n) * np.exp(-t / 0.018)
    X = np.fft.rfft(s); f = np.fft.rfftfreq(n, 1 / SR)
    return np.fft.irfft(X * (f > 5000), n)


# التتابع: Dm  Bb  F  C  (بأصوات وسطى دافئة)
CHORDS = [[50, 53, 57, 62], [46, 50, 53, 58], [53, 57, 60, 65], [48, 52, 55, 60]]
ROOTS = [38, 34, 41, 36]
PENTA = [62, 65, 67, 69, 72, 74, 77]   # ري خماسي صغير

bars = int(np.ceil(DUR / BAR))
for b in range(bars):
    t0 = b * BAR
    ci = b % 4
    add(pad([note(m) for m in CHORDS[ci]], BAR + 1.2), t0, 0.55)
    add(bass(note(ROOTS[ci]), BAR * 0.95), t0, 0.32)
    add(bass(note(ROOTS[ci]), BEAT * 1.6), t0 + BEAT * 2.5, 0.16)
    # شاكرٌ بالثُمن — خافت، أعلى قليلاً على الضربات الضعيفة
    if b >= 2:
        for k in range(8):
            add(shaker(), t0 + k * BEAT / 2, 0.035 if k % 2 else 0.02, pan=0.35)
    # نقراتٌ متباعدة: نغمتان أو ثلاث في المازورة، تتبدّل كل أربع
    if b >= 1:
        pattern = [(0.0, 0), (1.5, 2), (2.5, 4)] if (b // 4) % 2 == 0 else [(0.5, 3), (2.0, 1), (3.0, 5)]
        for (bt, idx) in pattern:
            if rng.random() < 0.8:
                add(pluck(note(PENTA[(idx + ci) % len(PENTA)])), t0 + bt * BEAT, 0.16, pan=rng.uniform(-0.5, 0.5))

# تلاشٍ في البداية والنهاية، وتطبيع
fade = np.ones(N); fi = int(2.5 * SR); fo = int(4 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo)
L *= fade; R *= fade
peak = max(np.abs(L).max(), np.abs(R).max(), 1e-9)
L = L / peak * 0.6; R = R / peak * 0.6
st = np.stack([L, R], axis=1)
pcm = (st * 32767).astype(np.int16)
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f'music: {OUT}  {DUR:.0f}s')
