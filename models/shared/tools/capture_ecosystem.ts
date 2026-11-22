/* Capture a scenery candidate inside the real Ecosystem (the scene on the standalone capture.html: the board's lighting,
   murk, grade and neighbours, without the board), for the judge-panel.
   Usage: node models/shared/tools/capture_ecosystem.ts <id> [--glb <path>] [--spec <path>] [--hour 12] [--frames 12] [--neglect 0..1]
   --neglect defaults to 0.5 when <id> is a biome's neglect.blight (blight props are seen in murk), else 0.
   Defaults: glb models/out/<id>/<id>.glb, spec models/<kind>/specs/<id>.json. Output <glb dir>/qa/ecosystem/:
     wide.png      the normal game camera, prop on the sand in front (the size players see it at)
     turn.png      4 labelled angles round the prop, mid-sway
     sway.png      <frames> labelled frames across one sway loop, one angle, in order
   Needs Google Chrome (headless, WebGL), python3 (static server), ImageMagick `montage`, network (three.js from jsdelivr).
   Synthetic game state, no board data. Exit 0 ok, 2 usage, 3 page/capture failure. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MODELS, REPO, openHeadlessPage, sleep } from './headless-page.ts';

interface Spec { kind?: string; biome?: number; motion?: { sway?: unknown } }
interface BiomesFile { biomes?: { neglect?: { blight?: string } }[] }

const W = 960, H = 720;
const argv = process.argv.slice(2), id = argv[0];
const opt = (k: string): string | undefined => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : undefined; };
if (!id || id.startsWith('-')) { console.error('usage: capture_ecosystem.ts <id> [--glb p] [--spec p] [--hour 12] [--frames 12]'); process.exit(2); }
const glb = path.resolve(opt('--glb') ?? path.join(MODELS, 'out', id, id + '.glb'));
const spec = opt('--spec') ?? ['scenery', 'creature', 'plant'].map((k) => path.join(MODELS, k, 'specs', id + '.json')).find((p) => fs.existsSync(p));
const hour = opt('--hour') ?? '12', frames = Number(opt('--frames') ?? 12);
const biomes = (JSON.parse(fs.readFileSync(path.join(MODELS, 'biomes.json'), 'utf8')) as BiomesFile).biomes ?? [];
const neglect = opt('--neglect') ?? (biomes.some((b) => b.neglect?.blight === id) ? '0.5' : '0');
if (!fs.existsSync(glb)) { console.error(`no glb at ${glb}`); process.exit(2); }
if (!spec || !fs.existsSync(spec)) { console.error(`no spec for ${id}`); process.exit(2); }
if (!glb.startsWith(REPO + path.sep)) { console.error('glb must be inside the repo (the page server serves the repo)'); process.exit(2); }
const S = JSON.parse(fs.readFileSync(spec, 'utf8')) as Spec;
if ((S.kind ?? 'creature') !== 'scenery') { console.error('only scenery is placed by ?inspect= today'); process.exit(2); }

const out = path.join(path.dirname(glb), 'qa', 'ecosystem'); fs.mkdirSync(out, { recursive: true });
const wrap = path.join(out, `${id}-glb.js`);
fs.writeFileSync(wrap, `window.LB_SCENERY=window.LB_SCENERY||{};window.LB_SCENERY[${JSON.stringify(id)}]="${fs.readFileSync(glb).toString('base64')}";\n`);

const page = await openHeadlessPage({ prefix: 'CAPTURE', failCode: 3, width: W, height: H, chromeArgs: ['--hide-scrollbars', '--mute-audio'] });
const q = new URLSearchParams({ inspect: id, inspect_src: '/' + path.relative(REPO, wrap).split(path.sep).join('/'), biome: String(S.biome ?? 0), hour, weather: 'clear', neglect });
await page.cdp('Page.navigate', { url: `http://127.0.0.1:${String(page.port)}/capture.html?${q.toString()}` });

const until = async (expr: string, what: string, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await page.js(expr)) return; } catch { /* page still loading */ } await sleep(250); }
  page.fail(`timed out waiting for ${what}${page.errors.length ? '; page errors: ' + page.errors.slice(0, 3).join(' | ') : ''}`);
};
await until(`!!(window.Ecosystem && Ecosystem.inspect && Ecosystem.inspect.ready)`, 'the inspected prop (is three.js reachable?)');
await sleep(1500); /* shader compile + env bake */
const settle = () => page.js(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => r(true), 120))))`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-frames-'));
await page.js(`Ecosystem.inspect.pose(null)`); await sleep(800); await settle(); await page.screenshot(path.join(out, 'wide.png'));
const turn: string[] = [];
for (let i = 0; i < 4; i++) { await page.js(`Ecosystem.inspect.pose({yaw:${((i * Math.PI) / 2 + 0.5).toFixed(3)},frac:0.5})`); await settle(); turn.push(await page.screenshot(path.join(tmp, `turn_${String(i)}.png`))); }
const sway: string[] = [];
for (let i = 0; i < frames; i++) { await page.js(`Ecosystem.inspect.pose({yaw:0.5,frac:${(i / frames).toFixed(4)}})`); await settle(); sway.push(await page.screenshot(path.join(tmp, `sway_${String(i).padStart(2, '0')}.png`))); }

const montage = (files: string[], labels: string[], cols: number, file: string, tile = '480x360') => new Promise<string>((res, rej) => {
  const args = files.flatMap((f, i) => ['-label', labels[i] ?? '', f]);
  const p = spawn('montage', [...args, '-tile', `${String(cols)}x`, '-geometry', `${tile}+4+4`, '-pointsize', '18', '-background', '#222', '-fill', '#eee', file]);
  p.on('exit', (c) => { if (c) rej(new Error('montage failed')); else res(file); });
});
const failOn = (e: unknown) => page.fail(e instanceof Error ? e.message : String(e));
await montage(turn, ['front', 'right', 'back', 'left'], 2, path.join(out, 'turn.png')).catch(failOn);
await montage(sway, sway.map((_, i) => `frame ${String(i + 1)} of ${String(frames)}`), 4, path.join(out, 'sway.png'), '320x240').catch(failOn);
/* sway-check: how much the picture changes across the loop (only the candidate moves while posing). Mean absolute
   pixel difference vs frame 1, 0..1 of full range, worst frame. Measured in the real Ecosystem, so it covers shader sway too. */
if (S.motion?.sway) {
  const mae = (a: string, b: string) => new Promise<number>((res) => {
    const p = spawn('compare', ['-metric', 'MAE', a, b, 'null:']); let e = '';
    p.stderr.on('data', (d: Buffer) => (e += d.toString()));
    p.on('exit', () => { const m = /\(([\d.e-]+)\)/.exec(e); res(m ? Number(m[1]) : 0); });
  });
  const first = sway[0] ?? '', diffs: number[] = [];
  for (const frame of sway.slice(1)) diffs.push(await mae(first, frame));
  const peak = Math.max(...diffs), MIN = 0.008; /* golden eelgrass_tuft ~0.016, a still prop ~0 */
  fs.writeFileSync(path.join(out, 'sway-check.json'), JSON.stringify([{ gate: 'motion-check', check: `sway visible in the Ecosystem (peak frame change >= ${String(MIN)})`, pass: peak >= MIN,
    detail: `peak ${peak.toFixed(4)}, per frame ${diffs.map((d) => d.toFixed(4)).join(' ')}` }], null, 1));
  console.log(`sway-check: peak frame change ${peak.toFixed(4)} (${peak >= MIN ? 'PASS' : 'FAIL'}, min ${String(MIN)})`);
}
const errors = [...page.errors];
await page.close();
fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(wrap);
if (errors.length) console.log('page console errors:\n  ' + errors.slice(0, 5).join('\n  '));
console.log(`CAPTURE OK ${out}: wide.png turn.png sway.png`);
process.exit(0);
