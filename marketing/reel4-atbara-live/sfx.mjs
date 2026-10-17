// node sfx.mjs cues.json out/sfx.wav     cues: [{"t":0.5,"type":"click","gain":1,"len":1}, ...]
// مؤثّرات إعلان عطبرة مُركّبة بالكود: صافرة القطر، طقطقة العجلات على الفواصل،
// صرير الفرامل، هسيس الأبواب — مع نقرات الواجهة وضرباتها.
import { readFileSync, writeFileSync } from 'node:fs';
const SR = 48000, cues = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const buf = new Float32Array(Math.ceil((Math.max(...cues.map(c => c.t + (c.len || 1))) + 2.5) * SR));

let seed = 42; const noise = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
// مرشّح تمرير منخفض بقطبٍ واحد — يُنشأ لكل صوتٍ حتى لا تتشارك الحالة
const lp = (fc) => { let y = 0; const a = 1 - Math.exp(-2 * Math.PI * fc / SR); return (x) => (y += a * (x - y)); };

const V = {
  click: () => synth(0.05, t => Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 90) * 0.5),
  pop: () => synth(0.15, t => Math.sin(2 * Math.PI * (600 + 900 * t) * t) * Math.exp(-t * 30) * 0.4),
  thump: () => synth(0.5, t => Math.sin(2 * Math.PI * (90 - 60 * t) * t) * Math.exp(-t * 9) * 0.9),
  whoosh: () => { const f = lp(2200); return synth(0.35, t => f(noise()) * Math.sin(Math.PI * Math.min(1, t / 0.35)) * 0.55); },
  // طقطقة العجلة على فاصل القضيب: ضربتان متقاربتان (العجلتان الأمامية والخلفية)
  clack: () => {
    const f = lp(1400);
    return synth(0.22, t => {
      const h = (t0) => (t > t0 ? Math.exp(-(t - t0) * 60) * (f(noise()) * 1.6 + Math.sin(2 * Math.PI * 420 * (t - t0)) * 0.35) : 0);
      return (h(0) + h(0.085) * 0.8) * 0.5;
    });
  },
  // صافرة القطر: ثلاث نغماتٍ معاً (وتر الديزل)، بانحناءةٍ عند البداية ونَفَس
  whistle: (len = 1.1) => {
    const f = lp(3000);
    return synth(len + 0.35, t => {
      const env = Math.min(1, t / 0.07) * (t > len ? Math.exp(-(t - len) * 9) : 1);
      const bend = 1 - 0.035 * Math.exp(-t * 14);
      let s = 0;
      for (const [fr, a] of [[277.2, 1], [349.2, 0.85], [415.3, 0.7]]) {
        const ph = 2 * Math.PI * fr * bend * t;
        s += a * (Math.sin(ph) + 0.45 * Math.sin(2 * ph) + 0.22 * Math.sin(3 * ph) + 0.1 * Math.sin(5 * ph));
      }
      return (s * 0.16 + f(noise()) * 0.18) * env * (1 + 0.04 * Math.sin(2 * Math.PI * 5.5 * t));
    });
  },
  // هدير القطر المقترب: ضجيجٌ منخفضٌ يعلو ثم يخبو
  rumble: (len = 1.6) => { const f = lp(160), f2 = lp(60); return synth(len, t => (f(noise()) * 2.2 + f2(noise()) * 3) * Math.sin(Math.PI * Math.min(1, t / len)) ** 1.5 * 0.9); },
  // صرير الفرامل: نغمةٌ حادّة تنزلق للأسفل مع احتكاك
  brake: (len = 0.9) => {
    const f = lp(5000);
    return synth(len, t => {
      const env = Math.min(1, t / 0.05) * Math.exp(-Math.max(0, t - len * 0.55) * 7);
      const fr = 2600 - 500 * t / len;
      return (Math.sin(2 * Math.PI * fr * t + 0.6 * Math.sin(2 * Math.PI * 7 * t)) * 0.12 + f(noise()) * 0.1) * env;
    });
  },
  // هسيس الأبواب الهوائية
  hiss: (len = 0.55) => {
    let y = 0, prev = 0;
    return synth(len, t => {                                   // تمرير عالٍ: الفرق بين العيّنات
      const x = noise(); const hp = x - prev; prev = x; y = y * 0.6 + hp * 0.4;
      return y * Math.min(1, t / 0.02) * Math.exp(-t * 4.5) * 0.7;
    });
  },
  // ساعة الحائط: تكّة خشبية قصيرة
  tick: () => synth(0.06, t => Math.sin(2 * Math.PI * 2600 * t) * Math.exp(-t * 160) * 0.35 + Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t * 120) * 0.25),
  // صرّار الضهر: نغمةٌ حادّة تنبض
  cicada: (len = 2) => synth(len, t => Math.sin(2 * Math.PI * 4700 * t) * (Math.sin(2 * Math.PI * 38 * t) > 0.3 ? 1 : 0.15)
    * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.9 * t)) * Math.min(1, t / 0.3, (len - t) / 0.3) * 0.05),
  // أزيز المروحة: ضجيجٌ منخفض ينبض بمرور الريش
  whir: (len = 2) => { const f = lp(500); return synth(len, t => f(noise()) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 7 * t)) * Math.min(1, t / 0.2, (len - t) / 0.3) * 1.2); },
  // موتر يمرّ: محرّكٌ يعلو وتنخفض نغمته بعد مروره (دوبلر)
  moto: (len = 1.8) => {
    const f = lp(1800); let ph = 0;
    return synth(len, t => {
      const fr = 72 * (1 + 0.22 * Math.tanh((len * 0.45 - t) * 4)); ph += 2 * Math.PI * fr / SR;
      const saw = (ph / Math.PI) % 2 - 1, env = Math.exp(-(((t - len * 0.45) / (len * 0.28)) ** 2));
      return f(saw * 0.8 + noise() * 0.25 + Math.sin(ph * 2) * 0.3) * env * 0.9;
    });
  },
  // دقّتان على الباب
  knock: () => synth(0.5, t => {
    const k = (t0) => t > t0 ? (Math.sin(2 * Math.PI * 170 * (t - t0)) * 0.9 + noise() * 0.4) * Math.exp(-(t - t0) * 45) : 0;
    return (k(0) + k(0.17)) * 0.7;
  }),
  // ختمٌ: ضربة منخفضة + نقرة
  stamp: () => synth(0.5, t => Math.sin(2 * Math.PI * (120 - 70 * t) * t) * Math.exp(-t * 11) * 0.9 + Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t * 70) * 0.25),
};
function synth(len, fn) { const n = Math.floor(len * SR), a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = fn(i / SR); return a; }

for (const c of cues) {
  const s = V[c.type](c.len), start = Math.floor(c.t * SR), gain = c.gain == null ? 1 : c.gain;
  for (let i = 0; i < s.length && start + i < buf.length; i++) if (start + i >= 0) buf[start + i] += s[i] * gain;
}

const n = buf.length, b = Buffer.alloc(44 + n * 2);      // 16-bit mono WAV
b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
b.write('data', 36); b.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), 44 + i * 2);
writeFileSync(process.argv[3], b);
console.log(`wrote ${process.argv[3]} (${cues.length} cues)`);
