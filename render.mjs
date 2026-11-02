// node render.mjs out/name.png "preset=gentle&aspect=16:9&aperture=20"
import fs from 'fs';
import puppeteer from 'puppeteer-core';
const jobs = process.argv.slice(2);
const b = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage();
for (let i = 0; i < jobs.length; i += 2) {
  const [out, qs] = [jobs[i], jobs[i + 1]];
  await p.goto(`http://localhost:8790/?${qs}`, { waitUntil: 'networkidle0' });
  const data = await p.evaluate(async () => { await window.ready; return document.getElementById('c').toDataURL('image/png'); });
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64')); console.log(out);
}
await b.close();
