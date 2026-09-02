# ⛏ Craftverse

A Minecraft-style voxel sandbox that runs **entirely in the browser** — no build step, no server, no downloaded assets.
Every texture, sound and model is generated in code at runtime.

> Independent hobby project. Not affiliated with Mojang or Microsoft. The previous project that lived in this
> repository (Bloxverse) is preserved under [`old/`](old/) for comparison.

## ▶️ Play

Any static file server works (ES modules need `http://`, not `file://`):

```bash
python3 -m http.server 8080      # or: npx http-server -p 8080
```

Open **http://localhost:8080**. It also deploys straight to GitHub Pages from the repo root.

## 🎮 Features

| Area | What's in |
|---|---|
| **Game modes** | Survival, Creative (flight, infinite items, item tabs & search), Hardcore (one life, world locks to spectator), Adventure, Spectator (noclip). Peaceful / Easy / Normal / Hard difficulty. Cheats toggle. |
| **World** | Infinite terrain in 16×128×16 chunks, 26 biomes (plains, forests, taiga, jungle, swamp, desert, savanna, badlands, cherry grove, mushroom fields, mountains, ice spikes, oceans, rivers, beaches…), caves (spaghetti + caverns), lava lakes, 10 ores incl. deepslate variants, trees for every wood type, flowers, crops, kelp & seagrass, snow & ice. World types: Default, Superflat, Amplified, Large Biomes. Seeds. |
| **Structures** | Villages (houses, wells, paths, farms, beds, loot chests, villagers & iron golems, 4 styles), dungeons with mob spawners, desert wells, ruined portals, nether bridges, End pillars and portal. |
| **Dimensions** | Overworld, **Nether** (lava seas, nylium forests, soul sand valleys, basalt deltas, glowstone, quartz, ancient debris) via obsidian portals, **The End** (main island, pillars, outer islands with chorus, the **Ender Dragon** boss with health bar, exit portal & dragon egg) via eye-activated portal frames. |
| **Lighting** | Sky & block light with flood-fill propagation, smooth lighting, ambient occlusion, day/night cycle with sun, moon, stars, clouds, dusk/dawn tint, rain & thunderstorms (lightning, snow in cold biomes). |
| **Blocks** | 337 block types: slabs, stairs, fences, walls, doors, ladders, torches, beds, chests, barrels, furnaces / smokers / blast furnaces, crafting tables, TNT, glass & stained glass, wool/carpet/concrete/terracotta in 16 colours, flowing water & lava, fire that spreads, falling sand/gravel, farmland, saplings that grow, leaves that decay… |
| **Items** | 227 items: tools & armor in 6 tiers (wood → netherite), bows & arrows, shield, shears, buckets, flint & steel, bone meal, spawn eggs, 40+ foods, fishing rod, ender pearls, elytra + fireworks, totem of undying. |
| **Crafting** | 350 recipes (2×2 inventory grid & 3×3 table) with a recipe book that shows what you can make and fills the grid. Smelting with fuel, smokers for food, blast furnaces for ores. Villager trading. |
| **Enchanting** | Enchanting table (bookshelves raise the level cap to 30, costs lapis + XP), 24 enchantments with real effects (Efficiency, Fortune, Silk Touch, Unbreaking, Mending, Sharpness, Smite, Knockback, Fire Aspect, Looting, Protection variants, Thorns, Feather Falling, Depth Strider, Respiration, Aqua Affinity, Power, Punch, Flame, Infinity…), enchanted books from loot & librarians, anvil to repair and combine. |
| **Mobs** | Zombies, husks, drowned, skeletons, strays, creepers (they explode), spiders & cave spiders, endermen (teleport, hate water), slimes (split), witches, phantoms, blazes, ghasts, zombified piglins (swarm when hit), cows, pigs, sheep (shear & dye), chickens (eggs), horses, wolves (tame with bones, they fight for you), cats, bees, villagers, iron golems. Breeding, babies, burning in daylight, spawn rules by light/biome/dimension. |
| **Survival** | Health, hunger & saturation, regen, armor, fall damage, drowning, fire, lava, poison, XP orbs & levels, sleeping in beds to skip the night (phantoms come if you don't), respawn points, death screen with cause. |
| **Movement** | Walk, sprint (double-tap W), sneak (edge-safe), auto-jump, swim, climb ladders & vines, creative flight (double-tap space), elytra gliding, slipping on ice, bouncing on slime. First / third person (F5). |
| **Local multiplayer** | Up to **4 players on one screen**. Press START on any spare Xbox-style controller to drop in at any time; split-screen re-lays out automatically (stacked for 2, three-up, quadrants for 4). Every player gets their own camera, HUD, inventory and screens, and mobs chase whoever is nearest. Hold BACK and press B to drop out. |
| **Controllers** | Full Xbox/standard gamepad support in menus and in game: sticks to move and look, A jump, LB sneak, L3 sprint, RT mine/attack, LT place/use, Y inventory, B drop, X offhand, D-pad hotbar, R3 camera, START pause. Inventories, chests, crafting, the pause menu and the title screen are all navigable with the pad; slots highlight as you move. |
| **Touch** | On phones and tablets: virtual joystick, drag to look, tap to place, long-press to mine, jump/sneak/inventory/chat buttons. |
| **Persistence** | Multiple worlds saved in IndexedDB (chunks, tile entities, mobs, player, time, weather), autosave, settings in localStorage. |
| **Auto-complete** | The chat box completes commands and their arguments (blocks, items, mobs, biomes, effects, enchantments, game modes...) as you type. Tab completes, arrow keys pick from the list. |
| **Commands** | `/gamemode /time /weather /difficulty /give /tp /summon /setblock /fill /kill /clear /xp /heal /effect /spawnpoint /seed /locate /dimension` (see `/help`). |

## ⌨️ Controls

**Keyboard & mouse** — `WASD` move · `Space` jump · `Shift` sneak · `Ctrl` / double-`W` sprint · `E` inventory · `Q` drop ·
`F` swap offhand · `1-9` / scroll hotbar · Left click mine / attack · Right click place / use · Middle click pick block ·
`T` chat · `/` command (`Tab` completes) · `F1` hide HUD · `F2` screenshot · `F3` debug · `F5` camera · `F11` fullscreen · `Esc` menu

**Controller** — left stick move · right stick look · `A` jump · `LB` sneak · `L3` sprint · `RT` mine/attack · `LT` place/use ·
`Y` inventory · `B` drop · `X` offhand · `D-pad ←/→` hotbar · `R3` camera · `START` pause · `BACK` chat.
In menus: `D-pad` move · `A` select/take · `X` split stack · `Y` quick-move · `B` back · `LB`/`RB` switch tabs.
**Press `START` on an unused controller to join the game in split-screen; hold `BACK` and press `B` to leave.**

The title screen shows a live, slowly rotating procedurally generated world.

## 📦 Versions

The title screen shows the current version and the name of the latest major update, and the **Update Log**
(title screen or pause menu) lists every release. Major content updates — new biomes, mobs, dimensions or systems —
bump the minor version (1.0 → 1.1), get a name and a fresh title-screen panorama; smaller updates bump the patch
number. Everything is driven by `src/version.js`.

## 🧱 Tech

Plain ES modules + a vendored copy of Three.js (`vendor/three.module.js`). Terrain generation runs in Web Workers; chunk meshing uses a custom
lit shader with per-vertex sky/block light. See [`DEVNOTES.md`](DEVNOTES.md) for the architecture map.
