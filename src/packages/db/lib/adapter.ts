/* The artifact db as the page gets it from `window.claude.use('db')`: the only boundary the store talks through.
   The fake (fake-db.ts) implements the same shape in memory. */

export interface DbSnapshotDoc {
  readonly id: string;
  data(): unknown;
}
export interface DbSnapshot {
  readonly docs: readonly DbSnapshotDoc[];
}
export interface DbDocRef {
  readonly id: string;
  set(body: object): Promise<unknown>;
  /** Merge into the stored doc; nested objects merge key by key. */
  update(patch: object): Promise<unknown>;
  delete(): Promise<unknown>;
}
export interface DbCollectionRef {
  /** No id: a fresh id the db picks. */
  doc(id?: string): DbDocRef;
  /** Calls `next` with every doc now and after each change. */
  onSnapshot(next: (snap: DbSnapshot) => void, error?: (err: { code?: string } | undefined) => void): unknown;
}
export interface DbAdapter {
  collection(name: string): DbCollectionRef;
}
