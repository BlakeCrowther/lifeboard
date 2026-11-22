/* Data layer over the artifact db: one live listener per store collection, validated on load, optimistic local
   writes (rolled back if the db refuses), one write at a time per document, and undo. */
import type { DbAdapter } from './adapter.ts';
import { STORE_COLLECTIONS, type CollectionDoc, type StoreCollection } from './schemas.ts';
import { validate } from './validate.ts';

export type StoredDoc<C extends StoreCollection> = CollectionDoc<C> & { id: string };
type Body = Record<string, unknown>;

/** loading → ready once every collection has delivered; slow after a wait; nodb outside claude.ai; error if a listener fails. */
export type StoreStatus = 'loading' | 'slow' | 'ready' | 'nodb' | 'error';
export interface StoreState {
  status: StoreStatus;
  err: string | null | undefined;
  readonly got: Set<StoreCollection>;
}

/** What a write touched first, so undo can put it back. `before` null = the doc didn't exist. */
export interface UndoEntry {
  c: StoreCollection;
  id: string;
  before: Body | null;
}
export type UndoRecord = UndoEntry[];

export class InvalidDocError extends Error {
  readonly code = 'invalid_doc';
}

export interface StoreOptions {
  /** Called once by start(); null or a null result means there is no db here. */
  connect: () => Promise<DbAdapter | null> | DbAdapter | null;
  slowAfterMs?: number;
  warn?: (message: string, detail: unknown) => void;
}

const clone = <T>(o: T): T => (o == null ? o : (JSON.parse(JSON.stringify(o)) as T));
const isPlainObject = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

export function createStore(options: StoreOptions) {
  const { connect, slowAfterMs = 10000, warn = (m, d) => { console.warn(m, d); } } = options;
  const raw = new Map<StoreCollection, Map<string, Body>>(STORE_COLLECTIONS.map((c) => [c, new Map()]));
  const bad = new Map<StoreCollection, Map<string, string>>(STORE_COLLECTIONS.map((c) => [c, new Map()]));
  const state: StoreState = { status: 'loading', err: null, got: new Set() };
  let db: DbAdapter | null = null;
  let onChange: () => void = () => undefined;
  const docsOf = (c: StoreCollection): Map<string, Body> => raw.get(c) ?? new Map<string, Body>();

  function start(changed: () => void): void {
    onChange = changed;
    const timer = setTimeout(() => {
      if (state.status === 'loading') { state.status = 'slow'; onChange(); }
    }, slowAfterMs);
    const noDb = (): void => { clearTimeout(timer); state.status = 'nodb'; onChange(); };
    let pending: ReturnType<typeof connect>;
    try { pending = connect(); } catch { noDb(); return; }
    if (pending === null) { noDb(); return; }
    Promise.resolve(pending).then((adapter) => {
      if (!adapter) { noDb(); return; }
      db = adapter;
      for (const c of STORE_COLLECTIONS) {
        adapter.collection(c).onSnapshot((snap) => {
          const good = new Map<string, Body>(), skipped = new Map<string, string>();
          for (const d of snap.docs) {
            let body: unknown;
            try { body = d.data(); } catch { body = null; }
            const why = validate(c, body);
            if (why) skipped.set(d.id, why); else good.set(d.id, body as Body);
          }
          /* keep optimistic bodies for docs with writes still in flight */
          const prev = docsOf(c);
          for (const [key, n] of inFlight) {
            const [pc, pid = ''] = key.split('/');
            const optimistic = prev.get(pid);
            if (pc === c && n > 0 && optimistic && !good.has(pid) && !skipped.has(pid)) good.set(pid, optimistic);
          }
          raw.set(c, good); bad.set(c, skipped);
          if (skipped.size) warn(`[lifeboard] skipped ${String(skipped.size)} invalid ${c} doc(s):`, Object.fromEntries(skipped));
          state.got.add(c);
          if (state.got.size === STORE_COLLECTIONS.length && (state.status === 'loading' || state.status === 'slow')) { clearTimeout(timer); state.status = 'ready'; }
          onChange();
        }, (e) => { clearTimeout(timer); state.status = 'error'; state.err = e?.code; onChange(); });
      }
    }).catch(noDb);
  }

  /* reads: valid docs only */
  const all = <C extends StoreCollection>(c: C): StoredDoc<C>[] => [...docsOf(c)].map(([id, b]) => ({ id, ...b }) as StoredDoc<C>);
  const get = <C extends StoreCollection>(c: C, id: string): StoredDoc<C> | null => {
    const b = docsOf(c).get(id);
    return b ? ({ id, ...b } as StoredDoc<C>) : null;
  };
  /** Invalid docs the listeners left out: total and per collection. */
  const skipped = (): { n: number; by: Partial<Record<StoreCollection, number>> } => {
    const by: Partial<Record<StoreCollection, number>> = {};
    let n = 0;
    for (const [c, m] of bad) if (m.size) { by[c] = m.size; n += m.size; }
    return { n, by };
  };

  /* writes */
  const chains = new Map<string, Promise<unknown>>(); /* per-doc promise chain */
  const inFlight = new Map<string, number>(); /* per-doc writes not yet settled */
  function queue<T>(c: StoreCollection, id: string, write: () => Promise<T>): Promise<T> {
    const key = c + '/' + id;
    inFlight.set(key, (inFlight.get(key) ?? 0) + 1);
    const p = (chains.get(key) ?? Promise.resolve()).catch(() => undefined).then(write);
    const settle = (): void => {
      const left = (inFlight.get(key) ?? 1) - 1;
      if (left) { inFlight.set(key, left); return; }
      inFlight.delete(key);
      if (chains.get(key) === tail) chains.delete(key);
    };
    const tail = p.then((v) => { settle(); return v; }, (e: unknown) => { settle(); throw e; });
    chains.set(key, tail);
    return tail;
  }
  const requireDb = (): DbAdapter => {
    if (!db) throw new Error('db not connected');
    return db;
  };
  const newId = (c: StoreCollection): string => (db ? db.collection(c).doc().id : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  function rollback(c: StoreCollection, id: string, before: Body | null): void {
    if (before === null) docsOf(c).delete(id); else docsOf(c).set(id, before);
    onChange();
  }
  const note = (rec: UndoRecord | undefined, c: StoreCollection, id: string, before: Body | null): void => {
    if (rec && !rec.some((r) => r.c === c && r.id === id)) rec.push({ c, id, before: clone(before) });
  };
  const invalid = (c: StoreCollection, body: unknown): InvalidDocError | null => {
    const why = validate(c, body);
    return why ? new InvalidDocError(`${c}: ${why}`) : null;
  };

  /** Adds a doc (stamping created_at if missing). Resolves to its id. */
  function create<C extends StoreCollection>(c: C, body: Partial<CollectionDoc<C>>, rec?: UndoRecord, id?: string): Promise<string> {
    const docId = id ?? newId(c);
    const full: Body = { ...body, created_at: (body as Body)['created_at'] ?? Date.now() };
    const err = invalid(c, full);
    if (err) return Promise.reject(err);
    note(rec, c, docId, null);
    docsOf(c).set(docId, full); onChange();
    return queue(c, docId, () => requireDb().collection(c).doc(docId).set(full)).then(() => docId, (e: unknown) => { rollback(c, docId, null); throw e; });
  }
  /** Replaces a doc whole. */
  function put<C extends StoreCollection>(c: C, id: string, body: CollectionDoc<C> | Body, rec?: UndoRecord): Promise<unknown> {
    const err = invalid(c, body);
    if (err) return Promise.reject(err);
    const cur = docsOf(c).get(id);
    const before = cur ? clone(cur) : null;
    note(rec, c, id, before);
    docsOf(c).set(id, clone(body as Body)); onChange();
    return queue(c, id, () => requireDb().collection(c).doc(id).set(body)).catch((e: unknown) => { rollback(c, id, before); throw e; });
  }
  /** Merges into the loaded doc. A patch carrying an object (recurrence_rule) is written whole with set,
      because the db's update merges nested objects and would leave stale rule keys behind. */
  function patch<C extends StoreCollection>(c: C, id: string, changes: Partial<CollectionDoc<C>> | Body, rec?: UndoRecord): Promise<unknown> {
    const cur = docsOf(c).get(id);
    if (!cur) return Promise.reject(new InvalidDocError(`${c}/${id} is not loaded`));
    const p = changes as Body;
    const next: Body = { ...cur, ...p };
    if (!Object.keys(p).some((k) => JSON.stringify(cur[k]) !== JSON.stringify(p[k]))) return Promise.resolve();
    const err = invalid(c, next);
    if (err) return Promise.reject(err);
    const before = clone(cur);
    note(rec, c, id, before);
    docsOf(c).set(id, next); onChange();
    const whole = Object.values(p).some(isPlainObject);
    return queue(c, id, () => {
      const ref = requireDb().collection(c).doc(id);
      return whole ? ref.set(next) : ref.update(p);
    }).catch((e: unknown) => { rollback(c, id, before); throw e; });
  }
  function remove(c: StoreCollection, id: string, rec?: UndoRecord): Promise<unknown> {
    const cur = docsOf(c).get(id);
    const before = cur ? clone(cur) : null;
    note(rec, c, id, before);
    docsOf(c).delete(id); onChange();
    return queue(c, id, () => requireDb().collection(c).doc(id).delete()).catch((e: unknown) => { rollback(c, id, before); throw e; });
  }
  /** Puts every recorded doc back the way it was, newest first. */
  function undo(rec: UndoRecord): Promise<unknown[]> {
    return Promise.all(rec.slice().reverse().map(({ c, id, before }) => (before ? put(c, id, before) : remove(c, id))));
  }

  return {
    COLS: STORE_COLLECTIONS,
    start, all, get, skipped, create, put, patch, remove, undo, newId,
    state,
    /** True once connected to a db. */
    get ready(): boolean { return !!db; },
  };
}
export type Store = ReturnType<typeof createStore>;
