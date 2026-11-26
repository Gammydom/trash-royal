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
      sb = window.supabase.createClient(URL, KEY, { auth: { storageKey: SP + 'auth', persistSession: true, autoRefreshToken: true } });
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

  return { init, loggedIn, loginName, signUp, signIn, push, newerSave, apply, signOut };
})();
