// Trash Royal - the updates log players see in the game (newest first).
// Every time an update is pushed live, add a new entry at the TOP with the version (the ?v= number),
// the date it went out (YYYY-MM-DD), a short title and plain bullet points.
const UPDATES = [
  { v: 48, date: '2026-11-26', title: 'Leaderboards', notes: [
    'New Ranks button in the bottom bar: an Everyone leaderboard and a Friends leaderboard.',
    'The Everyone board is passed between players\' games, so it fills in as people come online.',
    'Ranked by the highest arena you\'ve reached, then by total wins.',
    'Wins against friends and Boss Raid wins now count too (from today on). Practice doesn\'t count.',
    'Roomier home screen: quests and the free gift sit side by side, and Updates moved to the 📰 button at the top.',
  ] },
  { v: 47, date: '2026-11-25', title: 'Updates log', notes: [
    'New Updates button on the home screen: see every update and the day it came out.',
    'After each update, a "What\'s new" popup shows you what changed (just once).',
  ] },
  { v: 46, date: '2026-11-24', title: 'Launch day', notes: [
    'Trash Royal is online! Pick a username and battle your friends.',
    'Friend battles: pick any of the 7 maps and any mode. In Boss Battle you each pick your own boss.',
    'Boss Raid: team up with a friend, 2 vs 1 against a boss.',
    'Friend requests: requests wait in your Friends tab until you answer, even if you were offline.',
    'See when friends are online or "In fight".',
    'Daily quests with big coin rewards, 3 deck slots, and emotes to send in battle.',
    'A new look: Clash-style battle screen, VS intro, crown finish, card frames and menus. Every thrown attack is 3D.',
    'Fair CPUs: everyone uses normal energy, the early arenas are easier, and no troop can cross water.',
    'Blinker Checkpoint is now a big smoke cloud.',
    'Beat Orville in his domain and see what happens...',
    'Fixes: friends leaving mid-battle, flat pictures, troops on the bridge, the chest screen layout.',
  ] },
];
