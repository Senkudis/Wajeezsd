/**
 * 🎬 مشهد التتبّع: صفحة tracking.html الحقيقية، والكابتن يسير على شارع عبيد
 * ختم ثم المشتل (مسارٌ حقيقي من OpenStreetMap — tools/path.json) بوحدة
 * الحركة نفسها التي في التطبيق. ساعة الصفحة افتراضية: إطارٌ كل 1/30 ث.
 *
 *   node tools/tracking-seq.js [seconds=7.2] [fps=30]
 */
const cap = require('./capture');
const fs = require('fs');
const path = require('path');

const SECONDS = Number(process.argv[2] || 7.2);
const FPS = Number(process.argv[3] || 30);
const OUT = path.join(__dirname, '..', 'seq', 'tracking');
fs.mkdirSync(OUT, { recursive: true });
fs.readdirSync(OUT).forEach(f => fs.unlinkSync(path.join(OUT, f)));

const PATH = require('./path.json');
const R = 6371000, rad = d => d * Math.PI / 180;
const dist = (a, b) => { const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
// المسار بالمسافة التراكمية — لموضعٍ عند أيّ نسبةٍ منه
const cum = [0]; for (let i = 1; i < PATH.length; i++) cum.push(cum[i - 1] + dist(PATH[i - 1], PATH[i]));
const TOTAL = cum[cum.length - 1];
function at(f) {
  const d = Math.max(0, Math.min(1, f)) * TOTAL;
  let i = cum.findIndex(c => c >= d); if (i <= 0) return PATH[0];
  const k = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return { lat: PATH[i - 1].lat + (PATH[i].lat - PATH[i - 1].lat) * k, lng: PATH[i - 1].lng + (PATH[i].lng - PATH[i - 1].lng) * k };
}

const START_F = 0.05;   // الكابتن انطلق للتوّ من المحل
const END_F = 0.97;     // ويقترب من باب العميل
let current = at(START_F);

const ORDER = {
  _id: '650000000000000000a7c3f1', status: 'picked_up', orderType: 'delivery', price: 3500, city: 'Khartoum',
  pickup: { address: 'شارع عبيد ختم', contactName: 'مطعم الساحة', contactPhone: '0912345678', lat: PATH[0].lat, lng: PATH[0].lng },
  dropoff: { address: 'الرياض، شارع المشتل', receiverName: 'سارة عبدالله', receiverPhone: '0923456789', lat: PATH[PATH.length - 1].lat, lng: PATH[PATH.length - 1].lng },
  captain: { _id: 'cap1', name: 'محمد عبدالله', phone: '249912345678', vehicleType: 'motorcycle', averageRating: 4.9, ratingCount: 312, completedTrips: 1240,
    currentLocation: { lat: current.lat, lng: current.lng, fixedAt: new Date().toISOString() } },
  createdAt: new Date(Date.now() - 22 * 60000).toISOString(), acceptedAt: new Date(Date.now() - 18 * 60000).toISOString(),
  pickedUpAt: new Date(Date.now() - 4 * 60000).toISOString(), details: 'ظرف مستندات',
  timeline: { steps: [] }
};

(async () => {
  const r = await cap.shot({
    url: 'tracking.html?orderId=' + ORDER._id, role: 'client', virtualTime: true, keep: true, dpr: Number(process.env.DPR || 2.5), wait: 2500,
    mocks: [
      [/auth\/me/, { _id: 'u1', name: 'سارة عبدالله', role: 'client' }], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }],
      [/api\/orders\/650000000000000000a7c3f1/, ORDER],
      [/api\/captain\/cap1\/location/, () => ({ lat: current.lat, lng: current.lng })],
      [/tip|config/, {}]
    ]
  });
  const p = r.page;
  // الخريطة: maps-loader يستدعي initTrackingMap قبل تعريفه حين تكون google جاهزة — نستدعيه
  await p.evaluate(() => { if (!window.__lmap && window.initTrackingMap) window.initTrackingMap(); });
  await new Promise(res => setTimeout(res, 1500));
  // استقرار: البلاطات تتحمّل، النبض يبدأ
  for (let i = 0; i < 12; i++) { await p.evaluate(() => window.__advance(250)); await new Promise(res => setTimeout(res, 150)); }

  const frames = Math.round(SECONDS * FPS);
  const READ_EVERY = 0.6;                 // قراءة موقع كل 0.6 ث (مضغوطٌ زمنياً للإعلان)
  let nextRead = 0;
  for (let f = 0; f < frames; f++) {
    const t = f / FPS;
    if (t >= nextRead - 1e-9) {
      const frac = START_F + (END_F - START_F) * Math.min(1, (t + READ_EVERY) / SECONDS);
      current = at(frac);
      await p.evaluate((c) => (window.__h.captain_location_updated || []).forEach(fn => fn({ orderId: '650000000000000000a7c3f1', lat: c.lat, lng: c.lng, fixAge: 0 })), current);
      nextRead += READ_EVERY;
    }
    await p.evaluate((ms) => window.__advance(ms), 1000 / FPS);
    await p.screenshot({ path: path.join(OUT, String(f).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    if (f % 30 === 0) process.stdout.write(`frame ${f}/${frames}\n`);
  }
  console.log('errors:', r.errs.slice(0, 4));
  await p.close();
  await cap.close();
})();
