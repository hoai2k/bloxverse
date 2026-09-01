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
| `commands.js` | `/gamemode /time /weather /give /tp /summon /setblock /fill /kill /xp /effect ...` |
| `game.js` | loop (20 TPS ticks), input/pointer lock, weather, sleeping, explosions, portals, dimension switch, saving |
| `save.js` | IndexedDB world/chunk persistence, localStorage settings |
| `main.js` | title screen, world list/create, options |

## Status
Working and verified headless (Playwright + swiftshader, see scratch tests): rendering, day/night, Nether, End (dragon + boss bar),
survival HUD, creative inventory, mining, commands, crafting, furnace, mob spawning/combat, explosions, save → quit → reload.

## Known gaps / ideas
- No multiplayer, no redstone circuits, no enchanting/brewing UI (blocks are decorative), no boats/minecarts/riding.
- Touch controls not implemented.
- Mesher/lighting run on the main thread (≈9 ms/chunk each); moving them to workers would smooth chunk loading.

## Testing
Headless scripts live in the session scratchpad (`test.js`, `test2.js`, `prof.mjs`); they launch `/opt/pw-browsers/chromium-1194`
with `--use-angle=swiftshader` against `http://127.0.0.1:8080`.
