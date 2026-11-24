// Trash Royal - menus, progression UI, input, rendering and the game loop.
(() => {
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const SP = 'tr' + (qs.get('p') || '') + '_'; // ?p=2 gives a second player in another tab (for testing)
  const store = {
    get(k, d) { try { const v = localStorage.getItem(SP + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(SP + k, JSON.stringify(v)); } catch (e) {} },
  };
  Progress.init(store);
  const validDeck = d => Array.isArray(d) && d.length === 8 && new Set(d).size === 8 && d.every(id => DEFS[id] && DEFS[id].cost);
  let username = store.get('name', '');
  let deck = store.get('deck', null);
  if (!validDeck(deck) || deck.some(id => !Progress.unlocked().has(id))) deck = DEFAULT_DECK.slice();
  let friends = store.get('friends', []).filter(n => typeof n === 'string');
  let netState = 'off'; // off | wait | on
  const P = () => Progress.get();
  function publishInfo() { Net.setInfo({ arena: Progress.arena() }); }
  publishInfo();

  // ---------------- small UI helpers ----------------
  let modalResolve = null;
  function modal(html, buttons) {
    $('modalBody').innerHTML = html;
    const bb = $('modalBtns'); bb.innerHTML = '';
    return new Promise(res => {
      modalResolve = res;
      buttons.forEach((b, i) => {
        const el = document.createElement('button');
        el.className = 'small-btn ' + (b.cls || '');
        el.textContent = b.label;
        if (b.disabled) el.disabled = true;
        el.onclick = () => { if (b.keep && b.keep() === false) return; closeModal(); res(i); };
        bb.appendChild(el);
      });
      $('modal').classList.remove('hidden');
    });
  }
  function closeModal() { $('modal').classList.add('hidden'); modalResolve = null; }
  let toastT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COIN = '\u{1FA99}', TROPHY = '\u{1F3C6}', ARENA_ICO = '\u{1F3DF}\u{FE0F}';

  function makeCard(id, opts = {}) {
    const def = DEFS[id];
    const el = document.createElement('div'); el.className = 'tcard tier-' + (def.cost <= 2 ? 1 : def.cost === 3 ? 2 : def.cost === 4 ? 3 : 4);
    const sh = document.createElement('div'); sh.className = 'shine'; sh.style.setProperty('--sd', (Math.random() * 5).toFixed(2) + 's'); el.appendChild(sh);
    const cv = document.createElement('canvas'); cv.width = opts.px || 120; cv.height = opts.px || 120;
    el.appendChild(cv);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = def.name; el.appendChild(nm);
    const c = document.createElement('div'); c.className = 'cost'; c.textContent = def.cost; el.appendChild(c);
    if (opts.level) { const l = document.createElement('div'); l.className = 'lvl'; l.textContent = 'Lv ' + Progress.level(id); el.appendChild(l); }
    if (opts.locked) { el.classList.add('locked'); const k = document.createElement('div'); k.className = 'lock'; k.textContent = '\u{1F512}'; el.appendChild(k); }
    if (opts.upgradable) { const cost = Progress.upgradeCost(id); if (cost != null && P().coins >= cost) { const u = document.createElement('div'); u.className = 'up'; u.textContent = '↑'; el.appendChild(u); } }
    drawCardIcon(cv, id);
    return el;
  }

  // ---------------- screens ----------------
  let screen = 'loading';
  const MENU = ['home', 'deck', 'shop', 'arenas', 'friends'];
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
    screen = id;
    const menu = MENU.includes(id);
    $('statbar').classList.toggle('hidden', !menu);
    $('tabbar').classList.toggle('hidden', !menu);
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
    if (menu) renderStats();
    if (menu) Music.play('menu'); else if (id === 'game') Music.stop();
    if (id === 'home') renderHome();
    if (id === 'deck') renderDeck();
    if (id === 'shop') renderShop();
    if (id === 'arenas') renderArenas();
    if (id === 'friends') { renderFriends(); pingFriends(); }
  }
  document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => { Sfx.init(); Sfx.play('tick'); swapPick = null; show(b.dataset.tab); });

  function renderStats() {
    $('homeName').textContent = username || '...';
    $('netDot').className = 'dot ' + (netState === 'on' ? 'on' : netState === 'wait' ? 'wait' : '');
    $('statTrophies').textContent = 'Arena ' + (Progress.arena() + 1);
    // tab bar dots: Shop when the free gift is waiting, Cards when you can afford an upgrade
    const dot = (tab, on) => {
      const b = document.querySelector(`#tabbar button[data-tab="${tab}"]`); if (!b) return;
      let d = b.querySelector('.tab-dot');
      if (on && !d) { d = document.createElement('i'); d.className = 'tab-dot'; b.appendChild(d); }
      if (!on && d) d.remove();
    };
    dot('shop', Progress.giftReady());
    dot('deck', [...Progress.unlocked()].some(id => { const c = Progress.upgradeCost(id); return c != null && P().coins >= c; }));
    const coins = String(P().coins), el = $('statCoins');
    if (el.textContent !== coins && el.textContent !== '0') { const pill = el.parentElement; pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
    el.textContent = coins;
  }

  // ---------------- arena art (shared by the home card, the arena list and battles) ----------------
  function paintGround(c, a, W, H, opts = {}) {
    // c is already scaled so 1 unit = 1 tile; draws an 18 x H arena slice
    const ar = ARENAS[a];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { c.fillStyle = ar.ground[(x + y) % 2]; c.fillRect(x, y, 1.01, 1.01); }
    if (ar.id === 'walmart') { c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 0.08; for (let x = 1; x < W; x += 2) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } }
    if (ar.id === 'waffle') { c.fillStyle = 'rgba(255,220,120,0.06)'; for (let y = 0; y < H; y++) for (let x = (y % 2); x < W; x += 2) c.fillRect(x, y, 1, 1); }
  }
  function paintDecor(c, a, W, H, seed0, avoid) {
    const ar = ARENAS[a];
    let seed = seed0; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 30; i++) {
      const x = rnd() < 0.5 ? rnd() * 1.2 + 0.25 : W - 1.45 + rnd() * 1.2, y = rnd() * H;
      if (avoid && avoid(y)) continue;
      c.save(); c.translate(x, y); c.rotate((rnd() - 0.5) * 0.8);
      decor(c, ar.decor[Math.floor(rnd() * ar.decor.length)], rnd);
      c.restore();
    }
  }
  function decor(c, k, rnd) {
    switch (k) {
      case 'bush': circ(c, -0.15, 0, 0.28, '#3f8f2e'); circ(c, 0.18, -0.05, 0.25, '#4aa336'); circ(c, 0, -0.2, 0.22, '#58b842'); break;
      case 'flower': for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; circ(c, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.09, ['#ff6fa8', '#ffd23f', '#ffffff'][i % 3], false); } circ(c, 0, 0, 0.07, '#ff9f1a', false); break;
      case 'gnome': poly(c, [-0.15, 0, 0.15, 0, 0, -0.45], '#d63031'); circ(c, 0, 0.05, 0.12, '#f2c9a8'); poly(c, [-0.12, 0.08, 0.12, 0.08, 0, 0.3], '#f5f5f5'); break;
      case 'ball': circ(c, 0, 0, 0.2, '#e53935'); c.fillStyle = '#fff'; c.fillRect(-0.2, -0.04, 0.4, 0.08); break;
      case 'tire': ell(c, 0, 0, 0.33, 0.33, '#2d2d2d'); ell(c, 0, 0, 0.15, 0.15, '#6b6b6b', false); break;
      case 'can': rrect(c, -0.1, -0.18, 0.2, 0.36, 0.05, ['#c0392b', '#2980b9', '#27ae60'][Math.floor(rnd() * 3)]); break;
      case 'flamingo': ell(c, 0, 0, 0.18, 0.12, '#ff7eb6'); line(c, 0.1, -0.05, 0.18, -0.35, 0.05, '#ff7eb6'); circ(c, 0.2, -0.38, 0.07, '#ff7eb6'); break;
      case 'grill': circ(c, 0, 0, 0.26, '#2d2d2d'); c.strokeStyle = '#888'; c.lineWidth = 0.03; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(-0.2, i * 0.08); c.lineTo(0.2, i * 0.08); c.stroke(); } break;
      case 'cone': poly(c, [-0.18, 0.1, 0.18, 0.1, 0, -0.35], '#ff7f27'); c.fillStyle = '#fff'; c.fillRect(-0.08, -0.12, 0.16, 0.05); break;
      case 'pump': rrect(c, -0.2, -0.35, 0.4, 0.6, 0.06, '#e53935'); rrect(c, -0.13, -0.28, 0.26, 0.16, 0.03, '#222'); break;
      case 'cart': rrect(c, -0.3, -0.2, 0.6, 0.4, 0.04, '#b0b8c0'); c.strokeStyle = '#7d858c'; c.lineWidth = 0.03; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 0.12, -0.2); c.lineTo(i * 0.12, 0.2); c.stroke(); } break;
      case 'bag': ell(c, 0, 0, 0.24, 0.18, '#f4f4f4'); ell(c, 0.05, -0.05, 0.1, 0.06, '#dddddd', false); break;
      case 'barrel': circ(c, 0, 0, 0.27, '#2e7d32'); circ(c, 0, 0, 0.18, '#1b5e20', false); poly(c, [-0.08, 0.05, 0.08, 0.05, 0, -0.1], '#ffd23f', false); break;
      case 'waffle': rrect(c, -0.25, -0.25, 0.5, 0.5, 0.08, '#e3a43a'); c.strokeStyle = '#b97b1f'; c.lineWidth = 0.04; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 0.15, -0.23); c.lineTo(i * 0.15, 0.23); c.moveTo(-0.23, i * 0.15); c.lineTo(0.23, i * 0.15); c.stroke(); } break;
      case 'mug': circ(c, 0, 0, 0.17, '#f4f4f4'); circ(c, 0, 0, 0.12, '#4a2c12', false); break;
      case 'sign': rrect(c, -0.3, -0.18, 0.6, 0.36, 0.05, '#ffd23f'); c.fillStyle = '#222'; c.font = 'bold 0.14px sans-serif'; c.textAlign = 'center'; c.fillText('OPEN', 0, 0.05); c.textAlign = 'left'; break;
      case 'palm': for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; ell(c, Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0.3, 0.09, '#2e7d32', true, a); } circ(c, 0, 0, 0.1, '#8d6e63'); break;
      case 'gator': ell(c, 0, 0, 0.45, 0.12, '#4e7d3a'); poly(c, [0.4, -0.08, 0.65, 0, 0.4, 0.08], '#4e7d3a'); circ(c, 0.38, -0.08, 0.04, '#ffeb3b', false); break;
    }
  }
  function paintRiver(c, a, y0, W) {
    const ar = ARENAS[a];
    c.fillStyle = ar.river[0]; c.fillRect(0, y0, W, 2);
    c.fillStyle = ar.river[1]; c.fillRect(0, y0 + 0.3, W, 1.4);
    c.fillStyle = ar.river[2]; c.fillRect(0, y0, W, 0.15); c.fillRect(0, y0 + 1.85, W, 0.15);
  }
  function paintBridge(c, a, bx, y0) {
    const ar = ARENAS[a];
    c.fillStyle = ar.bridge; c.fillRect(bx - 1, y0 - 0.35, 2, 2.7);
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.06;
    for (let i = 0; i <= 8; i++) { const y = y0 - 0.35 + i * 0.34; c.beginPath(); c.moveTo(bx - 1, y); c.lineTo(bx + 1, y); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(bx - 1.1, y0 - 0.4, 0.18, 2.8); c.fillRect(bx + 0.92, y0 - 0.4, 0.18, 2.8);
  }
  function spriteAt(c, key, x, y, row = 0, idx = 0, flipX = false) {
    const sp = SPR[key]; if (!sp) return false;
    const s = 1 / sp.ppm, F = sp.frame;
    c.save(); c.translate(x, y); if (flipX) c.scale(-1, 1);
    c.drawImage(sp.img, idx * F, row * F, F, F, -sp.ax * s, -sp.ay * s, F * s, F * s);
    c.restore(); return true;
  }
  // ---- full 3D arena backgrounds (rendered in Blender: art/arena3d.py -> arenas/<id>.webp) ----
  // The picture covers game tiles x -6..24, y -2..34 and lines up with the tile grid when stretched to that box.
  // Everything in it is placed symmetrically, so both players use it the same way.
  const A3 = { gx0: -6, gx1: 24, gy0: -2, gy1: 34 }, ARENA3D = {};
  function fadeEdges(img) {
    // soften the outer edge so it blends into the painted ground on very wide screens
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    const fx = c.width * 1.5 / (A3.gx1 - A3.gx0), fy = c.height * 1.5 / (A3.gy1 - A3.gy0);
    let gr = g.createLinearGradient(0, 0, c.width, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(fx / c.width, '#000'); gr.addColorStop(1 - fx / c.width, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    gr = g.createLinearGradient(0, 0, 0, c.height);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(fy / c.height, '#000'); gr.addColorStop(1 - fy / c.height, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function loadArena3D(i) {
    const id = ARENAS[i].id;
    if (ARENA3D[id] !== undefined) return Promise.resolve();
    ARENA3D[id] = 'loading';
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        ARENA3D[id] = fadeEdges(img);
        if (G && G.arena === i) bgKey = '';
        if (screen === 'home' && Progress.arena() === i) drawArenaPreview($('arenaPreview'), i, 15, 1.6);
        if (screen === 'arenas') renderArenas();
        res();
      };
      img.onerror = () => { ARENA3D[id] = null; res(); };
      img.src = 'arenas/' + id + '.webp?v=1';
    });
  }
  const arenaImg = i => { const v = ARENA3D[ARENAS[i].id]; return v && v !== 'loading' ? v : null; };

  // the top half of an arena: enemy house + two big guys + river
  function drawArenaPreview(cv, a, rows = 15, dy = 0) {
    const c = cv.getContext('2d');
    const T2 = cv.height / (rows + 2.6);
    const ex = Math.max(0, Math.ceil((cv.width / T2 - ARENA_W) / 2));
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    c.save(); c.translate(cv.width / 2, 0); c.scale(T2, T2); c.translate(-ARENA_W / 2, 0.6 + dy);
    const img = arenaImg(a);
    if (img) {
      c.save(); c.translate(-ex, 0); paintGround(c, a, ARENA_W + ex * 2, rows + 2); c.restore();
      c.drawImage(img, A3.gx0, A3.gy0, A3.gx1 - A3.gx0, A3.gy1 - A3.gy0);
    } else {
      c.save(); c.translate(-ex, 0); paintGround(c, a, ARENA_W + ex * 2, rows + 2); paintDecor(c, a, ARENA_W + ex * 2, rows, 11); c.restore();
      c.fillStyle = ARENAS[a].path; for (const bx of BRIDGES) c.fillRect(bx - 0.9, 5, 1.8, rows - 4);
      c.save(); c.translate(-ex, 0); paintRiver(c, a, rows, ARENA_W + ex * 2); c.restore();
      for (const bx of BRIDGES) paintBridge(c, a, bx, rows);
    }
    const pb = ARENAS[a].boss && SPR['boss_' + ARENAS[a].boss];
    if (pb) spriteAt(c, 'boss_' + ARENAS[a].boss, 9, 3.4 + (BOSSES[ARENAS[a].boss].drawDy || 0) * 0.6);   // the arena's boss stands where the house would be
    else spriteAt(c, 'king1', 9, 3.8);
    spriteAt(c, 'princess1', 3.5, 7.2, 0, 0, false);
    spriteAt(c, 'princess1', 14.5, 7.2, 0, 0, true);
    c.restore();
    if (ARENAS[a].night) { c.fillStyle = 'rgba(10,10,40,0.35)'; c.fillRect(0, 0, cv.width, cv.height); }
  }

  // ---------------- home ----------------
  const DIFF = ['Very easy', 'Easy', 'Normal', 'Tricky', 'Hard', 'Very hard', 'Final boss'];
  const DIFF_COL = ['#9be46a', '#c6e66a', '#ffd23f', '#ffb347', '#ff8a4a', '#ff6060', '#d48bff'];
  const diffPill = i => `<span class="diff-pill" style="background:${DIFF_COL[i] || '#ff6060'}">${DIFF[i] || 'Hard'}</span>`;
  // a little avatar circle with someone's first letter, coloured by their name
  function avatarHtml(name, big) {
    let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const cols = ['#e8423a', '#2f7bff', '#3f9c3a', '#d4891e', '#8e44ad', '#16a085', '#c0392b', '#2c3e50'];
    return `<div class="avatar${big ? ' big' : ''}" style="background:${cols[h % cols.length]}">${esc(String(name)[0] || '?').toUpperCase()}</div>`;
  }
  function renderHome() {
    renderStats();
    const a = Progress.arena(), ar = ARENAS[a], next = ARENAS[a + 1];
    $('arenaNum').textContent = 'ARENA ' + (a + 1);
    $('arenaName').textContent = ar.name;
    $('homeBg').style.backgroundImage = `url(arenas/${ar.id}.webp?v=1)`;
    drawArenaPreview($('arenaPreview'), a, 15, 1.6);
    const bd = ar.boss && BOSSES[ar.boss];
    $('bossPlate').innerHTML = bd ? `<span class="bp-tag">BOSS</span><b>${esc(bd.name)}</b><span class="bp-diff" style="background:${DIFF_COL[a]}">${DIFF[a]}</span>` : '';
    // arena progress track: beaten arenas are green, yours is gold, the last one is the final boss
    $('arenaTrack').innerHTML = ARENAS.map((x, i) => (i ? `<div class="at-line ${i <= a ? 'done' : ''}"></div>` : '') +
      `<div class="at-step ${i < a ? 'done' : i === a ? 'here' : ''} ${i === ARENAS.length - 1 ? 'final' : ''}" title="${esc(x.name)}">${i < a ? '✔' : i === ARENAS.length - 1 ? '\u{1F451}' : i + 1}</div>`).join('');
    $('nextArenaHint').textContent = next ? `Beat ${ar.cpu} to unlock ${next.name}!` : 'Final boss! Beat Orville in his own domain.';
    $('cpuHint').textContent = `vs ${ar.cpu} · level ${Progress.cpuLevel(a)}`;
    $('giftBanner').classList.toggle('hidden', !Progress.giftReady());
    const hd = $('homeDeckCards'); hd.innerHTML = '';
    deck.forEach(id => { const c = makeCard(id, { px: 72 }); c.onclick = () => show('deck'); hd.appendChild(c); });
    $('netText').textContent = netState === 'on' ? '\u{1F7E2} Online: friends can find you' : netState === 'wait' ? 'Connecting...' : 'Offline: CPU battles still work';
  }
  $('giftBanner').onclick = () => { Sfx.init(); Sfx.play('tick'); show('shop'); };
  $('copyName').onclick = async () => {
    const b = $('copyName');
    try { await navigator.clipboard.writeText(username); b.textContent = 'Copied!'; } catch (e) { b.textContent = 'Hold to copy'; }
    setTimeout(() => { b.textContent = 'Copy'; }, 1500);
  };
  $('editDeck').onclick = () => { Sfx.init(); Sfx.play('tick'); show('deck'); };
  $('btnBattle').onclick = () => { Sfx.init(); startCPU(Progress.arena()); };
  $('btnPractice').onclick = () => { Sfx.init(); startPractice(); };
  $('btnFriendsHome').onclick = () => show('friends');
  $('btnSettings').onclick = async () => {
    Sfx.init();
    const slider = (id, ico, label, v) => `<div class="vol-row"><span class="vol-ico">${ico}</span><span class="vol-lab">${label}</span>
      <input type="range" id="${id}" min="0" max="100" step="5" value="${v}" style="--p:${v}%"><b id="${id}N">${v}%</b></div>`;
    const p = modal(`<h3>Settings</h3><p>Signed in as <b>${esc(username)}</b></p>
      <div class="vols">${slider('volSound', '\u{1F50A}', 'Sound', Sfx.soundVol())}${slider('volMusic', '\u{1F3B5}', 'Music', Music.vol())}</div>
      ${Sfx.isMuted() ? '<p class="hint">Sound is muted. Move a slider to turn it back on.</p>' : ''}
      <p>${P().wins} wins, ${P().losses} losses vs the CPU<br>Reached: Arena ${Progress.arena() + 1}, ${esc(ARENAS[Progress.arena()].name)}</p>`,
      [{ label: 'Change name', cls: 'blue' }, { label: 'Close', cls: 'green' }]);
    const hookSlider = (id, set) => {
      const r = $(id);
      r.oninput = () => {
        if (Sfx.isMuted()) { Sfx.setMuted(false); $('muteBtn').textContent = '\u{1F50A}'; }   // moving a slider un-mutes
        set(+r.value); r.style.setProperty('--p', r.value + '%'); $(id + 'N').textContent = r.value + '%';
      };
    };
    hookSlider('volSound', v => Sfx.setSoundVol(v));
    hookSlider('volMusic', v => Music.setVol(v));
    $('volSound').onchange = () => Sfx.play('pop');   // a sample at the new volume
    const k = await p;
    if (k === 0) askName(true);
  };

  // ---------------- username ----------------
  async function askName(change) {
    let err = '';
    while (true) {
      const html = `<h3>${change ? 'New username' : 'Pick a username'}</h3>
        <p>Your friends use this to find you.<br>3 to 16 letters, numbers or _</p>
        ${err ? `<p class="err">${esc(err)}</p>` : ''}
        <div class="row" style="margin-top:10px"><input type="text" id="nameIn" maxlength="16" autocomplete="off" autocapitalize="off" value="${esc(username)}"></div>`;
      let typed = '';
      const grab = () => { typed = (($('nameIn') || {}).value || '').trim(); };
      const p = modal(html, change ? [{ label: 'Cancel', cls: 'gray' }, { label: 'Save', cls: 'green', keep: grab }] : [{ label: "Let's go!", cls: 'green', keep: grab }]);
      setTimeout(() => { const i = $('nameIn'); if (i) { i.focus(); i.onkeydown = e => { if (e.key === 'Enter') $('modalBtns').lastChild.click(); }; } }, 50);
      const pick = await p;
      if (change && pick === 0) return;
      if (!/^[A-Za-z0-9_]{3,16}$/.test(typed)) { err = 'Use 3 to 16 letters, numbers or _'; continue; }
      if (change && typed.toLowerCase() === username.toLowerCase() && Net.isReady()) { username = typed; store.set('name', username); renderStats(); return; }
      netState = 'wait'; renderStats();
      const r = await Net.start(typed);
      if (!r.ok && r.why === 'taken') { err = `"${typed}" is taken (or you have the game open in another tab).`; netState = 'off'; continue; }
      username = typed; store.set('name', username);
      netState = r.ok ? 'on' : 'off';
      if (screen === 'home') renderHome(); else renderStats();
      if (!r.ok) toast('Could not reach the online server. CPU battles still work.');
      return;
    }
  }
  async function connectNet() {
    if (!username) return;
    netState = 'wait'; renderStats();
    const r = await Net.start(username);
    if (!r.ok && r.why === 'taken') {
      netState = 'off'; renderStats();
      await modal(`<h3>Name in use</h3><p>"${esc(username)}" is already online. You might have the game open in another tab. Close it, or pick a new name.</p>`, [{ label: 'Pick new name', cls: 'green' }]);
      return askName(true);
    }
    netState = r.ok ? 'on' : 'off';
    if (screen === 'home') renderHome(); else if (MENU.includes(screen)) renderStats();
  }
  Net.on('status', on => { if (netState !== 'wait' || on) { netState = on ? 'on' : 'off'; if (MENU.includes(screen)) renderStats(); } });

  // ---------------- cards / deck builder ----------------
  let swapPick = null;
  function renderDeck() {
    const un = Progress.unlocked();
    const slots = $('deckSlots'); slots.innerHTML = '';
    deck.forEach((id, i) => {
      const el = makeCard(id, { px: 110, level: true, upgradable: true });
      el.classList.add('in');
      if (swapPick) el.classList.add('swap');
      el.onclick = () => {
        if (swapPick) { deck[i] = swapPick; swapPick = null; store.set('deck', deck); Sfx.play('pop'); renderDeck(); }
        else cardInfo(id);
      };
      slots.appendChild(el);
    });
    const avg = deck.reduce((s, id) => s + DEFS[id].cost, 0) / 8;
    $('avgCost').textContent = '⚡ Avg cost ' + avg.toFixed(1);
    $('ownedCount').textContent = `${un.size} of ${CARDS.length} cards`;
    $('deckHint').innerHTML = swapPick ? `<b style="color:var(--gold)">Tap a card in your deck to swap in ${esc(DEFS[swapPick].name)}.</b> <button class="link-btn" id="cancelSwap">cancel</button>` : 'Tap a card to see it, upgrade it or put it in your deck.';
    if (swapPick) $('cancelSwap').onclick = () => { swapPick = null; renderDeck(); };
    const all = $('allCards'); all.innerHTML = '';
    const locked = $('lockedCards'); locked.innerHTML = '';
    // your collection, with the ones already in your deck marked (and listed last)
    CARDS.filter(c => un.has(c.id)).sort((a, b) => deck.includes(a.id) - deck.includes(b.id) || a.cost - b.cost).forEach(c => {
      const el = makeCard(c.id, { px: 110, level: true, upgradable: true });
      if (deck.includes(c.id)) el.classList.add('in-deck');
      el.onclick = () => cardInfo(c.id);
      all.appendChild(el);
    });
    CARDS.slice().sort((a, b) => Progress.unlockArenaOf(a.id) - Progress.unlockArenaOf(b.id)).forEach(c => {
      if (un.has(c.id)) return;
      const el = makeCard(c.id, { px: 110, locked: true });
      const tag = document.createElement('div'); tag.className = 'arena-tag'; tag.textContent = 'Arena ' + (Progress.unlockArenaOf(c.id) + 1); el.appendChild(tag);
      el.onclick = () => cardInfo(c.id);
      locked.appendChild(el);
    });
    if (!locked.children.length) locked.innerHTML = '<div class="empty-state"><span class="es-ico">\u{1F3C6}</span><b>You own every card!</b>Nice collection.</div>';
  }
  function statsHtml(def, lvl = 1) {
    const m = LV(lvl), r = v => Math.round(v * m);
    const sp = s => s >= 2 ? 'Very fast' : s >= 1.5 ? 'Fast' : s >= 1 ? 'Medium' : 'Slow';
    const tg = { ground: 'Ground', both: 'Air & Ground', buildings: 'Buildings', none: '-' };
    const rows = [];
    const type = def.kind === 'spell' ? 'Spell' : def.kind === 'building' ? 'Building' : def.air ? 'Flying troop' : 'Troop';
    rows.push(['Type', type]);
    if (def.hp) rows.push(['Health', r(def.hp) + (def.count > 1 ? ' x' + def.count : '')]);
    if (def.ramp) rows.push(['Damage', def.ramp.map(r).join(' > ')]);
    else if (def.dmg) rows.push(['Damage', r(def.dmg) + (def.splash || def.spin || def.radius ? ' (area)' : '')]);
    if (def.hit) rows.push(['Hit speed', def.hit + 's']);
    if (def.kind !== 'spell' && def.targets !== 'none') rows.push(['Range', def.melee ? 'Melee' : def.range]);
    if (def.speed) rows.push(['Speed', sp(def.speed)]);
    if (def.targets && def.targets !== 'none') rows.push(['Targets', tg[def.targets]]);
    if (def.lifetime) rows.push(['Lasts', def.lifetime + 's']);
    if (def.radius) rows.push(['Radius', def.radius]);
    if (def.stun) rows.push(['Stun', def.stun + 's']);
    if (def.dur) rows.push(['Lasts', def.dur + 's']);
    return '<div class="stats">' + rows.map(x => `<div>${x[0]}<b>${esc(x[1])}</b></div>`).join('') + '</div>';
  }
  async function cardInfo(id) {
    const def = DEFS[id];
    const owned = Progress.unlocked().has(id);
    const inDeck = deck.includes(id);
    const lvl = Progress.level(id), cost = Progress.upgradeCost(id);
    const ai = Progress.unlockArenaOf(id);
    let extra = '';
    if (!owned) extra = `<p class="err">Locked: unlocks in Arena ${ai + 1}, ${esc(ARENAS[ai].name)}${ai > 0 ? ` (beat ${esc(ARENAS[ai - 1].cpu)} in ${esc(ARENAS[ai - 1].name)})` : ''}.</p>`;
    const html = `<h3>${esc(def.name)}</h3><canvas id="infoCv" width="200" height="200" style="width:120px;height:120px;display:block;margin:0 auto"></canvas>
      <p>${esc(def.desc)}</p><p><b style="color:var(--energy)">${def.cost} energy</b>${owned ? ` &middot; <b style="color:var(--gold)">Level ${lvl}</b>` : ''}</p>${extra}${statsHtml(def, owned ? lvl : 1)}`;
    const btns = [{ label: 'Close', cls: 'gray' }];
    if (owned && cost != null) btns.push({ label: `Upgrade ${COIN}${cost}`, cls: 'blue', disabled: P().coins < cost });
    if (owned && !inDeck) btns.push({ label: 'Put in deck', cls: 'green' });
    if (!owned) btns.push({ label: `Buy now ${COIN}${Progress.earlyPrice(id)}`, cls: 'blue', disabled: P().coins < Progress.earlyPrice(id) });
    const p = modal(html, btns);
    drawCardIcon($('infoCv'), id);
    const pick = await p;
    const lab = btns[pick] && btns[pick].label;
    if (!lab) return;
    if (lab.startsWith('Upgrade')) { if (Progress.upgrade(id)) { Sfx.play('win'); toast(`${def.name} is now level ${Progress.level(id)}!`); } renderStats(); renderDeck(); cardInfo(id); }
    else if (lab === 'Put in deck') { swapPick = id; renderDeck(); }
    else if (lab.startsWith('Buy now')) { if (Progress.buyEarly(id)) { Sfx.play('win'); toast(`You unlocked ${def.name}!`); } renderStats(); renderDeck(); }
  }

  // ---------------- shop ----------------
  // a shop chest picture: the closed chest from its 3D sprite, fitted into the canvas
  function drawChestIcon(cv, sprite) {
    const c = cv.getContext('2d'), sp = SPR[sprite];
    c.clearRect(0, 0, cv.width, cv.height);
    if (!sp) { c.font = `${cv.height * 0.6}px serif`; c.textAlign = 'center'; c.fillText('\u{1F9F0}', cv.width / 2, cv.height * 0.75); return; }
    const F = sp.frame, bb = sp.bb || { x: 0, y: 0, w: F, h: F };
    // bigger chests fill more of the tile so the three sizes read at a glance
    const fill = { chest_small: 0.68, chest_medium: 0.82, chest_huge: 0.96 }[sprite] || 0.9;
    const s = Math.min(cv.width * fill / bb.w, cv.height * fill / bb.h);
    c.imageSmoothingQuality = 'high';
    c.drawImage(sp.img, bb.x, bb.y, bb.w, bb.h, (cv.width - bb.w * s) / 2, cv.height * 0.96 - bb.h * s, bb.w * s, bb.h * s);
  }
  const fmtLeft = ms => { const m = Math.max(1, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
  let shopTimer = 0;
  function sec(cls, ico, titleText, timer) {
    const s = document.createElement('div'); s.className = 'shop-sec ' + cls;
    s.innerHTML = `<div class="sec-title"><span class="ico">${ico}</span>${titleText}${timer ? '<span class="timer"></span>' : ''}</div>`;
    return s;
  }
  function renderShop() {
    renderStats();
    const body = $('shopBody'); body.innerHTML = '';
    // daily gift
    const ready = Progress.giftReady();
    const gift = sec('gift', '\u{1F381}', 'Daily Gift', !ready);
    gift.insertAdjacentHTML('beforeend', `<div class="gift-row"><div class="gift-box ${ready ? 'ready' : ''}">\u{1F381}</div>
      <div class="txt"><b>${ready ? 'Free coins!' : 'Come back tomorrow'}</b>50-150 coins, free every day.</div>
      <button class="small-btn gold ${ready ? 'glow' : ''}" ${ready ? '' : 'disabled'}>${ready ? 'Claim!' : 'Claimed'}</button></div>`);
    gift.querySelector('button').onclick = () => { const n = Progress.claimGift(); if (n) { Sfx.play('win'); toast(`+${n} coins!`); renderShop(); } };
    body.appendChild(gift);
    // chests
    const csec = sec('chests', '\u{1F9F0}', 'Chests');
    csec.insertAdjacentHTML('beforeend', '<div class="sec-hint">Cards fly out, each one gets +1 level, then a pile of coins.</div><div class="chest-grid"></div>');
    const grid = csec.querySelector('.chest-grid');
    Progress.CHESTS.forEach(ch => {
      const t = document.createElement('div'); t.className = 'chest-tile ' + ch.id;
      t.innerHTML = `${ch.id === 'huge' ? '<div class="ribbon">BEST VALUE</div>' : ''}<canvas width="220" height="200"></canvas>
        <div class="cn">${esc(ch.name)}</div><div class="cd">${ch.cards} cards<br>+ ${ch.coins[0]}-${ch.coins[1]} ${COIN}</div>
        <button class="small-btn gold" ${P().coins < ch.price ? 'disabled' : ''}>${COIN}${ch.price}</button>`;
      drawChestIcon(t.querySelector('canvas'), ch.sprite);
      t.onclick = () => buyChest(ch);
      grid.appendChild(t);
    });
    body.appendChild(csec);
    // daily deals
    const dsec = sec('deals', '\u{1F525}', 'Daily Deals', true);
    dsec.insertAdjacentHTML('beforeend', '<div class="sec-hint">40% off a card upgrade.</div><div class="offers"></div>');
    const offers = dsec.querySelector('.offers');
    Progress.deals().forEach(d => {
      const o = document.createElement('div'); o.className = 'offer';
      const done = Progress.boughtDeal(d.id);
      if (!done) o.insertAdjacentHTML('beforeend', '<div class="off">-40%</div>');
      o.appendChild(makeCard(d.id, { px: 100, level: true }));
      const full = Progress.upgradeCost(d.id);
      if (!done && full) o.insertAdjacentHTML('beforeend', `<span class="was">${COIN}${full}</span>`);
      const b = document.createElement('button'); b.className = 'small-btn blue';
      b.textContent = done ? 'Bought ✔' : `↑ ${COIN}${d.price}`;
      b.disabled = done || P().coins < d.price;
      b.onclick = () => { if (Progress.buyDeal(d)) { Sfx.play('win'); toast(`${DEFS[d.id].name} leveled up!`); renderShop(); } };
      o.appendChild(b); offers.appendChild(o);
    });
    body.appendChild(dsec);
    // unlock early
    const un = Progress.unlocked();
    const lockedIds = CARDS.filter(c => !un.has(c.id)).map(c => c.id);
    const esec = sec('early', '\u{1F513}', 'Unlock Early');
    esec.insertAdjacentHTML('beforeend', '<div class="sec-hint">Can\'t wait for the next arena? Buy the card now.</div><div class="offers"></div>');
    const eo = esec.querySelector('.offers');
    if (!lockedIds.length) eo.outerHTML = '<div class="sec-hint">You already own every card!</div>';
    lockedIds.forEach(id => {
      const o = document.createElement('div'); o.className = 'offer';
      o.appendChild(makeCard(id, { px: 100 }));
      const price = Progress.earlyPrice(id);
      o.insertAdjacentHTML('beforeend', `<span class="tag">${esc(ARENAS[Progress.unlockArenaOf(id)].name)}</span>`);
      const b = document.createElement('button'); b.className = 'small-btn blue'; b.textContent = `${COIN}${price}`; b.disabled = P().coins < price;
      b.onclick = () => { if (Progress.buyEarly(id)) { Sfx.play('win'); toast(`You unlocked ${DEFS[id].name}!`); renderShop(); } };
      o.appendChild(b); eo.appendChild(o);
    });
    body.appendChild(esec);
    // countdowns tick while the shop is open
    const tick = () => {
      if (screen !== 'shop') { clearInterval(shopTimer); return; }
      const left = 'New in ' + fmtLeft(Progress.msToReset());
      body.querySelectorAll('.timer').forEach(t => t.textContent = left);
      if (!ready && Progress.giftReady()) renderShop();
    };
    clearInterval(shopTimer); shopTimer = setInterval(tick, 30000); tick();
  }
  let opening = false;
  async function buyChest(ch) {
    if (opening) return;
    Sfx.init();
    if (P().coins < ch.price) { Sfx.play('nope'); toast(`You need ${ch.price - P().coins} more coins`); return; }
    const p = modal(`<h3>${esc(ch.name)}</h3><canvas id="buyChestCv" width="220" height="200" style="display:block;width:160px;margin:0 auto"></canvas>
      <p>${ch.cards} random cards you own get +1 level each, then ${ch.coins[0]}-${ch.coins[1]} bonus coins pop out.</p>`,
      [{ label: 'Not now', cls: 'gray' }, { label: `Open for ${COIN}${ch.price}`, cls: 'green' }]);
    drawChestIcon($('buyChestCv'), ch.sprite);
    if (await p !== 1) return;
    const res = Progress.buyChest(ch);
    if (res.err === 'coins') { Sfx.play('nope'); toast('Not enough coins'); return; }
    if (res.err === 'maxed') { toast('All your cards are max level!'); return; }
    opening = true;
    renderStats();
    try { await ChestFx.open(ch, res, { makeCard, Sfx, esc }); }
    finally { opening = false; }
    renderShop();
  }

  // ---------------- arenas ----------------
  function renderArenas() {
    const list = $('arenaList'); list.innerHTML = '';
    const cur = Progress.arena(), best = Progress.bestArena();
    $('arenaCount').textContent = `${cur + 1} / ${ARENAS.length}`;
    ARENAS.forEach((ar, i) => {
      const it = document.createElement('div'); it.className = 'arena-item' + (i > best ? ' locked' : '') + (i === cur ? ' current' : '');
      const cvs = document.createElement('canvas'); cvs.width = 600; cvs.height = 220;
      it.appendChild(cvs);
      const b = document.createElement('div'); b.className = 'ai-body';
      const status = i < cur ? '<span class="ai-status done">✔ Beaten</span>' : i === cur ? `<span class="ai-status now">${i === ARENAS.length - 1 ? '\u{1F451} Final arena' : '⚔️ Beat it to move on'}</span>`
        : `<span class="ai-status lock">\u{1F512} Beat ${esc(ARENAS[i - 1].cpu)} first</span>`;
      const bd = ar.boss && BOSSES[ar.boss];
      b.innerHTML = `<div class="ai-title">${i + 1}. ${esc(ar.name)}</div>${status}
        ${bd ? `<div class="ai-boss"><canvas width="160" height="160"></canvas><div class="ab-txt"><b><span class="ab-tag">BOSS</span>${esc(bd.name)}</b>${esc(bd.desc)}</div></div>` : ''}
        <div class="hint">${diffPill(i)} &nbsp;CPU level ${ar.level} &middot; river of ${esc(ar.riverName)}</div>`;
      if (bd) {
        // the boss's portrait: his first idle frame, fitted to the little canvas
        const bc = b.querySelector('.ai-boss canvas'), sp = SPR['boss_' + ar.boss];
        if (sp) {
          const g = bc.getContext('2d'), F = sp.frame, bb = sp.bb || { x: 0, y: 0, w: F, h: F };
          const s = Math.min(bc.width / bb.w, bc.height / bb.h) * 0.95;
          if (i > best) g.filter = 'grayscale(1) brightness(0.55)';
          g.drawImage(sp.img, bb.x, bb.y, bb.w, bb.h, (bc.width - bb.w * s) / 2, bc.height - bb.h * s, bb.w * s, bb.h * s);
        }
      }
      if (i <= best) {
        const pb = document.createElement('button'); pb.className = 'small-btn ' + (i === cur ? 'gold' : 'blue') + ' ai-play';
        pb.textContent = i === cur ? '⚔️ Battle' : '⚔️ Play again';
        pb.onclick = e => { e.stopPropagation(); Sfx.init(); startCPU(i); };
        b.appendChild(pb);
      }
      const cards = document.createElement('div'); cards.className = 'ai-cards';
      (i === 0 ? STARTER : ar.unlocks).forEach(id => { const c = makeCard(id, { px: 80, locked: i > best && !P().bought.includes(id) }); c.onclick = () => cardInfo(id); cards.appendChild(c); });
      b.appendChild(cards);
      it.appendChild(b);
      if (i === cur) { const h = document.createElement('div'); h.className = 'here'; h.textContent = 'YOU ARE HERE'; it.appendChild(h); }
      list.appendChild(it);
      drawArenaPreview(cvs, i, 9);
    });
  }

  // ---------------- friends ----------------
  function saveFriends() { store.set('friends', friends); }
  function addFriend(name, silent) {
    name = name.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) { if (!silent) toast('Usernames are 3 to 16 letters, numbers or _'); return false; }
    if (name.toLowerCase() === username.toLowerCase()) { if (!silent) toast("That's you!"); return false; }
    if (friends.some(f => f.toLowerCase() === name.toLowerCase())) { if (!silent) toast('Already your friend'); return false; }
    friends.push(name); saveFriends();
    if (screen === 'friends') renderFriends();
    return true;
  }
  function renderFriends() {
    renderStats();
    $('myNameHint').textContent = username;
    $('myAvatar').outerHTML = avatarHtml(username || '?', true).replace('class="avatar big"', 'class="avatar big" id="myAvatar"');
    $('myArenaHint').textContent = `${ARENA_ICO} Arena ${Progress.arena() + 1} · ${netState === 'on' ? 'online' : 'offline'}`;
    $('friendCount').textContent = friends.length ? `${friends.filter(f => Net.isOnline(f) === true).length} online` : '';
    const list = $('friendList'); list.innerHTML = '';
    if (!friends.length) list.innerHTML = '<div class="empty-state"><span class="es-ico">\u{1F465}</span><b>No friends yet</b>Type a friend\'s username above and tap Add.<br>Send them yours so they can add you back!</div>';
    friends.forEach(name => {
      const on = Net.isOnline(name), info = Net.info(name);
      const row = document.createElement('div'); row.className = 'friend';
      const fight = on === true && info && info.fight;   // online but in a battle right now
      const status = fight ? '<span class="fight">⚔️ In fight</span>' : on === true ? '<span class="on">● Online</span>' : on === undefined ? '<span>Checking...</span>' : '<span>Offline</span>';
      row.innerHTML = `${avatarHtml(name)}<div class="f-txt"><b></b>${status}${info ? ` <span>· ${ARENA_ICO} Arena ${(info.arena | 0) + 1}</span>` : ''}</div>
        <button class="small-btn ${on === true && !fight ? 'gold' : 'gray'}">⚔️ Battle</button><button class="icon-btn" title="Remove">&#10005;</button>`;
      row.querySelector('.avatar').insertAdjacentHTML('beforeend', `<span class="dot ${fight ? 'busy' : on === true ? 'on' : on === undefined ? 'wait' : ''}"></span>`);
      row.querySelector('.f-txt b').textContent = name;
      row.children[2].onclick = () => { Sfx.init(); pickModeAndChallenge(name); };
      row.children[3].onclick = async () => {
        const k = await modal(`<h3>Remove friend?</h3><p>Remove ${esc(name)} from your friends?</p>`, [{ label: 'Keep', cls: 'gray' }, { label: 'Remove', cls: 'red' }]);
        if (k === 1) { friends = friends.filter(f => f !== name); saveFriends(); renderFriends(); }
      };
      list.appendChild(row);
    });
    const rl = $('recentList'); rl.innerHTML = '';
    const rec = (P().recent || []).filter(n => !friends.some(f => f.toLowerCase() === n.toLowerCase()));
    if (!rec.length) rl.innerHTML = '<div class="hint">People you battle show up here so you can add them.</div>';
    rec.forEach(name => {
      const row = document.createElement('div'); row.className = 'friend';
      row.innerHTML = `${avatarHtml(name)}<div class="f-txt"><b></b><span>Played recently</span></div><button class="small-btn green">+ Add</button>`;
      row.querySelector('.f-txt b').textContent = name;
      row.querySelector('button').onclick = () => { if (addFriend(name)) { Net.sendFriend(name); toast(`Added ${name}`); renderFriends(); } };
      rl.appendChild(row);
    });
  }
  $('addBtn').onclick = async () => {
    const name = $('addName').value.trim();
    if (!addFriend(name)) return;
    $('addName').value = '';
    if (Net.isReady()) {
      const ok = await Net.sendFriend(name);
      toast(ok ? `Added ${name}! They got a friend request.` : `Added ${name}. They're offline right now.`);
      pingFriends();
    } else toast(`Added ${name}.`);
  };
  $('addName').onkeydown = e => { if (e.key === 'Enter') $('addBtn').click(); };
  Net.on('presence', () => { if (screen === 'friends') renderFriends(); });
  let pinging = false;
  async function pingFriends() {
    if (pinging || !Net.isReady() || G) return;
    pinging = true;
    for (const f of friends.slice()) { if (G) break; await Net.ping(f); }
    pinging = false;
  }
  setInterval(() => { if (screen === 'friends') pingFriends(); }, 20000);

  Net.on('friendRequest', async from => {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(from)) return;
    if (friends.some(f => f.toLowerCase() === from.toLowerCase())) return;
    if (G) { addFriend(from, true); return; }
    const k = await modal(`<h3>Friend request</h3><p><b>${esc(from)}</b> added you as a friend. Add them back?</p>`, [{ label: 'No thanks', cls: 'gray' }, { label: 'Add', cls: 'green' }]);
    if (k === 1) { addFriend(from, true); toast(`${from} is now your friend`); }
  });

  // challenges with a custom mode
  let lastMode = store.get('mode', 'classic');
  const BOSS_IDS = Object.keys(BOSSES);
  const okBoss = id => (typeof id === 'string' && BOSSES[id]) ? id : BOSS_IDS[0];
  const okMap = i => Math.max(0, Math.min(ARENAS.length - 1, i | 0));
  // draw a boss's first idle frame fitted into a small canvas
  function bossPortrait(cv, id, grey) {
    const sp = SPR['boss_' + id]; if (!sp) return;
    const g = cv.getContext('2d'), F = sp.frame, bb = sp.bb || { x: 0, y: 0, w: F, h: F };
    const s = Math.min(cv.width / bb.w, cv.height / bb.h) * 0.95;
    g.clearRect(0, 0, cv.width, cv.height);
    if (grey) g.filter = 'grayscale(1) brightness(0.55)';
    g.drawImage(sp.img, bb.x, bb.y, bb.w, bb.h, (cv.width - bb.w * s) / 2, cv.height - bb.h * s, bb.w * s, bb.h * s);
  }
  // a row of 7 boss portraits to pick from; returns a getter for the pick
  function bossPickerHtml(sel) {
    return `<div class="pick-row" id="bossPick">${BOSS_IDS.map(id => `<div class="pick-opt boss ${id === sel ? 'on' : ''}" data-id="${id}"><canvas width="120" height="120"></canvas><span>${esc(BOSSES[id].name.split(' ')[0])}</span></div>`).join('')}</div>`;
  }
  function wireBossPicker(sel, onPick) {
    document.querySelectorAll('#bossPick .pick-opt').forEach(el => {
      bossPortrait(el.querySelector('canvas'), el.dataset.id);
      el.onclick = () => { sel = el.dataset.id; document.querySelectorAll('#bossPick .pick-opt').forEach(o => o.classList.toggle('on', o === el)); Sfx.play('tick'); onPick(sel); };
    });
  }
  async function pickModeAndChallenge(name) {
    if (!Net.isReady()) { toast("You're offline. Online play isn't available right now."); return; }
    let pick = MODES.findIndex(m => m.id === lastMode); if (pick < 0) pick = 0;
    let map = okMap(store.get('map', Progress.arena())), boss = okBoss(store.get('boss', ARENAS[Progress.arena()].boss));
    const html = `<h3>Battle ${esc(name)}</h3>
      <div class="pick-label">Map</div>
      <div class="pick-row" id="mapPick">${ARENAS.map((ar, i) => `<div class="pick-opt map ${i === map ? 'on' : ''}" data-i="${i}" style="background-image:url(arenas/${ar.id}.webp?v=1)"><span>${esc(ar.name)}</span></div>`).join('')}</div>
      <div class="pick-label">Game mode</div>
      <div class="mode-list">${MODES.map((m, i) =>
      `<div class="mode-opt ${i === pick ? 'on' : ''}" data-i="${i}"><div><b>${esc(m.name)}</b><span>${esc(m.desc)}</span></div></div>`).join('')}</div>
      <div id="bossPickWrap" class="${MODES[pick].boss || MODES[pick].raid ? '' : 'hidden'}"><div class="pick-label" id="bossPickLabel">${MODES[pick].raid ? 'Boss to fight' : 'Your boss'}</div>${bossPickerHtml(boss)}</div>`;
    const p = modal(html, [{ label: 'Cancel', cls: 'gray' }, { label: 'Send challenge', cls: 'green' }]);
    document.querySelectorAll('.mode-opt').forEach(el => el.onclick = () => {
      pick = +el.dataset.i; document.querySelectorAll('.mode-opt').forEach(o => o.classList.toggle('on', o === el)); Sfx.play('tick');
      $('bossPickWrap').classList.toggle('hidden', !MODES[pick].boss && !MODES[pick].raid);
      $('bossPickLabel').textContent = MODES[pick].raid ? 'Boss to fight' : 'Your boss';
    });
    document.querySelectorAll('#mapPick .pick-opt').forEach(el => el.onclick = () => {
      map = +el.dataset.i; document.querySelectorAll('#mapPick .pick-opt').forEach(o => o.classList.toggle('on', o === el)); Sfx.play('tick');
    });
    wireBossPicker(boss, b => { boss = b; });
    const on = document.querySelector('#mapPick .pick-opt.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (await p !== 1) return;
    lastMode = MODES[pick].id; store.set('mode', lastMode); store.set('map', map); store.set('boss', boss);
    challengeFriend(name, MODES[pick], map, boss);
  }
  async function challengeFriend(name, mode, map, boss) {
    let cancelled = false;
    modal(`<h3>Calling ${esc(name)}...</h3><p>${esc(mode.name)} on ${esc(ARENAS[map].name)}: waiting for them to accept.</p>`, [{ label: 'Cancel', cls: 'gray' }]).then(() => { cancelled = true; Net.cancelChallenge(); });
    const extra = { mode: mode.id, arena: map, boss: mode.boss || mode.raid ? boss : undefined };
    const r = await Net.challenge(name, deck, extra);
    if (cancelled) return;
    closeModal();
    if (!r.ok) {
      const why = { offline: `${name} is offline.`, declined: `${name} said no.`, busy: `${name} is already in a battle.`, timeout: `${name} didn't answer.`, closed: 'Connection lost.' }[r.why] || 'Could not connect.';
      toast(why); return;
    }
    startOnline('host', name, { deck: r.deck, levels: r.levels, mode: mode.id, arena: map, bosses: [boss, okBoss(r.boss)], raidBoss: boss });
  }
  Net.on('challenge', async (from, conn, msg) => {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(from)) { Net.decline(conn); return; }
    if (G || modalResolve) { Net.decline(conn, 'busy'); return; }
    const mode = MODES.find(m => m.id === msg.mode) || MODES[0];
    Sfx.play('horn');
    const map = okMap(msg.arena);
    let boss = okBoss(store.get('boss', ARENAS[Progress.arena()].boss));
    const kp = modal(`<h3>Battle!</h3><p><b>${esc(from)}</b> wants to battle you!</p>
      <div class="ch-map" style="background-image:url(arenas/${ARENAS[map].id}.webp?v=1)"><span>${esc(ARENAS[map].name)}</span></div>
      <p>Mode: <b style="color:var(--gold)">${esc(mode.name)}</b><br>${esc(mode.desc)}</p>
      ${mode.boss ? `<p>Their boss: <b style="color:var(--gold)">${esc(BOSSES[okBoss(msg.boss)].name)}</b></p><div class="pick-label">Pick your boss</div>${bossPickerHtml(boss)}` : ''}
      ${mode.raid ? `<div class="raid-boss"><canvas width="160" height="160" id="raidBossCv"></canvas><div><small>You two vs</small><b>${esc(BOSSES[okBoss(msg.boss)].name)}</b></div></div>` : ''}`,
      [{ label: 'Decline', cls: 'gray' }, { label: 'Accept', cls: 'green' }]);
    if (mode.boss) wireBossPicker(boss, b => { boss = b; });
    if (mode.raid) bossPortrait($('raidBossCv'), okBoss(msg.boss));
    const k = await kp;
    if (k !== 1 || !conn.open) { Net.decline(conn); if (k === 1) toast('They left.'); return; }
    Sfx.init();
    addFriend(from, true);
    if (mode.boss) store.set('boss', boss);
    const lv = {}; deck.forEach(id => lv[id] = Progress.level(id));
    Net.accept(conn, deck, { levels: lv, boss: mode.boss ? boss : undefined });
    startOnline('guest', from, { mode: mode.id, arena: map, bosses: [okBoss(msg.boss), boss], raidBoss: okBoss(msg.boss) });
  });

  // ---------------- the match ----------------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let G = null;
  let DPR = 1, VW = 0, VH = 0, T = 20, OX = 0, OY = 0, bgCache = null, bgKey = '';
  const STEP = 1 / 30;
  const UNIT_SCALE = 1.3; // draw troops a bit bigger than their hitbox so they read on small phones

  function newMatch(mode, oppName, arena) {
    return { mode, oppName, arena: arena || 0, me: mode === 'guest' ? 1 : 0, slot: mode === 'guest' ? 1 : 0, coop: false, mateName: '', sim: null, bot: null, view: null, acc: 0, snapT: 0, netEv: [],
      fx: [], decals: [], shake: 0, disp: {}, anim: {}, sel: -1, drag: null, over: false, dbl: false, started: performance.now(), lastSnapAt: 0, boss: [null, null],
      heardAt: performance.now(), hbTimer: 0 };
  }
  function myLevels() { const o = {}; deck.forEach(id => o[id] = Progress.level(id)); return o; }
  function startCPU(ai) {
    const lvl = Progress.cpuLevel(ai), ar = ARENAS[ai];
    const botDeck = Progress.cpuDeck(ai);
    const botLv = {}; botDeck.forEach(id => botLv[id] = lvl);
    G = newMatch('cpu', `${ar.cpu} (Lv ${lvl})`, ai);
    G.boss = [null, ar.boss && BOSSES[ar.boss] ? ar.boss : null];     // the arena's boss stands where their house was
    G.sim = new Sim([deck, botDeck], { levels: [myLevels(), botLv], towerLevel: [Progress.kingLevel(deck), lvl], boss: G.boss });   // the CPU fills energy exactly like you; harder arenas = better cards, levels and play
    G.bot = new Bot(G.sim, 1, { react: ar.react, skill: ar.skill, defend: ar.defend, daze: ar.daze });   // early arenas: CPUs that miss your troops and zone out
    enterGame();
  }
  function startPractice() {
    const botDeck = shuffle([...Progress.unlocked()]).slice(0, 8);
    G = newMatch('bot', 'Practice Dummy', Progress.arena());
    G.sim = new Sim([deck, botDeck], {});
    G.bot = new Bot(G.sim, 1, { react: [2.2, 3.4], skill: 0.1 });
    enterGame();
  }
  function startOnline(role, oppName, info) {
    const mode = MODES.find(m => m.id === info.mode) || MODES[0];
    G = newMatch(role, oppName, info.arena);
    G.modeName = mode.name;
    if (mode.raid) {   // Boss Raid: you and your friend share side 0 against a boss, his towers and a CPU
      const bid = okBoss(info.raidBoss), bi = BOSS_IDS.indexOf(bid), ai = Math.max(0, ARENAS.findIndex(a => a.boss === bid)), ar = ARENAS[ai];
      G.coop = true; G.me = 0; G.slot = role === 'guest' ? 2 : 0; G.mateName = oppName; G.raidBi = bi;
      G.oppName = BOSSES[bid].name; G.boss = [null, bid];
      Progress.addRecent(oppName);
      if (role === 'host') {
        const dMate = validDeck(info.deck) ? info.deck : DEFAULT_DECK.slice();
        const lvl = Math.min(MAX_LEVEL, ar.level + 1), botDeck = Progress.cpuDeck(ai), botLv = {}; botDeck.forEach(id => botLv[id] = lvl);
        G.sim = new Sim([deck.slice(), botDeck, dMate], { coop: true, boss: G.boss.slice(), levels: [{}, botLv, {}], towerLevel: [1, ar.level],
          hpMul: [1, 1.5] });   // normal energy for everyone
        G.bot = new Bot(G.sim, 1, { react: ar.react, skill: Math.max(ar.skill, 0.35) });
      }
      enterGame();
      return;
    }
    if (mode.boss) {   // Boss Battle: each player's house becomes the boss they picked ([challenger, friend])
      const b = info.bosses || [];
      G.boss = [okBoss(b[0]), okBoss(b[1])];
    }
    Progress.addRecent(oppName);
    if (role === 'host') {
      let d0 = deck.slice(), d1 = validDeck(info.deck) ? info.deck : DEFAULT_DECK.slice();
      if (mode.random) { d0 = shuffle(CARDS.map(c => c.id)).slice(0, 8); d1 = shuffle(CARDS.map(c => c.id)).slice(0, 8); }
      if (mode.mirror) d1 = d0.slice();
      const opts = Object.assign({}, mode.opts || {});
      if (mode.levels) {
        const lv1 = {}; if (info.levels && typeof info.levels === 'object') for (const k in info.levels) if (DEFS[k]) lv1[k] = Math.max(1, Math.min(MAX_LEVEL, info.levels[k] | 0));
        opts.levels = [myLevels(), lv1];
      }
      if (mode.boss) opts.boss = G.boss.slice();
      G.sim = new Sim([d0, d1], opts);
    }
    enterGame();
  }
  function enterGame() {
    Net.setFighting(true);
    // online: a heartbeat every second (timers keep running when the tab is in the background, so only a real leave goes quiet)
    if (G.mode === 'host' || G.mode === 'guest') { G.heardAt = performance.now(); G.hbTimer = setInterval(() => Net.send({ t: 'hb' }), 1000); }
    show('game');
    $('game').classList.remove('aiming');
    $('oppName').textContent = G.oppName;
    $('muteBtn').textContent = Sfx.isMuted() ? '\u{1F507}' : '\u{1F50A}';
    bgKey = '';
    buildHand(true);
    resize();
    $('myCrowns').textContent = ''; $('oppCrowns').textContent = '';
    vsIntro();
    G.introUntil = performance.now() + 1900;
    setTimeout(() => { if (!G || G.over) return; banner(G.modeName && G.modeName !== 'Classic' ? G.modeName.toUpperCase() + '!' : 'FIGHT!', 1300); Sfx.play('fight'); }, 1900);
  }
  // "YOU vs THEM" splash: their plate slides in from the left, yours from the right, VS slams in the middle
  function vsIntro() {
    const box = $('vsIntro'); if (!box) return;
    const bossId = G.boss && G.boss[1 - G.me];
    const ar = ARENAS[G.arena] || ARENAS[0];
    const themSub = G.mode === 'cpu' ? (bossId ? 'Boss of ' + ar.name : 'CPU') : G.coop ? 'Boss Raid' : G.mode === 'bot' ? 'Practice' : 'Friend';
    const meName = (username || 'You') + (G.coop ? ' + ' + G.mateName : '');
    box.innerHTML = `<div class="vs-plate them">${bossId ? '<canvas width="120" height="120" id="vsBossCv"></canvas>' : avatarHtml(G.oppName || '?', true)}<div class="vs-name"></div></div>
      <div class="vs-mid">VS</div>
      <div class="vs-plate me">${avatarHtml(username || 'You', true)}<div class="vs-name"></div></div>
      <div class="vs-arena"></div>`;
    const names = box.querySelectorAll('.vs-name');
    names[0].textContent = G.oppName; names[0].insertAdjacentHTML('beforeend', `<small>${esc(themSub)}</small>`);
    names[1].textContent = meName; names[1].insertAdjacentHTML('beforeend', `<small>${G.coop ? 'Team' : 'You'}</small>`);
    box.querySelector('.vs-arena').textContent = ar.name + (G.modeName && G.modeName !== 'Classic' ? ' \u00b7 ' + G.modeName : '');
    if (bossId) bossPortrait($('vsBossCv'), bossId);
    box.classList.remove('hidden'); box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
    Sfx.play('horn');
    clearTimeout(vsIntro.t); vsIntro.t = setTimeout(() => box.classList.add('hidden'), 2100);
  }
  function banner(text, ms = 1500) {
    const b = $('banner'); b.textContent = text; b.classList.add('show');
    clearTimeout(banner._t); banner._t = setTimeout(() => b.classList.remove('show'), ms);
  }
  $('muteBtn').onclick = () => { Sfx.setMuted(!Sfx.isMuted()); $('muteBtn').textContent = Sfx.isMuted() ? '\u{1F507}' : '\u{1F50A}'; };
  $('quitBtn').onclick = async () => {
    if (!G || G.over) return;
    const k = await modal('<h3>Give up?</h3><p>Leaving now counts as a loss.</p>', [{ label: 'Keep playing', cls: 'gray' }, { label: 'Give up', cls: 'red' }]);
    if (k !== 1 || !G || G.over) return;
    if (G.mode === 'host' || G.mode === 'guest') Net.leaveMatch();
    finish(G.me === 0 ? 1 : 0, 'You gave up.');
  };

  // someone closing the game mid-battle: a goodbye message when the page goes away, plus a heartbeat timeout
  // (closing a tab doesn't always close the connection, so silence counts as leaving too)
  const LEFT_AFTER = 12000;
  window.addEventListener('pagehide', () => { if (G && !G.over && (G.mode === 'host' || G.mode === 'guest')) Net.send({ t: 'bye' }); });
  Net.on('match', msg => {
    if (!G || G.over) return;
    G.heardAt = performance.now();
    if (msg.t === 'hb') return;
    if (msg.t === 'bye' || (msg.t === 'quit' && G.coop)) { left(msg.t === 'bye' ? 'left' : 'gave up'); return; }
    if (G.mode === 'host' && msg.t === 'play') {
      const i = msg.i | 0, x = +msg.x, y = +msg.y;
      if (i >= 0 && i < 4 && isFinite(x) && isFinite(y)) G.sim.play(G.coop ? 2 : 1, i, x, y);
    } else if (G.mode === 'guest' && msg.t === 'snap' && msg.s) {
      try {
        G.view = unpackSnapshot(msg.s);
        G.lastSnapAt = performance.now();
        (msg.ev || []).forEach(handleEvent);
        if (G.view.over && !G.over) finish(G.view.winner);
      } catch (e) { console.error(e); }
    } else if (msg.t === 'quit') {
      finish(G.me, `${G.oppName} gave up!`);
    }
  });
  Net.on('matchClosed', () => { if (G && !G.over && (G.mode === 'host' || G.mode === 'guest')) left('left'); });
  function left(how) {
    if (!G || G.over) return;
    if (!G.coop) { finish(G.me, `${G.oppName} ${how === 'left' ? 'left the battle.' : 'gave up!'}`); return; }
    if (G.mode === 'host') { if (!G.mateGone) { G.mateGone = true; clearInterval(G.hbTimer); toast(`${G.mateName} ${how}. Keep fighting!`); } }
    else finish(-1, `${G.mateName} ${how}, so the raid is over.`);
  }

  async function finish(winner, note) {
    if (!G || G.over) return;
    G.over = true;
    clearInterval(G.hbTimer);
    Sfx.beatTick(false);
    const st = viewState();
    const myCr = st.crowns[G.me], opCr = st.crowns[1 - G.me];
    const won = winner === G.me, draw = winner === -1;
    setTimeout(() => Sfx.play(won ? 'win' : draw ? 'tick' : 'lose'), 300);
    const mode = G.mode, opp = G.oppName, ai = G.arena;
    if (mode === 'host') setTimeout(() => Net.leaveMatch(), 1500);
    if (mode === 'guest') setTimeout(() => Net.leaveMatch(), 300);
    let rewards = '', res = null;
    if (mode === 'cpu') {
      res = Progress.cpuResult(won, draw, myCr, ai);
      publishInfo();
      rewards = `<div class="res-reward"><span class="res-chip">${COIN} +${res.coins}</span></div>` + (res.newArena >= 0 ? `<div class="res-unlock">\u{1F513} You beat ${esc(ARENAS[ai].name)}! ${esc(ARENAS[res.newArena].name)} unlocked!</div>` : '');
    } else if (G.coop) {
      const c = Progress.raidResult(won, G.raidBi);
      rewards = `<div class="res-reward"><span class="res-chip">${COIN} +${c}</span></div>` + (won ? `<div class="res-unlock">\u{1F91D} You and ${esc(G.mateName)} beat ${esc(opp)}!</div>` : '');
    } else if (mode === 'host' || mode === 'guest') {
      const c = Progress.friendResult(won);
      rewards = `<div class="res-reward"><span class="res-chip">${COIN} +${c}</span></div>`;
    }
    await new Promise(r => setTimeout(r, 1200));
    const title = won ? 'YOU WIN!' : draw ? 'DRAW!' : 'YOU LOSE';
    // 3 crown slots each: earned ones in colour, missing ones greyed out
    const crownRow = n => [0, 1, 2].map(i => `<b${i < n ? ' data-got="1"' : ''}>\u{1F451}</b>`).join('');
    const rows = `<div class="res-rows">
      <div class="res-row me">${avatarHtml(username || 'You')}<span class="rr-name">${esc(username || 'You')}${G.coop ? ` + ${esc(G.mateName)}` : ''}</span><span class="rr-crowns">${crownRow(myCr)}</span></div>
      <div class="res-row them">${avatarHtml(opp || '?')}<span class="rr-name">${esc(opp || 'Opponent')}</span><span class="rr-crowns">${crownRow(opCr)}</span></div></div>`;
    const sub = note ? `<p>${esc(note)}</p>` : '';
    const again = mode === 'cpu' || mode === 'bot';
    const nextUp = res && res.newArena >= 0;
    const btns = again ? [{ label: 'Home', cls: 'gray' }, { label: nextUp ? 'Next arena!' : 'Play again', cls: 'green' }] : [{ label: 'Home', cls: 'green' }];
    const kp = modal(`<div class="res-title ${won ? 'win' : draw ? 'draw' : 'lose'}">${title}</div>${rows}${sub}${rewards}`, btns);
    document.querySelectorAll('.rr-crowns b[data-got]').forEach((b, i) => setTimeout(() => { b.classList.add('got'); Sfx.play('ding'); }, 450 + i * 380));
    const k = await kp;
    G = null; Net.setFighting(false);
    if (res && res.newArena >= 0) await arenaUnlocked(res.newArena);
    if (again && k === 1) { if (mode === 'cpu') startCPU(nextUp ? res.newArena : ai); else startPractice(); }
    else show('home');
  }
  async function arenaUnlocked(i) {
    const ar = ARENAS[i];
    Sfx.play('win');
    const html = `<div class="res-title win">NEW ARENA!</div><canvas id="unlockCv" width="600" height="300" style="width:100%;border-radius:12px;border:3px solid #1a1a1a"></canvas>
      <p><b>${esc(ar.name)}</b><br>New cards unlocked:</p><div class="offers" id="unlockCards"></div>`;
    const p = modal(html, [{ label: 'Awesome!', cls: 'green' }]);
    drawArenaPreview($('unlockCv'), i, 11);
    const box = $('unlockCards');
    ar.unlocks.forEach(id => { const o = document.createElement('div'); o.className = 'offer'; o.appendChild(makeCard(id, { px: 100 })); box.appendChild(o); });
    await p;
  }

  function handleEvent(ev) {
    if (!G) return;
    switch (ev.e) {
      case 'sfx': Sfx.play(ev.n); break;
      case 'fx':
        if (ev.k === 'crack') G.decals.push({ x: ev.x, y: ev.y, t: 0, dur: 3, seed: Math.random() * 10 });
        else G.fx.push({ k: ev.k, x: ev.x, y: ev.y, r: ev.r || 0.5, c: ev.c, air: ev.air, t: 0, dur: { poof: 0.45, hit: 0.2, splat: 0.4, boom: 0.7, mboom: 0.8, shock: 0.6, smoke: 0.8, death: 0.55, spin: 0.3, bullets: 0.5 }[ev.k] || 0.4 });
        if (G.fx.length > 80) G.fx.splice(0, G.fx.length - 80);
        if (G.decals.length > 30) G.decals.shift();
        break;
      case 'word': G.fx.push({ k: 'word', w: ev.w, x: ev.x, y: ev.y, t: 0, dur: 0.9 }); break;
      case 'shake': G.shake = Math.max(G.shake, ev.a); break;
      case 'tower': G.fx.push({ k: 'boom', x: ev.x, y: ev.y, r: 2.5, t: 0, dur: 1.0 }); banner(ev.owner === G.me ? 'TOWER DOWN!' : 'CROWN!', 1200); break;
      case 'banner': banner(ev.w, 1800); break;
      case 'end': break;
    }
    if (G && G.mode === 'host') G.netEv.push(ev);
  }

  // a drawable state, whoever we are
  function viewState() {
    if (G.mode === 'guest') {
      const v = G.view;
      if (!v) return { ents: [], projs: [], zones: [], t: 0, crowns: [0, 0], elixir: 5, hand: [], next: null, ot: false, regTime: REG_TIME };
      return v;
    }
    const s = G.sim;
    return { ents: s.ents, projs: s.projs, zones: s.zones, t: s.t, crowns: s.crowns, elixir: s.elixir[G.slot], hand: s.players[G.slot].hand, next: s.players[G.slot].queue[0], ot: s.ot, regTime: s.regTime,
      mateHand: G.coop ? s.players[2].hand : undefined };
  }

  // ---------------- layout ----------------
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    VW = window.innerWidth; VH = window.innerHeight;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
    const top = $('topbar').getBoundingClientRect().bottom || 50;
    const hudTop = $('hud').getBoundingClientRect().top || VH - 150;
    const h = hudTop - top, w = $('hud').getBoundingClientRect().width || VW;  // the middle column on PC
    T = Math.min(w / ARENA_W, h / ARENA_H);
    OX = (VW - T * ARENA_W) / 2; OY = top + (h - T * ARENA_H) / 2;
    bgKey = '';
  }
  window.addEventListener('resize', () => { if (G) resize(); });
  // the hand's height is only known once its cards are in, so re-fit whenever the HUD changes size
  if (window.ResizeObserver) new ResizeObserver(() => { if (G && !$('game').classList.contains('hidden')) resize(); }).observe($('hud'));
  const flip = () => G && G.me === 1;
  function w2s(x, y) { if (flip()) { x = ARENA_W - x; y = ARENA_H - y; } return [OX + x * T, OY + y * T]; }
  function s2w(sx, sy) { let x = (sx - OX) / T, y = (sy - OY) / T; if (flip()) { x = ARENA_W - x; y = ARENA_H - y; } return [x, y]; }

  // ---------------- arena background (cached) ----------------
  function buildBg() {
    const key = [VW, VH, T, flip(), G.arena].join(',');
    if (bgKey === key && bgCache) return;
    bgKey = key;
    bgCache = document.createElement('canvas');
    bgCache.width = cv.width; bgCache.height = cv.height;
    const c = bgCache.getContext('2d');
    const a = G.arena || 0, ar = ARENAS[a];
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = '#1d1c19'; c.fillRect(0, 0, VW, VH);
    c.save(); c.translate(OX, OY); c.scale(T, T);
    // wide screens: keep the ground going past the arena edges (out of bounds, a bit darker)
    const ex = Math.ceil(OX / T / 2) * 2, ey = Math.ceil((Math.max(OY, VH - OY - ARENA_H * T) / T + 1) / 2) * 2;  // even, so the checker pattern lines up
    const img3 = arenaImg(a);
    if (img3 && (ex > 0 || ey > 0)) {
      // beyond the 3D picture: a blurred, stretched copy of it, so the colours always match
      c.save(); c.filter = 'blur(10px) brightness(0.72)';
      const bw = Math.max(A3.gx1 - A3.gx0, ARENA_W + ex * 2 + 4), bh = Math.max(A3.gy1 - A3.gy0, ARENA_H + ey * 2 + 4);
      c.drawImage(img3, ARENA_W / 2 - bw / 2, ARENA_H / 2 - bh / 2, bw, bh);
      c.restore();
    } else if (ex > 0) {
      c.save(); c.translate(-ex, -ey); paintGround(c, a, ARENA_W + ex * 2, ARENA_H + ey * 2); c.restore();
      c.save(); c.translate(-ex, 0); paintDecor(c, a, ex, ARENA_H, 3, y => y > 14.3 && y < 17.7); paintRiver(c, a, RIVER_TOP, ARENA_W + ex * 2); c.restore();
      c.save(); c.translate(ARENA_W, 0); paintDecor(c, a, ex, ARENA_H, 5, y => y > 14.3 && y < 17.7); c.restore();
      c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(-ex, -ey, ex, ARENA_H + ey * 2); c.fillRect(ARENA_W, -ey, ex, ARENA_H + ey * 2);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-0.12, 0, 0.12, ARENA_H); c.fillRect(ARENA_W, 0, 0.12, ARENA_H);
    }
    const img = arenaImg(a);
    if (img) {
      // full 3D arena (symmetric, so the same picture works for both players)
      c.drawImage(img, A3.gx0, A3.gy0, A3.gx1 - A3.gx0, A3.gy1 - A3.gy0);
      c.fillStyle = 'rgba(60,120,255,0.04)'; c.fillRect(0, 17, ARENA_W, 15);
      c.fillStyle = 'rgba(255,60,60,0.04)'; c.fillRect(0, 0, ARENA_W, 15);
    } else {
      // the arena is symmetric, so it's painted the same for both players
      paintGround(c, a, ARENA_W, ARENA_H);
      // my half gets a faint blue tint, theirs a faint red one
      c.fillStyle = 'rgba(60,120,255,0.05)'; c.fillRect(0, 16, ARENA_W, 16);
      c.fillStyle = 'rgba(255,60,60,0.05)'; c.fillRect(0, 0, ARENA_W, 16);
      c.fillStyle = ar.path;
      for (const bx of BRIDGES) c.fillRect(bx - 0.9, 5, 1.8, 22);
      c.fillRect(3.5, 5.6, 11, 1.4); c.fillRect(3.5, 25, 11, 1.4);
      paintDecor(c, a, ARENA_W, ARENA_H, 7, y => y > 14.3 && y < 17.7);
      paintRiver(c, a, RIVER_TOP, ARENA_W);
      for (const bx of BRIDGES) paintBridge(c, a, bx, RIVER_TOP);
    }
    c.restore();
    if (ar.night) {
      const g = c.createRadialGradient(VW / 2, VH / 2, VW * 0.2, VW / 2, VH / 2, VH * 0.75);
      g.addColorStop(0, 'rgba(10,10,40,0.05)'); g.addColorStop(1, 'rgba(10,10,40,0.55)');
      c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    }
  }

  // ---------------- input ----------------
  const handEl = $('hand');
  const slots = [...document.querySelectorAll('#hand .slot')];
  let handIds = [];
  function buildHand(force) {
    const st = viewState();
    const ids = st.hand || [];
    for (let i = 0; i < 4; i++) {
      if (!force && handIds[i] === ids[i]) continue;
      const box = slots[i].firstElementChild;
      box.innerHTML = '';
      if (ids[i]) box.appendChild(makeCard(ids[i], { px: 110 }));
    }
    if (force || handIds.next !== st.next) {
      $('nextCard').innerHTML = '';
      if (st.next) $('nextCard').appendChild(makeCard(st.next, { px: 70 }));
    }
    handIds = ids.slice(); handIds.next = st.next;
    // Boss Raid: your teammate's 4 cards in a little strip above your hand
    const mb = $('mateBar');
    mb.classList.toggle('hidden', !G.coop);
    if (G.coop) {
      const mh = st.mateHand || [], key = mh.join(',') + (G.mateGone ? '|left' : '');
      if (force || mb.dataset.k !== key) {
        mb.dataset.k = key; $('mateName').textContent = G.mateName + (G.mateGone ? ' (left)' : '');
        const box = $('mateCards'); box.innerHTML = '';
        mh.forEach(id => { if (id) box.appendChild(makeCard(id, { px: 40 })); });
      }
    }
  }
  function selectSlot(i) {
    if (!G || G.over) return;
    G.sel = (G.sel === i) ? -1 : i;
    slots.forEach((s, k) => s.classList.toggle('sel', k === G.sel));
    $('game').classList.toggle('aiming', G.sel >= 0);
    if (G.sel >= 0) Sfx.play('tick');
  }
  function clearSel() {
    if (!G) return;
    G.sel = -1; G.hover = null; G.drag = null; G.tapPending = false;
    slots.forEach(s => s.classList.remove('sel'));
    $('game').classList.remove('aiming');
  }
  // PC: keys 1-4 pick a card (the ghost shows under the mouse), Esc or right-click cancels
  let lastPtr = null;
  window.addEventListener('pointermove', e => { lastPtr = { clientX: e.clientX, clientY: e.clientY }; }, true);
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const modalOpen = !$('modal').classList.contains('hidden');
    if (e.key === 'Escape') {
      if (modalOpen) { const first = $('modalBtns').firstElementChild; if (first && !first.disabled) first.click(); }
      else if (G && G.sel >= 0) clearSel();
      return;
    }
    if (modalOpen || !G || G.over || $('game').classList.contains('hidden')) return;
    const k = '1234'.indexOf(e.key);
    if (k < 0 || e.repeat) return;
    e.preventDefault(); Sfx.init();
    selectSlot(k);
    G.drag = null;
    if (G.sel >= 0 && lastPtr) { const p = pointerToArena(lastPtr); G.hover = p.inArena ? p : null; }
  });
  cv.addEventListener('contextmenu', e => { e.preventDefault(); clearSel(); });
  slots.forEach((s, i) => {
    s.addEventListener('pointerdown', e => {
      e.preventDefault(); Sfx.init();
      if (!G || G.over) return;
      if (G.sel !== i) selectSlot(i);
      else selectSlot(i); // tap again to unselect
      if (G.sel === i) G.drag = { i, id: handIds[i], active: false, x: 0, y: 0 };
      else G.drag = null;
    });
  });
  function pointerToArena(e) {
    const [x, y] = s2w(e.clientX, e.clientY);
    const inArena = e.clientY > OY && e.clientY < OY + ARENA_H * T && e.clientX > OX && e.clientX < OX + ARENA_W * T;
    return { x, y, inArena };
  }
  window.addEventListener('pointermove', e => {
    if (!G || G.sel < 0) return;
    const p = pointerToArena(e);
    G.hover = p.inArena ? p : null;
    if (G.drag && p.inArena) G.drag.active = true;
  });
  window.addEventListener('pointerup', e => {
    if (!G || G.sel < 0 || e.button !== 0) return;
    const p = pointerToArena(e);
    if (G.drag && G.drag.active && p.inArena) tryPlay(p.x, p.y);
    G.drag = null;
  });
  cv.addEventListener('pointerdown', e => {
    Sfx.init();
    if (!G || G.sel < 0 || e.button !== 0) return;
    const p = pointerToArena(e);
    G.hover = p.inArena ? p : null;
    if (p.inArena && !G.drag) { G.tapPending = true; }
  });
  cv.addEventListener('pointerup', e => {
    if (!G || !G.tapPending || e.button !== 0) return;
    G.tapPending = false;
    const p = pointerToArena(e);
    if (p.inArena && G.sel >= 0) tryPlay(p.x, p.y);
  });
  function tryPlay(x, y) {
    const st = viewState();
    const id = st.hand[G.sel];
    if (!id) return;
    const def = DEFS[id];
    // snap to tile halves like the real thing feels
    x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2;
    if (def.kind !== 'spell') { x = Math.max(0.5, Math.min(ARENA_W - 0.5, x)); }
    if (G.introUntil && performance.now() < G.introUntil) return;   // wait for the VS intro
    if (st.elixir < def.cost) { Sfx.play('nope'); toast('Not enough energy'); return; }
    if (!canPlace(G.me, def.kind, x, y, st.ents)) { Sfx.play('nope'); toast(def.kind === 'spell' ? 'Drop it on the arena' : 'Drop troops on your side'); return; }
    if (G.mode === 'guest') {
      Net.send({ t: 'play', i: G.sel, x, y });
      Sfx.play('pop');
      G.fx.push({ k: 'poof', x, y, r: 0.6, t: 0, dur: 0.3 });
    } else {
      G.sim.play(G.slot, G.sel, x, y);
    }
    clearSel();
  }

  // ---------------- rendering ----------------
  let lastTs = performance.now();
  function frame(ts) {
    requestAnimationFrame(frame);
    const rawDt = Math.min(0.5, (ts - lastTs) / 1000); lastTs = ts;
    const dt = Math.min(0.1, rawDt);
    if (!G) return;
    // simulate (catch up if the phone dropped frames)
    if (G.sim && !G.over && !(G.introUntil && performance.now() < G.introUntil)) {
      G.acc += rawDt;
      let n = 0;
      while (G.acc >= STEP && n < 16) {
        G.sim.step(STEP);
        if (G.bot) G.bot.update(STEP);
        G.acc -= STEP; n++;
      }
      if (n >= 16) G.acc = 0;
      const evs = G.sim.events; G.sim.events = [];
      evs.forEach(handleEvent);
      if (G.mode === 'host') {
        G.snapT -= dt;
        if (G.snapT <= 0 || G.sim.over) {
          G.snapT = 0.066;
          Net.send({ t: 'snap', s: G.sim.snapshot(G.coop ? 2 : 1), ev: G.netEv });
          G.netEv = [];
        }
      }
      if (G.sim.over && !G.over) finish(G.sim.winner);
    }
    // the other player went quiet: host listens for the friend's heartbeat, the friend waits for the game to keep moving
    if (G && !G.over && (G.mode === 'host' || G.mode === 'guest')) {
      const nowMs = performance.now();
      if (G.mode === 'host' && !G.mateGone && nowMs - G.heardAt > LEFT_AFTER) left('left');
      else if (G.mode === 'guest' && nowMs - Math.max(G.lastSnapAt, G.started) > LEFT_AFTER + 8000) { if (G.coop) left('left'); else finish(G.me, `Lost ${G.oppName}. They left the battle.`); }
    }
    if (!G) return;
    render(dt);
  }
  requestAnimationFrame(frame);

  function updateHud(st) {
    const el = Math.max(0, Math.min(10, st.elixir || 0));
    $('energyFill').style.width = (el * 10) + '%';
    $('energyNum').textContent = Math.floor(el);
    $('energy').classList.toggle('full', el >= 9.99);
    buildHand(false);
    (st.hand || []).forEach((id, i) => slots[i].classList.toggle('poor', DEFS[id] && DEFS[id].cost > el));
    let rem, label = '';
    if (st.ot) { rem = Math.max(0, (st.regTime || REG_TIME) + OT_TIME - st.t); label = 'SUDDEN DEATH'; }
    else { rem = Math.max(0, (st.regTime || REG_TIME) - st.t); if (st.t > (st.regTime || REG_TIME) - 60) label = 'x2 ENERGY'; }
    const m = Math.floor(rem / 60), s = Math.floor(rem % 60);
    $('timer').innerHTML = `${m}:${String(s).padStart(2, '0')}${label ? `<small>${label}</small>` : ''}`;
    if (!G.dbl && st.t > (st.regTime || REG_TIME) - 60 && !st.ot) { G.dbl = true; banner('DOUBLE ENERGY!', 1500); Sfx.play('overtime'); }
    for (const [id, n] of [['myCrowns', st.crowns[G.me]], ['oppCrowns', st.crowns[1 - G.me]]]) {
      const el = $(id), t = '\u{1F451}' + n;
      if (el.textContent !== t) { const grew = el.textContent && el.textContent !== ''; el.textContent = t; if (grew) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } }
    }
  }

  function render(dt) {
    const st = viewState();
    updateHud(st);
    buildBg();
    const now = performance.now() / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bgCache, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // screen shake
    if (G.shake > 0) { G.shake = Math.max(0, G.shake - dt * 2.5); const a = G.shake * T * 0.3; ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a); }
    // river bubbles
    for (let i = 0; i < 10; i++) {
      const x = (i * 1.9 + now * 0.4) % ARENA_W, y = RIVER_TOP + 0.4 + ((i * 0.37) % 1.2);
      const p = (now * 0.7 + i * 0.3) % 1;
      const [sx, sy] = w2s(x, y);
      ctx.fillStyle = `rgba(190,230,90,${0.6 * (1 - p)})`;
      ctx.beginPath(); ctx.arc(sx, sy, T * (0.06 + p * 0.1), 0, 7); ctx.fill();
    }
    // placement overlay
    const selId = G.sel >= 0 ? st.hand[G.sel] : null;
    const selDef = selId ? DEFS[selId] : null;
    if (selDef && selDef.kind !== 'spell') {
      ctx.fillStyle = 'rgba(255,40,40,0.18)';
      for (let y = 0; y < ARENA_H; y++) for (let x = 0; x < ARENA_W; x++) {
        if (!canPlace(G.me, selDef.kind, x + 0.5, y + 0.5, st.ents)) { const [sx, sy] = w2s(x + (flip() ? 1 : 0), y + (flip() ? 1 : 0)); ctx.fillRect(sx, sy, T + 0.5, T + 0.5); }
      }
    }
    // decals (Orville's cracks)
    for (const d of G.decals) {
      d.t += dt;
      const [sx, sy] = w2s(d.x, d.y);
      ctx.save(); ctx.translate(sx, sy); ctx.scale(T, T * 0.6);
      ctx.globalAlpha = Math.max(0, 1 - d.t / d.dur);
      ctx.strokeStyle = '#3b3326'; ctx.lineWidth = 0.07;
      for (let k = 0; k < 5; k++) {
        const a = d.seed + k * 1.3;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5);
        ctx.lineTo(Math.cos(a + 0.4) * 0.9, Math.sin(a + 0.4) * 0.9); ctx.stroke();
      }
      ctx.restore();
    }
    G.decals = G.decals.filter(d => d.t < d.dur);
    // zones under units
    for (const z of st.zones) drawZone(z, now, false);

    // positions (smoothed for the guest)
    const pos = {};
    const k = Math.min(1, dt * 14);
    for (const e of st.ents) {
      let p = G.disp[e.id];
      if (!p || G.mode !== 'guest') { p = G.disp[e.id] = { x: e.x, y: e.y }; }
      else { if (Math.abs(p.x - e.x) + Math.abs(p.y - e.y) > 3) { p.x = e.x; p.y = e.y; } else { p.x += (e.x - p.x) * k; p.y += (e.y - p.y) * k; } }
      pos[e.id] = p;
      const an = G.anim[e.id] || (G.anim[e.id] = { walk: Math.random() * 6, lx: p.x, ly: p.y });
      const mv = Math.hypot(p.x - an.lx, p.y - an.ly);
      an.walk += mv * 7; an.lx = p.x; an.ly = p.y;
      an.spd = (an.spd || 0) * 0.8 + (dt > 0 ? mv / dt : 0) * 0.2;
    }
    if (Math.random() < 0.02) { for (const id in G.disp) if (!pos[id]) { delete G.disp[id]; delete G.anim[id]; } }

    const sy = e => (flip() ? ARENA_H - pos[e.id].y : pos[e.id].y);
    const ground = st.ents.filter(e => !e.air).sort((a, b) => sy(a) - sy(b));
    const air = st.ents.filter(e => e.air).sort((a, b) => sy(a) - sy(b));
    for (const e of ground) drawEnt(e, pos[e.id], now, st);
    // microwave beams
    for (const e of st.ents) {
      if (e.type !== 'microwave' || !e.tid || (e.flags & 16)) continue;
      const t = st.ents.find(o => o.id === e.tid);
      if (!t) continue;
      const a = pos[e.id], b = pos[t.id] || t;
      const [x1, y1] = w2s(a.x, a.y); const [x2, y2] = w2s(b.x, b.y);
      const y1o = y1 - 0.7 * T, y2o = y2 - (t.air ? 1.2 : 0.5) * T;
      ctx.lineCap = 'round';
      for (const [w, col] of [[0.35, 'rgba(255,90,0,0.35)'], [0.15, 'rgba(255,220,80,0.9)']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w * T; ctx.beginPath();
        for (let i = 0; i <= 10; i++) { const f = i / 10; const wob = Math.sin(now * 30 + i * 1.7) * 0.08 * T; ctx.lineTo(x1 + (x2 - x1) * f + wob, y1o + (y2o - y1o) * f + wob); }
        ctx.stroke();
      }
    }
    for (const e of air) drawEnt(e, pos[e.id], now, st);
    // projectiles
    for (const p of st.projs) {
      let d = G.disp['p' + p.id];
      if (!d || G.mode !== 'guest') d = G.disp['p' + p.id] = { x: p.x, y: p.y };
      else { d.x += (p.x - d.x) * Math.min(1, dt * 20); d.y += (p.y - d.y) * Math.min(1, dt * 20); }
      drawProj(p, d, now);
    }
    for (const z of st.zones) drawZone(z, now, true);
    // effects
    for (const f of G.fx) { f.t += dt; drawFx(f); }
    G.fx = G.fx.filter(f => f.t < f.dur);
    // ghost for the selected card
    if (selDef && G.hover) drawGhost(selId, selDef, G.hover, st);
    // Orville's speaker
    // Orville's speaker beat plays while an Orville troop is out - or while boss Orville is awake
    Sfx.beatTick(!G.over && st.ents.some(e => (e.type === 'orville' && !(e.flags & 16)) || (e.type === 'king' && G.boss && G.boss[e.owner] === 'orville' && (e.flags & 128))));
  }

  function hpBar(sx, sy, w, frac, team, num) {
    const h = Math.max(4, T * 0.2);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(sx - w / 2 - 1.5, sy - 1.5, w + 3, h + 3);
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(sx - w / 2, sy, w, h);
    ctx.fillStyle = team === 0 ? '#4aa3ff' : '#ff5a5a'; ctx.fillRect(sx - w / 2, sy, w * Math.max(0, frac), h);
    if (num !== undefined) {
      ctx.font = `bold ${Math.max(9, T * 0.42)}px Fredoka, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = '#1a1a1a'; ctx.strokeText(num, sx, sy - 2); ctx.fillStyle = '#fff'; ctx.fillText(num, sx, sy - 2);
      ctx.textAlign = 'left';
    }
  }

  // draw one frame of a sprite sheet with the current transform in tile units, feet at (0,0)
  function drawFrame(sp, row, idx) {
    const s = 1 / sp.ppm, F = sp.frame;
    ctx.drawImage(sp.img, idx * F, row * F, F, F, -sp.ax * s, -sp.ay * s, F * s, F * s);
  }

  function drawEnt(e, p, now, st) {
    const [sx, sy] = w2s(p.x, p.y);
    const team = e.owner === G.me ? 0 : 1;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(T, T);
    const screenX = flip() ? ARENA_W - p.x : p.x;
    const bossId = (e.type === 'king' || e.type === 'rubble_king') && G.boss && G.boss[e.owner];
    if (e.type === 'rubble_king' && bossId && SPR['boss_' + bossId + '_t']) {
      // a beaten boss lies knocked out where he stood
      drawFrame(SPR['boss_' + bossId + '_t'], team === 0 ? 3 : 1, 0);
      ctx.restore(); return;
    }
    if (e.type === 'rubble' || e.type === 'rubble_king') {
      const sp = SPR[e.type === 'rubble' ? 'princess_ko' : 'king_ko'];
      if (sp) { if (screenX > 9) ctx.scale(-1, 1); drawFrame(sp, 0, 0); } else Draw.rubble(ctx);
      ctx.restore(); return;
    }
    const an = G.anim[e.id] || { walk: 0 };
    const a = { walk: an.walk, atk: e.atk || 0, t: now + e.id * 0.37, e };
    if (e.kind === 'tower' && bossId && SPR['boss_' + bossId]) {
      // giant boss troop in place of the house: faces you when it's the enemy's, faces away when it's yours
      const sp = SPR['boss_' + bossId], spt = SPR['boss_' + bossId + '_t'], back = team === 0;
      const bd = BOSSES[bossId], dy = back ? 0 : (bd.drawDy || 0);   // the enemy's boss stands a bit forward so his head clears the top
      ctx.translate(0, dy);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.9); g.addColorStop(0, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.scale(1, 0.5); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1.9, 0, 7); ctx.fill(); ctx.restore();
      // Matthew is away mid flying-slam: only his shadow stays home
      const away = st && st.zones && st.zones.some(z => z.type === 'flyslam' && z.owner === e.owner && z.t >= 0.3 && z.t <= 1.35);
      if (away) { /* drawn at the slam spot instead */ }
      else if ((e.flags & 512) && spt) {
        let idx = Math.floor(now * 12) % spt.walk;
        if (bd.special.type === 'flyslam') {   // taking off (frames 0-2) or landing back home (frames 6-7)
          const fz = st.zones.find(z => z.type === 'flyslam' && z.owner === e.owner);
          idx = fz && fz.t > 1.35 ? 6 + Math.floor(now * 6) % 2 : Math.floor(now * 6) % 3;
        }
        drawFrame(spt, back ? 2 : 0, idx);
      }
      else {
        const attacking = (e.atk || 0) > 0.02, n = attacking ? sp.attack : sp.walk;
        const idx = attacking ? Math.min(n - 1, Math.floor((1 - e.atk) * n)) : !(e.flags & 128) ? 0 : Math.floor(now * 6) % n;
        drawFrame(sp, (back ? 2 : 0) + (attacking ? 1 : 0), idx);
      }
      if (!(e.flags & 128)) { ctx.fillStyle = '#fff'; ctx.font = 'bold 0.6px sans-serif'; ctx.fillText('z', 1.0, -4.4 - (now % 1) * 0.3); ctx.fillText('Z', 1.4, -5.0 - (now % 1) * 0.3); }
      ctx.restore();
      const top = Math.max(OY + 14, w2s(p.x, p.y)[1] - ((bd.hpBar || 3.6) - dy) * T);
      hpBar(sx, top, T * 3.2, e.hp / e.maxHp, team, Math.ceil(e.hp));
      return;
    }
    if (e.kind === 'tower') {
      const sp = SPR[e.type + team];
      if (sp) {
        if (e.type === 'princess') {
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.8); g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.save(); ctx.scale(1, 0.5); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0.2, 0, 1.8, 0, 7); ctx.fill(); ctx.restore();
        }
        const screenUp = e.type === 'princess' && ((e.flags & 256) ? !flip() : flip());
        const attacking = (e.atk || 0) > 0.02;
        const row = (screenUp ? 2 : 0) + (attacking ? 1 : 0);
        const n = attacking ? sp.attack : sp.walk;
        const idx = attacking ? Math.min(n - 1, Math.floor((1 - e.atk) * n)) : (e.type === 'king' && !(e.flags & 128)) ? 0 : Math.floor(now * 5 + e.id) % n;
        if (e.type === 'princess' && screenX > 9) ctx.scale(-1, 1);
        drawFrame(sp, row, idx);
      } else Draw[e.type](ctx, a, team);
      if (e.type === 'king' && !(e.flags & 128)) { ctx.fillStyle = '#fff'; ctx.font = 'bold 0.5px sans-serif'; ctx.fillText('z', 0.6, -3.6 - (now % 1) * 0.3); ctx.fillText('Z', 0.9, -4.1 - (now % 1) * 0.3); }
      ctx.restore();
      const top = Math.max(OY + 14, w2s(p.x, p.y)[1] - (e.type === 'king' ? 3.3 : 3.2) * T);  // never under the top bar
      hpBar(sx, top, T * (e.type === 'king' ? 3 : 2.2), e.hp / e.maxHp, team, Math.ceil(e.hp));
      return;
    }
    // shadow + team ring
    const rr = Math.max(0.28, e.r * 0.9) * (e.kind === 'unit' ? 1.15 : 1);
    { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr * 1.2); g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.scale(1, 0.45); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rr * 1.2, 0, 7); ctx.fill(); ctx.restore(); }
    // Boss Raid: your teammate's troops get a gold ring instead of blue
    const mate = G.coop && team === 0 && e.kind !== 'tower' && (G.slot === 2 ? e.pl !== 2 : e.pl === 2);
    ctx.strokeStyle = mate ? '#ffd23f' : TEAM[team]; ctx.lineWidth = mate ? 0.1 : 0.07;
    ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    const deploying = e.flags & 16;
    if (deploying) { ctx.globalAlpha = 0.55; }
    if (e.kind === 'unit') ctx.scale(UNIT_SCALE, UNIT_SCALE);
    if (e.air) ctx.translate(0, -0.9 + Math.sin(now * 3 + e.id) * 0.06);
    if (e.kind === 'unit') {
      let dir = e.dir * (flip() ? -1 : 1);
      if (dir < 0) { ctx.scale(-1, 1); SHADE.lx = 1; } // keep the light coming from the same side
    }
    if (e.flags & 4) { ctx.shadowColor = 'rgba(255,40,40,0.9)'; ctx.shadowBlur = 12; }
    const fn = Draw[e.type];
    const sp = SPR[e.type];
    if (sp) {
      // pick the sprite row: walking toward or away from the camera, walking or attacking
      const screenUp = (e.flags & 256) ? !flip() : flip();
      const attacking = (e.atk || 0) > 0.02;
      const row = (screenUp ? 2 : 0) + (attacking ? 1 : 0);
      const n = attacking ? sp.attack : sp.walk;
      const moving = (an.spd || 0) > 0.15;
      const idx = attacking ? Math.min(n - 1, Math.floor((1 - e.atk) * n)) : moving ? Math.floor(an.walk * 1.1) % n : 0;
      const s = 1 / sp.ppm, F = sp.frame;
      ctx.drawImage(sp.img, idx * F, row * F, F, F, -sp.ax * s, -sp.ay * s, F * s, F * s);
    } else if (fn) fn(ctx, a, team);
    ctx.shadowBlur = 0;
    SHADE.lx = -1;
    ctx.restore();
    // status bits
    const headY = sy - (e.r * (e.kind === 'unit' ? 2.3 * UNIT_SCALE : 2.3) + (e.air ? 0.9 : 0) + (e.kind === 'building' ? 0.4 : 0)) * T;
    if (e.flags & 1) { // stunned: stars
      for (let i = 0; i < 3; i++) { const ang = now * 5 + i * 2.1; ctx.fillStyle = '#ffe14d'; ctx.font = `${T * 0.4}px sans-serif`; ctx.fillText('★', sx + Math.cos(ang) * T * 0.35 - T * 0.15, headY + Math.sin(ang) * T * 0.12); }
    }
    if (e.flags & 2) { ctx.fillStyle = 'rgba(150,110,255,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy - e.r * T, e.r * T * 1.1, e.r * T * 1.4, 0, 0, 7); ctx.fill(); }
    if (e.flags & 32) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); const yy = sy - (0.3 + i * 0.3) * T; ctx.moveTo(sx - T * 0.9, yy); ctx.lineTo(sx - T * 1.4, yy); ctx.stroke(); } }
    if (e.hp < e.maxHp && !deploying && !(e.flags & 8)) hpBar(sx, headY - T * 0.15, Math.max(T * 0.9, e.r * T * 1.6), e.hp / e.maxHp, team);
  }

  const PROJ_COL = { spit: '#9ccc3c', poop: '#6b4423', bigpoop: '#6b4423', pizza: '#f39c12', bottle: '#eaf6ff', bullet: '#ffe066', dynamite: '#d63031', bomb: '#222', smoke: '#ddd', cap: '#c0c0c0', can: '#bdc3c7' };
  function drawProj(p, d, now) {
    const [sx, sy] = w2s(d.x, d.y);
    ctx.save(); ctx.translate(sx, sy - T * 0.55); ctx.scale(T, T);
    const s = p.style;
    const sp3 = SPR['p_' + s];
    if (sp3) {
      // 3D projectile: a soft shadow on the ground under it, then the spinning model up in the air
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, 0.55, 0.16, 0.07, 0, 0, 7); ctx.fill();
      if (s === 'bass' || s === 'bullet') { ctx.shadowColor = s === 'bass' ? 'rgba(170,90,255,0.9)' : 'rgba(255,200,60,0.9)'; ctx.shadowBlur = 12; }
      const k3 = { bass: 1.45, bigpoop: 1.6, box: 1.55, bullet: 1.4, waffle: 1.7, smoke: 1.7 }[s] || 1.9;   // drawn bigger than life so they read on a phone
      ctx.scale(k3, k3);
      drawFrame(sp3, 0, Math.floor(now * 16 + (p.id || 0) * 3) % (sp3.frames || 8));
      ctx.restore(); return;
    }
    if (s === 'poop' || s === 'bigpoop') { const r = s === 'bigpoop' ? 0.28 : 0.14; circ(ctx, 0, 0, r, '#6b4423'); circ(ctx, -r * 0.3, -r * 0.4, r * 0.45, '#f5f5f5', false); }
    else if (s === 'spit') { circ(ctx, 0, 0, 0.12, '#9ccc3c'); }
    else if (s === 'pizza') { ctx.rotate(now * 10); poly(ctx, [0, -0.2, 0.18, 0.15, -0.18, 0.15], '#f9c74f'); circ(ctx, 0, 0.02, 0.04, '#c0392b', false); }
    else if (s === 'bottle') { ctx.rotate(now * 12); rrect(ctx, -0.07, -0.16, 0.14, 0.28, 0.04, '#eaf6ff'); circ(ctx, 0, -0.19, 0.05, '#ffb6c1'); }
    else if (s === 'bullet') { ctx.fillStyle = '#ffe066'; ctx.fillRect(-0.25, -0.03, 0.5, 0.06); }
    else if (s === 'dynamite') { dynamite(ctx, 0, 0.1, now * 12, now); }
    else if (s === 'bomb') { circ(ctx, 0, 0, 0.2, '#222'); circ(ctx, 0.08, -0.22, 0.06, '#ff9f1a', false); }
    else if (s === 'smoke') { circ(ctx, 0, 0, 0.22, 'rgba(225,225,225,0.85)', false); circ(ctx, 0.12, -0.1, 0.15, 'rgba(240,240,240,0.85)', false); }
    else if (s === 'can') { ctx.rotate(now * 10); rrect(ctx, -0.1, -0.14, 0.2, 0.28, 0.04, '#bdc3c7'); }
    else if (s === 'drumstick') { ctx.rotate(now * 12); ell(ctx, 0.06, 0, 0.16, 0.11, '#b8642a'); line(ctx, -0.1, 0, -0.22, 0, 0.05, '#f3ead8'); circ(ctx, -0.25, 0, 0.05, '#f3ead8'); }
    else if (s === 'slipper') { ctx.rotate(now * 14); ell(ctx, 0, 0, 0.2, 0.09, '#ff9ec7'); ell(ctx, 0.06, 0, 0.09, 0.07, '#ffc6de', false); }
    else if (s === 'waffle') { ctx.rotate(now * 9); circ(ctx, 0, 0, 0.24, '#d9a441'); ctx.strokeStyle = '#b07d2a'; ctx.lineWidth = 0.04; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 0.1, -0.2); ctx.lineTo(i * 0.1, 0.2); ctx.moveTo(-0.2, i * 0.1); ctx.lineTo(0.2, i * 0.1); ctx.stroke(); } circ(ctx, 0.04, -0.03, 0.08, '#9a4e0c', false); }   // Matthew's waffles
    else if (s === 'bass') {   // Orville's bass blasts: pulsing sound rings
      ctx.strokeStyle = 'rgba(190,120,255,0.95)'; ctx.lineWidth = 0.07;
      for (let i = 0; i < 3; i++) { const r = 0.12 + ((now * 3 + i / 3) % 1) * 0.3; ctx.globalAlpha = 1 - ((now * 3 + i / 3) % 1); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1; circ(ctx, 0, 0, 0.1, '#e0b3ff', false);
    }
    else if (s === 'box') { ctx.rotate(now * 7); rrect(ctx, -0.24, -0.2, 0.48, 0.4, 0.04, '#c48a4a'); ctx.fillStyle = '#e8d3a0'; ctx.fillRect(-0.05, -0.2, 0.1, 0.4); }   // Killer20046's cardboard boxes
    else { circ(ctx, 0, 0, 0.1, PROJ_COL[s] || '#ccc'); }
    ctx.restore();
  }

  // Killer20046's cart rush: a line of 3D shopping carts barrelling down a lane, kicking up dust
  function drawCartRush(z, now) {
    const sp = SPR.cart_fx, dir = z.owner === 1 ? 1 : -1, n = 4;
    const towardMe = z.owner !== G.me;          // the enemy's carts roll toward you, yours roll away
    for (let i = n - 1; i >= 0; i--) {
      const wy = z.y - dir * i * 1.3;
      if (dir > 0 ? wy < 4.2 : wy > 27.8) continue;     // still behind the boss
      const [sx, sy] = w2s(z.x + Math.sin(now * 20 + i) * 0.05, wy);
      ctx.fillStyle = 'rgba(200,190,170,0.45)';
      ctx.beginPath(); ctx.ellipse(sx, sy - (towardMe ? -0.4 : 0.4) * T, T * 0.8, T * 0.32, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(sx, sy); const k = T * 1.8; ctx.scale(k, k);
      if (sp) drawFrame(sp, towardMe ? 0 : 2, 0);
      else { rrect(ctx, -0.4, -0.7, 0.8, 0.6, 0.08, '#c8ced6'); }
      ctx.restore();
    }
  }
  function drawZone(z, now, over) {
    if (z.type === 'cartrush') { if (over) drawCartRush(z, now); return; }
    if (z.type === 'flyslam') {
      // Matthew flies over and drops onto the target: shadow grows, he falls in, lands flat, then flies home
      if (!over) {
        if (z.t < 1.35) { const [sx, sy] = w2s(z.x, z.y), p = Math.min(1, z.t / 0.9); ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.3 * p})`; ctx.beginPath(); ctx.ellipse(sx, sy, T * 3 * (0.4 + 0.6 * p), T * 1.8 * (0.4 + 0.6 * p), 0, 0, 7); ctx.fill(); }
        return;
      }
      const bid = G.boss && G.boss[z.owner], spt = bid && SPR['boss_' + bid + '_t'];
      if (!spt || z.t < 0.3 || z.t > 1.35) return;
      const [sx, sy] = w2s(z.x, z.y), back = z.owner === G.me;
      const fall = z.t < 0.9 ? (0.9 - z.t) / 0.6 : 0;
      ctx.save(); ctx.translate(sx, sy - fall * 7 * T); ctx.scale(T, T);
      drawFrame(spt, back ? 2 : 0, z.t < 0.9 ? 3 : (z.t < 1.15 ? 4 : 5));
      ctx.restore();
      return;
    }
    if (z.type === 'hotbox' || z.type === 'stink') {
      // Alain Medina's hotbox (grey smoke) / Orville's stink cloud (green): a big 3D cloud that swells up, billows, then thins out
      const bid = G.boss && G.boss[z.owner], bd = BOSSES[bid] || BOSSES.alain;
      const sp = z.type === 'stink' ? ((bd.special.moves || []).find(m => m.type === 'stink') || BOSSES.orville.special.moves[1]) : bd.special;
      const stink = z.type === 'stink';
      const [sx, sy] = w2s(z.x, z.y), R = sp.radius * T;
      if (!over) { ctx.fillStyle = stink ? 'rgba(120,200,60,0.22)' : 'rgba(150,170,130,0.18)'; ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.62, 0, 0, 7); ctx.fill(); return; }
      const hs = SPR.hotbox_fx;
      const fade = Math.min(1, z.t / 0.4, Math.max(0, (sp.dur - z.t) / 0.8));
      const grow = Math.min(1, 0.45 + z.t * 1.6);
      ctx.save(); ctx.globalAlpha = 0.78 * fade; ctx.translate(sx, sy);
      if (stink) ctx.filter = 'sepia(1) hue-rotate(40deg) saturate(3.5) brightness(0.9)';   // same cloud, stinky green
      if (hs) { const k = T * (sp.radius / 3.9) * grow; ctx.scale(k, k); drawFrame(hs, 0, Math.floor(now * 8) % (hs.frames || 8)); }
      else { ctx.fillStyle = '#d2d8cb'; ctx.beginPath(); ctx.ellipse(0, -T * 0.5, R * grow, R * 0.6 * grow, 0, 0, 7); ctx.fill(); }
      ctx.restore(); ctx.globalAlpha = 1;
      return;
    }
    const def = DEFS[z.type];
    const [sx, sy] = w2s(z.x, z.y);
    const R = (def.radius || 2) * T;
    if (!over) {
      if (z.type === 'steroids') {
        ctx.fillStyle = `rgba(255,40,40,${0.18 + Math.sin(now * 8) * 0.06})`; ctx.strokeStyle = 'rgba(255,60,60,0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.fill(); ctx.stroke();
      } else if (z.type === 'blinker') {
        const left = 1 - z.t / def.dur;
        ctx.fillStyle = `rgba(140,90,255,${0.25 * left + 0.05})`; ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.fill();
        const on = Math.floor(now * 4) % 2;
        ctx.strokeStyle = on ? 'rgba(255,60,60,0.9)' : 'rgba(60,110,255,0.9)'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        const cs = SPR.cone_fx;
        // 3D traffic cones around the checkpoint, their light bars flashing red / blue (back ones first so front ones overlap)
        const cones = [0, 1, 2, 3, 4, 5].map(i => { const a = i / 6 * Math.PI * 2 + 0.26; return { x: sx + Math.cos(a) * R, y: sy + Math.sin(a) * R * 0.9, i }; }).sort((p, q) => p.y - q.y);
        for (const c of cones) {
          ctx.save(); ctx.translate(c.x, c.y);
          if (cs) { ctx.scale(T * 1.2, T * 1.2); drawFrame(cs, 0, (on + c.i) % 2); }
          else { ctx.scale(T * 0.5, T * 0.5); poly(ctx, [-0.4, 0, 0.4, 0, 0.1, -0.9, -0.1, -0.9], '#ff7f27'); }
          ctx.restore();
        }
      } else if ((z.type === 'meteor') && z.t < def.delay) {
        const p = z.t / def.delay;
        ctx.fillStyle = `rgba(0,0,0,${0.15 + p * 0.25})`; ctx.beginPath(); ctx.ellipse(sx, sy, R * (0.4 + p * 0.6), R * (0.4 + p * 0.6) * 0.6, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,80,0,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.stroke();
      } else if (z.type === 'akpigeons' && z.t < def.delay + 0.3) {
        ctx.strokeStyle = 'rgba(255,220,0,0.6)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      }
      return;
    }
    if (z.type === 'meteor' && z.t < def.delay) {
      const p = z.t / def.delay;
      const mx = sx + (1 - p) * 4 * T, my = sy - (1 - p) * 12 * T;
      const sp = SPR.meteor_fx;
      if (sp) {
        // 3D spinning meteor with its fire trail (grows a little as it gets closer)
        ctx.save(); ctx.translate(mx, my); const k = T * (1.3 + p * 0.5); ctx.scale(k, k);
        ctx.shadowColor = 'rgba(255,140,30,0.9)'; ctx.shadowBlur = 18;
        drawFrame(sp, 0, Math.floor(now * 16) % (sp.frames || 8)); ctx.restore();
      } else { ctx.save(); ctx.translate(mx, my); ctx.scale(T * 2, T * 2); Draw.meteor(ctx, { t: now }); ctx.restore(); }
    }
    if (z.type === 'akpigeons' && z.t < 1.3) {
      const p = z.t / 1.3;
      const dirSign = (z.owner === G.me) ? 1 : -1;
      for (let i = 0; i < 5; i++) {
        const px = sx + (p * 2 - 1) * 7 * T * dirSign + (i - 2) * T * 0.4, py = sy - 2.2 * T + (i - 2) * T * 0.9;
        ctx.save(); ctx.translate(px, py);
        const ap = SPR.akpig_fx;
        if (ap) { ctx.scale(T * 0.95 * dirSign, T * 0.95); drawFrame(ap, 0, Math.floor(now * 14 + i * 2) % (ap.frames || 6)); }   // 3D flapping pigeon with its AK
        else { ctx.scale(T * 0.9 * dirSign, T * 0.9); Draw.akpigeons(ctx, { t: now + i }); }
        ctx.restore();
      }
    }
    if (z.type === 'toot' && SPR.toot_fx) {
      // 3D fart cloud: blooms out over 0.6 s, then billows and fades
      const sp = SPR.toot_fx, n = sp.frames || 10;
      const idx = z.t < 0.6 ? Math.min(n - 1, Math.floor(z.t / 0.6 * n)) : n - 4 + Math.floor(now * 6) % 4;
      const fade = z.t < 0.7 ? 1 : Math.max(0, 1 - (z.t - 0.7) / 0.5);
      ctx.save(); ctx.globalAlpha = 0.9 * fade; ctx.translate(sx, sy); const k = T * (def.radius / 2.5) * 1.15; ctx.scale(k, k);
      drawFrame(sp, 0, idx); ctx.restore(); ctx.globalAlpha = 1;
    } else if (z.type === 'toot') {
      const p = Math.min(1, z.t / 0.3), fade = Math.max(0, 1 - z.t / 1.2);
      ctx.globalAlpha = fade * 0.8;
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + z.t;
        ctx.fillStyle = i % 2 ? '#9ccc65' : '#b5d96f';
        ctx.beginPath(); ctx.arc(sx + Math.cos(a) * R * 0.55 * p, sy + Math.sin(a) * R * 0.4 * p, R * 0.45 * p, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (z.type === 'steroids') {
      const rs = SPR.roid_fx;
      if (rs) {   // 3D syringe bobbing over the zone, plunger pumping
        ctx.save(); ctx.translate(sx, sy); ctx.scale(T * 1.6, T * 1.6); ctx.shadowColor = 'rgba(255,40,40,0.8)'; ctx.shadowBlur = 14;
        drawFrame(rs, 0, Math.floor(now * 10) % (rs.frames || 8)); ctx.restore();
      } else { ctx.save(); ctx.translate(sx, sy - T * 0.2); ctx.scale(T * 0.9, T * 0.9); ctx.globalAlpha = 0.85; Draw.steroids(ctx, { t: now }); ctx.restore(); ctx.globalAlpha = 1; }
    }
    if (z.type === 'hurricane') {
      // swirling wind bands, rain streaks and the odd flying flamingo
      const fade = Math.min(1, z.t * 3, Math.max(0, (def.dur - z.t) * 2));
      ctx.save(); ctx.translate(sx, sy); ctx.globalAlpha = 0.75 * fade;
      for (let k = 0; k < 5; k++) {
        ctx.save(); ctx.rotate(now * (3 + k * 0.4) + k * 1.3); ctx.scale(1, 0.55);
        ctx.lineWidth = T * (0.35 - k * 0.04); ctx.strokeStyle = ['#8aa2b8', '#b9c9d8', '#dfe8f0', '#7890a6', '#cfdbe6'][k];
        ctx.beginPath(); ctx.arc(0, 0, R * (0.25 + k * 0.17), 0, 3.6); ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(160,200,255,0.6)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) { const a = i * 0.52 + now * 4, r = R * ((i * 0.37 + now * 0.6) % 1); ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.55 - T); ctx.lineTo(Math.cos(a) * r - T * 0.2, Math.sin(a) * r * 0.55 - T * 0.4); ctx.stroke(); }
      // the 3D funnel in the middle, spinning, with junk flying round it
      const hs = SPR.storm_fx;
      if (hs) {
        ctx.globalAlpha = 0.92 * fade;
        const grow = Math.min(1, 0.4 + z.t * 2);
        const k = T * (def.radius / 3.5) * 1.1 * grow; ctx.scale(k, k);
        drawFrame(hs, 0, Math.floor(now * 14) % (hs.frames || 8));
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }

  function drawFx(f) {
    const p = f.t / f.dur;
    const [sx, sy0] = w2s(f.x, f.y);
    const sy = sy0 - (f.air ? 0.9 * T : 0);
    const R = f.r * T;
    ctx.save();
    switch (f.k) {
      case 'poof':
        ctx.globalAlpha = 1 - p; ctx.fillStyle = '#fff';
        for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * R * p, sy - T * 0.3 + Math.sin(a) * R * p * 0.5, T * 0.25 * (1 - p * 0.5), 0, 7); ctx.fill(); }
        break;
      case 'death':
        if (SPR.poof_fx) {
          // 3D cartoon poof with little stars, sized to the troop (flying troops poof up in the air)
          const sp = SPR.poof_fx, n = sp.frames || 8;
          ctx.globalAlpha = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
          ctx.translate(sx, sy); const k = T * (0.9 + Math.min(1, f.r) * 1.0); ctx.scale(k, k);
          drawFrame(sp, 0, Math.min(n - 1, Math.floor(p * n)));
          break;
        }
        ctx.globalAlpha = 1 - p; ctx.fillStyle = '#ddd';
        for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28 + 0.5; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * T * 0.5 * p, sy - T * 0.4 - p * T * 0.5 + Math.sin(a) * T * 0.3 * p, T * 0.22, 0, 7); ctx.fill(); }
        break;
      case 'hit':
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
        for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * T * 0.15, sy - T * 0.5 + Math.sin(a) * T * 0.15); ctx.lineTo(sx + Math.cos(a) * T * (0.3 + p * 0.3), sy - T * 0.5 + Math.sin(a) * T * (0.3 + p * 0.3)); ctx.stroke(); }
        break;
      case 'splat': {
        const col = { spit: '#9ccc3c', poop: '#6b4423', bigpoop: '#6b4423', pizza: '#f39c12', bottle: '#ffffff', bullet: '#ffe066', cap: '#ddd', can: '#ddd', drumstick: '#b8642a', slipper: '#ff9ec7', box: '#c48a4a' }[f.c] || '#ddd';
        ctx.globalAlpha = 1 - p; ctx.fillStyle = col;
        const rr = Math.max(R, T * 0.3);
        for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * rr * (0.4 + p * 0.6), sy - T * 0.3 + Math.sin(a) * rr * 0.5 * (0.4 + p * 0.6), T * 0.12, 0, 7); ctx.fill(); }
        if (f.c === 'bigpoop' || f.c === 'bottle') { ctx.globalAlpha = (1 - p) * 0.5; ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * 0.5, 0, 0, 7); ctx.fill(); }
        break;
      }
      case 'mboom':
      case 'boom': {
        // 3D explosion (meteor, bombs, dynamite, death blasts, towers falling), sized to the blast;
        // the flat burst is the backup if the sprite isn't loaded
        const sp = SPR.boom_fx;
        if (sp) {
          const n = sp.frames || 9;
          ctx.globalAlpha = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
          ctx.translate(sx, sy0); const k = T * (Math.max(0.9, f.r) / 2.5) * 1.6; ctx.scale(k, k);
          drawFrame(sp, 0, Math.min(n - 1, Math.floor(p * n)));
          break;
        }
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = '#ffdd55'; ctx.beginPath(); ctx.arc(sx, sy - T * 0.3, R * (0.3 + p * 0.8), 0, 7); ctx.fill();
        ctx.fillStyle = '#ff7b00'; ctx.beginPath(); ctx.arc(sx, sy - T * 0.3, R * (0.2 + p * 0.6), 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(60,60,60,0.7)'; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * R * p, sy - T * 0.3 - p * T + Math.sin(a) * R * p * 0.5, T * 0.3, 0, 7); ctx.fill(); }
        break;
      }
      case 'smoke':
        ctx.globalAlpha = (1 - p) * 0.85; ctx.fillStyle = '#e8e8e8';
        for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * R * 0.6 * (0.5 + p), sy - T * 0.3 + Math.sin(a) * R * 0.35 * (0.5 + p), R * 0.45, 0, 7); ctx.fill(); }
        break;
      case 'shock': {
        // boss tantrum shockwave: a ground ring rolling out with dust
        ctx.globalAlpha = 1 - p;
        const rr = R * (0.25 + p * 0.9);
        ctx.strokeStyle = 'rgba(255,240,200,0.95)'; ctx.lineWidth = T * 0.35 * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * 0.55, 0, 0, 7); ctx.stroke();
        if (f.c === 'bass') {
          // Orville's bass drop: purple soundwave rings rolling across his whole half
          ctx.strokeStyle = 'rgba(190,120,255,0.9)';
          for (let i = 0; i < 3; i++) { const q = Math.max(0, p - i * 0.12); const r2 = R * (0.15 + q * 0.85); ctx.lineWidth = T * 0.25 * (1 - q) + 1; ctx.beginPath(); ctx.ellipse(sx, sy, r2, r2 * 0.55, 0, 0, 7); ctx.stroke(); }
        } else if (f.c === 'notes') {
          // Buck's banjo blast: music notes riding the soundwave
          ctx.font = `${Math.max(12, T * 0.9)}px sans-serif`; ctx.textAlign = 'center';
          for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28 + p; ctx.fillStyle = i % 2 ? '#ffd23f' : '#ffffff'; ctx.fillText(i % 3 ? '♪' : '♫', sx + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.55 - T * 0.4 - p * T * 0.6); }
        } else {
          ctx.fillStyle = 'rgba(190,160,110,0.7)';
          for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.55 - T * 0.2, T * 0.3 * (1 - p * 0.5), 0, 7); ctx.fill(); }
        }
        break;
      }
      case 'spin':
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(sx, sy - T * 0.4, R * (0.6 + p * 0.4), R * 0.4 * (0.6 + p * 0.4), 0, 0, 7); ctx.stroke();
        break;
      case 'bullets':
        ctx.globalAlpha = 1 - p; ctx.fillStyle = '#c8b68a';
        for (let i = 0; i < 14; i++) { const a = i * 2.4, rr = R * ((i * 0.37) % 1); ctx.beginPath(); ctx.arc(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.6, T * 0.15 * (1 + p), 0, 7); ctx.fill(); }
        break;
      case 'word': {
        const size = Math.max(14, T * 0.85);
        ctx.font = `${size}px 'Luckiest Guy', Impact, sans-serif`; ctx.textAlign = 'center';
        const yy = sy - T * 1.6 - p * T * 1.2;
        ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
        ctx.translate(sx, yy); ctx.rotate(-0.12); const sc = p < 0.15 ? 0.5 + p / 0.15 * 0.6 : 1.1 - Math.min(0.1, p); ctx.scale(sc, sc);
        ctx.lineWidth = 5; ctx.strokeStyle = '#1a1a1a'; ctx.strokeText(f.w, 0, 0);
        ctx.fillStyle = '#ffe14d'; ctx.fillText(f.w, 0, 0);
        break;
      }
    }
    ctx.restore();
  }

  function drawGhost(id, def, h, st) {
    const ok = canPlace(G.me, def.kind, Math.round(h.x * 2) / 2, Math.round(h.y * 2) / 2, st.ents) && st.elixir >= def.cost;
    const x = Math.round(h.x * 2) / 2, y = Math.round(h.y * 2) / 2;
    const [sx, sy] = w2s(x, y);
    if (def.kind === 'spell') {
      ctx.strokeStyle = ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,60,60,0.9)'; ctx.fillStyle = ok ? 'rgba(255,255,255,0.15)' : 'rgba(255,60,60,0.15)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(sx, sy, def.radius * T, 0, 7); ctx.fill(); ctx.stroke();
      return;
    }
    ctx.globalAlpha = ok ? 0.65 : 0.35;
    const offs = Sim.prototype.formation(def.count || 1, def.r);
    const fl = G.me === 0 ? 1 : -1;
    for (const [ox, oy] of offs) {
      const [px, py] = w2s(x + ox * fl, y + oy * fl);
      ctx.save(); ctx.translate(px, py); ctx.scale(T, T);
      if (def.air) ctx.translate(0, -0.9);
      if (def.kind === 'troop') ctx.scale(UNIT_SCALE, UNIT_SCALE);
      if (SPR[id]) { const sp = SPR[id], s2 = 1 / sp.ppm, F = sp.frame, row = sp.rows && def.kind === 'troop' ? 2 : 0; ctx.drawImage(sp.img, 0, row * F, F, F, -sp.ax * s2, -sp.ay * s2, F * s2, F * s2); }
      else if (Draw[id]) Draw[id](ctx, { walk: 0, atk: 0, t: performance.now() / 1000, e: null }, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (def.range && def.range > 2) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, def.range * T, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  }

  // debug handle for testing in a browser console
  window.__tr = { get G() { return G; }, pump(n = 10) { let t = performance.now(); for (let i = 0; i < n; i++) { t += 33; frame(t); } }, step(sec) { if (G && G.sim) { for (let i = 0; i < sec / STEP; i++) { G.sim.step(STEP); if (G.bot) G.bot.update(STEP); } G.sim.events.splice(0).forEach(handleEvent); } } };

  // ---------------- loading screen: 3D sprites + sounds ----------------
  const SPRITE_VER = 3;
  const SPRITE_IDS = CARDS.map(c => c.id).concat(['turd', 'king0', 'king1', 'princess0', 'princess1', 'king_ko', 'princess_ko', 'chest_small', 'chest_medium', 'chest_huge', 'meteor_fx', 'boom_fx', 'toot_fx', 'akpig_fx', 'cone_fx', 'roid_fx', 'storm_fx', 'poof_fx', 'cart_fx', 'hotbox_fx', ...['spit', 'poop', 'bigpoop', 'bomb', 'dynamite', 'pizza', 'smoke', 'bottle', 'bullet', 'drumstick', 'slipper', 'box', 'waffle', 'bass'].map(p => 'p_' + p)], ...Object.keys(BOSSES).flatMap(b => ['boss_' + b, 'boss_' + b + '_t']));
  const SOUND_IDS = ['pop', 'tick', 'nope', 'deploy', 'bonk', 'grunt', 'ptooey', 'splat', 'kick', 'stomp', 'plop', 'boom', 'fart', 'blinker', 'rage',
    'thwump', 'hiss', 'ding', 'bottle', 'waah', 'snipe', 'whack', 'heehaw', 'flush', 'squish', 'squeak', 'clank', 'chomp', 'yap', 'crash', 'horn',
    'whoosh', 'burp', 'slam', 'cap', 'can', 'hit', 'towerDown', 'dynamite', 'win', 'growl', 'toot'];
  // bounding box of the visible pixels in the first frame (used to frame card pictures)
  function alphaBox(img, F) {
    try {
      const c = document.createElement('canvas'); c.width = F; c.height = F;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, F, F, 0, 0, F, F);
      const d = g.getImageData(0, 0, F, F).data;
      let x0 = F, y0 = F, x1 = 0, y1 = 0;
      for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) if (d[(y * F + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 <= x0) return null;
      return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    } catch (e) { return null; }
  }
  function loadSprite(id) {
    return fetch('sprites/' + id + '.json?v=' + SPRITE_VER).then(r => r.ok ? r.json() : null).then(meta => new Promise(res => {
      if (!meta) { res(); return; }
      const img = new Image();
      img.onload = () => {
        // houses draw a bit bigger; bosses are rendered at high detail and drawn giant (meta.gscale)
        const extra = id.startsWith('king') ? { ppm: meta.ppm / 1.12 } : meta.gscale ? { ppm: meta.ppm / meta.gscale } : {};
        SPR[id] = Object.assign(meta, { img, bb: alphaBox(img, meta.frame) }, extra); res();
      };
      img.onerror = () => res();
      img.src = 'sprites/' + id + '.webp?v=' + SPRITE_VER;
    })).catch(() => {});
  }
  function drawLoadArt(t) {
    const cvs = $('loadArt'), c = cvs.getContext('2d');
    c.clearRect(0, 0, cvs.width, cvs.height);
    const s = cvs.width / 9;
    c.save(); c.scale(s, s);
    spriteAt(c, 'king1', 4.5, 4.4, 0, Math.floor(t * 5) % 8);
    spriteAt(c, 'princess1', 1.6, 6.4, 0, Math.floor(t * 5) % 8);
    spriteAt(c, 'princess0', 7.4, 6.4, 0, Math.floor(t * 5 + 3) % 8, true);
    c.restore();
  }
  // Erick's loading theme (music/loading.mp3, ~3 s): plays once when the game starts. Browsers only allow sound
  // after the first tap, so if it's blocked it plays on the first tap during loading (at the latest "Tap to play").
  const loadTheme = new Audio('music/loading.mp3?v=1');
  let themeState = 'idle';   // idle -> playing -> done
  function playLoadTheme() {
    if (themeState !== 'idle' || Sfx.isMuted() || Music.vol() === 0) return;
    loadTheme.volume = Math.min(1, Music.vol() / 100 * 0.9);
    themeState = 'trying';
    loadTheme.play().then(() => {
      themeState = 'playing';
      const d = loadTheme.duration;   // can be NaN/Infinity before the file's length is known
      Music.hold((isFinite(d) && d > 0 ? Math.min(d, 8) : 3.2) * 1000);
    }).catch(() => { themeState = 'idle'; });
  }
  loadTheme.addEventListener('ended', () => { themeState = 'done'; });
  async function boot() {
    playLoadTheme();
    const tapForTheme = () => playLoadTheme();
    document.addEventListener('pointerdown', tapForTheme);
    let done = 0;
    const total = SPRITE_IDS.length + SOUND_IDS.length + 1;
    const tick = () => { done++; $('loadFill').style.width = Math.round(done / total * 100) + '%'; $('loadText').textContent = `Loading... ${Math.round(done / total * 100)}%`; };
    let tipI = Math.floor(Math.random() * TIPS.length);
    const showTip = () => { $('loadTip').innerHTML = '<b>TIP:</b> ' + esc(TIPS[tipI++ % TIPS.length]); };
    showTip();
    const tipTimer = setInterval(showTip, 3500);
    let artOn = true;
    (function anim() { if (!artOn) return; drawLoadArt(performance.now() / 1000); requestAnimationFrame(anim); })();
    // the house + guys first, so the loading art shows up quickly
    const first = ['king1', 'princess1', 'princess0'];
    await Promise.all(first.map(id => loadSprite(id).then(tick)));
    await Promise.all([
      ...SPRITE_IDS.filter(id => !first.includes(id)).map(id => loadSprite(id).then(tick)),
      ...SOUND_IDS.map(n => fetch(n === 'toot' ? 'sfx/toot.mp3?v=1' : 'sfx/' + n + '.wav?v=1').then(r => r.arrayBuffer()).catch(() => {}).then(tick)),
      (document.fonts ? document.fonts.ready : Promise.resolve()).then(tick),
    ]);
    // 3D arena pictures load in the background (your current arena first)
    (async () => { const cur = Progress.arena(); await loadArena3D(cur); for (let i = 0; i < ARENAS.length; i++) await loadArena3D(i); })();
    $('loadText').textContent = 'Ready!';
    $('loadGo').classList.remove('hidden');
    await new Promise(res => { $('loadGo').onclick = res; });
    playLoadTheme();
    document.removeEventListener('pointerdown', tapForTheme);
    Sfx.init();
    if (themeState !== 'playing' && themeState !== 'trying') Sfx.play('fight');   // the theme covers the start-up sound
    artOn = false; clearInterval(tipTimer);
    show('home');
    if (!username) await askName(false);
    else connectNet();
  }

  // ---------------- boot ----------------
  document.addEventListener('pointerdown', () => Sfx.init(), { once: true });
  document.addEventListener('contextmenu', e => e.preventDefault());
  show('loading');
  boot();
})();
