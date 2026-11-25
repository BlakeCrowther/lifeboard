/* Garden flicker check: a 3D plant tile must never show an empty (undrawn) plant canvas while sessions are logged.
   Logging re-renders the Today tiles; the plant canvas has to pick its plant back up before the next paint.
   Serves the repo, opens index.html with dist/fake-db.js and a synthetic board whose one habit grows the plant golden,
   logs four sessions, and checks every animation frame. Run after `pnpm build`. Exit 0 pass, 1 fail. */
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveModelFile } from '../../models/shared/tools/model-files.ts';
import { createStaticServer } from '../../models/shared/tools/static-server.ts';
import { board } from './fixture.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/* The template repo ships no board's plants, so the page gets a roster with the plant golden as the habit's gen-0 plant
   (its model is a golden asset in models/assets/). No golden asset = a broken checkout: fail, never skip. */
const GOLDEN = 'mermaids_cup';
const PLOT = 'practice';
if (!resolveModelFile(`assets/${GOLDEN}-glb.js`)) {
  console.error(`garden-flicker: FAIL, models/assets/${GOLDEN}-glb.js missing`);
  process.exit(1);
}
const roster = JSON.parse(fs.readFileSync(resolveModelFile('roster.json') ?? '', 'utf8')) as { models: Record<string, unknown>[] };
roster.models = roster.models.filter((model) => model['kind'] !== 'plant').concat({
  id: GOLDEN, kind: 'plant', name: 'Golden', spec: `plant/specs/${GOLDEN}.json`, glb: `assets/${GOLDEN}.glb`, js: `assets/${GOLDEN}-glb.js`,
  biome: 0, rarity: 'common', golden: true, plot: PLOT, gen: 0, habit: 'Practice',
});

const server = createStaticServer(ROOT);
setTimeout(() => { console.error('garden-flicker: FAIL, timed out after 90s'); process.exit(1); }, 90000).unref();

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
const browser = await chromium.launch(process.env['CHROMIUM_PATH'] ? { executablePath: process.env['CHROMIUM_PATH'] } : {});
let failure = '';
try {
  const page = await browser.newPage();
  await page.route('**/models/roster.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(roster) }));
  const data = {
    ...board,
    checks: { ...board.checks, ui_prefs: { value: { garden: true, eco: false }, updated_at: Date.now() } },
    habits: { h1: { key: PLOT, name: 'Practice', cadence: 'week', target_per_week: 3, sort_order: 1 } },
  };
  await page.addInitScript({ content: `window.MOCK = ${JSON.stringify(data)};` });
  await page.addInitScript({ path: path.join(ROOT, 'dist/fake-db.js') });
  await page.goto(`${base}/index.html`);
  await page.waitForSelector('canvas.gp3', { timeout: 20000 });
  /* the model loads and draws once before logging starts */
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.gp3');
    const pixels = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    return !!pixels && pixels.some((value, i) => i % 4 === 3 && value > 0);
  }, null, { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const blank = (canvas: HTMLCanvasElement): boolean => !canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data.some((value, i) => i % 4 === 3 && value > 0);
    let frames = 0;
    let empty = 0;
    let done = false;
    /* look once every rAF callback of the frame has run (a task queued from the frame), i.e. what gets painted */
    const tick = (): void => {
      if (done) return;
      setTimeout(() => {
        frames++;
        const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas.gp3')];
        if (!canvases.length || canvases.some(blank)) empty++;
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    for (let i = 0; i < 4; i++) {
      document.querySelector<HTMLElement>('.gtp[data-act="log"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    done = true;
    return { frames, empty };
  });
  if (result.frames < 20) failure = `only ${String(result.frames)} frames ran`;
  else if (result.empty) failure = `${String(result.empty)} of ${String(result.frames)} frames showed an empty plant canvas after logging`;
  else console.log(`garden-flicker: ${String(result.frames)} frames, no empty plant`);
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  await browser.close();
  server.close();
}
if (failure) {
  console.error(`garden-flicker: FAIL, ${failure}`);
  process.exit(1);
}
