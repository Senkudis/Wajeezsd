const r = require('./roads.json');
const R = 6371000, rad = d => d * Math.PI / 180;
const dist = (a, b) => { const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const P = g => ({ lat: g.lat, lng: g.lon });
const waysOf = n => r.elements.filter(w => (w.tags['name:en'] || '').startsWith(n));
// اتجاهٌ واحد من الطريق المزدوج: الطريق ذو أكثر النقاط داخل المدى
function bestWay(name, inRange) {
  return waysOf(name).map(w => ({ w, n: w.geometry.filter(inRange).length })).sort((a, b) => b.n - a.n)[0].w;
}
const LAT_N = 15.5995;
const ob = bestWay('Obeid Khatim', g => g.lat > 15.578 && g.lat < 15.601);
const ma = bestWay('Al-Mashtal', g => g.lon > 32.560 && g.lon < 32.572);
const mPts = ma.geometry.map(P).sort((a, b) => a.lng - b.lng);
const oAll = ob.geometry.map(P).sort((a, b) => b.lat - a.lat);
// الالتقاء: أقرب نقطة في عبيد ختم لبداية المشتل الغربية
let J = null; oAll.forEach((p, i) => mPts.forEach((q, j) => { const d = dist(p, q); if (!J || d < J.d) J = { d, i, j }; }));
const seg1 = oAll.filter(p => p.lat <= LAT_N && p.lat >= oAll[J.i].lat);
const seg2 = mPts.slice(J.j).filter(p => p.lng <= 32.5712);
const path = seg1.concat(seg2).filter((p, i, a) => i === 0 || dist(a[i - 1], p) > 3).map(p => ({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }));
let len = 0; for (let i = 1; i < path.length; i++) len += dist(path[i - 1], path[i]);
console.log('junction gap m', J.d.toFixed(1), '| seg1', seg1.length, 'seg2', seg2.length, '| path', path.length, 'pts', Math.round(len), 'm');
console.log('start', JSON.stringify(path[0]), 'turn', JSON.stringify(oAll[J.i]), 'end', JSON.stringify(path[path.length - 1]));
require('fs').writeFileSync(__dirname + '/path.json', JSON.stringify(path));
