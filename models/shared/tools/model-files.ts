/* Where a board's model files live. Published paths (`models/roster.json`, `models/assets/x-glb.js`) never change; on disk
   they come from layers: `models/board/` (one board's own models, absent in the public repo), `models/starter/` (the starter
   set), `models/` itself (goldens and pipeline files). See models/README.md "Layout". Python twin: model_files.py. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** `models/` of this checkout. */
export const MODELS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const boardDir = (root: string = MODELS_ROOT): string => path.join(root, 'board');
export const starterDir = (root: string = MODELS_ROOT): string => path.join(root, 'starter');

/** The model dir in use: `board/` once it has a roster.json, else `starter/`. Writers of shipped models use `boardDir()`. */
export function modelDir(root: string = MODELS_ROOT): string {
  return existsSync(path.join(boardDir(root), 'roster.json')) ? boardDir(root) : starterDir(root);
}

/** Local path of a path relative to `models/` as published (`roster.json`, `assets/x-glb.js`): the first existing of
 *  board, starter, then `models/` itself. Undefined when none exists. */
export function resolveModelFile(rel: string, root: string = MODELS_ROOT): string | undefined {
  return [boardDir(root), starterDir(root), root].map((dir) => path.join(dir, rel)).find((file) => existsSync(file));
}

/** The published path (relative to `models/`) of a local file under board/, starter/ or `models/`; the inverse of resolveModelFile. */
export function publishedPath(file: string, root: string = MODELS_ROOT): string {
  const abs = path.resolve(file);
  const layer = [boardDir(root), starterDir(root)].find((dir) => abs.startsWith(dir + path.sep)) ?? root;
  return path.relative(layer, abs).split(path.sep).join('/');
}
