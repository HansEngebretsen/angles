// Frame-by-frame smoothness check. For every motion × flat-ends combination (and any shots/*.json), steps the
// camera at 30fps, projects a grid of points on the screen into output pixels (same maths as the shader), and
// reports jolts: frames where the on-screen velocity changes far more than the motion around it.
// node smooth.mjs [--img peeps] [--bg #1b1c20] [--strip]   (--strip renders frames around the worst jolt of each case)
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const SPEED = arg('--speed'), EASE = arg('--ease'); // a move easing for every shot / an ease on every tween
const IMG = arg('--img', 'peeps'), BG = arg('--bg', '#1b1c20'), STRIP = process.argv.includes('--strip');
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(`http://localhost:8790/?img=${IMG}${process.argv.includes('--all') ? '&all=1' : ''}`, { waitUntil: 'networkidle0' });
await p.evaluate(() => window.ready); await new Promise(r => setTimeout(r, 800));

const SHOT = arg('--shot'); // a shot file instead of the motions: loads it like shot.mjs
if (SHOT) { await p.goto(`http://localhost:8790/?img=rec:${JSON.parse(fs.readFileSync(SHOT)).rec}`, { waitUntil: 'networkidle0' }); await p.evaluate(() => window.ready); await new Promise(r => setTimeout(r, 1500)); }
const cases = await p.evaluate(async (BG, spec, SPEED, EASE) => {
  S.bg = BG;
  // where a point (u, v) of the screen lands in output pixels, 1600 wide
  const W = 1600, H = W / ASPECT;
  function proj(c, A, u, v) {
    const r = [c.rotX, c.rotY, c.rotZ].map(x => x * Math.PI / 180);
    const [cx, sx, cy, sy, cz, sz] = [Math.cos(r[0]), Math.sin(r[0]), Math.cos(r[1]), Math.sin(r[1]), Math.cos(r[2]), Math.sin(r[2])];
    // rz*ry*rx applied to a vector, matching the shader's column-major mats
    const rx = q => [q[0], cx*q[1] - sx*q[2], sx*q[1] + cx*q[2]];
    const ry = q => [cy*q[0] + sy*q[2], q[1], -sy*q[0] + cy*q[2]];
    const rz = q => [cz*q[0] - sz*q[1], sz*q[0] + cz*q[1], q[2]];
    const R = q => rz(ry(rx(q))), ex = R([1,0,0]), ey = R([0,1,0]);
    const t = Math.tan(c.fov * Math.PI / 360), cam = [0, 0, .5 / t / c.zoom];
    const P = [0,1,2].map(i => -(ex[i]*(c.cu - .5)*A + ey[i]*(.5 - c.cv)) + ex[i]*(u - .5)*A + ey[i]*(.5 - v));
    const d = [P[0] - cam[0], P[1] - cam[1], P[2] - cam[2]];
    return [((d[0] / -d[2]) / (t * W / H) * .5 + .5) * W, (.5 - (d[1] / -d[2]) / t * .5) * H];
  }
  const A = cur.size[0] / cur.size[1], pts = [];
  for (const u of [0, .5, 1]) for (const v of [0, .5, 1]) pts.push([u, v]);
  function analyse(label) {
    const sh = shotFor(), T = sh.T, n = Math.round(T * 30), pos = [];
    for (let i = 0; i <= n; i++) { const c = shotAt(free, sh, i / 30); pos.push(pts.map(([u, v]) => proj(c, A, u, v)).concat([[c.fx * 100, c.aperture]])); }
    // velocity per frame (px), then the change in velocity (px/frame²), largest over the grid
    const vel = pos.slice(1).map((f, i) => f.map((q, j) => [q[0] - pos[i][j][0], q[1] - pos[i][j][1]]));
    const accV = vel.slice(1).map((f, i) => f.map((q, j) => [q[0] - vel[i][j][0], q[1] - vel[i][j][1]]));
    // jerk: the change in acceleration. Smooth motion keeps it tiny; a key that snaps speed or acceleration spikes it
    const acc = accV.slice(1).map((f, i) => Math.max(...f.slice(0, 9).map((q, j) => Math.hypot(q[0] - accV[i][j][0], q[1] - accV[i][j][1]))));
    const speed = vel.map(f => Math.max(...f.slice(0, 9).map(q => Math.hypot(...q))));
    const cuts = new Set(sh.keys.filter(k => k.mode === 'cut').map(k => Math.round(k.t * 30)));
    // a jolt: acceleration spike well above its neighbourhood that isn't a cut
    let worst = { a: 0, f: 0 };
    acc.forEach((a, i) => { if ([...cuts].some(c => Math.abs(c - (i + 2)) <= 2)) return; if (a > worst.a) worst = { a, f: i + 2 }; });
    const peak = Math.max(...speed), stops = [];
    // dead stops: moving, then still within a frame or two
    for (let i = 2; i < speed.length; i++) if (speed[i - 2] > .25 && speed[i] < .02 && ![...cuts].some(c => Math.abs(c - i) <= 2)) stops.push(i);
    // background leaks: frames where the screen doesn't fill the frame although every key does
    const keysFill = sh.keys.every(k => k.cam.zoom >= coverZoom(k.cam, sh.A, sh.out, 0)*.999);
    let leaks = 0; for (let i = 0; i <= n; i++) { const c = shotAt(free, sh, i / 30); if (c.zoom < coverZoom(c, sh.A, sh.out, 0)*.999) leaks++; }
    return { label, T: +T.toFixed(2), keysFill, leaks, keys: sh.keys.map(k => `${k.t}${k.mode[0]}${k.label === 'flat' ? 'F' : ''}`).join(' '),
      peakSpeed: +peak.toFixed(2), worstJolt: +worst.a.toFixed(3), at: +(worst.f / 30).toFixed(2), stops: stops.slice(0, 4).map(i => +(i / 30).toFixed(2)),
      fxStep: +Math.max(...pos.slice(1).map((f, i) => Math.abs(f[9][0] - pos[i][9][0]))).toFixed(2) };
  }
  if (spec) {
    if (spec.filter) applyFilter(spec.filter); Object.assign(S, spec.look);
    const sh = shot(); Object.assign(sh, spec.shot, { init: true, auto: null });
    sh.keys = spec.keys.map(k => ({ ...k, cam: { ...camOf(S), fov: 28, ...k.cam } })); free = { ...sh.keys[0].cam };
    return [analyse('shot')];
  }
  const out = [], ALL = location.search.includes('all');
  for (const pi of ALL ? PRESETS.map((_, i) => i) : [pre]) { pre = pi; lastLabel = PRESETS[pi][0];
    for (const [from, to] of [[false, false], [true, false], [false, true], [true, true]]) {
      $('#fromflat').checked = from; $('#toflat').checked = to;
      for (let i = 0; i < MOVES.length; i++) { applyMove(i, false); if (SPEED) shot().speed = SPEED; if (EASE) shot().keys.forEach(k => k.ease = EASE); out.push(analyse(`${ALL ? PRESETS[pi][0] + ' · ' : ''}${MOVES[i][0]}${from ? ' +from' : ''}${to ? ' +to' : ''}`)); }
    } }
  return out;
}, BG, SHOT ? JSON.parse(fs.readFileSync(SHOT)) : null, SPEED, EASE);
const rows = c => ({ case: c.label, jerk: c.worstJolt, at: c.at, peak: c.peakSpeed, stops: c.stops.join(','), leaks: c.leaks, keysFill: c.keysFill, keys: c.keys });
if (process.argv.includes('--all')) {
  console.log(`${cases.length} cases · worst jerk ${Math.max(...cases.map(c => c.worstJolt))} · stops ${cases.filter(c => c.stops.length).length} · leaks where keys fill ${cases.filter(c => c.keysFill && c.leaks).length}`);
  console.table([...cases].sort((a, b) => b.worstJolt - a.worstJolt).slice(0, 8).map(rows));
  console.table(cases.filter(c => c.keysFill && c.leaks).slice(0, 8).map(rows));
  console.table(cases.filter(c => c.stops.length).slice(0, 14).map(rows));
} else console.table(cases.map(rows));
fs.writeFileSync('out/smooth.json', JSON.stringify(cases, null, 1));
await b.close();
