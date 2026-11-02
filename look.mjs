// Contact sheet of every screen look on one source and angle: node look.mjs <img> <preset> <out.png> [crop px]
// Each tile is the full frame at 1200 wide, plus a 1:1 detail crop from its middle so grain and texture show.
import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';
import fs from 'fs';
const [img = 'loupe', preset = 'gentle', out = 'out/looks.png'] = process.argv.slice(2);
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(`http://localhost:8790/?img=${img}&preset=${preset}`, { waitUntil: 'networkidle0' });
await p.evaluate(() => window.ready); await new Promise(r => setTimeout(r, 600));
const names = await p.evaluate(() => FILTERS.map(f => f[0]));
const dir = fs.mkdtempSync('/tmp/looks-');
for (const [i, n] of names.entries()) {
  const d = await p.evaluate(n => { pause(); applyFilter(n); Object.assign(S, camFor(pre), { fx: 1, seed: .123, width: 2400 }); render(true); return cv.toDataURL('image/png'); }, n);
  fs.writeFileSync(`${dir}/${i}.png`, Buffer.from(d.split(',')[1], 'base64'));
  execSync(`ffmpeg -y -loglevel error -i ${dir}/${i}.png -filter_complex "[0]scale=1200:-1[a];[0]crop=600:675:900:338,scale=600:675[b];[a][b]hstack,drawbox=x=0:y=0:w=200:h=36:color=black@0.6:t=fill" ${dir}/t${i}.png`);
}
execSync(`ffmpeg -y -loglevel error ${names.map((_, i) => `-i ${dir}/t${i}.png`).join(' ')} -filter_complex "${names.map((_, i) => `[${i}]`).join('')}vstack=inputs=${names.length},scale=1200:-1" ${out}`);
console.log(out, names.join(', '));
await b.close();
