// How much each screen look darkens a white UI: renders the same frame with the look and without (amount 0) and
// compares the brightness of the white page area. node whitecheck.mjs [img] [preset]
import puppeteer from 'puppeteer-core';
const [img = 'peeps', preset = 'gentle'] = process.argv.slice(2);
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(`http://localhost:8790/?img=${img}&preset=${preset}`, { waitUntil: 'networkidle0' }); await p.evaluate(() => window.ready); await new Promise(r => setTimeout(r, 600));
const res = await p.evaluate(() => {
  const stat = () => { const W = cv.width, H = cv.height, px = new Uint8Array(W*H*4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // the lower middle of the frame: page background in these shots
    let s = 0, n = 0, hi = 0; for (let y = Math.round(H*.1); y < H*.35; y += 2) for (let x = Math.round(W*.3); x < W*.7; x += 2) { const i = (y*W + x)*4, l = (px[i] + px[i+1] + px[i+2])/3; s += l; n++; if (l >= 250) hi++; }
    return [+(s/n).toFixed(1), +(hi/n*100).toFixed(0)]; };
  const out = {};
  for (const [n] of FILTERS) { pause(); applyFilter(n); for (const a of [0, 1]) { Object.assign(S, camFor(pre), { fx: 1, fxAmt: n === 'none' ? 0 : a, seed: .123, width: 1600 }); render(true); out[n + (a ? '' : ' (plain)')] = stat(); } }
  return out; });
for (const [k, v] of Object.entries(res)) if (!k.includes('plain') || k.startsWith('bright')) console.log(k.padEnd(22), 'mean', v[0], ' white px %', v[1]);
await b.close();
