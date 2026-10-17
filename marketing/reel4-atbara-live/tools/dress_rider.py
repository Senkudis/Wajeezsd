# يُلبس الكابتن زيّ وجيز: القميص الداكن ⇐ أخضر الهوية، وشعار وجيز مطبوعٌ على ظهره
# بظلال القماش وطيّاته. المصدر assets/photos/rider.jpg (Unsplash) ⇐ rider_wajeez.jpg
import numpy as np
from PIL import Image, ImageFilter
im = Image.open('assets/photos/rider.jpg').convert('RGB')
a = np.asarray(im).astype(np.float32) / 255
r, g, b = a[..., 0], a[..., 1], a[..., 2]
L = .3 * r + .59 * g + .11 * b
H, W = L.shape
yy, xx = np.mgrid[0:H, 0:W]
box = (xx > 620) & (xx < 1960) & (yy > 470) & (yy < 1160)
bike = ((yy > 990) & (xx > 1330 + (yy - 990) * .6)) | ((yy > 1165) & (xx < 1000)) | ((xx > 1650) & (yy > 1010))
mask = box & ~bike & (L < .74) & (b >= g - .015) & (r >= g - .03) & ((np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)) < .30)
# يُنظَّف القناع: يُملأ ثقوبه ويُنعَّم طرفه
m = Image.fromarray((mask * 255).astype('uint8')).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(2.2))
m = np.asarray(m).astype(np.float32)[..., None] / 255
# أخضر الهوية بنفس إضاءة القماش (الطيّات تبقى)
green = np.array([0x07, 0x6E, 0x45], np.float32) / 255
shade = np.clip(L / .30, 0, 2.2)[..., None]
dyed = np.clip(green * (0.18 + 0.7 * shade) + .02 * shade, 0, 1)
out = a * (1 - m) + dyed * m
# الشعار على الظهر: أبيض يتبع ظلّ القماش، ومائلٌ قليلاً مع الكتفين
logo = Image.open('assets/logo-white.png').convert('RGBA')
lw = 470; lh = int(logo.height * lw / logo.width)
logo = logo.resize((lw, lh), Image.LANCZOS).rotate(-4, resample=Image.BICUBIC, expand=True)
cx, cy = 1165, 760
la = np.asarray(logo).astype(np.float32) / 255
x0, y0 = cx - la.shape[1] // 2, cy - la.shape[0] // 2
reg = out[y0:y0 + la.shape[0], x0:x0 + la.shape[1]]
sh = np.clip(L[y0:y0 + la.shape[0], x0:x0 + la.shape[1]] / .30, .5, 1.3)[..., None]
alpha = la[..., 3:4] * .93 * m[y0:y0 + la.shape[0], x0:x0 + la.shape[1]]
ink = np.clip(np.array([.95, .95, .92]) * (0.55 + 0.4 * sh), 0, 1)
out[y0:y0 + la.shape[0], x0:x0 + la.shape[1]] = reg * (1 - alpha) + ink * alpha
res = Image.fromarray((np.clip(out, 0, 1) * 255).astype('uint8'))
res.save('assets/photos/rider_wajeez.jpg', quality=92)
res.crop((550, 300, 2050, 1300)).resize((900, 600)).save('out/rider_check.png')
print('ok')
