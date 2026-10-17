# صفيحة لقطات ثابتة للمراجعة: python tools/sheet.py 0.4,1.6,...  ⇐ out/stills.png
import sys
from PIL import Image
ts = [float(x) for x in sys.argv[1].split(',')]
cols = 8; rows = (len(ts) + cols - 1) // cols
c = Image.new('RGB', (cols * 270, rows * 480), 'black')
for i, t in enumerate(ts):
    im = Image.open(f'out/still_{t:g}.png').convert('RGB').resize((270, 480))
    c.paste(im, ((i % cols) * 270, (i // cols) * 480))
c.save('out/stills.png')
