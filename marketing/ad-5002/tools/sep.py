# فصل المتحدّث في الخطّاف (مهارة object-separation، SAM 2.1 على المعالج) ← src/masks/NNNNN.png
# الإطارات بترقيم src/frames (30 إطاراً/ث). أبيض = المتحدّث.
#   .object-separation/Scripts/python tools/sep.py [preview]
import os, sys, platform, numpy as np, torch, cv2
from transformers import Sam2VideoModel, Sam2VideoProcessor

VIDEO = 'src/graded30.mp4'
START, END = 208, 262
W = 960
PTS = [[479, 600], [480, 1250], [300, 1500], [110, 160], [860, 140]]   # وجه، صدر، كتف | سماء، سماء
LBL = [1, 1, 1, 0, 0]

def read_frames(a, b):
    cap = cv2.VideoCapture(VIDEO); cap.set(cv2.CAP_PROP_POS_FRAMES, a); out = []
    for _ in range(a, b + 1):
        ok, im = cap.read()
        if not ok: break
        out.append(cv2.cvtColor(cv2.resize(im, (W, int(im.shape[0] * W / im.shape[1]))), cv2.COLOR_BGR2RGB))
    return out

if len(sys.argv) > 1 and sys.argv[1] == 'preview':
    im = cv2.cvtColor(read_frames(START, START)[0], cv2.COLOR_RGB2BGR)
    for (x, y), l in zip(PTS, LBL): cv2.circle(im, (x, y), 14, (0, 255, 0) if l else (0, 0, 255), -1)
    os.makedirs('scout', exist_ok=True); cv2.imwrite('scout/sep_points.jpg', cv2.resize(im, (480, int(im.shape[0] / 2)))); sys.exit()

print('system:', platform.system(), platform.machine(), '| cuda:', torch.cuda.is_available())
dev, MODEL = 'cpu', 'facebook/sam2.1-hiera-tiny'
print('device:', dev, '| model:', MODEL)
model = Sam2VideoModel.from_pretrained(MODEL).to(dev).eval()
proc = Sam2VideoProcessor.from_pretrained(MODEL)

def separate_chunk(frames, points=None, labels=None, mask=None):
    H = frames[0].shape[0]
    s = proc.init_video_session(video=frames, inference_device=dev, video_storage_device='cpu', inference_state_device='cpu', dtype=torch.float32)
    if mask is None:
        proc.add_inputs_to_inference_session(inference_session=s, frame_idx=0, obj_ids=1, input_points=[[points]], input_labels=[[labels]])
    else:
        proc.add_inputs_to_inference_session(inference_session=s, frame_idx=0, obj_ids=1, input_masks=mask.astype(np.uint8))
    res = {}
    with torch.inference_mode():
        model(inference_session=s, frame_idx=0)
        for o in model.propagate_in_video_iterator(s, start_frame_idx=0):
            m = proc.post_process_masks([o.pred_masks], original_sizes=[[H, W]], binarize=True)[0]
            res[o.frame_idx] = m.squeeze().cpu().numpy().astype(bool)
            print('frame', o.frame_idx, flush=True)
    return res

out, a, seed = {}, START, None
while a < END:
    b = min(END, a + 60); fr = read_frames(a, b)
    r = separate_chunk(fr, points=PTS, labels=LBL) if seed is None else separate_chunk(fr, mask=seed)
    for k, m in r.items(): out[a + k] = m
    seed, a = r[len(fr) - 1], b
os.makedirs('src/masks', exist_ok=True)
for f, m in out.items():
    # حافةٌ ناعمة قليلاً (ريشة 2px) حتى لا يظهر قطعٌ حادّ حول الشعر والنظارة
    soft = cv2.GaussianBlur(m.astype(np.uint8) * 255, (5, 5), 0)
    rgba = np.dstack([np.full_like(soft, 255)] * 3 + [soft])
    cv2.imwrite(f'src/masks/{f:05d}.png', rgba)
print('masks', len(out))
