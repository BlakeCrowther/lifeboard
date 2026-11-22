// The store: live, validated collections with optimistic writes and undo, over a DbAdapter.
export {
  InvalidDocError,
  createStore,
  type Store,
  type StoreOptions,
  type StoreState,
  type StoreStatus,
  type StoredDoc,
  type UndoEntry,
  type UndoRecord,
} from './lib/store.ts';
export type { DbAdapter, DbCollectionRef, DbDocRef, DbSnapshot, DbSnapshotDoc } from './lib/adapter.ts';
