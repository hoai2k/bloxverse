// Block behaviours: fluids, gravity, growth, fire, doors, placement rules, tile-entity ticking.
import { BLOCKS, B, isSoil, WOODS, isReplaceable } from './blocks.js';
import { I, getItem, resolveId, SMELTING, fuelValue, isBlockItem } from './items.js';
import { CY } from './chunk.js';
import { SEA_LEVEL } from './worldgen.js';
import { rollEnchantments } from './enchant.js';

const H4 = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
let game = null;
export function attachGame(g) { game = g; }

function def(name) { return BLOCKS[B[name]]; }
function canFlowInto(id) { if (id === 0) return true; const d = BLOCKS[id]; return d && d.replaceable && !d.fluid; }

// ---------- fluids ----------
function fluidTick(world, x, y, z, meta, id) {
  const water = id === B.water; const delay = water ? 5 : (world.dim === 1 ? 10 : 30); const maxLevel = water ? 7 : (world.dim === 1 ? 7 : 3);
  const level = meta & 7, falling = (meta & 8) !== 0;
  // 1) recompute own level from neighbours when not a source
  if (level > 0) {
    let best = 99;
    const aboveId = world.getBlock(x, y + 1, z);
    if (aboveId === id) best = 0; // fed from above: level 1 falling
    for (const [dx, , dz] of H4) { if (world.getBlock(x + dx, y, z + dz) === id) { const m = world.getMeta(x + dx, y, z + dz) & 7; if (m < best) best = m; } }
    let newLevel = best + 1;
    if (aboveId === id) newLevel = 1;
    // infinite water: 2+ adjacent sources
    if (water) { let src = 0; for (const [dx, , dz] of H4) if (world.getBlock(x + dx, y, z + dz) === B.water && (world.getMeta(x + dx, y, z + dz) & 7) === 0) src++; const below = world.getBlock(x, y - 1, z); if (src >= 2 && (BLOCKS[below].opaque || below === B.water)) { world.setBlock(x, y, z, id, 0, { silent: true }); return; } }
    if (newLevel > maxLevel) { world.setBlock(x, y, z, 0, 0); for (const [dx, dy, dz] of D6) { if (world.getBlock(x + dx, y + dy, z + dz) === id) world.scheduleTick(x + dx, y + dy, z + dz, delay); } return; }
    if (newLevel !== level || ((aboveId === id) !== falling)) { world.setMeta(x, y, z, newLevel | (aboveId === id ? 8 : 0)); }
    meta = newLevel | (aboveId === id ? 8 : 0);
  }
  const lvl = meta & 7;
  // 2) flow down
  const belowId = world.getBlock(x, y - 1, z);
  if (y > 0) {
    if (canFlowInto(belowId)) { world.setBlock(x, y - 1, z, id, 1 | 8, { silent: true }); world.scheduleTick(x, y - 1, z, delay); }
    else if (belowId !== id && BLOCKS[belowId].fluid) { // water meets lava
      if (water) world.setBlock(x, y - 1, z, (world.getMeta(x, y - 1, z) & 7) === 0 ? B.obsidian : B.cobblestone); else world.setBlock(x, y - 1, z, B.stone);
      game && game.playSoundAt('lava', x, y, z);
    }
  }
  // 3) flow sideways if we sit on something (not falling into air)
  const belowSolid = !canFlowInto(belowId) && belowId !== id || (belowId === id && (world.getMeta(x, y - 1, z) & 7) === 0);
  const onFluid = belowId === id;
  if ((belowSolid || onFluid) && lvl < maxLevel) {
    for (const [dx, , dz] of H4) {
      const nx = x + dx, nz = z + dz; const nid = world.getBlock(nx, y, nz);
      if (canFlowInto(nid)) { world.setBlock(nx, y, nz, id, lvl + 1, { silent: true }); world.scheduleTick(nx, y, nz, delay); }
      else if (nid !== id && BLOCKS[nid].fluid) { world.setBlock(nx, y, nz, water ? B.cobblestone : B.cobblestone); game && game.playSoundAt('lava', x, y, z); }
      else if (nid === id) { const nm = world.getMeta(nx, y, nz) & 7; if (nm > lvl + 1) { world.setMeta(nx, y, nz, lvl + 1); world.scheduleTick(nx, y, nz, delay); } }
    }
  }
  if (!water && game) { // lava ignites nearby flammables
    if (Math.random() < 0.06) { const [dx, dy, dz] = D6[Math.floor(Math.random() * 6)]; const t = world.getBlock(x + dx, y + dy, z + dz); if (t === 0 && Math.random() < 0.5) { for (const [ex, ey, ez] of D6) { const f = BLOCKS[world.getBlock(x + dx + ex, y + dy + ey, z + dz + ez)]; if (f.flammable) { world.setBlock(x + dx, y + dy, z + dz, B.fire); world.scheduleTick(x + dx, y + dy, z + dz, 20); break; } } } }
  }
}
for (const name of ['water', 'lava']) {
  const d = def(name);
  d.onTick = (world, x, y, z, meta) => fluidTick(world, x, y, z, meta, B[name]);
  d.onPlaced = (world, x, y, z) => world.scheduleTick(x, y, z, 1);
  d.onNeighborChanged = (world, x, y, z) => world.scheduleTick(x, y, z, name === 'water' ? 5 : 20);
}

// ---------- gravity ----------
for (const d of BLOCKS) {
  if (!d.gravity) continue;
  d.onPlaced = (world, x, y, z) => world.scheduleTick(x, y, z, 2);
  d.onNeighborChanged = (world, x, y, z) => world.scheduleTick(x, y, z, 2);
  d.onTick = (world, x, y, z, meta) => {
    const below = world.getBlock(x, y - 1, z);
    if (y > 0 && (below === 0 || BLOCKS[below].fluid || (BLOCKS[below].replaceable && !BLOCKS[below].solid))) {
      world.setBlock(x, y, z, 0, 0, { noUpdate: false });
      if (game) game.entities.spawnFallingBlock(x, y, z, d.id, meta);
    }
  };
}

// ---------- attachables / plants ----------
function breakIfUnsupported(world, x, y, z, ok) { if (!ok) game && game.breakBlock(x, y, z, null, true); }
def('torch').onNeighborChanged = (world, x, y, z) => {
  const m = world.getMeta(x, y, z);
  const sup = m === 0 ? [0, -1, 0] : m === 1 ? [-1, 0, 0] : m === 2 ? [1, 0, 0] : m === 3 ? [0, 0, -1] : [0, 0, 1];
  const s = BLOCKS[world.getBlock(x + sup[0], y + sup[1], z + sup[2])];
  breakIfUnsupported(world, x, y, z, s.opaque || (m === 0 && (s.fence || s.slab || s.stairs || s.solid && !s.fluid)));
};
for (const name of ['ladder', 'vine']) def(name).onNeighborChanged = (world, x, y, z) => {
  const m = world.getMeta(x, y, z) & 3; const sup = m === 0 ? [0, 0, -1] : m === 1 ? [1, 0, 0] : m === 2 ? [0, 0, 1] : [-1, 0, 0];
  const s = BLOCKS[world.getBlock(x + sup[0], y + sup[1], z + sup[2])];
  if (name === 'vine' && world.getBlock(x, y + 1, z) === B.vine) return;
  breakIfUnsupported(world, x, y, z, s.opaque || s.leaves);
};
for (const d of BLOCKS) {
  if (d.needsSoil || d.crop || d.mushroom || d.cane || d.cactus || d.name === 'lily_pad' || d.name === 'kelp' || d.name === 'seagrass' || d.name === 'pink_petals' || d.name === 'bamboo' || d.name === 'dead_bush' || d.name === 'snow' || d.name === 'nether_wart') {
    const prev = d.onNeighborChanged;
    d.onNeighborChanged = (world, x, y, z, fx, fy, fz) => {
      if (prev) prev(world, x, y, z, fx, fy, fz);
      const below = world.getBlock(x, y - 1, z); const bd = BLOCKS[below];
      let ok;
      if (d.tall && (world.getMeta(x, y, z) & 8)) ok = world.getBlock(x, y - 1, z) === d.id;
      else if (d.crop) ok = d.soil ? below === B[d.soil] : below === B.farmland;
      else if (d.cane) ok = below === B.sugar_cane || isSoil(below) || below === B.sand || below === B.red_sand;
      else if (d.cactus) ok = below === B.cactus || below === B.sand || below === B.red_sand;
      else if (d.name === 'lily_pad') ok = below === B.water || below === B.ice;
      else if (d.name === 'kelp' || d.name === 'seagrass') ok = below === B.kelp || bd.opaque || below === B.sand;
      else if (d.name === 'bamboo') ok = below === B.bamboo || isSoil(below) || below === B.sand;
      else if (d.name === 'dead_bush') ok = below === B.sand || below === B.red_sand || below === B.terracotta || isSoil(below);
      else if (d.name === 'snow') ok = bd.opaque || below === B.snow_block || below === B.ice;
      else if (d.mushroom) ok = bd.opaque || below === B.mycelium;
      else ok = isSoil(below);
      if (d.tall && !(world.getMeta(x, y, z) & 8) && ok) { if (world.getBlock(x, y + 1, z) !== d.id) ok = false; }
      if (!ok) game && game.breakBlock(x, y, z, null, true);
    };
  }
}
// tall plants: breaking one half breaks the other
for (const d of BLOCKS) if (d.tall) d.onBroken = (world, x, y, z, meta) => { if (meta & 8) { if (world.getBlock(x, y - 1, z) === d.id) world.setBlock(x, y - 1, z, 0); } else if (world.getBlock(x, y + 1, z) === d.id) world.setBlock(x, y + 1, z, 0); };

// ---------- random ticks: growth & environment ----------
def('grass_block').onRandomTick = (world, x, y, z, meta, rng) => {
  const above = BLOCKS[world.getBlock(x, y + 1, z)];
  if (above.opaque || above.fluid) { if (world.getSky(x, y + 1, z) < 4) world.setBlock(x, y, z, B.dirt); return; }
  if (world.getLightLevel(x, y + 1, z) >= 9) {
    const nx = x + Math.floor(rng() * 3) - 1, ny = y + Math.floor(rng() * 5) - 3, nz = z + Math.floor(rng() * 3) - 1;
    if (world.getBlock(nx, ny, nz) === B.dirt && !BLOCKS[world.getBlock(nx, ny + 1, nz)].opaque && world.getLightLevel(nx, ny + 1, nz) >= 4) world.setBlock(nx, ny, nz, B.grass_block);
  }
};
for (const d of BLOCKS) {
  if (d.sapling) d.onRandomTick = (world, x, y, z, meta, rng) => { if (world.getLightLevel(x, y + 1, z) >= 9 && rng() < 0.15) growTree(world, x, y, z, d.sapling, rng); };
  if (d.crop) d.onRandomTick = (world, x, y, z, meta, rng) => {
    const stages = d.stages || 8; const stage = meta & 7;
    if (stage >= stages - 1) { if (d.stemFruit) tryFruit(world, x, y, z, d, rng); return; }
    if (d.soil === 'soul_sand' ? rng() < 0.3 : (world.getLightLevel(x, y, z) >= 9 && rng() < ((world.getMeta(x, y - 1, z) & 7) ? 0.35 : 0.15))) world.setMeta(x, y, z, stage + 1);
  };
  if (d.leaves) d.onRandomTick = (world, x, y, z, meta, rng) => {
    if (meta & 4) return; // player placed
    if (rng() > 0.35) return;
    for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) { if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 5) continue; const b = BLOCKS[world.getBlock(x + dx, y + dy, z + dz)]; if (b.name.endsWith('_log') || b.name.endsWith('_stem')) return; }
    game && game.breakBlock(x, y, z, null, true);
  };
}
function tryFruit(world, x, y, z, d, rng) {
  if (rng() > 0.1) return;
  const fruit = B[d.stemFruit];
  for (const [dx, , dz] of H4) if (world.getBlock(x + dx, y, z + dz) === fruit) return;
  const [dx, , dz] = H4[Math.floor(rng() * 4)];
  const below = world.getBlock(x + dx, y - 1, z + dz);
  if (world.getBlock(x + dx, y, z + dz) === 0 && (isSoil(below) || below === B.farmland)) world.setBlock(x + dx, y, z + dz, fruit);
}
def('farmland').onRandomTick = (world, x, y, z, meta, rng) => {
  let wet = false;
  for (let dx = -4; dx <= 4 && !wet; dx++) for (let dz = -4; dz <= 4 && !wet; dz++) for (let dy = 0; dy <= 1; dy++) if (world.getBlock(x + dx, y + dy, z + dz) === B.water) { wet = true; break; }
  if (game && game.weather.raining && world.getSky(x, y + 1, z) >= 15) wet = true;
  if (wet) { if ((meta & 7) !== 7) world.setMeta(x, y, z, 7); }
  else if (meta & 7) world.setMeta(x, y, z, 0);
  else if (!BLOCKS[world.getBlock(x, y + 1, z)].crop && rng() < 0.3) world.setBlock(x, y, z, B.dirt);
};
def('cactus').onRandomTick = (world, x, y, z, meta, rng) => { if (rng() > 0.12) return; let h = 1; while (world.getBlock(x, y - h, z) === B.cactus) h++; if (h < 3 && world.getBlock(x, y + 1, z) === 0) world.setBlock(x, y + 1, z, B.cactus); };
def('sugar_cane').onRandomTick = (world, x, y, z, meta, rng) => { if (rng() > 0.12) return; let h = 1; while (world.getBlock(x, y - h, z) === B.sugar_cane) h++; if (h < 3 && world.getBlock(x, y + 1, z) === 0) world.setBlock(x, y + 1, z, B.sugar_cane); };
def('bamboo').randomTick = true; def('bamboo').onRandomTick = (world, x, y, z, meta, rng) => { if (rng() > 0.1) return; let h = 1; while (world.getBlock(x, y - h, z) === B.bamboo) h++; if (h < 14 && world.getBlock(x, y + 1, z) === 0) world.setBlock(x, y + 1, z, B.bamboo); };
def('kelp').randomTick = true; def('kelp').onRandomTick = (world, x, y, z, meta, rng) => { if (rng() > 0.1) return; if (world.getBlock(x, y + 1, z) === B.water) world.setBlock(x, y + 1, z, B.kelp); };
def('ice').randomTick = true; def('ice').onRandomTick = (world, x, y, z, meta, rng) => { if (world.getLightLevel(x, y, z) > 11 && !world.biomeAt(x, z).snow) world.setBlock(x, y, z, world.dim === 1 ? 0 : B.water); };
def('snow').randomTick = true; def('snow').onRandomTick = (world, x, y, z, meta, rng) => { if (world.getLightLevel(x, y, z) > 11 && !world.biomeAt(x, z).snow) world.setBlock(x, y, z, 0); };
def('water').randomTick = true; def('water').onRandomTick = (world, x, y, z, meta, rng) => { if ((meta & 7) === 0 && world.biomeAt(x, z).snow && world.getSky(x, y + 1, z) >= 14 && world.getBlock(x, y + 1, z) === 0 && rng() < 0.2) world.setBlock(x, y, z, B.ice); };
for (const n of ['brown_mushroom', 'red_mushroom']) { def(n).randomTick = true; def(n).onRandomTick = (world, x, y, z, meta, rng) => { if (rng() > 0.02 || world.getLightLevel(x, y, z) > 12) return; const nx = x + Math.floor(rng() * 3) - 1, nz = z + Math.floor(rng() * 3) - 1, ny = y + Math.floor(rng() * 3) - 1; if (world.getBlock(nx, ny, nz) === 0 && BLOCKS[world.getBlock(nx, ny - 1, nz)].opaque) world.setBlock(nx, ny, nz, B[n]); }; }

// ---------- fire ----------
def('fire').onPlaced = (world, x, y, z) => world.scheduleTick(x, y, z, 20 + Math.floor(Math.random() * 20));
def('fire').onTick = (world, x, y, z, meta) => {
  if (game && game.weather.raining && world.getSky(x, y, z) >= 14) { world.setBlock(x, y, z, 0); return; }
  let flammable = 0; const below = BLOCKS[world.getBlock(x, y - 1, z)];
  const eternal = below.id === B.netherrack || below.id === B.magma_block;
  for (const [dx, dy, dz] of D6) { const b = BLOCKS[world.getBlock(x + dx, y + dy, z + dz)]; if (b.flammable) flammable += b.flammable; }
  if (!eternal && (meta >= 12 || (flammable === 0 && !below.opaque) || (flammable === 0 && Math.random() < 0.3))) { world.setBlock(x, y, z, 0); return; }
  if (!eternal) world.setMeta(x, y, z, Math.min(15, meta + 1));
  // burn neighbours
  for (const [dx, dy, dz] of D6) {
    const nx = x + dx, ny = y + dy, nz = z + dz; const b = BLOCKS[world.getBlock(nx, ny, nz)];
    if (b.flammable && Math.random() < b.flammable / 150) { world.setBlock(nx, ny, nz, Math.random() < 0.5 ? B.fire : 0); }
  }
  // spread to air next to flammables
  if (Math.random() < 0.25 + flammable / 200) {
    const sx = x + Math.floor(Math.random() * 3) - 1, sy = y + Math.floor(Math.random() * 3) - 1, sz = z + Math.floor(Math.random() * 3) - 1;
    if (world.getBlock(sx, sy, sz) === 0) { let near = false; for (const [dx, dy, dz] of D6) if (BLOCKS[world.getBlock(sx + dx, sy + dy, sz + dz)].flammable) near = true; if (near) world.setBlock(sx, sy, sz, B.fire); }
  }
  world.scheduleTick(x, y, z, 20 + Math.floor(Math.random() * 25));
};
def('fire').onNeighborChanged = (world, x, y, z) => { if (!world.tickQueue.some(t => t.x === x && t.y === y && t.z === z)) world.scheduleTick(x, y, z, 10); };

// ---------- TNT ----------
def('tnt').onNeighborChanged = (world, x, y, z, fx, fy, fz) => { if (world.getBlock(fx, fy, fz) === B.fire || world.getBlock(fx, fy, fz) === B.lava) igniteTNT(world, x, y, z); };
export function igniteTNT(world, x, y, z) { world.setBlock(x, y, z, 0); if (game) game.entities.spawnTNT(x + 0.5, y, z + 0.5, 80); }

// ---------- doors ----------
for (const w of WOODS) {
  const d = def(`${w}_door`);
  d.onInteract = (world, x, y, z, meta) => {
    const open = !(meta & 4);
    const other = (meta & 8) ? y - 1 : y + 1;
    world.setMeta(x, y, z, (meta & ~4) | (open ? 4 : 0));
    if (world.getBlock(x, other, z) === d.id) { const om = world.getMeta(x, other, z); world.setMeta(x, other, z, (om & ~4) | (open ? 4 : 0)); }
    game && game.playSoundAt('door', x, y, z);
    return true;
  };
  d.onNeighborChanged = (world, x, y, z) => {
    const meta = world.getMeta(x, y, z);
    if (meta & 8) { if (world.getBlock(x, y - 1, z) !== d.id) world.setBlock(x, y, z, 0); }
    else if (!BLOCKS[world.getBlock(x, y - 1, z)].solid) game && game.breakBlock(x, y, z, null, true);
    else if (world.getBlock(x, y + 1, z) !== d.id) world.setBlock(x, y, z, 0);
  };
  d.onBroken = (world, x, y, z, meta) => { if (meta & 8) { if (world.getBlock(x, y - 1, z) === d.id) world.setBlock(x, y - 1, z, 0, 0, { silent: true }); } else if (world.getBlock(x, y + 1, z) === d.id) world.setBlock(x, y + 1, z, 0, 0, { silent: true }); };
}
def('bed').onInteract = (world, x, y, z, meta) => { if (game) game.trySleep(x, y, z); return true; };
def('bed').onBroken = (world, x, y, z, meta) => {
  const f = meta & 3; const dir = [[0, 1], [-1, 0], [0, -1], [1, 0]][f];
  const ox = (meta & 4) ? x - dir[0] : x + dir[0], oz = (meta & 4) ? z - dir[1] : z + dir[1];
  if (world.getBlock(ox, y, oz) === B.bed) world.setBlock(ox, y, oz, 0, 0, { silent: true });
};
def('cake').onInteract = (world, x, y, z, meta) => { if (!game) return false; if (!game.player.eat(2, 0.4)) return true; if ((meta & 7) >= 6) world.setBlock(x, y, z, 0); else world.setMeta(x, y, z, (meta & 7) + 1); return true; };
def('note_block').onInteract = (world, x, y, z, meta) => { const n = ((meta & 31) + 1) % 25; world.setMeta(x, y, z, n); game && game.playSoundAt('note', x, y, z, { freq: 185 * Math.pow(2, n / 12) }); return true; };
def('jukebox').onInteract = (world, x, y, z) => { game && game.playSoundAt('note', x, y, z, { freq: 330 }); return true; };
def('nether_portal').onNeighborChanged = (world, x, y, z) => {
  const m = world.getMeta(x, y, z) & 1; const dirs = m ? [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] : [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]];
  for (const [dx, dy, dz] of dirs) { const id = world.getBlock(x + dx, y + dy, z + dz); if (id !== B.obsidian && id !== B.nether_portal) { world.setBlock(x, y, z, 0); return; } }
};
def('sponge').onPlaced = (world, x, y, z) => { let n = 0; const q = [[x, y, z, 0]]; const seen = new Set(); while (q.length && n < 65) { const [cx, cy, cz, d] = q.shift(); if (d > 6) continue; for (const [dx, dy, dz] of D6) { const nx = cx + dx, ny = cy + dy, nz = cz + dz; const k = nx + ',' + ny + ',' + nz; if (seen.has(k)) continue; seen.add(k); if (world.getBlock(nx, ny, nz) === B.water) { world.setBlock(nx, ny, nz, 0); n++; q.push([nx, ny, nz, d + 1]); } } } };

// ---------- trees ----------
export function growTree(world, x, y, z, type, rng) {
  const g = world.gen;
  world.setBlock(x, y, z, 0, 0, { silent: true });
  const set = (wx, wy, wz, id, m = 0, force = false) => { if (wy < 0 || wy >= CY) return; const cur = world.getBlock(wx, wy, wz); if (!force && cur !== 0 && !BLOCKS[cur].leaves && !BLOCKS[cur].replaceable) return; world.setBlock(wx, wy, wz, id, m, { silent: true }); };
  g.placeTree(type, x, y, z, rng, set, rng() < 0.1, null);
}

// ---------- bone meal ----------
export function applyBoneMeal(world, x, y, z, rng) {
  const id = world.getBlock(x, y, z), d = BLOCKS[id], meta = world.getMeta(x, y, z);
  if (d.sapling) { growTree(world, x, y, z, d.sapling, rng); return true; }
  if (d.crop) { const stages = d.stages || 8; if ((meta & 7) >= stages - 1) return false; world.setMeta(x, y, z, Math.min(stages - 1, (meta & 7) + 2 + Math.floor(rng() * 3))); return true; }
  if (id === B.grass_block) { for (let i = 0; i < 12; i++) { const nx = x + Math.floor(rng() * 5) - 2, nz = z + Math.floor(rng() * 5) - 2; if (world.getBlock(nx, y + 1, nz) === 0 && world.getBlock(nx, y, nz) === B.grass_block) world.setBlock(nx, y + 1, nz, rng() < 0.15 ? B[['dandelion', 'poppy', 'oxeye_daisy', 'cornflower'][Math.floor(rng() * 4)]] : B.short_grass); } return true; }
  if (id === B.short_grass) { world.setBlock(x, y, z, B.tall_grass); world.setBlock(x, y + 1, z, B.tall_grass, 8); return true; }
  if (id === B.sugar_cane || id === B.cactus || id === B.bamboo || id === B.kelp) { d.onRandomTick && d.onRandomTick(world, x, y, z, meta, () => 0); return true; }
  if (d.flower && d.tall) return false;
  if (d.flower) { world.setBlock(x, y + 1, z, id) ; return true; }
  return false;
}

// ---------- placement rules (called by the player when using a block item) ----------
// hit: {x,y,z,face,px,py,pz}; returns list of placements [{x,y,z,id,meta}] or null
export function placementFor(world, item, hit, player) {
  const def = BLOCKS[item.id]; if (!def) return null;
  const face = hit.face; const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][face] || [0, 1, 0];
  let tx = hit.x + n[0], ty = hit.y + n[1], tz = hit.z + n[2];
  const targetId = world.getBlock(hit.x, hit.y, hit.z), targetDef = BLOCKS[targetId];
  const yaw = player.yaw; // facing: 0 +z, 1 -x, 2 -z, 3 +x  (direction player looks)
  const facing = Math.round(((-yaw) / (Math.PI / 2))) & 3;
  const playerFacing = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
  // Facing index from player look direction: dx = -sin(yaw), dz = -cos(yaw)
  const lookX = -Math.sin(yaw), lookZ = -Math.cos(yaw);
  const lookFacing = Math.abs(lookX) > Math.abs(lookZ) ? (lookX > 0 ? 3 : 1) : (lookZ > 0 ? 0 : 2);
  // snow layers & slabs stack in place
  if (def.name === 'snow' && targetId === B.snow && (world.getMeta(hit.x, hit.y, hit.z) & 7) < 7) return [{ x: hit.x, y: hit.y, z: hit.z, id: B.snow, meta: (world.getMeta(hit.x, hit.y, hit.z) & 7) + 1 }];
  if (def.slab && targetId === item.id) { const m = world.getMeta(hit.x, hit.y, hit.z); if (m !== 2 && ((m === 0 && face === 2) || (m === 1 && face === 3))) return [{ x: hit.x, y: hit.y, z: hit.z, id: item.id, meta: 2 }]; }
  // replaceable target (grass, water, snow): place into it
  if (targetDef.replaceable && !(def.name === 'snow' && targetId === B.snow)) { tx = hit.x; ty = hit.y; tz = hit.z; }
  const curId = world.getBlock(tx, ty, tz); const cur = BLOCKS[curId];
  if (curId !== 0 && !cur.replaceable) return null;
  if (ty < 0 || ty >= CY) return null;
  const below = world.getBlock(tx, ty - 1, tz), belowDef = BLOCKS[below];
  let meta = 0;
  if (def.slab) { meta = (face === 3 || (face !== 2 && (hit.py - hit.y) > 0.5)) ? 1 : 0; }
  else if (def.stairs) { meta = lookFacing | ((face === 3 || (face !== 2 && (hit.py - hit.y) > 0.5)) ? 4 : 0); }
  else if (def.axisPlace) { meta = face === 0 || face === 1 ? 1 : face === 4 || face === 5 ? 2 : 0; }
  else if (def.facingPlace) { meta = (lookFacing + 2) & 3; }
  else if (def.torch) {
    if (face === 2 && (belowDef.opaque || belowDef.fence || belowDef.slab || belowDef.stairs)) meta = 0;
    else if (face === 0 && targetDef.opaque) meta = 1; else if (face === 1 && targetDef.opaque) meta = 2; else if (face === 4 && targetDef.opaque) meta = 3; else if (face === 5 && targetDef.opaque) meta = 4;
    else if (belowDef.opaque || belowDef.fence) meta = 0; else return null;
  }
  else if (def.ladder || def.name === 'vine') {
    if (face === 5 && targetDef.opaque) meta = 2; else if (face === 4 && targetDef.opaque) meta = 0; else if (face === 1 && targetDef.opaque) meta = 1; else if (face === 0 && targetDef.opaque) meta = 3;
    else { // try any wall
      const walls = [[0, 0, -1, 0], [1, 0, 0, 1], [0, 0, 1, 2], [-1, 0, 0, 3]]; let found = -1; for (const [dx, , dz, m] of walls) if (BLOCKS[world.getBlock(tx + dx, ty, tz + dz)].opaque) { found = m; break; } if (found < 0) return null; meta = found;
    }
  }
  else if (def.door) {
    if (!BLOCKS[below].solid) return null; if (world.getBlock(tx, ty + 1, tz) !== 0 && !BLOCKS[world.getBlock(tx, ty + 1, tz)].replaceable) return null;
    meta = lookFacing;
    return [{ x: tx, y: ty, z: tz, id: item.id, meta }, { x: tx, y: ty + 1, z: tz, id: item.id, meta: meta | 8 }];
  }
  else if (def.bed) {
    if (!BLOCKS[below].solid) return null;
    const dir = [[0, 1], [-1, 0], [0, -1], [1, 0]][lookFacing]; const hx = tx + dir[0], hz = tz + dir[1];
    const hid = world.getBlock(hx, ty, hz); if (hid !== 0 && !BLOCKS[hid].replaceable) return null; if (!BLOCKS[world.getBlock(hx, ty - 1, hz)].solid) return null;
    return [{ x: tx, y: ty, z: tz, id: item.id, meta: lookFacing }, { x: hx, y: ty, z: hz, id: item.id, meta: lookFacing | 4 }];
  }
  else if (def.crop) { if (!(def.soil ? below === B[def.soil] : below === B.farmland)) return null; }
  else if (def.tall) {
    if (!isSoil(below)) return null; const up = world.getBlock(tx, ty + 1, tz); if (up !== 0 && !BLOCKS[up].replaceable) return null;
    return [{ x: tx, y: ty, z: tz, id: item.id, meta: 0 }, { x: tx, y: ty + 1, z: tz, id: item.id, meta: 8 }];
  }
  else if (def.needsSoil) { if (!isSoil(below)) return null; }
  else if (def.cane) { if (!(below === B.sugar_cane || isSoil(below) || below === B.sand || below === B.red_sand)) return null; }
  else if (def.cactus) { if (!(below === B.cactus || below === B.sand || below === B.red_sand)) return null; }
  else if (def.mushroom) { if (!belowDef.opaque) return null; }
  else if (def.name === 'lily_pad') { if (!(below === B.water || below === B.ice)) return null; }
  else if (def.name === 'snow' || def.name.endsWith('_carpet') || def.name === 'pink_petals') { if (!belowDef.opaque && below !== B.snow_block && !belowDef.slab) return null; }
  else if (def.name === 'kelp' || def.name === 'seagrass') { if (curId !== B.water) return null; }
  else if (def.leaves) meta = 4; // persistent
  else if (def.name === 'dead_bush') { if (!(below === B.sand || below === B.red_sand || below === B.terracotta || isSoil(below))) return null; }
  else if (def.name === 'bamboo') { if (!(below === B.bamboo || isSoil(below) || below === B.sand)) return null; }
  return [{ x: tx, y: ty, z: tz, id: item.id, meta }];
}

// ---------- furnaces (tile entities ticked by the game) ----------
export function furnaceTick(world, te, def, ticks = 1) {
  te.slots = te.slots || [null, null, null]; te.burn = te.burn || 0; te.burnMax = te.burnMax || 0; te.cook = te.cook || 0;
  const [inp, fuel, out] = te.slots;
  const rec = inp ? SMELTING.get(inp.id) : null;
  const allowed = rec && (!def.foodOnly || getItem(rec.id)?.food) && (!def.oreOnly || !getItem(rec.id)?.food);
  const canOut = allowed && (!out || (out.id === rec.id && out.count + rec.count <= 64));
  const speed = def.furnaceSpeed || 1;
  let changed = false;
  for (let i = 0; i < ticks; i++) {
    if (te.burn > 0) te.burn--;
    if (te.burn <= 0 && canOut && fuel && fuelValue(fuel.id) > 0) {
      te.burnMax = te.burn = fuelValue(fuel.id);
      fuel.count--; if (fuel.count <= 0) te.slots[1] = fuel.id === I.lava_bucket ? { id: I.bucket, count: 1 } : null;
      changed = true;
    }
    if (te.burn > 0 && canOut) {
      te.cook += speed;
      if (te.cook >= 200) { te.cook = 0; if (te.slots[2]) te.slots[2].count += rec.count; else te.slots[2] = { id: rec.id, count: rec.count }; inp.count--; if (inp.count <= 0) te.slots[0] = null; te.xp = (te.xp || 0) + rec.xp; changed = true; break; }
    } else if (te.cook > 0) te.cook = Math.max(0, te.cook - 2);
  }
  const lit = te.burn > 0;
  const meta = world.getMeta(te.x, te.y, te.z);
  if (!!(meta & 4) !== lit) world.setMeta(te.x, te.y, te.z, (meta & 3) | (lit ? 4 : 0));
  return changed;
}

// ---------- chest loot ----------
export function fillLoot(te, kind, rng) {
  te.slots = te.slots || new Array(27).fill(null);
  const tables = {
    dungeon: [['bread', 1, 3, 0.6], ['string', 1, 4, 0.5], ['gunpowder', 1, 4, 0.4], ['iron_ingot', 1, 4, 0.5], ['gold_ingot', 1, 3, 0.3], ['bone', 1, 5, 0.6], ['name_tag', 1, 1, 0.2], ['saddle', 1, 1, 0.3], ['golden_apple', 1, 1, 0.15], ['diamond', 1, 2, 0.15], ['redstone', 1, 4, 0.4], ['music_disc', 1, 1, 0.2], ['enchanted_book', 1, 1, 0.2], ['bucket', 1, 1, 0.3], ['iron_horse_armor_placeholder', 0, 0, 0]],
    village: [['bread', 1, 4, 0.7], ['wheat', 1, 6, 0.6], ['apple', 1, 3, 0.5], ['emerald', 1, 3, 0.4], ['iron_ingot', 1, 3, 0.3], ['oak_sapling', 1, 2, 0.3], ['wheat_seeds', 1, 4, 0.4], ['carrot', 1, 4, 0.3], ['potato', 1, 4, 0.3], ['book', 1, 1, 0.3], ['leather_boots', 1, 1, 0.15], ['stone_axe', 1, 1, 0.15], ['gold_nugget', 1, 5, 0.2], ['iron_pickaxe', 1, 1, 0.1]],
    portal: [['obsidian', 1, 2, 0.6], ['flint', 1, 4, 0.5], ['iron_nugget', 4, 12, 0.5], ['flint_and_steel', 1, 1, 0.5], ['fire_charge_placeholder', 0, 0, 0], ['golden_apple', 1, 1, 0.2], ['gold_nugget', 4, 12, 0.5], ['golden_helmet', 1, 1, 0.1], ['golden_sword', 1, 1, 0.1], ['gold_ingot', 2, 6, 0.3], ['golden_carrot', 4, 8, 0.15]],
  };
  const table = tables[kind] || tables.dungeon;
  const n = 3 + Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) {
    const e = table[Math.floor(rng() * table.length)]; if (!e[3] || rng() > e[3]) continue;
    let id; try { id = resolveId(e[0]); } catch { continue; }
    const slot = Math.floor(rng() * 27); if (te.slots[slot]) continue;
    const st = { id, count: e[1] + Math.floor(rng() * (e[2] - e[1] + 1)), dmg: 0 };
    if (id === I.enchanted_book) { st.ench = rollEnchantments({ id: I.book }, 10 + Math.floor(rng() * 20), rng); st.count = 1; }
    te.slots[slot] = st;
  }
}
