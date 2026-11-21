#!/usr/bin/env node
/* Watch a creature's behaviour over time in the real habitat (capture.html in headless Chrome, which runs frames at full speed;
   a hidden preview pane throttles them), e.g. the rest cycle (models/creature/CONTRACT.md "Resting").
   Usage: node models/shared/tools/watch_creatures.mjs <id> [--secs 110] [--query 'rest=rock_cling&perch=1'] [--at 5:'Habitat.feed(4)']
            [--expect approach,settle,perched,leave] [--out <dir>]
   Prints the state log (one line per change across all copies) and the fastest turn seen (deg/s); saves one screenshot
   per state in --expect to --out (default models/out/<id>/qa/watch/). Exit 0 ok, 1 page error or an --expect state never
   reached, 2 usage. Needs Google Chrome and python3 (static server); three.js loads from jsdelivr. Synthetic game state. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const MODELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), REPO = path.dirname(MODELS);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argv = process.argv.slice(2), id = argv[0], opt = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
if (!id || id.startsWith('-')) { console.error('usage: watch_creatures.mjs <id> [--secs n] [--query q] [--at s:expr] [--expect a,b] [--out dir]'); process.exit(2); }
const secs = +opt('--secs', 110), query = opt('--query', ''), at = opt('--at', null), expect = (opt('--expect', '') || '').split(',').filter(Boolean);
const out = path.resolve(opt('--out', path.join(MODELS, 'out', id, 'qa', 'watch'))); fs.mkdirSync(out, { recursive: true });
const [atS, atExpr] = at ? [+at.slice(0, at.indexOf(':')), at.slice(at.indexOf(':') + 1)] : [null, null];
const kids = [], sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { console.error('WATCH FAIL: ' + m); kids.forEach((k) => k.kill()); process.exit(1); };

const srv = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'], { cwd: REPO }); kids.push(srv);
const port = await new Promise((res, rej) => { let b = ''; const t = setTimeout(() => rej(new Error('server did not start')), 10000);
  const on = (d) => { b += d; const m = b.match(/port (\d+)/); if (m) { clearTimeout(t); res(+m[1]); } }; srv.stdout.on('data', on); srv.stderr.on('data', on); }).catch((e) => fail(e.message));
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-watch-'));
kids.push(spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--window-size=960,720', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', 'about:blank'], { stdio: 'ignore' }));
let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) { await sleep(100); try { const [p] = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n'); const l = await (await fetch(`http://127.0.0.1:${p}/json/list`)).json(); wsUrl = (l.find((t) => t.type === 'page') || {}).webSocketDebuggerUrl; } catch { /* not up yet */ } }
if (!wsUrl) fail('chrome did not start (set CHROME=<path>)');
const ws = new WebSocket(wsUrl); await new Promise((r) => { ws.onopen = r; });
let seq = 0; const waiting = new Map(), errors = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
const cdp = (method, params = {}) => new Promise((res) => { const i = ++seq; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => (await cdp('Runtime.evaluate', { expression: e, returnByValue: true })).result?.value;
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/capture.html?visitor=${encodeURIComponent(id)}${query ? '&' + query : ''}` });
for (let i = 0; i < 160; i++) { await sleep(250); if (await js('!!(window.Habitat && Habitat.debug() && Habitat.debug().creatures.length)')) break; }
if (!(await js('!!(window.Habitat && Habitat.debug() && Habitat.debug().creatures.length)'))) fail(`no creature ${id} in the scene${errors.length ? '; ' + errors[0] : ''}`);

const t0 = Date.now(), seen = new Set(), log = []; let prev = null, last = null, maxTurn = 0, fired = !atExpr;
while (Date.now() - t0 < secs * 1000) {
  const now = (Date.now() - t0) / 1000;
  if (!fired && now >= atS) { fired = true; await js(atExpr); log.push(`${now.toFixed(1)}s  ran ${atExpr}`); }
  const cs = (await js('Habitat.debug().creatures')) || [], st = cs.map((c) => c.state).join(','), c = cs[0];
  if (st !== prev) { log.push(`${now.toFixed(1)}s  ${st}`); prev = st; }
  if (last && c) { const d = Math.abs(c.quat.reduce((s, v, i) => s + v * last.q[i], 0)); maxTurn = Math.max(maxTurn, ((2 * Math.acos(Math.min(1, d)) * 180) / Math.PI) / ((Date.now() - last.t) / 1000)); }
  last = c && { q: c.quat, t: Date.now() };
  for (const s of expect) if (!seen.has(s) && cs.some((x) => x.state === s)) { seen.add(s); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, `${s}.png`), Buffer.from(r.data, 'base64')); last = null; }
  await sleep(100);
}
console.log(log.join('\n')); console.log(`fastest turn ${Math.round(maxTurn)} deg/s; screenshots in ${path.relative(REPO, out)}`);
kids.forEach((k) => k.kill());
const missing = expect.filter((s) => !seen.has(s));
if (errors.length) fail('page errors: ' + errors.slice(0, 3).join(' | '));
if (missing.length) fail(`never reached: ${missing.join(', ')} in ${secs}s`);
process.exit(0);
