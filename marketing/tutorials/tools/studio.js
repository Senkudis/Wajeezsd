/**
 * 🎙️ استوديو التسجيل — جملةً جملة، بصوتٍ سوداني حقيقي.
 *
 *   node tools/studio.js        ثم افتح  http://localhost:4310
 *
 * الصفحة تعرض كل جملةٍ من سكربت الفيديو مع شاشتها، وتسجّل من الميكروفون.
 * كل تسجيلٍ يُحفظ في vo/<video>/<sceneId>.wav بعد تنظيفه:
 *   مرشّح للطنين المنخفض، قصّ الصمت من البداية والنهاية، وتطبيع الارتفاع
 *   (‎-16 LUFS) — فتتساوى الجمل ولو سُجّلت في أيامٍ مختلفة.
 * ثم «node tools/build.js <video> render» يبني الفيديو على أطوال التسجيلات.
 *
 * الميكروفون يعمل على localhost فقط (سياقٌ آمن) — افتح الرابط في هذا الجهاز.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { buildTimeline } = require('./build');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 4310);
const VIDEOS = { client: 'العميل', captain: 'الكابتن', merchant: 'التاجر' };
const FF = process.env.FFMPEG || execFileSync('python', ['-c', 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())']).toString().trim();

const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.css': 'text/css', '.js': 'application/javascript', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveFile(res, file) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { message: 'غير موجود' });
    send(res, 200, fs.readFileSync(file), TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
}

const safe = (s) => /^[a-z0-9_-]+$/i.test(s);

function lines(video) {
    const tl = buildTimeline(video);
    return tl.scenes.filter(s => s.vo).map(s => ({
        id: s.id, chapter: s.chapter, chapterTitle: s.chapter != null && tl.chapters[s.chapter] ? tl.chapters[s.chapter].title : (s.type === 'cover' ? 'المقدّمة' : s.type === 'outro' ? 'الخاتمة' : ''),
        title: s.title || '', vo: s.vo, screen: s.screen || null, tone: s.tone || '',
        recorded: !!s.voFile, voDur: s.voFile ? +s.voDur.toFixed(2) : null,
        estDur: +(s.vo.trim().split(/\s+/).length / 2.4).toFixed(1)
    }));
}

http.createServer(async (req, res) => {
    try {
        const u = new URL(req.url, 'http://x');
        const p = decodeURIComponent(u.pathname);
        if (req.method === 'GET' && (p === '/' || p === '/index.html')) return serveFile(res, path.join(ROOT, 'studio', 'index.html'));
        if (req.method === 'GET' && p === '/api/videos') {
            return send(res, 200, Object.entries(VIDEOS).filter(([k]) => fs.existsSync(path.join(ROOT, 'scripts', k + '.js'))).map(([k, v]) => {
                const L = lines(k); return { key: k, label: v, total: L.length, done: L.filter(l => l.recorded).length };
            }));
        }
        if (req.method === 'GET' && p === '/api/lines') {
            const v = u.searchParams.get('video');
            if (!VIDEOS[v]) return send(res, 400, { message: 'فيديو غير معروف' });
            return send(res, 200, lines(v));
        }
        if (req.method === 'GET' && p.startsWith('/screens/')) return serveFile(res, path.join(ROOT, 'screens', p.slice(9).replace(/\.\./g, '')));
        if (req.method === 'GET' && p.startsWith('/vo/')) return serveFile(res, path.join(ROOT, 'vo', p.slice(4).replace(/\.\./g, '')));
        if (req.method === 'GET' && p.startsWith('/fonts/')) return serveFile(res, path.join(ROOT, '..', '..', 'public_html', 'vendor', 'fonts', p.slice(7).replace(/\.\./g, '')));

        const m = p.match(/^\/api\/vo\/([a-z]+)\/([A-Za-z0-9_-]+)$/);
        if (m && VIDEOS[m[1]] && safe(m[2])) {
            const out = path.join(ROOT, 'vo', m[1], m[2] + '.wav');
            if (req.method === 'DELETE') { if (fs.existsSync(out)) fs.unlinkSync(out); return send(res, 200, { ok: true }); }
            if (req.method === 'POST') {
                const chunks = []; for await (const c of req) chunks.push(c);
                const raw = Buffer.concat(chunks);
                if (raw.length < 2000) return send(res, 400, { message: 'التسجيل فارغ' });
                const tmp = path.join(os.tmpdir(), `wajeez-vo-${Date.now()}.webm`);
                fs.writeFileSync(tmp, raw);
                fs.mkdirSync(path.dirname(out), { recursive: true });
                // تنظيف: طنينٌ منخفض، صمتٌ في الطرفين (يبقى ١٥٠ م.ث تنفّساً)، وارتفاعٌ موحّد
                const af = [
                    'highpass=f=80', 'lowpass=f=13000',
                    'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.15',
                    'areverse', 'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.2', 'areverse',
                    'loudnorm=I=-16:TP=-1.5:LRA=7'
                ].join(',');
                execFileSync(FF, ['-y', '-i', tmp, '-af', af, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', out], { stdio: 'ignore' });
                fs.unlinkSync(tmp);
                const { wavDuration } = require('./build');
                const dur = wavDuration(out);
                console.log(`🎙️  ${m[1]}/${m[2]}  ${dur.toFixed(2)}ث`);
                return send(res, 200, { ok: true, dur });
            }
        }
        send(res, 404, { message: 'غير موجود' });
    } catch (e) {
        console.error(e);
        send(res, 500, { message: e.message });
    }
}).listen(PORT, () => console.log(`🎙️  استوديو التسجيل: http://localhost:${PORT}`));
