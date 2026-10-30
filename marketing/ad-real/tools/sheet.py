# لوحة تماس للشاشات الحقيقية مع اسم كل لقطة.
#   python tools/sheet.py out.png name1,name2,...  [cols]
import sys
from PIL import Image, ImageDraw, ImageFont
out, names = sys.argv[1], sys.argv[2].split(',')
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6
W, H, LH, PAD = 300, 650, 34, 14
rows = (len(names) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (W + PAD) + PAD, rows * (H + LH + PAD) + PAD), '#e5e7eb')
font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 20)
d = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    x, y = PAD + (i % cols) * (W + PAD), PAD + (i // cols) * (H + LH + PAD)
    im = Image.open(f'screens/{n}.png').convert('RGB')
    im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS).crop((0, 0, W, H))
    sheet.paste(im, (x, y + LH))
    d.text((x, y + 6), f'{i + 1:02d} {n}', fill='#b91c1c' if n.startswith('SHOP') else '#111827', font=font)
sheet.save(out)
print(out, sheet.size)
