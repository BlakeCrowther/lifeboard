import { describe, expect, it, vi } from 'vitest';
import { createStore, type UndoRecord } from '../index.ts';
import { createFakeDb, type FakeData } from '../fake.ts';

/* A store over a fake db, started and waited until every collection has loaded. */
async function readyStore(seed: FakeData = {}) {
  const db = createFakeDb(seed);
  const store = createStore({ connect: () => Promise.resolve(db), warn: () => undefined });
  const changes = vi.fn();
  store.start(changes);
  await vi.waitFor(() => { expect(store.state.status).toBe('ready'); }, { timeout: 5000 });
  return { db, store, changes };
}

describe('store', () => {
  it('loads valid docs and counts the invalid ones it skipped', async () => {
    const { store } = await readyStore({
      tasks: { t1: { title: 'Water plants', status: 'open' }, t2: { status: 'open' } },
    });
    expect(store.all('tasks')).toEqual([{ id: 't1', title: 'Water plants', status: 'open' }]);
    expect(store.skipped()).toEqual({ n: 1, by: { tasks: 1 } });
  });

  it('says there is no db when connect gives none', () => {
    const store = createStore({ connect: () => null });
    store.start(() => undefined);
    expect(store.state.status).toBe('nodb');
    expect(store.ready).toBe(false);
  });

  it('creates, patches and removes a doc, and the db holds each result', async () => {
    const { db, store } = await readyStore();
    const id = await store.create('buy_list_items', { name: 'Rain jacket', tag: 'need', created_at: 1763700000000 }, undefined, 'b1');
    expect(id).toBe('b1');
    expect(db.data['buy_list_items']).toEqual({ b1: { name: 'Rain jacket', tag: 'need', created_at: 1763700000000 } });

    await store.patch('buy_list_items', 'b1', { status: 'bought' });
    expect(db.data['buy_list_items']).toEqual({ b1: { name: 'Rain jacket', tag: 'need', created_at: 1763700000000, status: 'bought' } });
    expect(store.get('buy_list_items', 'b1')).toEqual({ id: 'b1', name: 'Rain jacket', tag: 'need', created_at: 1763700000000, status: 'bought' });

    await store.remove('buy_list_items', 'b1');
    expect(db.data['buy_list_items']).toEqual({});
    expect(store.get('buy_list_items', 'b1')).toBeNull();
  });

  it('refuses an invalid write without touching local state or the db', async () => {
    const { db, store } = await readyStore({ gift_ideas: { g1: { person: 'Sam', idea: 'Book' } } });
    await expect(store.patch('gift_ideas', 'g1', { status: 'wrapped' })).rejects.toThrow('gift_ideas: bad status');
    expect(store.get('gift_ideas', 'g1')).toEqual({ id: 'g1', person: 'Sam', idea: 'Book' });
    expect(db.data['gift_ideas']).toEqual({ g1: { person: 'Sam', idea: 'Book' } });
  });

  it('shows a write at once, then rolls it back when the db refuses it', async () => {
    const { db, store } = await readyStore({ tasks: { t1: { title: 'Call vet', status: 'open' } } });
    db.failNextWrites(1, 'permission_denied');
    const write = store.patch('tasks', 't1', { status: 'done', completed_at: 1763720000000 });
    expect(store.get('tasks', 't1')).toEqual({ id: 't1', title: 'Call vet', status: 'done', completed_at: 1763720000000 });
    await expect(write).rejects.toMatchObject({ code: 'permission_denied' });
    expect(store.get('tasks', 't1')).toEqual({ id: 't1', title: 'Call vet', status: 'open' });
  });

  it('rolls a refused create back out', async () => {
    const { db, store } = await readyStore();
    db.failNextWrites(1);
    await expect(store.create('habit_sessions', { habit_id: 'run', date: '2026-11-21', created_at: 1763720000000 }, undefined, 's1')).rejects.toThrow('fake db write refused');
    expect(store.all('habit_sessions')).toEqual([]);
  });

  it('undo puts back every doc an action touched', async () => {
    const { db, store } = await readyStore({ tasks: { t1: { title: 'Floss', status: 'open', due_date: '2026-11-21' } } });
    const rec: UndoRecord = [];
    await store.patch('tasks', 't1', { status: 'done' }, rec);
    await store.patch('tasks', 't1', { due_date: '2026-11-22' }, rec);
    await store.create('tasks', { title: 'Floss', status: 'open', created_at: 1763720000000 }, rec, 't2');

    await store.undo(rec);
    expect(db.data['tasks']).toEqual({ t1: { title: 'Floss', status: 'open', due_date: '2026-11-21' } });
    expect(store.all('tasks')).toEqual([{ id: 't1', title: 'Floss', status: 'open', due_date: '2026-11-21' }]);
  });

  it('delivers a change made elsewhere to the listener', async () => {
    const { db, store, changes } = await readyStore();
    const before = changes.mock.calls.length;
    db.remoteWrite('countdowns', 'c1', { kind: 'glance', title: 'Half marathon', date: '2027-03-14' });
    expect(store.all('countdowns')).toEqual([{ id: 'c1', kind: 'glance', title: 'Half marathon', date: '2027-03-14' }]);
    expect(changes.mock.calls.length).toBe(before + 1);
  });

  it('writes a patch carrying a rule whole, so no stale rule keys stay behind', async () => {
    const { db, store } = await readyStore({ tasks: { t1: { title: 'Rent', status: 'open', recurrence_rule: { kind: 'monthly_day', day: 1 } } } });
    await store.patch('tasks', 't1', { recurrence_rule: { kind: 'monthly_last_day' } });
    expect(db.data['tasks']).toEqual({ t1: { title: 'Rent', status: 'open', recurrence_rule: { kind: 'monthly_last_day' } } });
  });
});
