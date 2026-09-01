// Terrain generation for the Overworld, Nether and End. Pure & deterministic: (seed, cx, cz) -> blocks.
// Runs inside a Web Worker (see worldgen.worker.js) or inline as a fallback.
import { B, BLOCKS } from './blocks.js';
import { CX, CY, CZ, CHUNK_VOLUME, idx } from './chunk.js';
import { Perlin, mulberry32, hash2, hash3 } from './noise.js';

export const SEA_LEVEL = 62;
export const DIM = { OVERWORLD: 0, NETHER: 1, END: 2 };

// ---------- biomes ----------
export const BIOMES = {
  ocean:          { name: 'Ocean', temp: 0.5, top: B.gravel, filler: B.gravel, water: true, trees: 0, grassColor: [90, 150, 60] },
  deep_ocean:     { name: 'Deep Ocean', temp: 0.5, top: B.gravel, filler: B.gravel, water: true, trees: 0 },
  frozen_ocean:   { name: 'Frozen Ocean', temp: 0.0, top: B.gravel, filler: B.gravel, water: true, trees: 0, snow: true },
  beach:          { name: 'Beach', temp: 0.7, top: B.sand, filler: B.sand, trees: 0 },
  snowy_beach:    { name: 'Snowy Beach', temp: 0.0, top: B.sand, filler: B.sand, trees: 0, snow: true },
  plains:         { name: 'Plains', temp: 0.8, top: B.grass_block, filler: B.dirt, trees: 0.02, grass: 0.3, flowers: 0.05, treeTypes: ['oak'], village: true },
  sunflower_plains: { name: 'Sunflower Plains', temp: 0.8, top: B.grass_block, filler: B.dirt, trees: 0.02, grass: 0.3, flowers: 0.08, treeTypes: ['oak'], sunflowers: true },
  forest:         { name: 'Forest', temp: 0.7, top: B.grass_block, filler: B.dirt, trees: 0.5, grass: 0.25, flowers: 0.03, treeTypes: ['oak', 'oak', 'birch'] },
  birch_forest:   { name: 'Birch Forest', temp: 0.6, top: B.grass_block, filler: B.dirt, trees: 0.5, grass: 0.2, flowers: 0.03, treeTypes: ['birch'] },
  dark_forest:    { name: 'Dark Forest', temp: 0.7, top: B.grass_block, filler: B.dirt, trees: 0.9, grass: 0.15, mushrooms: 0.02, treeTypes: ['dark_oak', 'dark_oak', 'oak'] },
  taiga:          { name: 'Taiga', temp: 0.25, top: B.grass_block, filler: B.dirt, trees: 0.55, grass: 0.2, ferns: true, treeTypes: ['spruce'], village: true, podzol: 0.1 },
  snowy_taiga:    { name: 'Snowy Taiga', temp: -0.5, top: B.grass_block, filler: B.dirt, trees: 0.45, grass: 0.1, ferns: true, treeTypes: ['spruce'], snow: true },
  snowy_plains:   { name: 'Snowy Plains', temp: 0.0, top: B.grass_block, filler: B.dirt, trees: 0.005, grass: 0.05, treeTypes: ['spruce'], snow: true, village: true },
  ice_spikes:     { name: 'Ice Spikes', temp: 0.0, top: B.snow_block, filler: B.dirt, trees: 0, snow: true, spikes: true },
  desert:         { name: 'Desert', temp: 2.0, top: B.sand, filler: B.sand, stone: B.sandstone, trees: 0, cactus: 0.02, deadBush: 0.02, village: true, dry: true },
  savanna:        { name: 'Savanna', temp: 1.2, top: B.grass_block, filler: B.dirt, trees: 0.06, grass: 0.4, treeTypes: ['acacia'], village: true, dry: true, grassColor: [150, 160, 60] },
  jungle:         { name: 'Jungle', temp: 0.95, top: B.grass_block, filler: B.dirt, trees: 0.8, grass: 0.4, ferns: true, treeTypes: ['jungle', 'jungle', 'oak'], melons: 0.01, bamboo: 0.05, grassColor: [60, 170, 40] },
  swamp:          { name: 'Swamp', temp: 0.8, top: B.grass_block, filler: B.dirt, trees: 0.2, grass: 0.4, treeTypes: ['oak'], swamp: true, mushrooms: 0.03, grassColor: [90, 120, 60] },
  mountains:      { name: 'Stony Peaks', temp: 0.2, top: B.stone, filler: B.stone, trees: 0.02, grass: 0.05, treeTypes: ['spruce'], mountain: true },
  snowy_mountains: { name: 'Snowy Peaks', temp: -0.7, top: B.snow_block, filler: B.stone, trees: 0.0, snow: true, mountain: true },
  windswept_hills: { name: 'Windswept Hills', temp: 0.3, top: B.grass_block, filler: B.dirt, trees: 0.08, grass: 0.15, treeTypes: ['spruce', 'oak'], mountain: true },
  cherry_grove:   { name: 'Cherry Grove', temp: 0.5, top: B.grass_block, filler: B.dirt, trees: 0.12, grass: 0.3, flowers: 0.1, treeTypes: ['cherry'], petals: true },
  badlands:       { name: 'Badlands', temp: 2.0, top: B.red_sand, filler: B.terracotta, stone: B.terracotta, trees: 0, deadBush: 0.03, dry: true, badlands: true },
  mushroom_fields: { name: 'Mushroom Fields', temp: 0.9, top: B.mycelium, filler: B.dirt, trees: 0, mushrooms: 0.15, bigMushrooms: true, peaceful: true },
  flower_forest:  { name: 'Flower Forest', temp: 0.7, top: B.grass_block, filler: B.dirt, trees: 0.25, grass: 0.2, flowers: 0.4, treeTypes: ['oak', 'birch'] },
  stony_shore:    { name: 'Stony Shore', temp: 0.3, top: B.stone, filler: B.stone, trees: 0 },
  nether_wastes:  { name: 'Nether Wastes', temp: 2, nether: true },
  crimson_forest: { name: 'Crimson Forest', temp: 2, nether: true },
  warped_forest:  { name: 'Warped Forest', temp: 2, nether: true },
  soul_sand_valley: { name: 'Soul Sand Valley', temp: 2, nether: true },
  basalt_deltas:  { name: 'Basalt Deltas', temp: 2, nether: true },
  the_end:        { name: 'The End', temp: 0.5, end: true },
};
for (const [k, v] of Object.entries(BIOMES)) v.id = k;

const FLOWERS = ['dandelion', 'poppy', 'blue_orchid', 'allium', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'tulip_red', 'tulip_orange', 'tulip_white', 'tulip_pink'];

const generators = new Map();
export function getGenerator(seed, dim = 0, worldType = 'default') {
  const key = seed + '|' + dim + '|' + worldType;
  let g = generators.get(key);
  if (!g) { g = new Generator(seed, dim, worldType); generators.set(key, g); }
  return g;
}

export class Generator {
  constructor(seed, dim, worldType) {
    this.seed = seed >>> 0; this.dim = dim; this.worldType = worldType;
    const s = this.seed;
    this.continent = new Perlin(s + 1); this.erosion = new Perlin(s + 2); this.ridge = new Perlin(s + 3); this.detail = new Perlin(s + 4);
    this.temp = new Perlin(s + 5); this.humid = new Perlin(s + 6); this.weird = new Perlin(s + 7);
    this.cave1 = new Perlin(s + 8); this.cave2 = new Perlin(s + 9); this.cheese = new Perlin(s + 10); this.river = new Perlin(s + 11);
    this.biomeScale = worldType === 'large_biomes' ? 4 : 1;
    this.amp = worldType === 'amplified' ? 1.9 : 1;
    this.heightCache = new Map();
  }

  // ---------- Overworld climate & height ----------
  climate(x, z) {
    const s = 1 / (900 * this.biomeScale);
    const t = this.temp.fbm2(x * s, z * s, 3) * 5.0;
    const h = this.humid.fbm2(x * s * 1.3 + 100, z * s * 1.3, 3) * 5.0;
    const w = this.weird.fbm2(x * s * 2 + 300, z * s * 2 + 300, 2) * 3.0;
    return { t, h, w };
  }
  continentalness(x, z) { const s = 1 / 1400; return this.continent.fbm2(x * s, z * s, 4) * 3.2 + 0.1; } // -1 ocean .. 1 inland
  erosionAt(x, z) { const s = 1 / 700; return this.erosion.fbm2(x * s + 50, z * s + 50, 3) * 3.5; }

  heightAt(x, z) {
    const key = x + ',' + z; const c = this.heightCache.get(key); if (c !== undefined) return c;
    let h;
    if (this.worldType === 'superflat') h = 4;
    else {
      const cont = this.continentalness(x, z);
      const ero = this.erosionAt(x, z);
      const ridge = this.ridge.ridged2(x / 320, z / 320, 4);
      const detail = this.detail.fbm2(x / 60, z / 60, 4) * 2;
      // base terrain from continentalness
      let base;
      if (cont < -0.45) base = 30 + (cont + 1) * 30;               // deep ocean floor
      else if (cont < -0.12) base = 46 + (cont + 0.45) * 40;        // ocean shelf -> beach
      else if (cont < 0.0) base = SEA_LEVEL + 1 + (cont + 0.12) * 20;
      else base = 65 + cont * 14;
      // mountains where erosion is low and inland
      const mtMask = Math.max(0, Math.min(1, (cont - 0.15) * 3)) * Math.max(0, Math.min(1, (-ero + 0.2) * 1.6));
      const mountains = ridge * ridge * 60 * mtMask;
      const hills = detail * (5 + 12 * Math.max(0, 0.5 - ero)) * Math.max(0, Math.min(1, (cont + 0.1) * 4));
      h = base + mountains + hills;
      if (this.amp > 1 && h > SEA_LEVEL) h = SEA_LEVEL + (h - SEA_LEVEL) * this.amp;
      // rivers
      const rv = Math.abs(this.river.noise2(x / 420 + 7, z / 420 + 7));
      if (cont > -0.1 && rv < 0.035 && h > SEA_LEVEL - 4) { const k = 1 - rv / 0.035; h = Math.min(h, h - k * (h - (SEA_LEVEL - 3)) ); }
      h = Math.max(8, Math.min(CY - 6, h));
    }
    const r = Math.floor(h);
    if (this.heightCache.size > 20000) this.heightCache.clear();
    this.heightCache.set(key, r);
    return r;
  }

  biomeAt(x, z) {
    if (this.dim === DIM.NETHER) return this.netherBiome(x, z);
    if (this.dim === DIM.END) return BIOMES.the_end;
    if (this.worldType === 'superflat') return BIOMES.plains;
    const h = this.heightAt(x, z);
    const cont = this.continentalness(x, z);
    const { t, h: hum, w } = this.climate(x, z);
    if (h < SEA_LEVEL - 1) {
      if (t < -0.6) return BIOMES.frozen_ocean;
      return h < 40 ? BIOMES.deep_ocean : BIOMES.ocean;
    }
    if (h <= SEA_LEVEL + 2 && cont < 0.05) {
      if (t < -0.4) return BIOMES.snowy_beach;
      return (this.erosionAt(x, z) < -0.5) ? BIOMES.stony_shore : BIOMES.beach;
    }
    if (h > 96) return t < -0.2 || h > 108 ? BIOMES.snowy_mountains : BIOMES.mountains;
    if (h > 84 && w > 0) return BIOMES.windswept_hills;
    if (t < -0.9) return w > 0.8 ? BIOMES.ice_spikes : (hum > 0.0 ? BIOMES.snowy_taiga : BIOMES.snowy_plains);
    if (t < -0.4) return hum > -0.4 ? BIOMES.taiga : BIOMES.snowy_plains;
    if (t > 0.95) return hum > 0.35 ? BIOMES.savanna : (w > 0.5 ? BIOMES.badlands : BIOMES.desert);
    if (t > 0.5) { if (hum > 0.5) return BIOMES.jungle; if (hum < -0.3) return BIOMES.savanna; }
    if (hum > 0.5 && t > 0 && h < SEA_LEVEL + 5) return BIOMES.swamp;
    if (w > 0.85 && hum > 0.3) return BIOMES.mushroom_fields;
    if (hum > 0.45) return w < -0.3 ? BIOMES.dark_forest : BIOMES.forest;
    if (hum > 0.0) return w > 0.4 ? BIOMES.birch_forest : (w < -0.5 ? BIOMES.flower_forest : BIOMES.forest);
    if (w > 0.6 && t > 0.1 && t < 0.8) return BIOMES.cherry_grove;
    if (w < -0.6) return BIOMES.sunflower_plains;
    return BIOMES.plains;
  }

  netherBiome(x, z) {
    const s = 1 / 260;
    const a = this.temp.fbm2(x * s, z * s, 2), b = this.humid.fbm2(x * s + 40, z * s + 40, 2);
    if (a > 0.28) return BIOMES.crimson_forest;
    if (a < -0.28) return BIOMES.warped_forest;
    if (b > 0.3) return BIOMES.soul_sand_valley;
    if (b < -0.32) return BIOMES.basalt_deltas;
    return BIOMES.nether_wastes;
  }

  // ---------- chunk generation ----------
  generate(cx, cz) {
    const blocks = new Uint16Array(CHUNK_VOLUME), meta = new Uint8Array(CHUNK_VOLUME);
    if (this.dim === DIM.NETHER) this.generateNether(cx, cz, blocks, meta);
    else if (this.dim === DIM.END) this.generateEnd(cx, cz, blocks, meta);
    else this.generateOverworld(cx, cz, blocks, meta);
    return { blocks, meta };
  }

  generateOverworld(cx, cz, blocks, meta) {
    const bx = cx * CX, bz = cz * CZ;
    const rng = mulberry32(hash2(cx, cz, this.seed) * 4294967296);
    const heights = new Int16Array(CX * CZ), biomes = new Array(CX * CZ);
    const superflat = this.worldType === 'superflat';
    for (let x = 0; x < CX; x++) for (let z = 0; z < CZ; z++) {
      const wx = bx + x, wz = bz + z;
      const h = this.heightAt(wx, wz); heights[x * CZ + z] = h;
      const biome = this.biomeAt(wx, wz); biomes[x * CZ + z] = biome;
      const base = (x * CZ + z) * CY;
      if (superflat) { blocks[base] = B.bedrock; blocks[base + 1] = B.dirt; blocks[base + 2] = B.dirt; blocks[base + 3] = B.dirt; blocks[base + 4] = B.grass_block; continue; }
      const stone = biome.stone || B.stone;
      const underwater = h < SEA_LEVEL;
      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0 || (y < 4 && hash3(wx, y, wz, this.seed) < 0.4 - y * 0.1)) id = B.bedrock;
        else if (y < 12 || (y < 16 && hash3(wx, y, wz, this.seed + 3) < (16 - y) / 5)) id = B.deepslate;
        else if (y >= h - 3 && y < h) id = underwater && h < SEA_LEVEL - 2 ? (hash3(wx, y, wz, this.seed + 1) < 0.5 ? B.gravel : B.sand) : (biome.mountain && y > 90 ? stone : biome.filler);
        else if (y === h) {
          if (underwater) id = h < SEA_LEVEL - 6 ? B.gravel : B.sand;
          else if (biome.podzol && hash2(wx, wz, this.seed + 8) < biome.podzol) id = B.podzol;
          else id = (biome.mountain && y > 90) ? (y > 104 && biome.snow ? B.snow_block : B.stone) : biome.top;
          if (biome.badlands && y > 66) id = ((y % 7 === 0) ? B.orange_terracotta : (y % 5 === 0) ? B.red_terracotta : (y % 3 === 0) ? B.yellow_terracotta : B.terracotta);
        } else {
          id = stone;
          if (biome.badlands && y > 60) id = (y % 7 === 0) ? B.orange_terracotta : (y % 5 === 0) ? B.red_terracotta : (y % 3 === 0) ? B.yellow_terracotta : B.terracotta;
          else if (y > 16) { // stone variants
            const v = this.detail.noise3(wx / 40, y / 40, wz / 40);
            if (v > 0.32) id = B.granite; else if (v < -0.34) id = B.diorite; else if (Math.abs(v) < 0.03 && y < 70) id = B.andesite;
            if (y > 40 && this.cheese.noise3(wx / 50 + 9, y / 50, wz / 50) > 0.4) id = B.tuff;
          }
        }
        blocks[base + y] = id;
      }
      // water
      if (h < SEA_LEVEL) for (let y = h + 1; y <= SEA_LEVEL; y++) blocks[base + y] = B.water;
      if (biome.snow && h < SEA_LEVEL) blocks[base + SEA_LEVEL] = B.ice;
      // snow layer
      if (biome.snow && h >= SEA_LEVEL && blocks[base + h] !== B.ice) { blocks[base + h + 1] = B.snow; }
    }
    if (superflat) return;
    this.carveCaves(cx, cz, blocks, heights);
    this.placeOres(cx, cz, blocks, rng);
    this.decorate(cx, cz, blocks, meta, heights, biomes);
    this.structures(cx, cz, blocks, meta, heights, biomes, rng);
  }

  carveCaves(cx, cz, blocks, heights) {
    const bx = cx * CX, bz = cz * CZ;
    for (let x = 0; x < CX; x++) for (let z = 0; z < CZ; z++) {
      const wx = bx + x, wz = bz + z, h = heights[x * CZ + z];
      const base = (x * CZ + z) * CY;
      for (let y = 4; y < h - 2; y++) {
        const id = blocks[base + y]; if (id === B.bedrock || id === B.water) continue;
        // spaghetti caves: two noise fields near zero
        const n1 = this.cave1.noise3(wx / 38, y / 20, wz / 38), n2 = this.cave2.noise3(wx / 38 + 50, y / 20 + 50, wz / 38 + 50);
        const spaghetti = (n1 * n1 + n2 * n2) < 0.012 * (1 + (y < 40 ? 0.6 : 0));
        // cheese caves: big caverns deeper down
        const cheese = y < 52 && this.cheese.fbm3(wx / 70, y / 45, wz / 70, 2) > 0.42 - (y < 30 ? 0.06 : 0);
        if (spaghetti || cheese) {
          // don't open caves directly beneath water bodies
          if (h < SEA_LEVEL && y > h - 6) continue;
          blocks[base + y] = y <= 10 ? B.lava : 0;
        }
      }
      // Air pocket sanity: if grass was undercut keep top solid handled by lighting anyway
    }
  }

  placeOres(cx, cz, blocks, rng) {
    const veins = [
      [B.coal_ore, 18, 5, 110, 10], [B.iron_ore, 14, 5, 70, 7], [B.copper_ore, 8, 40, 90, 8], [B.gold_ore, 3, 5, 32, 6],
      [B.redstone_ore, 6, 4, 16, 6], [B.lapis_ore, 2, 8, 30, 5], [B.diamond_ore, 2, 3, 15, 5], [B.emerald_ore, 1, 40, 100, 2],
      [B.gravel, 5, 20, 100, 16], [B.dirt, 6, 20, 100, 16], [B.andesite, 4, 20, 100, 16], [B.clay, 2, 55, 64, 12],
    ];
    for (const [ore, count, ymin, ymax, size] of veins) {
      for (let i = 0; i < count; i++) {
        const ox = Math.floor(rng() * CX), oz = Math.floor(rng() * CZ), oy = ymin + Math.floor(rng() * (ymax - ymin));
        for (let j = 0; j < size; j++) {
          const x = ox + Math.floor(rng() * 3) - 1, y = oy + Math.floor(rng() * 3) - 1, z = oz + Math.floor(rng() * 3) - 1;
          if (x < 0 || x >= CX || z < 0 || z >= CZ || y < 1 || y >= CY) continue;
          const i2 = (x * CZ + z) * CY + y; const cur = blocks[i2];
          if (cur === B.stone || cur === B.granite || cur === B.diorite || cur === B.andesite || cur === B.tuff) blocks[i2] = ore;
          else if (cur === B.deepslate) blocks[i2] = deepslateOre(ore);
          if (ore === B.clay && cur === B.sand) blocks[i2] = ore;
        }
      }
    }
  }

  // Deterministic feature placement: features originate in a chunk but may write into neighbours.
  decorate(cx, cz, blocks, meta, heights, biomes) {
    const bx = cx * CX, bz = cz * CZ;
    const setLocal = (wx, wy, wz, id, m = 0, force = false) => {
      const x = wx - bx, z = wz - bz; if (x < 0 || x >= CX || z < 0 || z >= CZ || wy < 0 || wy >= CY) return;
      const i = (x * CZ + z) * CY + wy; if (!force && blocks[i] !== 0 && !(blocks[i] === B.snow) && !(BLOCKS[blocks[i]].leaves) ) return; blocks[i] = id; meta[i] = m;
    };
    const getLocal = (wx, wy, wz) => { const x = wx - bx, z = wz - bz; if (x < 0 || x >= CX || z < 0 || z >= CZ || wy < 0 || wy >= CY) return -1; return blocks[(x * CZ + z) * CY + wy]; };
    for (let ncx = cx - 1; ncx <= cx + 1; ncx++) for (let ncz = cz - 1; ncz <= cz + 1; ncz++) {
      const rng = mulberry32(hash2(ncx, ncz, this.seed + 77) * 4294967296);
      const nbx = ncx * CX, nbz = ncz * CZ;
      // trees
      const centerBiome = this.biomeAt(nbx + 8, nbz + 8);
      const treeAttempts = Math.round((centerBiome.trees || 0) * 16 + (rng() < (centerBiome.trees || 0) * 3 ? 1 : 0));
      for (let i = 0; i < treeAttempts; i++) {
        const tx = nbx + Math.floor(rng() * CX), tz = nbz + Math.floor(rng() * CZ);
        const biome = this.biomeAt(tx, tz); if (!biome.treeTypes) continue;
        const h = this.heightAt(tx, tz); if (h < SEA_LEVEL || (biome.swamp && h < SEA_LEVEL + 1)) continue;
        const type = biome.treeTypes[Math.floor(rng() * biome.treeTypes.length)];
        const big = rng() < 0.12;
        this.placeTree(type, tx, h + 1, tz, rng, setLocal, big, biome);
      }
      // ground cover per column of neighbour chunk that falls into ours is handled directly below
    }
    // Local ground cover (single-block features never cross chunks)
    const rng = mulberry32(hash2(cx, cz, this.seed + 91) * 4294967296);
    for (let x = 0; x < CX; x++) for (let z = 0; z < CZ; z++) {
      const biome = biomes[x * CZ + z], h = heights[x * CZ + z], base = (x * CZ + z) * CY;
      const wx = bx + x, wz = bz + z;
      const top = blocks[base + h];
      const above = blocks[base + h + 1];
      if (h < SEA_LEVEL) {
        if (rng() < 0.08 && top === B.sand && h > 40) { blocks[base + h + 1] = B.seagrass; }
        else if (rng() < 0.05 && h > 30 && h < SEA_LEVEL - 4) { const len = 2 + Math.floor(rng() * (SEA_LEVEL - h - 2)); for (let k = 1; k <= len && h + k < SEA_LEVEL; k++) blocks[base + h + k] = B.kelp; }
        continue;
      }
      if (above !== 0 && above !== B.snow) continue;
      const r = rng();
      const isGrass = top === B.grass_block;
      if (isGrass && r < (biome.grass || 0)) { blocks[base + h + 1] = (biome.ferns && rng() < 0.4) ? B.fern : B.short_grass; if (rng() < 0.08) { blocks[base + h + 1] = B.tall_grass; blocks[base + h + 2] = B.tall_grass; meta[base + h + 2] = 8; } }
      else if (isGrass && r < (biome.grass || 0) + (biome.flowers || 0)) {
        if (biome.sunflowers && rng() < 0.5) { blocks[base + h + 1] = B.sunflower; blocks[base + h + 2] = B.sunflower; meta[base + h + 2] = 8; }
        else if (biome.flowers > 0.2 && rng() < 0.15) { const t = [B.rose_bush, B.lilac][Math.floor(rng() * 2)]; blocks[base + h + 1] = t; blocks[base + h + 2] = t; meta[base + h + 2] = 8; }
        else blocks[base + h + 1] = B[FLOWERS[Math.floor(hash2(wx >> 3, wz >> 3, this.seed) * FLOWERS.length + rng() * 2) % FLOWERS.length]];
      }
      else if ((isGrass || top === B.mycelium || top === B.podzol) && r < (biome.grass || 0) + (biome.flowers || 0) + (biome.mushrooms || 0)) blocks[base + h + 1] = rng() < 0.5 ? B.brown_mushroom : B.red_mushroom;
      else if (top === B.sand && biome.cactus && r < 0.3 && rng() < biome.cactus * 3) { const n = 1 + Math.floor(rng() * 3); for (let k = 1; k <= n; k++) blocks[base + h + k] = B.cactus; }
      else if ((top === B.sand || top === B.red_sand || top === B.terracotta) && biome.deadBush && rng() < biome.deadBush * 2) blocks[base + h + 1] = B.dead_bush;
      else if (biome.melons && rng() < biome.melons) blocks[base + h + 1] = B.melon;
      else if (biome.bamboo && isGrass && rng() < biome.bamboo) { const n = 4 + Math.floor(rng() * 8); for (let k = 1; k <= n && h + k < CY; k++) blocks[base + h + k] = B.bamboo; }
      else if (biome.petals && isGrass && rng() < 0.2) blocks[base + h + 1] = B.pink_petals;
      else if (biome.id === 'plains' && rng() < 0.002) blocks[base + h + 1] = B.pumpkin;
      // sugar cane next to water
      if ((top === B.sand || isGrass) && h === SEA_LEVEL && rng() < 0.12) {
        const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.heightAt(wx + dx, wz + dz) < SEA_LEVEL);
        if (nearWater) { const n = 1 + Math.floor(rng() * 3); for (let k = 1; k <= n; k++) blocks[base + h + k] = B.sugar_cane; }
      }
      // swamp lily pads & ice spikes
      if (biome.swamp && h < SEA_LEVEL && rng() < 0.15 && blocks[base + SEA_LEVEL] === B.water) blocks[base + SEA_LEVEL + 1] = B.lily_pad;
      if (biome.spikes && rng() < 0.02) { const n = 6 + Math.floor(rng() * 10); for (let k = 1; k <= n; k++) blocks[base + h + k] = B.packed_ice; }
      // big mushrooms
      if (biome.bigMushrooms && rng() < 0.01) this.placeBigMushroom(wx, h + 1, wz, rng, (a, b2, c, id, m) => { const lx = a - bx, lz = c - bz; if (lx >= 0 && lx < CX && lz >= 0 && lz < CZ && b2 < CY) { blocks[(lx * CZ + lz) * CY + b2] = id; } });
    }
  }

  placeTree(type, x, y, z, rng, set, big, biome) {
    const log = B[`${type}_log`], leaf = B[`${type}_leaves`];
    if (type === 'oak' || type === 'birch' || type === 'cherry') {
      const h = (type === 'birch' ? 5 : 4) + Math.floor(rng() * 3) + (big ? 3 : 0);
      for (let i = 0; i < h; i++) set(x, y + i, z, log, 0, true);
      const r = type === 'cherry' ? 3 : 2;
      for (let dy = -2; dy <= 1; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const d = Math.abs(dx) + Math.abs(dz);
        if (dy >= 0 && d > r - dy) continue; if (dy < 0 && d > r + (dy === -1 ? 0 : -1) + 1 && rng() < 0.6) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
        if (dx === 0 && dz === 0 && dy < 1) continue;
        set(x + dx, y + h - 1 + dy, z + dz, leaf);
      }
      set(x, y + h, z, leaf);
      if (type === 'cherry') { for (let i = 0; i < 3; i++) set(x + Math.floor(rng() * 5) - 2, y + h - 3, z + Math.floor(rng() * 5) - 2, leaf); }
    } else if (type === 'spruce') {
      const h = 7 + Math.floor(rng() * 4) + (big ? 4 : 0);
      for (let i = 0; i < h; i++) set(x, y + i, z, log, 0, true);
      let r = 1;
      for (let dy = h; dy >= 2; dy--) {
        const rr = dy === h ? 0 : (dy === h - 1 ? 1 : r);
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) { if (Math.abs(dx) === rr && Math.abs(dz) === rr && rr > 1) continue; if (dx === 0 && dz === 0 && dy < h) continue; set(x + dx, y + dy, z + dz, leaf); }
        if (dy < h - 1) r = (r === 1 ? 2 : (r === 2 ? (rng() < 0.5 ? 3 : 1) : 1));
      }
    } else if (type === 'jungle') {
      const h = big ? 14 + Math.floor(rng() * 6) : 6 + Math.floor(rng() * 4);
      const w = big ? 2 : 1;
      for (let i = 0; i < h; i++) for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < w; dz++) set(x + dx, y + i, z + dz, log, 0, true);
      const r = big ? 4 : 3;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -r; dx <= r + w - 1; dx++) for (let dz = -r; dz <= r + w - 1; dz++) {
        const d = Math.hypot(dx - (w - 1) / 2, dz - (w - 1) / 2); if (d > r - dy * 0.8) continue; set(x + dx, y + h - 1 + dy, z + dz, leaf);
      }
      if (rng() < 0.7) for (let i = 2; i < h - 2; i++) if (rng() < 0.3) set(x - 1, y + i, z, B.vine, 3);
    } else if (type === 'acacia') {
      const h = 5 + Math.floor(rng() * 2);
      const lean = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)];
      let lx = x, lz = z;
      for (let i = 0; i < h; i++) { if (i >= 3) { lx += lean[0]; lz += lean[1]; } set(lx, y + i, lz, log, 0, true); }
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { const d = Math.abs(dx) + Math.abs(dz); if (d > 4) continue; set(lx + dx, y + h - 1, lz + dz, leaf); if (d <= 2) set(lx + dx, y + h, lz + dz, leaf); }
    } else if (type === 'dark_oak') {
      const h = 6 + Math.floor(rng() * 3);
      for (let i = 0; i < h; i++) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) set(x + dx, y + i, z + dz, log, 0, true);
      for (let dy = -2; dy <= 1; dy++) for (let dx = -3; dx <= 4; dx++) for (let dz = -3; dz <= 4; dz++) {
        const d = Math.max(Math.abs(dx - 0.5), Math.abs(dz - 0.5)); if (d > 3.5 - Math.max(0, dy) * 1.5) continue; if (dy === -2 && d > 2.5) continue;
        set(x + dx, y + h - 1 + dy, z + dz, leaf);
      }
    }
  }

  placeBigMushroom(x, y, z, rng, set) {
    const red = rng() < 0.5; const h = 4 + Math.floor(rng() * 3);
    const stem = B.mushroom_stem_placeholder || B.bone_block, cap = red ? B.red_wool : B.brown_wool;
    for (let i = 0; i < h; i++) set(x, y + i, z, B.stripped_oak_log, 0);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; set(x + dx, y + h, z + dz, red ? B.red_terracotta : B.brown_wool, 0); if (red && (Math.abs(dx) === 2 || Math.abs(dz) === 2)) set(x + dx, y + h - 1, z + dz, B.red_terracotta, 0); }
  }

  // ---------- structures ----------
  structures(cx, cz, blocks, meta, heights, biomes, rng) {
    const bx = cx * CX, bz = cz * CZ;
    const setW = (wx, wy, wz, id, m = 0) => { const x = wx - bx, z = wz - bz; if (x < 0 || x >= CX || z < 0 || z >= CZ || wy < 0 || wy >= CY) return; const i = (x * CZ + z) * CY + wy; blocks[i] = id; meta[i] = m; };
    const getW = (wx, wy, wz) => { const x = wx - bx, z = wz - bz; if (x < 0 || x >= CX || z < 0 || z >= CZ || wy < 0 || wy >= CY) return 0; return blocks[(x * CZ + z) * CY + wy]; };

    // Dungeons (fully local)
    if (rng() < 0.05) {
      const ox = 2 + Math.floor(rng() * 8), oz = 2 + Math.floor(rng() * 8), oy = 8 + Math.floor(rng() * 35);
      const w = 5 + Math.floor(rng() * 3), d = 5 + Math.floor(rng() * 3);
      let ok = true;
      for (let x = ox - 1; x <= ox + w && ok; x++) for (let z = oz - 1; z <= oz + d && ok; z++) if (x >= CX || z >= CZ) ok = false; else { const b = blocks[(x * CZ + z) * CY + oy]; if (b === 0 || b === B.water) ok = false; }
      if (ok) {
        for (let x = ox - 1; x <= ox + w; x++) for (let z = oz - 1; z <= oz + d; z++) for (let y = oy - 1; y <= oy + 4; y++) {
          const wall = x === ox - 1 || x === ox + w || z === oz - 1 || z === oz + d || y === oy - 1 || y === oy + 4;
          setW(bx + x, y, bz + z, wall ? (rng() < 0.3 ? B.mossy_cobblestone : B.cobblestone) : 0);
        }
        setW(bx + ox + (w >> 1), oy, bz + oz + (d >> 1), B.spawner);
        setW(bx + ox, oy, bz + oz, B.chest, 0); meta[((ox) * CZ + oz) * CY + oy] = 0;
        this.markLoot(cx, cz, ox, oy, oz, 'dungeon');
        if (rng() < 0.5) { setW(bx + ox + w - 1, oy, bz + oz + d - 1, B.chest); this.markLoot(cx, cz, ox + w - 1, oy, oz + d - 1, 'dungeon'); }
      }
    }
    // Desert wells / ruined portals (local)
    const cb = biomes[8 * CZ + 8], ch = heights[8 * CZ + 8];
    if (cb.id === 'desert' && rng() < 0.03 && ch > SEA_LEVEL) {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { setW(bx + 8 + dx, ch, bz + 8 + dz, B.sandstone); if (Math.abs(dx) === 1 && Math.abs(dz) === 1) { setW(bx + 8 + dx, ch + 1, bz + 8 + dz, B.sandstone); setW(bx + 8 + dx, ch + 2, bz + 8 + dz, B.sandstone); } if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) setW(bx + 8 + dx, ch + 3, bz + 8 + dz, B.sandstone_slab); }
      setW(bx + 8, ch, bz + 8, B.water); setW(bx + 8, ch - 1, bz + 8, B.sandstone);
    } else if (rng() < 0.012 && ch > SEA_LEVEL && !cb.water) {
      // ruined portal
      for (let i = 0; i < 4; i++) { setW(bx + 6 + i, ch + 1, bz + 8, B.obsidian); if (rng() < 0.7) setW(bx + 6 + i, ch + 5, bz + 8, B.obsidian); }
      for (let i = 1; i < 5; i++) { setW(bx + 6, ch + i, bz + 8, B.obsidian); if (rng() < 0.75) setW(bx + 9, ch + i, bz + 8, B.obsidian); }
      setW(bx + 9, ch + 4, bz + 8, B.crying_obsidian);
      setW(bx + 7, ch + 1, bz + 6, B.chest); this.markLoot(cx, cz, 7, ch + 1, 6, 'portal');
      setW(bx + 5, ch, bz + 7, B.lava); setW(bx + 10, ch + 1, bz + 9, B.netherrack); setW(bx + 10, ch + 2, bz + 9, B.fire);
    }
    // Villages (multi-chunk, deterministic by region)
    const REG = 20;
    const rcx = Math.floor(cx / REG), rcz = Math.floor(cz / REG);
    for (let rx = rcx - 1; rx <= rcx + 1; rx++) for (let rz = rcz - 1; rz <= rcz + 1; rz++) {
      const vr = mulberry32(hash2(rx, rz, this.seed + 555) * 4294967296);
      if (vr() > 0.7) continue;
      const vcx = rx * REG + 2 + Math.floor(vr() * (REG - 4)), vcz = rz * REG + 2 + Math.floor(vr() * (REG - 4));
      if (Math.abs(vcx - cx) > 4 || Math.abs(vcz - cz) > 4) continue;
      const vx = vcx * CX + 8, vz = vcz * CZ + 8;
      const vb = this.biomeAt(vx, vz); if (!vb.village) continue;
      const vh = this.heightAt(vx, vz); if (vh < SEA_LEVEL + 1) continue;
      const style = vb.id === 'desert' ? 'desert' : vb.id === 'savanna' ? 'savanna' : vb.id === 'taiga' || vb.id === 'snowy_plains' ? 'taiga' : 'plains';
      this.placeVillage(vx, vz, vr, style, setW, getW, cx, cz);
    }
  }

  placeVillage(vx, vz, vr, style, setW, getW, cx, cz) {
    const bx = cx * CX, bz = cz * CZ;
    const wall = style === 'desert' ? B.sandstone : style === 'savanna' ? B.acacia_planks : style === 'taiga' ? B.spruce_planks : B.oak_planks;
    const post = style === 'desert' ? B.sandstone : style === 'savanna' ? B.acacia_log : style === 'taiga' ? B.spruce_log : B.oak_log;
    const roof = style === 'desert' ? B.sandstone_slab : style === 'savanna' ? B.acacia_stairs : style === 'taiga' ? B.spruce_stairs : B.oak_stairs;
    const roofFlat = style === 'desert' ? B.sandstone : style === 'savanna' ? B.acacia_planks : style === 'taiga' ? B.spruce_planks : B.oak_planks;
    const path = style === 'desert' ? B.smooth_sandstone : B.dirt_path;
    const door = style === 'desert' ? 0 : style === 'savanna' ? B.acacia_door : style === 'taiga' ? B.spruce_door : B.oak_door;
    // well at center
    const wh = this.heightAt(vx, vz);
    const inChunk = (x, z) => x >= bx - 12 && x < bx + CX + 12 && z >= bz - 12 && z < bz + CZ + 12;
    if (inChunk(vx, vz)) {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        for (let y = wh - 8; y <= wh; y++) setW(vx + dx, y, vz + dz, (Math.abs(dx) === 2 || Math.abs(dz) === 2) ? B.cobblestone : (y < wh ? B.water : B.water));
        setW(vx + dx, wh + 1, vz + dz, (Math.abs(dx) === 2 || Math.abs(dz) === 2) ? B.cobblestone : 0);
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) { setW(vx + dx, wh + 2, vz + dz, B.cobblestone_wall); setW(vx + dx, wh + 3, vz + dz, B.cobblestone_wall); }
        if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) setW(vx + dx, wh + 4, vz + dz, B.cobblestone_slab);
      }
      // lower the ground around well to path
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) if (Math.abs(dx) > 2 || Math.abs(dz) > 2) { const h = this.heightAt(vx + dx, vz + dz); if (getW(vx + dx, h, vz + dz) === B.grass_block) setW(vx + dx, h, vz + dz, path); }
    }
    const count = 5 + Math.floor(vr() * 6);
    for (let i = 0; i < count; i++) {
      const ang = vr() * Math.PI * 2, dist = 9 + vr() * 30;
      const hx = Math.floor(vx + Math.cos(ang) * dist), hz = Math.floor(vz + Math.sin(ang) * dist);
      const w = 5 + Math.floor(vr() * 3), d = 5 + Math.floor(vr() * 3), hh = 3 + Math.floor(vr() * 2);
      const facing = Math.floor(vr() * 4);
      const kind = vr();
      const hy = this.heightAt(hx, hz);
      if (hy < SEA_LEVEL + 1) continue;
      if (!inChunk(hx, hz)) { continue; }
      // foundation & floor
      for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) {
        const gh = this.heightAt(hx + dx, hz + dz);
        for (let y = Math.min(gh, hy) - 1; y <= hy; y++) setW(hx + dx, y, hz + dz, y === hy ? (style === 'desert' ? B.sandstone : B.cobblestone) : B.dirt);
        for (let y = hy + 1; y <= hy + hh + 3; y++) setW(hx + dx, y, hz + dz, 0);
      }
      // walls
      for (let y = 1; y <= hh; y++) for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) {
        const edge = dx === 0 || dx === w - 1 || dz === 0 || dz === d - 1; if (!edge) continue;
        const corner = (dx === 0 || dx === w - 1) && (dz === 0 || dz === d - 1);
        let id = corner ? post : wall;
        // windows
        if (!corner && y === 2 && ((dx === 0 || dx === w - 1) ? dz % 2 === 0 && dz > 0 && dz < d - 1 : dx % 2 === 0 && dx > 0 && dx < w - 1)) id = style === 'desert' ? 0 : B.glass_pane;
        setW(hx + dx, hy + y, hz + dz, id);
      }
      // door on facing side
      const doorPos = facing === 0 ? [hx + (w >> 1), hz] : facing === 1 ? [hx + (w >> 1), hz + d - 1] : facing === 2 ? [hx, hz + (d >> 1)] : [hx + w - 1, hz + (d >> 1)];
      if (door) { setW(doorPos[0], hy + 1, doorPos[1], door, facing === 0 ? 2 : facing === 1 ? 0 : facing === 2 ? 1 : 3); setW(doorPos[0], hy + 2, doorPos[1], door, 8 | (facing === 0 ? 2 : facing === 1 ? 0 : facing === 2 ? 1 : 3)); }
      else { setW(doorPos[0], hy + 1, doorPos[1], 0); setW(doorPos[0], hy + 2, doorPos[1], 0); }
      // roof
      if (style === 'desert') { for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) setW(hx + dx, hy + hh + 1, hz + dz, (dx === 0 || dx === w - 1 || dz === 0 || dz === d - 1) ? B.sandstone : B.sandstone_slab); }
      else {
        const layers = Math.ceil(w / 2);
        for (let l = 0; l <= layers; l++) for (let dx = -1 + l; dx < w + 1 - l; dx++) for (let dz = -1; dz < d + 1; dz++) {
          const y = hy + hh + 1 + l;
          const leftEdge = dx === -1 + l, rightEdge = dx === w - l;
          if (l === layers && w % 2 === 0 && !(leftEdge || rightEdge)) { setW(hx + dx, y, hz + dz, roofFlat); continue; }
          if (leftEdge) setW(hx + dx, y, hz + dz, roof, 3); else if (rightEdge) setW(hx + dx, y, hz + dz, roof, 1);
          else if (l === layers) setW(hx + dx, y, hz + dz, roofFlat); else setW(hx + dx, y, hz + dz, 0);
        }
      }
      // interior
      setW(hx + 1, hy + 1, hz + 1, kind < 0.4 ? B.crafting_table : kind < 0.7 ? B.furnace : B.bookshelf, 0);
      setW(hx + w - 2, hy + 1, hz + 1, B.bed, 0); setW(hx + w - 2, hy + 1, hz + 2, B.bed, 4);
      setW(hx + 1, hy + 1, hz + d - 2, B.chest, 0); this.markLootW(hx + 1, hy + 1, hz + d - 2, 'village');
      setW(hx + (w >> 1), hy + hh, hz + (d >> 1), B.lantern, 0);
      // path to well
      const steps = Math.floor(dist);
      for (let s = 0; s < steps; s++) { const px = Math.floor(vx + (hx + (w >> 1) - vx) * s / steps), pz = Math.floor(vz + (hz + (d >> 1) - vz) * s / steps); const ph = this.heightAt(px, pz); if (getW(px, ph, pz) === B.grass_block || getW(px, ph, pz) === B.sand) setW(px, ph, pz, path); const ab = getW(px, ph + 1, pz); if (ab === B.short_grass || ab === B.dead_bush || ab === B.fern || ab === B.snow) setW(px, ph + 1, pz, 0); }
      // farm
      if (kind > 0.6) {
        const fx = hx + w + 1, fz = hz;
        for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 4; dz++) { const fh = this.heightAt(fx + dx, fz + dz); if (Math.abs(fh - hy) > 2) continue; setW(fx + dx, hy, fz + dz, dx === 2 ? B.water : B.farmland, 7); setW(fx + dx, hy + 1, fz + dz, dx === 2 ? 0 : (style === 'desert' ? B.wheat : (dz % 2 ? B.carrots : B.wheat)), 4 + Math.floor(vr() * 4)); for (let y = hy + 2; y < hy + 4; y++) setW(fx + dx, y, fz + dz, 0); }
      }
    }
  }

  markLoot(cx, cz, lx, ly, lz, kind) { this.pendingLoot = this.pendingLoot || []; this.pendingLoot.push({ x: cx * CX + lx, y: ly, z: cz * CZ + lz, kind }); }
  markLootW(x, y, z, kind) { this.pendingLoot = this.pendingLoot || []; this.pendingLoot.push({ x, y, z, kind }); }
  takeLoot() { const l = this.pendingLoot || []; this.pendingLoot = []; return l; }

  // ---------- Nether ----------
  generateNether(cx, cz, blocks, meta) {
    const bx = cx * CX, bz = cz * CZ;
    const rng = mulberry32(hash2(cx, cz, this.seed + 999) * 4294967296);
    const LAVA = 31;
    for (let x = 0; x < CX; x++) for (let z = 0; z < CZ; z++) {
      const wx = bx + x, wz = bz + z, base = (x * CZ + z) * CY;
      const biome = this.netherBiome(wx, wz);
      for (let y = 0; y < CY; y++) {
        let id;
        if (y === 0 || y === CY - 1 || (y < 4 && rng() < 0.4) || (y > CY - 5 && rng() < 0.4)) id = B.bedrock;
        else {
          const n = this.cave1.fbm3(wx / 45, y / 30, wz / 45, 3) + (y < 30 ? (30 - y) / 60 : 0) + (y > 100 ? (y - 100) / 50 : 0);
          const solid = n > -0.05 || y < 5;
          if (solid) {
            id = B.netherrack;
            if (biome.id === 'soul_sand_valley' && this.detail.noise3(wx / 20, y / 20, wz / 20) > 0.1) id = B.soul_sand;
            if (biome.id === 'basalt_deltas') id = this.detail.noise3(wx / 15, y / 15, wz / 15) > 0 ? B.basalt : B.blackstone;
            const o = hash3(wx, y, wz, this.seed + 12);
            if (o < 0.012) id = B.nether_quartz_ore; else if (o < 0.02) id = B.nether_gold_ore; else if (o < 0.0205 && y < 24) id = B.ancient_debris;
            else if (o > 0.985 && y > 60) id = B.glowstone;
            else if (o > 0.965 && o < 0.985 && biome.id === 'nether_wastes' && y < 50) id = B.magma_block;
          } else id = y <= LAVA ? B.lava : 0;
        }
        blocks[base + y] = id;
      }
      // surface decoration
      for (let y = 5; y < CY - 6; y++) {
        const b = blocks[base + y]; if (b !== B.netherrack) continue;
        const above = blocks[base + y + 1]; if (above !== 0) continue;
        if (biome.id === 'crimson_forest') { blocks[base + y] = B.crimson_nylium; if (rng() < 0.06) this.netherTree(x, y + 1, z, blocks, rng, B.crimson_stem, B.nether_wart_block); else if (rng() < 0.06) blocks[base + y + 1] = B.red_mushroom; }
        else if (biome.id === 'warped_forest') { blocks[base + y] = B.warped_nylium; if (rng() < 0.06) this.netherTree(x, y + 1, z, blocks, rng, B.warped_stem, B.warped_wart_block); else if (rng() < 0.05) blocks[base + y + 1] = B.brown_mushroom; }
        else if (rng() < 0.01 && biome.id === 'nether_wastes') { blocks[base + y + 1] = B.fire; }
        else if (rng() < 0.03 && biome.id === 'soul_sand_valley') { blocks[base + y + 1] = B.bone_block; }
      }
      // glowstone clusters hanging from ceilings
      for (let y = CY - 8; y > 40; y--) { if (blocks[base + y] === B.netherrack && blocks[base + y - 1] === 0 && rng() < 0.01) { const n = 1 + Math.floor(rng() * 3); for (let k = 1; k <= n; k++) blocks[base + y - k] = B.glowstone; } }
    }
    // nether fortress-lite: occasional nether brick bridge pieces
    if (rng() < 0.04) { const y = 40 + Math.floor(rng() * 30); for (let x = 0; x < CX; x++) for (let z = 6; z < 10; z++) { const i = (x * CZ + z) * CY; blocks[i + y] = B.nether_bricks; if (z === 6 || z === 9) blocks[i + y + 1] = B.nether_brick_fence; for (let k = 1; k < 5; k++) blocks[i + y + k] = (z === 6 || z === 9) ? blocks[i + y + k] : 0; } }
  }
  netherTree(x, y, z, blocks, rng, stem, wart) {
    const h = 5 + Math.floor(rng() * 5);
    for (let i = 0; i < h && y + i < CY - 5; i++) blocks[(x * CZ + z) * CY + y + i] = stem;
    for (let dy = -2; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const lx = x + dx, lz = z + dz; if (lx < 0 || lx >= CX || lz < 0 || lz >= CZ) continue; if (Math.abs(dx) + Math.abs(dz) > 3 - (dy === 0 ? 1 : 0)) continue;
      const i = (lx * CZ + lz) * CY + y + h + dy; if (i < CHUNK_VOLUME && blocks[i] === 0) blocks[i] = rng() < 0.08 ? B.shroomlight : wart;
    }
  }

  // ---------- End ----------
  generateEnd(cx, cz, blocks, meta) {
    const bx = cx * CX, bz = cz * CZ;
    const rng = mulberry32(hash2(cx, cz, this.seed + 4242) * 4294967296);
    for (let x = 0; x < CX; x++) for (let z = 0; z < CZ; z++) {
      const wx = bx + x, wz = bz + z, base = (x * CZ + z) * CY;
      const d = Math.hypot(wx, wz);
      let island = 0;
      if (d < 75) island = 1 - d / 75;
      const n = this.detail.fbm2(wx / 60, wz / 60, 3);
      // outer islands beyond 300 blocks
      if (d > 320) { const on = this.cave2.fbm2(wx / 90, wz / 90, 3); if (on > 0.22) island = (on - 0.22) * 3; }
      if (island <= 0) continue;
      const thick = Math.min(1, island * 2.2) * (24 + n * 10);
      const top = Math.floor(58 + n * 4 * island), bottom = Math.floor(top - thick);
      for (let y = Math.max(1, bottom); y <= top && y < CY - 1; y++) blocks[base + y] = B.end_stone;
      if (d > 320 && rng() < 0.01 && top > 40) { const h = 3 + Math.floor(rng() * 6); for (let k = 1; k <= h; k++) blocks[base + top + k] = B.chorus_plant; }
    }
    // obsidian pillars & center portal frame
    const pillars = 10;
    for (let i = 0; i < pillars; i++) {
      const ang = i / pillars * Math.PI * 2, px = Math.round(Math.cos(ang) * 40), pz = Math.round(Math.sin(ang) * 40);
      const ph = 76 + (i % 3) * 8, r = 2 + (i % 2);
      for (let x = 0; x < CX; x++) for (let z = 0; z < CZ; z++) {
        const wx = bx + x, wz = bz + z; if (Math.hypot(wx - px, wz - pz) > r) continue;
        const base = (x * CZ + z) * CY; for (let y = 30; y < ph; y++) blocks[base + y] = B.obsidian;
        if (wx === px && wz === pz) blocks[base + ph] = B.end_rod;
      }
    }
    for (let x = 0; x < CX; x++) for (let z = 0; z < CZ; z++) {
      const wx = bx + x, wz = bz + z; const base = (x * CZ + z) * CY;
      const ad = Math.max(Math.abs(wx), Math.abs(wz));
      if (ad <= 3) { for (let y = 56; y < 70; y++) blocks[base + y] = 0; blocks[base + 60] = ad === 3 ? B.end_stone_bricks : ad === 2 ? B.end_portal_frame : B.bedrock; if (ad <= 1) blocks[base + 60] = B.bedrock; if (wx === 0 && wz === 0) { for (let y = 61; y < 65; y++) blocks[base + y] = B.bedrock; blocks[base + 65] = B.dragon_egg; } }
    }
  }
}

function deepslateOre(ore) {
  const map = { [B.coal_ore]: B.deepslate_coal_ore, [B.iron_ore]: B.deepslate_iron_ore, [B.copper_ore]: B.deepslate_copper_ore, [B.gold_ore]: B.deepslate_gold_ore, [B.redstone_ore]: B.deepslate_redstone_ore, [B.lapis_ore]: B.deepslate_lapis_ore, [B.diamond_ore]: B.deepslate_diamond_ore, [B.emerald_ore]: B.deepslate_emerald_ore };
  return map[ore] || B.deepslate;
}

export function generateChunk(seed, cx, cz, dim, worldType) {
  const g = getGenerator(seed, dim, worldType);
  const out = g.generate(cx, cz);
  out.loot = g.takeLoot();
  return out;
}
