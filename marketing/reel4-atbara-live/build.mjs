// node build.mjs [--vo voice.wav] [--quick]
// يقرأ TIMING من index.html ⇒ مؤثّرات على لحظات اللقطات ⇒ موسيقى على نفس
// التوقيت ⇒ رندر ⇒ مزج. بتعليقٍ صوتي (--vo) تنخفض الموسيقى تحته.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { FF } from './ff.mjs';

const argv = process.argv;
const VO = argv.includes('--vo') ? argv[argv.indexOf('--vo') + 1] : null;
const html = readFileSync('index.html', 'utf8');
const TIMING = eval(html.match(/const TIMING = (\[[\s\S]*?\n\]);/)[1]);
const S = {}; let acc = 0; for (const [k, d] of TIMING) { S[k] = acc; acc += d; }
const DUR = acc;
const d = (k) => TIMING.find(x => x[0] === k)[1];
console.log('scenes:', Object.entries(S).map(([k, v]) => `${k}@${v.toFixed(1)}`).join(' '), '| total', DUR.toFixed(1));

const at = (k, dt) => +(S[k] + dt).toFixed(3);
const cues = [
  // الضهر: ساعةٌ تتكتك وصرّار، ثم السكة في السخانة
  ...Array.from({ length: 9 }, (_, i) => ({ t: i * 0.5, type: 'tick', gain: .8 })),
  { t: 0, type: 'cicada', len: S.fan + .3, gain: .9 },
  { t: at('sun', .1), type: 'thump', gain: .6 }, { t: at('sun', .55), type: 'click' },
  { t: at('city', -.25), type: 'whoosh' }, { t: at('city', .35), type: 'click' },
  // المروحة
  { t: at('fan', -.2), type: 'whoosh' }, { t: at('fan', 0), type: 'whir', len: d('fan') + .1, gain: .8 }, { t: at('fan', .35), type: 'click' },
  // الطلب في الهاتف
  { t: at('order', -.15), type: 'whoosh' }, { t: at('order', 0), type: 'thump' }, { t: at('order', .6), type: 'click' },
  { t: at('order', 1.75), type: 'click' }, { t: at('order', 2.15), type: 'whoosh', gain: .6 }, { t: at('order', 2.3), type: 'pop' },
  // الكابتن على الموتر
  { t: at('ride', -.3), type: 'moto', len: 2.2, gain: 1.0 }, { t: at('ride', .3), type: 'click' },
  // البيت
  { t: at('house', -.2), type: 'whoosh' }, { t: at('house', .1), type: 'click' }, { t: at('house', .45), type: 'pop' },
  // التتبّع
  { t: at('track', -.15), type: 'whoosh' }, { t: at('track', .1), type: 'pop' }, { t: at('track', .35), type: 'click' },
  // الباب والتسليم
  { t: at('hand', -.05), type: 'knock', gain: 1.0 }, { t: at('hand', .45), type: 'stamp', gain: .8 },
  // الختام
  { t: at('end', -.22), type: 'whoosh' }, { t: at('end', .15), type: 'thump' }, { t: at('end', .7), type: 'click' }, { t: at('end', .82), type: 'click' },
];
writeFileSync('cues.json', JSON.stringify(cues, null, 1));

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
run('python', ['music.py', 'out/music.wav', JSON.stringify({ arrive: S.fan, drop: S.order, end: S.end + .1, dur: DUR + .6 })]);
run('node', ['sfx.mjs', 'cues.json', 'out/sfx.wav']);
if (!argv.includes('--quick')) run('node', ['render.mjs', '--fps', '30', '--dur', String(DUR), '--sub', '2']);

const fade = `afade=t=out:st=${(DUR - .6).toFixed(2)}:d=0.6`;
const sfx = '[2:a]volume=0.85,pan=stereo|c0=c0|c1=c0[s]';
const tail = `${fade},loudnorm=I=-14:TP=-1.5,volume=1dB,alimiter=limit=0.8:level=0,aresample=48000[a]`;
const filter = VO
  ? `[1:a]volume=0.42[m0];[3:a]apad,highpass=f=80,afftdn=nf=-25,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,volume=1.6,asplit=2[v][vk];[m0][vk]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[m];${sfx};[m][s][v]amix=inputs=3:normalize=0,${tail}`
  : `[1:a]volume=0.5[m];${sfx};[m][s]amix=inputs=2:normalize=0,${tail}`;
const inputs = ['-i', 'out/silent.mp4', '-i', 'out/music.wav', '-i', 'out/sfx.wav', ...(VO ? ['-i', VO] : [])];
const OUT = VO ? 'out/wajeez-atbara-live-vo.mp4' : 'out/wajeez-atbara-live.mp4';
run(FF, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', DUR.toFixed(2), '-movflags', '+faststart', OUT]);
console.log('done ->', OUT);
