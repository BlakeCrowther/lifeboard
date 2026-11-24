/* page-test: runs a creature in the real Ecosystem page (capture.html, which runs dist/capture.js) and checks it behaves.
   Usage: node models/shared/tools/page-test.ts <id> <glb> <spec.json> <outdir> [--secs 90]
   The candidate needs no roster edit: the roster request is answered with an in-memory roster that includes it, and the
   glb is set on window.LB_CREATURES before the page loads. Writes <outdir>/page-test.json ({gate, pass, checks}) and
   <outdir>/runtime_{desktop,mobile,behavior}*.png. Exit 0 pass, 1 fail, 2 usage, 3 playwright/browser missing.
   Checks: no console/page errors (960x720 and 375x667); creature present at a sane size; idle plays; moves nose-first;
   feed (Ecosystem.feed) reaches eat and returns to idle; stays above the ground. The 40 fps gate is reported as not measured
   when the browser renders below 20 fps (software GL on cloud VMs). Not checked: passing through other creatures or scenery.
   Browser: playwright's Chromium, or CHROMIUM_PATH. Sim time per frame is capped, so a slow renderer needs --secs. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright';

interface Check { gate: string; check: string; pass: boolean; detail: string }
interface Snap { state: string; loop: string | null; feeding: boolean; pos: number[]; box: number[][]; ground: number; quat: number[]; site?: { p: number[]; n: number[] } | null }
/* Ground clearance. Roaming: the box's lowest point over the sand under the centre. Resting on a site (settle, perched, leave):
   the body is tilted to the site's slope, so a world box's bottom sits below the centre's sand on any slope even when the
   belly is on the surface; there it is the centre's height above the site along its normal, which goes negative only
   when the body sinks through the surface it rests on. */
const clearance = (x: Snap): number => {
  if ((x.state === 'settle' || x.state === 'perched' || x.state === 'leave') && x.site) {
    const { p, n } = x.site;
    return x.pos.reduce((sum, v, i) => sum + (v - (p[i] ?? 0)) * (n[i] ?? 0), 0);
  }
  return (x.box[0]?.[1] ?? 0) - x.ground;
};
interface Spec { biome?: number; rarity?: string; locomotion?: string; rest?: unknown }
interface Roster { models: { id: string }[] }

const MODELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), REPO = path.dirname(MODELS);
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? '';
const argv = process.argv.slice(2);
const secsI = argv.indexOf('--secs'), secs = secsI > -1 ? Number(argv[secsI + 1]) : 90;
if (secsI > -1) argv.splice(secsI, 2);
const [id, glb, specPath, outArg] = argv;
if (!id || !glb || !specPath || !outArg) { console.error('usage: page-test.ts <id> <glb> <spec.json> <outdir> [--secs n]'); process.exit(2); }
const out = path.resolve(outArg); fs.mkdirSync(out, { recursive: true });
let chromium: typeof import('playwright').chromium;
try { ({ chromium } = await import('playwright')); } catch { console.error('page-test: playwright not installed (pnpm install)'); process.exit(3); }

/* capture.html runs dist/capture.js: build it so the page matches src/ */
if (spawnSync('node', ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'tools/build.ts'], { cwd: REPO, stdio: 'ignore' }).status !== 0) { console.error('build failed: run pnpm build'); process.exit(1); }

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8')) as Spec;
const entry = { id, kind: 'creature', spec: path.relative(MODELS, path.resolve(specPath)), glb: '', js: '', biome: spec.biome ?? 0,
  rarity: spec.rarity ?? 'common', locomotion: spec.locomotion ?? 'swim', ...(spec.rest ? { rest: spec.rest } : {}), golden: false };
const roster = JSON.parse(fs.readFileSync(path.join(MODELS, 'roster.json'), 'utf8')) as Roster;
roster.models = [...roster.models.filter((m) => m.id !== id), entry];
const b64 = fs.readFileSync(glb).toString('base64');

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const f = path.join(REPO, decodeURIComponent(new URL(q.url ?? '/', 'http://x').pathname));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const checks: Check[] = [], add = (check: string, pass: unknown, detail: string) => checks.push({ gate: 'page-test', check, pass: !!pass, detail });

await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${String((srv.address() as AddressInfo).port)}`;
let browser: Browser;
try { browser = await chromium.launch({ ...(process.env['CHROMIUM_PATH'] ? { executablePath: process.env['CHROMIUM_PATH'] } : {}), args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); }
catch (e) { console.error('page-test: no browser (pnpm exec playwright install chromium, or set CHROMIUM_PATH): ' + message(e)); srv.close(); process.exit(3); }

async function open(w: number, h: number, errs: string[]): Promise<Page> {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.route('**/models/roster.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(roster) }));
  await p.addInitScript(([i, d]) => { window.LB_CREATURES ??= {}; window.LB_CREATURES[i] = d; }, [id ?? '', b64] as const);
  await p.goto(`${base}/capture.html?visitor=${encodeURIComponent(id ?? '')}`);
  await p.waitForFunction(() => !!window.Ecosystem?.debug()?.creatures.length, null, { timeout: 60000 });
  return p;
}
const snap = (p: Page): Promise<Snap[]> => p.evaluate(() => (window.Ecosystem?.debug()?.creatures ?? []).map((c) => ({ state: c.state, loop: c.loop, feeding: c.feeding, pos: c.pos, box: c.box, ground: c.ground, quat: c.quat, site: c.site })));
const rafFps = (p: Page): Promise<number> => p.evaluate(() => new Promise<number>((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));

let fps = 0;
try {
  for (const [name, w, h] of [['desktop', 960, 720], ['mobile', 375, 667]] as const) {
    const errs: string[] = []; const p = await open(w, h, errs); await sleep(2500);
    const cs = await snap(p), c = cs[0];
    const dims = c ? (c.box[1] ?? []).map((v, i) => v - (c.box[0]?.[i] ?? 0)) : [], longest = Math.max(0, ...dims);
    await p.screenshot({ path: path.join(out, `runtime_${name}.png`) });
    add(`${name} ${String(w)}x${String(h)}: creature present at a sane size`, cs.length > 0 && longest > 0.05 && longest < 5, `${String(cs.length)} copies, longest side ${longest.toFixed(2)} m`);
    if (name === 'desktop') fps = await rafFps(p);
    add(`${name} ${String(w)}x${String(h)}: no console or page errors`, errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
    await p.close();
  }
  const lowFps = fps < 20;
  add('frame rate >= 40 fps', lowFps ? true : fps >= 40, lowFps ? `not measured: ${fps.toFixed(1)} fps on this renderer (software GL)` : `${fps.toFixed(0)} fps`);

  const errs: string[] = []; const p = await open(160, 120, errs);   // small viewport: software GL is fastest here, so sim time advances
  const st = { states: new Set<string>(), loops: new Set<string>(), feed: false, back: false, minClear: 9, ok: 0, n: 0 };
  let last: number[] | null = null, fed = false;
  const t0 = Date.now(), feedAt = Math.min(25, secs / 3);
  while (Date.now() - t0 < secs * 1000) {
    const now = (Date.now() - t0) / 1000;
    if (!fed && now > feedAt) { fed = true; await p.evaluate(() => { window.Ecosystem?.feed(4); }); }
    const cs = await snap(p), c = cs[0];
    for (const x of cs) { st.states.add(x.state); if (x.loop) st.loops.add(x.loop); if (x.feeding) st.feed = true; st.minClear = Math.min(st.minClear, clearance(x)); }
    if (st.feed && !cs.some((x) => x.feeding) && !cs.some((x) => x.state === 'seek' || x.state === 'eat')) st.back = true;
    if (last && c) {
      const prev = last, d = c.pos.map((v, i) => v - (prev[i] ?? 0)), sp = Math.hypot(...d);
      if (sp > 0.004) {
        const [x = 0, y = 0, z = 0, w = 1] = c.quat, f = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
        st.n++;
        if (f.reduce((s, v, i) => s + v * (d[i] ?? 0), 0) / sp > 0.3) st.ok++;
      }
    }
    last = c?.pos ?? null; await sleep(250);
  }
  await p.screenshot({ path: path.join(out, 'runtime_behavior_end.png') });
  add('idle plays', st.loops.has('idle'), [...st.loops].join(',') || 'no loop seen');
  add('moves nose-first', st.n >= 10 && st.ok / st.n >= 0.8, `${String(st.ok)}/${String(st.n)} moving samples`);
  add('feed: reaches the food and returns to roaming', st.feed || st.states.has('eat'), `states seen: ${[...st.states].join(',')}; returned: ${String(st.back)}`);
  add('feed: returns to idle afterwards', st.back, st.back ? 'yes' : 'did not return within the watch (slow renderer? raise --secs)');
  add('stays above the ground', st.minClear > -0.02, `lowest point ${st.minClear.toFixed(2)} m above the sand`);
  add('no console or page errors during the watch', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
  await p.close();
} catch (e) { add('page-test ran to the end', false, message(e)); }
await browser.close(); srv.close();

const pass = checks.every((c) => c.pass);
fs.writeFileSync(path.join(out, 'page-test.json'), JSON.stringify({ gate: 'page-test', pass, checks }, null, 1));
for (const c of checks) console.log(`  ${c.pass ? 'ok  ' : 'FAIL'} ${c.gate} ${c.check} | ${c.detail}`);
process.exit(pass ? 0 : 1);
