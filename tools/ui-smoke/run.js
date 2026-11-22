/* UI smoke check: serves the repo, opens index.html in headless Chromium with dist/fake-db.js + a synthetic
   fixture standing in for the artifact db, clicks every tab, and fails on any page error,
   console error or failed local request. Then checks owner data stays in the board: the greeting
   uses checks/profile.name, an existing board gets no starter tasks, and an empty board gets them.
   Exit 0 pass, 1 fail. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/* fail loudly instead of hanging verify: a normal run takes ~10s */
setTimeout(() => { console.error('ui-smoke: FAIL, timed out after 120s'); process.exit(1); }, 120000).unref();

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
    page.on('response', (r) => r.url().startsWith(base) && r.status() >= 400 && errors.push(`${r.status()} ${r.url().slice(base.length)}`));
    for (const f of ['tools/ui-smoke/fixture.js', 'dist/fake-db.js']) await page.addInitScript({ path: path.join(ROOT, f) });

    await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#tabs button, #tabs [data-act]', { timeout: 10000 });
    if (!(await page.locator('#main > *').count())) errors.push('#main rendered nothing');
    await page.waitForFunction(() => /Sam/.test((document.querySelector('.greet') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
    const greet = await page.locator('.greet').first().innerText().catch(() => '');
    if (!/, Sam\.$/.test(greet.trim())) errors.push(`greeting should use checks/profile.name, got "${greet}"`);

    const tabs = page.locator('#tabs button, #tabs [data-act]');
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      const label = (await tabs.nth(i).innerText()).trim() || `tab ${i}`;
      await tabs.nth(i).click();
      await page.waitForTimeout(150);
      if (!(await page.locator('#main > *').count())) errors.push(`tab "${label}" rendered nothing`);
    }
    console.log(`ui-smoke: ${n} tabs clicked`);

    const backdated = await page.evaluate(() => (window.MOCK.tasks.t3.committed_days || [])[0]);
    if (backdated === '2020-01-01') errors.push('a task given a past due date was committed before it existed (fakes age for old-task visitors)');
    if (await page.evaluate(() => !!(window.MOCK.checks && window.MOCK.checks.starter))) errors.push('starter tasks seeded on a board that already has data');

    const empty = await browser.newPage();
    empty.on('pageerror', (e) => errors.push(`empty board pageerror: ${e.message}`));
    await empty.addInitScript({ content: 'window.MOCK = {};' });
    await empty.addInitScript({ path: path.join(ROOT, 'dist/fake-db.js') });
    await empty.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
    await empty.waitForFunction(() => window.MOCK.tasks && Object.keys(window.MOCK.tasks).length > 0, null, { timeout: 10000 }).catch(() => {});
    await empty.waitForSelector('.greet', { timeout: 5000 }).catch(() => {});
    const seeded = await empty.evaluate(() => Object.keys(window.MOCK.tasks || {}).filter((k) => k.startsWith('starter-')).length);
    if (!seeded) errors.push('empty board got no starter tasks');
    const egreet = await empty.locator('.greet').first().innerText().catch(() => '');
    if (/,/.test(egreet)) errors.push(`greeting without a profile name should be plain, got "${egreet}"`);
    console.log(`ui-smoke: empty board seeded ${seeded} starter tasks`);
  } finally {
    await browser.close();
    server.close();
  }
  if (errors.length) { console.error('ui-smoke: FAIL\n- ' + errors.join('\n- ')); process.exit(1); }
  console.log('ui-smoke: ok');
})().catch((e) => { console.error('ui-smoke: crashed:', e.message); process.exit(1); });
