// Trash Royal - card data. All numbers are easy to tweak here.
// targets: 'ground' = ground units + buildings, 'both' = air + ground, 'buildings' = only buildings/towers
// speed: tiles per second. range/r: tiles. hit: seconds between attacks.

const ARENA_W = 18, ARENA_H = 32;
const BRIDGES = [3.5, 14.5];
const RIVER_TOP = 15, RIVER_BOT = 17;

const CARDS = [
  // ---- Erick's characters ----
  { id: 'jshock', name: 'Jshock', cost: 5, kind: 'troop', count: 1, hp: 2400, dmg: 520, hit: 1.4, range: 0.8, speed: 1.0, r: 0.55,
    targets: 'ground', melee: true, sfx: 'bonk', word: 'BONK!', deploySfx: 'grunt',
    desc: 'The streamer himself. One big tank who headbutts everything in his way.' },
  { id: 'hillbilly', name: 'Hillbillies', cost: 3, kind: 'troop', count: 2, hp: 300, dmg: 100, hit: 0.9, range: 5, speed: 1.0, r: 0.4,
    targets: 'both', proj: 'spit', sfx: 'ptooey', word: 'PTOOEY!',
    desc: 'Two hillbillies who spit at enemies from far away. Hits fliers too.' },
  { id: 'orville', name: 'Orville', cost: 5, kind: 'troop', count: 1, hp: 3600, dmg: 230, hit: 1.5, range: 0.9, speed: 0.75, r: 0.85,
    targets: 'buildings', melee: true, sfx: 'kick', word: 'KICK!', deploySfx: 'grunt', stomp: true, beat: true,
    desc: 'Big, stinky, speaker on blast. Walks straight to towers and kicks them. Cracks the ground every step.' },
  { id: 'pigeons', name: 'Pigeons', cost: 3, kind: 'troop', count: 3, air: true, hp: 220, dmg: 85, hit: 1.0, range: 2, speed: 1.5, r: 0.35,
    targets: 'both', proj: 'poop', sfx: 'plop', deploySfx: 'coo',
    desc: 'Three fast pigeons that poop on whatever is below them.' },
  { id: 'hugepigeon', name: 'Huge Pigeon', cost: 4, kind: 'troop', count: 1, air: true, hp: 1000, dmg: 130, hit: 1.5, range: 3.5, speed: 1.5, r: 0.6,
    targets: 'both', proj: 'bigpoop', splash: 1.4, sfx: 'plop', deploySfx: 'coo', word: 'SPLAT!',
    desc: 'A chunky pigeon that drops a giant poop that splashes a whole group.' },
  { id: 'balloon', name: 'Mad Bomber Balloon', cost: 5, kind: 'troop', count: 1, air: true, hp: 1500, dmg: 850, hit: 3.0, range: 0.6, speed: 0.75, r: 0.7,
    targets: 'buildings', proj: 'bomb', splash: 1.0, sfx: 'whoosh', word: 'KABOOM!', deathDmg: 220, deathSplash: 2,
    desc: 'A mad bomber floats over and drops huge dynamite bombs on buildings. Drops one more when popped.' },
  { id: 'matthew', name: 'Matthew', cost: 3, kind: 'troop', count: 1, air: true, hp: 720, dmg: 300, hit: 1.6, range: 1.6, speed: 1.0, r: 0.6,
    targets: 'both', melee: true, sfx: 'slam', word: 'OOF!',
    desc: 'Your big flying buddy with glasses and curly hair. Belly-slams hard from above.' },
  { id: 'meteor', name: 'Giant Meteor', cost: 4, kind: 'spell', radius: 2.5, dmg: 580, delay: 0.9, towerMul: 0.35, sfx: 'boom', word: 'KABOOM!',
    desc: 'A giant flaming meteor smashes an area.' },
  { id: 'akpigeons', name: 'AK Pigeons', cost: 3, kind: 'spell', radius: 3.8, dmg: 300, delay: 0.75, towerMul: 0.35, sfx: 'gun',
    desc: 'A flock of pigeons flies by and sprays a big area. Wipes out weak groups.' },
  { id: 'toot', name: 'The Toot', cost: 2, kind: 'spell', radius: 2.5, dmg: 160, stun: 0.7, delay: 0, towerMul: 0.35, sfx: 'toot', word: 'PFFFT!',
    desc: 'A nasty fart cloud. Small damage and stuns everything caught in it.' },
  { id: 'blinker', name: 'Blinker Checkpoint', cost: 4, kind: 'spell', radius: 3, dmg: 0, slow: 0.25, dur: 4, delay: 0, sfx: 'blinker',
    desc: 'Everything caught in the area slows way down for 4 seconds. Troops dropped in after it lands are not slowed.' },
  { id: 'steroids', name: 'Steroids', cost: 2, kind: 'spell', radius: 3, rage: 1.4, dur: 6, delay: 0, sfx: 'rage', word: 'ROID RAGE!',
    desc: 'Your troops in the area move and attack way faster for a while.' },
  { id: 'pizzacannon', name: 'Pizza Cannon', cost: 3, kind: 'building', hp: 850, dmg: 130, hit: 0.9, range: 5.5, r: 0.8, lifetime: 30,
    targets: 'ground', proj: 'pizza', sfx: 'thwump',
    desc: 'A cheap turret that fires pizza slices at ground troops.' },
  { id: 'penjamin', name: 'Penjamin Tower', cost: 4, kind: 'building', hp: 950, dmg: 120, hit: 1.2, range: 5, r: 0.7, lifetime: 30,
    targets: 'both', proj: 'smoke', splash: 1.2, slowHit: 0.6, slowHitDur: 1.5, hidden: true, sfx: 'hiss',
    desc: 'Hides underground, pops up and blows smoke clouds that hurt and slow enemies.' },
  { id: 'microwave', name: 'Microwave', cost: 5, kind: 'building', hp: 1300, dmg: 35, hit: 0.4, range: 6, r: 0.85, lifetime: 30,
    targets: 'both', ramp: [35, 110, 350], sfx: 'hum',
    desc: 'Cooks one enemy with a beam that gets hotter the longer it locks on. Melts tanks.' },
  { id: 'alejandro', name: 'Alejandro', cost: 5, kind: 'troop', count: 1, hp: 650, dmg: 240, hit: 1.4, range: 5.5, speed: 1.0, r: 0.45,
    targets: 'both', proj: 'bottle', splash: 1.5, sfx: 'bottle',
    desc: 'Hoodie, shorts, slides with socks. Throws baby bottles that splash groups.' },
  { id: 'metro', name: 'Metroboomin', cost: 4, kind: 'troop', count: 1, hp: 600, dmg: 180, hit: 1.0, range: 6.5, speed: 1.0, r: 0.45,
    targets: 'both', proj: 'bullet', sfx: 'snipe',
    desc: 'Round shades and a sniper. Picks off one target from far away, fliers too.' },
  { id: 'bomber', name: 'Mad Bomber', cost: 2, kind: 'troop', count: 1, hp: 300, dmg: 220, hit: 1.8, range: 4.5, speed: 1.0, r: 0.45,
    targets: 'ground', proj: 'dynamite', splash: 1.5, sfx: 'whoosh', hitSfx: 'dynamite',
    desc: 'A cartoon mad bomber who lobs dynamite at ground groups.' },
  { id: 'gamdom', name: 'Big Gamdom', cost: 5, kind: 'troop', count: 1, hp: 1600, dmg: 320, hit: 1.4, range: 1.6, speed: 1.0, r: 0.7,
    targets: 'ground', melee: true, charge: true, sfx: 'whack', deploySfx: 'heehaw', word: 'WHAM!',
    desc: 'Rides a donkey. After a short run he charges and his first hit does double damage.' },
  // ---- Claude's picks (option A) ----
  { id: 'portapotty', name: 'Porta-Potty', cost: 5, kind: 'building', hp: 900, r: 0.8, lifetime: 40, spawn: 'turd', spawnEvery: 5,
    targets: 'none', sfx: 'flush',
    desc: 'Keeps spitting out angry little turds that waddle out and bite.' },
  { id: 'rats', name: 'Sewer Rats', cost: 2, kind: 'troop', count: 8, hp: 45, dmg: 50, hit: 1.0, range: 0.5, speed: 1.5, r: 0.25,
    targets: 'ground', melee: true, sfx: 'squeak', deploySfx: 'squeak',
    desc: 'A swarm of 8 sewer rats. Super weak alone, nasty in a pack.' },
  { id: 'guard', name: 'Walmart Security Guard', cost: 3, kind: 'troop', count: 1, hp: 1450, dmg: 170, hit: 1.2, range: 0.8, speed: 1.0, r: 0.5,
    targets: 'ground', melee: true, sfx: 'clank',
    desc: 'A solid all-rounder who whacks people with a giant flashlight.' },
  { id: 'chihuahua', name: 'Chihuahua', cost: 4, kind: 'troop', count: 1, hp: 1100, dmg: 600, hit: 1.8, range: 0.7, speed: 1.5, r: 0.4,
    targets: 'ground', melee: true, sfx: 'chomp', deploySfx: 'growl', word: 'CHOMP!',
    desc: 'Tiny, shaking, furious. One massive bite.' },
  { id: 'doordash', name: 'DoorDash Driver', cost: 4, kind: 'troop', count: 1, hp: 1400, dmg: 260, hit: 1.6, range: 0.8, speed: 2.0, r: 0.6,
    targets: 'buildings', melee: true, sfx: 'crash', deploySfx: 'horn', word: 'DELIVERY!',
    desc: 'Speeds in on a scooter, takes the bridge and slams into towers.' },
  { id: 'uncle', name: 'Drunk Uncle', cost: 4, kind: 'troop', count: 1, hp: 1650, dmg: 220, hit: 1.5, range: 0.8, speed: 1.0, r: 0.55,
    targets: 'ground', melee: true, spin: 2.0, sfx: 'whoosh', deploySfx: 'burp',
    desc: 'Spins around swinging his beer and hits everyone near him.' },
  { id: 'geese', name: 'Angry Geese', cost: 2, kind: 'troop', count: 3, hp: 200, dmg: 110, hit: 1.1, range: 0.6, speed: 2.0, r: 0.35,
    targets: 'ground', melee: true, sfx: 'honk', deploySfx: 'honk', word: 'HONK!',
    desc: 'Three honking geese with fast, painful pecks.' },
  // ---- Florida Swamp additions (Claude, waiting on Erick) ----
  { id: 'gator', name: 'Swamp Gator', cost: 4, kind: 'troop', count: 1, hp: 1300, dmg: 280, hit: 1.3, range: 0.7, speed: 1.5, r: 0.55,
    targets: 'ground', melee: true, sfx: 'chomp', deploySfx: 'growl', word: 'CHOMP!',
    desc: 'A Florida swamp gator. Fast, tough and bites hard.' },
  { id: 'hurricane', name: 'Hurricane', cost: 5, kind: 'spell', radius: 3.5, dps: 110, pull: 1.6, dur: 4, delay: 0, towerMul: 0.35, sfx: 'whoosh', word: 'HURRICANE!',
    desc: 'A mini Florida hurricane. Sucks enemy troops into the middle and hurts everything inside for 4 seconds.' },
];

// Units that aren't cards (spawned by other cards)
const EXTRA = {
  turd: { id: 'turd', name: 'Turd', kind: 'troop', hp: 160, dmg: 75, hit: 1.0, range: 0.6, speed: 1.5, r: 0.35, targets: 'ground', melee: true, sfx: 'squish' },
};

const TOWERS = {
  princess: { id: 'princess', kind: 'tower', hp: 2600, dmg: 95, hit: 0.8, range: 7.5, r: 1.5, targets: 'both', proj: 'drumstick', sfx: 'whoosh' },
  king: { id: 'king', kind: 'tower', hp: 4200, dmg: 110, hit: 1.0, range: 7, r: 2.0, targets: 'both', proj: 'slipper', sfx: 'whack' },
};

// Boss troops: stand where the enemy's house is (CPU arenas + the Boss Battle friend mode).
// They take the house's place in every rule (wake up when hit, 3 crowns when beaten) but have their
// own attack and a special move. Balance vs the house (4200 hp, 110 single-target every 1.0 s, range 7):
// more health, a splashing attack that's weaker per hit, and a special that punishes crowding them.
const BOSSES = {
  alejandro: { id: 'alejandro', boss: true, name: 'Alejandro Leonard', kind: 'tower', hp: 4800, dmg: 90, hit: 1.4, range: 6.5, r: 2.0,
    targets: 'both', proj: 'bottle', splash: 1.1, sfx: 'whoosh', hpBar: 4.3, drawDy: 0.8,
    // Tantrum: stomps and cries WAAAH - damages, knocks back and stuns troops near him (only goes off when they're close)
    special: { type: 'shockwave', every: 10, radius: 3.3, dmg: 140, stun: 1.0, knock: 2.2, word: 'WAAAH!', sfx: ['waah', 'stomp'], fx: 'dust' },
    desc: 'Throws baby bottles that splash. Every 10 seconds he throws a TANTRUM: troops near him get knocked back and stunned.' },
  // Arena 2 is a step up: tougher, a harder-hitting single-target spit, and a wider banjo blast with a longer stun
  buck: { id: 'buck', boss: true, name: 'Buck', kind: 'tower', hp: 5400, dmg: 150, hit: 0.85, range: 7, r: 2.0,
    targets: 'both', proj: 'spit', sfx: 'ptooey', hpBar: 4.3, drawDy: 0.8,
    special: { type: 'shockwave', every: 9, radius: 3.8, dmg: 135, stun: 1.4, knock: 2.8, word: 'TWANG!', sfx: ['twang', 'stomp'], fx: 'notes' },
    desc: 'Spits hard and fast. Every 9 seconds he hits a BANJO BLAST: the soundwave knocks back and stuns troops around him.' },
  // Arena 3: splashing pizza and the biggest, longest stun so far (little knock-back - he lands right on you)
  madcapeel: { id: 'madcapeel', boss: true, name: 'Madcapeel', kind: 'tower', hp: 5900, dmg: 120, hit: 1.15, range: 6.5, r: 2.0,
    targets: 'both', proj: 'pizza', splash: 1.0, sfx: 'whoosh', hpBar: 4.1, drawDy: 0.8,
    special: { type: 'shockwave', every: 11, radius: 4.2, dmg: 160, stun: 1.8, knock: 1.0, word: 'BELLY FLOP!', sfx: ['slam', 'boom'], fx: 'dust' },
    desc: 'Throws pizza slices that splash. Every 11 seconds he jumps and BELLY FLOPS: a huge shockwave that stuns troops around him.' },
  // Arena 4: the toughest so far; his cart rush can hit troops anywhere down a whole lane on his side
  killer: { id: 'killer', boss: true, name: 'Killer20046', kind: 'tower', hp: 6400, dmg: 140, hit: 1.25, range: 6.5, r: 2.0,
    targets: 'both', proj: 'box', splash: 1.2, sfx: 'whoosh', hpBar: 3.9, drawDy: 0.8,
    special: { type: 'cartrush', every: 10, dmg: 220, stun: 0.6, knock: 1.6, speed: 9, width: 1.3, carts: 4, word: 'CART RUSH!', sfx: ['horn', 'clank'] },
    desc: 'Throws cardboard boxes that splash. Every 10 seconds: CART RUSH - a line of shopping carts rams down the lane with the most of your troops.' },
  // Arena 5: tougher still; his smoke slows whatever it hits and the hotbox cloud grinds down anything that stays near him
  alain: { id: 'alain', boss: true, name: 'Alain Medina', kind: 'tower', hp: 6900, dmg: 115, hit: 1.2, range: 6.5, r: 2.0,
    targets: 'both', proj: 'smoke', splash: 1.3, slowHit: 0.6, slowHitDur: 1.5, sfx: 'hiss', hpBar: 4.3, drawDy: 0.8,
    special: { type: 'hotbox', every: 12, radius: 4.0, dps: 80, slow: 0.5, dur: 4.5, word: 'HOTBOX!', sfx: ['hiss', 'whoosh'] },
    desc: 'Blows smoke from his glass pipe that splashes and slows. Every 12 seconds he HOTBOXES: a giant smoke cloud around him that slows and hurts every troop inside.' },
  // Arena 6: his slam can land anywhere on his half, right on top of your biggest group
  matthew: { id: 'matthew', boss: true, name: 'Matthew', kind: 'tower', hp: 7400, dmg: 135, hit: 1.2, range: 6.5, r: 2.0,
    targets: 'both', proj: 'waffle', splash: 1.2, sfx: 'whoosh', hpBar: 4.2, drawDy: 0.8,
    special: { type: 'flyslam', every: 11, radius: 3.0, dmg: 260, stun: 1.2, knock: 1.0, word: 'SLAM!', sfx: ['whoosh'] },
    desc: 'Throws waffles that splash. Every 11 seconds he flaps up on his tiny wings and SLAMS down on your biggest group of troops on his half.' },
  // Arena 7 - the final boss: toughest of all, with two specials that take turns
  orville: { id: 'orville', boss: true, name: 'Orville', kind: 'tower', hp: 9600, dmg: 180, hit: 0.95, range: 7, r: 2.2,
    targets: 'both', proj: 'bass', splash: 1.0, sfx: 'thwump', hpBar: 4.3, drawDy: 1.8,
    special: { type: 'multi', every: 9, moves: [
      { type: 'bassdrop', dmg: 140, stun: 0.8, knock: 2.4, word: 'BASS DROP!', sfx: ['boom', 'stomp'] },
      { type: 'stink', radius: 4.5, dps: 90, slow: 0.55, dur: 5, word: 'STINK CLOUD!', sfx: ['fart', 'hiss'] }] },
    desc: 'The final boss. Blasts bass from his speaker. Every 9 seconds he takes turns: a BASS DROP that knocks back every troop on his half, then a STINK CLOUD that hurts and slows.' },
};

const DEFS = {};
CARDS.forEach(c => DEFS[c.id] = c);
Object.values(EXTRA).forEach(c => DEFS[c.id] = c);
Object.values(TOWERS).forEach(c => DEFS[c.id] = c);
const TYPE_LIST = Object.keys(DEFS);
const TYPE_IDX = {}; TYPE_LIST.forEach((k, i) => TYPE_IDX[k] = i);

const DEFAULT_DECK = ['jshock', 'hillbilly', 'orville', 'pigeons', 'meteor', 'toot', 'pizzacannon', 'geese'];

// Where can a troop/building be dropped? Spells go anywhere.
function canPlace(owner, kind, x, y, ents) {
  if (x < 0.5 || x > ARENA_W - 0.5 || y < 0.5 || y > ARENA_H - 0.5) return false;
  if (kind === 'spell') return true;
  // pockets open when enemy side tower falls
  const enemy = 1 - owner;
  let leftDown = true, rightDown = true;
  for (const e of ents) {
    if (e.type === 'princess' && e.owner === enemy && e.hp > 0) { if (e.x < 9) leftDown = false; else rightDown = false; }
  }
  let ok;
  if (owner === 0) {
    ok = y >= 17.5 || (y >= 10.5 && ((x < 9 && leftDown) || (x >= 9 && rightDown)));
  } else {
    ok = y <= 14.5 || (y <= 21.5 && ((x < 9 && leftDown) || (x >= 9 && rightDown)));
  }
  if (!ok) return false;
  if (y > RIVER_TOP - 0.3 && y < RIVER_BOT + 0.3) {
    // the river is off limits, except a bridge whose lane is open (that side's enemy tower is down) - troops only, buildings would block it
    const b = BRIDGES.find(bx => Math.abs(x - bx) <= 1);
    if (kind !== 'troop' || b == null || !(b < 9 ? leftDown : rightDown)) return false;
  }
  for (const e of ents) {
    if ((e.type === 'princess' || e.type === 'king') && e.hp > 0) {
      const dx = e.x - x, dy = e.y - y, rr = DEFS[e.type].r + 0.2;
      if (dx * dx + dy * dy < rr * rr) return false;
    }
  }
  return true;
}
