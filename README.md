# 🟦 BLOXVERSE

A fan-made, **browser-only** blocky game platform: a full website with five playable 3D games,
AI players that *actually play* every game, and a mood-driven AI chat system — all running
client-side with **zero backend, zero API keys, zero build step**.

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
| **Mega Sky Obby** | Platformer | 30 stages — kill bricks, spinners, movers, vanishing tiles — checkpoints, live race vs 5 AI runners, summit crown |
| **Zombie Blocks: Last Stand** | Survival | Endless night waves (walkers/runners/brutes), points economy, wall-buy weapons, 3 AI squadmates |

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
