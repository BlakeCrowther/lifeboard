// Local preview and UI smoke only, bundled to dist/fake-db.js: stands in for claude.ai's `window.claude`
// with an in-memory db seeded from `window.MOCK` (tools/ui-smoke/fixture.js, or a gitignored mockdata.js).
// Load it before dist/app.js. Never publish it.
import { createFakeDb, type FakeData, type FakeDb } from './packages/db/fake.ts';

declare global {
  interface Window {
    MOCK?: FakeData;
  }
}

/* One db for the page, so a write through any `use('db')` reaches every listener. */
let db: FakeDb | null = null;
window.claude = {
  use: (capability) => {
    if (capability !== 'db') return Promise.resolve(null);
    db ??= createFakeDb((window.MOCK ??= {}));
    return Promise.resolve(db);
  },
};
