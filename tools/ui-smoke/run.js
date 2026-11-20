/* UI smoke check: serves the repo, opens index.html in headless Chromium with mock.js + a synthetic
   fixture standing in for the artifact db, clicks every tab, and fails on any page error,
   console error or failed local request. Exit 0 pass, 1 fail. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
    page.on('response', (r) => r.url().startsWith(base) && r.status() >= 400 && errors.push(`${r.status()} ${r.url().slice(base.length)}`));
    for (const f of ['tools/ui-smoke/fixture.js', 'mock.js']) await page.addInitScript({ path: path.join(ROOT, f) });

    await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#tabs button, #tabs [data-act]', { timeout: 10000 });
    if (!(await page.locator('#main > *').count())) errors.push('#main rendered nothing');

    const tabs = page.locator('#tabs button, #tabs [data-act]');
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      const label = (await tabs.nth(i).innerText()).trim() || `tab ${i}`;
      await tabs.nth(i).click();
      await page.waitForTimeout(150);
      if (!(await page.locator('#main > *').count())) errors.push(`tab "${label}" rendered nothing`);
    }
    console.log(`ui-smoke: ${n} tabs clicked`);
  } finally {
    await browser.close();
    server.close();
  }
  if (errors.length) { console.error('ui-smoke: FAIL\n- ' + errors.join('\n- ')); process.exit(1); }
  console.log('ui-smoke: ok');
})().catch((e) => { console.error('ui-smoke: crashed:', e.message); process.exit(1); });
