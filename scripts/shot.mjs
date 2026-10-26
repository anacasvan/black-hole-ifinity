import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const root = process.argv[2];
const out = process.argv[3];
const script = process.argv[4] || '';
const server = await createServer({ root, configFile: root + '/vite.config.ts', server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const vp = process.env.VP ? JSON.parse(process.env.VP) : { width: 390, height: 844 };
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.stack));
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => window.__bhi && document.getElementById('loading').classList.contains('done'), null, { timeout: 90000 });
} catch (e) { console.log('timeout waiting load'); }
console.log('loaded in', Date.now() - t0, 'ms');
if (script) {
  const fn = new Function('page', 'wait', `return (async () => { ${script} })()`);
  await fn(page, ms => new Promise(r => setTimeout(r, ms)));
}
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: out });
const st = await page.evaluate(() => window.__bhi && window.__bhi.state()).catch(e => String(e));
console.log(JSON.stringify(st));
console.log(errs.slice(0, 30).join('\n'));
await browser.close();
await server.close();
