import av, sys
from PIL import Image, ImageDraw
c=av.open(sys.argv[1]); v=c.streams.video[0]
step=float(sys.argv[3]) if len(sys.argv)>3 else 1.0
thumbs=[];nxt=0
for f in c.decode(v):
    t=float(f.pts*v.time_base)
    if t>=nxt:
        im=f.to_image(); im.thumbnail((216,384)); d=ImageDraw.Draw(im); d.rectangle([0,0,60,22],fill='black'); d.text((4,4),f'{t:.1f}',fill='yellow'); thumbs.append(im); nxt+=step
cols=10; rows=(len(thumbs)+cols-1)//cols
S=Image.new('RGB',(cols*216,rows*384))
for i,im in enumerate(thumbs): S.paste(im,((i%cols)*216,(i//cols)*384))
S.save(sys.argv[2]); print(len(thumbs))
