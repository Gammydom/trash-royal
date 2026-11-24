// Trash Royal - online play. Phones talk straight to each other using PeerJS
// (a free public matchmaking server only introduces them).
const Net = (() => {
  const PREFIX = 'trashroyal-v1-';
  let peer = null, myName = '', ready = false;
  const handlers = {};
  const online = {};          // name -> true/false
  const infos = {};           // name -> {arena}
  let myInfo = {}, fighting = false;   // fighting: in any battle (CPU or friend), shown as "In fight" to friends
  let matchConn = null;

  function idFor(name) { return PREFIX + name.toLowerCase(); }
  function emit(ev, ...args) { (handlers[ev] || []).forEach(f => { try { f(...args); } catch (e) { console.error(e); } }); }
  function on(ev, f) { (handlers[ev] = handlers[ev] || []).push(f); }

  function start(name) {
    return new Promise((resolve) => {
      if (typeof Peer === 'undefined') { resolve({ ok: false, why: 'offline' }); return; }
      stop();
      myName = name;
      let settled = false;
      const done = r => { if (!settled) { settled = true; resolve(r); } };
      try { peer = new Peer(idFor(name), { debug: 0 }); }
      catch (e) { done({ ok: false, why: 'offline' }); return; }
      peer.on('open', () => { ready = true; emit('status', true); done({ ok: true }); });
      peer.on('error', err => {
        const t = err && err.type;
        if (t === 'unavailable-id') { done({ ok: false, why: 'taken' }); return; }
        if (t === 'peer-unavailable') {
          const m = /trashroyal-v1-([a-z0-9_]+)/.exec(err.message || '');
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
  function stop() { if (peer) { try { peer.destroy(); } catch (e) {} } peer = null; ready = false; }

  function wire(conn) {
    conn.on('data', msg => {
      if (!msg || typeof msg !== 'object') return;
      const from = String(msg.from || '').slice(0, 16);
      switch (msg.t) {
        case 'ping': conn.send({ t: 'pong', from: myName, info: Object.assign({}, myInfo, { fight: fighting || !!matchConn }) }); setTimeout(() => conn.close(), 500); break;
        case 'friend': emit('friendRequest', from); conn.send({ t: 'ok' }); setTimeout(() => conn.close(), 500); break;
        case 'challenge': emit('challenge', from, conn, msg); break;
        default: if (conn === matchConn) emit('match', msg);
      }
    });
    conn.on('close', () => { if (conn === matchConn) { matchConn = null; emit('matchClosed'); } });
    conn.on('error', () => {});
  }

  function connect(name, timeoutMs = 7000) {
    return new Promise(resolve => {
      if (!peer || !ready) { resolve(null); return; }
      const key = name.toLowerCase();
      let conn;
      try { conn = peer.connect(idFor(key), { serialization: 'json', reliable: true }); } catch (e) { resolve(null); return; }
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
      conn.on('data', m => { if (m && m.t === 'pong') { clearTimeout(t); online[key] = true; if (m.info && typeof m.info === 'object') infos[key] = { arena: +m.info.arena || 0, fight: !!m.info.fight }; emit('presence'); resolve(true); } });
      conn.send({ t: 'ping', from: myName });
    });
  }
  async function sendFriend(name) {
    const conn = await connect(name);
    if (!conn) return false;
    conn.send({ t: 'friend', from: myName });
    setTimeout(() => { try { conn.close(); } catch (e) {} }, 3000);
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
      });
      conn.on('close', () => fin({ ok: false, why: 'closed' }));
      conn.send(Object.assign({ t: 'challenge', from: myName, deck }, extra));
      Net._pending = conn;
      setTimeout(() => { fin({ ok: false, why: 'timeout' }); }, 30000);
    });
  }
  function cancelChallenge() { if (Net._pending) { try { Net._pending.close(); } catch (e) {} Net._pending = null; } }
  function accept(conn, deck, extra = {}) { matchConn = conn; conn.send(Object.assign({ t: 'accept', from: myName, deck }, extra)); }
  function decline(conn, why = 'decline') { try { conn.send({ t: why, from: myName }); setTimeout(() => conn.close(), 400); } catch (e) {} }
  function send(msg) { if (matchConn && matchConn.open) { try { matchConn.send(msg); } catch (e) {} } }
  function leaveMatch() { if (matchConn) { const c = matchConn; matchConn = null; try { c.send({ t: 'quit' }); } catch (e) {} setTimeout(() => { try { c.close(); } catch (e) {} }, 300); } }

  return { start, stop, on, ping, sendFriend, challenge, cancelChallenge, accept, decline, send, leaveMatch,
    isReady: () => ready, isOnline: n => online[n.toLowerCase()], info: n => infos[n.toLowerCase()], setInfo: o => { myInfo = o; }, setFighting: v => { fighting = !!v; }, inMatch: () => !!matchConn, name: () => myName };
})();
