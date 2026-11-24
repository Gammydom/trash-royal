// Trash Royal - progression: arenas, coins, card unlocks + levels, shop, game modes.

const STARTER = ['jshock', 'hillbilly', 'orville', 'pigeons', 'meteor', 'toot', 'pizzacannon', 'geese', 'rats', 'guard'];

// Each arena: beat its CPU once to unlock the next arena (and its cards). skill 0-1 = how smart the CPU plays;
// react = seconds between its moves, elixir = its energy speed, level = its card + tower level.
const ARENAS = [
  { id: 'backyard', name: 'Backyard', skill: 0, cpu: 'Alejandro Leonard', boss: 'alejandro', level: 1, react: [2.6, 4.0], elixir: 0.65,
    ground: ['#7cc35a', '#73b952'], path: 'rgba(196,160,100,0.55)', river: ['#3fa7e0', '#6ccaf4', '#1f78ad'], riverName: 'kiddie pool',
    bridge: '#b07a45', decor: ['bush', 'flower', 'gnome', 'ball'], unlocks: [] },
  { id: 'trailer', name: 'Trailer Park', skill: 0.2, cpu: 'Buck', boss: 'buck', level: 1, react: [2.0, 3.2], elixir: 0.75,
    ground: ['#b9a27a', '#b19971'], path: 'rgba(120,96,64,0.45)', river: ['#7a6440', '#93794d', '#574629'], riverName: 'mud creek',
    bridge: '#8e6232', decor: ['tire', 'can', 'flamingo', 'grill'], unlocks: ['bomber', 'uncle', 'chihuahua'] },
  { id: 'yard', name: "Madcapeel's House", skill: 0.35, cpu: 'Madcapeel', boss: 'madcapeel', level: 2, react: [1.6, 2.6], elixir: 0.85,
    ground: ['#6fae4a', '#67a544'], path: 'rgba(150,132,100,0.55)', river: ['#6b7d5a', '#8a9a70', '#4a5a3a'], riverName: 'drainage ditch',
    bridge: '#8e6232', decor: ['tire', 'bush', 'can', 'flamingo'], unlocks: ['doordash', 'akpigeons', 'penjamin'] },
  { id: 'walmart', name: 'Walmart Parking Lot', skill: 0.5, cpu: 'Killer20046', boss: 'killer', level: 3, react: [1.2, 2.0], elixir: 0.95,
    ground: ['#6b6e74', '#65686e'], path: 'rgba(255,255,255,0.35)', river: ['#3c78c8', '#5f97e0', '#25508a'], riverName: 'flooded ditch',
    bridge: '#9aa0a8', decor: ['cart', 'cone', 'bag', 'can'], unlocks: ['alejandro', 'metro', 'steroids'] },
  { id: 'junkyard', name: 'Junkyard', skill: 0.65, cpu: 'Alain Medina', boss: 'alain', level: 3, react: [0.9, 1.5], elixir: 1.03,
    ground: ['#8d8a7c', '#868270'], path: 'rgba(120,96,64,0.35)', river: ['#5f7f2a', '#7aa035', '#3f5a18'], riverName: 'toxic sludge',
    bridge: '#8e6232', decor: ['tire', 'can', 'bag', 'barrel'], unlocks: ['hugepigeon', 'portapotty', 'blinker'] },
  { id: 'waffle', name: 'Waffle House 3AM', skill: 0.82, cpu: 'Matthew', boss: 'matthew', level: 4, react: [0.7, 1.2], elixir: 1.1,
    ground: ['#3a3326', '#433b2c'], path: 'rgba(255,200,40,0.30)', river: ['#b8661a', '#d98a2b', '#7a3f0c'], riverName: 'syrup river',
    bridge: '#e8c35a', decor: ['waffle', 'mug', 'sign', 'can'], unlocks: ['matthew', 'gamdom', 'microwave'], night: true },
  { id: 'domain', name: "Orville's Domain", skill: 1, cpu: 'Orville', boss: 'orville', level: 5, react: [0.5, 0.9], elixir: 1.15,
    ground: ['#f6c445', '#eeb83a'], path: 'rgba(201,139,60,0.75)', river: ['#c0392b', '#d9573f', '#8e1f16'], riverName: 'tomato sauce',
    bridge: '#e0a95a', decor: ['ball', 'can', 'bush', 'tire'], unlocks: ['balloon', 'gator', 'hurricane'] },
];

const MODES = [
  { id: 'classic', name: 'Classic', desc: 'Normal rules, levels don\'t count.' },
  { id: 'double', name: 'Double Energy', desc: 'Energy fills twice as fast.', opts: { elixirMul: [2, 2] } },
  { id: 'triple', name: 'Triple Energy', desc: 'Energy fills three times as fast. Pure chaos.', opts: { elixirMul: [3, 3] } },
  { id: 'sudden', name: 'Sudden Death', desc: 'First tower down wins.', opts: { firstCrown: true } },
  { id: 'random', name: 'Random Decks', desc: 'Both of you get 8 random cards from the whole game.', random: true },
  { id: 'mirror', name: 'Mirror Match', desc: 'Both of you use the challenger\'s deck.', mirror: true },
  { id: 'speed', name: 'Speed Run', desc: 'Troops move 50% faster. 2-minute match.', opts: { speedMul: 1.5, time: 120 } },
  { id: 'levels', name: 'Real Levels', desc: 'Your card upgrades count. Grind pays off.', levels: true },
  { id: 'boss', name: 'Boss Battle', desc: "Both houses become the boss of the challenger's arena (Alejandro Leonard until more bosses are in).", boss: true },
];

const MAX_LEVEL = 9;
const UPGRADE_COST = [0, 40, 100, 220, 450, 900, 1600, 2800, 4500]; // cost to go from level i+1 to i+2
const RARITY_MUL = c => (c.cost >= 5 ? 1.5 : c.cost >= 4 ? 1.25 : 1);

const TIPS = [
  'Orville ignores troops and goes straight for buildings. Stop him with a Microwave.',
  'The Toot stuns everything in its cloud for a moment. Great against a Big Gamdom charge.',
  'Blinker Checkpoint only slows troops that were there when it landed.',
  'Penjamin Tower hides underground until enemies get close.',
  'Grandma in the house wakes up when one of your towers takes damage.',
  "Beat an arena's CPU once to unlock the next arena and its new cards.",
  'Upgrade your cards in the Cards tab or open a chest in the Shop.',
  'Challenge friends with custom modes like Triple Energy or Mirror Match.',
  'Sewer Rats come 8 at a time. One AK Pigeons spell wipes them out.',
  'DoorDash Driver hops right over the river.',
];

const Progress = (() => {
  let S = null, store = null;
  const today = () => new Date().toISOString().slice(0, 10);
  function init(st) {
    store = st;
    S = Object.assign({ coins: 100, levels: {}, bought: [], lastGift: '', recent: [], wins: 0, losses: 0 }, store.get('progress', {}) || {});
    // old saves counted trophies: start them at the arena those trophies had reached
    if (S.arena == null) {
      const OLD = [0, 300, 600, 1000, 1400, 1800, 2400];
      let a = 0; OLD.forEach((t, i) => { if ((S.best || 0) >= t) a = i; });
      S.arena = a;
    }
    delete S.trophies; delete S.best; delete S.arenaSeen; delete S.bags;
    save();
  }
  function save() { store.set('progress', S); }
  // the newest arena you've reached (beat the one before it once)
  function arena() { return Math.max(0, Math.min(ARENAS.length - 1, S.arena | 0)); }
  const bestArena = arena;
  function unlocked() {
    const set = new Set(STARTER);
    for (let i = 0; i <= bestArena(); i++) ARENAS[i].unlocks.forEach(id => set.add(id));
    S.bought.forEach(id => set.add(id));
    return set;
  }
  function unlockArenaOf(id) { for (let i = 0; i < ARENAS.length; i++) if (ARENAS[i].unlocks.includes(id)) return i; return 0; }
  function level(id) { return S.levels[id] || 1; }
  function levels() { const o = {}; CARDS.forEach(c => o[c.id] = level(c.id)); return o; }
  function upgradeCost(id) { const l = level(id); if (l >= MAX_LEVEL) return null; return Math.round(UPGRADE_COST[l] * RARITY_MUL(DEFS[id])); }
  function upgrade(id, free) {
    const c = upgradeCost(id);
    if (c == null) return false;
    if (!free) { if (S.coins < c) return false; S.coins -= c; }
    S.levels[id] = level(id) + 1; save(); return true;
  }
  function kingLevel(deck) { return Math.max(1, Math.floor(deck.reduce((s, id) => s + level(id), 0) / deck.length)); }
  function cpuLevel(ai) { return Math.min(MAX_LEVEL, ARENAS[ai].level); }
  function cpuDeck(ai) {
    const pool = new Set(STARTER);
    for (let i = 0; i <= ai; i++) ARENAS[i].unlocks.forEach(id => pool.add(id));
    const all = shuffle([...pool]);
    const spells = all.filter(id => DEFS[id].kind === 'spell'), air = all.filter(id => DEFS[id].targets === 'both' && DEFS[id].kind !== 'spell');
    const deck = new Set([spells[0], air[0]].filter(Boolean));
    for (const id of all) { if (deck.size >= 8) break; deck.add(id); }
    return [...deck];
  }
  // battle result vs the CPU -> rewards
  // beating your newest arena's CPU once unlocks the next arena; losing costs nothing
  function cpuResult(won, draw, crowns, ai) {
    let coins = 0, newArena = -1;
    if (won) {
      coins = 20 + 10 * ai + 5 * crowns; S.wins++;
      if (ai === arena() && ai < ARENAS.length - 1) { S.arena = ai + 1; newArena = ai + 1; }
    } else if (draw) coins = 10;
    else { coins = 5; S.losses++; }
    S.coins += coins;
    save();
    return { coins, newArena };
  }
  function friendResult(won) { S.coins += won ? 10 : 3; save(); return won ? 10 : 3; }
  function addRecent(name) { S.recent = [name].concat(S.recent.filter(n => n.toLowerCase() !== name.toLowerCase())).slice(0, 6); save(); }
  // ---- shop ----
  function giftReady() { return S.lastGift !== today(); }
  function claimGift() { if (!giftReady()) return 0; const n = 50 + Math.floor(Math.random() * 101); S.coins += n; S.lastGift = today(); save(); return n; }
  function seeded(seed) { let x = 0; for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return () => (x = (x * 1103515245 + 12345) >>> 0) / 4294967296; }
  function deals() {
    const r = seeded(today());
    const un = [...unlocked()].filter(id => level(id) < MAX_LEVEL);
    const out = [];
    while (out.length < 3 && un.length) { const i = Math.floor(r() * un.length); const id = un.splice(i, 1)[0]; out.push({ id, price: Math.max(10, Math.round(upgradeCost(id) * 0.6)) }); }
    return out;
  }
  function boughtDeal(id) { return (S.dealsDone || {})[today() + id]; }
  function buyDeal(d) {
    if (boughtDeal(d.id) || S.coins < d.price) return false;
    S.coins -= d.price; S.dealsDone = S.dealsDone || {}; S.dealsDone[today() + d.id] = 1;
    S.levels[d.id] = level(d.id) + 1; save(); return true;
  }
  function earlyPrice(id) { return 250 * (unlockArenaOf(id) + 1); }
  function buyEarly(id) { const p = earlyPrice(id); if (S.coins < p || unlocked().has(id)) return false; S.coins -= p; S.bought.push(id); save(); return true; }
  // ms until the daily gift + deals reset (they go by the UTC date)
  function msToReset() { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n.getTime(); }
  // chests (Erick's numbers): every card is one you own and gets +1 level, then bonus coins pop out
  const CHESTS = [
    { id: 'small', sprite: 'chest_small', name: 'Small Chest', price: 250, cards: 2, coins: [60, 100] },
    { id: 'medium', sprite: 'chest_medium', name: 'Medium Chest', price: 450, cards: 4, coins: [120, 200] },
    { id: 'huge', sprite: 'chest_huge', name: 'Huge Chest', price: 850, cards: 8, coins: [300, 450] },
  ];
  function buyChest(ch) {
    if (S.coins < ch.price) return { err: 'coins' };
    const pool = [...unlocked()].filter(id => level(id) < MAX_LEVEL);
    if (!pool.length) return { err: 'maxed' };
    S.coins -= ch.price;
    const cards = [];
    for (let i = 0; i < ch.cards && pool.length; i++) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      const from = level(id); S.levels[id] = from + 1;
      cards.push({ id, from, to: from + 1 });
      if (level(id) >= MAX_LEVEL) pool.splice(pool.indexOf(id), 1);
    }
    const coins = ch.coins[0] + Math.floor(Math.random() * (ch.coins[1] - ch.coins[0] + 1));
    S.coins += coins;
    S.chests = (S.chests || 0) + 1; save();
    return { cards, coins };
  }
  return { init, save, get: () => S, arena, bestArena, unlocked, unlockArenaOf, level, levels, upgradeCost, upgrade, kingLevel,
    cpuLevel, cpuDeck, cpuResult, friendResult, addRecent, giftReady, claimGift, deals, boughtDeal, buyDeal, earlyPrice, buyEarly, msToReset, CHESTS, buyChest };
})();
