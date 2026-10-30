/**
 * تسجيل الـ Preview العمودي من التطبيق الحقيقي إطاراً إطاراً (30 fps).
 * الصفحة تعمل بكودها؛ الساعة افتراضية: rAF و performance.now و Date.now وكل حركات CSS
 * (priceBump، radarPulse، offerIn، نافذة Swal) تتقدّم 1/30 ث بالضبط بين لقطتين.
 * الضغطات حقيقية (page.mouse) على العناصر نفسها؛ مواضعها تُحفظ لمؤشّر اللمس في التركيب.
 *
 *   node tools/record.js        → seq/<seg>/NNNN.jpg + seq/timeline.json
 */
const cap = require('../../tutorials/tools/capture');
const fs = require('fs');
const path = require('path');

const FPS = 30, DPR = 3;
const SEQ = path.join(__dirname, '..', 'seq');
const ME = { _id: 'u1', id: 'u1', name: '', role: 'client', phone: '', city: 'Khartoum' };
const LOCAL = { selected_city: 'Khartoum', home_city: 'Khartoum' };
const PRICE = [/price-config/, { city: 'Khartoum', baseFare: 1500, costPerKm: 400, costPerMinute: 25, extraStopFee: 500, maxDiscountPercent: 10, maxPriceSurgePercent: 100, maxTipAmount: 20000 }];
const PATH = require('../../wajeez-ad-v2/tools/path.json');
const A = PATH[0], B = PATH[PATH.length - 1];
const PICK = 'شارع عبيد ختم، الخرطوم', DROP = 'الرياض، شارع المشتل';
const START_PRICE = 3300, YOUR_PRICE = 3500;          // مثال يكتبه المستخدم ثم يرفعه بـ «+» مرتين
const NOW = Date.now();
const ahead = (s) => new Date(NOW + s * 1000).toISOString();
const ago = (m) => new Date(NOW - m * 60000).toISOString();

// الساعة الافتراضية لحركات CSS و Date.now — فوق virtualTime في capture.js (rAF و performance.now)
const CLOCK = `(() => {
  const d0 = Date.now(), v0 = performance.now(), RD = Date; const vnow = () => d0 + (performance.now() - v0);
  window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(vnow()); } static now() { return vnow(); } };
  window.__tick = (ms) => { const vt = window.__advance(ms);
    for (const a of document.getAnimations()) { if (a.__t0 == null) { a.__t0 = vt; a.pause(); } a.currentTime = vt - a.__t0; }
    return vt; };
  const st = document.createElement('style'); st.textContent = '.theme-toggle,.wj-toast-container,#toast-container{display:none!important} html{scroll-behavior:auto!important}'; document.head.appendChild(st);
  return true; })()`;

const timeline = { fps: FPS, dpr: DPR, w: 390, h: 844, segments: [] };

async function segment(name, opts, script) {
  const dir = path.join(SEQ, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.readdirSync(dir).forEach(f => fs.unlinkSync(path.join(dir, f)));
  const r = await cap.shot({ url: opts.url, virtualTime: true, keep: true, dpr: DPR, w: 390, h: 844, wait: 2500, local: LOCAL, mocks: opts.mocks, before: opts.before || 'true' });
  const p = r.page;
  await p.evaluate(CLOCK);
  for (let i = 0; i < 20; i++) { await p.evaluate(() => window.__tick(100)); await new Promise(q => setTimeout(q, 40)); }   // استقرار
  let f = 0;
  const seg = { name, frames: 0, touches: [], errs: r.errs };
  const shotFrame = async () => {
    await p.evaluate((ms) => window.__tick(ms), 1000 / FPS);
    await p.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 93 });
    f++;
  };
  const api = {
    p,
    hold: async (sec) => { for (let i = 0, n = Math.round(sec * FPS); i < n; i++) await shotFrame(); },
    // تمرير حقيقي للصفحة بمنحنى ناعم (كإصبعٍ يسحب) — المحتوى نفسه يتحرّك داخل الهاتف
    scroll: async (to, sec) => {
      const from = await p.evaluate(() => scrollY);
      for (let i = 1, n = Math.round(sec * FPS); i <= n; i++) {
        const k = i / n, e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        await p.evaluate((y) => window.scrollTo(0, y), from + (to - from) * e); await shotFrame();
      }
    },
    rect: (sel) => p.evaluate((s) => { const e = typeof s === 'string' ? document.querySelector(s) : null; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, sel),
    rectOf: (fnSrc) => p.evaluate(`(() => { const e = ${fnSrc}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`),
    // ضغطة: الإصبع ينزل (‎:active الحقيقي)، يُرفع فتعمل الصفحة بمعالجها الحقيقي
    tap: async (rc, { release = true, downSec = 0.2 } = {}) => {
      const x = rc.x + rc.w / 2, y = rc.y + rc.h / 2;
      seg.touches.push({ f, x, y, rect: rc, kind: release ? 'tap' : 'press' });
      await p.mouse.move(x, y); await p.mouse.down();
      for (let i = 0, n = Math.round(downSec * FPS); i < n; i++) await shotFrame();
      if (release) await p.mouse.up();
    },
    settle: async (ms = 250) => { await new Promise(q => setTimeout(q, ms)); }
  };
  await script(api);
  seg.frames = f;
  timeline.segments.push(seg);
  console.log(name, f, 'frames', r.errs.slice(0, 2).join(' | '));
  await p.close();
}

(async () => {
  // ── A: شاشة الطلب الحقيقية — الحقول، «سعرك» و«+»، «اطلب الكابتن الآن» ─────────
  const set = `const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };`;
  await segment('A_order', { url: 'index.html', mocks: [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/favorites/, []], [/banners/, []], [/auth\/addresses/, { addresses: [] }], PRICE],
    before: `(() => { ${set}
      set('pickup-addr', ${JSON.stringify(PICK)}); set('pickup-lat', '${A.lat}'); set('pickup-lng', '${A.lng}');
      set('dropoff-addr', ${JSON.stringify(DROP)}); set('dropoff-lat', '${B.lat}'); set('dropoff-lng', '${B.lng}');
      set('price', '${START_PRICE}'); if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0); return true; })()` }, async (s) => {
    await s.hold(1.3);
    const pr = await s.p.evaluate(() => { const e = document.getElementById('price'); return e.getBoundingClientRect().top + scrollY; });
    await s.scroll(pr - 330, 1.0);
    await s.hold(0.25);
    await s.tap(await s.rect('#price-plus')); await s.hold(0.35);
    await s.tap(await s.rect('#price-plus')); await s.hold(0.5);
    await s.tap(await s.rectOf(`[...document.querySelectorAll('button')].find(x => /اطلب الكابتن/.test(x.textContent))`), { release: false, downSec: 0.3 });
  });

  // ── B: طلباتي — البحث الحقيقي، وصول العرض، «قبول العرض»، نافذة «قبلت السعر!» ──
  const OID = '650000000000000000b1a001';
  const OFFER = { captainId: 'cap1', captainVehicle: 'motorcycle', proposedPrice: YOUR_PRICE, status: 'pending', expiresAt: ahead(240) };
  const state = { negs: [] };
  const order = () => ({ _id: OID, status: 'pending', orderType: 'delivery', price: YOUR_PRICE, city: 'Khartoum', client: 'u1',
    pickup: { address: PICK, lat: A.lat, lng: A.lng }, dropoff: { address: DROP, lat: B.lat, lng: B.lng },
    createdAt: ago(0.2), searchDeadlineAt: ahead(480), negotiations: state.negs });
  await segment('B_offers', { url: 'client-my-orders.html', mocks: [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/feedback\/pending/, { pending: null }],
    [/negotiate-response/, { success: true }], [/my-orders/, () => ({ orders: [order()], currentPage: 1, totalPages: 1, total: 1 })]] }, async (s) => {
    await s.hold(2.2);
    state.negs = [OFFER];
    await s.p.evaluate(() => loadOrders()); await s.settle(600);          // العرض يصل كما يصل من المقبس: loadOrders
    await s.hold(2.0);
    await s.tap(await s.rect('.offer-card .btn-success'), { downSec: 0.15 });
    await s.settle(500);
    await s.hold(2.6);
  });

  fs.writeFileSync(path.join(SEQ, 'timeline.json'), JSON.stringify(timeline, null, 1));
  await cap.close();
})();
