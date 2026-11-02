#!/usr/bin/env node
// Angles from the command line, for people and agents: a small JSON spec in, an mp4 and a contact sheet out.
//   node angles.mjs schema              every style, level, look, background... the studio accepts (compact JSON)
//   node angles.mjs make spec.json      render it; prints one JSON line: { ok, mp4, sheet, seconds, speed, warnings }
//   node angles.mjs make spec.json --preview   960px wide, for a quick look before the full render
//
// Everything runs on this machine. The studio server (serve.py) is started if it isn't up, the spec is applied by the
// studio itself in headless Chrome (window.angles.apply, the same code the panel uses, so a spec can only ask for what
// the studio can make), and the render is the studio's own Export (serve.py /export -> motion.mjs). Nothing is
// guessed: an unknown style or look comes back as a warning listing the choices.
//
// spec: { source: "path/to/recording.mov" | "path/to/screenshot.png" | "rec:<id>" | "<still id>", name?, out?: "dir",
//         aspect?: "16:9", trim?: { in, out }, loop?, length? (stills, s),
//         style?, level?, ease?, dir?: "left"|"right", travel?, beats?: [{ at, style, level, ... }],
//         look?, lookAmount?, shadow?, background?: "mist" | "#hex", frame?: { radius, edge, stroke, vig },
//         focus?: { at, u, v, size, spread } | [...], overlays?: [{ at, dur, keys: ["⌘","K"] } | { at, dur, text }] }
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
  const name = (spec.name || path.basename(src, path.extname(src))).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'take';
  const meta = path.join(ROOT, 'rec', name, 'meta.json');
  if (!still && fs.existsSync(meta) && fs.statSync(meta).mtimeMs > fs.statSync(src).mtimeMs && !flags.includes('--fresh')) return `rec:${name}`;
  const r = await (await fetch(`${BASE}/upload?name=${name}&ext=${ext}`, { method: 'POST', body: fs.readFileSync(src) })).json();
  if (!r.ok) say({ ok: false, error: `couldn't read ${src}: ${r.error}` });
  return r.kind === 'image' ? r.id : `rec:${r.id}`;
}
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

if (cmd === 'schema') {
  await server();
  say(await studio('rec:loupe-take', {}, p => p.evaluate(() => window.angles.schema())));
}
if (cmd !== 'make' || !file) {
  console.log('usage: node angles.mjs schema | node angles.mjs make spec.json [--preview] [--fresh]'); process.exit(2);
}

const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
await server();
const id = await source(spec);
const width = flags.includes('--preview') ? 960 : spec.width || 1920;
const name = `${(spec.name || id.replace('rec:', '')).replace(/[^a-z0-9-]+/gi, '-')}-${Date.now().toString(36).slice(-5)}`;
const { applied, job } = await studio(id, spec, async p => {
  const applied = await p.evaluate(s => window.angles.apply(s), spec);
  return { applied, job: await p.evaluate((n, w) => window.angles.job(n, w), name, width) };
});
if (!applied.ok && !flags.includes('--anyway')) say({ ok: false, warnings: applied.warnings, hint: 'fix the spec (node angles.mjs schema lists the choices), or pass --anyway' });

await fetch(`${BASE}/export`, { method: 'POST', body: JSON.stringify(job) });
let st;
for (;;) {
  await sleep(1000);
  st = await (await fetch(`${BASE}/export-status?name=${encodeURIComponent(name)}`)).json();
  if (['done', 'failed', 'unknown'].includes(st.state)) break;
}
if (st.state !== 'done') say({ ok: false, error: st.error || 'the render failed' });

// the mp4, plus one small contact sheet (four moments, 1200px) so a look costs one image, not a video
const outDir = path.resolve(home(spec.out) || 'angles-out'); fs.mkdirSync(outDir, { recursive: true });
const mp4 = path.join(outDir, `${name}.mp4`), sheet = path.join(outDir, `${name}-sheet.jpg`);
fs.copyFileSync(path.join(ROOT, st.mp4), mp4);
const secs = applied.seconds, at = [.08, .35, .62, .9].map(f => (f * secs).toFixed(2));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...at.flatMap(t => ['-ss', t, '-i', mp4]),
  '-filter_complex', `${at.map((_, i) => `[${i}:v]scale=600:-2[v${i}]`).join(';')};[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0`,
  '-frames:v', '1', '-q:v', '4', sheet]);
say({ ok: true, mp4, sheet, seconds: secs, speed: applied.speed, budget: applied.budget, warnings: applied.warnings });
