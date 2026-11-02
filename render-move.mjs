// Export a motion on a still through the studio: node render-move.mjs <img> <move> <preset> <bg> <from 0|1> <to 0|1>
import puppeteer from 'puppeteer-core';
const [,, img, move, preset, bg, from, to] = process.argv;
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(`http://localhost:8790/?img=${img}&preset=${encodeURIComponent(preset)}`, { waitUntil: 'networkidle0' });
await p.evaluate(() => window.ready); await new Promise(r => setTimeout(r, 1000));
await p.evaluate((move, bg, from, to) => { S.bg = bg; $('#fromflat').checked = from === '1'; $('#toflat').checked = to === '1';
  applyMove(MOVES.findIndex(m => m[0] === move), false); exportShot(); }, move, bg, from, to);
await new Promise(r => setTimeout(r, 1500));
const name = await p.evaluate(() => exporting); let st;
do { await new Promise(r => setTimeout(r, 2000)); st = await (await fetch(`http://localhost:8790/export-status?name=${name}`)).json(); process.stdout.write(`\r${st.state} ${st.done || 0}/${st.total || '?'}   `); } while (!['done', 'failed', 'unknown'].includes(st.state));
console.log('\n' + (st.mp4 || st.error));
await b.close();
