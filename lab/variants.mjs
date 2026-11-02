// Render a set of shot variants of one recording through the studio's own export, one after another:
// node variants.mjs <variants.json>   ->  out/loops/<name>.mp4 for each, and out/variants/<set>.json listing them
// A variant: { name, rec, crop:[u0,v0,u1,v1], in, out, preset ('flat' or an angle), intensity, move (a motion's name)
//   or keys (custom camera keys), or style + level (the simple styles), look (a screen look), amount (its intensity), fill, bg, follow, from, to, aspect }
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const set = JSON.parse(fs.readFileSync(process.argv[2])), done = [];
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
for (const v of set.variants) {
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(`http://localhost:8790/?img=rec:${v.rec || set.rec}&aspect=${v.aspect || set.aspect || '16:9'}`, { waitUntil: 'networkidle0' });
  await p.evaluate(() => window.ready); await new Promise(r => setTimeout(r, 1500));
  await p.evaluate(async v => {
    const id = IMAGES[img].id;
    if (v.crop) { S.crop = crops[id] = v.crop; }
    const tr = trim(); if (v.in != null) tr.in = v.in; if (v.out != null) tr.out = v.out;
    if (v.segs) SEGS[id] = v.segs.map(g => ({ ...g })); // a multi-clip edit: [{ rec, in, out }] in seconds
    if (v.shadow) Object.assign(S, v.shadow);
    S.fill = v.fill !== false; S.bg = v.bg || '#ffffff';
    applyFilter(v.look || 'bright'); S.fxAmt = v.amount ?? 1; if (v.shadow) Object.assign(S, v.shadow);
    setIntensity(v.intensity ?? .45);
    $('#fromflat').checked = !!v.from; $('#toflat').checked = !!v.to;
    const sh = shot(); sh.follow = v.follow === false ? false : undefined; sh.loop = false; sh.hb = v.hb ?? 0; sh.ha = v.ha ?? 0;
    if (v.style) { await loadTrack(); applyStyle(v.style, v.level || 'whisper', true); if (v.bg) S.bg = v.bg; pause(); return; }
    if (v.preset === 'flat') choosePreset(-1); else choosePreset(Math.max(0, PRESETS.findIndex(x => x[0] === (v.preset || 'gentle'))));
    if (v.keys) { const T = shotT(); sh.keys = v.keys.map(k => ({ t: k.t >= 1e9 ? T : k.t, mode: k.mode || 'drift', ease: k.ease, label: 'v', cam: { ...camOf(S), ...FLAT0, fu: S.fu, fv: S.fv, ...k.cam } })); sh.auto = null; }
    else applyMove(MOVES.findIndex(m => m[0] === (v.move || 'push in')), false);
    pause();
  }, v);
  const name = await p.evaluate(() => { exportShot(); return new Promise(r => setTimeout(() => r(exporting), 1500)); });
  let st; do { await new Promise(r => setTimeout(r, 2000)); st = await (await fetch(`http://localhost:8790/export-status?name=${name}`)).json(); } while (!['done', 'failed', 'unknown'].includes(st.state));
  console.log(v.name, st.mp4 || st.error); done.push({ ...v, mp4: st.mp4 });
  await p.close();
}
fs.mkdirSync('out/variants', { recursive: true });
fs.writeFileSync(`out/variants/${set.name}.json`, JSON.stringify(done, null, 1));
await b.close();
