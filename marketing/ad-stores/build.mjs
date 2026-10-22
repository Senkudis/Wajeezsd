// node build.mjs [--ad stores|multistop] [--vo voice.wav] [--quick]
// رندر Remotion (صامت) ⇒ موسيقى ومؤثّرات على لحظات المشاهد ⇒ مزجٌ عند −14 LUFS.
// اللحظات من مدد المشاهد في src/Video.tsx (SCENES) وأزمنة الأحداث داخل كل مشهد.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { FF } from './ff.mjs';

const argv = process.argv;
const VO = argv.includes('--vo') ? argv[argv.indexOf('--vo') + 1] : null;
const AD = argv.includes('--ad') ? argv[argv.indexOf('--ad') + 1] : 'stores';
const CFG = {
  stores: { file: 'src/Video.tsx', T: /const T = (\d+);/, SC: /export const SCENES = (\{[^}]+\})/, comp: 'StoresAd', out: 'wajeez-stores', dropKey: 'gather', dropAt: 0 },
  multistop: { file: 'src/multistop/Video.tsx', T: /export const MT = (\d+);/, SC: /export const MS_SCENES = (\{[^}]+\})/, comp: 'MultiStopAd', out: 'wajeez-multistop', dropKey: 'merge', dropAt: 44 / 30 },
}[AD];
const src = readFileSync(CFG.file, 'utf8');
const T = Number(src.match(CFG.T)[1]);
const SC = eval('(' + src.match(CFG.SC)[1].replace(/\+ M?T(?![A-Za-z])/g, `+ ${T}`) + ')');
const keys = Object.keys(SC), start = {}; let acc = 0;
keys.forEach((k, i) => { start[k] = (acc - (i ? T * i : 0)) / 30; acc += SC[k]; });
// بداية كل مشهد = مجموع ما قبله ناقص التداخلات
{ let s = 0; keys.forEach((k, i) => { start[k] = s / 30; s += SC[k] - T; }); }
const DUR = (keys.reduce((a, k) => a + SC[k], 0) - T * (keys.length - 1)) / 30;
const at = (k, f) => +(start[k] + f / 30).toFixed(3);
console.log('scenes:', keys.map(k => `${k}@${start[k].toFixed(2)}`).join(' '), '| total', DUR.toFixed(2));

const CUES = {
  stores: [
  // الخطّاف: ضربة البداية وتقطيع الصينية
  { t: 0, type: 'thump', gain: .8 },
  ...Array.from({ length: 6 }, (_, i) => ({ t: at('hook', 6 + i * 3), type: 'slice', gain: .9 })),
  { t: at('hook', 8), type: 'click' },
  // المسح بالمعيّن قبل كل مشهد
  ...keys.slice(1).map(k => ({ t: at(k, 0), type: 'whoosh', gain: .75 })),
  ...['limo', 'ocean', 'bean'].map(k => ({ t: at(k, 8), type: 'click' })),
  // الجمع: أربعة معيّنات تتراصّ
  ...[0, 1, 2, 3].map(i => ({ t: at('gather', 6 + i * 3), type: 'pop', gain: .8 })), { t: at('gather', 20), type: 'thump', gain: .6 },
  // المتجر: لمسة، إضافة، طيران، شريط، طلب
  { t: at('store', 46), type: 'click' }, { t: at('store', 52), type: 'pop' }, { t: at('store', 56), type: 'whoosh', gain: .4 },
  { t: at('store', 68), type: 'pop', gain: .7 }, { t: at('store', 96), type: 'click' }, { t: at('store', 102), type: 'chime' },
  // الطريق
  { t: at('route', 16), type: 'moto', len: 2.2, gain: .55 }, { t: at('route', 80), type: 'pop' },
  // الوصول
  { t: at('arrive', 4), type: 'hiss', len: .5, gain: .6 }, { t: at('arrive', 18), type: 'thump', gain: .8 },
  // الختام
  { t: at('end', 4), type: 'thump' }, { t: at('end', 26), type: 'pop' }, { t: at('end', 30), type: 'pop' },
],
  multistop: [
    { t: 0, type: 'thump', gain: .7 },
    ...[14, 26, 38].map(f => ({ t: at('hook', f), type: 'ding', gain: .9 })), { t: at('hook', 44), type: 'click' },
    ...keys.slice(1).map(k => ({ t: at(k, 0), type: 'whoosh', gain: .7 })),
    { t: at('problem', 10), type: 'whoosh', gain: .35 }, ...[34, 42, 50].map(f => ({ t: at('problem', f), type: 'click', gain: .9 })),
    { t: at('merge', 20), type: 'whoosh', gain: .6 }, { t: at('merge', 44), type: 'thump', gain: .9 }, { t: at('merge', 46), type: 'chime', gain: .7 },
    { t: at('home', 8), type: 'click' }, { t: at('home', 62), type: 'click' }, { t: at('home', 68), type: 'pop' }, { t: at('home', 100), type: 'click' }, { t: at('home', 106), type: 'pop' },
    { t: at('route', 18), type: 'pop' }, { t: at('route', 26), type: 'moto', len: 2.2, gain: .45 }, ...[47, 58, 79].map(f => ({ t: at('route', f), type: 'pop', gain: .9 })),
    ...Array.from({ length: 8 }, (_, i) => ({ t: at('compare', 14 + i * 4), type: 'tick', gain: .8 })), { t: at('compare', 62), type: 'chime' },
    ...[10, 16, 22].map(f => ({ t: at('benefit', f), type: 'pop' })),
    { t: at('end', 2), type: 'whoosh', gain: .5 }, { t: at('end', 16), type: 'thump' }, { t: at('end', 32), type: 'pop' }, { t: at('end', 36), type: 'pop' },
  ],
};
const cues = CUES[AD];
writeFileSync('cues.json', JSON.stringify(cues, null, 1));

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: cmd === 'npx' });
run('python', ['music.py', 'out/music.wav', JSON.stringify({ arrive: 0.01, drop: start[CFG.dropKey] + CFG.dropAt, end: start.end + .12, dur: DUR + .6 })]);
run('node', ['sfx.mjs', 'cues.json', 'out/sfx.wav']);
if (!argv.includes('--quick')) run('npx', ['remotion', 'render', CFG.comp, `out/${AD}-silent.mp4`, '--browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe"', '--codec=h264', '--crf=16', '--log=error']);

const fade = `afade=t=out:st=${(DUR - .6).toFixed(2)}:d=0.6`;
const sfx = '[2:a]volume=0.85,pan=stereo|c0=c0|c1=c0[s]';
const tail = `${fade},loudnorm=I=-14:TP=-1.5,volume=1dB,alimiter=limit=0.8:level=0,aresample=48000[a]`;
const filter = VO
  ? `[1:a]volume=0.42[m0];[3:a]apad,highpass=f=80,afftdn=nf=-25,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,volume=1.6,asplit=2[v][vk];[m0][vk]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[m];${sfx};[m][s][v]amix=inputs=3:normalize=0,${tail}`
  : `[1:a]volume=0.55[m];${sfx};[m][s]amix=inputs=2:normalize=0,${tail}`;
const inputs = ['-i', `out/${AD}-silent.mp4`, '-i', 'out/music.wav', '-i', 'out/sfx.wav', ...(VO ? ['-i', VO] : [])];
const OUT = VO ? `out/${CFG.out}-vo.mp4` : `out/${CFG.out}.mp4`;
run(FF, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', DUR.toFixed(2), '-movflags', '+faststart', OUT]);
console.log('done ->', OUT);
