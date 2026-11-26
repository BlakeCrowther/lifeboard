import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaticServer } from '../models/shared/tools/static-server.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('local preview page', () => {
  const server = createStaticServer(ROOT);
  let base = '';
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => { resolve(); })));

  it('serves /test.html as index.html with the made-up data and fake db loaded before the app', async () => {
    const res = await fetch(`${base}/test.html`);
    expect(res.status).toBe(200);
    const html = await res.text();
    const mock = html.indexOf('<script src="mockdata.js"></script>');
    const fake = html.indexOf('<script src="dist/fake-db.js"></script>');
    const app = html.indexOf('src="dist/app.js"');
    expect(mock).toBeGreaterThan(-1);
    expect(fake).toBeGreaterThan(mock);
    expect(app).toBeGreaterThan(fake);
  });
});
