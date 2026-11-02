// How active a shot feels, measured: projects a 3x3 grid of screen points into the frame at 30fps and reports how
// fast the picture moves, as % of the frame width per second (95th percentile and peak), how often it changes
// direction, and the share that comes from follow-the-action and hand sway. node motionstats.mjs out/variants/<set>.json
import puppeteer from 'puppeteer-core'; import fs from 'fs';
const set = JSON.parse(fs.readFileSync(process.argv[2]));
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
for (const v of set) {
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
  await p.goto(`http://localhost:8790/?img=rec:${v.rec || 'loupe-take'}`, { waitUntil: 'networkidle0' }); await p.evaluate(() => window.ready); await new Promise(r => setTimeout(r, 1200));
  const r = await p.evaluate(async v => {
    const id = IMAGES[img].id; if (v.crop) S.crop = crops[id] = v.crop; const tr = trim(); tr.in = v.in ?? 0; tr.out = v.out ?? tr.out;
    S.fill = v.fill !== false; setIntensity(v.intensity ?? .45); const sh = shot(); sh.follow = v.follow === false ? false : undefined; sh.hb = 0; sh.ha = 0; sh.loop = false;
    if (v.preset === 'flat') choosePreset(-1); else choosePreset(Math.max(0, PRESETS.findIndex(x => x[0] === (v.preset || 'gentle'))));
    if (v.keys) { const T = shotT(); sh.keys = v.keys.map(k => ({ t: k.t >= 1e9 ? T : k.t, mode: k.mode || 'drift', ease: k.ease, cam: { ...camOf(S), ...FLAT0, fu: S.fu, fv: S.fv, ...k.cam } })); sh.auto = null; }
    else applyMove(MOVES.findIndex(m => m[0] === (v.move || 'push in')), false);
    pause(); await new Promise(r => setTimeout(r, 1500)); // the activity track loads
    const go = o => motionStats(shotFor(o));
    return { all: go({}), noFollow: go({ follow: 0 }), noSway: go({ sway: 0 }), keysOnly: go({ follow: 0, sway: 0 }) };
  }, v);
  const f = s => `${s.p95.toFixed(2)}/${s.peak.toFixed(2)}%/s rev ${s.reversals}`;
  console.log(v.name.padEnd(16), 'all', f(r.all), '| keys only', f(r.keysOnly), '| -follow', f(r.noFollow), '| -sway', f(r.noSway));
  await p.close();
}
await b.close();
