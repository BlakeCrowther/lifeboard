/* Local static server for the repo root (preview, e2e tests, headless pipeline tools). A request for `/models/<rel>` is
   answered by the first existing of models/board/<rel>, models/starter/<rel>, models/<rel> (model-files.ts), so the page
   fetches the published paths whichever layer holds the file. */
import { createReadStream, existsSync, statSync } from 'node:fs';
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

export function createStaticServer(repoRoot: string): http.Server {
  return http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://x').pathname;
    if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = localFileFor(repoRoot, pathname);
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
}
