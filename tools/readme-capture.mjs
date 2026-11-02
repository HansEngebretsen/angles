import fs from 'fs';
import { open, hero, recordGif, glide, jump, press, release, hold, click, rect } from '/Users/hansengebretsen/Sites/config/skills/hansreadme/scripts/demo.mjs';

const URL = 'http://localhost:8790/';
const OUT = '/Users/hansengebretsen/Dropbox/Design/work/2026 - folio update/photomock/demos';
const DUMP = process.env.DUMP;
const only = process.argv[2];
const want = (name) => !only || only === name;
const W = 1440, H = 900;
const STAGEPANEL = { x: 180, y: 52, width: 1260, height: 660 };

const setup = async (page) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await new Promise(r => setTimeout(r, 3500));
  await page.evaluate(() => { THEME.ui = 'signal'; THEME.mode = 'dark'; applyTheme(); if (document.body.classList.contains('nosb')) toggleSidebar(false, true); document.head.insertAdjacentHTML('beforeend', '<style>#tip{display:none!important}</style>'); });
  console.log(JSON.stringify(await page.evaluate(() => shot().overlays?.map(o => [o.t, o.dur]))));
};
const opts = (scale) => ({ scale, width: W, height: H, ready: '#c', setup });
const seek = async (page, t, wait = 0) => {
  await page.evaluate(async t => {
    head = t; const at = cur.video ? videoAt(head) : null, v = at ? videoFor(at.rec) : null;
    if (v && Math.abs(v.currentTime - at.time) > .02) { v.pause(); await new Promise(r => { v.addEventListener('seeked', r, { once: true }); v.currentTime = at.time; setTimeout(r, 1500); }); }
    if (v && v.readyState >= 2) uploadFrame(v);
    applyHead(); render(); paintTimeline();
  }, t);
  if (wait) await new Promise(r => setTimeout(r, wait));
};
const tab = (page, name) => page.evaluate(n => document.querySelector(`#rail [data-tab="${n}"]`).click(), name);
// play the shot frame by frame at real speed (capture is slower than real time)
const playThrough = async (page, frame, t0, t1, step = .06) => { for (let t = t0; t <= t1; t += step) { await seek(page, t); await frame(step * 1000); } };
// step the page's running animations by hand so the GIF gets every frame
const stepAnims = async (page, frame, ms = 420) => {
  for (let t = 0; t <= ms; t += 30) { await page.evaluate(t => document.getAnimations().forEach(a => { a.pause(); a.currentTime = t; }), t); await frame(30); }
  await page.evaluate(() => document.getAnimations().forEach(a => a.finish()));
};

if (want('hero')) {
  const { browser, page } = await open(URL, opts(2));
  await seek(page, 5.2, 1200);
  await page.mouse.move(W - 4, H - 4);
  await new Promise(r => setTimeout(r, 600));
  await hero(page, `${OUT}/hero.png`);
  await browser.close();
}

// the camera move: a whole shot, played through
if (want('move')) {
  const { browser, page } = await open(URL, opts(1));
  const st = await rect(page, '#c');
  await page.mouse.move(W - 4, H - 4);
  await recordGif(page, { x: st.x, y: st.y, width: st.width, height: st.height }, `${OUT}/move.gif`, async (frame) => {
    await playThrough(page, frame, 0, 13.8, .1);
  }, { colors: 256, width: 560 });
  await browser.close();
}

// pick a style, see it move
if (want('styles')) {
  const { browser, page } = await open(URL, opts(1));
  await tab(page, 'shot');
  await new Promise(r => setTimeout(r, 400));
  const btn = (label) => page.evaluate(l => { const b = [...document.querySelectorAll('#styles button')].find(b => b.textContent.trim().startsWith(l)); const r = b.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, label);
  await recordGif(page, STAGEPANEL, `${OUT}/styles.gif`, async (frame) => {
    await jump(page, 1000, 560);
    await hold(frame, 400);
    for (const s of ['Fly-by', 'Tilt-shift']) {
      const b = await btn(s);
      await click(page, frame, b.cx, b.cy);
      await hold(frame, 250);
      await playThrough(page, frame, 0, 3.4, .08);
    }
  }, { colors: 256, width: 760, dump: DUMP });
  await browser.close();
}

// click to focus, then scroll to set how much is sharp
if (want('focus')) {
  const { browser, page } = await open(URL, opts(1));
  await seek(page, 2, 1200);
  await tab(page, 'point');
  await new Promise(r => setTimeout(r, 400));
  const pick = await rect(page, '#fppick');
  await recordGif(page, STAGEPANEL, `${OUT}/focus.gif`, async (frame) => {
    await jump(page, 900, 600);
    await hold(frame, 400);
    await click(page, frame, pick.cx, pick.cy);
    await hold(frame, 300);
    await click(page, frame, 560, 300);
    await hold(frame, 700);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel({ deltaY: 40 }); await frame(60); }
    await hold(frame, 500);
    for (let i = 0; i < 12; i++) { await page.mouse.wheel({ deltaY: -40 }); await frame(60); }
    await hold(frame, 1200);
  }, { colors: 256, width: 760, dump: DUMP });
  await browser.close();
}

// screen looks
if (want('looks')) {
  const { browser, page } = await open(URL, opts(1));
  await seek(page, 5.2, 1200);
  await tab(page, 'screen');
  await new Promise(r => setTimeout(r, 400));
  const chips = await page.evaluate(() => [...document.querySelectorAll('#filters button')].map(b => { const r = b.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, on: b.classList.contains('on') }; }));
  const order = [2, 5, 3, chips.findIndex(c => c.on)].filter(i => i >= 0 && chips[i]);
  await recordGif(page, STAGEPANEL, `${OUT}/looks.gif`, async (frame) => {
    await jump(page, 1000, 600);
    await hold(frame, 400);
    for (const i of order) { await click(page, frame, chips[i].cx, chips[i].cy); await hold(frame, 1000); }
  }, { colors: 256, width: 760, dump: DUMP });
  await browser.close();
}

// hide the panel and the frame takes the room; light / dark
if (want('panel')) {
  const { browser, page } = await open(URL, opts(1));
  await seek(page, 5.2, 1200);
  const side = await rect(page, '#sidebtn'), mode = await rect(page, '#modebtn');
  await recordGif(page, { x: 0, y: 0, width: W, height: H }, `${OUT}/panel.gif`, async (frame) => {
    await jump(page, 1200, 300);
    await hold(frame, 400);
    await click(page, frame, side.cx, side.cy); await stepAnims(page, frame); await hold(frame, 700);
    await click(page, frame, mode.cx, mode.cy); await hold(frame, 900);
    await click(page, frame, side.cx, side.cy); await stepAnims(page, frame); await hold(frame, 700);
    await click(page, frame, mode.cx, mode.cy); await hold(frame, 600);
  }, { colors: 256, width: 800, dump: DUMP });
  await browser.close();
}

// up close at a real angle: the Close style, played through
if (want('close')) {
  const { browser, page } = await open(URL, opts(1));
  await page.evaluate(() => window.angles.apply({ style: 'close', level: 'gentle', look: 'glossy', background: 'mist', shadow: 'soft', trim: { in: 6, out: 11 } }));
  const st = await rect(page, '#c');
  await page.mouse.move(W - 4, H - 4);
  await recordGif(page, { x: st.x, y: st.y, width: st.width, height: st.height }, `${OUT}/close.gif`, async (frame) => {
    await playThrough(page, frame, 0, 5.4, .08);
  }, { colors: 256, width: 560, dump: DUMP });
  await browser.close();
}

// the skill: a spec on the left, the contact sheet it rendered on the right (a staged card on GitHub dark)
if (want('skill')) {
  const { browser, page } = await open('about:blank', { scale: 2, width: 1200, height: 480 });
  const sheet = fs.readFileSync(process.env.SHEET).toString('base64');
  await page.setContent(`<body style="margin:0;background:#212830;font:15px/1.55 ui-monospace,Menlo,monospace;color:#e6edf3;display:grid;grid-template-columns:420px 1fr;gap:28px;padding:40px;box-sizing:border-box;height:480px">
    <div><div style="color:#8b949e;margin-bottom:10px">spec.json</div><pre style="margin:0;background:#151b23;border:1px solid #3d444d;border-radius:10px;padding:18px;font-size:14px">{
  "source": "~/Desktop/loupe.mov",
  "trim": { "in": 6, "out": 11 },
  "style": "close",
  "level": "gentle",
  "look": "glossy",
  "background": "mist",
  "shadow": "soft",
  "overlays": [
    { "at": 1, "keys": ["⌘", "V"] }
  ]
}</pre><div style="color:#8b949e;margin-top:14px">$ node angles.mjs make spec.json</div><div style="color:#7ee787">{ "ok": true, "mp4": "…/loupe-close.mp4" }</div></div>
    <div><div style="color:#8b949e;margin-bottom:10px">sheet.jpg</div><img src="data:image/jpeg;base64,${sheet}" style="width:100%;border-radius:10px;border:1px solid #3d444d"></div></body>`);
  await new Promise(r => setTimeout(r, 300));
  await hero(page, `${OUT}/skill.png`);
  await browser.close();
}
