# المؤثرات من مكتبة مهارة sound-effects (تسجيلات حقيقية CC0) بدل المؤثرات المركّبة بالكود.
# python tools/sfx_kit.py edit.json out/sfx.wav
# كل نوع يتناوب على أكثر من تسجيل (لا تكرار آلي)، والـ riser يُوضع لينتهي على الضربة.
import json, subprocess, sys, wave
import numpy as np

E = json.load(open(sys.argv[1], encoding='utf-8'))
FF = open('tools/ffpath.txt').read().strip()
LIB = '../../.claude/skills/sound-effects/sfx/'
SR = 48000; n = int(SR * E['dur'])
KIT = {
    'whoosh': ['kit/whoosh.ogg', 'whoosh/fs-683101-quick-woosh.ogg', 'transition/fs-816262-broomstick-whoosh-3-quiet-okm1.ogg'],
    'pop': ['kit/pop.ogg', 'pop/fs-824189-pop-in-sfx.ogg', 'pop/kenney-interface-drop-001.ogg'],
    'impact': ['kit/impact.ogg', 'impact/kenney-impact-impactsoft-heavy-000.ogg'],
    'riser': ['kit/riser.ogg'],
    'tick': ['kit/tick.ogg'],
    'ding': ['ding/fs-571513-soft-notifications-bell-ding-d.ogg'],
}
cache = {}
def load(f):
    if f not in cache:
        raw = subprocess.run([FF, '-v', 'error', '-i', LIB + f, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
        cache[f] = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy()
    return cache[f]

S = np.zeros((2, n)); used = {}; turn = {}
for c in E['sfx']:
    files = KIT[c['k']]; i = turn.get(c['k'], 0); turn[c['k']] = i + 1
    f = files[i % len(files)]; x = load(f) * c.get('g', 1)
    at = c['t'] - x.shape[1] / SR if c.get('end') else c['t']   # riser: ينتهي على اللحظة
    a = int(round(at * SR)); src = x
    if a < 0: src = x[:, -a:]; a = 0
    b = min(n, a + src.shape[1]); S[:, a:b] += src[:, :b - a]
    used.setdefault(f, []).append(round(c['t'], 2))

w = wave.open(sys.argv[2], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((np.clip(S, -1, 1).T * 32767).astype('<i2').tobytes()); w.close()
# سجلّ الاعتمادات للأصوات المستعملة فعلاً (من manifest المهارة)
M = json.load(open(LIB + 'manifest.json', encoding='utf-8'))
meta = {e['file']: e for e in M['bundled'] + M['default_kit'] if e.get('file')}
lines = ['Sound effects (all CC0 1.0, from the sound-effects skill library):']
for f, ts in used.items():
    e = meta.get(f, {}); lines.append(f"- {e.get('credit') or e.get('title') or f}  [{e.get('license', '?')}]  at {', '.join(map(str, ts))}s")
lines += ['', 'Music: original, composed in code for this ad (tools/music.py), no third-party samples.']
open('CREDITS.txt', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('sfx', len(E['sfx']), 'cues,', len(used), 'files; licences:', sorted({meta.get(f, {}).get('license', '?') for f in used}))
