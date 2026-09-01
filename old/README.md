# 🟦 BLOXVERSE

A fan-made, **browser-only** blocky game platform: a full website with six playable 3D games,
online multiplayer, AI players that *actually play* every game, and a mood-driven AI chat
system — all running client-side with **zero build step**.

> Bloxverse is an original hobby project. It is not affiliated with, endorsed by, or connected
> to Roblox Corporation or any game studio. All code, 3D models, animations, artwork, and audio
> are original — models are built procedurally from primitives, art is hand-written SVG, and
> every sound is synthesized live with WebAudio.

## ▶️ Run it

Any static file server works (ES modules require http, not `file://`):

```bash
# option 1
npm start                      # uses npx http-server on :8080

# option 2
python3 -m http.server 8080
```

Then open **http://localhost:8080**. Works on GitHub Pages too — just serve the repo root.

## 🎮 The games

| Game | Genre | What you get |
|---|---|---|
| **Jujutsu Shenanigans** | Fighting | City battleground, 4-hit M1 combos, 4 cursed abilities, block/dash, **Awakening** ult, ragdolls & break-apart KOs |
| **RIVALS** | Shooter | Team deathmatch rounds to 20, AR/Shotgun/Sniper/Pistol, headshots, reloads, sniper scope, round intermissions |
| **Welcome to Bloxville** | Life sim | Your own plot, Build Mode with 14 furniture items (auto-saves), Bloxy Burgers job minigame with promotions, needs, day/night cycle, AI neighbors with schedules |
| **Mega Sky Obby** | Platformer | 30 stages from a library of 12 obstacle types — jumps, staircases, zigzags, tightropes, stepping stones, kill bricks, moving platforms, conveyors, swinging wrecking balls, vanishing tiles, shrinking gauntlets, spinners — checkpoints, live race vs AI runners, summit crown |
| **Zombie Blocks: Last Stand** | Survival | Endless night waves (walkers/runners/brutes), points economy, wall-buy weapons, 3 AI squadmates |
| **99 Nights in the Forest** | Co-op survival | A big forest with a survivor camp (cabin, tents, watchtower, **crafting bench**) and landmarks (**radio towers**, ruins, graveyards, a **spider cave**). By day: chop wood, hunt bunnies, loot **chests** (Common→Diamond, some guarded) and **craft** at an upgradeable Lv 1→4 bench (spears, bandages, crock-pot meals, batteries, beds, Strong Flashlight). By night: **THE DEER** — a single towering, *unkillable* stalker that **roams** the woods but **hunts you down** if you stray too far from camp or let the fire die; only your **flashlight** turns it away (and it grows resistant to the beam, and rages on blood-moon nights). Wolves/spiders/bears + a **Forest Giant** boss still prowl. Fog-choked nights, day/night cycle counting Nights survived (99 to win), hunger, flashlight battery, AI companions, host-authoritative co-op |

## 🤖 The AI players

Every server is filled with named bots (32 personas) that genuinely play:
they fight, aim, strafe, retreat, race the obby, buy weapons, commute to work and sleep at night.

Each bot has a fixed **mood** — angry, happy, chill, competitive, silly, dramatic or shy — that
drives a procedural chat engine (`js/engine/chatbrain.js`):

- **Situation-aware**: kills, deaths, low HP, falling off stage 23, wave 7 starting, getting promoted…
- **Mood-consistent**: kill an angry bot and it *will* call you an unskilled noob; a shy bot just apologizes.
- **Never repetitive**: template grammars × word pools × per-bot style (typos, caps, elongation, emoji)
  with shuffled-deck anti-repetition and a global recent-line memory.
- **They talk back**: type in chat — greetings, "gg", insults, questions and praise all get mood-appropriate replies. Bots also reply to each other.

No network calls, no API keys — it's all deterministic-ish text generation in the browser.

## 🌐 Online multiplayer (InstantDB)

Bloxverse is multiplayer out of the box, powered by [InstantDB](https://instantdb.com)
rooms — no game server, no build step, still a fully static site:

- **Accounts are just usernames** (built for friend groups): the sign-in screen lists
  existing names to pick from, lets you create a new one, and can 🗑 delete accounts.
  Your avatar and Blux follow your username across devices.
- **Presence-based netcode** — each client owns its character and publishes position /
  animation / HP ~10×/s into a per-game room; everyone else renders interpolated avatars.
  Chat, damage and deaths travel as room topics (damage is victim-authoritative — the
  right trust model for friends).
- **Co-op horde in Zombie Blocks** — the longest-connected player hosts the horde and
  streams a compact snapshot; others render proxies and send hit events. Host migrates
  automatically if they leave.
- **Bots step aside when friends join** (each client simulates its own bots, so keeping
  them would show everyone a different copy) — and come back when you're alone.
- **Offline still works**: every network call is guarded with timeouts and fallbacks.
  No connection → local accounts, bots-only games, exactly as before.

## 📱 Mobile

Full touch support in every game, platform-style: dynamic left thumbstick, drag-to-look,
jump button, and **custom on-screen buttons** per game (abilities in Jujutsu, FIRE/scope/reload
in the shooters, build/rotate in Bloxville), plus tappable interaction prompts.

## 🧱 Tech

- **three.js** (vendored in `/vendor`) — no bundler, plain ES modules + import maps
- Custom engine in `js/engine/`: R15-style 15-part procedural avatar rig with joint animations,
  faces, hats and chat bubbles · AABB physics tuned to classic platform feel (gravity 196.2,
  walkspeed 16, jump 50, auto step-up) · procedural canvas textures (studs, grass, brick, windows) ·
  WebAudio SFX synth · HUD (chat, leaderboard, killfeed, prompts, menus)
- Site shell in `js/site/`: discover page, game pages with votes/favorites, avatar editor
  with a Blux hat shop (earn Blux by playing, spend it on hats)
- Everything persists in `localStorage`: username, avatar, Blux, votes, Bloxville house & money, obby best stage

## 🗂️ Layout

```
index.html game.html avatar.html play.html   # pages
css/            site + in-game HUD styles
js/site/        catalog, shell, page logic
js/engine/      core, character, physics, input, ui, world, guns, sfx, bots, chatbrain
js/games/       jujutsu, rivals, bloxburg, obby, zombies
assets/thumbs/  hand-written SVG art
vendor/         three.module.js
```
