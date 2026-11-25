/* Local static server for the repo root (preview, e2e tests, headless pipeline tools). A request for `/models/<rel>` is
   answered by the first existing of models/board/<rel>, models/starter/<rel>, models/<rel> (model-files.ts), so the page
   fetches the published paths whichever layer holds the file. `/test.html` is made on each request (no file on disk is
   read): the local preview page, index.html with the made-up data (mockdata.js, from `pnpm demo:mock`) and the fake db
   loaded first. */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { resolveModelFile } from './model-files.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
};

/** Local file for a request path, or undefined (missing, a directory, or outside `repoRoot`). */
export function localFileFor(repoRoot: string, urlPath: string): string | undefined {
  const rel = path.posix.normalize(decodeURIComponent(urlPath));
  if (rel.split('/').includes('..')) return undefined;
  const file = rel.startsWith('/models/')
    ? resolveModelFile(rel.slice('/models/'.length), path.join(repoRoot, 'models'))
    : path.join(repoRoot, rel);
  return file && existsSync(file) && !statSync(file).isDirectory() ? file : undefined;
}

const PREVIEW_SCRIPTS = '<script src="mockdata.js"></script><script src="dist/fake-db.js"></script>';
const APP_SCRIPT = '<script type="module" src="dist/app.js"></script>';

/** index.html with mockdata.js and dist/fake-db.js loaded before dist/app.js, so the page runs on made-up data. */
export function previewPageHtml(indexHtml: string): string {
  if (!indexHtml.includes(APP_SCRIPT)) throw new Error(`index.html has no ${APP_SCRIPT}`);
  return indexHtml.replace(APP_SCRIPT, PREVIEW_SCRIPTS + APP_SCRIPT);
}

export function createStaticServer(repoRoot: string): http.Server {
  return http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://x').pathname;
    if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (pathname === '/test.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(previewPageHtml(readFileSync(path.join(repoRoot, 'index.html'), 'utf8')));
      return;
    }
    const file = localFileFor(repoRoot, pathname);
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
}
