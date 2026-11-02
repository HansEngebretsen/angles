// Record a looping Loupe interaction as numbered frames: node record.mjs <outDir> [mode=breathe|orbit] [frames] [dpr=2]
// Both modes end where they began, so the last frame leads straight back into the first.
//   breathe: the lens stays put and slowly grows a little and shrinks back (Loupe's Size slider, moved continuously)
//   orbit:   the lens is dragged around a closed path between the dice
import fs from 'fs';
import puppeteer from 'puppeteer-core';
const [out, mode = 'breathe', N = mode === 'breathe' ? '360' : '150', dpr = '2'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: +dpr });
await p.goto('https://haaans.com/loupe/', { waitUntil: 'networkidle0' });
await sleep(2500);
await p.click('button[title="Fit to Screen"]'); await sleep(4000); // let Loupe's scroll hint fade out first
const shot = i => p.screenshot({ path: `${out}/${String(i).padStart(4, '0')}.png` });
// where the lens is now, as a fraction of the viewport (focus follows this)
const lensAt = () => p.evaluate(() => { const r = document.querySelector('div.absolute.z-10.cursor-move').getBoundingClientRect();
  return [+((r.x + r.width / 2) / innerWidth).toFixed(4), +((r.y + r.height / 2) / innerHeight).toFixed(4), +(r.width / innerWidth).toFixed(4)]; });
const track = [];

if (mode === 'breathe') {
  const size = t => 800 + 90 * (.5 - .5 * Math.cos(t * Math.PI * 2));
  await p.evaluate(() => { const i = document.querySelectorAll('input[type=range]')[1]; i.step = 'any'; });
  for (let i = 0; i < +N; i++) {
    await p.evaluate(v => { const el = document.querySelectorAll('input[type=range]')[1];
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true })); }, size(i / +N).toFixed(2));
    await sleep(25); await shot(i); track.push(await lensAt());
  }
} else {
  const start = [709, 353];
  const path = t => { const a = t * Math.PI * 2; return [905 - 196 * Math.cos(a), 400 - 70 * Math.sin(a) - 47 * Math.cos(a)]; };
  await p.mouse.move(...start); await p.mouse.down();
  for (let i = 1; i <= 20; i++) { const [x, y] = path(0); await p.mouse.move(start[0] + (x - start[0]) * i / 20, start[1] + (y - start[1]) * i / 20); }
  await sleep(300);
  for (let i = 0; i < +N; i++) {
    const t = i / +N, e = t - Math.sin(t * Math.PI * 2) / (Math.PI * 2) * .35; // a touch of ease: hands slow down and speed up
    await p.mouse.move(...path(e)); await sleep(30);
    await shot(i); track.push(await lensAt());
  }
  await p.mouse.up();
}
fs.writeFileSync(`${out}/track.json`, JSON.stringify(track));
await b.close(); console.log('frames', N); process.exit(0);
