# نسخة 15 ث من الماستر — كل قطعٍ على ضربة (BEAT_SHEET.md ← «نسخة 15 ث»):
#   الخطّاف [0–2.5] ← التحوّل [6.25–7.5] ← العروض والاختيار [13.75–20] ← التتبّع [22.5–24.375]
#   ← المستطيل الأخضر والختام [26.875–30]  = 15.0 ث
# الصوت يُقصّ مع الصورة بتلاشٍ 15ms على كل وصلة، ثم يُضبط إلى ‎-16 LUFS وذروة < ‎-4 dBFS
# مقيسةً على الملف المُصدَّر (كما في sound_pass.py).
#   python tools/cut15.py out/final_16x9.mp4 out/final_16x9_15s.mp4
import subprocess, sys, re

SEGS = [(0, 2.5), (6.25, 7.5), (13.75, 20.0), (22.5, 24.375), (26.875, 30.0)]
src, dst = sys.argv[1], sys.argv[2]
run = lambda c: subprocess.run(c, capture_output=True, text=True)
F = 0.015

def build(gain, limit):
    v = ''.join(f'[0:v]trim={a}:{b},setpts=PTS-STARTPTS[v{i}];' for i, (a, b) in enumerate(SEGS))
    au = ''.join(f'[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d={F},afade=t=out:st={b - a - F}:d={F}[a{i}];' for i, (a, b) in enumerate(SEGS))
    cat = ''.join(f'[v{i}][a{i}]' for i in range(len(SEGS))) + f'concat=n={len(SEGS)}:v=1:a=1[v][a0];'
    post = f'[a0]volume={gain}dB' + (f',alimiter=limit={limit}:level=false' if limit else '') + '[a]'
    r = run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-filter_complex', v + au + cat + post, '-map', '[v]', '-map', '[a]',
             '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', dst])
    if r.returncode: sys.exit(r.stderr)

def measure(p, mono=False):
    o = run(['ffmpeg', '-nostats', '-i', p] + (['-ac', '1'] if mono else []) + ['-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr
    return float(re.findall(r'I:\s+([-\d.]+) LUFS', o)[-1]), float(re.findall(r'Peak:\s+([-\d.]+) dBFS', o)[-1])

g, lim = 0.0, False
for it in range(10):
    build(g, lim); I, P = measure(dst)
    print(f'pass {it + 1}: gain {g:+.1f} dB, limiter {lim or "off"} -> {I:.1f} LUFS, true peak {P:.1f} dBFS')
    if abs(I + 16) <= 0.5 and P < -4: break
    if P >= -4: lim = round((lim or 0.6) * 0.9, 3)
    if abs(I + 16) > 0.5: g += (-16 - I)
Im, Pm = measure(dst, True)
d = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst]).stdout.strip().rstrip(',')
print(f'FINAL {dst}: {d}s, {I:.1f} LUFS, true peak {P:.1f} dBFS; mono {Im:.1f} LUFS, peak {Pm:.1f} dBFS')
