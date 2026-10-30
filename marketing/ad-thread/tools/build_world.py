# عالم «الخيط»: شوارع الخرطوم الحقيقية (OpenStreetMap، data/streets.json) مُسقطةً بالأمتار حول
# نقطة الاستلام A، مرتّبةً بالأهمية، وخيوطٌ تسير على الشوارع نفسها (أقصر مسار على شبكة الطرق).
#   python tools/build_world.py   ← comp/world.js
import json, math, heapq

S = json.load(open('data/streets.json', encoding='utf8'))['elements']
PATH = json.load(open('../wajeez-ad-v2/tools/path.json'))
A = PATH[0]                       # الاستلام: شارع عبيد ختم (الخرطوم)
B = PATH[-1]                      # التسليم: الرياض، شارع المشتل
LAT0, LNG0 = A['lat'], A['lng']
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110540
xy = lambda lat, lng: ((lng - LNG0) * KX, (lat - LAT0) * KY)   # متر: x شرقاً، y شمالاً

RANK = {'trunk': 3, 'primary': 3, 'trunk_link': 2, 'primary_link': 2, 'secondary': 2, 'secondary_link': 2,
        'tertiary': 1, 'tertiary_link': 1, 'unclassified': 0, 'residential': 0, 'service': -1}
streets, G = [], {}
key = lambda p: (round(p[0], 1), round(p[1], 1))
for w in S:
    hw = w['tags'].get('highway'); r = RANK.get(hw)
    if r is None or 'geometry' not in w: continue
    pts = [xy(g['lat'], g['lon']) for g in w['geometry']]
    if max(abs(c) for p in pts for c in p) > 2600: continue
    streets.append({'r': r, 'p': [[round(x, 1), round(y, 1)] for x, y in pts]})
    if r >= 0:                    # الشبكة للخيوط: بلا ممرّات الخدمة
        for a, b in zip(pts, pts[1:]):
            ka, kb = key(a), key(b); d = math.dist(a, b)
            G.setdefault(ka, []).append((kb, d)); G.setdefault(kb, []).append((ka, d))

def nearest(p): return min(G, key=lambda k: math.dist(k, p))
def route(s, t):
    s, t = nearest(s), nearest(t); dist = {s: 0}; prev = {}; q = [(0, s)]
    while q:
        d, u = heapq.heappop(q)
        if u == t: break
        if d > dist.get(u, 1e18): continue
        for v, w in G[u]:
            nd = d + w
            if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = u; heapq.heappush(q, (nd, v))
    out = [t]
    while out[-1] != s: out.append(prev[out[-1]])
    return [list(p) for p in out[::-1]], dist[t]

a = xy(A['lat'], A['lng'])
# كابتنان قريبان في اتجاهين مختلفين (مواقع Preview توضيحية على شوارع حقيقية): غرب-جنوب وشرق-شمال
C1 = nearest((a[0] - 380, a[1] - 260)); C2 = nearest((a[0] + 430, a[1] + 300))
s1, d1 = route(a, C1); s2, d2 = route(a, C2)
# المباني الحقيقية (OSM) حول A: بصمةٌ وارتفاع (الطوابق × 3.2م، وإلا 4–7م بعشوائيةٍ مبذورة)
import random
rnd = random.Random(7); blds = []
for b in json.load(open('data/buildings.json', encoding='utf8'))['elements']:
    if 'geometry' not in b: continue
    pts = [xy(g['lat'], g['lon']) for g in b['geometry']][:-1]
    if len(pts) < 3: continue
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    if math.dist((cx, cy), a) > 1400: continue
    lv = b['tags'].get('building:levels')
    try: h = float(lv) * 3.2
    except (TypeError, ValueError): h = rnd.uniform(4, 7)
    blds.append({'h': round(h, 1), 'p': [[round(x, 1), round(y, 1)] for x, y in pts]})
print('buildings', len(blds))
print(f'streets {len(streets)}; strand1 {len(s1)} pts {d1:.0f} m; strand2 {len(s2)} pts {d2:.0f} m')
W = {'A': [round(a[0], 1), round(a[1], 1)], 'B': [round(c, 1) for c in xy(B['lat'], B['lng'])],
     'C1': list(C1), 'C2': list(C2), 'strand1': s1, 'strand2': s2,
     'route': [[round(c, 1) for c in xy(p['lat'], p['lng'])] for p in PATH], 'streets': streets, 'buildings': blds}
open('comp/world.js', 'w', encoding='utf8').write('window.WORLD=' + json.dumps(W, separators=(',', ':')) + ';')
