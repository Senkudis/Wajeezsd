/**
 * بناء فيديو شرح من سكربته.
 *
 *   node tools/build.js <video> timeline          → output/<video>.timeline.json + .srt + .chapters.txt
 *   node tools/build.js <video> preview 3,40,95   → scout/<video>-<t>.jpg (إطاراتٌ للمراجعة)
 *   node tools/build.js <video> render            → output/<video>.mp4 (صورة + صوت + موسيقى)
 *   node tools/build.js <video> render --draft    → نصف الدقّة، أسرع، للمراجعة
 *
 * التوقيت من التسجيلات: كل مشهدٍ يطول بقدر جملته المسجّلة في
 * vo/<video>/<sceneId>.wav. وبلا تسجيلٍ يُقدَّر من عدد الكلمات (٢٫٤ كلمة/ث،
 * إيقاع حديثٍ سوداني هادئ) — فالفيديو يُراجَع قبل التسجيل ويتمدّد بعده.
 */
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const puppeteer = require('C:/Users/kde/Desktop/wajeezsd/node_modules/puppeteer-core');

const ROOT = path.join(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FPS = 30;
const WPS = 2.4;              // كلمة في الثانية — تقدير ما قبل التسجيل
const LEAD = 0.45, TAIL = 0.6; // صمتٌ قبل الجملة وبعدها داخل المشهد

function ffmpegPath() {
    if (process.env.FFMPEG) return process.env.FFMPEG;
    return execFileSync('python', ['-c', 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())']).toString().trim();
}

/** مدّة ملف WAV من ترويسته (PCM) */
function wavDuration(file) {
    const b = fs.readFileSync(file);
    let off = 12, rate = 0, ch = 1, bits = 16, dataLen = 0;
    while (off < b.length - 8) {
        const id = b.toString('ascii', off, off + 4), len = b.readUInt32LE(off + 4);
        if (id === 'fmt ') { ch = b.readUInt16LE(off + 10); rate = b.readUInt32LE(off + 12); bits = b.readUInt16LE(off + 22); }
        if (id === 'data') { dataLen = len; break; }
        off += 8 + len + (len % 2);
    }
    return rate ? dataLen / (rate * ch * (bits / 8)) : 0;
}

/** أبعاد PNG من ترويسته */
function pngSize(file) {
    const b = fs.readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** الجملة ← مقاطع ترجمة: عند علامات الوقف، وبحدٍّ أقصى للكلمات */
function chunks(text, max = 11) {
    const parts = String(text).split(/(?<=[،,.؟?!:—])\s+/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const p of parts) {
        const w = p.split(/\s+/);
        if (w.length <= max) { out.push(p); continue; }
        const n = Math.ceil(w.length / max), per = Math.ceil(w.length / n);
        for (let i = 0; i < w.length; i += per) out.push(w.slice(i, i + per).join(' '));
    }
    return out;
}

function loadScript(video) {
    const file = path.join(ROOT, 'scripts', video + '.js');
    delete require.cache[require.resolve(file)];
    return require(file);
}

function buildTimeline(video) {
    const sc = loadScript(video);
    let t = 0;
    const scenes = [];
    let lastScroll = {};
    sc.scenes.forEach((s0, idx) => {
        const s = { ...s0 };
        s.id = s.id || `${video}-${String(idx).padStart(3, '0')}`;
        // الصوت: مسجّل أم مقدَّر
        const voFile = path.join(ROOT, 'vo', video, s.id + '.wav');
        const words = s.vo ? s.vo.trim().split(/\s+/).length : 0;
        s.voFile = fs.existsSync(voFile) ? voFile : null;
        s.voDur = s.voFile ? wavDuration(voFile) : (words ? words / WPS + 0.3 : 0);
        const minByType = { cover: 4.5, agenda: 3 + sc.chapters.length * 0.35, chapter: 3.4, outro: 6 }[s.type] || 3.2;
        s.dur = Math.max(s.min || 0, minByType, s.vo ? LEAD + s.voDur + TAIL : 0);
        s.start = +t.toFixed(3);
        s.voAt = LEAD;
        // الترجمة: موزّعة على زمن الجملة بطول كل مقطع
        if (s.vo) {
            const cs = chunks(s.vo);
            const total = cs.reduce((a, c) => a + c.length, 0);
            let c0 = LEAD;
            s.captions = cs.map(c => {
                const d = s.voDur * (c.length / total);
                const r = { t0: +c0.toFixed(3), t1: +(c0 + d + 0.12).toFixed(3), text: c };
                c0 += d; return r;
            });
        }
        // الشاشة: أبعادها ومواضع عناصرها
        if (s.screen) {
            const png = path.join(ROOT, 'screens', s.screen);
            const side = png.replace(/\.png$/, '.json');
            if (fs.existsSync(side)) { const j = JSON.parse(fs.readFileSync(side, 'utf8')); s.marks = j.marks || {}; }
            if (fs.existsSync(png)) { const { w, h } = pngSize(png); s.cssH = h * (390 / w); } else console.warn('⚠️ شاشة مفقودة:', s.screen);
            // مشهدٌ بنفس شاشة سابقه يبدأ من حيث انتهى تمريرها
            if (!s.scroll && lastScroll[s.screen] != null) s.scrollStart = lastScroll[s.screen];
            const keys = s.scroll || [[0, s.scrollStart || 0]];
            lastScroll[s.screen] = keys[keys.length - 1][1];
        }
        // الإبراز والنقر على كلمةٍ من الجملة: { at, w: 'المتجر' } يبدأ حين تُقال الكلمة
        // (موضعها في النص نسبةً لطوله × زمن الجملة) ويبقى حتى الإبراز التالي
        if (s.vo) {
            const at = (w) => { const i = s.vo.indexOf(w); return i < 0 ? null : (LEAD + s.voDur * i / s.vo.length) / s.dur; };
            const fix = (list, isTap) => (list || []).forEach((h, k, arr) => {
                if (h.w == null) return;
                const t0 = at(h.w);
                if (t0 == null) { console.warn(`⚠️ ${s.id}: الكلمة «${h.w}» ليست في الجملة`); return; }
                h.t = +Math.max(0.02, t0 - (isTap ? 0 : 0.03)).toFixed(3);
                if (!isTap && h.until == null) {
                    const nx = arr.slice(k + 1).find(x => x.w != null && at(x.w) != null);
                    h.until = nx ? +(at(nx.w) - 0.03).toFixed(3) : 0.97;
                }
            });
            fix(s.hl, false); fix(s.taps, true);
        }
        t += s.dur;
        scenes.push(s);
    });
    // الفصول: من بطاقة كل فصل حتى التالية
    const chapters = sc.chapters.map((c, i) => ({ ...c }));
    chapters.forEach((c, i) => {
        const first = scenes.find(s => s.chapter === i);
        const nextFirst = scenes.find(s => s.chapter === i + 1);
        c.start = first ? first.start : 0;
        c.end = nextFirst ? nextFirst.start : (scenes.filter(s => s.type === 'outro')[0] || { start: t }).start;
    });
    return { video: sc.video, chapters, scenes, duration: +t.toFixed(3) };
}

function fmt(sec, srt) {
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = Math.floor(sec % 60), ms = Math.round((sec % 1) * 1000);
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return srt ? `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}` : (h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`);
}

function writeSidecars(video, tl) {
    const out = path.join(ROOT, 'output'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, video + '.timeline.json'), JSON.stringify(tl, null, 1));
    let n = 1; const srt = [];
    tl.scenes.forEach(s => (s.captions || []).forEach(c => {
        srt.push(`${n++}\n${fmt(s.start + c.t0, true)} --> ${fmt(s.start + c.t1, true)}\n${c.text}\n`);
    }));
    fs.writeFileSync(path.join(out, video + '.srt'), srt.join('\n'));
    // فصول يوتيوب: أوّلها 0:00 إلزاماً
    const lines = ['0:00 المقدّمة'].concat(tl.chapters.map((c, i) => `${fmt(c.start)} ${i + 1}. ${c.title}`));
    fs.writeFileSync(path.join(out, video + '.chapters.txt'), lines.join('\n') + '\n');
    const rec = tl.scenes.filter(s => s.vo).length, done = tl.scenes.filter(s => s.voFile).length;
    console.log(`⏱️  ${video}: ${fmt(tl.duration)} — ${tl.scenes.length} مشهداً، ${tl.chapters.length} فصول، التسجيل ${done}/${rec}`);
}

async function openComp(tl, scale) {
    const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars', '--disable-web-security'] });
    const p = await b.newPage();
    await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: scale || 1 });
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(require('url').pathToFileURL(path.join(ROOT, 'comp', 'index.html')).href, { waitUntil: 'networkidle0' });
    await p.evaluate(async (tl) => { await window.loadTimeline(tl); }, tl);
    await p.waitForFunction('window.__ready === true', { timeout: 120000 });
    await p.evaluate(async () => { await document.fonts.ready; });
    return { b, p, errs };
}

async function preview(video, tl, times) {
    const { b, p, errs } = await openComp(tl, 1);
    fs.mkdirSync(path.join(ROOT, 'scout'), { recursive: true });
    for (const t of times) {
        await p.evaluate(t => window.renderAt(t), t);
        const f = path.join(ROOT, 'scout', `${video}-${t}.jpg`);
        await p.screenshot({ path: f, type: 'jpeg', quality: 88 });
        console.log('🖼️ ', f);
    }
    if (errs.length) console.log('أخطاء:', errs.slice(0, 5));
    await b.close();
}

/** مقطعٌ من الإطارات [f0, f1) في متصفّحٍ مستقلّ إلى ملفٍ مستقل */
async function renderSegment(tl, draft, f0, f1, file, onProgress) {
    const FF = ffmpegPath();
    const { b, p, errs } = await openComp(tl, draft ? 0.5 : 1);
    // الإطارات تُصبّ في ffmpeg مباشرةً — لا آلاف الملفات على القرص
    const ff = spawn(FF, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', draft ? 'veryfast' : 'slow',
        '-crf', draft ? '23' : '17', '-tune', 'animation', '-g', String(FPS * 2), file], { stdio: ['pipe', 'ignore', 'pipe'] });
    let ffErr = ''; ff.stderr.on('data', d => { ffErr = (ffErr + d).slice(-2000); });
    const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg: ' + ffErr))));
    for (let f = f0; f < f1; f++) {
        await p.evaluate(t => window.renderAt(t), f / FPS);
        const buf = await p.screenshot({ type: 'jpeg', quality: draft ? 85 : 95 });
        if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
        onProgress();
    }
    ff.stdin.end();
    await done;
    await b.close();
    return errs;
}

async function render(video, tl, draft) {
    const FF = ffmpegPath();
    const out = path.join(ROOT, 'output');
    const silent = path.join(out, video + '.video.mp4');
    const n = Math.round(tl.duration * FPS);
    // متصفّحاتٌ متوازية على مقاطع متتالية، ثم لصقٌ بلا إعادة ترميز
    const jobsArg = process.argv.find(a => a.startsWith('--jobs='));
    const jobs = Math.max(1, Math.min(8, jobsArg ? Number(jobsArg.split('=')[1]) : Math.floor(require('os').cpus().length / 2) || 1));
    const segs = Array.from({ length: jobs }, (_, k) => ({
        f0: Math.floor(n * k / jobs), f1: Math.floor(n * (k + 1) / jobs),
        file: path.join(out, `${video}.seg${k}.mp4`)
    }));
    let doneFrames = 0, lastLog = 0; const t0 = Date.now();
    const tick = () => { doneFrames++; if (doneFrames - lastLog >= 300) { lastLog = doneFrames; console.log(`🎞️  ${doneFrames}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}ث  (${jobs} متوازية)`); } };
    const errs = (await Promise.all(segs.map(sg => renderSegment(tl, draft, sg.f0, sg.f1, sg.file, tick)))).flat();
    const list = path.join(out, `${video}.segs.txt`);
    fs.writeFileSync(list, segs.map(sg => `file '${sg.file.split(path.sep).join('/')}'`).join('\n'));
    execFileSync(FF, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', silent], { stdio: ['ignore', 'ignore', 'inherit'] });
    segs.forEach(sg => fs.unlinkSync(sg.file)); fs.unlinkSync(list);
    console.log(`🎞️  ${n}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}ث`);
    if (errs.length) console.log('أخطاء الصفحة:', errs.slice(0, 5));

    // ── الصوت: موسيقى خفيفة + التعليق في مواضعه ──
    const music = path.join(ROOT, 'audio', `bed-${video}.wav`);
    execFileSync('python', [path.join(__dirname, 'music.py'), String(Math.ceil(tl.duration) + 2), music], { stdio: 'inherit' });
    const vos = tl.scenes.filter(s => s.voFile);
    const inputs = ['-i', silent, '-i', music];
    vos.forEach(s => inputs.push('-i', s.voFile));
    // الموسيقى أخفض حين يوجد تعليق، وتنخفض أكثر تحت الكلام (sidechain)
    const musicGain = vos.length ? 0.32 : 0.6;
    let fc = `[1:a]volume=${musicGain}[m0];`;
    if (vos.length) {
        const parts = vos.map((s, j) => { const ms = Math.round((s.start + s.voAt) * 1000); return `[${j + 2}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${j}]`; });
        fc += parts.join(';') + ';';
        fc += vos.map((_, j) => `[v${j}]`).join('') + `amix=inputs=${vos.length}:duration=longest:normalize=0[vo];`;
        fc += `[vo]asplit=2[vo1][vo2];[m0][vo1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[md];[md][vo2]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
    } else {
        fc += `[m0]loudnorm=I=-18:TP=-1.5[a]`;
    }
    const final = path.join(out, `wajeez-${video}-tutorial${draft ? '-draft' : ''}.mp4`);
    execFileSync(FF, ['-y', ...inputs, '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final], { stdio: ['ignore', 'ignore', 'inherit'] });
    fs.unlinkSync(silent);
    console.log(`✅ ${final}  (${(fs.statSync(final).size / 1048576).toFixed(1)} MB، ${fmt(tl.duration)})`);
}

if (require.main === module) (async () => {
    const [video, mode = 'timeline', arg] = process.argv.slice(2);
    if (!video) { console.log('node tools/build.js <client|captain|merchant> [timeline|preview t,t|render [--draft]]'); return; }
    const tl = buildTimeline(video);
    writeSidecars(video, tl);
    if (mode === 'preview') await preview(video, tl, String(arg || '2,8').split(',').map(Number));
    if (mode === 'render') await render(video, tl, process.argv.includes('--draft'));
})().catch(e => { console.error(e); process.exit(1); });

module.exports = { buildTimeline, wavDuration, chunks };
