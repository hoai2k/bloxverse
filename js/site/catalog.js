// ============================================================
// BLOXVERSE game catalog
// ============================================================

export const GAMES = [
  {
    id: 'jujutsu',
    name: 'Jujutsu Shenanigans',
    creator: 'CursedDev Studio',
    genre: 'Fighting',
    rating: 94,
    basePlaying: 128400,
    visits: '1.2B+',
    created: 'Mar 2024',
    updated: '3 days ago',
    serverSize: 8,
    maxPlayers: 8,
    thumb: 'assets/thumbs/jujutsu.svg',
    tagline: 'Awaken your cursed technique and brawl through the city.',
    desc: `⚡ JUJUTSU SHENANIGANS ⚡

Unleash devastating cursed techniques in an all-out city battleground! Chain M1 combos, dash-cancel, block, and read your opponents — then hit AWAKENING and take over the server.

🥊 Fluid combat with combos, knockback and full ragdoll physics
🌀 4 cursed abilities: Piercing Rush, Cursed Barrage, Crushing Slam and Void Blast
🟣 Fill your energy meter and AWAKEN for a massive power surge
🏙️ Free-roam city arena with rooftops and back alleys
🤖 Servers are always full of fighters — some of them get REALLY salty

Latest update: new Awakening VFX, damage balance pass, ragdoll improvements.`,
    controls: [
      ['Left Click', 'M1 combo (4-hit chain)'],
      ['1 / 2 / 3 / 4', 'Cursed abilities'],
      ['Q', 'Dash'],
      ['F', 'Block'],
      ['G', 'Awakening (when meter is full)'],
      ['Space', 'Jump'],
      ['W A S D', 'Move'],
    ],
  },
  {
    id: 'rivals',
    name: 'RIVALS',
    creator: 'NovaForge Games',
    genre: 'Shooter',
    rating: 92,
    basePlaying: 96200,
    visits: '2.4B+',
    created: 'Jul 2023',
    updated: '1 day ago',
    serverSize: 8,
    maxPlayers: 8,
    thumb: 'assets/thumbs/rivals.svg',
    tagline: 'Fast rounds. Big guns. One winning team.',
    desc: `🔫 RIVALS — the fast-paced team arena shooter!

Two squads drop into a compact arena. First team to 20 eliminations takes the round. Swap between four weapons, control the mid tower, and never stop strafing.

💥 4 weapons: Assault Rifle, Shotgun, Marksman Sniper and Pistol
🎯 Headshots deal bonus damage — aim up!
🏆 Round-based team deathmatch with live scoreboard
📱 Full mobile support with a dedicated FIRE button
🤖 Bot teammates and enemies with real aim, movement and trash talk

Pro tip: the sniper one-taps to the head. The lobby will not be happy about it.`,
    controls: [
      ['Left Click', 'Fire weapon'],
      ['Right Click', 'Aim / zoom (sniper scopes)'],
      ['1 – 4', 'Switch weapon'],
      ['R', 'Reload'],
      ['Space', 'Jump'],
      ['W A S D', 'Move'],
    ],
  },
  {
    id: 'bloxburg',
    name: 'Welcome to Bloxville',
    creator: 'Coeur Interactive',
    genre: 'Town & City',
    rating: 96,
    basePlaying: 71300,
    visits: '5.8B+',
    created: 'Nov 2022',
    updated: '5 hours ago',
    serverSize: 12,
    maxPlayers: 12,
    thumb: 'assets/thumbs/bloxburg.svg',
    tagline: 'Work, build and live your best blocky life.',
    desc: `🏡 Welcome to Bloxville!

Move into your own plot in a cozy cul-de-sac. Work shifts at Bloxy Burgers, keep your needs up, furnish your dream home in Build Mode, and hang out with the neighbors — they have lives, jobs and opinions of their own.

💼 Work the register at Bloxy Burgers and earn promotions
🛋️ Build Mode: place, rotate and sell furniture on your plot — your house saves!
🍕 Manage hunger, energy, hygiene and fun
🌇 Full day/night cycle with street lights and sunsets
🧑‍🤝‍🧑 AI neighbors that commute, gossip and visit your house

Your house and money auto-save to your account.`,
    controls: [
      ['E', 'Interact (hold near objects)'],
      ['B', 'Toggle Build Mode'],
      ['R', 'Rotate item (in Build Mode)'],
      ['Space', 'Jump'],
      ['W A S D', 'Move'],
    ],
  },
  {
    id: 'obby',
    name: 'Mega Sky Obby',
    creator: 'TowerWorks',
    genre: 'Obby / Platformer',
    rating: 89,
    basePlaying: 45800,
    visits: '890M+',
    created: 'Feb 2025',
    updated: '2 weeks ago',
    serverSize: 6,
    maxPlayers: 6,
    thumb: 'assets/thumbs/obby.svg',
    tagline: 'Race 30 stages of pure sky-high chaos.',
    desc: `☁️ MEGA SKY OBBY — an original Bloxverse race to the clouds!

30 hand-built stages of jumps, kill bricks, spinners, vanishing tiles and moving platforms. Every server is a live race — the other runners WILL rub it in if they beat you.

🏁 30 stages with checkpoints — fall and you restart at your stage
🌀 Spinners, movers, blinkers and lava bricks
👑 First to the summit wins the crown (and 200 Blux!)
😡 AI racers that rage-quit-scream in chat when they fall
📱 Buttery mobile controls

Your best stage is saved forever. Can you hit Stage 30?`,
    controls: [
      ['Space', 'Jump'],
      ['W A S D', 'Move'],
      ['Right Drag', 'Rotate camera'],
    ],
  },
  {
    id: 'zombies',
    name: 'Zombie Blocks: Last Stand',
    creator: 'Deadline Studios',
    genre: 'Survival',
    rating: 91,
    basePlaying: 38900,
    visits: '640M+',
    created: 'Apr 2025',
    updated: '6 days ago',
    serverSize: 4,
    maxPlayers: 4,
    thumb: 'assets/thumbs/zombies.svg',
    tagline: 'How many waves can your squad survive?',
    desc: `🧟 ZOMBIE BLOCKS: LAST STAND — an original Bloxverse survival shooter.

Night falls on Blockton Square. The horde is coming through the gates and your squad is the last line. Rack up points, buy guns off the walls, and hold out as long as you can.

🌊 Endless waves — walkers, sprinters and armored brutes
💰 Earn points per hit and kill, spend at wall-buys: Shotgun, AR, Sniper, Ammo, Medkit
🤝 3 AI squadmates who actually hold their own (and panic in chat)
🌙 Moody night map with fog, flickering lamps and boarded windows
📱 Custom mobile fire + interact buttons

Every 5 waves the horde gets faster. Good luck.`,
    controls: [
      ['Left Click', 'Fire weapon'],
      ['E', 'Buy at wall / interact'],
      ['R', 'Reload'],
      ['1 – 3', 'Switch weapon'],
      ['Space', 'Jump'],
      ['W A S D', 'Move'],
    ],
  },
  {
    id: 'nights',
    name: '99 Nights in the Forest',
    creator: 'Emberwood Games',
    genre: 'Survival',
    rating: 95,
    basePlaying: 88700,
    visits: '1.9B+',
    created: 'Jun 2025',
    updated: '1 day ago',
    serverSize: 5,
    maxPlayers: 5,
    thumb: 'assets/thumbs/nights.svg',
    tagline: 'Gather, craft, and keep the fire lit — before the Deer finds you.',
    desc: `🔥 99 NIGHTS IN THE FOREST — a Bloxverse co-op survival.

The forest is safe by day — but when the sun goes down, something wakes in the trees. Keep the campfire burning, craft your gear, and never let your flashlight die. How many nights can you last?

🦌 THE DEER — one towering, unkillable stalker hunts you every night. You can't fight it. Only your FLASHLIGHT turns it away — and it learns to shrug off the beam the more you lean on it. Keep that battery charged.
🔦 Flashlight & batteries — recharge at the fire, loot spares from chests, craft a Strong Flashlight for a brighter, longer stun
🔨 Crafting bench — upgrade it Lv 1→4 and craft spears, bandages, crock-pot meals, batteries, beds and more from wood, scrap & gems
🧰 Loot chests (Common → Diamond) hidden in cabins, radio towers, ruins & a spider cave — some guarded by a beast
🐺 Wolves, spiders, bears and a Blood-Moon Forest Giant boss still prowl the dark
🐰 Hunt bunnies for meat, chop trees, pick berries, keep your hunger up
🌙 Full day/night cycle — each dawn you survive is one more Night
🧑‍🤝‍🧑 AI survivors fight beside you · 🤝 Co-op multiplayer · 📱 Custom mobile buttons

Reach Night 99 to win. Most people don't.`,
    controls: [
      ['Left Click', 'Swing axe / hunt'],
      ['E', 'Chop / pick / feed fire / open chest / craft (hold)'],
      ['Q', 'Toggle flashlight'],
      ['F', 'Eat food'],
      ['R', 'Use bandage'],
      ['Space', 'Jump'],
      ['W A S D', 'Move'],
    ],
  },
];

export function getGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}

// "128.4K" style formatting
export function fmtCount(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// Live-feeling concurrent player count (wobbles over time, stable per minute)
export function livePlaying(game) {
  const t = Math.floor(Date.now() / 60000);
  let h = 2166136261 ^ (game.id.charCodeAt(0) * 16777619);
  h = Math.imul(h ^ t, 16777619) >>> 0;
  const wobble = ((h % 2000) / 1000 - 1) * 0.06; // ±6%
  return Math.max(50, Math.round(game.basePlaying * (1 + wobble)));
}
