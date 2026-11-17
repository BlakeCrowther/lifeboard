/* lifeboard: data layer over the artifact db. One live listener per collection, validated on load,
   optimistic local writes (reverted if the store refuses), one write at a time per document. */
(function (G) {
  const COLS = ['tasks', 'habits', 'habit_sessions', 'groceries', 'recipes', 'list_items', 'buy_list_items', 'gift_ideas', 'goals', 'logs', 'checks', 'snapshots', 'countdowns'];
  const V = G.LBS.validate;
  const RAW = {}; /* col -> Map(id -> body), valid docs only */
  const BAD = {}; /* col -> Map(id -> reason) */
  COLS.forEach((c) => { RAW[c] = new Map(); BAD[c] = new Map(); });
  const st = { status: 'loading', err: null, got: new Set() };
  let DB = null, onChange = () => {}, onError = () => {};
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

  function start(cb, errCb) {
    onChange = cb; onError = errCb || onError;
    const timer = setTimeout(() => { if (st.status === 'loading') { st.status = 'slow'; onChange(); } }, 10000);
    const use = G.claude && G.claude.use;
    if (!use) { clearTimeout(timer); st.status = 'nodb'; onChange(); return; }
    Promise.resolve().then(() => G.claude.use('db')).then((db) => {
      if (!db) { clearTimeout(timer); st.status = 'nodb'; onChange(); return; }
      DB = db;
      COLS.forEach((c) => {
        db.collection(c).onSnapshot((snap) => {
          const m = new Map(), bad = new Map();
          snap.docs.forEach((d) => {
            let body; try { body = d.data(); } catch (e) { body = null; }
            const why = V(c, body);
            if (why) bad.set(d.id, why); else m.set(d.id, body);
          });
          /* keep optimistic bodies for docs with writes still in flight */
          PEND.forEach((n, key) => { const [pc, pid] = key.split('/'); if (pc === c && n > 0 && RAW[c].has(pid) && !m.has(pid) && !bad.has(pid)) m.set(pid, RAW[c].get(pid)); });
          RAW[c] = m; BAD[c] = bad;
          if (bad.size) console.warn(`[lifeboard] skipped ${bad.size} invalid ${c} doc(s):`, Object.fromEntries(bad));
          st.got.add(c);
          if (st.got.size === COLS.length && (st.status === 'loading' || st.status === 'slow')) { clearTimeout(timer); st.status = 'ready'; }
          onChange();
        }, (e) => { clearTimeout(timer); st.status = 'error'; st.err = e && e.code; onChange(); });
      });
    }).catch(() => { clearTimeout(timer); st.status = 'nodb'; onChange(); });
  }

  /* reads: arrays of {id, ...body}, valid docs only */
  const all = (c) => [...RAW[c].entries()].map(([id, b]) => ({ id, ...b }));
  const get = (c, id) => { const b = RAW[c].get(id); return b ? { id, ...b } : null; };
  const skipped = () => { const o = {}; let n = 0; COLS.forEach((c) => { if (BAD[c].size) { o[c] = BAD[c].size; n += BAD[c].size; } }); return { n, by: o }; };

  /* writes */
  const Q = new Map(); /* per-doc promise chain */
  const PEND = new Map(); /* per-doc in-flight count */
  class Invalid extends Error { constructor(m) { super(m); this.code = 'invalid_doc'; } }
  function queue(c, id, fn) {
    const key = c + '/' + id;
    PEND.set(key, (PEND.get(key) || 0) + 1);
    const p = (Q.get(key) || Promise.resolve()).catch(() => {}).then(fn);
    const done = () => { PEND.set(key, PEND.get(key) - 1); if (!PEND.get(key)) { PEND.delete(key); if (Q.get(key) === tail) Q.delete(key); } };
    const tail = p.then(done, (e) => { done(); throw e; });
    Q.set(key, tail);
    return tail;
  }
  const newId = (c) => (DB ? DB.collection(c).doc().id : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const isPlainObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  function fail(c, id, before, e) {
    if (before === undefined) return;
    if (before === null) RAW[c].delete(id); else RAW[c].set(id, before);
    onChange();
  }
  /* rec: optional undo recorder (array); gets {c,id,before} for the first touch of each doc */
  const note = (rec, c, id, before) => { if (rec && !rec.some((r) => r.c === c && r.id === id)) rec.push({ c, id, before: clone(before) }); };

  function create(c, body, rec, id) {
    id = id || newId(c);
    const full = { ...body, created_at: body.created_at ?? Date.now() };
    const why = V(c, full);
    if (why) return Promise.reject(new Invalid(`${c}: ${why}`));
    note(rec, c, id, null);
    RAW[c].set(id, full); onChange();
    return queue(c, id, () => DB.collection(c).doc(id).set(full)).then(() => id, (e) => { fail(c, id, null, e); throw e; });
  }
  function put(c, id, body, rec) {
    const why = V(c, body);
    if (why) return Promise.reject(new Invalid(`${c}: ${why}`));
    const before = RAW[c].has(id) ? clone(RAW[c].get(id)) : null;
    note(rec, c, id, before);
    RAW[c].set(id, clone(body)); onChange();
    return queue(c, id, () => DB.collection(c).doc(id).set(body)).catch((e) => { fail(c, id, before, e); throw e; });
  }
  /* patch: merge into the current doc. A patch that carries an object (recurrence_rule) is written whole with set,
     because update() merges nested objects and would leave stale rule keys behind. */
  function patch(c, id, p, rec) {
    const cur = RAW[c].get(id);
    if (!cur) return Promise.reject(new Invalid(`${c}/${id} is not loaded`));
    const next = { ...cur, ...p };
    const changed = Object.keys(p).some((k) => JSON.stringify(cur[k]) !== JSON.stringify(p[k]));
    if (!changed) return Promise.resolve();
    const why = V(c, next);
    if (why) return Promise.reject(new Invalid(`${c}: ${why}`));
    const before = clone(cur);
    note(rec, c, id, before);
    RAW[c].set(id, next); onChange();
    const whole = Object.values(p).some(isPlainObj);
    return queue(c, id, () => (whole ? DB.collection(c).doc(id).set(next) : DB.collection(c).doc(id).update(p))).catch((e) => { fail(c, id, before, e); throw e; });
  }
  function remove(c, id, rec) {
    const before = RAW[c].has(id) ? clone(RAW[c].get(id)) : null;
    note(rec, c, id, before);
    RAW[c].delete(id); onChange();
    return queue(c, id, () => DB.collection(c).doc(id).delete()).catch((e) => { fail(c, id, before, e); throw e; });
  }
  /* put every recorded doc back the way it was */
  function undo(rec) {
    return Promise.all(rec.slice().reverse().map(({ c, id, before }) => (before ? put(c, id, before) : remove(c, id))));
  }
  G.LBDB = { COLS, start, all, get, skipped, create, put, patch, remove, undo, newId, state: st, get ready() { return !!DB; } };
})(typeof window !== 'undefined' ? window : globalThis);
