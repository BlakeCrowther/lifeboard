/* Break overlay end-to-end: launches the Electron app (break/desktop) with --now against a local test board whose
   bridge-using page sits in a cross-origin iframe (like the lifeboard on claude.ai), and checks:
   every display is covered by an always-on-top window, the bridge reaches the iframe, ticks arrive, Skip unlocks after
   skipDelaySeconds, done() from the page ends the break, the escape shortcut ends it, a second `--now` launch starts a
   break in the running app, postpone brings the break back and uses up the last postpone, and the bar's Skip ends it.
   Linux only (X11): needs xvfb-run, a window manager (openbox: fullscreen is the window manager's job) and xdotool;
   verify runs it through tests/e2e/break-overlay.sh. Run: pnpm test:break. Exit 0 pass, 1 fail. */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { _electron, type ElectronApplication, type Page } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAIN = path.join(ROOT, 'break/out/desktop/main.cjs');
const electronBinary = createRequire(import.meta.url)('electron') as string;
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeboard-break-'));

setTimeout(() => { console.error('break-overlay: FAIL, timed out after 90s'); process.exit(1); }, 90_000).unref();

/* the iframe page records what the bridge delivers into window.got */
const FRAME = `<!doctype html><body>frame<script>
  window.got = { bridge: !!window.lifeboardBreak, ticks: [], ends: [] };
  addEventListener('lifeboardbreaktick', (e) => got.ticks.push(e.detail));
  addEventListener('lifeboardbreakend', (e) => got.ends.push(e.detail));
</script>`;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(req.url === '/frame.html' ? FRAME : `<!doctype html><body style="margin:0"><iframe id="f" src="http://localhost:${String(port())}/frame.html" style="border:0;width:100%;height:100vh"></iframe>`);
});
const port = (): number => (server.address() as AddressInfo).port;

const failures: string[] = [];
function check(ok: boolean, name: string, detail = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`);
  if (!ok) failures.push(name);
}
async function waitFor<T>(name: string, read: () => Promise<T>, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  const attempt = async (): Promise<T | undefined> => { try { return await read(); } catch { return undefined; } };
  let v = await attempt();
  while ((v === undefined || !ok(v)) && Date.now() < end) { await new Promise((r) => setTimeout(r, 150)); v = await attempt(); }
  if (v === undefined) { check(false, name, 'read kept failing'); throw new Error(`${name}: read kept failing`); }
  check(ok(v), name, JSON.stringify(v));
  return v;
}

const env = (): Record<string, string> => {
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'NODE_OPTIONS') e[k] = v;
  return { ...e, LIFEBOARD_BREAK_HOME: home };
};
const ARGS = process.getuid?.() === 0 ? ['--no-sandbox'] : [];

interface WinInfo { bounds: { x: number; y: number; width: number; height: number }; visible: boolean; top: boolean }
const overlayWindows = (app: ElectronApplication): Promise<WinInfo[]> => app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows().filter((w) => w.isVisible()).map((w) => ({ bounds: w.getBounds(), visible: w.isVisible(), top: w.isAlwaysOnTop() })));

async function pageWith(app: ElectronApplication, suffix: string, not?: Page): Promise<Page> {
  const end = Date.now() + 8000;
  for (;;) {
    // the newest one: an ended break's pages stay open a few seconds so the board can save
    const page = app.context().pages().filter((p) => p.url().endsWith(suffix) && !p.isClosed()).at(-1);
    if (page && page !== not) return page;
    if (Date.now() > end) throw new Error(`no page ending in ${suffix}: ${app.context().pages().map((p) => p.url()).join(', ')}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

interface Got { bridge: boolean; ticks: number[]; ends: string[] }
const got = async (board: Page): Promise<Got> => {
  const frame = board.frames().find((f) => f.url().endsWith('/frame.html'));
  return frame ? frame.evaluate(() => (window as unknown as { got: Got }).got) : { bridge: false, ticks: [], ends: [] };
};
const logLines = (): string[] => { try { return fs.readFileSync(path.join(home, 'log.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t').slice(1).join('\t')); } catch { return []; } };
const ended = (reason: string) => (lines: string[]) => lines.includes(reason);

async function main(): Promise<void> {
  if (!fs.existsSync(MAIN)) throw new Error('break/out/desktop/main.cjs missing: run pnpm break:build');
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({
    url: `http://127.0.0.1:${String(port())}/board.html`, workMinutes: 60, breakMinutes: 60, postponeMinutes: 0.05, maxPostpones: 1, skipDelaySeconds: 4,
  }));
  const app = await _electron.launch({ executablePath: electronBinary, args: [...ARGS, MAIN, '--now'], env: env() });
  try {
    const displays = await app.evaluate(({ screen }) => screen.getAllDisplays().map((d) => d.bounds));
    const wins = await waitFor('one visible window per display', () => overlayWindows(app), (w) => w.length === displays.length);
    check(displays.every((d) => wins.some((w) => JSON.stringify(w.bounds) === JSON.stringify(d))), 'each display fully covered', JSON.stringify({ displays, wins }));
    check(wins.every((w) => w.top), 'overlay windows stay on top');

    const bar = await pageWith(app, '/bar.html');
    await bar.waitForLoadState();
    check(await bar.locator('#skip').isDisabled(), 'Skip starts locked');
    const board = await pageWith(app, '/board.html');
    await waitFor('bridge reaches the cross-origin iframe', () => got(board), (g) => g.bridge);
    await waitFor('ticks reach the iframe', () => got(board), (g) => g.ticks.length >= 2);
    await waitFor('Skip unlocks after skipDelaySeconds', () => bar.locator('#skip').isEnabled(), Boolean, 5000);
    check(/^\d+:\d\d$/.test(await bar.locator('#countdown').innerText()), 'bar shows the countdown');

    // 1. the page ends the break
    await board.frames().find((f) => f.url().endsWith('/frame.html'))?.evaluate(() => { (window as unknown as { lifeboardBreak: { done(): void } }).lifeboardBreak.done(); });
    await waitFor('done() from the page ends the break', () => overlayWindows(app), (w) => w.length === 0);
    await waitFor('page hears lifeboardbreakend done-page', () => got(board), (g) => g.ends.includes('done-page'));
    await waitFor('log records done-page', () => Promise.resolve(logLines()), ended('done-page'));

    // 2. a second launch with --now starts a break in the running app; the escape shortcut ends it
    const second = spawn(electronBinary, [...ARGS, MAIN, '--now'], { env: env(), stdio: 'ignore' });
    const secondExit = new Promise<number | null>((r) => second.on('exit', r));
    await waitFor('second --now launch starts a break in the running app', () => overlayWindows(app), (w) => w.length === displays.length);
    check(await Promise.race([secondExit, new Promise<string>((r) => setTimeout(() => { r('still running'); }, 5000))]) !== 'still running', 'second instance quits');
    const bar2 = await pageWith(app, '/bar.html', bar);
    await bar2.waitForLoadState();
    // a real X key event: Playwright's synthetic keys never reach Electron's input handlers or global shortcuts
    execFileSync('xdotool', ['key', 'ctrl+alt+shift+b']);
    await waitFor('escape shortcut ends the break', () => overlayWindows(app), (w) => w.length === 0);
    await waitFor('log records escape', () => Promise.resolve(logLines()), ended('escape'));

    // 3. postpone: the break comes back after postponeMinutes (3 s) with no postpones left; Skip ends it
    const third = spawn(electronBinary, [...ARGS, MAIN, '--now'], { env: env(), stdio: 'ignore' });
    await waitFor('break starts again', () => overlayWindows(app), (w) => w.length === displays.length);
    const bar3 = await pageWith(app, '/bar.html', bar2);
    await bar3.locator('#postpone').click();
    await waitFor('postpone hides the overlay', () => overlayWindows(app), (w) => w.length === 0);
    await waitFor('postponed break comes back by itself', () => overlayWindows(app), (w) => w.length === displays.length, 8000);
    const bar4 = await pageWith(app, '/bar.html', bar3);
    await waitFor('no postpones left', () => bar4.locator('#postpone').isDisabled(), Boolean, 3000);
    await waitFor('Skip unlocks', () => bar4.locator('#skip').isEnabled(), Boolean, 5000);
    await bar4.locator('#skip').click();
    await waitFor('bar Skip ends the break', () => overlayWindows(app), (w) => w.length === 0);
    await waitFor('log records postpone then skip', () => Promise.resolve(logLines()), (l) => l.includes('postpone') && l.includes('skip'));
    third.kill();
  } finally {
    await app.close().catch(() => undefined);
    server.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().then(() => {
  if (failures.length) { console.error(`break-overlay: FAIL (${String(failures.length)}): ${failures.join('; ')}`); process.exit(1); }
  console.log('break-overlay: PASS');
  process.exit(0);
}, (e: unknown) => { console.error('break-overlay: FAIL', e instanceof Error ? e.stack : e); process.exit(1); });
