# Craftverse — developer notes (progress log for restarts)

Branch: `claude/minecraft-clone-browser-3bbj9c`. The previous Bloxverse site lives untouched under `old/` for comparison.

## What this is
A browser voxel sandbox (Minecraft-like) with **no build step**: ES modules + vendored Three.js r160 (`vendor/three.module.js`).
Serve the repo root statically (`python3 -m http.server 8080`) and open `index.html`. `index.html?quick&mode=creative&seed=1&dim=0&time=1000`
starts a throwaway world instantly (used by the headless tests).

## Architecture (src/)
| file | role |
|---|---|
| `noise.js` | seeded PRNG, Perlin 2D/3D, fBm, ridged, integer hashes |
| `blocks.js` | block registry (337 types, Uint16 ids), shapes (slab/stairs/fence/door/torch...), drops, tool tiers |
| `items.js` | item registry (ids ≥ 1024): tools, armor, food, materials, spawn eggs, smelting table |
| `textures.js` | procedural 16px texture atlas (512², canvas), item icons, `faceTexName()` |
| `chunk.js` | 16×128×16 chunk storage (blocks/meta/light) |
| `lighting.js` | sky + block light flood fill, incremental add/remove on block change |
| `mesher.js` | chunk geometry: culling, smooth light, AO, box/cross/fluid shapes |
| `worldgen.js` (+ `.worker.js`) | biomes, terrain, caves, ores, trees, villages, dungeons, Nether, End; runs in Web Workers |
| `world.js` | chunk lifecycle (load/gen → light → mesh), block get/set, ticks, raycast, collision boxes |
| `renderer.js` | Three.js scene, custom lit chunk shader, sky/sun/moon/stars/clouds, rain, selection box, held item |
| `physics.js` | AABB sweep collision, fluids |
| `blocklogic.js` | fluids, gravity blocks, growth, fire, doors, TNT, portal, placement rules, furnace tick, loot |
| `entities.js` | mobs (AI + box models), items, XP, projectiles, TNT, falling blocks, particles, spawning, dragon |
| `player.js` | movement modes, survival stats, mining, item use, combat, XP, death |
| `inventory.js`, `crafting.js` | inventory containers, 350 shaped/shapeless recipes |
| `ui.js` | HUD, inventory/crafting/chest/furnace/creative/trade screens, chat, pause, options, death, F3 |
| `enchant.js` | enchantment table, random rolls, anvil combine/repair; effects are read via `enchantLevel()` in player/inventory/game |
| `touch.js` | mobile overlay: joystick, look-drag, tap/long-press, buttons (auto-enabled when touch is available) |
| `version.js` | VERSION, UPDATE_NAME, PANORAMA and the CHANGELOG shown on the title screen and in the pause menu |
| `gamepad.js` | Xbox/standard gamepad polling + the shared input-source interface (`move/look/down/pressed`) used by every player; `KeyboardSource` wraps keyboard+mouse |
| `commands.js` | `/gamemode /time /weather /give /tp /summon /setblock /fill /kill /xp /effect ...` |
| `game.js` | loop (20 TPS ticks), input/pointer lock, weather, sleeping, explosions, portals, dimension switch, saving |
| `save.js` | IndexedDB world/chunk persistence, localStorage settings |
| `main.js` | title screen, world list/create, options |

## Multiplayer / input architecture (v1.0.1)
- `game.players[]` holds 1-4 players; `game.player` is player 1 (keyboard/mouse or touch). Extra players join by
  pressing START on an unclaimed controller (`Game.handleJoinRequests`), and leave with BACK+B.
- Each player owns: an **input source** (`p.input`), a **renderer view** (`p.view` = camera + hand + selection +
  break overlay), a **HUD** (`p.hud`, a `.pview` div positioned over its viewport), a **modal screen** (`p.screen`)
  and a **cursor stack** (`p.cursor`). `Renderer.splitLayout()` decides the viewport rectangles.
- Rendering is one pass per view (`beginFrame` / `renderView` / `endFrame`), each with its own sky/fog uniforms;
  views hide other players' hands, selection boxes and their own body model.
- `World.update(centers, budget)` streams chunks around every player.
- Mobs target `game.nearestPlayer(...)`; item/XP pickup and sounds use the nearest player.
- Keyboard discrete actions live in `UI.bindGlobal`; `Game.playerActions` only handles controllers (feeding both
  would double-fire, e.g. Escape closing a screen and then opening the pause menu).
- Gamepad screen navigation: `UI.gamepadNavigate` (spatial slot nav, A take, X split, Y quick-move, B close,
  LB/RB switch creative tabs) and `UI.gamepadGlobal` for the pause menu.

## Status
Working and verified headless (see the test scripts in the session scratchpad: `test2` gameplay, `test3` movement, `test4` enchanting/touch, `split` split-screen with fake gamepads, `feat` autocomplete + update log) (Playwright + swiftshader, see scratch tests): rendering, day/night, Nether, End (dragon + boss bar),
survival HUD, creative inventory, mining, commands, crafting, furnace, mob spawning/combat, explosions, save → quit → reload.

## Known gaps / ideas
- No multiplayer, no redstone circuits, no brewing UI (brewing stand is decorative), no boats/minecarts/riding.
- Mesher/lighting run on the main thread (≈9 ms/chunk each); moving them to workers would smooth chunk loading.
- Chunk pipeline uses square rings: generate ≤ R+2, light ≤ R+1, mesh ≤ R (so the full render distance is meshed).
- Headless testing: the software rasterizer is slow at 1280×720; use an 800×450 viewport and `&rd=3` for tests.
- Title screen renders a live panorama world (seed/viewpoint come from `version.js` PANORAMA, so a major update changes it) (`main.js` startPanorama/stopPanorama) and hands its Renderer to the Game.

## Testing
Headless scripts live in the session scratchpad (`test.js`, `test2.js`, `prof.mjs`); they launch `/opt/pw-browsers/chromium-1194`
with `--use-angle=swiftshader` against `http://127.0.0.1:8080`.
