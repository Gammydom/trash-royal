// Trash Royal - online play. Phones talk straight to each other using PeerJS
// (a free public matchmaking server only introduces them).
// When that direct link can't get through (e.g. two different networks), the same messages go through
// a Supabase Realtime relay instead: every online player listens on their own "inbox" channel there.
const Net = (() => {
  const PREFIX = 'trashroyal-v1-';
  let peer = null, myName = '', ready = false;
  const handlers = {};
  const online = {};          // name -> true/false
  const infos = {};           // name -> {arena}
  let myInfo = {}, fighting = false;   // fighting: in any battle (CPU or friend), shown as "In fight" to friends
  let matchConn = null;

  function idFor(name) { return PREFIX + name.toLowerCase(); }
  const testRelayOnly = /[?&]relay=1/.test(location.search);   // test switch: skip the direct link to try the relay

  // ---------------- the relay (Supabase Realtime broadcast) ----------------
  // A relay connection acts like a PeerJS connection: send(), on('data'|'close'|'open'|'error'), close(), .open
  const hasAcct = () => typeof Account !== 'undefined' && !!Account.client;   // (Account is a top-level const, so it isn't on window)
  const sbc = () => hasAcct() ? Account.client() : null;
  function relayConn(room) {
    const sb = sbc(); if (!sb) return null;
    const h = {}, fire = (ev, a) => (h[ev] || []).forEach(f => { try { f(a); } catch (e) { console.error(e); } });
    let done = false;
    const ch = sb.channel('trm-' + room, { config: { broadcast: { self: false, ack: false } } });
    const conn = {
      open: false, relay: true,
      on(ev, f) { (h[ev] = h[ev] || []).push(f); },
      send(m) { if (conn.open) { try { ch.send({ type: 'broadcast', event: 'm', payload: m }); } catch (e) {} } },
      close() { if (done) return; try { ch.send({ type: 'broadcast', event: 'x', payload: {} }); } catch (e) {} finish(); },
    };
    function finish() { if (done) return; done = true; conn.open = false; setTimeout(() => { try { sb.removeChannel(ch); } catch (e) {} }, 400); fire('close'); }
    ch.on('broadcast', { event: 'm' }, ({ payload }) => fire('data', payload));
    ch.on('broadcast', { event: 'x' }, () => finish());
    conn.ready = new Promise(res => {
      const t = setTimeout(() => res(false), 8000);
      ch.subscribe(st => {
        if (st === 'SUBSCRIBED') { clearTimeout(t); conn.open = true; fire('open'); res(true); }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') { clearTimeout(t); if (conn.open) finish(); res(false); }
      });
    });
    return conn;
  }
  // your inbox: other players "knock" here with a room name, then you both meet in that room
  let inbox = null, inboxFor = '';
  async function listenRelay(name) {
    const key = name.toLowerCase();
    if (inboxFor === key && inbox) return;
    stopRelay();
    if (hasAcct()) await Account.whenReady();
    const sb = sbc(); if (!sb || myName.toLowerCase() !== key) return;
    inboxFor = key;
    inbox = sb.channel('tri-' + key, { config: { broadcast: { self: false } } });
    inbox.on('broadcast', { event: 'knock' }, async ({ payload }) => {
      if (!payload || typeof payload.room !== 'string' || !/^[a-z0-9]{8,40}$/.test(payload.room)) return;
      const conn = relayConn(payload.room); if (!conn) return;
      if (!(await conn.ready)) return;
      wire(conn);
      conn.send({ t: '__hi', from: myName });
    });
    inbox.subscribe();
  }
  function stopRelay() { const sb = sbc(); if (inbox && sb) { try { sb.removeChannel(inbox); } catch (e) {} } inbox = null; inboxFor = ''; }
  // knock on someone's inbox and wait for them to join the room: a connection, or null
  async function relayConnect(key, timeoutMs = 6000) {
    const sb = sbc(); if (!sb) return null;
    const room = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24);
    const conn = relayConn(room); if (!conn) return null;
    if (!(await conn.ready)) { conn.close(); return null; }
    const hi = new Promise(res => { conn.on('data', m => { if (m && m.t === '__hi') res(true); }); setTimeout(() => res(false), timeoutMs); });
    const door = sb.channel('tri-' + key, { config: { broadcast: { self: false } } });
    const knocked = await new Promise(res => {
      const t = setTimeout(() => res(false), 5000);
      door.subscribe(st => { if (st === 'SUBSCRIBED') { clearTimeout(t); door.send({ type: 'broadcast', event: 'knock', payload: { from: myName, room } }).then(() => res(true), () => res(false)); } });
    });
    setTimeout(() => { try { sb.removeChannel(door); } catch (e) {} }, 1500);
    if (!knocked || !(await hi)) { conn.close(); return null; }
    wire(conn);
    return conn;
  }
  function emit(ev, ...args) { (handlers[ev] || []).forEach(f => { try { f(...args); } catch (e) { console.error(e); } }); }
  function on(ev, f) { (handlers[ev] = handlers[ev] || []).push(f); }

  function start(name) {
    return new Promise((resolve) => {
      if (typeof Peer === 'undefined') { resolve({ ok: false, why: 'offline' }); return; }
      stop();
      myName = name;
      listenRelay(name);
      let settled = false;
      const done = r => { if (!settled) { settled = true; resolve(r); } };
      try { peer = new Peer(idFor(name), { debug: 0 }); }
      catch (e) { done({ ok: false, why: 'offline' }); return; }
      peer.on('open', () => { ready = true; emit('status', true); done({ ok: true }); });
      peer.on('error', err => {
        const t = err && err.type;
        if (t === 'unavailable-id') { done({ ok: false, why: 'taken' }); return; }
        if (t === 'peer-unavailable') {
          const m = /trashroyal-v1-([a-z0-9_-]+)/.exec(err.message || '');
          if (m) { online[m[1]] = false; emit('presence'); emit('unreachable', m[1]); }
          return;
        }
        if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'browser-incompatible') {
          ready = false; emit('status', false); done({ ok: false, why: 'offline' });
        }
      });
      peer.on('disconnected', () => { ready = false; emit('status', false); setTimeout(() => { try { if (peer && !peer.destroyed) peer.reconnect(); } catch (e) {} }, 2000); });
      peer.on('connection', conn => wire(conn));
      setTimeout(() => done({ ok: false, why: 'offline' }), 12000);
    });
  }
  function stop() { if (peer) { try { peer.destroy(); } catch (e) {} } peer = null; ready = false; stopRelay(); }

  function wire(conn) {
    conn.on('data', msg => {
      if (!msg || typeof msg !== 'object') return;
      const from = String(msg.from || '').slice(0, 16);
      switch (msg.t) {
        case 'ping': conn.send({ t: 'pong', from: myName, info: Object.assign({}, myInfo, { fight: fighting || !!matchConn }) }); setTimeout(() => conn.close(), 500); break;
        // friend request: the game answers right away with ok (already friends / you both added each other), wait (it's in their inbox) or no (they declined)
        case 'friend': {
          let r = 'wait';
          emit('friendRequest', from, !!msg.fresh, v => { r = v; });
          try { conn.send({ t: 'freply', from: myName, r }); } catch (e) {}
          setTimeout(() => conn.close(), 500); break;
        }
        case 'friendOk': emit('friendOk', from); setTimeout(() => conn.close(), 500); break;
        case 'challenge': emit('challenge', from, conn, msg); break;
        default: if (conn === matchConn) emit('match', msg);
      }
    });
    conn.on('close', () => { if (conn === matchConn) { matchConn = null; emit('matchClosed'); } });
    conn.on('error', () => {});
  }

  async function connect(name, timeoutMs = 5000) {
    const key = name.toLowerCase();
    const direct = testRelayOnly ? null : await connectId(idFor(key), timeoutMs);
    return direct || relayConnect(key);
  }
  // connect to any online ID (a player, or the leaderboard keeper)
  function connectId(id, timeoutMs = 7000) {
    return new Promise(resolve => {
      if (!peer || !ready) { resolve(null); return; }
      const key = id.slice(PREFIX.length);
      let conn;
      try { conn = peer.connect(id, { serialization: 'json', reliable: true }); } catch (e) { resolve(null); return; }
      if (!conn) { resolve(null); return; }
      let done = false;
      const fin = v => { if (!done) { done = true; off(); resolve(v); } };
      const unr = n => { if (n === key) fin(null); };
      on('unreachable', unr);
      const off = () => { const a = handlers.unreachable; if (a) a.splice(a.indexOf(unr), 1); };
      conn.on('open', () => { wire(conn); fin(conn); });
      conn.on('error', () => fin(null));
      setTimeout(() => { if (!done) { try { conn.close(); } catch (e) {} fin(null); } }, timeoutMs);
    });
  }

  async function ping(name) {
    const key = name.toLowerCase();
    const conn = await connect(key, 6000);
    if (!conn) { online[key] = false; emit('presence'); return false; }
    return new Promise(resolve => {
      const t = setTimeout(() => { online[key] = false; emit('presence'); resolve(false); try { conn.close(); } catch (e) {} }, 4000);
      conn.on('data', m => { if (m && m.t === 'pong') { clearTimeout(t); online[key] = true; if (m.info && typeof m.info === 'object') infos[key] = { arena: +m.info.arena || 0, fight: !!m.info.fight, wins: m.info.wins == null ? null : (+m.info.wins || 0) }; emit('presence'); resolve(true); } });
      conn.send({ t: 'ping', from: myName });
    });
  }
  // sends a friend request; resolves 'ok' | 'wait' | 'no', or null if their game isn't open
  async function sendFriend(name, fresh) {
    const conn = await connect(name, 6000);
    if (!conn) return null;
    return new Promise(resolve => {
      const t = setTimeout(() => { resolve('wait'); try { conn.close(); } catch (e) {} }, 4000);
      conn.on('data', m => {
        if (m && m.t === 'freply') { clearTimeout(t); resolve(m.r === 'ok' || m.r === 'no' ? m.r : 'wait'); setTimeout(() => { try { conn.close(); } catch (e) {} }, 300); }
        else if (m && m.t === 'ok') { clearTimeout(t); resolve('wait'); }   // an older version of the game
      });
      conn.send({ t: 'friend', from: myName, fresh: !!fresh });
    });
  }
  // tells someone you accepted their request (if their game is closed, their next re-send finds out instead)
  async function sendFriendOk(name) {
    const conn = await connect(name, 6000);
    if (!conn) return false;
    conn.send({ t: 'friendOk', from: myName });
    setTimeout(() => { try { conn.close(); } catch (e) {} }, 2000);
    return true;
  }
  // challenger side
  async function challenge(name, deck, extra = {}) {
    const conn = await connect(name);
    if (!conn) return { ok: false, why: 'offline' };
    return new Promise(resolve => {
      let done = false;
      const fin = r => { if (!done) { done = true; resolve(r); } };
      conn.on('data', m => {
        if (!m) return;
        if (m.t === 'accept') { matchConn = conn; fin({ ok: true, conn, deck: m.deck, levels: m.levels, boss: m.boss }); }
        if (m.t === 'decline') { fin({ ok: false, why: 'declined' }); setTimeout(() => conn.close(), 300); }
        if (m.t === 'busy') { fin({ ok: false, why: 'busy' }); }
        if (m.t === 'version') { fin({ ok: false, why: 'version', ver: m.ver }); setTimeout(() => conn.close(), 300); }
      });
      conn.on('close', () => fin({ ok: false, why: 'closed' }));
      conn.send(Object.assign({ t: 'challenge', from: myName, deck }, extra));
      Net._pending = conn;
      setTimeout(() => { fin({ ok: false, why: 'timeout' }); }, 30000);
    });
  }
  function cancelChallenge() { if (Net._pending) { try { Net._pending.close(); } catch (e) {} Net._pending = null; } }
  function accept(conn, deck, extra = {}) { matchConn = conn; conn.send(Object.assign({ t: 'accept', from: myName, deck }, extra)); }
  function decline(conn, why = 'decline', extra = {}) { try { conn.send(Object.assign({ t: why, from: myName }, extra)); setTimeout(() => conn.close(), 400); } catch (e) {} }
  function send(msg) { if (matchConn && matchConn.open) { try { matchConn.send(msg); } catch (e) {} } }
  function leaveMatch() { if (matchConn) { const c = matchConn; matchConn = null; try { c.send({ t: 'quit' }); } catch (e) {} setTimeout(() => { try { c.close(); } catch (e) {} }, 300); } }

  return { relayState: () => ({ inboxFor, inbox: inbox ? inbox.state : null, myName }), start, stop, on, ping, connectId, sendFriend, sendFriendOk, challenge, cancelChallenge, accept, decline, send, leaveMatch,
    isReady: () => ready, isOnline: n => online[n.toLowerCase()], info: n => infos[n.toLowerCase()], setInfo: o => { myInfo = o; }, setFighting: v => { fighting = !!v; }, inMatch: () => !!matchConn, name: () => myName };
})();
