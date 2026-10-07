// node build.mjs [--vo voice.wav] [--quick]
// أمرٌ واحد: يقرأ TIMING من index.html ⇒ مؤثّرات على حدود المشاهد ⇒ موسيقى
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
const cues = [
  { t: at('hook', .05), type: 'thump' }, { t: at('hook', .35), type: 'click' }, { t: at('hook', 1.15), type: 'pop' },
  { t: at('cats', -.3), type: 'whoosh' }, { t: at('cats', .05), type: 'thump' },
  ...[0, 1, 2, 3, 4, 5].map(i => ({ t: at('cats', .6 + i * .09), type: 'pop' })),
  { t: at('order', -.25), type: 'whoosh' }, { t: at('order', 1.25), type: 'click' }, { t: at('order', 1.95), type: 'click' }, { t: at('order', 2.75), type: 'pop' },
  { t: at('offers', -.22), type: 'whoosh' }, ...[0, 1, 2].map(i => ({ t: at('offers', .75 + i * .28), type: 'pop' })), { t: at('offers', 2.65), type: 'click' },
  { t: at('track', -.22), type: 'whoosh' }, { t: at('track', .2), type: 'pop' }, { t: at('track', .4), type: 'pop' }, { t: at('track', S.usp - S.track - .5), type: 'thump' },
  { t: at('usp', -.22), type: 'whoosh' }, ...[0, 1, 2].map(i => ({ t: at('usp', .1 + i * ((S.end - S.usp) - .6) / 3), type: 'thump' })),
  { t: at('end', -.25), type: 'whoosh' }, { t: at('end', .2), type: 'thump' }, { t: at('end', .8), type: 'click' },
];
writeFileSync('cues.json', JSON.stringify(cues, null, 1));

const FF = execFileSync('python', ['-c', 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())']).toString().trim();
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
run('python', ['music.py', 'out/music.wav', JSON.stringify({ drop: S.cats, end: S.end, dur: DUR + .6 })]);
run('node', ['sfx.mjs', 'cues.json', 'out/sfx.wav']);
if (!argv.includes('--quick')) run('node', ['render.mjs', '--fps', '30', '--dur', String(DUR), '--sub', '2']);

// المزج: بلا صوت ⇒ موسيقى معتدلة؛ بصوت ⇒ الموسيقى تنخفض تلقائياً تحته (sidechain)
const fade = `afade=t=out:st=${(DUR - .6).toFixed(2)}:d=0.6`;
const sfx = '[2:a]volume=0.8,pan=stereo|c0=c0|c1=c0[s]';
const filter = VO
  ? `[1:a]volume=0.45[m0];[3:a]apad,highpass=f=80,afftdn=nf=-25,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,volume=1.6,asplit=2[v][vk];[m0][vk]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[m];${sfx};[m][s][v]amix=inputs=3:normalize=0,${fade},loudnorm=I=-14:TP=-1.5,aresample=48000[a]`
  : `[1:a]volume=0.55[m];${sfx};[m][s]amix=inputs=2:normalize=0,${fade},loudnorm=I=-14:TP=-1.5,aresample=48000[a]`;
const inputs = ['-i', 'out/silent.mp4', '-i', 'out/music.wav', '-i', 'out/sfx.wav', ...(VO ? ['-i', VO] : [])];
run(FF, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', DUR.toFixed(2), '-movflags', '+faststart', VO ? 'out/wajeez-ad-vo.mp4' : 'out/wajeez-ad.mp4']);
console.log('done ->', VO ? 'out/wajeez-ad-vo.mp4' : 'out/wajeez-ad.mp4');
