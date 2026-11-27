// Trash Royal - battle simulation. Runs on the host (or locally vs the bot).
// Player 0 is at the bottom (big y), player 1 at the top.

const REG_TIME = 180, OT_TIME = 60, DEPLOY_T = 1.0;
const PHASE2_CUT = 10.5;   // seconds the battle stands still while Orville evolves (the cutscene)

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function d2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

// card/tower level -> stat multiplier (+10% per level)
const LV = l => 1 + 0.1 * ((l || 1) - 1);
// spells with no damage grow in other ways with each level (Erick: all three for both)
// Blinker: lasts 4 > 6 s, slows to 25% > 15% speed, radius 3 > 3.8. Steroids: lasts 6 > 10 s, 40% > 60% faster, radius 3 > 3.8 (level 1 > 9)
const SPELL_GROW = { blinker: { radius: 0.1, dur: 0.25, slow: -0.0125 }, steroids: { radius: 0.1, dur: 0.5, rage: 0.025 } };
function spellStats(def, lvl) {
  const k = Math.max(0, (lvl || 1) - 1), g = SPELL_GROW[def.id] || {}, o = {};
  for (const f of ['radius', 'dur', 'slow', 'rage']) if (def[f] != null) o[f] = Math.round((def[f] + (g[f] || 0) * k) * 10000) / 10000;
  return o;
}

class Sim {
  // opts: { levels: [{id: lvl}, {id: lvl}], towerLevel: [l0, l1], elixirMul: [m0, m1], speedMul, time, firstCrown }
  constructor(decks, opts = {}) {
    // opts.boss: [boss id | null, boss id | null] - a boss troop stands in place of that player's house
    // opts.coop: Boss Raid - a second player (slot 2) shares side 0 with their own deck, hand and energy
    this.o = Object.assign({ levels: [{}, {}, {}], towerLevel: [1, 1], elixirMul: [1, 1, 1], speedMul: 1, time: REG_TIME, firstCrown: false, boss: [null, null], hpMul: [1, 1], coop: false }, opts);
    // opts.bossClock: boss battles - no time limit until a boss tower (side 1) falls, then this many seconds on the clock
    this.regTime = this.o.bossClock ? Infinity : this.o.time;
    this.t = 0; this.ents = []; this.projs = []; this.zones = []; this.events = [];
    this.nid = 1; this.elixir = this.o.coop ? [5, 5, 5] : [5, 5]; this.crowns = [0, 0];
    this.ot = false; this.over = false; this.winner = -1;
    this.players = (this.o.coop ? [0, 1, 2] : [0, 1]).map(i => { const d = shuffle(decks[i].slice()); return { hand: d.slice(0, 4), queue: d.slice(4) }; });
    this.tower('princess', 0, 3.5, 25.5); this.tower('princess', 0, 14.5, 25.5); this.tower('king', 0, 9, 29);
    this.tower('princess', 1, 3.5, 6.5); this.tower('princess', 1, 14.5, 6.5); this.tower('king', 1, 9, 3);
  }
  ev(o) { this.events.push(o); }
  lvl(owner, id) { return LV((this.o.levels[owner] || {})[id] || 1); }
  tower(type, owner, x, y) {
    const bossId = type === 'king' && this.o.boss && this.o.boss[owner];
    const def = bossId && BOSSES[bossId] ? BOSSES[bossId] : DEFS[type];   // a boss keeps type 'king' so every house rule still applies
    const lm = LV(this.o.towerLevel[owner]), hm = (this.o.hpMul || [1, 1])[owner] || 1;
    this.ents.push({ id: this.nid++, type, def, kind: 'tower', owner, x, y, hp: def.hp * lm * hm, maxHp: def.hp * lm * hm, r: def.r, air: false, lm,
      cd: 0, tid: 0, active: type !== 'king', atk: 0, dir: 1, deploy: 0, stun: 0, slow: 0, slowMul: 1, rage: 0, flags: 0, up: owner === 0,
      boss: bossId || null, specT: def.special ? def.special.every * 0.6 : 0, specAnim: 0 });
  }
  // boss special moves
  // enemy troops anywhere on this boss's half (ground only unless withAir)
  halfTargets(e, withAir) {
    return this.ents.filter(t => t.owner !== e.owner && t.kind === 'unit' && t.hp > 0 && t.deploy <= 0 && (withAir || !t.air) &&
      (e.owner === 1 ? t.y < RIVER_TOP : t.y > RIVER_BOT));
  }
  special(e, sp = e.def.special) {
    const lm = e.lm || 1;
    if (sp.type === 'flyslam') {
      // Matthew flaps up and slams down on the biggest group of enemy troops on his half
      const ts = this.halfTargets(e, false);
      let best = ts[0], bestN = -1;
      for (const t of ts) { const n = ts.filter(o => d2(o, t) < sp.radius * sp.radius).length; if (n > bestN) { bestN = n; best = t; } }
      if (!best) return;
      e.specAnim = 1.7;
      this.zones.push({ id: this.nid++, type: 'flyslam', owner: e.owner, x: best.x, y: best.y, t: 0, dur: 1.7, hitAt: 0.9, done: false, lm, sp });
      (sp.sfx || []).forEach(n => this.ev({ e: 'sfx', n }));
      return;
    }
    if (sp.type === 'bassdrop') {
      // Orville drops the bass: every enemy troop on his half (even flying ones) gets blasted back
      e.specAnim = 0.9;
      for (const t of this.halfTargets(e, true)) {
        const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
        this.damage(t, sp.dmg * lm, e.owner);
        t.stun = Math.max(t.stun, sp.stun); t.rampT = 0; t.charging = false; t.moved = 0; t.locked = false;
        t.x += dx / d * sp.knock; t.y += dy / d * sp.knock;
        // ground troops get knocked back but not into the river
        if (!t.air) t.y = e.owner === 1 ? Math.min(t.y, RIVER_TOP - 0.4) : Math.max(t.y, RIVER_BOT + 0.4);
      }
      this.ev({ e: 'fx', k: 'shock', x: e.x, y: e.y, r: 9, c: sp.fxc || 'bass' });
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; this.ev({ e: 'fx', k: 'crack', x: e.x + Math.cos(a) * 2.6, y: e.y + Math.sin(a) * 2.6 }); }
      (sp.sfx || []).forEach(n => this.ev({ e: 'sfx', n }));
      this.ev({ e: 'shake', a: 0.75 });
      this.ev({ e: 'word', w: sp.word, x: e.x, y: e.y - 1 });
      return;
    }
    if (sp.type === 'stink') {
      // Orville's stink cloud: like a hotbox but greener and nastier
      e.specAnim = 0.9;
      const dir = e.owner === 1 ? 1 : -1;
      this.zones.push({ id: this.nid++, type: 'stink', owner: e.owner, x: e.x, y: e.y + dir * 0.8, t: 0, dur: sp.dur, lm, sp });
      (sp.sfx || []).forEach(n => this.ev({ e: 'sfx', n }));
      this.ev({ e: 'word', w: sp.word, x: e.x, y: e.y - 1 });
      return;
    }
    if (sp.type === 'shockwave') {
      // Alejandro's tantrum / Buck's banjo blast: troops near him get hurt, knocked back and stunned
      e.specAnim = 0.9;
      for (const t of this.ents) {
        if (t.owner === e.owner || t.hp <= 0 || t.air || t.kind !== 'unit') continue;
        const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy);
        if (d > sp.radius + t.r) continue;
        this.damage(t, sp.dmg * lm, e.owner);
        t.stun = Math.max(t.stun, sp.stun); t.rampT = 0; t.charging = false; t.moved = 0; t.locked = false;
        const k = sp.knock * (1 - Math.min(1, d / (sp.radius + t.r)) * 0.5);
        if (d > 0.01) { t.x += dx / d * k; t.y += dy / d * k; }
      }
      this.ev({ e: 'fx', k: 'shock', x: e.x, y: e.y, r: sp.radius, c: sp.fx || 'dust' });
      (sp.sfx || ['stomp']).forEach(n => this.ev({ e: 'sfx', n }));
      this.ev({ e: 'shake', a: 0.45 });
      this.ev({ e: 'word', w: sp.word || 'BOOM!', x: e.x, y: e.y - 1 });
    }
    if (sp.type === 'hotbox') {
      // Alain Medina takes a huge rip and exhales a giant smoke cloud around himself
      e.specAnim = 0.9;
      const dir = e.owner === 1 ? 1 : -1;
      this.zones.push({ id: this.nid++, type: 'hotbox', owner: e.owner, x: e.x, y: e.y + dir * 0.8, t: 0, dur: sp.dur, lm, sp });
      (sp.sfx || []).forEach(n => this.ev({ e: 'sfx', n }));
      this.ev({ e: 'word', w: sp.word, x: e.x, y: e.y - 1 });
    }
    if (sp.type === 'cartrush') {
      // Killer20046 shoves a line of shopping carts down the lane with the most enemy troops on his side
      e.specAnim = 0.9;
      const dir = e.owner === 1 ? 1 : -1;
      const lanes = BRIDGES.map(bx => ({ bx, n: this.cartTargets(e, bx).length }));
      const lane = lanes[0].n >= lanes[1].n ? lanes[0].bx : lanes[1].bx;
      this.zones.push({ id: this.nid++, type: 'cartrush', owner: e.owner, x: lane, y: e.y + dir * 1.6, t: 0, dur: 99, dir, hit: {}, lm, sp });
      (sp.sfx || []).forEach(n => this.ev({ e: 'sfx', n }));
      this.ev({ e: 'word', w: sp.word, x: e.x, y: e.y - 1 });
    }
  }
  // enemy ground troops on this boss's half, near a lane (what the cart rush can hit)
  cartTargets(e, bx) {
    return this.ents.filter(t => t.owner !== e.owner && t.kind === 'unit' && !t.air && t.hp > 0 && t.deploy <= 0 &&
      Math.abs(t.x - bx) < 2.6 && (e.owner === 1 ? t.y < RIVER_TOP : t.y > RIVER_BOT));
  }
  updCartRush(z, dt) {
    const sp = z.sp;
    z.y += z.dir * sp.speed * dt;
    for (const t of this.ents) {
      if (t.owner === z.owner || t.kind !== 'unit' || t.air || t.hp <= 0 || z.hit[t.id]) continue;
      if (Math.abs(t.x - z.x) > sp.width + t.r || Math.abs(t.y - z.y) > 0.6 + t.r) continue;
      z.hit[t.id] = 1;
      this.damage(t, sp.dmg * (z.lm || 1), z.owner);
      t.stun = Math.max(t.stun, sp.stun); t.rampT = 0; t.charging = false; t.moved = 0; t.locked = false;
      t.y += z.dir * sp.knock; t.x += (t.x >= z.x ? 1 : -1) * 0.6;
      this.ev({ e: 'fx', k: 'hit', x: t.x, y: t.y });
      if (Math.random() < 0.5) this.ev({ e: 'sfx', n: 'crash' });
    }
    // the carts stop at the river
    if ((z.dir > 0 && z.y > RIVER_TOP - 0.4) || (z.dir < 0 && z.y < RIVER_BOT + 0.4)) { z.t = z.dur; this.ev({ e: 'fx', k: 'poof', x: z.x, y: z.y, r: 1.2 }); this.ev({ e: 'sfx', n: 'crash' }); }
  }
  spawn(type, owner, x, y, deploy = DEPLOY_T, lm = 1) {
    const def = DEFS[type];
    const e = { id: this.nid++, type, def, kind: def.kind === 'building' ? 'building' : 'unit', owner, x, y, lm,
      hp: def.hp * lm, maxHp: def.hp * lm, r: def.r, air: !!def.air, cd: 0, tid: 0, atk: 0, dir: owner === 0 ? 1 : -1,
      deploy, stun: 0, slow: 0, slowMul: 1, rage: 0, locked: false, retarget: 0, moved: 0, charging: false,
      hidden: !!def.hidden, popT: 0, idleT: 0, rampT: 0, spawnT: 1.2, hop: 0, flags: 0, age: 0, up: owner === 0 };
    this.ents.push(e);
    return e;
  }
  get(id) { if (!id) return null; for (const e of this.ents) if (e.id === id) return e; return null; }

  // ---------- playing cards ----------
  play(slot, handIdx, x, y) {
    if (this.over || this.freeze > 0) return false;
    const owner = slot === 2 ? 0 : slot;   // slot 2 = the Boss Raid teammate, playing for side 0
    const p = this.players[slot];
    if (!p) return false;
    const id = p.hand[handIdx];
    if (!id) return false;
    const def = DEFS[id];
    if (this.elixir[slot] < def.cost - 1e-6) return false;
    if (!canPlace(owner, def.kind, x, y, this.ents)) return false;
    this.elixir[slot] -= def.cost;
    p.queue.push(id); p.hand[handIdx] = p.queue.shift();
    this.ev({ e: 'sfx', n: 'pop' });
    const lm = this.lvl(slot, id);
    if (def.kind === 'spell') this.castSpell(owner, def, x, y, lm);
    else {
      const n = def.count || 1;
      const offs = this.formation(n, def.r);
      const flip = owner === 0 ? 1 : -1;
      for (const [ox, oy] of offs) {
        const ux = Math.max(0.5, Math.min(ARENA_W - 0.5, x + ox * flip)), uy = y + oy * flip;
        this.spawn(id, owner, ux, uy, DEPLOY_T, lm).pl = slot;
      }
      this.ev({ e: 'fx', k: 'poof', x, y, r: def.r * (n > 1 ? 2 : 1.3) });
      if (def.deploySfx) this.ev({ e: 'sfx', n: def.deploySfx });
      else this.ev({ e: 'sfx', n: 'deploy' });
    }
    return true;
  }
  formation(n, r) {
    if (n === 1) return [[0, 0]];
    if (n === 2) return [[-0.6, 0], [0.6, 0]];
    if (n === 3) return [[0, -0.6], [-0.6, 0.4], [0.6, 0.4]];
    const out = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push([Math.cos(a) * 0.9, Math.sin(a) * 0.9]); }
    return out;
  }
  castSpell(owner, def, x, y, lm = 1) {
    const ss = spellStats(def, Math.round((lm - 1) * 10) + 1);
    const z = { id: this.nid++, type: def.id, owner, x, y, r: ss.radius, t: 0, dur: ss.dur || Math.max(def.delay || 0, 0.8) + 0.4, done: false, lm, rm: ss.rage };
    this.zones.push(z);
    if (def.id === 'toot') { this.hitArea(owner, x, y, def.radius, def.dmg * lm, true, true, def.towerMul, def.stun); z.done = true; this.ev({ e: 'sfx', n: 'toot' }); this.ev({ e: 'word', w: def.word, x, y }); }
    if (def.id === 'blinker') {
      for (const e of this.ents) if (e.owner !== owner && e.hp > 0 && d2(e, { x, y }) <= (ss.radius + e.r) ** 2) { e.slow = ss.dur; e.slowMul = ss.slow; }
      z.done = true; this.ev({ e: 'sfx', n: 'blinker' });
    }
    if (def.id === 'steroids') { this.ev({ e: 'sfx', n: 'rage' }); this.ev({ e: 'word', w: def.word, x, y }); }
    if (def.id === 'akpigeons') this.ev({ e: 'sfx', n: 'coo' });
    if (def.id === 'hurricane') { this.ev({ e: 'sfx', n: 'whoosh' }); this.ev({ e: 'word', w: def.word, x, y }); }
  }
  updZones(dt) {
    for (const z of this.zones) {
      z.t += dt;
      if (z.type === 'cartrush') { this.updCartRush(z, dt); continue; }
      if (z.type === 'flyslam') {
        // Matthew lands: everything under him gets slammed, stunned and pushed out
        if (!z.done && z.t >= z.hitAt) {
          z.done = true;
          const sp = z.sp;
          for (const t of this.ents) {
            if (t.owner === z.owner || t.kind !== 'unit' || t.air || t.hp <= 0) continue;
            const dx = t.x - z.x, dy = t.y - z.y, d = Math.hypot(dx, dy);
            if (d > sp.radius + t.r) continue;
            this.damage(t, sp.dmg * (z.lm || 1), z.owner);
            t.stun = Math.max(t.stun, sp.stun); t.rampT = 0; t.charging = false; t.moved = 0; t.locked = false;
            if (d > 0.05) { t.x += dx / d * sp.knock; t.y += dy / d * sp.knock; }
          }
          this.ev({ e: 'fx', k: 'shock', x: z.x, y: z.y, r: sp.radius, c: sp.fxc || 'dust' });
          this.ev({ e: 'sfx', n: 'slam' }); this.ev({ e: 'sfx', n: 'boom' }); this.ev({ e: 'shake', a: 0.6 });
          this.ev({ e: 'word', w: sp.word, x: z.x, y: z.y - 1 });
        }
        continue;
      }
      if (z.type === 'hotbox' || z.type === 'stink') {
        // the smoke cloud hurts and slows every enemy troop inside it
        const sp = z.sp;
        for (const t of this.ents) {
          if (t.owner === z.owner || t.kind !== 'unit' || t.hp <= 0 || d2(t, z) > (sp.radius + t.r) ** 2) continue;
          this.damage(t, sp.dps * dt * (z.lm || 1), z.owner);
          t.slowMul = t.slow > 0 ? Math.min(t.slowMul, sp.slow) : sp.slow; t.slow = Math.max(t.slow, 0.3);
        }
        z.sfxT = (z.sfxT || 0) - dt;
        if (z.sfxT <= 0) { z.sfxT = 1.2; this.ev({ e: 'sfx', n: 'hiss' }); }
        continue;
      }
      const def = DEFS[z.type];
      if (!z.done && def.delay && z.t >= def.delay) {
        z.done = true;
        this.hitArea(z.owner, z.x, z.y, def.radius, def.dmg * (z.lm || 1), true, true, def.towerMul, 0);
        this.ev({ e: 'sfx', n: def.sfx });
        if (z.type === 'meteor') { this.ev({ e: 'fx', k: 'mboom', x: z.x, y: z.y, r: def.radius }); this.ev({ e: 'shake', a: 0.5 }); this.ev({ e: 'word', w: def.word, x: z.x, y: z.y }); }
        if (z.type === 'akpigeons') this.ev({ e: 'fx', k: 'bullets', x: z.x, y: z.y, r: def.radius });
      }
      if (z.type === 'hurricane') {
        for (const e of this.ents) {
          if (e.owner === z.owner || e.hp <= 0 || e.kind === 'decor') continue;
          const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy);
          if (d > z.r + e.r) continue;
          this.damage(e, def.dps * dt * (z.lm || 1) * (e.kind === 'tower' ? def.towerMul : 1), z.owner);
          if (e.kind === 'unit' && d > 0.3) { const s = Math.min(d, def.pull * dt); e.x += dx / d * s; e.y += dy / d * s; }
        }
        z.sfxT = (z.sfxT || 0) - dt;
        if (z.sfxT <= 0) { z.sfxT = 0.7; this.ev({ e: 'sfx', n: 'whoosh' }); }
      }
      if (z.type === 'steroids') {
        for (const e of this.ents) if (e.owner === z.owner && e.kind === 'unit' && d2(e, z) <= (z.r + e.r) ** 2) { e.rageMul = e.rage > 0 ? Math.max(e.rageMul || 1.4, z.rm || 1.4) : (z.rm || 1.4); e.rage = 1.5; }
      }
    }
    this.zones = this.zones.filter(z => z.t < z.dur);
  }

  // ---------- damage ----------
  damage(t, amt, srcOwner) {
    if (!t || t.hp <= 0 || amt <= 0) return;
    t.hp -= amt;
    if (t.type === 'king' && !t.active) { t.active = true; this.ev({ e: 'sfx', n: 'can' }); }
  }
  hitArea(owner, x, y, r, dmg, hitAir, hitGround, towerMul = 1, stun = 0, slowHit = 0, slowDur = 0) {
    for (const e of this.ents) {
      if (e.owner === owner || e.hp <= 0) continue;
      if (e.air ? !hitAir : !hitGround) continue;
      if (d2(e, { x, y }) > (r + e.r * 0.6) ** 2) continue;
      this.damage(e, e.kind === 'tower' ? dmg * towerMul : dmg, owner);
      if (stun) { e.stun = Math.max(e.stun, stun); e.rampT = 0; e.charging = false; e.moved = 0; }
      if (slowHit) { if (e.slow <= 0) e.slowMul = slowHit; else e.slowMul = Math.min(e.slowMul, slowHit); e.slow = Math.max(e.slow, slowDur); }
    }
  }

  // ---------- targeting ----------
  canHit(e, t) {
    if (!t || t.hp <= 0 || t.owner === e.owner || t.kind === 'decor') return false;
    if (t.hidden) return false;
    if (t.deploy > 0 && t.kind !== 'tower') return false;
    const tg = e.def.targets;
    if (tg === 'none') return false;
    if (tg === 'buildings') return t.kind === 'building' || t.kind === 'tower';
    if (t.air && tg !== 'both') return false;
    return true;
  }
  findTarget(e) {
    const def = e.def;
    const sight = Math.max(5.5, (def.range || 0) + 1.2);
    let best = null, bd = 1e9;
    if (def.targets !== 'buildings') {
      for (const t of this.ents) {
        if (!this.canHit(e, t)) continue;
        const d = Math.sqrt(d2(e, t)) - t.r;
        if (d < sight && d < bd) { bd = d; best = t; }
      }
      if (best || e.kind !== 'unit') return best;
    }
    if (e.kind !== 'unit') return null;
    // walk to the nearest enemy building/tower (prefer own lane)
    bd = 1e9;
    for (const t of this.ents) {
      if (t.kind !== 'building' && t.kind !== 'tower') continue;
      if (!this.canHit(e, t)) continue;
      let d = Math.sqrt(d2(e, t));
      if (t.type === 'princess' && ((t.x < 9) !== (e.x < 9))) d += 3;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // ---------- movement ----------
  moveTo(e, tx, ty, dist) {
    let gx = tx, gy = ty;
    if (!e.air && !e.def.jump) {
      const inRiver = e.y > RIVER_TOP && e.y < RIVER_BOT;
      const tSide = ty >= 16 ? 0 : 1;
      if (inRiver) {
        // already on a bridge: keep walking across toward the target's side
        let b = BRIDGES[0]; for (const bx of BRIDGES) if (Math.abs(e.x - bx) < Math.abs(e.x - b)) b = bx;
        gx = b + Math.max(-0.4, Math.min(0.4, e.x - b));
        gy = tSide === 0 ? RIVER_BOT + 0.6 : RIVER_TOP - 0.6;
      } else {
        const mySide = e.y >= 16 ? 0 : 1;
        if (mySide !== tSide) {
          let b = BRIDGES[0], bc = 1e9;
          for (const bx of BRIDGES) { const c = Math.abs(e.x - bx) + Math.abs(tx - bx); if (c < bc) { bc = c; b = bx; } }
          const entryY = mySide === 0 ? RIVER_BOT + 0.3 : RIVER_TOP - 0.3;
          gx = b;
          gy = (Math.abs(e.x - b) < 0.6 && Math.abs(e.y - entryY) < 0.8) ? (mySide === 0 ? RIVER_TOP - 0.6 : RIVER_BOT + 0.6) : entryY;
        }
      }
    }
    if (!e.air) [gx, gy] = this.steer(e, gx, gy);
    const dx = gx - e.x, dy = gy - e.y, L = Math.hypot(dx, dy);
    if (L < 1e-4) return;
    const s = Math.min(dist, L);
    e.x += dx / L * s; e.y += dy / L * s;
    if (Math.abs(dx) > 0.05) e.dir = dx > 0 ? 1 : -1;
    if (Math.abs(dy) > 0.05) e.up = dy < 0;
    e.moved += s;
  }

  // walk around towers/buildings that stand between a ground unit and where it's heading
  // (otherwise it pushes straight into them and gets stuck behind them)
  steer(e, gx, gy) {
    const dx = gx - e.x, dy = gy - e.y, L = Math.hypot(dx, dy);
    if (L < 1e-4) return [gx, gy];
    const ux = dx / L, uy = dy / L;
    let best = null, bestAlong = 1e9, bestSide = 0;
    for (const b of this.ents) {
      if (b === e || b.id === e.tid || b.hp <= 0 || b.air || (b.kind !== 'tower' && b.kind !== 'building')) continue;
      const cx = b.x - e.x, cy = b.y - e.y;
      const along = cx * ux + cy * uy;            // how far ahead the obstacle is
      if (along <= -0.2 || along > L + b.r) continue;
      const side = cx * uy - cy * ux;             // how far it is off our straight line
      if (Math.abs(side) >= b.r + e.r + 0.1) continue;
      if (along < bestAlong) { bestAlong = along; best = b; bestSide = side; }
    }
    if (!best) return [gx, gy];
    // go round on the side we're already leaning to; dead centre -> the side nearer the goal's x, else toward the middle
    let s = Math.sign(bestSide);
    if (Math.abs(bestSide) < 0.05) {
      const px = -uy;                              // x part of the left-hand perpendicular
      const want = Math.abs(gx - best.x) > 0.3 ? Math.sign(gx - best.x) : Math.sign(ARENA_W / 2 - best.x) || 1;
      s = Math.abs(px) < 1e-3 ? 1 : (Math.sign(px) === want ? 1 : -1);
    }
    // a point beside the obstacle, just clear of it, on the chosen side
    const clear = best.r + e.r + 0.35;
    return [best.x - uy * s * clear, best.y + ux * s * clear];
  }

  // ---------- per-entity update ----------
  updEntity(e, dt) {
    const def = e.def;
    e.atk = Math.max(0, e.atk - dt * 3);
    e.age += dt;
    if (e.kind === 'building' && def.lifetime && e.deploy <= 0) e.hp -= e.maxHp / def.lifetime * dt;
    if (e.deploy > 0) { e.deploy -= dt; return; }
    if (e.stun > 0) { e.stun -= dt; return; }
    let mul = 1;
    if (e.slow > 0) { e.slow -= dt; mul *= e.slowMul; if (e.slow <= 0) e.slowMul = 1; }
    if (e.rage > 0) { e.rage -= dt; mul *= e.rageMul || 1.4; }
    if (e.kind === 'tower' && !e.active) return;
    if (def.special) {
      if (e.specAnim > 0) { e.specAnim -= dt; return; }   // busy with the special move
      e.specT -= dt * mul;
      if (e.specT <= 0) {
        const sp = def.special;
        // a boss with several specials (Orville) takes them in turn
        const cur = sp.type === 'multi' ? sp.moves[(e.specIdx || 0) % sp.moves.length] : sp;
        const near = cur.type === 'cartrush' ? BRIDGES.some(bx => this.cartTargets(e, bx).length > 0)
          : (cur.type === 'flyslam' || cur.type === 'bassdrop') ? this.halfTargets(e, cur.type === 'bassdrop').length > 0
          : this.ents.some(t => t.owner !== e.owner && t.kind === 'unit' && !t.air && t.hp > 0 && t.deploy <= 0 && d2(t, e) <= (cur.radius + t.r) ** 2);
        if (near) { this.special(e, cur); e.specIdx = (e.specIdx || 0) + 1; e.specT = sp.every; return; }
        e.specT = 0.4;      // nobody close enough yet: check again soon
      }
    }

    // spawner buildings
    if (def.spawn) {
      e.spawnT -= dt * mul;
      if (e.spawnT <= 0) {
        e.spawnT = def.spawnEvery;
        const dy = e.owner === 0 ? -1.1 : 1.1;
        this.spawn(def.spawn, e.owner, e.x + (Math.random() - 0.5) * 0.4, e.y + dy, 0.3, e.lm || 1);
        e.atk = 1;
        this.ev({ e: 'sfx', n: 'flush' });
      }
      return;
    }

    let t = this.get(e.tid);
    if (!this.canHit(e, t)) { t = null; e.locked = false; }
    e.retarget -= dt;
    if (!t || (!e.locked && e.retarget <= 0)) {
      const nt = this.findTarget(e);
      if (nt !== t) { e.rampT = 0; e.cd = Math.max(e.cd, (def.hit || 1) * 0.45); }
      t = nt; e.tid = t ? t.id : 0; e.retarget = 0.3;
    }

    // Penjamin hides when nothing is around
    if (def.hidden) {
      if (t && Math.sqrt(d2(e, t)) - t.r <= def.range) {
        e.idleT = 0;
        if (e.hidden) { e.hidden = false; e.popT = 0.6; this.ev({ e: 'sfx', n: 'hiss' }); }
      } else {
        e.idleT += dt;
        if (!e.hidden && e.idleT > 1.2) e.hidden = true;
      }
      if (e.hidden) return;
      if (e.popT > 0) { e.popT -= dt; return; }
    }

    if (!t) return;
    const dist = Math.sqrt(d2(e, t)) - t.r - e.r;
    const range = def.range || 0.6;
    if (dist <= range) {
      e.locked = e.kind === 'unit';
      if (Math.abs(t.x - e.x) > 0.05) e.dir = t.x > e.x ? 1 : -1;
      if (Math.abs(t.y - e.y) > 0.3) e.up = t.y < e.y;
      e.cd -= dt * mul;
      if (def.ramp) {
        e.rampT += dt;
        if (e.cd <= 0) {
          e.cd = def.hit;
          const st = e.rampT < 2 ? 0 : e.rampT < 4 ? 1 : 2;
          this.damage(t, def.ramp[st] * (e.lm || 1), e.owner);
          if (Math.random() < 0.25) this.ev({ e: 'sfx', n: 'hum' });
          if (st === 2 && t.hp <= 0) this.ev({ e: 'sfx', n: 'ding' });
        }
        return;
      }
      if (e.cd <= 0) {
        e.cd = def.hit;
        e.atk = 1;
        this.attack(e, t);
      }
    } else {
      e.locked = false;
      if (e.kind !== 'unit') return;
      let sp = (def.speed || 1) * mul * this.o.speedMul;
      if (def.charge && e.moved > 2.5) { e.charging = true; sp = 2.0 * mul * this.o.speedMul; }
      const before = e.y;
      this.moveTo(e, t.x, t.y, sp * dt);
      if (def.jump) {
        const inR = e.y > RIVER_TOP - 0.3 && e.y < RIVER_BOT + 0.3;
        e.hop = inR ? 0.6 : Math.max(0, e.hop - dt * 4);
      }
      if (def.stomp) {
        e.stepT = (e.stepT || 0) + sp * dt;
        if (e.stepT > 0.9) { e.stepT = 0; this.ev({ e: 'fx', k: 'crack', x: e.x, y: e.y }); this.ev({ e: 'sfx', n: 'stomp' }); this.ev({ e: 'shake', a: 0.12 }); }
      }
    }
  }
  attack(e, t) {
    const def = e.def;
    if (def.sfx) this.ev({ e: 'sfx', n: def.sfx });
    if (def.word && Math.random() < 0.3) this.ev({ e: 'word', w: def.word, x: t.x, y: t.y });
    if (def.melee) {
      let dmg = def.dmg * (e.lm || 1);
      if (def.charge && e.charging) { dmg *= 2; e.charging = false; this.ev({ e: 'word', w: 'WHAM!', x: t.x, y: t.y }); }
      e.moved = 0;
      if (def.spin) { this.hitArea(e.owner, e.x, e.y, def.spin, dmg, false, true); this.ev({ e: 'fx', k: 'spin', x: e.x, y: e.y, r: def.spin }); }
      else this.damage(t, dmg, e.owner);
      this.ev({ e: 'fx', k: 'hit', x: t.x, y: t.y });
      return;
    }
    // ranged
    const tg = def.targets;
    this.projs.push({ id: this.nid++, style: def.proj, owner: e.owner, x: e.x, y: e.y - (e.air ? 0 : 0), fromAir: e.air || e.kind === 'tower',
      tid: t.id, tx: t.x, ty: t.y, speed: def.proj === 'bullet' ? 22 : def.proj === 'bomb' ? 5 : 10, dmg: def.dmg * (e.lm || 1), splash: def.splash || 0,
      hitAir: tg === 'both', hitGround: true, slowHit: def.slowHit || 0, slowDur: def.slowHitDur || 0, towerMul: 1 });
  }
  updProjs(dt) {
    for (const p of this.projs) {
      const t = this.get(p.tid);
      if (t && t.hp > 0) { p.tx = t.x; p.ty = t.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y, L = Math.hypot(dx, dy), s = p.speed * dt;
      if (L <= s + 0.05) {
        p.dead = true;
        if (p.splash) {
          this.hitArea(p.owner, p.tx, p.ty, p.splash, p.dmg, p.hitAir, p.hitGround, 1, 0, p.slowHit, p.slowDur);
          this.ev({ e: 'fx', k: p.style === 'smoke' ? 'smoke' : p.style === 'bomb' || p.style === 'dynamite' ? 'boom' : 'splat', x: p.tx, y: p.ty, r: p.splash, c: p.style });
          if (p.style === 'bottle') this.ev({ e: 'sfx', n: Math.random() < 0.3 ? 'waah' : 'bottle' });
          if (p.style === 'bigpoop' || p.style === 'spit') this.ev({ e: 'sfx', n: 'splat' });
          if (p.style === 'bomb') { this.ev({ e: 'shake', a: 0.3 }); this.ev({ e: 'sfx', n: 'boom' }); }
          if (p.style === 'dynamite') this.ev({ e: 'sfx', n: 'dynamite' });
          if (p.style === 'smoke') this.ev({ e: 'sfx', n: 'hiss' });
        } else if (t && t.hp > 0) {
          this.damage(t, p.dmg, p.owner);
          this.ev({ e: 'fx', k: 'splat', x: p.tx, y: p.ty, r: 0.3, c: p.style });
          if (p.style === 'poop' || p.style === 'spit') this.ev({ e: 'sfx', n: 'splat' });
        }
      } else { p.x += dx / L * s; p.y += dy / L * s; }
    }
    this.projs = this.projs.filter(p => !p.dead);
  }

  // keep units from overlapping, and out of towers/buildings
  separate() {
    const E = this.ents;
    for (let i = 0; i < E.length; i++) {
      const a = E[i];
      if (a.kind !== 'unit') continue;
      for (let j = 0; j < E.length; j++) {
        if (i === j) continue;
        const b = E[j];
        if ((b.kind === 'unit' && j < i) || b.kind === 'decor') continue;
        if (a.air !== b.air) continue;
        const dx = a.x - b.x, dy = a.y - b.y, dd = dx * dx + dy * dy;
        const min = (a.r + b.r) * (b.kind === 'unit' ? 0.85 : 1);
        if (dd >= min * min || dd < 1e-6) continue;
        const d = Math.sqrt(dd), push = (min - d);
        const nx = dx / d, ny = dy / d;
        if (b.kind === 'unit') {
          const ma = a.r * a.r, mb = b.r * b.r, tot = ma + mb;
          a.x += nx * push * (mb / tot) * 0.5; a.y += ny * push * (mb / tot) * 0.5;
          b.x -= nx * push * (ma / tot) * 0.5; b.y -= ny * push * (ma / tot) * 0.5;
        } else { a.x += nx * push; a.y += ny * push; }
      }
    }
    for (const e of E) {
      if (e.kind !== 'unit') continue;
      e.x = Math.max(0.3, Math.min(ARENA_W - 0.3, e.x));
      e.y = Math.max(0.3, Math.min(ARENA_H - 0.3, e.y));
      // no ground troop is ever in the water: on a bridge it stays on the planks,
      // anywhere else (knocked in by a boss) it gets shoved back onto the nearest bank
      if (!e.air && !e.def.jump && e.y > RIVER_TOP - 0.2 && e.y < RIVER_BOT + 0.2) {
        let b = BRIDGES[0]; for (const bx of BRIDGES) if (Math.abs(e.x - bx) < Math.abs(e.x - b)) b = bx;
        if (Math.abs(e.x - b) <= 1.1) e.x = Math.max(b - 0.85, Math.min(b + 0.85, e.x));
        else e.y = e.y < (RIVER_TOP + RIVER_BOT) / 2 ? RIVER_TOP - 0.25 : RIVER_BOT + 0.25;
      }
    }
  }

  removeDead() {
    const dead = this.ents.filter(e => e.hp <= 0);
    if (!dead.length) return;
    this.ents = this.ents.filter(e => e.hp > 0);
    for (const e of dead) {
      const def = e.def;
      if (e.kind === 'tower') {
        if (e.type === 'king' && e.owner === 1 && this.o.phase2 && !this.phase2) { this.startPhase2(e); continue; }
        const winner = 1 - e.owner;
        this.ev({ e: 'tower', owner: e.owner, x: e.x, y: e.y, king: e.type === 'king' });
        this.ev({ e: 'sfx', n: 'towerDown' }); this.ev({ e: 'shake', a: 0.8 });
        this.ents.push({ id: this.nid++, type: e.type === 'king' ? 'rubble_king' : 'rubble', def: { kind: 'decor' }, kind: 'decor', owner: e.owner, x: e.x, y: e.y, hp: 1, maxHp: 1, r: 0, flags: 0, atk: 0, dir: 1 });
        if (e.type === 'king') { this.crowns[winner] = 3; this.end(winner); }
        else {
          this.crowns[winner]++;
          if (this.o.bossClock && e.owner === 1 && !this.phase2 && !isFinite(this.regTime)) {
            this.regTime = this.t + this.o.bossClock;
            const m = Math.floor(this.o.bossClock / 60), s = this.o.bossClock % 60;
            this.ev({ e: 'banner', w: `${m}:${String(s).padStart(2, '0')} ON THE CLOCK!` });
          }
          for (const k of this.ents) if (k.type === 'king' && k.owner === e.owner) k.active = true;
          if (this.o.firstCrown) this.end(winner);
        }
      } else {
        this.ev({ e: 'fx', k: 'death', x: e.x, y: e.y, r: e.r, air: e.air });
        if (e.type === 'rats') this.ev({ e: 'sfx', n: 'squeak' });
        else if (e.type === 'geese') this.ev({ e: 'sfx', n: 'honk' });
        else this.ev({ e: 'sfx', n: 'death' });
        if (def.deathDmg) {
          this.hitArea(e.owner, e.x, e.y, def.deathSplash, def.deathDmg * (e.lm || 1), false, true);
          this.ev({ e: 'fx', k: 'boom', x: e.x, y: e.y, r: def.deathSplash }); this.ev({ e: 'sfx', n: 'boom' });
        }
      }
    }
  }
  // Orville's 2nd phase: instead of losing, he evolves. His side comes back at full health, every troop on the field
  // is cleared, your towers keep their damage; then no time limit, 2x energy for both sides, first main tower down loses.
  startPhase2(e) {
    this.phase2 = true;
    this.freeze = PHASE2_CUT;
    this.ents = this.ents.filter(x => (x.kind === 'tower' || x.kind === 'decor') && x.owner !== 1);
    this.projs = []; this.zones = [];
    this.o.boss = [this.o.boss[0], this.o.phase2];
    this.tower('princess', 1, 3.5, 6.5); this.tower('princess', 1, 14.5, 6.5); this.tower('king', 1, 9, 3);
    for (const k of this.ents) if (k.owner === 1 && k.type === 'king') k.active = true;
    this.regTime = Infinity; this.ot = false;
    this.o.elixirMul = this.elixir.map((_, i) => (this.o.elixirMul[i] || 1) * 2);
    this.ev({ e: 'phase2', x: e.x, y: e.y, boss: this.o.phase2 });
    this.ev({ e: 'shake', a: 0.6 });
  }
  end(winner) {
    if (this.over) return;
    this.over = true; this.winner = winner;
    this.ev({ e: 'end', winner });
  }

  step(dt) {
    if (this.over) return;
    if (this.freeze > 0) { this.freeze -= dt; return; }   // phase 2 cutscene: nothing moves
    this.t += dt;
    const dbl = this.t > this.regTime - 60;
    for (let i = 0; i < this.elixir.length; i++) this.elixir[i] = Math.min(10, this.elixir[i] + dt / (dbl ? 1.4 : 2.8) * (this.o.elixirMul[i] || 1));
    if (!this.ot && this.t >= this.regTime) {
      if (this.crowns[0] !== this.crowns[1]) { this.end(this.crowns[0] > this.crowns[1] ? 0 : 1); return; }
      this.ot = true; this.ev({ e: 'sfx', n: 'overtime' }); this.ev({ e: 'banner', w: 'SUDDEN DEATH!' });
    }
    this.updZones(dt);
    for (const e of this.ents.slice()) if (e.hp > 0 && e.kind !== 'decor') this.updEntity(e, dt);
    this.updProjs(dt);
    this.separate();
    this.removeDead();
    if (this.ot && !this.over) {
      if (this.crowns[0] !== this.crowns[1]) this.end(this.crowns[0] > this.crowns[1] ? 0 : 1);
      else if (this.t >= this.regTime + OT_TIME) this.end(-1);
    }
    // flags for drawing / network
    for (const e of this.ents) {
      e.flags = (e.stun > 0 ? 1 : 0) | (e.slow > 0 ? 2 : 0) | (e.rage > 0 ? 4 : 0) | (e.hidden ? 8 : 0) |
        (e.deploy > 0 ? 16 : 0) | (e.charging ? 32 : 0) | (e.active ? 128 : 0) | (e.up ? 256 : 0) | (e.specAnim > 0 ? 512 : 0);
    }
  }

  // compact state for the guest's phone
  snapshot(forOwner) {
    const r = v => Math.round(v * 20);
    const p = this.players[forOwner], mate = this.o.coop ? this.players[forOwner === 2 ? 0 : 2] : null;
    return {
      t: Math.round(this.t * 100), el: Math.round(this.elixir[forOwner] * 100), cr: this.crowns, ot: this.ot ? 1 : 0, rt: isFinite(this.regTime) ? this.regTime : -1,
      hand: p.hand, next: p.queue[0], mh: mate ? mate.hand : undefined, p2: this.phase2 ? 1 : 0,
      en: this.ents.map(e => [e.id, e.type === 'rubble' ? -1 : e.type === 'rubble_king' ? -2 : TYPE_IDX[e.type], e.owner, r(e.x), r(e.y), Math.ceil(e.hp), e.flags, e.dir, Math.round(e.atk * 10), e.tid || 0, Math.round((e.hop || 0) * 10), Math.ceil(e.maxHp), e.pl === 2 ? 1 : 0]),
      pr: this.projs.map(q => [q.id, q.style, r(q.x), r(q.y), q.owner]),
      zo: this.zones.map(z => [z.id, z.type, r(z.x), r(z.y), Math.round(z.t * 100), z.owner, r(z.r || 0), Math.round((z.dur || 0) * 100)]),
      over: this.over ? 1 : 0, win: this.winner,
    };
  }
}

// rebuild a drawable state from a snapshot (guest side)
function unpackSnapshot(s) {
  const f = v => v / 20;
  return {
    t: s.t / 100, elixir: s.el / 100, crowns: s.cr, ot: !!s.ot, hand: s.hand, next: s.next, mateHand: s.mh, phase2: !!s.p2, over: !!s.over, winner: s.win, regTime: s.rt === -1 ? Infinity : (s.rt || REG_TIME),
    ents: s.en.map(a => {
      const type = a[1] === -1 ? 'rubble' : a[1] === -2 ? 'rubble_king' : TYPE_LIST[a[1]];
      const def = DEFS[type] || { kind: 'decor', r: 0 };
      return { id: a[0], type, def, kind: a[1] < 0 ? 'decor' : def.kind === 'tower' ? 'tower' : def.kind === 'building' ? 'building' : 'unit',
        owner: a[2], x: f(a[3]), y: f(a[4]), hp: a[5], maxHp: a[11] || def.hp || 1, r: def.r || 0, air: !!def.air, flags: a[6], dir: a[7], atk: a[8] / 10, tid: a[9], hop: a[10] / 10, pl: a[12] ? 2 : 0 };
    }),
    projs: s.pr.map(a => ({ id: a[0], style: a[1], x: f(a[2]), y: f(a[3]), owner: a[4] })),
    zones: s.zo.map(a => ({ id: a[0], type: a[1], x: f(a[2]), y: f(a[3]), t: a[4] / 100, owner: a[5], r: a[6] ? f(a[6]) : (DEFS[a[1]] || {}).radius, dur: a[7] ? a[7] / 100 : (DEFS[a[1]] || {}).dur })),
  };
}
