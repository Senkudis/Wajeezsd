# مكساج الشهادة على طريقة مهارة sound-effects (القياس على الملف المُصدَّر، مؤثرٌ CC0 واحد لكل
# إشارة)، مع الصوت أولاً: sound_pass.py يستبدل صوت الفيديو بالموسيقى والمؤثرات، والشهادة
# صوتُها هو المحتوى. الأولوية: الكلام ← المؤثرات ← الموسيقى (Ducking من غلاف الكلام).
#   python tools/mix.py out/silent.mp4 out/final.mp4
import json, re, subprocess, sys, numpy as np, soundfile as sf
from scipy.signal import resample_poly

SR = 48000
SFX = '../../.claude/skills/sound-effects/sfx/'
video, dst = sys.argv[1], sys.argv[2]
E = json.load(open('edit.json', encoding='utf8'))
run = lambda c: subprocess.run(c, capture_output=True, text=True)

def load(p):
    a, sr = sf.read(p, dtype='float32', always_2d=True)
    if a.shape[1] == 1: a = np.repeat(a, 2, 1)
    if sr != SR: a = resample_poly(a, SR, sr, axis=0).astype(np.float32)
    return a

voice = load('src/voice_edit.wav'); n = int(E['dur'] * SR)
voice = np.pad(voice, ((0, max(0, n - len(voice))), (0, 0)))[:n]
music = load('src/music.wav'); music = np.pad(music, ((0, max(0, n - len(music))), (0, 0)))[:n]

# Ducking: غلاف الكلام (RMS 20ms، صعود 30ms، نزول 250ms) يخفض الموسيقى 10 dB
hop = int(0.02 * SR); m = np.abs(voice[:, 0])
env = np.array([m[i:i + hop].mean() for i in range(0, n, hop)])
on = (env > 0.02).astype(float); sm = np.zeros_like(on); a_up, a_dn = 1 - np.exp(-0.02 / 0.03), 1 - np.exp(-0.02 / 0.25)
for i in range(len(on)): sm[i] = sm[i - 1] + ((a_up if on[i] > sm[i - 1] else a_dn) * (on[i] - sm[i - 1])) if i else on[i]
duck = 10 ** (-10 * np.repeat(sm, hop)[:n] / 20)
MUSIC_DB = -15.0
bed = music * duck[:, None] * 10 ** (MUSIC_DB / 20)

# الإشارات: [زمن، ملف، ربح dB]
c = {x['k']: x for x in E['cuts']}
word = lambda w, k=0: [x['s'] for cc in E['caps'] for x in cc['words'] if x['w'] == w][k]
CUES = [
    (E['hook']['word'] - 0.04, 'impact/kenney-impact-impactsoft-heavy-000.ogg', -9),
    (c['logo']['s'] - 0.05, 'whoosh/fs830856.ogg', -10), (c['logo']['s'] + 0.08, 'pop/kenney-interface-pluck-001.ogg', -8),
    (c['price']['s'] - 0.05, 'transition/fs-816262-broomstick-whoosh-3-quiet-okm1.ogg', -10),
    (c['price']['s'] + 0.75, 'click/kenney-interface-select-001.ogg', -9), (c['price']['s'] + 1.45, 'click/fs788933.ogg', -9),
    (c['offers']['s'], 'pop/fs527522.ogg', -9), (c['offers']['s'] + 0.9, 'pop/fs-824189-pop-in-sfx.ogg', -9),
    (c['offers']['s'] + 2.0, 'click/kenney-interface-toggle-001.ogg', -9),
    (c['badges']['s'] - 0.05, 'whoosh/fs810485.ogg', -10), (c['badges']['s'] + 0.05, 'pop/kenney-interface-drop-001.ogg', -10),
    (max(c['badges']['s'] + 0.4, word('وتنزّل')), 'pop/kenney-interface-drop-002.ogg', -10),
    (c['tracking']['s'] - 0.05, 'transition/fs-683096-woosh.ogg', -11), (word('وتستلم'), 'ding/fs-571513-soft-notifications-bell-ding-d.ogg', -9),
    (E['speech'] - 0.06, 'transition/fs-786514-swoosh-v2.ogg', -9), (E['speech'] + 0.3, 'impact/fs-177242-cinematic-impact.ogg', -8),
    (E['speech'] + 0.62, 'ding/kenney-interface-confirmation-001.ogg', -12),
]
fx = np.zeros((n, 2), np.float32)
for t, f, db in CUES:
    a = load(SFX + f) * 10 ** (db / 20); i = int(t * SR); k = min(len(a), n - i); fx[i:i + k] += a[:k]

mix = voice + fx + bed
sf.write('src/mix_raw.wav', mix, SR)

def export(g, lim):
    af = f'volume={g}dB' + (f',alimiter=limit={lim}:level=false' if lim else '')
    r = run(['ffmpeg', '-y', '-v', 'error', '-i', video, '-i', 'src/mix_raw.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', af,
             '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', dst])
    if r.returncode: sys.exit(r.stderr)
def measure(p, mono=False):
    o = run(['ffmpeg', '-nostats', '-i', p] + (['-ac', '1'] if mono else []) + ['-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr
    return float(re.findall(r'I:\s+([-\d.]+) LUFS', o)[-1]), float(re.findall(r'Peak:\s+([-\d.]+) dBFS', o)[-1])
TARGET, PEAK = -14.0, -1.5
g, lim = 0.0, False
for it in range(10):
    export(g, lim); I, P = measure(dst); print(f'pass {it + 1}: gain {g:+.1f} dB, limiter {lim or "off"} -> {I:.1f} LUFS, true peak {P:.1f} dBFS')
    if abs(I - TARGET) <= 0.5 and P < PEAK: break
    if P >= PEAK: lim = round((lim or 0.8) * 0.92, 3)
    if abs(I - TARGET) > 0.5: g += TARGET - I
Im, Pm = measure(dst, True)
print(f'FINAL {dst}: {I:.1f} LUFS, true peak {P:.1f} dBFS; mono {Im:.1f} LUFS, peak {Pm:.1f} dBFS')
json.dump([{'t': round(t, 3), 'sfx': f, 'gain_db': db} for t, f, db in CUES], open('src/cues_placed.json', 'w'), indent=1)
