// Headless Camera Studio check: default shot over time, follow amount, export with progress. node test.mjs [--export]
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8790/?img=rec:loupe-take', { waitUntil: 'networkidle0' });
const sl = ms => new Promise(r => setTimeout(r, ms));
await p.evaluate(() => window.ready); await sl(2500);
console.log(await p.evaluate(() => [shot().keys.map(k => `${k.t}:${k.label}:${k.mode}`).join(' '), `hold ${shot().hb}s`, $('#summary').innerText.replace(/\n/g,' | ')]));
console.log(await p.evaluate(() => { const T = shotT(), base = shotAt(free, shotFor({ follow: 0, sway: 0 }), 0);
  return [0, .25, .5, .75, 1].map(f => { const t = f*T*.999, c = shotAt(free, shotFor(), t), n = shotAt(free, shotFor({ follow: 0 }), t);
    return `${t.toFixed(1)}s zoom ${(c.zoom/base.zoom*100-100).toFixed(1)}% yaw ${c.rotY.toFixed(2)}° focus ${c.fu.toFixed(2)},${c.fv.toFixed(2)} (no-follow ${n.fu.toFixed(2)},${n.fv.toFixed(2)}) frame Δ${(Math.hypot(c.cu-n.cu, c.cv-n.cv)*100).toFixed(1)}%`; }).join('\n'); }));
await p.evaluate(() => { head = 6; applyHead(); ensureTicking(); }); await sl(900);
await p.screenshot({ path: 'out/studio-ui.png' });
if (process.argv.includes('--export')) {
  await p.evaluate(() => exportShot());
  for (let i=0;i<300;i++){ await sl(2000); const st = await p.evaluate(() => $('#mstatus').innerText); if (/^(Saved|Export failed)/.test(st)) { console.log('EXPORT:', st); break; } }
}
await b.close();
