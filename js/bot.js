// Trash Royal - CPU player. Plays as player 1 (top).
// skill 0 = Backyard kid: slow, plays random cards in random spots, often ignores your troops.
// skill 1 = the final arena's CPU: defends with the right card, spells clumps, saves up for big pushes.
class Bot {
  constructor(sim, owner = 1, opt = {}) {
    if (Array.isArray(opt)) opt = { react: opt };
    this.react = opt.react || [0.5, 1.3];
    this.skill = opt.skill == null ? 1 : opt.skill;
    // how often it reacts to your troops at all (easy CPUs often just don't notice them)
    this.defend = opt.defend == null ? 0.35 + 0.65 * this.skill : opt.defend;
    // easy CPUs sometimes zone out after a play and sit there while their energy bar fills up and goes to waste
    this.daze = opt.daze || 0;
    this.sim = sim; this.me = owner; this.wait = 2.5 + (1 - this.skill) * 2; this.pushLane = Math.random() < 0.5 ? 3.5 : 14.5;
    this.saveFor = 4 + Math.random() * 4;   // easy CPUs play as soon as they have this much energy
  }
  update(dt) {
    const s = this.sim;
    if (s.over) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = this.react[0] + Math.random() * (this.react[1] - this.react[0]);
    const me = this.me, el = s.elixir[me], sk = this.skill;
    const hand = s.players[me].hand;
    const mySideY = y => me === 1 ? y < 16.5 : y > 15.5;
    const threats = s.ents.filter(e => e.owner !== me && e.kind === 'unit' && e.deploy <= 0 && mySideY(e.y));
    const afford = hand.map((id, i) => ({ id, i, def: DEFS[id] })).filter(c => c.def.cost <= el);
    if (!afford.length) return;
    const clampY = y => me === 1 ? Math.max(1.5, Math.min(14, y)) : Math.min(30.5, Math.max(18, y));
    const clampX = x => Math.max(1, Math.min(17, x));

    // how often it reacts to your troops at all: 35% in the Backyard up to always in Florida
    if (threats.length && Math.random() < this.defend) {
      // spell a clump (only the smarter CPUs)
      if (sk >= 0.35) {
        for (const c of afford) {
          if (c.def.kind !== 'spell' || !c.def.dmg) continue;
          let best = null, bestScore = 0;
          for (const t of threats) {
            let score = 0;
            for (const o of threats) if (Math.hypot(o.x - t.x, o.y - t.y) < c.def.radius) score += Math.min(o.hp, c.def.dmg);
            if (score > bestScore) { bestScore = score; best = t; }
          }
          if (best && bestScore >= c.def.cost * 170) { this.cast(c, best.x, best.y + (me === 1 ? -0.5 : 0.5)); return; }
        }
      }
      // defend with a troop/building: smart CPUs pick the right counter, easy ones grab any card
      const big = threats.reduce((a, b) => (b.hp > (a ? a.hp : 0) ? b : a), null);
      const air = threats.some(t => t.air);
      const ground = afford.filter(c => c.def.kind !== 'spell');
      let pick = null;
      if (Math.random() < sk) {
        for (const c of ground) {
          if (air && c.def.targets !== 'both') continue;
          if (big.def.targets === 'buildings' && c.def.kind === 'building') { pick = c; break; }
          if (!pick || c.def.dmg * (c.def.count || 1) > pick.def.dmg * (pick.def.count || 1)) pick = c;
        }
      } else if (ground.length) pick = ground[Math.floor(Math.random() * ground.length)];
      if (!pick && el < 9) return;
      if (pick) {
        const miss = (1 - sk) * 4;                     // easy CPUs drop it in a sloppy spot
        let x = big.x + (Math.random() - 0.5) * miss, y = big.y + (me === 1 ? -3 : 3) + (Math.random() - 0.5) * miss;
        if (pick.def.kind === 'building' && sk >= 0.5) { x = 9 + (big.x < 9 ? -1.5 : 1.5); y = me === 1 ? 9.5 : 22.5; }
        this.cast(pick, clampX(x), clampY(y));
        return;
      }
    }

    // attacking: easy CPUs trickle random cards; smarter ones more and more often save up for real pushes
    const smartPush = Math.min(1, Math.max(0, (sk - 0.2) / 0.6));
    if (Math.random() >= smartPush) {
      // easy CPUs: play a random card somewhere on their side as soon as they've saved a little
      if (el < this.saveFor) return;
      const cards = afford.filter(c => c.def.kind !== 'spell' || Math.random() < 0.15);
      if (!cards.length) return;
      const c = cards[Math.floor(Math.random() * cards.length)];
      this.saveFor = 3 + Math.random() * (4 + sk * 6);
      if (c.def.kind === 'spell') {
        const towers = s.ents.filter(e => e.kind === 'tower' && e.owner !== me);
        const t = towers[Math.floor(Math.random() * towers.length)];
        if (t) this.cast(c, t.x, t.y);
        return;
      }
      this.cast(c, 1.5 + Math.random() * 15, me === 1 ? 2 + Math.random() * 11 : 19 + Math.random() * 11);
      return;
    }
    // smarter CPUs: save up and push the weaker lane, tank first
    const pushAt = 8.5 - (1 - sk) * 3;
    if (el >= pushAt || (el >= 6 && Math.random() < 0.15)) {
      const troops = afford.filter(c => c.def.kind === 'troop');
      if (!troops.length) return;
      let lane = this.pushLane;
      const enemyP = s.ents.filter(e => e.type === 'princess' && e.owner !== me);
      if (enemyP.length === 1) lane = enemyP[0].x;
      else if (enemyP.length === 2) lane = enemyP[0].hp < enemyP[1].hp ? enemyP[0].x : enemyP[1].x;
      const tank = troops.find(c => c.def.hp * (c.def.count || 1) >= 1400);
      const c = tank || troops[Math.floor(Math.random() * troops.length)];
      const y = tank ? (me === 1 ? 3.5 : 28.5) : (me === 1 ? 13 : 19);
      this.cast(c, lane + (Math.random() - 0.5), y);
    }
  }
  cast(c, x, y) {
    const ok = this.sim.play(this.me, c.i, x, y);
    if (!ok) this.wait = 0.3;
    else if (Math.random() < this.daze) this.wait += 5 + Math.random() * 4;
  }
}
