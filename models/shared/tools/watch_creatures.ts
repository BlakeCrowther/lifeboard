/* Watch a creature's behaviour over time in the real Ecosystem (capture.html in headless Chrome, which runs frames at full speed;
   a hidden preview pane throttles them), e.g. the rest cycle (models/creature/CONTRACT.md "Resting").
   Usage: node models/shared/tools/watch_creatures.ts <id> [--secs 110] [--query 'rest=rock_cling&perch=1'] [--at 5:'Ecosystem.feed(4)']
            [--expect approach,settle,perched,leave] [--out <dir>]
   Prints the state log (one line per change across all copies) and the fastest turn seen (deg/s); saves one screenshot
   per state in --expect to --out (default models/out/<id>/qa/watch/). Exit 0 ok, 1 page error or an --expect state never
   reached, 2 usage. Needs Google Chrome and python3 (static server); three.js loads from jsdelivr. Synthetic game state. */
import fs from 'node:fs';
import path from 'node:path';
import { MODELS, REPO, openHeadlessPage, sleep } from './headless-page.ts';

interface Watched { state: string; quat: number[] }

const argv = process.argv.slice(2), id = argv[0];
const opt = (k: string, d: string): string => { const i = argv.indexOf(k); return i > 0 ? (argv[i + 1] ?? d) : d; };
if (!id || id.startsWith('-')) { console.error('usage: watch_creatures.ts <id> [--secs n] [--query q] [--at s:expr] [--expect a,b] [--out dir]'); process.exit(2); }
const secs = Number(opt('--secs', '110')), query = opt('--query', ''), at = opt('--at', ''), expect = opt('--expect', '').split(',').filter(Boolean);
const out = path.resolve(opt('--out', path.join(MODELS, 'out', id, 'qa', 'watch'))); fs.mkdirSync(out, { recursive: true });
const atS = at ? Number(at.slice(0, at.indexOf(':'))) : 0, atExpr = at ? at.slice(at.indexOf(':') + 1) : '';

const page = await openHeadlessPage({ prefix: 'WATCH', failCode: 1, width: 960, height: 720 });
await page.cdp('Page.navigate', { url: `http://127.0.0.1:${String(page.port)}/capture.html?visitor=${encodeURIComponent(id)}${query ? '&' + query : ''}` });
const ready = async () => !!(await page.js('!!(window.Ecosystem && Ecosystem.debug() && Ecosystem.debug().creatures.length)').catch(() => false));
for (let i = 0; i < 160; i++) { await sleep(250); if (await ready()) break; }
if (!(await ready())) page.fail(`no creature ${id} in the scene${page.errors.length ? '; ' + (page.errors[0] ?? '') : ''}`);

const t0 = Date.now(), seen = new Set<string>(), log: string[] = [];
let prev: string | null = null, last: { q: number[]; t: number } | null = null, maxTurn = 0, fired = !atExpr;
while (Date.now() - t0 < secs * 1000) {
  const now = (Date.now() - t0) / 1000;
  if (!fired && now >= atS) { fired = true; await page.js(atExpr); log.push(`${now.toFixed(1)}s  ran ${atExpr}`); }
  const cs = ((await page.js('Ecosystem.debug().creatures')) ?? []) as Watched[], st = cs.map((c) => c.state).join(','), c = cs[0];
  if (st !== prev) { log.push(`${now.toFixed(1)}s  ${st}`); prev = st; }
  if (last && c) {
    const q = last.q, d = Math.abs(c.quat.reduce((s, v, i) => s + v * (q[i] ?? 0), 0));
    maxTurn = Math.max(maxTurn, ((2 * Math.acos(Math.min(1, d)) * 180) / Math.PI) / ((Date.now() - last.t) / 1000));
  }
  last = c ? { q: c.quat, t: Date.now() } : null;
  for (const s of expect) if (!seen.has(s) && cs.some((x) => x.state === s)) { seen.add(s); await page.screenshot(path.join(out, `${s}.png`)); last = null; }
  await sleep(100);
}
console.log(log.join('\n')); console.log(`fastest turn ${String(Math.round(maxTurn))} deg/s; screenshots in ${path.relative(REPO, out)}`);
const missing = expect.filter((s) => !seen.has(s));
if (page.errors.length) page.fail('page errors: ' + page.errors.slice(0, 3).join(' | '));
if (missing.length) page.fail(`never reached: ${missing.join(', ')} in ${String(secs)}s`);
await page.close();
process.exit(0);
