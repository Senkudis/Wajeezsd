/**
 * لقطات إعلان «بتشيل كم؟» — شاشات التطبيق الحقيقية (public_html) بخادمٍ محاكى
 * وبياناتٍ تجريبية في الخرطوم. المسار حقيقي من OpenStreetMap: شارع عبيد ختم
 * ثم المشتل حتى الرياض (wajeez-ad-v2/tools/path.json).
 *
 *   node tools/shots.js [stills|tracking|all]     (خادم public_html على 4175)
 *
 * المخرَج: assets/screens/*.png (390×844 بدقّة 3×) و assets/seq/tracking/*.jpg
 */
const cap = require('../../tutorials/tools/capture');
const fs = require('fs');
const path = require('path');

const MODE = process.argv[2] || 'all';
const OUT = path.join(__dirname, '..', 'assets', 'screens');
const SEQ = path.join(__dirname, '..', 'assets', 'seq', 'tracking');
fs.mkdirSync(OUT, { recursive: true });
const DPR = 3;
const LOCAL = { selected_city: 'Khartoum', home_city: 'Khartoum' };

const PATH = require('../../wajeez-ad-v2/tools/path.json');
const A = PATH[0], B = PATH[PATH.length - 1];
const PICK = 'شارع عبيد ختم، الخرطوم', DROP = 'الرياض، شارع المشتل';

const ME = { _id: 'u1', id: 'u1', name: 'أحمد محمد', role: 'client', phone: '249912345678', city: 'Khartoum' };
const BASE = [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/favorites/, []], [/banners/, []]];
const PRICE = [/price-config/, { city: 'Khartoum', baseFare: 1500, costPerKm: 400, costPerMinute: 25, extraStopFee: 500, maxDiscountPercent: 10, maxPriceSurgePercent: 100, maxTipAmount: 20000 }];
const ADDR = [/auth\/addresses/, { addresses: [] }];
const ahead = (s) => new Date(Date.now() + s * 1000).toISOString();
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

// ── نموذج الطلب: فارغ ← الاستلام ← التسليم ← السعر ──────────────────────
const formFill = (step, price) => `(() => {
  const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
  if (${step} >= 1) { set('pickup-addr', ${JSON.stringify(PICK)}); set('pickup-name', 'أحمد محمد'); set('pickup-phone', '0912345678'); set('pickup-lat', '${A.lat}'); set('pickup-lng', '${A.lng}'); }
  if (${step} >= 2) { set('dropoff-addr', ${JSON.stringify(DROP)}); set('dropoff-name', 'سارة عبدالله'); set('dropoff-phone', '0923456789'); set('dropoff-lat', '${B.lat}'); set('dropoff-lng', '${B.lng}');
                      set('details', 'ظرف مستندات — سلّمو لي سارة يد بيد'); }
  if (${price}) set('price', '${price}');
  if (document.activeElement) document.activeElement.blur();
  window.scrollTo(0, 0);
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top + scrollY, b.width, b.height].map(Math.round); };
  return { pickBtn: r('#pickup-addr'), dropBtn: r('#dropoff-addr'), price: r('#price'), plus: r('#price-plus'), submit: (() => { const b = [...document.querySelectorAll('button')].find(x => /اطلب الكابتن/.test(x.textContent)); if (!b) return null; const q = b.getBoundingClientRect(); return [q.left, q.top + scrollY, q.width, q.height].map(Math.round); })(), h: document.documentElement.scrollHeight };
})()`;

// ── طلباتي: البحث ← عرض ← عرضان، والعدّاد يعدّ ──────────────────────────
const OID = '650000000000000000b1a001';
const OFFER = (i) => [
  { captainId: 'cap1', captainName: 'محمد عبدالله', captainRating: 4.9, captainRatingCount: 312, captainVehicle: 'motorcycle', proposedPrice: 3500, status: 'pending', expiresAt: ahead(224 - i) },
  { captainId: 'cap2', captainName: 'عثمان الطيب', captainRating: 4.7, captainRatingCount: 88, captainVehicle: 'rickshaw', proposedPrice: 4000, status: 'pending', expiresAt: ahead(146 - i) }];
const order = (negs) => ({
  _id: OID, status: 'pending', orderType: 'delivery', price: 3500, city: 'Khartoum', client: 'u1',
  pickup: { address: PICK, contactName: 'أحمد محمد', contactPhone: '0912345678', lat: A.lat, lng: A.lng },
  dropoff: { address: DROP, receiverName: 'سارة عبدالله', receiverPhone: '0923456789', lat: B.lat, lng: B.lng },
  details: 'ظرف مستندات', createdAt: ago(1), searchDeadlineAt: ahead(500), negotiations: negs });
const ORDERS = (o) => [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/feedback\/pending/, { pending: null }],
  [/my-orders/, () => ({ orders: [typeof o === 'function' ? o() : o], currentPage: 1, totalPages: 1, total: 1 })]];
const offersRects = `(() => { window.scrollTo(0, 0); const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); };
  const cards = [...document.querySelectorAll('.offer-card')]; return { cards: cards.map(r), accept: r(cards[0] && cards[0].querySelector('.btn-success')), card: r(document.querySelector('.o-card')) }; })()`;

const STILLS = {
  form0: { url: 'index.html', wait: 2500, fullPage: true, mocks: [...BASE, PRICE, ADDR], before: formFill(0, 0) },
  form1: { url: 'index.html', wait: 2500, fullPage: true, mocks: [...BASE, PRICE, ADDR], before: formFill(1, 0) },
  form2: { url: 'index.html', wait: 2500, fullPage: true, mocks: [...BASE, PRICE, ADDR], before: formFill(2, 3300) },
  form3: { url: 'index.html', wait: 2500, fullPage: true, mocks: [...BASE, PRICE, ADDR], before: formFill(2, 3400) },
  form4: { url: 'index.html', wait: 2500, fullPage: true, mocks: [...BASE, PRICE, ADDR], before: formFill(2, 3500) },
  search: { url: 'client-my-orders.html', wait: 2500, mocks: ORDERS(order([])), before: offersRects },
  offer1: { url: 'client-my-orders.html', wait: 2500, mocks: ORDERS(() => order(OFFER(0).slice(0, 1))), before: offersRects },
  accepted: { url: 'client-my-orders.html', wait: 2500, keepOverlays: true, mocks: ORDERS(() => order(OFFER(6))),
    before: `(() => { (window.__h.order_status_updated || []).forEach(f => f({ orderId: '${OID}', status: 'accepted' })); return !!document.querySelector('.swal2-popup'); })()`, after: 900 },
  delivered: { url: 'tracking.html?orderId=650000000000000000a7c3f1', wait: 3000, mocks: null, before: null }
};
// العدّاد: لقطة لكل ثانية من مشهد العروض
STILLS.offersFull = { url: 'client-my-orders.html', wait: 2500, h: 1060, mocks: ORDERS(() => order(OFFER(0))), before: offersRects };
for (let i = 0; i < 7; i++) STILLS['offers' + i] = { url: 'client-my-orders.html', wait: 2500, mocks: ORDERS(() => order(OFFER(i))), before: offersRects };

// ── التتبّع ─────────────────────────────────────────────────────────────
const R = 6371000, rad = d => d * Math.PI / 180;
const dist = (a, b) => { const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const cum = [0]; for (let i = 1; i < PATH.length; i++) cum.push(cum[i - 1] + dist(PATH[i - 1], PATH[i]));
const at = (f) => { const d = Math.max(0, Math.min(1, f)) * cum[cum.length - 1]; const i = cum.findIndex(c => c >= d); if (i <= 0) return PATH[0];
  const k = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return { lat: PATH[i - 1].lat + (PATH[i].lat - PATH[i - 1].lat) * k, lng: PATH[i - 1].lng + (PATH[i].lng - PATH[i - 1].lng) * k }; };
const TID = '650000000000000000a7c3f1';
const trackOrder = (status, c) => ({
  _id: TID, status, orderType: 'delivery', price: 3500, city: 'Khartoum', client: { _id: 'u1', name: 'أحمد محمد' },
  pickup: { address: PICK, contactName: 'أحمد محمد', contactPhone: '0912345678', lat: A.lat, lng: A.lng },
  dropoff: { address: DROP, receiverName: 'سارة عبدالله', receiverPhone: '0923456789', lat: B.lat, lng: B.lng },
  captain: { _id: 'cap1', name: 'محمد عبدالله', phone: '0912345678', vehicleType: 'motorcycle', averageRating: 4.9, ratingCount: 312, completedTrips: 1240,
    currentLocation: { lat: c.lat, lng: c.lng, fixedAt: new Date(Date.now() - 5000).toISOString() } },
  createdAt: ago(25), acceptedAt: ago(21), pickedUpAt: ago(12), deliveredAt: status === 'delivered' ? ago(0) : null, details: 'ظرف مستندات', tip: { amount: 0 },
  timeline: { current: status, steps: [['placed', 'تم الطلب', 25], ['accepted', 'قبول الكابتن', 21], ['picked_up', 'الاستلام', 12], ['delivered', 'التسليم', 0]]
    .map(([key, label, m], i, all) => { const done = i <= all.findIndex(s => s[0] === status); return { key, label, done, at: done ? ago(m) : null }; }) } });
const TRACK_MOCKS = (o, loc) => [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/price-config/, { maxTipAmount: 20000 }],
  [new RegExp('api/orders/' + TID), o], [/api\/captain\/cap1\/location/, loc], [/tip|feedback|rating/, {}]];
STILLS.delivered.mocks = TRACK_MOCKS(trackOrder('delivered', B), () => B);
STILLS.delivered.before = `(async () => { for (let i = 0; i < 4 && !window.__lmap; i++) { if (window.initTrackingMap) window.initTrackingMap(); await new Promise(r => setTimeout(r, 1500)); }
  if (window.__lmap) window.__lmap.invalidateSize(); document.querySelectorAll('.swal2-container').forEach(e => e.remove()); return !!window.__lmap; })()`;

const HIDE = `(() => { const st = document.createElement('style'); st.textContent = '.theme-toggle,.wj-toast-container{display:none!important}'; document.head.appendChild(st); })()`;
const wrap = (b) => `(async () => { ${HIDE}; return await ${b || 'true'}; })()`;

async function stills() {
  const info = {};
  const only = process.argv[3] ? process.argv[3].split(',') : null;
  for (const [name, s] of Object.entries(STILLS)) {
    if (only && !only.includes(name)) continue;
    const r = await cap.shot({ dpr: DPR, ...s, local: LOCAL, before: wrap(s.before), out: path.join(OUT, name + '.png') });
    info[name] = r.info;
    console.log(name, JSON.stringify(r.info).slice(0, 160), r.errs.slice(0, 2).join(' | '));
  }
  const f = path.join(OUT, 'rects.json'); const old = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  fs.writeFileSync(f, JSON.stringify(Object.assign(old, info), null, 1));
}

// 7.5 ث بـ 30 إطاراً: الكابتن من 8% إلى 97% من المسار، وقراءة موقع كل 0.6 ث (مضغوط زمنياً)
async function tracking() {
  fs.mkdirSync(SEQ, { recursive: true });
  fs.readdirSync(SEQ).forEach(f => fs.unlinkSync(path.join(SEQ, f)));
  const SECONDS = 7.5, FPS = 30, F0 = 0.08, F1 = 0.97, READ = 0.6;
  let cur = at(F0);
  const r = await cap.shot({ url: 'tracking.html?orderId=' + TID, virtualTime: true, keep: true, dpr: DPR, wait: 2500, local: LOCAL,
    mocks: TRACK_MOCKS(trackOrder('picked_up', cur), () => ({ lat: cur.lat, lng: cur.lng })), before: wrap(null) });
  const p = r.page;
  await p.evaluate(() => { if (!window.__lmap && window.initTrackingMap) window.initTrackingMap(); });
  await new Promise(res => setTimeout(res, 1500));
  // المسار: التطبيق يرسمه بـ Directions من Google؛ المحوّل لا يملكه فنرسم المسار الحقيقي نفسه (OSM) بلون التطبيق
  await p.evaluate((pts) => { document.querySelectorAll('.swal2-container').forEach(e => e.remove()); if (!window.__lmap) return; window.__lmap.invalidateSize();
    L.polyline(pts.map(q => [q.lat, q.lng]), { color: '#ffffff', weight: 9, opacity: 0.95 }).addTo(window.__lmap);
    L.polyline(pts.map(q => [q.lat, q.lng]), { color: '#048c5b', weight: 6, opacity: 0.9 }).addTo(window.__lmap); }, PATH);
  for (let i = 0; i < 12; i++) { await p.evaluate(() => window.__advance(250)); await new Promise(res => setTimeout(res, 150)); }
  const frames = Math.round(SECONDS * FPS); let next = 0;
  for (let f = 0; f < frames; f++) {
    const t = f / FPS;
    if (t >= next - 1e-9) {
      cur = at(F0 + (F1 - F0) * Math.min(1, (t + READ) / SECONDS));
      await p.evaluate((c, id) => (window.__h.captain_location_updated || []).forEach(fn => fn({ orderId: id, lat: c.lat, lng: c.lng, fixAge: 0 })), cur, TID);
      next += READ;
    }
    await p.evaluate((ms) => window.__advance(ms), 1000 / FPS);
    await p.screenshot({ path: path.join(SEQ, String(f).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    if (f % 45 === 0) console.log('tracking frame', f, '/', frames);
  }
  console.log('tracking errors:', r.errs.slice(0, 4));
  await p.close();
}

(async () => {
  if (MODE === 'stills' || MODE === 'all') await stills();
  if (MODE === 'tracking' || MODE === 'all') await tracking();
  await cap.close();
})();
