/* UI smoke check: serves the repo, opens index.html in headless Chromium with dist/fake-db.js + a synthetic
   fixture standing in for the artifact db, clicks every tab, runs one db-writing action per tab, and fails on any page error,
   console error or failed local request. Then checks owner data stays in the board: the greeting
   uses checks/profile.name, an existing board gets no starter tasks, and an empty board gets them.
   Run after `pnpm build`: node tests/e2e/ui-smoke.ts. Exit 0 pass, 1 fail. */
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createStaticServer } from '../../models/shared/tools/static-server.ts';
import { board } from './fixture.ts';

type Doc = Record<string, unknown>;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const server = createStaticServer(ROOT);

/* fail loudly instead of hanging verify: a normal run takes ~10s */
setTimeout(() => { console.error('ui-smoke: FAIL, timed out after 120s'); process.exit(1); }, 120000).unref();

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function main(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const browser = await chromium.launch(process.env['CHROMIUM_PATH'] ? { executablePath: process.env['CHROMIUM_PATH'] } : {});
  const errors: string[] = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) errors.push(`${String(r.status())} ${r.url().slice(base.length)}`); });
    await page.addInitScript({ content: `window.MOCK = ${JSON.stringify(board)};` });
    await page.addInitScript({ path: path.join(ROOT, 'dist/fake-db.js') });

    await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#tabs button, #tabs [data-act]', { timeout: 10000 });
    if (!(await page.locator('#main > *').count())) errors.push('#main rendered nothing');
    await page.waitForFunction(() => /Sam/.test(document.querySelector('.greet')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => undefined);
    const greet = await page.locator('.greet').first().innerText().catch(() => '');
    if (!/, Sam\.$/.test(greet.trim())) errors.push(`greeting should use checks/profile.name, got "${greet}"`);

    const tabs = page.locator('#tabs button, #tabs [data-act]');
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      const label = (await tabs.nth(i).innerText()).trim() || `tab ${String(i)}`;
      await tabs.nth(i).click();
      await page.waitForTimeout(150);
      if (!(await page.locator('#main > *').count())) errors.push(`tab "${label}" rendered nothing`);
    }
    console.log(`ui-smoke: ${String(n)} tabs clicked`);

    /* one action per tab, each checked in the fake db: proves the view's click handlers still reach the store.
       Dispatched, not pointer clicks: the sticky header shifts on scroll, so Playwright's actionability wait can spin. */
    const click = async (sel: string): Promise<void> => {
      await page.locator(sel).first().dispatchEvent('click', undefined, { timeout: 5000 }).catch((e: unknown) => { throw new Error(`${sel}: ${message(e).split('\n')[0] ?? ''}`); });
      await page.waitForTimeout(600);
    };
    /* docs of one collection in the page's fake db */
    const docs = (collection: string): Promise<Doc[]> => page.evaluate((c) => Object.values(window.MOCK?.[c] ?? {}) as Doc[], collection);
    const tabActions: [string, () => Promise<void>, () => Promise<boolean>][] = [
      ['today: complete a task', async () => { await click('[data-act="tab"][data-val="today"]');
        /* the ring's task list can start folded (phone width, or folded earlier) */
        if (!(await page.locator('[data-act="toggle"][aria-pressed="false"]').count())) await click('[data-act="ring-tasks"]');
        await click('[data-act="toggle"][aria-pressed="false"]'); },
      async () => (await docs('tasks')).filter((t) => t['status'] === 'done').length > 1],
      ['plan: quick-add a task', async () => { await click('[data-act="tab"][data-val="plan"]'); await click('#fab'); await page.fill('#sheet [name=quick]', 'buy stamps tomorrow'); await click('#sheetSubmit'); },
        async () => (await docs('tasks')).some((t) => t['title'] === 'Buy stamps' && !!t['due_date'])],
      ['lists: add a grocery', async () => { await click('[data-act="tab"][data-val="lists"]'); await page.fill('#qaG', 'limes'); await page.press('#qaG', 'Enter'); await page.waitForTimeout(250); },
        async () => (await docs('groceries')).some((g) => g['name'] === 'Limes' || g['name'] === 'limes')],
      ['life: tick a checklist step', async () => { await click('[data-act="tab"][data-val="life"]'); await click('[data-act="check"]'); },
        async () => (await docs('checks')).length > 1],
      ['grow: finish a goal', async () => { await click('[data-act="tab"][data-val="grow"]'); await click('[data-act="grow"][data-val="goals"]'); await click('[data-act="goal-done"]'); },
        async () => (await docs('goals')).some((g) => g['status'] === 'completed')],
    ];
    for (const [name, act, landed] of tabActions) {
      try {
        await act();
        /* writes land after the row's exit animation; poll instead of guessing a delay */
        let ok = false;
        for (let t = 0; t < 25 && !ok; t++) { ok = await landed(); if (!ok) await page.waitForTimeout(200); }
        if (!ok) errors.push(`${name}: no db write`);
      } catch (e) { errors.push(`${name}: ${message(e)}`); }
    }
    console.log(`ui-smoke: ${String(tabActions.length)} tab actions run`);

    /* tips: on by default (a board with no tips pref), and the note opens on click */
    await click('[data-act="tab"][data-val="today"]');
    const tipButton = page.locator('[data-act="tip"]').first();
    if (!(await tipButton.count())) errors.push('tips are on by default but no info button rendered');
    else {
      const controls = (await tipButton.getAttribute('aria-controls')) ?? '';
      await click('[data-act="tip"]');
      if ((await tipButton.getAttribute('aria-expanded')) !== 'true' || !(await page.locator(`#${controls}`).isVisible())) errors.push('clicking an info button should open its note');
    }
    const tipsOff = await browser.newPage();
    tipsOff.on('pageerror', (e) => errors.push(`tips-off pageerror: ${e.message}`));
    await tipsOff.addInitScript({ content: `window.MOCK = ${JSON.stringify({ ...board, checks: { ...board.checks, ui_prefs: { value: { tips: false }, updated_at: Date.now() } } })};` });
    await tipsOff.addInitScript({ path: path.join(ROOT, 'dist/fake-db.js') });
    await tipsOff.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
    await tipsOff.waitForSelector('.card.rings', { timeout: 10000 });
    if (await tipsOff.locator('[data-act="tip"]').count()) errors.push('ui_prefs.tips === false but an info button rendered');
    await tipsOff.close();
    console.log('ui-smoke: tips on by default, off with ui_prefs.tips = false');

    const backdated = await page.evaluate(() => {
      const t3 = window.MOCK?.['tasks']?.['t3'] as Doc | undefined;
      const days = t3?.['committed_days'];
      return Array.isArray(days) ? (days[0] as unknown) : undefined;
    });
    if (backdated === '2020-01-01') errors.push('a task given a past due date was committed before it existed (fakes age for old-task visitors)');
    if (await page.evaluate(() => !!window.MOCK?.['checks']?.['starter'])) errors.push('starter tasks seeded on a board that already has data');

    const empty = await browser.newPage();
    empty.on('pageerror', (e) => errors.push(`empty board pageerror: ${e.message}`));
    await empty.addInitScript({ content: 'window.MOCK = {};' });
    await empty.addInitScript({ path: path.join(ROOT, 'dist/fake-db.js') });
    await empty.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
    await empty.waitForFunction(() => Object.keys(window.MOCK?.['tasks'] ?? {}).length > 0, null, { timeout: 10000 }).catch(() => undefined);
    await empty.waitForSelector('.greet', { timeout: 5000 }).catch(() => undefined);
    const seeded = await empty.evaluate(() => Object.keys(window.MOCK?.['tasks'] ?? {}).filter((k) => k.startsWith('starter-')).length);
    if (!seeded) errors.push('empty board got no starter tasks');
    const egreet = await empty.locator('.greet').first().innerText().catch(() => '');
    if (egreet.includes(',')) errors.push(`greeting without a profile name should be plain, got "${egreet}"`);
    console.log(`ui-smoke: empty board seeded ${String(seeded)} starter tasks`);

    /* demo board: checks/profile.demo shows the Demo badge and retitles the page; a real board shows neither */
    const demoBadge = (b: typeof board): Promise<{ shown: boolean; barShown: boolean; title: string }> => (async () => {
      const demo = await browser.newPage();
      demo.on('pageerror', (e) => errors.push(`demo board pageerror: ${e.message}`));
      await demo.addInitScript({ content: `window.MOCK = ${JSON.stringify(b)};` });
      await demo.addInitScript({ path: path.join(ROOT, 'dist/fake-db.js') });
      await demo.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
      /* .greet is hidden by CSS: wait for it to exist, and let a page that never boots fail here */
      await demo.waitForSelector('.greet', { state: 'attached', timeout: 10000 });
      const shown = await demo.locator('#demoBadge').isVisible();
      /* the collapsed bar is off-screen until scrolled, so check the element's own state */
      const barShown = await demo.evaluate(() => document.getElementById('barDemo')?.hidden === false);
      const title = await demo.title();
      await demo.close();
      return { shown, barShown, title };
    })();
    const withDemo = await demoBadge({ ...board, checks: { profile: { value: { name: 'Sam', demo: true } } } });
    if (!withDemo.shown || !withDemo.barShown || withDemo.title !== 'Lifeboard Demo') errors.push(`demo profile should show the Demo badge and title, got shown=${String(withDemo.shown)} bar=${String(withDemo.barShown)} title="${withDemo.title}"`);
    const withoutDemo = await demoBadge(board);
    if (withoutDemo.shown || withoutDemo.barShown || withoutDemo.title === 'Lifeboard Demo') errors.push('a board without profile.demo must not show the Demo badge or title');
    console.log('ui-smoke: demo badge checked');
  } finally {
    await browser.close();
    server.close();
  }
  if (errors.length) { console.error('ui-smoke: FAIL\n- ' + errors.join('\n- ')); process.exit(1); }
  console.log('ui-smoke: ok');
}

main().catch((e: unknown) => { console.error('ui-smoke: crashed:', message(e)); process.exit(1); });
