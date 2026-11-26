// Trash Royal - the Everyone leaderboard, passed along between players (no server, no accounts).
// Every game keeps a small copy of the board. One online game at a time is the "board keeper"
// (a hidden online ID that no username can take, because usernames can't have a "-").
// The others send it their copy about once a minute and get the merged board back.
// When the keeper closes, the next online game takes over. Newest numbers win for each player.
const Board = (() => {
  const KEEPER = 'trashroyal-v1-board-keeper-2';   // "-2": the fresh start on Nov 26 2026 began a brand-new board
  const MAX = 500;                 // the board keeps the best 500 players
  const SYNC_MS = 60000;
  let store = null, getMe = null, isBusy = () => false;
  let copy = {};                   // deviceId -> { id, name, arena, wins, t }
  let myId = '', keeper = null, amKeeper = false, syncing = false, lastSync = 0, timer = 0;
  const listeners = [];

  const okId = s => typeof s === 'string' && /^[A-Za-z0-9-]{8,40}$/.test(s);
  const okName = s => typeof s === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(s);
  function clean(e) {
    if (!e || typeof e !== 'object' || !okId(e.id) || !okName(e.name)) return null;
    const arena = e.arena | 0, wins = e.wins | 0, t = +e.t || 0;
    if (arena < 0 || arena > 6 || wins < 0 || wins > 100000 || t <= 0 || t > Date.now() + 86400000) return null;
    return { id: e.id, name: e.name, arena, wins, t };
  }
  const better = (a, b) => (b.arena - a.arena) || (b.wins - a.wins) || (a.t - b.t);
  // folds a list of entries into our copy; returns true if anything changed
  function merge(list) {
    if (!Array.isArray(list)) return false;
    let changed = false;
    for (const raw of list.slice(0, MAX * 2)) {
      const e = clean(raw); if (!e) continue;
      if (e.id === myId) continue;              // nobody else gets to change our own row
      const cur = copy[e.id];
      if (!cur || e.t > cur.t) { copy[e.id] = e; changed = true; }
    }
    if (changed) trim();
    return changed;
  }
  function trim() {
    const all = Object.values(copy);
    if (all.length <= MAX) return;
    const keep = all.sort(better).slice(0, MAX);
    copy = {}; keep.forEach(e => copy[e.id] = e);
    const me = mine(); if (me) copy[myId] = me;
  }
  function save() { store.set('boardCopy', Object.values(copy)); listeners.forEach(f => { try { f(); } catch (e) {} }); }
  function mine() {
    const m = getMe(); if (!m || !okName(m.name)) return null;
    const cur = copy[myId];
    if (cur && cur.name === m.name && cur.arena === m.arena && cur.wins === m.wins) return cur;
    return { id: myId, name: m.name, arena: m.arena | 0, wins: m.wins | 0, t: Date.now() };
  }
  // call after your name, arena or wins change
  function touch() {
    const me = mine(); if (!me) return;
    if (copy[myId] !== me) { copy[myId] = me; save(); setTimeout(sync, 1500); }
  }

  // ---- the board keeper ----
  function tryKeeper() {
    if (amKeeper || keeper || typeof Peer === 'undefined' || !Net.isReady()) return;
    let p;
    try { p = new Peer(KEEPER, { debug: 0 }); } catch (e) { return; }
    keeper = p;
    p.on('open', () => { amKeeper = true; });
    setTimeout(() => { if (keeper === p && !amKeeper) dropKeeper(); }, 15000);
    p.on('connection', conn => {
      conn.on('data', m => {
        if (!m || m.t !== 'bsync') return;
        if (merge(m.board)) save();
        try { conn.send({ t: 'bboard', board: Object.values(copy) }); } catch (e) {}
        setTimeout(() => { try { conn.close(); } catch (e) {} }, 1500);
      });
      conn.on('error', () => {});
    });
    p.on('error', err => { if (err && (err.type === 'unavailable-id' || err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error')) dropKeeper(); });
    p.on('disconnected', dropKeeper);
    p.on('close', dropKeeper);
  }
  function dropKeeper() { const p = keeper; keeper = null; amKeeper = false; if (p) { try { p.destroy(); } catch (e) {} } }

  // ---- send our copy to the keeper and take back the merged board ----
  async function sync() {
    if (syncing || !Net.isReady() || isBusy()) return;
    touch();
    if (amKeeper) { lastSync = Date.now(); return; }
    syncing = true;
    try {
      const conn = await Net.connectId(KEEPER, 6000);
      if (!conn) { tryKeeper(); return; }          // nobody is keeping the board right now: we will
      await new Promise(res => {
        const t = setTimeout(res, 5000);
        conn.on('data', m => {
          if (!m || m.t !== 'bboard') return;
          clearTimeout(t);
          if (merge(m.board)) save();
          lastSync = Date.now(); res();
        });
        conn.send({ t: 'bsync', board: Object.values(copy) });
      });
      try { conn.close(); } catch (e) {}
    } finally { syncing = false; }
  }

  function start(st, me, busy) {
    store = st; getMe = me; if (busy) isBusy = busy;
    myId = store.get('deviceId', '');
    if (!okId(myId)) { myId = (crypto.randomUUID ? crypto.randomUUID() : 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36)); store.set('deviceId', myId); }
    (store.get('boardCopy', []) || []).forEach(raw => { const e = clean(raw); if (e) copy[e.id] = e; });
    Net.on('status', on => { if (on) setTimeout(sync, 2000 + Math.random() * 2000); else dropKeeper(); });
    clearInterval(timer);
    timer = setInterval(() => { if (!amKeeper && !keeper) tryKeeper(); sync(); }, SYNC_MS + Math.random() * 10000);
  }

  // the board, best first, one row per name (the newest one if a name shows up twice)
  function list() {
    const byName = {};
    for (const e of Object.values(copy)) { const k = e.name.toLowerCase(); if (!byName[k] || e.t > byName[k].t) byName[k] = e; }
    return Object.values(byName).sort(better);
  }
  const byName = n => list().find(e => e.name.toLowerCase() === String(n).toLowerCase());
  function rank() { const l = list(), i = l.findIndex(e => e.id === myId); return i < 0 ? 0 : i + 1; }

  return { start, touch, sync, list, byName, rank, onChange: f => listeners.push(f), isKeeper: () => amKeeper, lastSync: () => lastSync, myId: () => myId };
})();
