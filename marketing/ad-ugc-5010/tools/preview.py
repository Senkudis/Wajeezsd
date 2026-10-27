# معاينة إطارات: يركّب الطبقة qc/ov_t.png على الإطار الملوّن المقابل بعد القص والزووم → qc/preview.jpg
import json, subprocess, sys
E = json.load(open('edit.json', encoding='utf-8')); FF = open('tools/ffpath.txt').read().strip()
ts = sys.argv[1].split(','); tiles = []
for ts_ in ts:
    t = float(ts_)
    acc = 0; src = None
    for s in E['segments']:
        d = s['e'] - s['s']
        if t < acc + d: k = (t - acc) / d; src = s['s'] + t - acc; z = s['z'] + (s['z2'] - s['z']) * k; cy = s['cy']; break
        acc += d
    if src is None: s = E['segments'][-1]; src = s['e'] - .05; z = s['z2']; cy = s['cy']
    o = f'qc/pv_{ts_}.jpg'; tiles.append(o)
    vf = f"[0:v]scale=w=trunc(1080*{z}/2)*2:h=trunc(1920*{z}/2)*2,crop=1080:1920:(iw-1080)/2:(ih-1920)*{cy}[b];[b][1:v]overlay,scale=360:-1"
    subprocess.run([FF, '-loglevel', 'error', '-y', '-ss', str(src), '-i', 'src/graded.mp4', '-i', f'qc/ov_{ts_}.png', '-filter_complex', vf, '-frames:v', '1', o], check=True)
n = len(tiles); cols = min(n, 7)
args = sum([['-i', p] for p in tiles], [])
lay = '|'.join(f'{(i % cols) * 360}_{(i // cols) * 640}' for i in range(n))
subprocess.run([FF, '-loglevel', 'error', '-y', *args, '-filter_complex', f"xstack=inputs={n}:layout={lay}:fill=black", sys.argv[2] if len(sys.argv) > 2 else 'qc/preview.jpg'], check=True)
