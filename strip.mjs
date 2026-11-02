// Frame strip of a motion on a still: node strip.mjs <img> <bg> <move> <from 0|1> <to 0|1> <outdir> [every secs]
import puppeteer from 'puppeteer-core'; import fs from 'fs';
const [,, img, bg, move, from, to, out, every='0.5'] = process.argv;
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(`http://localhost:8790/?img=${img}`, { waitUntil: 'networkidle0' });
await p.evaluate(() => window.ready); await new Promise(r => setTimeout(r, 1000));
const urls = await p.evaluate(async (bg, move, from, to, every) => {
  S.bg = bg; $('#fromflat').checked = from === '1'; $('#toflat').checked = to === '1';
  applyMove(MOVES.findIndex(m => m[0] === move), false); pause();
  const sh = shotFor(), T = sh.T, res = [];
  for (let t = 0; t <= T + 1e-6; t += +every) { Object.assign(S, shotAt(free, sh, Math.min(t, T - .001))); render(false, 480); res.push([t.toFixed(1), cv.toDataURL('image/jpeg', .9)]); }
  return res;
}, bg, move, from, to, every);
fs.mkdirSync(out, { recursive: true });
urls.forEach(([t, u], i) => fs.writeFileSync(`${out}/${String(i).padStart(3,'0')}.jpg`, Buffer.from(u.split(',')[1], 'base64')));
await b.close();
