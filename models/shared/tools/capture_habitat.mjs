#!/usr/bin/env node
/* Capture a scenery candidate inside the real habitat (habitat.js on the standalone capture.html: the board's lighting,
   murk, grade and neighbours, without the board), for the judge-panel.
   Usage: node models/shared/tools/capture_habitat.mjs <id> [--glb <path>] [--spec <path>] [--hour 12] [--frames 12] [--neglect 0..1]
   --neglect defaults to 0.5 when <id> is a biome's neglect.blight (blight props are seen in murk), else 0.
   Defaults: glb models/out/<id>/<id>.glb, spec models/<kind>/specs/<id>.json. Output <glb dir>/qa/habitat/:
     wide.png      the normal game camera, prop on the sand in front (the size players see it at)
     turn.png      4 labelled angles round the prop, mid-sway
     sway.png      <frames> labelled frames across one sway loop, one angle, in order
   Needs Google Chrome (headless, WebGL), python3 (static server), ImageMagick `montage`, network (three.js from jsdelivr).
   Synthetic game state, no board data. Exit 0 ok, 2 usage, 3 page/capture failure. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const MODELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = path.dirname(MODELS);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 960, Hh = 720;

const argv = process.argv.slice(2), id = argv[0];
const opt = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
if (!id || id.startsWith('-')) { console.error('usage: capture_habitat.mjs <id> [--glb p] [--spec p] [--hour 12] [--frames 12]'); process.exit(2); }
const glb = path.resolve(opt('--glb', path.join(MODELS, 'out', id, id + '.glb')));
const spec = opt('--spec', ['scenery', 'creature', 'plant'].map((k) => path.join(MODELS, k, 'specs', id + '.json')).find((p) => fs.existsSync(p)));
const hour = opt('--hour', '12'), frames = +opt('--frames', 12);
const biomes = JSON.parse(fs.readFileSync(path.join(MODELS, 'biomes.json'), 'utf8')).biomes || [];
const neglect = opt('--neglect', biomes.some((b) => b.neglect && b.neglect.blight === id) ? '0.5' : '0');
if (!fs.existsSync(glb)) { console.error(`no glb at ${glb}`); process.exit(2); }
if (!spec || !fs.existsSync(spec)) { console.error(`no spec for ${id}`); process.exit(2); }
if (!glb.startsWith(REPO + path.sep)) { console.error('glb must be inside the repo (the page server serves the repo)'); process.exit(2); }
const S = JSON.parse(fs.readFileSync(spec, 'utf8'));
if ((S.kind || 'creature') !== 'scenery') { console.error('only scenery is placed by ?inspect= today'); process.exit(2); }

const out = path.join(path.dirname(glb), 'qa', 'habitat'); fs.mkdirSync(out, { recursive: true });
const wrap = path.join(out, `${id}-glb.js`);
fs.writeFileSync(wrap, `window.LB_SCENERY=window.LB_SCENERY||{};window.LB_SCENERY[${JSON.stringify(id)}]="${fs.readFileSync(glb).toString('base64')}";\n`);

const kids = [];
const fail = (m) => { console.error('CAPTURE FAIL: ' + m); kids.forEach((k) => k.kill()); process.exit(3); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* static server on a free port, rooted at the repo */
const srv = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'], { cwd: REPO }); kids.push(srv);
const port = await new Promise((res, rej) => {
  let buf = ''; const t = setTimeout(() => rej(new Error('server did not start')), 10000);
  const on = (d) => { buf += d; const m = buf.match(/port (\d+)/); if (m) { clearTimeout(t); res(+m[1]); } };
  srv.stdout.on('data', on); srv.stderr.on('data', on);
}).catch((e) => fail(e.message));

/* headless Chrome with DevTools on a free port */
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-capture-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, `--window-size=${W},${Hh}`,
  '--hide-scrollbars', '--mute-audio', '--no-first-run', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
kids.push(chrome);
let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
  await sleep(100);
  try { const [p] = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n');
    const list = await (await fetch(`http://127.0.0.1:${p}/json/list`)).json(); wsUrl = (list.find((t) => t.type === 'page') || {}).webSocketDebuggerUrl; } catch { /* not up yet */ }
}
if (!wsUrl) fail('chrome did not start (set CHROME=<path> if it is not in /Applications)');

const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }).catch(() => fail('devtools socket'));
let seq = 0; const waiting = new Map(), errors = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ')); };
const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++seq; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };

await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: Hh, deviceScaleFactor: 1, mobile: false });
const q = new URLSearchParams({ inspect: id, inspect_src: '/' + path.relative(REPO, wrap).split(path.sep).join('/'), biome: String(S.biome ?? 0), hour, weather: 'clear', neglect });
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/capture.html?${q}` });

const until = async (expr, what, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await js(expr)) return; } catch { /* page still loading */ } await sleep(250); } fail(`timed out waiting for ${what}${errors.length ? '; page errors: ' + errors.slice(0, 3).join(' | ') : ''}`); };
await until(`!!(window.Habitat && Habitat.inspect && Habitat.inspect.ready)`, 'the inspected prop (is three.js reachable?)');
await sleep(1500); /* shader compile + env bake */
const settle = () => js(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => r(true), 120))))`);
const shot = async (file) => { const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(data, 'base64')); return file; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-frames-'));
await js(`Habitat.inspect.pose(null)`); await sleep(800); await settle(); await shot(path.join(out, 'wide.png'));
const turn = [];
for (let i = 0; i < 4; i++) { await js(`Habitat.inspect.pose({yaw:${(i * Math.PI / 2 + 0.5).toFixed(3)},frac:0.5})`); await settle(); turn.push(await shot(path.join(tmp, `turn_${i}.png`))); }
const sway = [];
for (let i = 0; i < frames; i++) { await js(`Habitat.inspect.pose({yaw:0.5,frac:${(i / frames).toFixed(4)}})`); await settle(); sway.push(await shot(path.join(tmp, `sway_${String(i).padStart(2, '0')}.png`))); }

const montage = (files, labels, cols, file, tile = '480x360') => new Promise((res, rej) => {
  const args = []; files.forEach((f, i) => args.push('-label', labels[i], f));
  const p = spawn('montage', [...args, '-tile', `${cols}x`, '-geometry', `${tile}+4+4`, '-pointsize', '18', '-background', '#222', '-fill', '#eee', file]);
  p.on('exit', (c) => (c ? rej(new Error('montage failed')) : res(file)));
});
await montage(turn, ['front', 'right', 'back', 'left'], 2, path.join(out, 'turn.png')).catch((e) => fail(e.message));
await montage(sway, sway.map((_, i) => `frame ${i + 1} of ${frames}`), 4, path.join(out, 'sway.png'), '320x240').catch((e) => fail(e.message));
/* sway-check: how much the picture changes across the loop (only the candidate moves while posing). Mean absolute
   pixel difference vs frame 1, 0..1 of full range, worst frame. Measured in the real habitat, so it covers shader sway too. */
const sw = (S.motion || {}).sway;
if (sw) {
  const mae = (a, b) => new Promise((res) => { const p = spawn('compare', ['-metric', 'MAE', a, b, 'null:']); let e = ''; p.stderr.on('data', (d) => (e += d));
    p.on('exit', () => { const m = e.match(/\(([\d.e-]+)\)/); res(m ? +m[1] : 0); }); });
  const diffs = []; for (let i = 1; i < sway.length; i++) diffs.push(await mae(sway[0], sway[i]));
  const peak = Math.max(...diffs), MIN = 0.008; /* golden eelgrass_tuft ~0.016, a still prop ~0 */
  fs.writeFileSync(path.join(out, 'sway-check.json'), JSON.stringify([{ gate: 'motion-check', check: `sway visible in the habitat (peak frame change >= ${MIN})`, pass: peak >= MIN,
    detail: `peak ${peak.toFixed(4)}, per frame ${diffs.map((d) => d.toFixed(4)).join(' ')}` }], null, 1));
  console.log(`sway-check: peak frame change ${peak.toFixed(4)} (${peak >= MIN ? 'PASS' : 'FAIL'}, min ${MIN})`);
}
kids.forEach((k) => k.kill()); ws.close(); await sleep(300);
fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); fs.rmSync(wrap);
if (errors.length) console.log('page console errors:\n  ' + errors.slice(0, 5).join('\n  '));
console.log(`CAPTURE OK ${out}: wide.png turn.png sway.png`);
process.exit(0);
