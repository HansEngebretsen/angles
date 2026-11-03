#!/usr/bin/env node
// Angles from the command line, for people and agents: a small JSON spec in, a contact sheet or an mp4 out.
//   node angles.mjs schema             every choice the studio accepts (compact JSON)
//   node angles.mjs check spec.json    a few seconds, no video: one sheet of 4 frames per variant ("variants" in the spec)
//   node angles.mjs make spec.json     the mp4 (1920 wide; --preview for 960) plus its sheet
// Each prints one JSON line. Everything runs on this machine: the studio server (serve.py) starts if it isn't up, the
// spec is applied by the studio itself in headless Chrome (window.angles, the same code the panel uses, so a spec can
// only ask for what the studio can make), and make renders through the studio's own Export (serve.py -> app/motion.mjs).
// An unknown value comes back as a warning listing the choices; nothing is guessed. See SKILL.md for the spec.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.ANGLES_PORT || 8790), BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find(p => fs.existsSync(p));
const [cmd, file, ...flags] = process.argv.slice(2);
const rel = p => path.relative(process.cwd(), p) || '.';
const say = o => { console.log(JSON.stringify(o)); process.exit(o.ok === false ? 1 : 0); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const home = p => p && p.replace(/^~(?=\/|$)/, os.homedir());

async function up(){ try { return (await fetch(`${BASE}/stills`)).ok; } catch { return false; } }
async function server(){
  if (await up()) return;
  spawn('python3', ['serve.py', String(PORT)], { cwd: ROOT, detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 40; i++) { await sleep(250); if (await up()) return; }
  say({ ok: false, error: `couldn't start serve.py on ${PORT} (python3 with numpy and pillow?)` });
}
// a file path goes into the studio (a recording is cut into frames once and reused after); an id is used as is
async function source(spec){
  const src = home(spec.source) || 'rec:loupe-take';
  if (!fs.existsSync(src)) return src;
  const ext = path.extname(src).slice(1).toLowerCase(), still = ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
  const name = slug(spec.name || path.basename(src, path.extname(src)));
  const meta = path.join(ROOT, 'rec', name, 'meta.json');
  if (!still && fs.existsSync(meta) && fs.statSync(meta).mtimeMs > fs.statSync(src).mtimeMs && !flags.includes('--fresh')) return `rec:${name}`;
  const r = await (await fetch(`${BASE}/upload?name=${name}&ext=${ext}`, { method: 'POST', body: fs.readFileSync(src) })).json();
  if (!r.ok) say({ ok: false, error: `couldn't read ${src}: ${r.error}` });
  return r.kind === 'image' ? r.id : `rec:${r.id}`;
}
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'take';
async function studio(id, spec, fn){
  if (!CHROME) say({ ok: false, error: 'needs Google Chrome (or set CHROME=/path/to/chrome)' });
  const b = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--use-angle=metal', '--window-size=1440,900'] });
  try {
    const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
    await p.goto(`${BASE}/?img=${encodeURIComponent(id)}&aspect=${encodeURIComponent(spec.aspect || '16:9')}`, { waitUntil: 'networkidle0' });
    await p.evaluate(() => window.ready);
    await p.waitForFunction(() => typeof cur !== 'undefined' && cur && shot().init, { timeout: 30000 });
    return await fn(p);
  } finally { await b.close(); }
}
const outDir = spec => { const d = path.resolve(home(spec.out) || 'angles-out'); fs.mkdirSync(d, { recursive: true }); return d; };
const writeJpg = (p, dataUrl) => fs.writeFileSync(p, Buffer.from(dataUrl.split(',')[1], 'base64'));

if (cmd === 'schema') { await server(); say(await studio('rec:loupe-take', {}, p => p.evaluate(() => window.angles.schema()))); }
if (!['check', 'make'].includes(cmd) || !file) { console.log('usage: node angles.mjs schema | check spec.json | make spec.json [--preview] [--fresh]'); process.exit(2); }

const spec = JSON.parse(fs.readFileSync(file, 'utf8')), { variants, ...base } = spec;
await server();
const id = await source(base), name = `${slug(base.name || id.replace('rec:', ''))}-${Date.now().toString(36).slice(-5)}`;

if (cmd === 'check') {
  const r = await studio(id, base, p => p.evaluate((s, v) => window.angles.check(s, v), base, variants?.length ? variants : [{}]));
  const sheet = path.join(outDir(base), `${name}-check.jpg`); writeJpg(sheet, r.sheet);
  const warnings = [...new Set(r.rows.flatMap(x => x.warnings))];
  say({ ok: !warnings.length, sheet: rel(sheet), seconds: r.rows[0].seconds, rows: r.rows.map(({ variant, speed, budget }) => ({ ...(variant ? { variant } : {}), speed, budget })), ...(warnings.length ? { warnings } : {}) });
}

// make: the studio's Export, then a 4-frame sheet cut from the finished mp4
// 1920 on the long side's usual width: a tall frame (9:16) renders 1080 wide, not 1920 x 3413
const [aw, ah] = String(base.aspect || '16:9').split(':').map(Number), tall = ah > aw;
const width = flags.includes('--preview') ? (tall ? 540 : 960) : base.width || (tall ? 1080 : 1920);
const { applied, job } = await studio(id, base, async p => ({ applied: await p.evaluate(s => window.angles.apply(s), base), job: await p.evaluate((n, w) => window.angles.job(n, w), name, width) }));
if (!applied.ok && !flags.includes('--anyway')) say({ ok: false, warnings: applied.warnings, hint: 'node angles.mjs schema lists the choices; or pass --anyway' });
await fetch(`${BASE}/export`, { method: 'POST', body: JSON.stringify(job) });
let st;
for (;;) {
  await sleep(700);
  st = await (await fetch(`${BASE}/export-status?name=${encodeURIComponent(name)}`)).json();
  if (['done', 'failed', 'unknown'].includes(st.state)) break;
}
if (st.state !== 'done') say({ ok: false, error: st.error || 'the render failed' });
const dir = outDir(base), mp4 = path.join(dir, `${name}.mp4`), sheet = path.join(dir, `${name}-sheet.jpg`);
fs.copyFileSync(path.join(ROOT, st.mp4), mp4);   // then drop the render's working files (frames add up fast)
for (const f of [st.mp4, `out/loops/${name}`, `out/loops/${name}.json`]) fs.rmSync(path.join(ROOT, f), { recursive: true, force: true });
const at = [.125, .375, .625, .875].map(f => (f * applied.seconds).toFixed(2));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...at.flatMap(t => ['-ss', t, '-i', mp4]),
  '-filter_complex', `${at.map((_, i) => `[${i}:v]scale=400:-2[v${i}]`).join(';')};[v0][v1][v2][v3]hstack=inputs=4`, '-frames:v', '1', '-q:v', '5', sheet]);
say({ ok: true, mp4: rel(mp4), sheet: rel(sheet), seconds: applied.seconds, speed: applied.speed, budget: applied.budget, ...(applied.warnings.length ? { warnings: applied.warnings } : {}) });
