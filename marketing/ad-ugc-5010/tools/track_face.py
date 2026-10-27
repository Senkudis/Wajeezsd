# تتبّع الوجه في المصدر الملوّن (src/graded.mp4) → src/faces.json: [t, مركز_x, خط_العين_y, ارتفاع_الوجه] بعد التنعيم
import av, cv2, json, numpy as np
det = cv2.FaceDetectorYN.create('models/yunet/yunet.onnx', '', (540, 960), 0.6, 0.3, 5000)
c = av.open('src/graded.mp4'); v = c.streams.video[0]; out = []
for i, f in enumerate(c.decode(v)):
    if i % 3: continue                      # 10 إطارات/ث تكفي
    _, fs = det.detect(cv2.resize(f.to_ndarray(format='bgr24'), (540, 960)))
    t = i / 30
    if fs is not None and len(fs):
        r = max(fs, key=lambda r: r[2] * r[3]); s = 2
        ey = (r[5] + r[7]) / 2                                      # منتصف العينين من معالم YuNet
        out.append([t, (r[0] + r[2] / 2) * s, ey * s, r[3] * s])
    else: out.append([t, None, None, None])
a = np.array([[r[0]] + [np.nan if v is None else v for v in r[1:]] for r in out], float)
for k in (1, 2, 3):                          # ملء الفجوات ثم وسيط ثم تنعيم غاوسي (~0.5 ث)
    col = a[:, k]; ok = ~np.isnan(col); col[~ok] = np.interp(a[~ok, 0], a[ok, 0], col[ok])
    med = np.array([np.median(col[max(0, j - 3):j + 4]) for j in range(len(col))])
    ker = np.exp(-np.linspace(-2, 2, 11) ** 2); ker /= ker.sum()
    a[:, k] = np.convolve(np.pad(med, 5, mode='edge'), ker, 'valid')
json.dump([[round(x, 2) for x in r] for r in a.tolist()], open('src/faces.json', 'w'))
miss = sum(1 for r in out if r[1] is None); print('frames', len(out), 'missed', miss)
for t in (2.5, 7.2, 10.5, 16.5, 19, 22.5, 26.2, 29, 32.5, 35.5):
    r = a[np.argmin(abs(a[:, 0] - t))]; print(t, 'x %.0f eye %.0f h %.0f' % tuple(r[1:]))
