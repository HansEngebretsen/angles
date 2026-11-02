// Render a studio shot to mp4: node app/motion.mjs <job.json> (run from the repo root; serve.py's /export does this)
// job: { name, img, aspect, settings, shot: { keys, loop, hb, ha, sway, T }, rec?, width? }  (the studio's Export writes one)
// Frames come from job.seqDir (a studio recording, trimmed and crossfaded by the server), else rec/<img>-breathe/, else the still.
// The camera is window.shotAt from the studio, so the preview and the export match.
import fs from 'fs';
import { execSync } from 'child_process';
import puppeteer from 'puppeteer-core';

const job = JSON.parse(fs.readFileSync(process.argv[2]));
const W = job.width || 1920, FPS = 30;
// a frame sequence: the job's (a trimmed, looped recording from the studio) or the scripted rec/<img>-breathe
const seqDir = job.seqDir || `rec/${job.img}-breathe`, ext = job.seqExt || 'png';
const M = fs.existsSync(seqDir) ? fs.readdirSync(seqDir).filter(f => /^\d{4}\./.test(f)).length : 0;
// a studio shot: T seconds; loop plays the (crossfaded) clip on repeat, otherwise hold, play once, hold
const SH = job.shot, T = SH.T, N = Math.round(T * FPS), HB = SH.loop ? 0 : (SH.hb || 0);
const srcIdx = i => SH.loop ? Math.floor(i % (M || 1)) : Math.min(Math.max(Math.round((i / FPS - HB) * FPS), 0), M - 1);
const frameSrc = i => M ? `${seqDir}/${String(srcIdx(i)).padStart(4, '0')}.${ext}` : `src/${job.img}.png`;

const dir = `out/loops/${job.name}/frames`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage();
await p.goto(`http://localhost:${process.env.ANGLES_PORT || 8790}/?img=${job.img}&aspect=${encodeURIComponent(job.aspect || "16:9")}`, { waitUntil: 'networkidle0' });
await p.evaluate(() => window.ready);
const base = { ...job.settings, width: W };
for (let i = 0; i < N; i++) {
  const data = await p.evaluate((src, b0, sh, t, seed) => window.motionFrame(src, { ...b0, ...window.shotAt(b0, sh, t), seed }, t, sh), frameSrc(i), base, SH, i / FPS, (i * .618) % 1);
  fs.writeFileSync(`${dir}/${String(i).padStart(4, '0')}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`progress ${i + 1} ${N}`);
}
await b.close();
console.log('encoding');
execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${dir}/%04d.jpg -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart out/loops/${job.name}.mp4`);
console.log(JSON.stringify({ ok: true, mp4: `out/loops/${job.name}.mp4`, seq: !!M }));
process.exit(0);
