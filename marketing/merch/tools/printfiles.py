# ملفات المطبعة/التطريز بمقاساتها الحقيقية بالملّيمتر — من ملفات src/*.svg
#   python tools/printfiles.py   ⇐ print/*.svg (+ print/*.png بدقة 300 DPI عبر snap)
import re
SPEC = [
    # (الملف الناتج, المصدر, العرض بالمم, الوصف)
    ('tshirt-front-chest', 'lockup', 95, 'تيشيرت — الصدر الأيسر (يسار اللابس)'),
    ('tshirt-back', 'lockup', 280, 'تيشيرت — الظهر'),
    ('cap-front', 'mark', 60, 'كاب — الأمام (تطريز)'),
    ('cap-side', 'chevron', 18, 'كاب — الجانب الأيسر (تطريز)'),
    ('cap-back', 'wajeez-latin', 65, 'كاب — الخلف فوق الحزام (تطريز)'),
]
rows = []
for out, src, wmm, desc in SPEC:
    t = open(f'src/{src}.svg', encoding='utf8').read()
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', t).group(1).split()]
    hmm = wmm * vb[3] / vb[2]
    t = re.sub(r'width="[^"]+" height="[^"]+"', f'width="{wmm}mm" height="{hmm:.1f}mm"', t, count=1)
    open(f'print/{out}.svg', 'w', encoding='utf8').write(t)
    rows.append((out, desc, wmm, round(hmm, 1)))
    # صفحة PNG بدقة 300 DPI (خلفية شفافة)
    px_w, px_h = round(wmm / 25.4 * 300), round(hmm / 25.4 * 300)
    open(f'print/_{out}.html', 'w', encoding='utf8').write(
        f'<html><body style="margin:0;background:transparent"><img src="{out}.svg" style="width:{px_w}px;height:{px_h}px;display:block"></body></html>')
    print(out, f'{wmm}×{hmm:.1f} mm', f'{px_w}×{px_h} px')
open('print/sizes.txt', 'w', encoding='utf8').write('\n'.join(f'{o}\t{d}\t{w} × {h} mm' for o, d, w, h in rows))
