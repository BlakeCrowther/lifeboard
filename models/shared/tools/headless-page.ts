/* Shared by capture_ecosystem.ts and watch_creatures.ts: builds dist/, serves the repo (static-server.ts on a free port),
   starts headless Chrome with DevTools, and opens one page driven over the Chrome DevTools Protocol.
   Chrome: $CHROME, else playwright's Chromium, else /Applications/Google Chrome.app. Page exceptions and console errors
   collect in `errors`. `fail` prints `<prefix> FAIL: <msg>`, kills the children and exits with `failCode`. */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './static-server.ts';

export const MODELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const REPO = path.dirname(MODELS);
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface CdpMessage {
  id?: number;
  method?: string;
  result?: Record<string, unknown>;
  error?: { message: string };
  params?: {
    type?: string;
    args?: { value?: unknown; description?: string }[];
    exceptionDetails?: { text: string; exception?: { description?: string } };
  };
}
interface EvalResult { result?: { value?: unknown }; exceptionDetails?: { text: string } }

export interface HeadlessPage {
  port: number;
  errors: string[];
  cdp(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** evaluate an expression in the page (promises awaited), returning its JSON value */
  js(expression: string): Promise<unknown>;
  screenshot(file: string): Promise<string>;
  fail(msg: string): never;
  close(): Promise<void>;
}

async function playwrightChromium(): Promise<string | null> {
  try {
    const file = (await import('playwright')).chromium.executablePath();
    return fs.existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

export async function openHeadlessPage(opts: { prefix: string; failCode: number; width: number; height: number; chromeArgs?: string[] }): Promise<HeadlessPage> {
  const kids: { kill: () => unknown }[] = [];
  const fail = (msg: string): never => {
    console.error(`${opts.prefix} FAIL: ${msg}`);
    kids.forEach((k) => k.kill());
    process.exit(opts.failCode);
  };
  /* capture.html runs dist/capture.js: build it so the page matches src/ */
  if (spawnSync('node', ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'tools/build.ts'], { cwd: REPO, stdio: 'ignore' }).status !== 0) fail('build failed: run pnpm build');
  const chromePath = process.env['CHROME'] ?? (await playwrightChromium()) ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

  const srv = createStaticServer(REPO);
  kids.push({ kill: () => { srv.closeAllConnections(); srv.close(); } });
  await new Promise<void>((res) => srv.listen(0, '127.0.0.1', res));
  const port = (srv.address() as AddressInfo).port;

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-headless-'));
  kids.push(spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, `--window-size=${String(opts.width)},${String(opts.height)}`,
    '--no-first-run', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...(opts.chromeArgs ?? []), 'about:blank'], { stdio: 'ignore' }));
  let wsUrl: string | undefined;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    await sleep(100);
    try {
      const [devtoolsPort] = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n');
      const list = (await (await fetch(`http://127.0.0.1:${devtoolsPort ?? ''}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
  }
  if (!wsUrl) fail('chrome did not start (set CHROME=<path> if it is not in /Applications)');

  const ws = new WebSocket(wsUrl ?? '');
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }).catch(() => fail('devtools socket'));
  let seq = 0;
  const waiting = new Map<number, { res: (v: Record<string, unknown>) => void; rej: (e: Error) => void }>();
  const errors: string[] = [];
  ws.onmessage = (e: MessageEvent<string>) => {
    const m = JSON.parse(e.data) as CdpMessage;
    const pending = m.id === undefined ? undefined : waiting.get(m.id);
    if (m.id !== undefined && pending) { waiting.delete(m.id); if (m.error) pending.rej(new Error(m.error.message)); else pending.res(m.result ?? {}); }
    const details = m.params?.exceptionDetails;
    if (m.method === 'Runtime.exceptionThrown' && details) errors.push(details.exception?.description ?? details.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') errors.push((m.params.args ?? []).map((a) => String(a.value ?? a.description)).join(' '));
  };
  const cdp = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<Record<string, unknown>>((res, rej) => { const i = ++seq; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expression: string): Promise<unknown> => {
    const r = (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as EvalResult;
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result?.value;
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: opts.width, height: opts.height, deviceScaleFactor: 1, mobile: false });

  return {
    port, errors, cdp, js, fail,
    async screenshot(file) {
      const { data } = (await cdp('Page.captureScreenshot', { format: 'png' })) as { data: string };
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    async close() {
      kids.forEach((k) => k.kill()); ws.close(); await sleep(300);
      fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
