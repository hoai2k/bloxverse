// Procedural texture atlas. Every block face and item icon is drawn in code on a canvas.
import { BLOCKS, B, WOODS, COLORS, ITEM_ID_BASE } from './blocks.js';
import { ITEMS, getItem } from './items.js';
import { mulberry32, hashString } from './noise.js';

export const TILE = 16;
export const ATLAS_TILES = 32; // 32x32 tiles => 512px atlas
export const ATLAS_SIZE = TILE * ATLAS_TILES;

const COLOR_RGB = {
  white: [233, 236, 236], orange: [240, 118, 19], magenta: [189, 68, 179], light_blue: [58, 175, 217], yellow: [248, 197, 39], lime: [112, 185, 25],
  pink: [237, 141, 172], gray: [62, 68, 71], light_gray: [142, 142, 134], cyan: [21, 137, 145], purple: [121, 42, 172], blue: [53, 57, 157],
  brown: [114, 71, 40], green: [84, 109, 27], red: [161, 39, 34], black: [20, 21, 25],
};

// ---------- tiny pixel canvas ----------
class Px {
  constructor() { this.d = new Uint8ClampedArray(TILE * TILE * 4); }
  set(x, y, c, a = 255) { if (x < 0 || y < 0 || x >= TILE || y >= TILE) return this; const i = (y * TILE + x) * 4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a; return this; }
  get(x, y) { const i = (y * TILE + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  fill(c, a = 255) { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) this.set(x, y, c, a); return this; }
  rect(x0, y0, w, h, c, a = 255) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a); return this; }
  each(fn) { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const c = this.get(x, y); const r = fn(x, y, c); if (r) this.set(x, y, r, r.length > 3 ? r[3] : c[3]); } return this; }
}
function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

// Noise texture: base color with per-pixel brightness variation.
function noisy(base, amp, rng, opts = {}) {
  const t = new Px();
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let k = 1 + (rng() - 0.5) * amp;
    if (opts.grain) k *= 1 + (Math.sin((x * 3 + y * 7) * 0.9 + rng()) * 0.5) * opts.grain;
    t.set(x, y, shade(base, k));
  }
  return t;
}
function speckle(t, color, density, rng, a = 255) { t.each((x, y) => rng() < density ? [...color, a] : null); return t; }
function blobs(t, color, count, rng, size = 1, dark = 0.7) {
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(rng() * TILE), cy = Math.floor(rng() * TILE);
    for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > size + (rng() < 0.4 ? 1 : 0)) continue;
      const k = (dx === -size || dy === -size) ? 1.15 : (dx === size || dy === size ? dark : 1);
      t.set(cx + dx, cy + dy, shade(color, k));
    }
  }
  return t;
}
function cracks(t, color, n, rng) {
  for (let i = 0; i < n; i++) {
    let x = Math.floor(rng() * TILE), y = Math.floor(rng() * TILE);
    const len = 3 + Math.floor(rng() * 5);
    for (let j = 0; j < len; j++) { t.set(x, y, color); x += rng() < 0.6 ? 1 : 0; y += rng() < 0.5 ? 1 : (rng() < 0.3 ? -1 : 0); }
  }
  return t;
}
function bricks(base, mortar, bw, bh, rng, amp = 0.15) {
  const t = noisy(base, amp, rng);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const row = Math.floor(y / bh), off = (row % 2) * Math.floor(bw / 2);
    if (y % bh === bh - 1 || (x + off) % bw === bw - 1) t.set(x, y, shade(mortar, 1 + (rng() - 0.5) * 0.1));
  }
  return t;
}
function planks(base, rng) {
  const t = noisy(base, 0.12, rng, { grain: 0.06 });
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (y % 4 === 3) t.set(x, y, shade(base, 0.55));
    const row = Math.floor(y / 4); const seam = (row * 7 + 3) % TILE;
    if (x === seam && y % 4 !== 3) t.set(x, y, shade(base, 0.6));
    if (y % 4 === 0) t.set(x, y, shade(t.get(x, y), 1.08));
  }
  return t;
}
function logSide(bark, rng) {
  const t = noisy(bark, 0.2, rng);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const k = 0.75 + 0.35 * Math.abs(Math.sin(x * 1.3 + (y % 5 === 0 ? 1 : 0))); t.set(x, y, shade(t.get(x, y), k));
  }
  return t;
}
function logTop(bark, inner, rng) {
  const t = noisy(inner, 0.1, rng);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6) t.set(x, y, shade(bark, 0.9 + rng() * 0.2));
    else if (Math.floor(d) % 2 === 0) t.set(x, y, shade(inner, 0.8));
  }
  return t;
}
function leaves(color, rng, holes = 0.25) {
  const t = new Px();
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const r = rng();
    if (r < holes) t.set(x, y, [0, 0, 0], 0);
    else t.set(x, y, shade(color, 0.6 + r * 0.7));
  }
  return t;
}
function grassTop(color, rng) { return noisy(color, 0.25, rng); }
function grassSide(dirtC, grassC, rng) {
  const t = noisy(dirtC, 0.2, rng);
  for (let x = 0; x < TILE; x++) { const h = 2 + Math.floor(rng() * 3); for (let y = 0; y < h; y++) t.set(x, y, shade(grassC, 0.8 + rng() * 0.4)); }
  return t;
}
function ore(stoneTex, color, rng, count = 5) { const t = stoneTex; blobs(t, color, count, rng, 1); return t; }

// Pixel-art template: rows of chars; palette maps char -> color; '.' transparent.
function pix(rows, pal) {
  const t = new Px();
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const ch = rows[y][x]; if (ch === '.' || ch === ' ') continue;
    const c = pal[ch]; if (c) t.set(x, y, c);
  }
  return t;
}
function cross(rows, pal) { return pix(rows, pal); }

// ---------- palettes ----------
const C = {
  stone: [125, 125, 125], dirt: [134, 96, 67], grass: [96, 160, 55], sand: [219, 207, 163], gravel: [131, 127, 127], cobble: [110, 110, 110],
  water: [45, 92, 200], lava: [230, 110, 20], snow: [240, 245, 250], ice: [150, 190, 240], obsidian: [20, 16, 32], bedrock: [60, 60, 60],
  netherrack: [110, 45, 45], glow: [230, 190, 90], coal: [40, 40, 40], iron: [200, 170, 140], gold: [250, 220, 60], diamond: [90, 230, 220],
  redstone: [220, 30, 30], lapis: [30, 70, 190], emerald: [40, 210, 90], copper: [200, 120, 80], quartz: [235, 228, 220], netherite: [70, 62, 62],
  wood: [104, 78, 47], leather: [170, 110, 60], oakPlank: [162, 130, 78], oakBark: [96, 76, 44], oakInner: [190, 152, 92],
};
const WOOD_COLORS = {
  oak: { plank: [162, 130, 78], bark: [96, 76, 44], inner: [190, 152, 92], leaf: [70, 140, 40] },
  spruce: { plank: [114, 84, 48], bark: [58, 38, 20], inner: [130, 100, 60], leaf: [50, 90, 50] },
  birch: { plank: [192, 175, 121], bark: [220, 218, 210], inner: [200, 190, 150], leaf: [110, 160, 60] },
  jungle: { plank: [160, 115, 80], bark: [88, 70, 30], inner: [180, 130, 90], leaf: [60, 150, 40] },
  acacia: { plank: [168, 90, 50], bark: [104, 96, 88], inner: [180, 100, 60], leaf: [110, 140, 50] },
  dark_oak: { plank: [66, 43, 20], bark: [50, 35, 20], inner: [90, 65, 40], leaf: [50, 100, 30] },
  cherry: { plank: [228, 180, 170], bark: [60, 40, 50], inner: [230, 200, 190], leaf: [235, 160, 190] },
};
const TOOL_COLORS = { wooden: [138, 106, 60], stone: [130, 130, 130], iron: [215, 215, 215], golden: [250, 220, 60], diamond: [90, 230, 220], netherite: [70, 62, 62] };
const ARMOR_COLORS = { leather: [170, 110, 60], chainmail: [180, 180, 180], iron: [215, 215, 215], golden: [250, 220, 60], diamond: [90, 230, 220], netherite: [70, 62, 62] };

// ---------- item templates ----------
const T = {
  sword: [
    '..............MM', '.............MMM', '............MMM.', '...........MMM..', '..........MMM...', '.........MMM....', '........MMM.....', '.......MMM......',
    '.hh...MMM.......', '..hhhMMM........', '...hhhh.........', '..hh.hhh........', '.hh...hh........', 'hh..............', '................', '................'],
  pickaxe: [
    '.....MMMMMM.....', '...MMMMMMMMMM...', '..MMM.hhh.MMM...', '.MM..hhhhh..MM..', '.MM....h.....MM.', 'MM.....hh....MM.', 'MM......hh......', '........hh......',
    '.........hh.....', '.........hh.....', '..........hh....', '..........hh....', '...........hh...', '...........hh...', '............hh..', '............hh..'],
  axe: [
    '......MMMMM.....', '....MMMMMMMM....', '...MMMMhhMMMM...', '...MMM.hh.MMM...', '...MMM.hh.MMMM..', '....MM.hh..MM...', '.......hh.......', '.......hh.......',
    '........hh......', '........hh......', '.........hh.....', '.........hh.....', '..........hh....', '..........hh....', '...........hh...', '...........hh...'],
  shovel: [
    '......MMMM......', '.....MMMMMM.....', '.....MMMMMM.....', '.....MMMMMM.....', '......MMMM......', '.......hh.......', '.......hh.......', '.......hh.......',
    '........hh......', '........hh......', '.........hh.....', '.........hh.....', '..........hh....', '..........hh....', '...........hh...', '...........hh...'],
  hoe: [
    '.....MMMMMMM....', '....MMMMMMMMM...', '....MM....hh....', '..........hh....', '..........hh....', '.........hh.....', '.........hh.....', '.........hh.....',
    '........hh......', '........hh......', '........hh......', '.......hh.......', '.......hh.......', '......hh........', '......hh........', '.....hh.........'],
  helmet: [
    '................', '................', '................', '.....MMMMMM.....', '....MMMMMMMM....', '...MMMMMMMMMM...', '...MMMMMMMMMM...', '...MMMMMMMMMM...',
    '...MMMmmmmMMM...', '...MMM....MMM...', '...MMM....MMM...', '...MMM....MMM...', '................', '................', '................', '................'],
  chestplate: [
    '................', '..MMMM....MMMM..', '..MMMM....MMMM..', '..MMMMMMMMMMMM..', '..MMMMMMMMMMMM..', '..MMMMMMMMMMMM..', '..mmMMMMMMMMmm..', '....MMMMMMMM....',
    '....MMMMMMMM....', '....MMMMMMMM....', '....MMMMMMMM....', '....MMMMMMMM....', '....MMMMMMMM....', '....MMMMMMMM....', '................', '................'],
  leggings: [
    '................', '................', '...MMMMMMMMMM...', '...MMMMMMMMMM...', '...MMMMMMMMMM...', '...MMMM..MMMM...', '...MMMM..MMMM...', '...MMMM..MMMM...',
    '...MMMM..MMMM...', '...MMMM..MMMM...', '...MMMM..MMMM...', '...MMMM..MMMM...', '...MMMM..MMMM...', '...mmmm..mmmm...', '................', '................'],
  boots: [
    '................', '................', '................', '................', '................', '...MMM....MMM...', '...MMM....MMM...', '...MMM....MMM...',
    '...MMM....MMM...', '...MMMM..MMMMM..', '...MMMM..MMMMM..', '...MMMM..MMMMM..', '...mmmm..mmmmm..', '................', '................', '................'],
  ingot: [
    '................', '................', '................', '................', '.....MMMMMMMMM..', '....MMMMMMMMMm..', '...MMMMMMMMMMm..', '..MMMMMMMMMMMm..',
    '..mMMMMMMMMMm...', '..mmmmmmmmmmm...', '................', '................', '................', '................', '................', '................'],
  nugget: [
    '................', '................', '................', '................', '................', '......MMMM......', '.....MMMMMM.....', '.....MMMMMm.....',
    '.....MMMMmm.....', '......mmmm......', '................', '................', '................', '................', '................', '................'],
  gem: [
    '................', '................', '................', '.....MMMMMM.....', '....MLLMMMMM....', '...MLLMMMMMMm...', '...MLMMMMMMmm...', '...MMMMMMMmmm...',
    '....MMMMMmmm....', '.....MMMmmm.....', '......Mmmm......', '.......mm.......', '................', '................', '................', '................'],
  raw: [
    '................', '................', '................', '.....MMMMM......', '....MMMMMMMM....', '...MMMmMMMMMM...', '...MMMMMMmMMM...', '..MMmMMMMMMMMM..',
    '..MMMMMMMmMMMm..', '...MMMMmMMMMm...', '....MMMMMMmm....', '.....mmmmmm.....', '................', '................', '................', '................'],
  dust: [
    '................', '................', '................', '................', '.......M........', '....M.MMM..M....', '...MMMMMMMMMM...', '..MMMMMMMMMMMM..',
    '..MMMMMMMMMMMM..', '...MMMMMMMMMM...', '....MMMMMMMM....', '................', '................', '................', '................', '................'],
  stick: [
    '..............hh', '.............hhh', '............hhh.', '...........hhh..', '..........hhh...', '.........hhh....', '........hhh.....', '.......hhh......',
    '......hhh.......', '.....hhh........', '....hhh.........', '...hhh..........', '..hhh...........', '.hhh............', 'hhh.............', '................'],
  round: [
    '................', '................', '................', '.....MMMMMM.....', '....MLLMMMMM....', '...MLLMMMMMMM...', '...MLMMMMMMMM...', '...MMMMMMMMMm...',
    '...MMMMMMMMmm...', '...MMMMMMMmmm...', '....MMMMMmmm....', '.....mmmmmm.....', '................', '................', '................', '................'],
  apple: [
    '................', '................', '.......h........', '......hh........', '.....MMMMMM.....', '....MMMMMMMM....', '...MMLMMMMMMM...', '...MLLMMMMMMM...',
    '...MLMMMMMMMM...', '...MMMMMMMMMM...', '....MMMMMMMM....', '....MMMMMMMM....', '.....MMMMMM.....', '......MM.MM.....', '................', '................'],
  bread: [
    '................', '................', '................', '................', '..........MMM...', '........MMMMMM..', '......MMMMMmMM..', '....MMMMMmMMMm..',
    '..MMMMMmMMMmm...', '..MMMmMMMmmm....', '..MmMMMmmm......', '..MMMmmm........', '..mmmm..........', '................', '................', '................'],
  meat: [
    '................', '................', '................', '....MMMMM.......', '...MMMMMMMM.....', '..MMLLMMMMMM....', '..MLLMMMMMMMM...', '..MLMMMMMMMMM...',
    '..MMMMMMMMmMM...', '...MMMMMMMmmm...', '....MMMMMmmm....', '.....mmmmmm.....', '..........hh....', '...........hh...', '................', '................'],
  fish: [
    '................', '................', '................', '................', '..........MM....', '.....MMMM.MMM...', '...MMMMMMMMMM...', '..MLMMMMMMMMM...',
    '..MMMMMMMMMMM...', '...MMMMMMMMmM...', '.....mmmm.mmm...', '..........mm....', '................', '................', '................', '................'],
  egg: [
    '................', '................', '................', '......MMMM......', '.....MMMMMM.....', '....MLMMMMMM....', '....MLMMMMMM....', '....MMMMMMMM....',
    '....MMMMMMMM....', '....MMMMMMMm....', '....MMMMMMmm....', '.....MMMmmm.....', '......mmmm......', '................', '................', '................'],
  seeds: [
    '................', '................', '................', '................', '.....M..........', '....MMM...M.....', '.....M...MMM....', '..........M.....',
    '........M.......', '.......MMM..M...', '..M.....M..MMM..', '.MMM........M...', '..M.............', '................', '................', '................'],
  wheat: [
    '.......gg.......', '......gggg......', '.....gg.gg......', '......gggg..g...', '.....gg.gg.ggg..', '......gggg.gg...', '..g..gg.gg.gg...', '.ggg..hh...gg...',
    '..gg..hh..gg....', '..gg..hh..hh....', '...gg.hh.hh.....', '....gghhhh......', '......hh........', '......hh........', '......hh........', '......hh........'],
  book: [
    '................', '................', '...MMMMMMMMMM...', '..MMhhhhhhhhhM..', '..MMhhhhhhhhhM..', '..MMhhhhhhhhhM..', '..MMhhhhhhhhhM..', '..MMhhhhhhhhhM..',
    '..MMhhhhhhhhhM..', '..MMhhhhhhhhhM..', '..MMhhhhhhhhhM..', '..MMhhhhhhhhhM..', '...MMMMMMMMMM...', '................', '................', '................'],
  paper: [
    '................', '................', '....MMMMMMMM....', '....MMMMMMMM....', '....MmMMmMMM....', '....MMMMMMMM....', '....MmmMMmMM....', '....MMMMMMMM....',
    '....MMmMmMMM....', '....MMMMMMMM....', '....MmMMmmMM....', '....MMMMMMMM....', '....MMMMMMMM....', '................', '................', '................'],
  bow: [
    '.......hhh......', '.....hh..hh.....', '....h.....hh....', '...h.......h....', '..h.........h...', '..h..........h..', '..h..........h..', '.h...........h..',
    '.h...........h..', '.h..........h...', '..h.........h...', '..h........h....', '...hh.....h.....', '....hh..hh......', '......hh........', '................'],
  arrow: [
    '.............MM.', '............MMM.', '...........MMMM.', '..........hh.M..', '.........hh.....', '........hh......', '.......hh.......', '......hh........',
    '.....hh.........', '....hh..........', '.f.hh...........', 'fffh............', 'ff..............', 'f...............', '................', '................'],
  bucket: [
    '................', '................', '................', '...MMMMMMMMMM...', '..MM........MM..', '..MM........MM..', '..MMLLLLLLLLMM..', '..MMLLLLLLLLMM..',
    '...MMLLLLLLMM...', '...MMLLLLLLMM...', '...MMLLLLLLMM...', '....MMLLLLMM....', '....MMLLLLMM....', '.....MMMMMM.....', '................', '................'],
  carrot: [
    '..........gg....', '.........ggg....', '........ggg.g...', '.........gg.....', '.........MM.....', '........MMM.....', '.......MMMM.....', '......MMMM......',
    '.....MMMM.......', '....MMMM........', '...MMMM.........', '..MMM...........', '.MM.............', '................', '................', '................'],
  potato: [
    '................', '................', '................', '................', '.....MMMMM......', '....MMMMMMMM....', '...MMmMMMMMMM...', '...MMMMMMmMMM...',
    '...MMMMMMMMMM...', '...MmMMMMMMMm...', '....MMMMmMmm....', '.....mmmmmm.....', '................', '................', '................', '................'],
  bone: [
    '.............MM.', '............MMMM', '...........MMMMM', '..........MMM.MM', '.........MMM....', '........MMM.....', '.......MMM......', '......MMM.......',
    '.....MMM........', '....MMM.........', 'MM.MMM..........', 'MMMMM...........', 'MMMM............', '.MM.............', '................', '................'],
  feather: [
    '..............M.', '.............MM.', '............MMM.', '...........MMMM.', '..........MMMM..', '.........MMMMM..', '........MMMMM...', '.......MMMMM....',
    '......MMMMM.....', '.....MMMMM......', '....MMMM........', '...MMhh.........', '..hhh...........', '.hh.............', 'h...............', '................'],
  string: [
    '................', '..MM............', '...MM...........', '....MM..........', '.....MM.........', '......MM........', '.......MM.......', '........MM......',
    '.........MM.....', '..........MM....', '...........MM...', '............MM..', '.............MM.', '..............M.', '................', '................'],
  rod: [
    '..............MM', '.............MMM', '............MMM.', '...........MMM..', '..........MMM...', '.........MMM....', '........MMM.....', '.......MMM......',
    '......MMM.......', '.....MMM........', '....MMM.........', '...MMM..........', '..MMM...........', '.MMM............', 'MM..............', '................'],
  bowl: [
    '................', '................', '................', '................', '................', '................', '..MMMMMMMMMMMM..', '..MLLLLLLLLLLM..',
    '..MMLLLLLLLLMM..', '...MMLLLLLLMM...', '....MMMMMMMM....', '.....MMMMMM.....', '................', '................', '................', '................'],
  shears: [
    '................', '..hh.......hh...', '..hhh.....hhh...', '...hh.....hh....', '...hhh...hhh....', '....hh...hh.....', '....MMMMMMM.....', '.....MMMMM......',
    '.....MMMMM......', '....MMM.MMM.....', '...MMM...MMM....', '..MMM.....MMM...', '.MMM.......MMM..', '.MM.........MM..', '................', '................'],
  fns: [
    '................', '....hhhhh.......', '...hh...hh......', '..hh.....hh.....', '..hh.....hh.....', '..hh.....hh.....', '...hh...hh......', '....hhhhh.......',
    '.........MMM....', '........MMMMM...', '........MMMMM...', '.........MMM....', '..........MM....', '................', '................', '................'],
  compass: [
    '................', '.....hhhhhh.....', '...hhMMMMMMhh...', '..hMMMMMMMMMMh..', '..hMMMMLMMMMMh..', '.hMMMMMLMMMMMMh.', '.hMMMMMLMMMMMMh.', '.hMMMMMMMMMMMMh.',
    '.hMMMMMmMMMMMMh.', '.hMMMMMmMMMMMMh.', '..hMMMMmMMMMMh..', '..hMMMMMMMMMMh..', '...hhMMMMMMhh...', '.....hhhhhh.....', '................', '................'],
  shield: [
    '................', '..MMMMMMMMMMMM..', '..MMMMMMMMMMMM..', '..MMhhhhhhhhMM..', '..MMhhhhhhhhMM..', '..MMhhhhhhhhMM..', '..MMhhhhhhhhMM..', '..MMhhhhhhhhMM..',
    '...MMhhhhhhMM...', '...MMhhhhhhMM...', '....MMhhhhMM....', '.....MMhhMM.....', '......MMMM......', '................', '................', '................'],
  spawnEgg: [
    '................', '................', '......MMMM......', '.....MMMMMM.....', '....MMLMMMMM....', '....MMMMLMMM....', '...MMLMMMMMMM...', '...MMMMMMLMMM...',
    '...MMMMLMMMMM...', '...MMMMMMMMMM...', '....MMLMMMMM....', '....MMMMMMMM....', '.....MMMMMM.....', '......MMMM......', '................', '................'],
  cookie: [
    '................', '................', '................', '................', '.....MMMMMM.....', '....MMmMMMMM....', '...MMMMMMMmMM...', '...MmMMMMMMMM...',
    '...MMMMmMMMMM...', '...MMMMMMMMmM...', '....MMmMMMMM....', '.....MMMMMM.....', '................', '................', '................', '................'],
  pie: [
    '................', '................', '................', '................', '................', '....hhhhhhhh....', '...hMMMMMMMMh...', '..hMMLMMMMMMMh..',
    '..hMMMMMMMMMMh..', '..hhhhhhhhhhhh..', '...hhhhhhhhhh...', '................', '................', '................', '................', '................'],
  melon: [
    '................', '................', '.......hh.......', '......hhMh......', '.....hhMMMh.....', '....hhMMMMMh....', '...hhMMMLMMMh...', '..hhMMLMMMMMMh..',
    '..hMMMMMMLMMMh..', '..hhhhhhhhhhhh..', '................', '................', '................', '................', '................', '................'],
  bottle: [
    '................', '......hhhh......', '......hMMh......', '......hMMh......', '......hMMh......', '.....hhMMhh.....', '....hMMMMMMh....', '....hMLLLLMh....',
    '....hMLLLLMh....', '....hMLLLLMh....', '....hMLLLLMh....', '....hMMLLMMh....', '.....hhhhhh.....', '................', '................', '................'],
  totem: [
    '................', '.....MMMMMM.....', '....MLLMMLLM....', '....MMMMMMMM....', '..hhMMMMMMMMhh..', '..hhhhMMMMhhhh..', '......MMMM......', '.....MMMMMM.....',
    '....MMMMMMMM....', '....MMMMMMMM....', '.....MMMMMM.....', '......MMMM......', '......MMMM......', '......MMMM......', '................', '................'],
  rocket: [
    '.......hh.......', '......hhhh......', '......MMMM......', '......MMMM......', '......MMMM......', '......MMMM......', '......MMMM......', '......MMMM......',
    '......MMMM......', '......hhhh......', '......hhhh......', '.......LL.......', '.......LL.......', '.......LL.......', '................', '................'],
};

// Plant sprites (cross render)
const P = {
  sapling: ['.......g........', '.....ggggg......', '....ggggggg.....', '...gggggggggg...', '...ggggggggg....', '....ggggggg.....', '.....ggggg......', '......ggg.......',
    '.......h........', '.......h........', '.......h........', '.......h........', '................', '................', '................', '................'],
  grass: ['................', '................', '.....g.....g....', '..g..g..g..g..g.', '..g.gg..g.gg..g.', '.gg.gg.gg.gg..gg', '.gg.gg.gg.gg.gg.', '.gg.g..gg.g..gg.',
    '.gggg.ggg.gg.gg.', '.gggg.gg.ggggg..', '..gggggg.gggg...', '..gggggg.gggg...', '...ggggg.ggg....', '...gggg..ggg....', '....ggg..gg.....', '....ggg..gg.....'],
  fern: ['.......g........', '......ggg.......', '..g..ggggg..g...', '.gg..ggggg..gg..', '..gggggggggggg..', '...gggggggggg...', '.g..gggggggg..g.', '.gggggggggggggg.',
    '..gggg.gg.gggg..', '...gg..gg..gg...', '.......gg.......', '.....g.gg.g.....', '......gggg......', '.......gg.......', '.......gg.......', '.......gg.......'],
  flower: ['................', '................', '......FFF.......', '.....FFcFF......', '.....FcccF......', '.....FFcFF......', '......FFF.......', '.......g........',
    '.......g........', '....g..g........', '.....ggg..g.....', '.......g.gg.....', '.......gg.......', '.......g........', '.......g........', '.......g........'],
  mushroom: ['................', '................', '................', '.....MMMMM......', '....MMMlMMM.....', '...MMMMMMMMM....', '...MMlMMMMlM....', '...MMMMMMMMM....',
    '......hhh.......', '......hhh.......', '......hhh.......', '......hhh.......', '......hhh.......', '................', '................', '................'],
  deadbush: ['................', '..h.........h...', '..hh...h...hh...', '...hh..h..hh....', '....hh.h.hh.....', '.....hhhhh......', '.h....hhh....h..', '..hh..hhh..hh...',
    '...hhhhhhhhh....', '.....hhhhh......', '......hhh.......', '......hhh.......', '......hhh.......', '......hhh.......', '......hhh.......', '................'],
  cane: ['......gg........', '......gg........', '......ggg.......', '......ggg.......', '......gGg.......', '......ggg.......', '......ggg.......', '......ggg.......',
    '......gGg.......', '......ggg.......', '......ggg.......', '......ggg.......', '......gGg.......', '......ggg.......', '......ggg.......', '......ggg.......'],
  web: ['M......MM......M', '.M.....MM.....M.', '..M....MM....M..', '...M...MM...M...', '....M..MM..M....', '.....M.MM.M.....', '......MMMM......', 'MMMMMMMMMMMMMMMM',
    'MMMMMMMMMMMMMMMM', '......MMMM......', '.....M.MM.M.....', '....M..MM..M....', '...M...MM...M...', '..M....MM....M..', '.M.....MM.....M.', 'M......MM......M'],
  fire: ['................', '......F.........', '.....FF....F....', '....FFF...FF....', '....FFFF.FFF....', '...FFOFFFFFF....', '...FFOOFFFOF....', '..FFOOOFFOOFF...',
    '..FFOOOOFOOOF...', '..FOOOYOOOOOFF..', '.FFOOYYYOOYOOF..', '.FOOYYYYOYYOOFF.', '.FOOYYYYYYYOOF..', '.FOYYYYYYYYYOOF.', 'FFOYYYYYYYYYYOF.', 'FOOYYYYYYYYYYOFF'],
  kelp: ['.......gg.......', '......gggg......', '.....gg.gg......', '.......gg.......', '......gggg......', '......gg.gg.....', '.......gg.......', '......gggg......',
    '.....gg.gg......', '.......gg.......', '......gggg......', '......gg.gg.....', '.......gg.......', '......gggg......', '.....gg.gg......', '.......gg.......'],
};
function stageWheat(stage) {
  const h = 2 + stage * 1.7;
  const rows = [];
  for (let y = 0; y < 16; y++) {
    let s = '';
    for (let x = 0; x < 16; x++) {
      const col = (x % 4 === 1 || x % 4 === 2);
      const top = 16 - h;
      if (col && y >= top) s += (stage >= 7 && y < top + 5) ? 'w' : 'g';
      else s += '.';
    }
    rows.push(s);
  }
  return rows;
}

// ---------- texture generator ----------
const cache = new Map();
export function generateTile(name) {
  if (cache.has(name)) return cache.get(name);
  const rng = mulberry32(hashString(name));
  let t = gen(name, rng);
  if (!t) { t = new Px(); t.each((x, y) => ((x >> 2) + (y >> 2)) % 2 ? [255, 0, 255] : [0, 0, 0]); MISSING.add(name); }
  cache.set(name, t);
  return t;
}
export const MISSING = new Set();

function stoneLike(base, rng, amp = 0.18) { const t = noisy(base, amp, rng); cracks(t, shade(base, 0.7), 4, rng); return t; }

function gen(name, rng) {
  // wood family
  for (const w of Object.keys(WOOD_COLORS)) {
    const wc = WOOD_COLORS[w];
    if (name === `${w}_planks`) return planks(wc.plank, rng);
    if (name === `${w}_log`) return logSide(wc.bark, rng);
    if (name === `${w}_log_top`) return logTop(wc.bark, wc.inner, rng);
    if (name === `${w}_leaves`) return leaves(wc.leaf, rng, w === 'cherry' ? 0.15 : 0.25);
    if (name === `${w}_sapling`) return cross(P.sapling, { g: wc.leaf, h: wc.bark });
    if (name === `${w}_door_top`) { const t = planks(wc.plank, rng); t.rect(2, 2, 12, 5, shade(wc.plank, 0.5)); t.rect(3, 3, 10, 3, mix(C.ice, [255, 255, 255], 0.5)); t.rect(3, 10, 10, 4, shade(wc.plank, 0.75)); return t; }
    if (name === `${w}_door_bottom`) { const t = planks(wc.plank, rng); t.rect(3, 1, 10, 5, shade(wc.plank, 0.75)); t.rect(3, 9, 10, 5, shade(wc.plank, 0.75)); t.rect(12, 5, 2, 2, [200, 200, 200]); return t; }
    if (name === `stripped_${w}_log`) return noisy(wc.inner, 0.1, rng, { grain: 0.1 });
    if (name === `stripped_${w}_log_top`) return logTop(wc.inner, wc.inner, rng);
  }
  if (name.endsWith('_wool')) { const c = COLOR_RGB[name.slice(0, -5)]; const t = noisy(c, 0.12, rng); t.each((x, y, p) => ((x + y) % 4 === 0) ? shade(p, 0.9) : null); return t; }
  if (name.endsWith('_concrete')) return noisy(COLOR_RGB[name.slice(0, -9)], 0.04, rng);
  if (name.endsWith('_terracotta')) return noisy(mix(COLOR_RGB[name.slice(0, -11)], [150, 100, 80], 0.4), 0.1, rng);
  if (name.endsWith('_stained_glass')) { const c = COLOR_RGB[name.slice(0, -14)]; const t = new Px().fill(c, 110); t.rect(0, 0, 16, 1, shade(c, 1.3), 220); t.rect(0, 0, 1, 16, shade(c, 1.3), 220); t.rect(15, 0, 1, 16, shade(c, 0.7), 220); t.rect(0, 15, 16, 1, shade(c, 0.7), 220); return t; }
  if (name.endsWith('_dye')) { const c = COLOR_RGB[name.slice(0, -4)]; return pix(T.dust, { M: c }); }
  if (name.startsWith('wheat_stage')) { const s = +name.slice(11); return cross(stageWheat(s), { g: s >= 7 ? [190, 170, 80] : [80, 160, 40], w: [220, 190, 90] }); }
  if (name.startsWith('carrots_stage')) { const s = +name.slice(13); const rows = stageWheat(2 + s * 1.5).map(r => r.replace(/w/g, 'g')); const t = cross(rows, { g: [60, 150, 40] }); if (s >= 3) t.rect(5, 12, 2, 3, [230, 120, 30]).rect(9, 12, 2, 3, [230, 120, 30]); return t; }
  if (name.startsWith('potatoes_stage')) { const s = +name.slice(14); const rows = stageWheat(2 + s * 1.5).map(r => r.replace(/w/g, 'g')); const t = cross(rows, { g: [70, 140, 50] }); if (s >= 3) t.rect(4, 13, 3, 2, [200, 170, 110]).rect(9, 13, 3, 2, [200, 170, 110]); return t; }
  if (name.startsWith('stem_stage')) { const s = +name.slice(10); const rows = stageWheat(1 + s * 1.2).map(r => r.replace(/w/g, 'g')); return cross(rows, { g: s >= 7 ? [180, 150, 60] : [90, 170, 50] }); }
  if (name.startsWith('nether_wart_stage')) { const s = +name.slice(17); const rows = stageWheat(2 + s * 2).map(r => r.replace(/w/g, 'g')); return cross(rows, { g: [160, 30, 40] }); }
  if (name.endsWith('_spawn_egg') || name === 'spawn_egg') return pix(T.spawnEgg, { M: [200, 200, 200], L: [120, 120, 120] });

  switch (name) {
    case 'stone': return stoneLike(C.stone, rng);
    case 'granite': { const t = noisy([150, 105, 90], 0.2, rng); speckle(t, [175, 130, 110], 0.2, rng); speckle(t, [110, 80, 70], 0.1, rng); return t; }
    case 'diorite': { const t = noisy([190, 190, 190], 0.2, rng); speckle(t, [120, 120, 120], 0.2, rng); return t; }
    case 'andesite': { const t = noisy([135, 135, 130], 0.18, rng); speckle(t, [110, 110, 105], 0.2, rng); return t; }
    case 'polished_granite': return noisy([155, 108, 92], 0.06, rng);
    case 'polished_diorite': return noisy([195, 195, 195], 0.06, rng);
    case 'polished_andesite': return noisy([138, 138, 133], 0.06, rng);
    case 'deepslate': { const t = noisy([80, 80, 85], 0.18, rng); t.each((x, y, p) => (y % 4 === 0) ? shade(p, 0.85) : null); return t; }
    case 'cobbled_deepslate': return bricks([85, 85, 90], [55, 55, 60], 5, 4, rng, 0.2);
    case 'polished_deepslate': return noisy([78, 78, 83], 0.06, rng);
    case 'deepslate_bricks': return bricks([82, 82, 88], [50, 50, 55], 8, 4, rng, 0.1);
    case 'tuff': { const t = noisy([110, 112, 100], 0.18, rng); speckle(t, [90, 92, 82], 0.15, rng); return t; }
    case 'calcite': return noisy([225, 225, 220], 0.08, rng);
    case 'dripstone_block': return bricks([130, 105, 90], [100, 80, 70], 4, 4, rng, 0.2);
    case 'grass_top': return grassTop(C.grass, rng);
    case 'grass_side': return grassSide(C.dirt, C.grass, rng);
    case 'dirt': { const t = noisy(C.dirt, 0.22, rng); speckle(t, shade(C.dirt, 0.7), 0.08, rng); return t; }
    case 'coarse_dirt': { const t = noisy(C.dirt, 0.25, rng); speckle(t, C.gravel, 0.15, rng); return t; }
    case 'rooted_dirt': { const t = noisy(C.dirt, 0.2, rng); speckle(t, [90, 60, 40], 0.15, rng); return t; }
    case 'mud': return noisy([60, 57, 60], 0.15, rng);
    case 'podzol_top': return noisy([90, 62, 30], 0.25, rng);
    case 'podzol_side': return grassSide(C.dirt, [90, 62, 30], rng);
    case 'mycelium_top': { const t = noisy([110, 100, 110], 0.2, rng); speckle(t, [140, 120, 140], 0.1, rng); return t; }
    case 'mycelium_side': return grassSide(C.dirt, [110, 100, 110], rng);
    case 'dirt_path_top': return noisy([150, 125, 75], 0.15, rng);
    case 'dirt_path_side': return grassSide(C.dirt, [150, 125, 75], rng);
    case 'cobblestone': return bricks(C.cobble, [70, 70, 70], 5, 4, rng, 0.25);
    case 'mossy_cobblestone': { const t = bricks(C.cobble, [70, 70, 70], 5, 4, rng, 0.25); blobs(t, [80, 120, 50], 5, rng, 1, 0.9); return t; }
    case 'bedrock': { const t = noisy(C.bedrock, 0.4, rng); return t; }
    case 'sand': { const t = noisy(C.sand, 0.1, rng); speckle(t, shade(C.sand, 0.9), 0.1, rng); return t; }
    case 'red_sand': return noisy([190, 100, 40], 0.1, rng);
    case 'gravel': { const t = noisy(C.gravel, 0.3, rng); speckle(t, [90, 88, 88], 0.12, rng); speckle(t, [160, 158, 155], 0.1, rng); return t; }
    case 'sandstone': { const t = noisy(C.sand, 0.06, rng); t.rect(0, 3, 16, 1, shade(C.sand, 0.8)); t.rect(0, 11, 16, 1, shade(C.sand, 0.8)); return t; }
    case 'sandstone_top': return noisy(C.sand, 0.06, rng);
    case 'smooth_sandstone': return noisy(C.sand, 0.04, rng);
    case 'red_sandstone': { const t = noisy([190, 100, 40], 0.06, rng); t.rect(0, 3, 16, 1, [150, 80, 30]); t.rect(0, 11, 16, 1, [150, 80, 30]); return t; }
    case 'red_sandstone_top': return noisy([190, 100, 40], 0.06, rng);
    case 'clay': return noisy([160, 165, 175], 0.1, rng);
    case 'snow_block': case 'snow': return noisy(C.snow, 0.04, rng);
    case 'ice': { const t = noisy(C.ice, 0.08, rng); cracks(t, [200, 225, 250], 3, rng); t.each(() => null); for (let i = 0; i < t.d.length; i += 4) t.d[i + 3] = 200; return t; }
    case 'packed_ice': { const t = noisy([140, 180, 235], 0.08, rng); cracks(t, [190, 215, 245], 3, rng); return t; }
    case 'obsidian': { const t = noisy(C.obsidian, 0.5, rng); blobs(t, [50, 30, 80], 3, rng, 1); return t; }
    case 'crying_obsidian': { const t = noisy(C.obsidian, 0.5, rng); blobs(t, [110, 40, 200], 5, rng, 1); return t; }
    case 'water': { const t = noisy(C.water, 0.12, rng); for (let i = 0; i < t.d.length; i += 4) t.d[i + 3] = 165; return t; }
    case 'lava': { const t = noisy(C.lava, 0.25, rng); blobs(t, [255, 200, 60], 5, rng, 1, 0.95); blobs(t, [150, 40, 10], 4, rng, 1, 1); return t; }
    case 'netherrack': { const t = noisy(C.netherrack, 0.25, rng); speckle(t, [80, 30, 30], 0.1, rng); return t; }
    case 'soul_sand': { const t = noisy([80, 62, 50], 0.2, rng); blobs(t, [50, 38, 30], 3, rng, 1); return t; }
    case 'soul_soil': return noisy([70, 55, 45], 0.2, rng);
    case 'glowstone': { const t = noisy(C.glow, 0.15, rng); blobs(t, [255, 240, 170], 5, rng, 1, 0.9); blobs(t, [160, 110, 40], 3, rng, 1, 1); return t; }
    case 'nether_bricks': return bricks([45, 22, 27], [30, 12, 15], 8, 4, rng, 0.12);
    case 'red_nether_bricks': return bricks([90, 20, 25], [50, 10, 15], 8, 4, rng, 0.12);
    case 'magma_block': { const t = noisy([80, 40, 30], 0.2, rng); blobs(t, [230, 120, 30], 6, rng, 1, 0.9); return t; }
    case 'end_stone': { const t = noisy([220, 222, 160], 0.1, rng); speckle(t, [190, 190, 130], 0.12, rng); return t; }
    case 'end_stone_bricks': return bricks([220, 222, 160], [180, 180, 120], 8, 4, rng, 0.06);
    case 'basalt': { const t = noisy([80, 80, 85], 0.15, rng); t.each((x, y, p) => (x % 3 === 0) ? shade(p, 0.8) : null); return t; }
    case 'basalt_top': return noisy([90, 90, 95], 0.15, rng);
    case 'polished_basalt': { const t = noisy([88, 88, 93], 0.06, rng); t.each((x, y, p) => (x % 4 === 0) ? shade(p, 0.85) : null); return t; }
    case 'polished_basalt_top': return noisy([92, 92, 97], 0.05, rng);
    case 'blackstone': { const t = noisy([35, 32, 38], 0.3, rng); cracks(t, [60, 55, 60], 3, rng); return t; }
    case 'polished_blackstone_bricks': return bricks([38, 35, 42], [20, 18, 24], 8, 4, rng, 0.1);
    case 'nether_portal': { const t = noisy([120, 40, 200], 0.4, rng); for (let i = 0; i < t.d.length; i += 4) t.d[i + 3] = 180; return t; }
    case 'end_portal': { const t = noisy([10, 10, 20], 0.3, rng); speckle(t, [80, 200, 120], 0.05, rng); return t; }
    case 'end_portal_frame': { const t = noisy([80, 110, 80], 0.1, rng); t.rect(4, 4, 8, 8, [40, 60, 40]); return t; }
    case 'coal_ore': return ore(stoneLike(C.stone, rng), C.coal, rng, 6);
    case 'iron_ore': return ore(stoneLike(C.stone, rng), C.iron, rng, 5);
    case 'copper_ore': return ore(stoneLike(C.stone, rng), C.copper, rng, 5);
    case 'gold_ore': return ore(stoneLike(C.stone, rng), C.gold, rng, 5);
    case 'redstone_ore': return ore(stoneLike(C.stone, rng), C.redstone, rng, 5);
    case 'lapis_ore': return ore(stoneLike(C.stone, rng), C.lapis, rng, 5);
    case 'diamond_ore': return ore(stoneLike(C.stone, rng), C.diamond, rng, 4);
    case 'emerald_ore': return ore(stoneLike(C.stone, rng), C.emerald, rng, 3);
    case 'deepslate_coal_ore': return ore(gen('deepslate', rng), C.coal, rng, 6);
    case 'deepslate_iron_ore': return ore(gen('deepslate', rng), C.iron, rng, 5);
    case 'deepslate_copper_ore': return ore(gen('deepslate', rng), C.copper, rng, 5);
    case 'deepslate_gold_ore': return ore(gen('deepslate', rng), C.gold, rng, 5);
    case 'deepslate_redstone_ore': return ore(gen('deepslate', rng), C.redstone, rng, 5);
    case 'deepslate_lapis_ore': return ore(gen('deepslate', rng), C.lapis, rng, 5);
    case 'deepslate_diamond_ore': return ore(gen('deepslate', rng), C.diamond, rng, 4);
    case 'deepslate_emerald_ore': return ore(gen('deepslate', rng), C.emerald, rng, 3);
    case 'nether_gold_ore': return ore(gen('netherrack', rng), C.gold, rng, 5);
    case 'nether_quartz_ore': return ore(gen('netherrack', rng), C.quartz, rng, 5);
    case 'ancient_debris': { const t = noisy([90, 65, 55], 0.2, rng); blobs(t, [60, 45, 40], 4, rng, 1); return t; }
    case 'stone_bricks': return bricks([122, 122, 122], [85, 85, 85], 8, 4, rng, 0.1);
    case 'mossy_stone_bricks': { const t = bricks([122, 122, 122], [85, 85, 85], 8, 4, rng, 0.1); blobs(t, [80, 120, 50], 5, rng, 1, 0.9); return t; }
    case 'cracked_stone_bricks': { const t = bricks([118, 118, 118], [85, 85, 85], 8, 4, rng, 0.1); cracks(t, [70, 70, 70], 4, rng); return t; }
    case 'chiseled_stone_bricks': { const t = noisy([122, 122, 122], 0.06, rng); t.rect(0, 0, 16, 1, [85, 85, 85]).rect(0, 15, 16, 1, [85, 85, 85]).rect(0, 0, 1, 16, [85, 85, 85]).rect(15, 0, 1, 16, [85, 85, 85]).rect(4, 4, 8, 8, [95, 95, 95]).rect(6, 6, 4, 4, [122, 122, 122]); return t; }
    case 'bricks': return bricks([150, 80, 65], [175, 165, 160], 8, 4, rng, 0.12);
    case 'smooth_stone': return noisy([160, 160, 160], 0.05, rng);
    case 'quartz_block': case 'chiseled_quartz_block': { const t = noisy(C.quartz, 0.04, rng); if (name.startsWith('chiseled')) t.rect(2, 2, 12, 12, shade(C.quartz, 0.9)).rect(4, 4, 8, 8, C.quartz); return t; }
    case 'quartz_pillar': { const t = noisy(C.quartz, 0.04, rng); t.each((x, y, p) => (x % 4 === 0) ? shade(p, 0.88) : null); return t; }
    case 'quartz_pillar_top': return noisy(C.quartz, 0.04, rng);
    case 'coal_block': return noisy([30, 30, 30], 0.25, rng);
    case 'iron_block': case 'gold_block': case 'diamond_block': case 'emerald_block': case 'lapis_block': case 'redstone_block': case 'netherite_block': case 'copper_block': case 'cut_copper': case 'oxidized_copper': {
      const c = { iron_block: [220, 220, 220], gold_block: C.gold, diamond_block: C.diamond, emerald_block: C.emerald, lapis_block: C.lapis, redstone_block: C.redstone, netherite_block: C.netherite, copper_block: C.copper, cut_copper: shade(C.copper, 0.9), oxidized_copper: [80, 160, 130] }[name];
      const t = noisy(c, 0.05, rng); t.rect(0, 0, 16, 1, shade(c, 1.2)).rect(0, 0, 1, 16, shade(c, 1.2)).rect(15, 0, 1, 16, shade(c, 0.7)).rect(0, 15, 16, 1, shade(c, 0.7));
      if (name === 'cut_copper') t.rect(0, 7, 16, 1, shade(c, 0.7)).rect(7, 0, 1, 16, shade(c, 0.7)); return t; }
    case 'amethyst_block': { const t = noisy([140, 90, 200], 0.2, rng); blobs(t, [190, 150, 240], 4, rng, 1); return t; }
    case 'prismarine': return bricks([90, 150, 140], [60, 110, 100], 4, 4, rng, 0.15);
    case 'dark_prismarine': return bricks([50, 90, 80], [30, 60, 50], 8, 4, rng, 0.1);
    case 'purpur_block': return bricks([170, 125, 170], [140, 100, 140], 8, 8, rng, 0.08);
    case 'crafting_table_top': { const t = planks(C.oakPlank, rng); t.rect(1, 1, 6, 6, [110, 80, 50]).rect(9, 1, 6, 6, [110, 80, 50]).rect(1, 9, 6, 6, [110, 80, 50]).rect(9, 9, 6, 6, [110, 80, 50]).rect(2, 2, 4, 4, C.oakPlank).rect(10, 2, 4, 4, C.oakPlank).rect(2, 10, 4, 4, C.oakPlank).rect(10, 10, 4, 4, C.oakPlank); return t; }
    case 'crafting_table_side': { const t = planks(C.oakPlank, rng); t.rect(0, 0, 16, 2, [110, 80, 50]); t.rect(3, 4, 4, 5, [90, 60, 40]).rect(9, 4, 4, 5, [90, 60, 40]); return t; }
    case 'crafting_table_front': { const t = planks(C.oakPlank, rng); t.rect(0, 0, 16, 2, [110, 80, 50]); t.rect(2, 4, 5, 6, [90, 60, 40]).rect(9, 5, 5, 4, [90, 60, 40]); t.rect(3, 5, 3, 4, [170, 170, 170]); return t; }
    case 'furnace_top': case 'furnace_side': case 'smoker_top': case 'smoker_side': case 'blast_furnace_top': case 'blast_furnace_side': {
      const base = name.startsWith('blast') ? [90, 90, 95] : name.startsWith('smoker') ? [100, 85, 70] : C.cobble;
      const t = bricks(base, shade(base, 0.6), 5, 4, rng, 0.25); if (name.startsWith('blast')) t.rect(2, 2, 12, 12, shade(base, 0.9)); return t; }
    case 'furnace_front': case 'furnace_front_on': case 'smoker_front': case 'smoker_front_on': case 'blast_furnace_front': case 'blast_furnace_front_on': {
      const t = gen(name.replace(/_front(_on)?$/, '_side'), rng); t.rect(3, 2, 10, 5, [30, 30, 30]); t.rect(4, 9, 8, 5, [30, 30, 30]);
      if (name.endsWith('_on')) { t.rect(5, 10, 6, 3, [250, 120, 20]); t.rect(6, 9, 4, 2, [255, 210, 60]); } return t; }
    case 'chest_top': { const t = planks([150, 110, 60], rng); t.rect(0, 0, 16, 1, [90, 60, 30]).rect(0, 15, 16, 1, [90, 60, 30]).rect(0, 0, 1, 16, [90, 60, 30]).rect(15, 0, 1, 16, [90, 60, 30]); return t; }
    case 'chest_side': { const t = noisy([150, 110, 60], 0.1, rng, { grain: 0.1 }); t.rect(0, 0, 16, 1, [90, 60, 30]).rect(0, 15, 16, 1, [90, 60, 30]).rect(0, 0, 1, 16, [90, 60, 30]).rect(15, 0, 1, 16, [90, 60, 30]).rect(1, 6, 14, 1, [90, 60, 30]); return t; }
    case 'chest_front': { const t = gen('chest_side', rng); t.rect(7, 5, 2, 4, [70, 70, 70]).rect(7, 5, 2, 1, [110, 110, 110]); return t; }
    case 'barrel_top': { const t = planks([120, 90, 50], rng); t.rect(2, 2, 12, 12, [140, 105, 60]); t.rect(0, 3, 16, 1, [80, 80, 80]).rect(0, 12, 16, 1, [80, 80, 80]); return t; }
    case 'barrel_bottom': return planks([120, 90, 50], rng);
    case 'barrel_side': { const t = noisy([120, 90, 50], 0.1, rng, { grain: 0.1 }); t.each((x, y, p) => x % 4 === 3 ? shade(p, 0.7) : null); t.rect(0, 3, 16, 1, [80, 80, 80]).rect(0, 12, 16, 1, [80, 80, 80]); return t; }
    case 'torch': { const t = new Px(); t.rect(7, 8, 2, 8, [120, 90, 50]); t.set(7, 8, [140, 110, 60]); t.rect(7, 6, 2, 2, [255, 220, 80]); t.set(7, 6, [255, 150, 30]); t.set(8, 7, [255, 170, 40]); return t; }
    case 'ladder': { const t = new Px(); t.rect(2, 0, 2, 16, [140, 105, 60]).rect(12, 0, 2, 16, [140, 105, 60]); for (let y = 1; y < 16; y += 4) t.rect(2, y, 12, 2, [160, 125, 75]); return t; }
    case 'bookshelf': { const t = planks(C.oakPlank, rng); t.rect(0, 1, 16, 6, [80, 55, 35]).rect(0, 9, 16, 6, [80, 55, 35]); const cols = [[160, 40, 40], [40, 80, 160], [60, 140, 60], [180, 150, 60], [140, 60, 140], [200, 200, 200]]; for (let i = 0; i < 16; i += 2) { t.rect(i, 2, 2, 5, cols[(i / 2) % 6]); t.rect(i, 10, 2, 5, cols[(i / 2 + 3) % 6]); } return t; }
    case 'tnt_side': { const t = noisy([200, 50, 40], 0.1, rng); t.rect(0, 0, 16, 3, [150, 150, 150]).rect(0, 13, 16, 3, [150, 150, 150]); t.rect(0, 6, 16, 4, [230, 230, 230]); t.rect(3, 7, 2, 2, [0, 0, 0]).rect(7, 7, 2, 2, [0, 0, 0]).rect(11, 7, 2, 2, [0, 0, 0]); return t; }
    case 'tnt_top': { const t = noisy([200, 50, 40], 0.1, rng); t.rect(2, 2, 3, 3, [40, 40, 40]).rect(7, 2, 3, 3, [40, 40, 40]).rect(11, 2, 3, 3, [40, 40, 40]).rect(2, 7, 3, 3, [40, 40, 40]).rect(7, 7, 3, 3, [40, 40, 40]).rect(11, 7, 3, 3, [40, 40, 40]).rect(2, 11, 3, 3, [40, 40, 40]).rect(7, 11, 3, 3, [40, 40, 40]).rect(11, 11, 3, 3, [40, 40, 40]); return t; }
    case 'tnt_bottom': return noisy([90, 30, 25], 0.1, rng);
    case 'glass': { const t = new Px().fill([200, 230, 240], 40); t.rect(0, 0, 16, 1, [230, 245, 250], 255).rect(0, 0, 1, 16, [230, 245, 250], 255).rect(15, 0, 1, 16, [180, 200, 210], 255).rect(0, 15, 16, 1, [180, 200, 210], 255); t.set(3, 2, [255, 255, 255], 200).set(2, 3, [255, 255, 255], 200).set(4, 1, [255, 255, 255], 200); return t; }
    case 'bed_head': { const t = noisy([200, 40, 40], 0.06, rng); t.rect(1, 1, 14, 5, [240, 240, 240]); t.rect(0, 0, 16, 1, [90, 60, 30]).rect(0, 0, 1, 16, [90, 60, 30]).rect(15, 0, 1, 16, [90, 60, 30]); return t; }
    case 'bed_foot': { const t = noisy([200, 40, 40], 0.06, rng); t.rect(0, 0, 1, 16, [90, 60, 30]).rect(15, 0, 1, 16, [90, 60, 30]).rect(0, 15, 16, 1, [90, 60, 30]); return t; }
    case 'bed_side': { const t = noisy([200, 40, 40], 0.06, rng); t.rect(0, 0, 16, 7, [0, 0, 0], 0); t.rect(0, 12, 16, 4, [90, 60, 30]); return t; }
    case 'enchanting_table_top': { const t = noisy([200, 40, 60], 0.1, rng); t.rect(3, 3, 10, 10, [240, 240, 240]).rect(4, 4, 8, 8, [60, 40, 90]); return t; }
    case 'enchanting_table_side': { const t = noisy(C.obsidian, 0.4, rng); t.rect(0, 0, 16, 4, [0, 0, 0], 0); t.rect(2, 6, 12, 6, [200, 40, 60]); t.rect(3, 7, 10, 4, C.diamond); return t; }
    case 'pumpkin_top': { const t = noisy([200, 110, 20], 0.12, rng); t.each((x, y, p) => (x % 5 === 0) ? shade(p, 0.75) : null); t.rect(7, 6, 2, 3, [90, 120, 40]); return t; }
    case 'pumpkin_side': case 'melon_side': { const c = name.startsWith('melon') ? [80, 150, 40] : [200, 110, 20]; const t = noisy(c, 0.12, rng); t.each((x, y, p) => (x % 5 === 0) ? shade(p, 0.75) : null); if (name.startsWith('melon')) t.each((x, y, p) => ((x * 3 + y * 5) % 7 === 0) ? shade(p, 1.3) : null); return t; }
    case 'melon_top': { const t = noisy([80, 150, 40], 0.12, rng); t.each((x, y, p) => ((x * 3 + y * 5) % 7 === 0) ? shade(p, 1.3) : null); return t; }
    case 'jack_o_lantern_front': case 'carved_pumpkin_front': { const t = gen('pumpkin_side', rng); const c = name.startsWith('jack') ? [255, 220, 80] : [30, 20, 10]; t.rect(3, 4, 3, 3, c).rect(10, 4, 3, 3, c).rect(2, 10, 12, 2, c).rect(4, 12, 2, 1, c).rect(10, 12, 2, 1, c).rect(7, 8, 2, 2, c); return t; }
    case 'hay_block_side': { const t = noisy([200, 170, 60], 0.15, rng); t.each((x, y, p) => (y % 4 === 3) ? shade(p, 0.6) : (x % 3 === 0 ? shade(p, 0.85) : null)); t.rect(0, 4, 16, 1, [120, 90, 40]).rect(0, 11, 16, 1, [120, 90, 40]); return t; }
    case 'hay_block_top': { const t = noisy([200, 170, 60], 0.15, rng); t.each((x, y, p) => ((x + y) % 3 === 0) ? shade(p, 0.7) : null); return t; }
    case 'sponge': { const t = noisy([200, 190, 80], 0.15, rng); blobs(t, [150, 140, 50], 6, rng, 0); return t; }
    case 'cobweb': return cross(P.web, { M: [230, 230, 230] });
    case 'spawner': { const t = new Px().fill([30, 30, 40], 0); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x % 4 === 0 || y % 4 === 0 || x === 15 || y === 15) t.set(x, y, [40, 45, 60]); return t; }
    case 'fire': return cross(P.fire, { F: [255, 100, 20], O: [255, 160, 30], Y: [255, 230, 80] });
    case 'farmland_dry': { const t = noisy([120, 85, 55], 0.15, rng); t.each((x, y, p) => (y % 4 === 1) ? shade(p, 0.75) : null); return t; }
    case 'farmland_wet': { const t = noisy([70, 50, 35], 0.15, rng); t.each((x, y, p) => (y % 4 === 1) ? shade(p, 0.75) : null); return t; }
    case 'short_grass': return cross(P.grass, { g: [90, 160, 50] });
    case 'fern': case 'large_fern_bottom': return cross(P.fern, { g: [70, 140, 45] });
    case 'large_fern_top': return cross(P.fern.slice(4).concat(P.fern.slice(0, 4).map(() => '................')), { g: [70, 140, 45] });
    case 'tall_grass_bottom': return cross(P.grass, { g: [85, 155, 50] });
    case 'tall_grass_top': return cross(P.grass.slice(6).concat(P.grass.slice(0, 6).map(() => '................')), { g: [95, 165, 55] });
    case 'dead_bush': return cross(P.deadbush, { h: [140, 100, 50] });
    case 'dandelion': return cross(P.flower, { F: [250, 220, 50], c: [255, 240, 120], g: [70, 140, 45] });
    case 'poppy': return cross(P.flower, { F: [220, 30, 30], c: [40, 30, 30], g: [70, 140, 45] });
    case 'blue_orchid': return cross(P.flower, { F: [60, 160, 240], c: [240, 240, 200], g: [70, 140, 45] });
    case 'allium': return cross(P.flower, { F: [200, 120, 230], c: [230, 180, 250], g: [70, 140, 45] });
    case 'oxeye_daisy': return cross(P.flower, { F: [240, 240, 240], c: [250, 220, 60], g: [70, 140, 45] });
    case 'cornflower': return cross(P.flower, { F: [70, 100, 220], c: [40, 60, 160], g: [70, 140, 45] });
    case 'lily_of_the_valley': return cross(P.flower, { F: [250, 250, 250], c: [230, 230, 230], g: [70, 140, 45] });
    case 'tulip_red': return cross(P.flower, { F: [220, 40, 40], c: [250, 90, 90], g: [70, 140, 45] });
    case 'tulip_orange': return cross(P.flower, { F: [240, 130, 40], c: [250, 170, 90], g: [70, 140, 45] });
    case 'tulip_white': return cross(P.flower, { F: [245, 245, 245], c: [250, 250, 250], g: [70, 140, 45] });
    case 'tulip_pink': return cross(P.flower, { F: [240, 150, 190], c: [250, 190, 220], g: [70, 140, 45] });
    case 'sunflower_top': return cross(P.flower, { F: [250, 200, 40], c: [90, 60, 30], g: [70, 140, 45] });
    case 'sunflower_bottom': case 'rose_bush_bottom': case 'lilac_bottom': return cross(P.grass, { g: [70, 140, 45] });
    case 'rose_bush_top': { const t = cross(P.grass, { g: [60, 120, 40] }); blobs(t, [200, 30, 40], 5, rng, 0); return t; }
    case 'lilac_top': { const t = cross(P.grass, { g: [60, 120, 40] }); blobs(t, [210, 150, 230], 5, rng, 0); return t; }
    case 'pink_petals': { const t = new Px(); blobs(t, [240, 170, 200], 6, rng, 0); return t; }
    case 'brown_mushroom': return cross(P.mushroom, { M: [150, 110, 80], l: [180, 150, 110], h: [200, 190, 160] });
    case 'red_mushroom': return cross(P.mushroom, { M: [210, 40, 40], l: [250, 240, 240], h: [220, 210, 190] });
    case 'cactus_side': { const t = noisy([70, 130, 50], 0.12, rng); t.each((x, y, p) => (x % 4 === 0) ? shade(p, 0.8) : null); t.rect(0, 0, 1, 16, [0, 0, 0], 0).rect(15, 0, 1, 16, [0, 0, 0], 0); return t; }
    case 'cactus_top': case 'cactus_bottom': { const t = noisy([80, 140, 55], 0.12, rng); t.rect(0, 0, 16, 1, [0, 0, 0], 0).rect(0, 15, 16, 1, [0, 0, 0], 0).rect(0, 0, 1, 16, [0, 0, 0], 0).rect(15, 0, 1, 16, [0, 0, 0], 0); return t; }
    case 'sugar_cane': return cross(P.cane, { g: [130, 190, 90], G: [90, 140, 60] });
    case 'bamboo': { const t = new Px(); t.rect(6, 0, 4, 16, [110, 170, 60]); t.rect(6, 5, 4, 1, [80, 130, 40]).rect(6, 11, 4, 1, [80, 130, 40]); return t; }
    case 'lily_pad': { const t = new Px(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 7 && !(x > 8 && y < 7 && Math.abs(x - y - 4) < 2)) t.set(x, y, shade([40, 120, 40], 0.9 + rng() * 0.2)); } return t; }
    case 'vine': { const t = new Px(); for (let x = 0; x < 16; x += 3) { for (let y = 0; y < 16; y++) if (rng() < 0.8) t.set(x + (y % 3 === 0 ? 1 : 0), y, shade([40, 110, 40], 0.8 + rng() * 0.4)); } return t; }
    case 'seagrass': return cross(P.kelp, { g: [60, 140, 60] });
    case 'kelp': return cross(P.kelp, { g: [50, 120, 60] });
    case 'dead_coral': return cross(P.deadbush, { h: [140, 140, 130] });
    case 'moss_block': { const t = noisy([90, 130, 50], 0.15, rng); speckle(t, [70, 110, 40], 0.15, rng); return t; }
    case 'warped_nylium_top': return noisy([40, 130, 120], 0.2, rng);
    case 'warped_nylium_side': return grassSide(C.netherrack, [40, 130, 120], rng);
    case 'crimson_nylium_top': return noisy([150, 40, 50], 0.2, rng);
    case 'crimson_nylium_side': return grassSide(C.netherrack, [150, 40, 50], rng);
    case 'warped_stem': return logSide([60, 120, 120], rng);
    case 'warped_stem_top': return logTop([60, 120, 120], [80, 150, 150], rng);
    case 'crimson_stem': return logSide([120, 40, 60], rng);
    case 'crimson_stem_top': return logTop([120, 40, 60], [150, 70, 90], rng);
    case 'warped_wart_block': { const t = noisy([30, 120, 120], 0.2, rng); blobs(t, [50, 150, 150], 4, rng, 0); return t; }
    case 'nether_wart_block': { const t = noisy([120, 20, 20], 0.2, rng); blobs(t, [150, 40, 40], 4, rng, 0); return t; }
    case 'shroomlight': { const t = noisy([240, 150, 70], 0.15, rng); blobs(t, [255, 200, 120], 4, rng, 1, 0.95); return t; }
    case 'bone_block_side': { const t = noisy([225, 220, 200], 0.08, rng); t.each((x, y, p) => (x % 4 === 0) ? shade(p, 0.85) : null); return t; }
    case 'bone_block_top': { const t = noisy([225, 220, 200], 0.08, rng); t.rect(4, 4, 8, 8, [200, 195, 175]); return t; }
    case 'slime_block': { const t = new Px().fill([110, 200, 90], 150); t.rect(2, 2, 12, 12, [130, 220, 110], 170); return t; }
    case 'honey_block': { const t = new Px().fill([240, 170, 50], 200); t.rect(2, 2, 12, 12, [250, 190, 70], 220); return t; }
    case 'cake_top': { const t = noisy([240, 240, 240], 0.05, rng); blobs(t, [220, 40, 40], 5, rng, 0); return t; }
    case 'cake_side': { const t = noisy([240, 240, 240], 0.05, rng); t.rect(0, 8, 16, 8, [190, 130, 80]); t.rect(0, 0, 16, 8, [0, 0, 0], 0); t.rect(0, 8, 16, 2, [240, 240, 240]); return t; }
    case 'cake_bottom': return noisy([190, 130, 80], 0.05, rng);
    case 'note_block': case 'jukebox_side': { const t = planks([110, 75, 45], rng); t.rect(0, 0, 16, 1, [70, 45, 25]).rect(0, 15, 16, 1, [70, 45, 25]).rect(0, 0, 1, 16, [70, 45, 25]).rect(15, 0, 1, 16, [70, 45, 25]); return t; }
    case 'jukebox_top': { const t = gen('jukebox_side', rng); t.rect(4, 4, 8, 8, [40, 40, 40]); return t; }
    case 'campfire_top': { const t = new Px(); t.rect(0, 5, 16, 3, [110, 80, 45]).rect(0, 9, 16, 3, [110, 80, 45]).rect(5, 0, 3, 16, [110, 80, 45]).rect(9, 0, 3, 16, [110, 80, 45]); t.rect(6, 6, 4, 4, [255, 160, 40]); return t; }
    case 'campfire_side': { const t = new Px(); t.rect(0, 9, 16, 4, [110, 80, 45]); t.rect(0, 13, 16, 3, [60, 60, 60]); return t; }
    case 'campfire_bottom': return noisy([60, 60, 60], 0.2, rng);
    case 'scaffolding': { const t = new Px(); t.rect(0, 0, 16, 2, [200, 160, 80]).rect(0, 0, 2, 16, [180, 140, 70]).rect(14, 0, 2, 16, [180, 140, 70]); return t; }
    case 'anvil_top': { const t = noisy([60, 60, 60], 0.1, rng); t.rect(2, 4, 12, 8, [80, 80, 80]); return t; }
    case 'anvil_side': case 'anvil_base': { const t = noisy([55, 55, 55], 0.12, rng); t.rect(4, 4, 8, 6, [40, 40, 40]); return t; }
    case 'brewing_stand': { const t = new Px(); t.rect(7, 2, 2, 14, [120, 120, 120]); t.rect(6, 2, 4, 2, [255, 200, 80]); return t; }
    case 'beacon': { const t = new Px().fill([120, 200, 220], 160); t.rect(3, 3, 10, 10, [200, 240, 250], 230); return t; }
    case 'sea_lantern': { const t = noisy([190, 230, 220], 0.1, rng); t.rect(0, 0, 16, 1, [140, 190, 180]).rect(0, 15, 16, 1, [140, 190, 180]).rect(0, 0, 1, 16, [140, 190, 180]).rect(15, 0, 1, 16, [140, 190, 180]).rect(6, 6, 4, 4, [240, 255, 250]); return t; }
    case 'lantern': { const t = new Px(); t.rect(5, 7, 6, 9, [40, 40, 45]); t.rect(6, 9, 4, 5, [255, 200, 90]); t.rect(7, 5, 2, 2, [40, 40, 45]); return t; }
    case 'end_rod': { const t = new Px(); t.rect(6, 0, 4, 16, [240, 230, 220]); t.rect(6, 12, 4, 4, [200, 150, 180]); return t; }
    case 'chorus_plant': return noisy([100, 70, 110], 0.15, rng);
    case 'dragon_egg': { const t = noisy([15, 10, 20], 0.5, rng); blobs(t, [90, 30, 110], 3, rng, 0); return t; }
    case 'iron_bars': { const t = new Px(); t.rect(7, 0, 2, 16, [120, 120, 120]); t.rect(0, 0, 16, 1, [120, 120, 120]).rect(0, 15, 16, 1, [120, 120, 120]).rect(0, 7, 16, 2, [120, 120, 120]); return t; }
    case 'terracotta': return noisy([150, 90, 65], 0.1, rng);
    case 'lava_cauldron': return gen('lava', rng);
    case 'glass_pane': return gen('glass', rng);
    case 'oxidized': return noisy([80, 160, 130], 0.1, rng);
  }
  // items
  return genItem(name, rng);
}

function genItem(name, rng) {
  for (const [mat, c] of Object.entries(TOOL_COLORS)) {
    for (const type of ['sword', 'pickaxe', 'axe', 'shovel', 'hoe']) if (name === `${mat}_${type}`) return pix(T[type], { M: c, m: shade(c, 0.6), h: C.wood, H: C.wood });
  }
  for (const [mat, c] of Object.entries(ARMOR_COLORS)) {
    for (const slot of ['helmet', 'chestplate', 'leggings', 'boots']) if (name === `${mat}_${slot}`) return pix(T[slot], { M: c, m: shade(c, 0.6) });
  }
  const gem = (c) => pix(T.gem, { M: c, m: shade(c, 0.6), L: mix(c, [255, 255, 255], 0.5) });
  const ingot = (c) => pix(T.ingot, { M: c, m: shade(c, 0.6) });
  const round = (c) => pix(T.round, { M: c, m: shade(c, 0.6), L: mix(c, [255, 255, 255], 0.4) });
  const meat = (c, cooked) => pix(T.meat, { M: c, m: shade(c, 0.6), L: cooked ? shade(c, 1.2) : [230, 170, 170], h: [220, 220, 200] });
  switch (name) {
    case 'stick': return pix(T.stick, { h: C.wood });
    case 'coal': return round([40, 40, 40]);
    case 'charcoal': return round([50, 45, 40]);
    case 'raw_iron': return pix(T.raw, { M: [200, 170, 140], m: [150, 120, 100] });
    case 'raw_gold': return pix(T.raw, { M: C.gold, m: shade(C.gold, 0.6) });
    case 'raw_copper': return pix(T.raw, { M: C.copper, m: shade(C.copper, 0.6) });
    case 'iron_ingot': return ingot([220, 220, 220]);
    case 'gold_ingot': return ingot(C.gold);
    case 'copper_ingot': return ingot(C.copper);
    case 'netherite_ingot': return ingot(C.netherite);
    case 'netherite_scrap': return pix(T.raw, { M: [90, 65, 55], m: [60, 45, 40] });
    case 'iron_nugget': return pix(T.nugget, { M: [220, 220, 220], m: [150, 150, 150] });
    case 'gold_nugget': return pix(T.nugget, { M: C.gold, m: shade(C.gold, 0.6) });
    case 'diamond': return gem(C.diamond);
    case 'emerald': return gem(C.emerald);
    case 'quartz': return gem(C.quartz);
    case 'amethyst_shard': return gem([170, 110, 220]);
    case 'echo_shard': return gem([30, 60, 70]);
    case 'prismarine_shard': return gem([100, 170, 160]);
    case 'prismarine_crystals': return pix(T.dust, { M: [200, 230, 220] });
    case 'redstone': return pix(T.dust, { M: C.redstone });
    case 'glowstone_dust': return pix(T.dust, { M: C.glow });
    case 'sugar': return pix(T.dust, { M: [240, 240, 240] });
    case 'blaze_powder': return pix(T.dust, { M: [250, 170, 40] });
    case 'bone_meal': return pix(T.dust, { M: [230, 230, 220] });
    case 'gunpowder': return pix(T.dust, { M: [70, 70, 70] });
    case 'lapis_lazuli': return round(C.lapis);
    case 'flint': return pix(T.gem, { M: [60, 60, 60], m: [30, 30, 30], L: [90, 90, 90] });
    case 'string': return pix(T.string, { M: [230, 230, 230] });
    case 'feather': return pix(T.feather, { M: [240, 240, 240], h: [180, 180, 180] });
    case 'leather': return pix(T.paper, { M: [170, 110, 60], m: [130, 80, 40] });
    case 'rabbit_hide': return pix(T.paper, { M: [180, 140, 100], m: [140, 100, 70] });
    case 'phantom_membrane': return pix(T.paper, { M: [200, 200, 210], m: [150, 150, 160] });
    case 'bone': return pix(T.bone, { M: [230, 230, 220] });
    case 'spider_eye': return round([150, 30, 40]);
    case 'ender_pearl': return round([30, 90, 80]);
    case 'ender_eye': return round([60, 160, 120]);
    case 'blaze_rod': return pix(T.rod, { M: [250, 190, 60] });
    case 'slime_ball': return round([110, 200, 90]);
    case 'magma_cream': return round([230, 150, 60]);
    case 'ghast_tear': return gem([220, 230, 240]);
    case 'nether_star': return pix(T.gem, { M: [250, 250, 230], m: [200, 200, 180], L: [255, 255, 255] });
    case 'dragon_breath': return pix(T.bottle, { h: [200, 200, 220], M: [230, 230, 250], L: [200, 100, 230] });
    case 'clay_ball': return round([160, 165, 175]);
    case 'brick': return ingot([150, 80, 65]);
    case 'nether_brick': return ingot([45, 22, 27]);
    case 'paper': return pix(T.paper, { M: [240, 240, 240], m: [200, 200, 200] });
    case 'map': return pix(T.paper, { M: [220, 200, 160], m: [90, 140, 60] });
    case 'book': return pix(T.book, { M: [130, 80, 50], h: [240, 235, 220] });
    case 'writable_book': return pix(T.book, { M: [90, 70, 50], h: [240, 235, 220] });
    case 'enchanted_book': return pix(T.book, { M: [180, 60, 60], h: [240, 235, 220] });
    case 'egg': return pix(T.egg, { M: [240, 230, 200], m: [200, 190, 160], L: [255, 250, 240] });
    case 'wheat': return pix(T.wheat, { g: [200, 170, 80], h: [150, 120, 60] });
    case 'wheat_seeds': return pix(T.seeds, { M: [90, 160, 50] });
    case 'melon_seeds': return pix(T.seeds, { M: [40, 40, 40] });
    case 'pumpkin_seeds': return pix(T.seeds, { M: [230, 220, 180] });
    case 'beetroot_seeds': return pix(T.seeds, { M: [140, 60, 60] });
    case 'nether_wart': return round([160, 30, 40]);
    case 'sugar_cane': return gen('sugar_cane', rng) || cross(P.cane, { g: [130, 190, 90], G: [90, 140, 60] });
    case 'kelp': return cross(P.kelp, { g: [50, 120, 60] });
    case 'bowl': return pix(T.bowl, { M: [140, 100, 60], L: [110, 80, 45] });
    case 'mushroom_stew': return pix(T.bowl, { M: [140, 100, 60], L: [200, 150, 110] });
    case 'rabbit_stew': return pix(T.bowl, { M: [140, 100, 60], L: [190, 120, 70] });
    case 'beetroot_soup': return pix(T.bowl, { M: [140, 100, 60], L: [170, 50, 60] });
    case 'ink_sac': return round([30, 30, 40]);
    case 'glass_bottle': return pix(T.bottle, { h: [200, 210, 220], M: [230, 240, 250], L: [230, 240, 250] });
    case 'honey_bottle': return pix(T.bottle, { h: [200, 210, 220], M: [230, 240, 250], L: [240, 170, 50] });
    case 'honeycomb': return pix(T.round, { M: [240, 170, 50], m: [200, 130, 30], L: [250, 200, 90] });
    case 'nautilus_shell': return round([220, 200, 180]);
    case 'heart_of_the_sea': return round([40, 90, 140]);
    case 'scute': return round([80, 150, 90]);
    case 'name_tag': return pix(T.paper, { M: [200, 200, 200], m: [120, 120, 120] });
    case 'saddle': return pix(T.leggings, { M: [140, 90, 50], m: [100, 60, 30] });
    case 'lead': return pix(T.string, { M: [170, 120, 70] });
    case 'music_disc': return round([30, 30, 30]);
    case 'painting': return pix(T.book, { M: [120, 80, 50], h: [90, 150, 200] });
    case 'item_frame': return pix(T.book, { M: [120, 80, 50], h: [180, 150, 100] });
    case 'armor_stand': return pix(T.stick, { h: [180, 150, 100] });
    case 'snowball': return round([240, 245, 250]);
    case 'shears': return pix(T.shears, { M: [200, 200, 200], h: [140, 90, 50] });
    case 'flint_and_steel': return pix(T.fns, { M: [60, 60, 60], h: [200, 200, 200] });
    case 'bow': return pix(T.bow, { h: C.wood });
    case 'fishing_rod': return pix(T.bow, { h: C.wood });
    case 'arrow': return pix(T.arrow, { M: [200, 200, 200], h: C.wood, f: [240, 240, 240] });
    case 'shield': return pix(T.shield, { M: [140, 100, 60], h: [120, 120, 130] });
    case 'bucket': return pix(T.bucket, { M: [200, 200, 200], L: [200, 200, 200] });
    case 'water_bucket': return pix(T.bucket, { M: [200, 200, 200], L: C.water });
    case 'lava_bucket': return pix(T.bucket, { M: [200, 200, 200], L: C.lava });
    case 'milk_bucket': return pix(T.bucket, { M: [200, 200, 200], L: [250, 250, 250] });
    case 'compass': return pix(T.compass, { h: [120, 120, 120], M: [200, 200, 200], L: [220, 40, 40], m: [230, 230, 230] });
    case 'clock': return pix(T.compass, { h: [170, 140, 40], M: [230, 200, 80], L: [40, 40, 40], m: [100, 150, 220] });
    case 'spyglass': return pix(T.rod, { M: [180, 140, 60] });
    case 'totem_of_undying': return pix(T.totem, { M: [230, 200, 80], L: [40, 200, 90], h: [80, 160, 70] });
    case 'elytra': return pix(T.chestplate, { M: [90, 90, 100], m: [60, 60, 70] });
    case 'turtle_helmet': return pix(T.helmet, { M: [80, 150, 90], m: [50, 100, 60] });
    case 'firework_rocket': return pix(T.rocket, { h: [220, 220, 220], M: [200, 60, 60], L: [140, 100, 60] });
    case 'redstone_torch': return pix(T.stick, { h: C.wood });
    case 'lever': return pix(T.stick, { h: [120, 120, 120] });
    case 'repeater': return pix(T.ingot, { M: [150, 150, 150], m: [100, 100, 100] });
    case 'apple': return pix(T.apple, { M: [220, 40, 40], L: [250, 130, 130], h: [90, 60, 30] });
    case 'golden_apple': case 'enchanted_golden_apple': return pix(T.apple, { M: C.gold, L: [255, 250, 180], h: [90, 60, 30] });
    case 'bread': return pix(T.bread, { M: [200, 150, 80], m: [150, 100, 50] });
    case 'cookie': return pix(T.cookie, { M: [200, 150, 90], m: [90, 60, 40] });
    case 'melon_slice': return pix(T.melon, { M: [220, 60, 60], L: [250, 120, 120], h: [80, 150, 40] });
    case 'carrot': return pix(T.carrot, { M: [230, 120, 30], g: [70, 150, 40] });
    case 'golden_carrot': return pix(T.carrot, { M: C.gold, g: [70, 150, 40] });
    case 'potato': case 'poisonous_potato': return pix(T.potato, { M: name.startsWith('p') && name !== 'potato' ? [170, 190, 100] : [200, 170, 110], m: [150, 120, 70] });
    case 'baked_potato': return pix(T.potato, { M: [190, 150, 80], m: [130, 100, 50] });
    case 'beetroot': return pix(T.potato, { M: [150, 40, 60], m: [100, 20, 40] });
    case 'beef': return meat([200, 70, 70], false);
    case 'cooked_beef': return meat([120, 70, 40], true);
    case 'porkchop': return meat([240, 150, 150], false);
    case 'cooked_porkchop': return meat([200, 140, 90], true);
    case 'chicken': return meat([240, 200, 190], false);
    case 'cooked_chicken': return meat([200, 130, 70], true);
    case 'mutton': return meat([220, 90, 90], false);
    case 'cooked_mutton': return meat([150, 90, 50], true);
    case 'rabbit': return meat([230, 160, 150], false);
    case 'cooked_rabbit': return meat([180, 110, 60], true);
    case 'rotten_flesh': return meat([120, 90, 60], false);
    case 'cod': return pix(T.fish, { M: [170, 150, 120], m: [120, 100, 80], L: [220, 200, 170] });
    case 'salmon': return pix(T.fish, { M: [200, 90, 80], m: [140, 60, 50], L: [240, 150, 140] });
    case 'cooked_cod': return pix(T.fish, { M: [200, 170, 120], m: [150, 120, 80], L: [230, 210, 170] });
    case 'cooked_salmon': return pix(T.fish, { M: [220, 130, 90], m: [160, 90, 60], L: [240, 180, 150] });
    case 'tropical_fish': return pix(T.fish, { M: [240, 140, 40], m: [200, 100, 20], L: [250, 250, 250] });
    case 'pufferfish': return pix(T.fish, { M: [230, 200, 60], m: [180, 150, 40], L: [250, 240, 200] });
    case 'pumpkin_pie': return pix(T.pie, { h: [200, 160, 100], M: [230, 150, 50], L: [250, 200, 120] });
    case 'dried_kelp': return pix(T.paper, { M: [50, 80, 40], m: [30, 60, 30] });
    case 'sweet_berries': return pix(T.seeds, { M: [200, 30, 50] });
    case 'glow_berries': return pix(T.seeds, { M: [250, 190, 60] });
    case 'chorus_fruit': return round([120, 80, 130]);
  }
  return null;
}

// ---------- atlas ----------
export let atlasCanvas = null;
const tileIndex = new Map(); // name -> index
let nextTile = 0;

export function tileFor(name) {
  if (tileIndex.has(name)) return tileIndex.get(name);
  const idx = nextTile++;
  if (idx >= ATLAS_TILES * ATLAS_TILES) throw new Error('Atlas full');
  tileIndex.set(name, idx);
  if (atlasCanvas) blit(name, idx);
  return idx;
}
function blit(name, idx) {
  const t = generateTile(name);
  const ctx = atlasCanvas.getContext('2d');
  const img = new ImageData(t.d, TILE, TILE);
  ctx.putImageData(img, (idx % ATLAS_TILES) * TILE, Math.floor(idx / ATLAS_TILES) * TILE);
}
export function tileUV(idx) {
  const u = (idx % ATLAS_TILES) / ATLAS_TILES, v = Math.floor(idx / ATLAS_TILES) / ATLAS_TILES;
  return [u, v];
}

// Resolve the texture name for a block face. faces: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z
const FACING_TO_FACE = [4, 1, 5, 0];
export function faceTexName(def, meta, face) {
  let tex = def.tex;
  if (typeof tex === 'function') tex = tex(meta);
  if (typeof tex === 'string') return tex;
  if (face === 2 && tex.top) return tex.top;
  if (face === 3 && tex.bottom) return tex.bottom;
  if (tex.front !== undefined && tex.facing !== undefined && FACING_TO_FACE[tex.facing] === face) return tex.front;
  const named = [tex.east, tex.west, tex.top, tex.bottom, tex.south, tex.north][face];
  if (named) return named;
  return tex.side || tex.top || def.name;
}

export function buildAtlas() {
  atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = ATLAS_SIZE; atlasCanvas.height = ATLAS_SIZE;
  // pre-register all block faces and items so the atlas is complete before meshing
  for (const def of BLOCKS) {
    if (def.render === 'none') continue;
    const metas = typeof def.tex === 'function' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] : [0];
    for (const m of metas) for (let f = 0; f < 6; f++) tileFor(faceTexName(def, m, f));
  }
  for (const def of ITEMS.values()) tileFor(def.tex);
  for (const name of ['destroy_0', 'destroy_1', 'destroy_2', 'destroy_3', 'destroy_4', 'destroy_5', 'destroy_6', 'destroy_7', 'destroy_8', 'destroy_9']) tileFor(name);
  for (const [name, idx] of tileIndex) blit(name, idx);
  return atlasCanvas;
}

// Break-progress overlay textures
for (let i = 0; i < 10; i++) {
  const n = `destroy_${i}`;
  const rng = mulberry32(1234 + i);
  const t = new Px();
  const count = (i + 1) * 4;
  for (let c = 0; c < count; c++) {
    let x = Math.floor(rng() * 16), y = Math.floor(rng() * 16);
    for (let j = 0; j < 4 + i; j++) { t.set(x, y, [20, 20, 20], 160); x += rng() < 0.5 ? 1 : -1; y += rng() < 0.5 ? 1 : 0; }
  }
  cache.set(n, t);
}

// ---------- item icons ----------
const iconCache = new Map();
export function itemIcon(id, meta = 0) {
  const key = id + ':' + meta;
  if (iconCache.has(key)) return iconCache.get(key);
  const def = getItem(id);
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  if (!def) return cv;
  const tileImg = (name) => { const t = generateTile(name); const c = document.createElement('canvas'); c.width = 16; c.height = 16; c.getContext('2d').putImageData(new ImageData(t.d, 16, 16), 0, 0); return c; };
  if (id < ITEM_ID_BASE && (def.render === 'cube' || def.render === 'box' || def.render === 'fluid')) {
    let m = meta;
    if (def.door) m = 0;
    const top = tileImg(faceTexName(def, m, 2)), left = tileImg(faceTexName(def, m, 5)), right = tileImg(faceTexName(def, m, 0));
    // isometric cube: top, left (dark), right (darker)
    const s = 14, h = s * 0.5;
    ctx.save(); ctx.translate(16, 3);
    // top
    ctx.save(); ctx.transform(1, 0.5, -1, 0.5, 0, 0); ctx.drawImage(top, 0, 0, 16, 16, 0, 0, s, s); ctx.restore();
    // left
    ctx.save(); ctx.transform(1, 0.5, 0, 1, -s, h); ctx.drawImage(left, 0, 0, 16, 16, 0, 0, s, s); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, s, s); ctx.restore();
    // right
    ctx.save(); ctx.transform(1, -0.5, 0, 1, 0, s); ctx.drawImage(right, 0, 0, 16, 16, 0, 0, s, s); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, s, s); ctx.restore();
    ctx.restore();
    if (def.slab) { ctx.clearRect(0, 0, 32, 32); const t = tileImg(faceTexName(def, 0, 2)); ctx.save(); ctx.translate(16, 9); ctx.transform(1, 0.5, -1, 0.5, 0, 0); ctx.drawImage(t, 0, 0, 16, 16, 0, 0, s, s); ctx.restore(); ctx.save(); ctx.translate(16, 9); ctx.transform(1, 0.5, 0, 1, -s, h); ctx.drawImage(t, 0, 0, 16, 8, 0, 0, s, s / 2); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, s, s / 2); ctx.restore(); ctx.save(); ctx.translate(16, 9); ctx.transform(1, -0.5, 0, 1, 0, s); ctx.drawImage(t, 0, 0, 16, 8, 0, 0, s, s / 2); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, s, s / 2); ctx.restore(); }
  } else {
    let name = def.tex; if (typeof name === 'function') name = name(meta); if (typeof name === 'object') name = name.side || name.top;
    if (def.render === 'cross' || def.render === 'box') name = faceTexName(def, meta, 4);
    const img = tileImg(name);
    ctx.drawImage(img, 0, 0, 16, 16, 2, 2, 28, 28);
    if (def.spawnEgg) { // tint spawn egg by mob
      const col = { zombie: '#4a7a3a', skeleton: '#c8c8c8', creeper: '#2f9b2f', spider: '#3a2a20', enderman: '#151515', cow: '#4a3a2a', pig: '#f0a0a0', sheep: '#e8e8e8', chicken: '#f0f0f0', wolf: '#c0c0c0', villager: '#b08060', zombified_piglin: '#e09090', ghast: '#f0f0f0', slime: '#70c060', witch: '#402060', blaze: '#f0a020', iron_golem: '#d0d0d0', horse: '#b08040', cat: '#e0b060', bee: '#f0d030', phantom: '#405070', drowned: '#508080', husk: '#a09060', stray: '#a0b0c0' }[def.spawnEgg] || '#888';
      ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = col; ctx.globalAlpha = 0.7; ctx.fillRect(0, 0, 32, 32); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
  iconCache.set(key, cv);
  return cv;
}
