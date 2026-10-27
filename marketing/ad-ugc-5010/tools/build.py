# التجميع النهائي: قصّ المقاطع + تلوين + زووم ديناميكي + طبقة الموشن + مزج الصوت.
# python tools/build.py edit.json   (يفترض out/overlay.mov و out/music.wav و out/sfx.wav جاهزة)
import json, subprocess, sys
import numpy as np

E = json.load(open(sys.argv[1], encoding='utf-8'))
FF = open('tools/ffpath.txt').read().strip()
SRC = 'src/graded.mp4'  # المصدر ملوّن مسبقاً (tools/grade.txt) بـ 30 إطاراً، كل إطار مفتاحي
GRADE = open('tools/grade.txt').read().strip()
FPS = 30; DUR = E['dur']; END = E['endcard']

# كل مقطع: [من, إلى, زووم, مركز_y اختياري] بزمن المصدر
segs = E['segments']
vparts, aparts, fc = [], [], []
FACES = json.load(open('src/faces.json'))   # [t, x, خط العين, ارتفاع الوجه] منعّمة (tools/track_face.py)
EYE_Y = E.get('eye_y', 690)                  # خط العين الثابت في الإطار (≈ الثلث العلوي)

def track_expr(a, b, col, step=.3):
    """تعبير ffmpeg خطّي متقطّع لقيمة الوجه داخل المقطع (t يبدأ من 0)، مع تنعيم إضافي ~0.6 ث."""
    import numpy as np
    arr = np.array(FACES); ts = arr[:, 0]; vals = arr[:, col]
    k = np.exp(-np.linspace(-2, 2, 13) ** 2); k /= k.sum(); vals = np.convolve(np.pad(vals, 6, mode='edge'), k, 'valid')
    pts = [(round(t - a, 3), round(float(np.interp(t, ts, vals)), 1)) for t in list(np.arange(a, b, step)) + [b]]
    e = str(pts[-1][1])
    for (t0, v0), (t1, v1) in reversed(list(zip(pts, pts[1:]))):
        e = f"if(lt(t,{t1}),{v0}+({v1}-{v0})*(t-{t0})/{max(t1 - t0, .001)},{e})"
    return e

for i, s in enumerate(segs):
    a, b, z = s['s'], s['e'], s.get('z', 1.2)
    d = b - a
    fx, ey = track_expr(a, b, 1), track_expr(a, b, 2)
    # كاميرا افتراضية: تكبير ثابت للمقطع، والقصّ يتبع الوجه ويُبقي العينين على EYE_Y
    fc.append(
        f"[0:v]trim={a}:{b},setpts=PTS-STARTPTS,"
        f"scale=w={int(1080 * z / 2) * 2}:h={int(1920 * z / 2) * 2}:flags=lanczos,"
        f"crop=1080:1920:x='max(0,min(iw-1080,{z}*({fx})-540))':y='max(0,min(ih-1920,{z}*({ey})-{EYE_Y}))',"
        f"setsar=1,format=yuv420p[v{i}]")
    vparts.append(f"[v{i}]")
# الصوت يُقصّ على مقاطع الكلام فقط (لا على تقسيمات الزووم) كي لا تتقطّع الكلمات
for i, (a, b) in enumerate(E.get('audio_segs', [[s['s'], s['e']] for s in segs])):
    fc.append(f"[1:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st={b-a-0.015:.3f}:d=0.015[a{i}]")
    aparts.append(f"[a{i}]")
fc.append(f"{''.join(vparts)}concat=n={len(vparts)}:v=1:a=0[vc]")
fc.append(f"{''.join(aparts)}concat=n={len(aparts)}:v=0:a=1[voice0]")
# امدّ الفيديو حتى نهاية بطاقة النهاية (البطاقة تغطيه)
fc.append(f"[vc]tpad=stop_mode=clone:stop_duration={DUR},trim=0:{DUR},setpts=PTS-STARTPTS[vbase]")
fc.append("[2:v]setpts=PTS-STARTPTS,format=argb[ov]")
fc.append(f"[vbase][ov]overlay=0:0:format=auto:shortest=0,trim=0:{DUR},format=yuv420p[vout]")
# الصوت: الصوت البشري منظّف مسبقاً؛ الموسيقى تنخفض تحته (sidechain) وتعلو في النهاية
fc.append(f"[voice0]aformat=channel_layouts=stereo,apad=whole_dur={DUR},asplit=2[voice][key]")
fc.append(f"[3:a]volume='if(lt(t,{END}),{E.get('music_gain',0.22)},0.75)':eval=frame[mus0]")
fc.append("[mus0][key]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350:makeup=1[mus]")
fc.append(f"[4:a]volume={E.get('sfx_gain',0.5)}[sfx]")
fc.append(f"[voice][mus][sfx]amix=inputs=3:normalize=0:duration=first,atrim=0:{DUR},"
          "loudnorm=I=-14:TP=-1.0:LRA=9,aresample=48000,afade=t=in:d=0.01[aout]")

cmd = [FF, '-y', '-hide_banner', '-loglevel', 'warning', '-stats',
       '-i', SRC, '-i', 'out/voice_pre.wav', '-i', 'out/overlay.mov', '-i', 'out/music.wav', '-i', 'out/sfx.wav',
       '-filter_complex', ';'.join(fc), '-map', '[vout]', '-map', '[aout]',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
       '-r', str(FPS), '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', E.get('outfile', 'out/wajeez-ad-final.mp4')]
open('qc/filter.txt', 'w', encoding='utf-8').write(';\n'.join(fc))
subprocess.run(cmd, check=True)
print('built', E.get('outfile', 'out/wajeez-ad-final.mp4'))
