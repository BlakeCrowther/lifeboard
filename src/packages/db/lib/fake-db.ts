/* In-memory stand-in for the artifact db: same shape as `window.claude.use('db')`. Writes land in `data`
   (the seed object itself, so a page or test can read what was saved) and every listener of that collection hears them. */
import type { DbAdapter, DbCollectionRef, DbSnapshot } from './adapter.ts';

/** collection -> doc id -> body */
export type FakeData = Record<string, Record<string, object> | undefined>;

export interface FakeDb extends DbAdapter {
  readonly data: FakeData;
  /** The next `count` writes (set, update or delete) reject with `{ code }` and change nothing. */
  failNextWrites(count: number, code?: string): void;
  /** A change made elsewhere (another device): stored and delivered to listeners. null deletes. */
  remoteWrite(collection: string, id: string, body: object | null): void;
}

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/* Like the artifact db's update: nested objects merge key by key instead of being replaced. */
function mergeDeep(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    const cur = out[k];
    out[k] = isPlainObject(v) && isPlainObject(cur) ? mergeDeep(cur, v) : v;
  }
  return out;
}

export function createFakeDb(seed: FakeData = {}): FakeDb {
  const data = seed;
  const listeners = new Map<string, ((snap: DbSnapshot) => void)[]>();
  let failures: { left: number; code: string } = { left: 0, code: 'failed' };
  let counter = 0;

  const docsOf = (c: string): Record<string, object> => (data[c] ??= {});
  const snapshot = (c: string): DbSnapshot => ({ docs: Object.entries(data[c] ?? {}).map(([id, body]) => ({ id, data: () => clone(body) })) });
  const fire = (c: string): void => { for (const f of listeners.get(c) ?? []) f(snapshot(c)); };
  const write = (c: string, change: () => void): Promise<void> => {
    if (failures.left > 0) {
      failures.left--;
      return Promise.reject(Object.assign(new Error('fake db write refused'), { code: failures.code }));
    }
    change();
    fire(c);
    return Promise.resolve();
  };

  const collection = (c: string): DbCollectionRef => ({
    onSnapshot(next) {
      const list = listeners.get(c) ?? [];
      list.push(next);
      listeners.set(c, list);
      setTimeout(() => { next(snapshot(c)); });
      return () => { listeners.set(c, (listeners.get(c) ?? []).filter((f) => f !== next)); };
    },
    doc(id = 'm' + (++counter).toString(36) + Math.random().toString(36).slice(2, 8)) {
      return {
        id,
        set: (body) => write(c, () => { docsOf(c)[id] = clone(body); }),
        update: (patch) => write(c, () => { docsOf(c)[id] = mergeDeep({ ...docsOf(c)[id] }, clone(patch) as Record<string, unknown>); }),
        delete: () => write(c, () => { Reflect.deleteProperty(docsOf(c), id); }),
      };
    },
  });

  return {
    data,
    collection,
    failNextWrites(count, code = 'failed') { failures = { left: count, code }; },
    remoteWrite(c, id, body) {
      if (body === null) Reflect.deleteProperty(docsOf(c), id); else docsOf(c)[id] = clone(body);
      fire(c);
    },
  };
}
