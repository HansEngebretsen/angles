// Load a shot file (shots/<name>.json: recording, look, timing, keys) into the studio and export it.
// node shot.mjs shots/loupe-intro.json [--still 0,8.2,11] [--aspect 3:1]   (--still also saves snapshots at those shot times)
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const file = process.argv[2], spec = JSON.parse(fs.readFileSync(file));
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const aspect = arg('--aspect') || spec.aspect || '16:9', stills = (arg('--still') || '').split(',').filter(Boolean).map(Number);
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(`http://localhost:8790/?img=rec:${spec.rec}&aspect=${aspect}`, { waitUntil: 'networkidle0' });
await p.evaluate(() => window.ready); await new Promise(r => setTimeout(r, 1200));
await p.evaluate(spec => {
  if (spec.filter) applyFilter(spec.filter);
  Object.assign(S, spec.look);
  const sh = shot(); Object.assign(sh, spec.shot, { init: true, auto: null });
  sh.keys = spec.keys.map(k => ({ ...k, cam: { ...camOf(S), fov: 28, ...k.cam } }));
  free = { ...sh.keys[0].cam }; sel = -1; head = 0; paintTimeline(); paintMoves(); syncSliders(); ensureTicking();
}, spec);
const name = file.split('/').pop().replace('.json', '') + (aspect !== '16:9' ? '-' + aspect.replace(':', 'x') : '');
for (const t of stills) {
  const png = await p.evaluate(async t => { head = t; applyHead(); const r = cur.rec, f = Math.min(r.frames - 1, Math.round(videoTime(t) * r.fps));
    const keep = cur; const url = await motionFrame(`rec/${r.id}/${String(f).padStart(4, '0')}.${r.ext}`, { ...S, seed: .123 }); cur = keep; return url; }, t);
  fs.writeFileSync(`out/${name}-${t}s.jpg`, Buffer.from(png.split(',')[1], 'base64')); console.log(`out/${name}-${t}s.jpg`);
}
if (!process.argv.includes('--stills-only')) {
  const r = await p.evaluate(async name => {
    const sh = shotFor(), t = trim(), fps = cur.rec.fps;
    const job = { name: name + '-' + Date.now().toString(36).slice(-4), img: 'loupe', aspect: aspectName(), settings: { ...S, ...free }, shot: sh, rec: cur.rec.id, in: Math.round(t.in*fps), out: Math.round(t.out*fps), xfade: 0 };
    return (await fetch('export', { method: 'POST', body: JSON.stringify(job) })).json();
  }, name);
  let st; do { await new Promise(r => setTimeout(r, 2000)); st = await (await fetch(`http://localhost:8790/export-status?name=${r.name}`)).json(); process.stdout.write(`\r${st.state} ${st.done || 0}/${st.total || '?'}   `); } while (!['done', 'failed', 'unknown'].includes(st.state));
  console.log('\n' + (st.mp4 || st.error));
}
await b.close();
