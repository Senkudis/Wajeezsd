// node build.mjs [--vo voice.wav] [--quick]
// أمرٌ واحد: يقرأ TIMING من index.html ⇒ مؤثّرات على لحظات المشاهد ⇒ موسيقى
// على نفس التوقيت ⇒ رندر ⇒ مزج. بتعليقٍ صوتي (--vo) تنخفض الموسيقى تحته.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const argv = process.argv;
const VO = argv.includes('--vo') ? argv[argv.indexOf('--vo') + 1] : null;
const html = readFileSync('index.html', 'utf8');
const TIMING = eval(html.match(/const TIMING = (\[[\s\S]*?\n\]);/)[1]);
const S = {}; let acc = 0; for (const [k, d] of TIMING) { S[k] = acc; acc += d; }
const DUR = acc;
console.log('scenes:', Object.entries(S).map(([k, v]) => `${k}@${v.toFixed(1)}`).join(' '), '| total', DUR.toFixed(1));

// المؤثّرات: كل حدثٍ بثوانٍ من بداية مشهده — كما في index.html
const at = (k, dt) => +(S[k] + dt).toFixed(3);
const d = (k) => TIMING.find(x => x[0] === k)[1];
const cues = [
  // ① القضبان: صافرةٌ بعيدة وطقطقةٌ تتسارع، وهديرٌ يقترب
  { t: at('rails', .05), type: 'thump', gain: .7 }, { t: at('rails', .3), type: 'whistle', len: 1.0, gain: .35 },
  ...Array.from({ length: 9 }, (_, i) => ({ t: at('rails', .2 + i * .36 - i * i * .006), type: 'clack', gain: .35 + i * .07 })),
  { t: at('rails', 1.7), type: 'rumble', len: 2.4, gain: .9 },
  { t: at('rails', .12), type: 'pop', gain: .6 }, { t: at('rails', .62), type: 'click' },
  // ② القطار يدخل ويفرمل ويقف، ثم يصفّر قريباً
  { t: at('arrive', -.4), type: 'whoosh', gain: 1.2 },
  ...Array.from({ length: 6 }, (_, i) => ({ t: at('arrive', .15 + i * .14 + i * i * .02), type: 'clack', gain: .9 - i * .1 })),
  { t: at('arrive', .55), type: 'brake', len: 1.0, gain: .8 }, { t: at('arrive', 1.45), type: 'thump', gain: .8 },
  { t: at('arrive', 1.75), type: 'whistle', len: .9, gain: .75 },
  { t: at('arrive', .15), type: 'click' }, { t: at('arrive', .55), type: 'pop' },
  // ③ الباب: هسيسٌ هوائي، ثم الشعار
  { t: at('doors', -.4), type: 'whoosh' }, { t: at('doors', .2), type: 'hiss', len: .6, gain: 1.1 },
  { t: at('doors', .5), type: 'thump' }, { t: at('doors', .85), type: 'pop' },
  // ④ الخريطة
  { t: at('map', -.22), type: 'whoosh' }, { t: at('map', .35), type: 'pop' },
  ...[0, 1, 2].map(i => ({ t: at('map', .2 + i * .3), type: 'clack', gain: .4 })),
  { t: at('map', 1.3), type: 'pop' }, { t: at('map', 1.5), type: 'pop' }, { t: at('map', 2.0), type: 'whoosh', gain: .6 },
  { t: at('map', d('map') - .7), type: 'thump' },
  // ⑤ «اشتري لي»
  { t: at('errand', -.25), type: 'whoosh' }, { t: at('errand', .15), type: 'pop' }, { t: at('errand', 1.7), type: 'click' },
  { t: at('errand', 2.05), type: 'whoosh', gain: .7 }, { t: at('errand', 2.45), type: 'stamp' },
  // ⑥ التتبّع
  { t: at('track', -.25), type: 'whoosh' }, { t: at('track', .1), type: 'pop' }, { t: at('track', .9), type: 'pop' },
  // ⑦ الختام: ضربة، المتجران، وصافرة القطار الصغير
  { t: at('end', -.22), type: 'whoosh' }, { t: at('end', .2), type: 'thump' },
  { t: at('end', .75), type: 'click' }, { t: at('end', .87), type: 'click' },
  { t: at('end', 1.6), type: 'whistle', len: .6, gain: .5 },
  ...Array.from({ length: 5 }, (_, i) => ({ t: at('end', 1.5 + i * .3), type: 'clack', gain: .25 })),
];
writeFileSync('cues.json', JSON.stringify(cues, null, 1));

import { FF, VCODEC } from './ff.mjs';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
run('python', ['music.py', 'out/music.wav', JSON.stringify({ arrive: S.arrive, drop: S.doors + .5, end: S.end + .15, dur: DUR + .6 })]);
run('node', ['sfx.mjs', 'cues.json', 'out/sfx.wav']);
if (!argv.includes('--quick')) run('node', ['render.mjs', '--fps', '30', '--dur', String(DUR), '--sub', '2']);

// المزج: بلا صوت ⇒ موسيقى معتدلة؛ بصوت ⇒ الموسيقى تنخفض تلقائياً تحته (sidechain)
const fade = `afade=t=out:st=${(DUR - .6).toFixed(2)}:d=0.6`;
const sfx = '[2:a]volume=0.85,pan=stereo|c0=c0|c1=c0[s]';
const filter = VO
  ? `[1:a]volume=0.42[m0];[3:a]apad,highpass=f=80,afftdn=nf=-25,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,volume=1.6,asplit=2[v][vk];[m0][vk]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[m];${sfx};[m][s][v]amix=inputs=3:normalize=0,${fade},loudnorm=I=-14:TP=-1.5,volume=1dB,alimiter=limit=0.8:level=0,aresample=48000[a]`
  : `[1:a]volume=0.5[m];${sfx};[m][s]amix=inputs=2:normalize=0,${fade},loudnorm=I=-14:TP=-1.5,volume=1dB,alimiter=limit=0.8:level=0,aresample=48000[a]`;
const inputs = ['-i', 'out/silent.mp4', '-i', 'out/music.wav', '-i', 'out/sfx.wav', ...(VO ? ['-i', VO] : [])];
const OUT = VO ? 'out/wajeez-atbara-vo.mp4' : 'out/wajeez-atbara.mp4';
run(FF, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', DUR.toFixed(2), '-movflags', '+faststart', OUT]);
console.log('done ->', OUT);
