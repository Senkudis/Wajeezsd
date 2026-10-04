"""
موسيقى إعلان وجيز — مؤلَّفة بالكود (لا حقوق لطرفٍ ثالث).

100 BPM: النبضة 0.6 ث، المازورة 2.4 ث — كل قطع مشهدٍ في الإعلان على رأس مازورة.
اللحن: سلّم خماسيّ بوترٍ منقور (Karplus-Strong) — إيماءة للطنبور السوداني —
فوق وسائد دافئة وباص وإيقاع أفريقي (طبل، تصفيق، شاكر، كونغا).

المخرجات: audio/music.wav (الموسيقى + المؤثّرات الصوتية، ستيريو 44.1kHz)
"""
import numpy as np
import wave, os

SR = 44100
BPM = 100
BEAT = 60 / BPM            # 0.6
BAR = BEAT * 4             # 2.4
DUR = 48.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

L = np.zeros(N); R = np.zeros(N)

def add(sig, t0, gain=1.0, pan=0.0):
    """يضع إشارة أحادية عند الزمن t0 مع تحريك ستيريو (-1 يسار .. 1 يمين)."""
    i0 = int(t0 * SR)
    if i0 >= N: return
    sig = sig[: N - i0] * gain
    gl = np.cos((pan + 1) * np.pi / 4); gr = np.sin((pan + 1) * np.pi / 4)
    L[i0:i0 + len(sig)] += sig * gl * 1.414
    R[i0:i0 + len(sig)] += sig * gr * 1.414

def env_ad(n, a, d):
    """غلاف هجوم/خفوت أُسّي"""
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)
    return e

def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); s = 0.0
    # مرشّحٌ بسيط بحلقة — مقبول لطول الإشارات القصيرة
    for i in range(len(x)):
        s = (1 - a) * x[i] + a * s; y[i] = s
    return y

def lp_fft(x, fc, order=2):
    """مرشّح تمرير منخفض في المجال الترددي (سريع للإشارات الطويلة)"""
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    H = 1 / np.sqrt(1 + (f / fc) ** (2 * order))
    return np.fft.irfft(X * H, len(x))

def bp_fft(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    H = (1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)) * (1 / np.sqrt(1 + (f / hi) ** 4))
    return np.fft.irfft(X * H, len(x))

def note(n):  # MIDI → Hz
    return 440.0 * 2 ** ((n - 69) / 12)

# ── الأدوات ──────────────────────────────────────────────────────────
def kick(v=1.0):
    n = int(.45 * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 38)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 7.5)
    click = rng.standard_normal(n) * np.exp(-t * 400) * .25
    return (s * 1.2 + click * .6) * v

def clap(v=1.0):
    n = int(.35 * SR); t = np.arange(n) / SR
    noise = bp_fft(rng.standard_normal(n), 800, 3600)
    e = np.zeros(n)
    for k, d in enumerate([0, .011, .022]):
        i = int(d * SR); e[i:] += np.exp(-(t[: n - i]) * (160 if k < 2 else 22)) * (.7 if k < 2 else 1)
    return noise * e * .55 * v

def shaker(v=1.0):
    n = int(.09 * SR); t = np.arange(n) / SR
    s = bp_fft(rng.standard_normal(n), 5500, 14000)
    return s * np.minimum(1, t / .006) * np.exp(-t * 55) * .19 * v   # أخفض: كان يطغى على الأعلى

def conga(freq=210, v=1.0):
    n = int(.4 * SR); t = np.arange(n) / SR
    f = freq * (1 + .25 * np.exp(-t * 60))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    slap = bp_fft(rng.standard_normal(n), 1200, 4000) * np.exp(-t * 120) * .25
    return (s + slap) * .55 * v

def tick(v=1.0):
    n = int(.05 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1850 * t) * .6 + np.sin(2 * np.pi * 3100 * t) * .3) * np.exp(-t * 160) * v

def pluck(freq, dur=1.4, v=1.0, bright=.5):
    """Karplus-Strong — وترٌ منقور"""
    n = int(dur * SR); p = int(SR / freq)
    buf = rng.uniform(-1, 1, p)
    buf = onepole_lp(buf, 2000 + 6000 * bright)
    out = np.empty(n); idx = 0
    decay = .996
    for i in range(n):
        x = buf[idx]; nxt = buf[(idx + 1) % p]
        buf[idx] = decay * .5 * (x + nxt)
        out[i] = x; idx = (idx + 1) % p
    t = np.arange(n) / SR
    out *= np.minimum(1, t / .002) * np.exp(-t * 1.6)
    # جسم الآلة: رنين خفيف
    out = out + .25 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 6) * out.std()
    return out * .7 * v

def bass(freq, dur=.5, v=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + .35 * np.sin(2 * np.pi * freq * 2 * t) + .12 * np.sin(2 * np.pi * freq * 3 * t)
    return s * np.minimum(1, t / .008) * np.exp(-t * 4.2) * .68 * v

def pad_chord(freqs, dur, v=1.0, cutoff=1400, det=.006):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for f0 in freqs:
        for d in (-det, 0, det):
            f = f0 * (1 + d)
            for h in range(1, 10):          # منشار محدود الحزمة
                if f * h > 9000: break
                s += np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6.28)) / h
    s = lp_fft(s, cutoff)
    a = .35; r = .7
    e = np.minimum(1, t / a) * np.minimum(1, np.maximum(0, (dur - t)) / r)
    return s * e / (len(freqs) * 3) * .5 * v

def whoosh(dur=.7, v=1.0, rising=True):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n); seg = 2048
    for i in range(0, n, seg):           # مرشّحٌ يتحرّك عبر الزمن
        k = i / n
        fc = (400 + 5200 * k) if rising else (5600 - 5200 * k)
        out[i:i + seg] = bp_fft(noise[i:i + seg] if len(noise[i:i + seg]) == seg else np.pad(noise[i:i + seg], (0, seg - len(noise[i:i + seg]))), fc * .6, fc * 1.6)[: len(out[i:i + seg])]
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return out * e * .5 * v

def riser(dur=2.4, v=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n); out = np.zeros(n); seg = 2048
    for i in range(0, n, seg):
        k = i / n; fc = 300 + 7000 * k ** 2
        chunk = noise[i:i + seg]; m = len(chunk)
        out[i:i + m] = bp_fft(np.pad(chunk, (0, seg - m)), fc * .5, fc * 1.4)[:m]
    tone = np.sin(2 * np.pi * np.cumsum(220 + 660 * (t / dur) ** 2) / SR) * .15
    e = (t / dur) ** 2
    return (out * .45 + tone) * e * v

def impact(v=1.0):
    n = int(2.2 * SR); t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 9)) / SR) * np.exp(-t * 2.2)
    crash = bp_fft(rng.standard_normal(n), 2500, 11000) * np.exp(-t * 3.2) * .2
    return (boom * .9 + crash) * v

def ding(v=1.0):
    n = int(1.2 * SR); t = np.arange(n) / SR
    s1 = np.sin(2 * np.pi * 1318.5 * t) * np.exp(-t * 5)
    s2 = np.zeros(n); i = int(.11 * SR)
    s2[i:] = np.sin(2 * np.pi * 1760 * t[: n - i]) * np.exp(-t[: n - i] * 4)
    bell = s1 * .5 + s2 * .6 + .15 * np.sin(2 * np.pi * 3520 * t) * np.exp(-t * 9)
    return bell * .35 * v

def pop(v=1.0, f=900):
    n = int(.12 * SR); t = np.arange(n) / SR
    fr = f * (1 + 1.2 * np.exp(-t * 60))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 40) * .35 * v

# ── التأليف ───────────────────────────────────────────────────────────
# Am  F  C  G   (سلّم A الصغير الخماسي في اللحن)
PROG = [
    ([57, 60, 64], 45),   # Am
    ([53, 57, 60], 41),   # F
    ([60, 64, 67], 48),   # C
    ([55, 59, 62], 43),   # G
]
PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76]   # A C D E G A C D E

def bar_t(b): return b * BAR

# الوسائد: كل المقاطع، تنفتح بعد الشعار وتهدأ في الختام
for b in range(20):
    chord, root = PROG[b % 4]
    cutoff = 700 if b < 2 else (1300 if b < 4 else (1700 if b < 17 else 1200))
    vol = .55 if b < 2 else (.85 if b < 19 else .9)
    add(pad_chord([note(n) for n in chord], BAR + .7, v=vol, cutoff=cutoff, det=.005), bar_t(b), pan=-.25)
    add(pad_chord([note(n + 12) for n in chord[:2]], BAR + .7, v=vol * .35, cutoff=cutoff * 1.4, det=.008), bar_t(b), pan=.3)

# المشهد الأول: تكّات الساعة + نبضٌ خافت + صعود للشعار
for i in range(16):
    add(tick(.55 if i % 2 == 0 else .35), i * BEAT / 2, pan=.4 if i % 2 else -.4)
for b in (0, 1):
    add(kick(.45), bar_t(b)); add(kick(.35), bar_t(b) + 2 * BEAT)
add(riser(2.4, .55), 2.4)

# ضرباتٌ مفتاحية: الشعار والختام
add(impact(.9), 4.8)
add(impact(.85), 40.8)

def groove(b, energy=1.0, half=False):
    t0 = bar_t(b)
    # الطبل: 1، 2و، 3 (نمطٌ أفريقي)، أو 1 و3 في النصف
    kicks = [0, 1.5, 2] if not half else [0, 2]
    for k in kicks: add(kick(.95 * energy), t0 + k * BEAT)
    if not half:
        for k in (1, 3): add(clap(.8 * energy), t0 + k * BEAT, pan=.05)
    for s in range(16):
        acc = 1.0 if s % 4 == 2 else (.65 if s % 2 else .45)
        add(shaker(acc * energy), t0 + s * BEAT / 4, pan=.45)
    if not half:
        for s, f in ((3, 210), (7, 260), (11, 210), (14, 310), (15, 260)):
            add(conga(f, .7 * energy), t0 + s * BEAT / 4, pan=-.4)

def bassline(b, v=1.0):
    chord, root = PROG[b % 4]; t0 = bar_t(b)
    for s, mul in ((0, 1), (3, 1), (6, 2), (8, 1), (11, 1), (14, 2)):
        add(bass(note(root) * mul, .45, v), t0 + s * BEAT / 4)

def melody(b, v=1.0, octave=0, dens=1):
    """أنماطٌ خماسية تتبدّل كل مازورة — ردودٌ بين الصوت والصدى"""
    t0 = bar_t(b)
    patt = [
        [(0, 4), (2, 6), (3, 5), (5, 4), (6, 3), (8, 4), (10, 2), (12, 3)],
        [(0, 3), (1, 4), (3, 5), (4, 4), (6, 2), (8, 1), (11, 2), (12, 3), (14, 4)],
        [(0, 5), (2, 7), (4, 6), (6, 5), (7, 4), (8, 5), (10, 4), (12, 3), (14, 2)],
        [(0, 4), (3, 3), (4, 2), (6, 1), (8, 2), (10, 3), (11, 4), (13, 5)],
    ][b % 4]
    for i, (s, deg) in enumerate(patt):
        if dens < 1 and i % 2: continue
        f = note(PENTA[deg] + 12 * octave)
        add(pluck(f, 1.2, v * (1.0 if s % 4 == 0 else .75), bright=.55), t0 + s * BEAT / 4, pan=(-.2 if i % 2 else .2))

# المشهد الثاني: الشعار — لحنٌ يبدأ هادئاً، وطبلٌ في المازورة الثانية
melody(2, .7, dens=.5); melody(3, .8)
groove(3, .7, half=True); bassline(3, .7)

# المشاهد 3–7: الإيقاع الكامل
for b in range(4, 16):
    e = 1.0 if b < 10 else 1.08 if b < 13 else 1.0
    groove(b, e); bassline(b)
    melody(b, .85, octave=(1 if 10 <= b < 13 and b % 2 else 0))
# المازورة 16 (38.4–40.8): تفريغٌ وصعود نحو الختام
melody(16, .7, dens=.5); bassline(16, .6)
for s in range(16):  # لفّة تصفيق متصاعدة
    add(clap(.25 + .5 * s / 15), bar_t(16) + 1.2 + s * BEAT / 8 * .5 + (s * .0), pan=0)
add(riser(2.4, .6), 38.4)

# الختام: 17–18 كامل، 19 خاتمة
for b in (17, 18):
    groove(b, 1.05); bassline(b); melody(b, .9, octave=1 if b == 18 else 0)
add(kick(1.0), bar_t(19)); add(bass(note(45), 1.6, 1.0), bar_t(19))
add(pluck(note(69), 2.6, 1.0, .5), bar_t(19)); add(pluck(note(76), 2.6, .7, .5), bar_t(19) + .3)

# ── المؤثّرات الصوتية (على الصورة) ─────────────────────────────────
for ts in (9.6, 16.8, 24.0, 31.2, 36.0):
    add(whoosh(.75, .55), ts - .55, pan=0)
add(whoosh(.6, .4, rising=False), 20.2, pan=.3)          # تبديل الشاشة إلى «اشترِ لي»
add(ding(1.0), 12.42)                                     # إشعار «قبل الكابتن طلبك»
for t0, f in ((13.3, 820), (13.8, 960), (21.6, 880), (21.9, 990), (22.2, 1100), (22.5, 1240),
              (25.0, 900), (25.4, 1050), (31.9, 760), (32.2, 860), (32.5, 960), (32.8, 1080), (42.0, 700)):
    add(pop(.9, f), t0)

# ── الميكس والماستر ──────────────────────────────────────────────────
# صدى للفضاء: تأخيرٌ مُرتدّ خفيف (نوتة نقطية) على المزيج كله بنسبة صغيرة
def echo(x, delay, fb, mix):
    d = int(delay * SR); y = x.copy()
    for i in range(1, 5):
        sh = d * i
        if sh >= len(x): break
        y[sh:] += x[:-sh] * (fb ** i)
    return x * (1 - mix) + y * mix
L = echo(L, BEAT * .75, .35, .18); R = echo(R, BEAT * .75 * 1.02, .35, .18)

# تلاشٍ أخير
fade = np.ones(N); fi = int(46.6 * SR); fade[fi:] = np.linspace(1, 0, N - fi) ** 1.5
fade[: int(.02 * SR)] = np.linspace(0, 1, int(.02 * SR))
L *= fade; R *= fade

# توازن: تليين الأعلى قليلاً (الشاكر والضوضاء) ودفءٌ في الأسفل
def tone(x):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    shelf_hi = 1 / np.sqrt(1 + (f / 7500) ** 2) * .45 + .55        # ‎-3..-5 dB فوق 8kHz
    shelf_lo = 1 + .35 / (1 + (f / 140) ** 4)                       # +2.6 dB تحت 140Hz
    return np.fft.irfft(X * shelf_hi * shelf_lo, len(x))
L = tone(L); R = tone(R)

# ضغطٌ ناعم + تطبيع إلى -1 dBFS
def master(x):
    x = np.tanh(x * 1.6) / np.tanh(1.6)
    return x
peak = max(np.abs(L).max(), np.abs(R).max())
L /= peak; R /= peak
L = master(L * .95); R = master(R * .95)
peak = max(np.abs(L).max(), np.abs(R).max())
g = 10 ** (-1 / 20) / peak
L *= g; R *= g

os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'audio'), exist_ok=True)
out = os.path.join(os.path.dirname(__file__), '..', 'audio', 'music.wav')
pcm = (np.stack([L, R], axis=1) * 32767).astype(np.int16)
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
rms = np.sqrt(np.mean(L ** 2))
print('wrote', out, f'{DUR}s', 'rms dBFS', round(20 * np.log10(rms), 1))
