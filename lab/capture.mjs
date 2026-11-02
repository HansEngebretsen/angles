import puppeteer from 'puppeteer-core';
const [url, out, w='1440', h='900', dpr='3'] = process.argv.slice(2);
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const p = await b.newPage();
await p.setViewport({ width: +w, height: +h, deviceScaleFactor: +dpr });
await p.goto(url, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 2500));
try { await p.click('button[title="Fit to Screen"]'); await new Promise(r => setTimeout(r, 800)); } catch {}
await p.screenshot({ path: out });
await b.close(); console.log(out);
