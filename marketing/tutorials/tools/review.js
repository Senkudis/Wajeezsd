/**
 * مراجعة سريعة: إطارٌ من منتصف كل مشهد شاشة، مجمّعةً في شبكات للمراجعة بالعين.
 *   node tools/review.js <video> [from-to]    → scout/<video>-grid-<n>.jpg
 * (from-to: مدى مشاهد بالترتيب، مثلاً 10-25)
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { buildTimeline } = require('./build');

const video = process.argv[2];
const [a, b] = (process.argv[3] || '0-9999').split('-').map(Number);
const tl = buildTimeline(video);
const picks = tl.scenes.map((s, i) => ({ s, i })).filter(({ s, i }) => s.screen && i >= a && i <= b);
// إطارٌ عند ٦٠٪ من المشهد — بعد دخول النقاط وأثناء الإبراز غالباً
const times = picks.map(({ s }) => +(s.start + s.dur * 0.6).toFixed(2));
execFileSync('node', [path.join(__dirname, 'build.js'), video, 'preview', times.join(',')], { stdio: 'ignore' });
const scout = path.join(__dirname, '..', 'scout');
const py = `
import sys
from PIL import Image, ImageDraw
files = sys.argv[2:]; base = sys.argv[1]
for g in range(0, len(files), 6):
    grid = Image.new('RGB', (1920, 1620), (0, 0, 0))
    for j, f in enumerate(files[g:g+6]):
        im = Image.open(f).resize((960, 540))
        ImageDraw.Draw(im).text((10, 8), f.split('-')[-1], fill=(255, 255, 0))
        grid.paste(im, ((j % 2) * 960, (j // 2) * 540))
    grid.save(f'{base}-grid-{g // 6 + 1}.jpg', quality=82)
`;
const files = times.map(t => path.join(scout, `${video}-${t}.jpg`)).filter(f => fs.existsSync(f));
execFileSync('python', ['-c', py, path.join(scout, video), ...files]);
picks.forEach(({ s }, k) => console.log(`${Math.floor(k / 6) + 1}.${k % 6 + 1}  ${s.id}  ${s.screen}`));
