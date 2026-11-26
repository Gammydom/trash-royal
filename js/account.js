// Trash Royal - optional login (username + password) so players don't lose their account.
// Accounts live in Erick's Supabase project. The URL + publishable key below are PUBLIC browser
// settings (safe in the game's code). Never put the secret / service_role key here.
// There's no email: each login uses a made-up address "name@players.trashroyal.invalid"
// (".invalid" can never be a real address, so no mail is ever sent anywhere).
const Account = (() => {
  const URL = 'https://miavbfsllxfijtozkyyb.supabase.co';
  const KEY = 'sb_publishable_zERTlcw9KhkfewhZQQ0sQA_PAU0W14j';
  const DOMAIN = '@players.trashroyal.invalid';
  let sb = null, SP = '', session = null, lastSig = '', ready = null;
  const email = name => String(name).toLowerCase() + DOMAIN;
  // keys that stay on this device only: the login itself, when we last synced, and the big shared leaderboard copy
  const deviceOnly = k => /^(auth|cloudAt|boardCopy|fresh)/.test(k);

  function init(prefix) {
    SP = prefix;
    if (ready) return ready;
    ready = (async () => {
      if (!window.supabase || !window.supabase.createClient) return false;
      sb = window.supabase.createClient(URL, KEY, { auth: { storageKey: SP + 'auth', persistSession: true, autoRefreshToken: true }, realtime: { params: { eventsPerSecond: 40 } } });
      const { data } = await sb.auth.getSession();
      session = data && data.session;
      sb.auth.onAuthStateChange((ev, s) => { session = s; });
      return true;
    })().catch(e => { console.warn('account', e); return false; });
    return ready;
  }
  const loggedIn = () => !!session;
  const loginName = () => session ? session.user.email.replace(DOMAIN, '') : '';

  // everything this game keeps in the browser (name, progress, cards, coins, decks, friends...)
  function collect() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SP) && !deviceOnly(k.slice(SP.length))) out[k.slice(SP.length)] = localStorage.getItem(k);
    }
    return out;
  }
  // replaces this device's game data with a saved account
  function apply(data, at) {
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(SP) && !deviceOnly(k.slice(SP.length))) drop.push(k); }
    drop.forEach(k => localStorage.removeItem(k));
    Object.entries(data || {}).forEach(([k, v]) => { if (typeof v === 'string' && !deviceOnly(k)) localStorage.setItem(SP + k, v); });
    if (at) localStorage.setItem(SP + 'cloudAt', at);
  }

  // makes a login for the name you already play with, then saves your game to it
  async function signUp(name, password) {
    if (!(await init(SP))) return { err: 'offline' };
    const { data, error } = await sb.auth.signUp({ email: email(name), password, options: { data: { name } } });
    if (error) {
      const m = error.message || '';
      if (/already registered|already exists/i.test(m)) return { err: 'taken' };
      if (/password/i.test(m)) return { err: 'weak', msg: m };
      return { err: 'other', msg: m };
    }
    if (!data.session) return { err: 'confirm' };      // "Confirm email" is still on in Supabase
    session = data.session;
    const r = await push(true);
    return r === 'ok' ? { ok: true } : { err: 'other', msg: 'Your login was made, but saving your game failed. It will try again.' };
  }

  // logs in and fetches your saved game: { ok, data, at } or { err }
  async function signIn(name, password) {
    if (!(await init(SP))) return { err: 'offline' };
    const { data, error } = await sb.auth.signInWithPassword({ email: email(name), password });
    if (error) {
      const m = error.message || '';
      if (/invalid login/i.test(m)) return { err: 'wrong' };
      if (/not confirmed/i.test(m)) return { err: 'confirm' };
      return { err: 'other', msg: m };
    }
    session = data.session;
    const row = await fetchSave();
    return { ok: true, data: row ? row.data : null, at: row ? row.updated_at : null };
  }
  async function fetchSave() {
    if (!session) return null;
    const { data, error } = await sb.from('saves').select('data, updated_at').eq('owner', session.user.id).maybeSingle();
    if (error) { console.warn('account', error); return null; }
    return data;
  }
  // saves your game online (only when something changed): 'ok' | 'same' | 'off' | 'err'
  async function push(force) {
    if (!session) return 'off';
    const data = collect(), sig = JSON.stringify(data);
    if (!force && sig === lastSig) return 'same';
    const at = new Date().toISOString();
    const { error } = await sb.from('saves').upsert({ owner: session.user.id, name: loginName(), data, updated_at: at }, { onConflict: 'owner' });
    if (error) { console.warn('account', error); return 'err'; }
    lastSig = sig; localStorage.setItem(SP + 'cloudAt', at);
    return 'ok';
  }
  // if this account was played on another device since our last sync, returns that newer save
  async function newerSave() {
    if (!session) return null;
    const row = await fetchSave();
    if (!row) return null;
    const mine = Date.parse(localStorage.getItem(SP + 'cloudAt') || '') || 0;   // (compare as times: the server writes "+00:00", JS writes "Z")
    return Date.parse(row.updated_at) > mine ? row : null;
  }
  async function signOut() { if (sb) { try { await sb.auth.signOut(); } catch (e) {} } session = null; }

  // ---- profiles: a public card per protected player (reserved name, arena, wins, online status) ----
  const myId = () => session ? session.user.id : '';
  const likeName = n => String(n).replace(/[\\%_]/g, c => '\\' + c);   // exact, ignoring capitals ("_" is a wildcard otherwise)
  // who owns a name: their id, '' if nobody, null if we couldn't check
  async function nameOwner(name) {
    if (!(await init(SP))) return null;
    const { data, error } = await sb.from('profiles').select('owner').ilike('name', likeName(name)).limit(1);
    if (error) return null;
    return data && data[0] ? data[0].owner : '';
  }
  async function profileByName(name) {
    if (!(await init(SP))) return null;
    const { data, error } = await sb.from('profiles').select('owner, name, arena, wins, online_at, fight').ilike('name', likeName(name)).limit(1);
    return error || !data ? null : (data[0] || false);
  }
  async function profilesOf(ids) {
    if (!ids.length) return [];
    const { data, error } = await sb.from('profiles').select('owner, name, arena, wins, online_at, fight').in('owner', ids);
    return error ? null : data;
  }
  // keeps your card up to date (also the "I'm online" heartbeat): 'ok' | 'taken' | 'off' | 'err'
  async function saveProfile(name, arena, wins, fight) {
    if (!session) return 'off';
    const now = new Date().toISOString();
    const { error } = await sb.from('profiles').upsert({ owner: myId(), name, arena, wins, fight: !!fight, online_at: now, updated_at: now }, { onConflict: 'owner' });
    if (error) { if (error.code === '23505') return 'taken'; console.warn('profile', error); return 'err'; }
    return 'ok';
  }
  // ---- the Everyone leaderboard (protected players), best first ----
  async function top(n = 100) {
    if (!(await init(SP))) return null;
    const { data, error } = await sb.from('profiles').select('name, arena, wins').order('arena', { ascending: false }).order('wins', { ascending: false }).order('updated_at', { ascending: true }).limit(n);
    return error ? null : data;
  }
  async function boardCount() {
    if (!(await init(SP))) return 0;
    const { count, error } = await sb.from('profiles').select('owner', { count: 'exact', head: true });
    return error ? 0 : (count || 0);
  }
  async function rankOf(arena, wins) {
    if (!(await init(SP))) return 0;
    const { count, error } = await sb.from('profiles').select('owner', { count: 'exact', head: true }).or(`arena.gt.${arena | 0},and(arena.eq.${arena | 0},wins.gt.${wins | 0})`);
    return error ? 0 : (count || 0) + 1;
  }
  // ---- friendships between protected players ----
  // every request / friendship you're part of, with the other player's card: [{ id, dir: 'in'|'out'|'friend', owner, name, arena, wins, online_at, fight }]
  async function friendships() {
    if (!session) return null;
    const { data, error } = await sb.from('friendships').select('id, from_owner, to_owner, status');
    if (error) { console.warn('friends', error); return null; }
    const me = myId(), others = [...new Set(data.map(r => r.from_owner === me ? r.to_owner : r.from_owner))];
    const profs = await profilesOf(others);
    if (!profs) return null;
    const byId = {}; profs.forEach(p => byId[p.owner] = p);
    return data.map(r => {
      const other = r.from_owner === me ? r.to_owner : r.from_owner, p = byId[other];
      if (!p) return null;
      return { id: r.id, dir: r.status === 'accepted' ? 'friend' : r.from_owner === me ? 'out' : 'in', owner: other, name: p.name, arena: p.arena, wins: p.wins, online_at: p.online_at, fight: p.fight };
    }).filter(Boolean);
  }
  // asks someone to be friends: 'sent' | 'friends' (they had already asked you, so now you're friends) | 'already' | 'err'
  async function sendRequest(owner) {
    if (!session) return 'err';
    const { error } = await sb.from('friendships').insert({ from_owner: myId(), to_owner: owner });
    if (!error) return 'sent';
    if (error.code !== '23505') { console.warn('friends', error); return 'err'; }
    const { data } = await sb.from('friendships').select('id, from_owner, status').or(`from_owner.eq.${owner},to_owner.eq.${owner}`);
    const row = data && data[0];
    if (!row) return 'err';
    if (row.status === 'accepted') return 'already';
    if (row.from_owner === owner) return (await accept(row.id)) ? 'friends' : 'err';
    return 'already';
  }
  async function accept(id) { if (!session) return false; const { error } = await sb.from('friendships').update({ status: 'accepted' }).eq('id', id); return !error; }
  async function removeFriendship(id) { if (!session) return false; const { error } = await sb.from('friendships').delete().eq('id', id); return !error; }

  return { client: () => sb, whenReady: () => ready || Promise.resolve(false), init, loggedIn, loginName, signUp, signIn, push, newerSave, apply, signOut,
    myId, nameOwner, profileByName, saveProfile, top, boardCount, rankOf, friendships, sendRequest, accept, removeFriendship };
})();
