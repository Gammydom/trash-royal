// Trash Royal - chest opening show.
// The chest drops in and shakes, the lid pops open, then the cards fly out one by one and land
// facing the player. Tap (or Space / Enter) for the next card. Bonus coins burst out at the end.
const ChestFx = (() => {
  let root, cv, ctx, card, front, lvl, tapTxt, title, count, coinsTxt, tray, doneBtn;
  let raf = 0, S = null, tapRes = null;

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const $c = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

  function ensure() {
    if (root) return;
    root = $c('div', 'chestfx hidden', document.getElementById('app'));
    cv = $c('canvas', 'cf-cv', root); ctx = cv.getContext('2d');
    title = $c('div', 'cf-title', root);
    tray = $c('div', 'cf-tray', root);
    count = $c('div', 'cf-count', root);
    const stage = $c('div', 'cf-stage', root);
    card = $c('div', 'cf-card', stage);
    front = $c('div', 'cf-face cf-front', card);
    const back = $c('div', 'cf-face cf-back', card);
    back.innerHTML = '<div class="cf-back-in"><span>TRASH</span><b>ROYAL</b></div>';
    lvl = $c('div', 'cf-level', root);
    coinsTxt = $c('div', 'cf-coins', root);
    tapTxt = $c('div', 'cf-tap', root);
    doneBtn = $c('button', 'big-btn cf-done', root); doneBtn.textContent = 'COLLECT!';
    root.addEventListener('pointerdown', e => { if (e.target === doneBtn) return; e.preventDefault(); tapped(); });
    doneBtn.addEventListener('click', () => tapped());
    window.addEventListener('keydown', e => {
      if (!S || root.classList.contains('hidden')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tapped(); }
    });
    window.addEventListener('resize', () => { if (S) layout(); });
  }
  function tapped() { if (tapRes) { const r = tapRes; tapRes = null; r(); } }
  const tap = () => new Promise(r => { tapRes = r; });

  // ---------- layout ----------
  function layout() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    S.W = W; S.H = H; S.dpr = dpr;
    S.k = Math.min(W, 520, H * 0.6) / 384;                   // chest sprite scale
    S.cx = W / 2; S.baseY = H * 0.9;                          // where the chest sits
    S.cw = Math.min(W * 0.46, H * 0.25, 220); S.ch = S.cw * 1.32;
    // the card lands above the open chest, leaving room for its name + level line
    S.landY = Math.max(H * 0.2 + S.ch / 2, Math.min(H * 0.44, S.baseY - 200 * S.k - 70 - S.ch / 2));
    card.style.width = S.cw + 'px'; card.style.height = S.ch + 'px';
    card.style.marginLeft = -S.cw / 2 + 'px'; card.style.top = (S.landY - S.ch / 2) + 'px';
    lvl.style.top = (S.landY + S.ch / 2 + 12) + 'px';
    coinsTxt.style.top = (S.landY - 30) + 'px';
    count.style.top = (S.baseY - 130 * S.k) + 'px';
    count.style.left = (S.cx + 120 * S.k) + 'px';
  }
  const mouthY = () => S.baseY - 90 * S.k;

  // ---------- canvas: background, light rays, chest, sparkles, coins ----------
  function star(x, y, r, a) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.35 : r, an = a + i * Math.PI / 4; ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    ctx.closePath(); ctx.fill();
  }
  function burst(x, y, n, spread, colors) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * spread;
      S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spread * 0.4, life: 0, dur: 0.6 + Math.random() * 0.6, r: 3 + Math.random() * 5,
        c: colors[i % colors.length], spin: Math.random() * 6 });
    }
  }
  function drawChest(now) {
    const sp = SPR[S.chest.sprite];
    const t = now - S.t0;
    let y = S.baseY, rot = 0, sx = 1, sy = 1;
    if (t < 0.55) { const p = t / 0.55; y = S.baseY - (1 - p) * (1 - p) * S.H * 0.9; }      // falls in
    else if (t < 0.75) { const p = (t - 0.55) / 0.2; sy = 1 - Math.sin(p * Math.PI) * 0.18; sx = 1 + Math.sin(p * Math.PI) * 0.12; }  // squash on landing
    else if (t < 1.25 && !S.opened) rot = Math.sin(t * 45) * 0.06 * Math.min(1, (t - 0.75) * 4);                                       // rattles
    if (S.squash > 0) { sy *= 1 - S.squash * 0.12; sx *= 1 + S.squash * 0.08; S.squash = Math.max(0, S.squash - 0.06); }
    ctx.save(); ctx.translate(S.cx, y); ctx.rotate(rot); ctx.scale(sx, sy);
    // soft shadow
    const sh = { small: 0.62, medium: 0.78, huge: 1 }[S.chest.id] || 1;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 4, 120 * S.k * sh, 26 * S.k * sh, 0, 0, 7); ctx.fill();
    if (sp) {
      const F = sp.frame, k = S.k;
      const fi = S.opened ? Math.min(8, Math.floor((now - S.openAt) / 0.05)) : 0;
      const row = S.opened ? 0 : 1, col = S.opened ? fi : 0;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sp.img, col * F, row * F, F, F, -sp.ax * k, -sp.ay * k, F * k, F * k);
    } else {
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-90 * S.k, -90 * S.k, 180 * S.k, 90 * S.k);
    }
    ctx.restore();
  }
  function frame(nowMs) {
    if (!S) return;
    const now = nowMs / 1000, dt = Math.min(0.05, now - (S.last || now)); S.last = now;
    const { W, H, dpr } = S;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createRadialGradient(W / 2, H * 0.5, 10, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, S.chest.id === 'huge' ? '#5a3a10' : S.chest.id === 'medium' ? '#28344f' : '#3e2c1c'); g.addColorStop(1, '#0d0c0a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // light rays behind the card that's showing (or out of the open chest)
    S.rays += ((S.raysOn ? 1 : 0) - S.rays) * Math.min(1, dt * 4);
    if (S.rays > 0.01) {
      const rx = S.cx, ry = S.rayY;
      const R = Math.max(W, H);
      ctx.save(); ctx.translate(rx, ry); ctx.rotate(now * 0.35);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.6);
      rg.addColorStop(0, `rgba(255,226,130,${0.55 * S.rays})`); rg.addColorStop(1, 'rgba(255,226,130,0)');
      ctx.fillStyle = rg;
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a, a + 0.16); ctx.closePath(); ctx.fill(); }
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 160);
      glow.addColorStop(0, `rgba(255,240,190,${0.5 * S.rays})`); glow.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 160, 0, 7); ctx.fill();
      ctx.restore();
    }
    drawChest(now);
    // sparkles + coins
    for (const p of S.parts) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.coin ? 900 : 260) * dt;
      const a = 1 - p.life / p.dur; if (a <= 0) continue;
      ctx.globalAlpha = Math.min(1, a * 1.5);
      if (p.coin) {
        const w = Math.abs(Math.cos(p.life * p.spin)) * p.r;
        ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1.5, w + 0.5, p.r, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.ellipse(p.x, p.y, w, p.r, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(p.x - w * 0.3, p.y - p.r * 0.3, w * 0.25, p.r * 0.3, 0, 0, 7); ctx.fill();
      } else { ctx.fillStyle = p.c; star(p.x, p.y, p.r * a + 1, p.life * p.spin); }
    }
    ctx.globalAlpha = 1;
    S.parts = S.parts.filter(p => p.life < p.dur);
    raf = requestAnimationFrame(frame);
  }

  // ---------- one card: fly out of the chest, spin, land facing the player ----------
  async function flyOut(c, deps, n, total) {
    front.innerHTML = '';
    const tc = deps.makeCard(c.id, { px: 256 });
    front.appendChild(tc);
    card.style.visibility = 'visible';
    lvl.classList.remove('show'); lvl.innerHTML = '';
    S.squash = 1; S.raysOn = false;
    deps.Sfx.play('whoosh');
    burst(S.cx, mouthY(), 16, 220, ['#ffe066', '#fff4c2', '#ffb84d']);
    const dy = mouthY() - S.landY;
    const anim = card.animate([
      { transform: `translateY(${dy}px) scale(0.12) rotateY(-540deg) rotateZ(-25deg)`, offset: 0 },
      { transform: `translateY(-60px) scale(1.12) rotateY(-120deg) rotateZ(8deg)`, offset: 0.62 },
      { transform: `translateY(10px) scale(0.95) rotateY(0deg) rotateZ(-3deg)`, offset: 0.84 },
      { transform: `translateY(0px) scale(1) rotateY(0deg) rotateZ(0deg)`, offset: 1 },
    ], { duration: 820, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
    await anim.finished;
    S.rayY = S.landY; S.raysOn = true;
    deps.Sfx.play('pop');
    burst(S.cx, S.landY, 26, 330, ['#ffe066', '#ffffff', '#8bd346', '#ffd23f']);
    lvl.innerHTML = `<b>${deps.esc(DEFS[c.id].name)}</b><span>Lv ${c.from} <i>&#10140;</i> <em>Lv ${c.to}</em></span>`;
    lvl.classList.add('show');
    card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 260, delay: 180 });
    setTimeout(() => { if (S) deps.Sfx.play('ding'); }, 180);
    count.textContent = total - n - 1 > 0 ? `x${total - n - 1}` : '';
    count.classList.toggle('show', total - n - 1 > 0);
  }
  // tap: the card zips up into its slot in the tray at the top
  async function stash(c, i, deps) {
    lvl.classList.remove('show'); S.raysOn = false;
    const slot = tray.children[i];
    const r = slot.getBoundingClientRect();
    const tx = r.left + r.width / 2 - S.W / 2, ty = r.top + r.height / 2 - S.landY;
    const sc = r.width / S.cw;
    deps.Sfx.play('tick');
    const anim = card.animate([
      { transform: 'translate(0,0) scale(1) rotateZ(0deg)' },
      { transform: `translate(${tx}px, ${ty}px) scale(${sc}) rotateZ(12deg)` },
    ], { duration: 300, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
    await anim.finished;
    card.style.visibility = 'hidden';
    slot.innerHTML = ''; slot.appendChild(deps.makeCard(c.id, { px: 72 }));
    const b = document.createElement('div'); b.className = 'cf-slot-lv'; b.textContent = 'Lv ' + c.to; slot.appendChild(b);
    slot.classList.add('filled');
  }

  // ---------- the whole show ----------
  async function open(chest, result, deps) {
    ensure();
    S = { chest, parts: [], rays: 0, raysOn: false, rayY: 0, opened: false, openAt: 0, squash: 0, t0: performance.now() / 1000, last: 0 };
    root.classList.remove('hidden');
    root.dataset.tier = chest.id;
    layout();
    title.textContent = chest.name.toUpperCase();
    tray.innerHTML = '';
    result.cards.forEach(() => $c('div', 'cf-slot', tray));
    card.style.visibility = 'hidden'; lvl.classList.remove('show'); coinsTxt.classList.remove('show');
    tapTxt.classList.remove('show'); doneBtn.classList.remove('show');
    count.textContent = 'x' + result.cards.length; count.classList.remove('show');
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);

    await wait(560); deps.Sfx.play('thwump');
    await wait(700); deps.Sfx.play('clank');
    S.opened = true; S.openAt = performance.now() / 1000; S.rayY = mouthY(); S.raysOn = true;
    burst(S.cx, mouthY(), 30, 300, ['#ffe066', '#fff4c2', '#ffb84d']);
    count.classList.add('show');
    await wait(520);

    for (let i = 0; i < result.cards.length; i++) {
      await flyOut(result.cards[i], deps, i, result.cards.length);
      tapTxt.textContent = i < result.cards.length - 1 ? 'Tap for the next card' : 'Tap to continue';
      setTimeout(() => { if (S && tapRes) tapTxt.classList.add('show'); }, 350);
      await tap();
      tapTxt.classList.remove('show');
      await stash(result.cards[i], i, deps);
    }
    count.classList.remove('show');

    // bonus coins burst out of the chest
    S.squash = 1; S.rayY = mouthY(); S.raysOn = true;
    deps.Sfx.play('whoosh');
    for (let i = 0; i < 46; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = 380 + Math.random() * 420;
      S.parts.push({ coin: true, x: S.cx + (Math.random() - 0.5) * 40, y: mouthY(), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, dur: 1.4 + Math.random() * 0.6, r: 8 + Math.random() * 6, spin: 4 + Math.random() * 8 });
    }
    coinsTxt.classList.add('show');
    const t0 = performance.now(), dur = 900;
    await new Promise(res => {
      (function up() {
        const p = Math.min(1, (performance.now() - t0) / dur);
        coinsTxt.innerHTML = `+${Math.round(result.coins * p)} <span>&#129689;</span>`;
        if (p < 1) { if (Math.random() < 0.25) deps.Sfx.play('tick'); requestAnimationFrame(up); } else res();
      })();
    });
    deps.Sfx.play('win');
    doneBtn.classList.add('show');
    await tap();

    root.classList.add('hidden');
    cancelAnimationFrame(raf); S = null;
  }

  return { open };
})();
