// أين ffmpeg؟ — FFMPEG من البيئة أولاً، ثم نسخة CapCut المثبّتة، ثم imageio_ffmpeg.
// (نسخة imageio على هذا الجهاز يحجبها Windows Defender، فلا تُستعمل إلا إن عملت.)
// VCODEC: libx264 إن وُجد، وإلا مُرمِّز ويندوز h264_mf بوضع الجودة.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const works = (p) => { try { execFileSync(p, ['-hide_banner', '-version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } };
function find() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const capcut = (process.env.LOCALAPPDATA || 'C:/Users/kde/AppData/Local') + '/CapCut/Apps';
  if (existsSync(capcut)) for (const v of readdirSync(capcut).sort().reverse()) { const p = `${capcut}/${v}/ffmpeg.exe`; if (existsSync(p) && works(p)) return p; }
  for (const py of ['python', 'python3']) {
    try { const p = execFileSync(py, ['-c', 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); if (works(p)) return p; } catch (e) {}
  }
  throw new Error('ffmpeg غير موجود — اضبط FFMPEG على مسار ffmpeg.exe');
}
export const FF = find();
const enc = execFileSync(FF, ['-hide_banner', '-encoders'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
export const VCODEC = /libx264/.test(enc)
  ? ['-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p']
  : ['-c:v', 'h264_mf', '-rate_control', 'quality', '-quality', '92', '-scenario', 'archive', '-pix_fmt', 'yuv420p'];
