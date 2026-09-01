// Block registry. Block ids are stable (they are used in save files); append only.
// Chunks store block ids as Uint16, so up to 1024 block types are supported.
// Faces: 0=+x east, 1=-x west, 2=+y top, 3=-y bottom, 4=+z south, 5=-z north

export const BLOCKS = [];
export const B = {}; // name -> id

export const FULL_BOX = [[0, 0, 0, 1, 1, 1]];
const NONE = [];

export const TIER = { WOOD: 0, STONE: 1, IRON: 2, DIAMOND: 3, NETHERITE: 4 };

function reg(name, props) {
  const id = BLOCKS.length;
  const def = Object.assign({
    id, name,
    displayName: name.split('_').map(s => s[0].toUpperCase() + s.slice(1)).join(' '),
    tex: name,
    render: 'cube',        // cube | box | cross | fluid | none
    solid: true,           // has collision
    opaque: true,          // full opaque cube: culls neighbours & blocks light
    cutout: false,         // alpha-tested texture
    translucent: false,    // alpha-blended (separate pass)
    cullSame: false,       // cull faces between two blocks of same id
    light: 0,              // emitted light
    lightBlock: null,      // light attenuation (defaults: opaque 15, else 0)
    hardness: 1,
    tool: null,            // pickaxe | axe | shovel | hoe | sword | shears
    minTier: 0,
    needsTool: false,      // no drops without a proper tool
    shape: null,           // (meta, ctx) => boxes  (null => FULL_BOX for solid)
    drops: null,           // (meta, tool, rand) => [{id,count}]
    replaceable: false,
    gravity: false,
    flammable: 0,
    sound: 'stone',
    stack: 64,
    hidden: false,         // hide from creative inventory
    randomTick: false,
    tab: 'building',
  }, props);
  if (def.lightBlock == null) def.lightBlock = def.opaque ? 15 : 0;
  if (def.render !== 'cube') def.opaque = false;
  if (!def.shape) def.shape = def.solid ? (() => FULL_BOX) : (() => NONE);
  BLOCKS.push(def);
  B[name] = id;
  return def;
}

export function getBlock(id) { return BLOCKS[id] || BLOCKS[0]; }
export function blockShape(id, meta, ctx) { const d = BLOCKS[id]; return d ? d.shape(meta, ctx) : NONE; }

// ---------- shape helpers ----------
export function slabShape(meta) {
  if (meta === 2) return FULL_BOX;
  return meta === 1 ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]];
}
export function stairShape(meta) {
  const f = meta & 3, up = (meta & 4) !== 0;
  const base = up ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
  const y0 = up ? 0 : 0.5, y1 = up ? 0.5 : 1;
  let step;
  if (f === 0) step = [0, y0, 0.5, 1, y1, 1];
  else if (f === 2) step = [0, y0, 0, 1, y1, 0.5];
  else if (f === 3) step = [0.5, y0, 0, 1, y1, 1];
  else step = [0, y0, 0, 0.5, y1, 1];
  return [base, step];
}
const TORCH_SHAPES = [
  [[7 / 16, 0, 7 / 16, 9 / 16, 10 / 16, 9 / 16]],
  [[0, 3 / 16, 7 / 16, 3 / 16, 13 / 16, 9 / 16]],           // on west wall (attached to -x)
  [[13 / 16, 3 / 16, 7 / 16, 1, 13 / 16, 9 / 16]],          // attached to +x
  [[7 / 16, 3 / 16, 0, 9 / 16, 13 / 16, 3 / 16]],           // attached to -z
  [[7 / 16, 3 / 16, 13 / 16, 9 / 16, 13 / 16, 1]],          // attached to +z
];
export function torchShape(meta) { return TORCH_SHAPES[meta & 7] || TORCH_SHAPES[0]; }
export function doorShape(meta) {
  const f = meta & 3, open = (meta & 4) !== 0;
  const t = 3 / 16;
  // facing = direction the door faces when closed (the wall it is in is perpendicular)
  // closed: door slab on the far side relative to facing. open: rotate 90deg (hinge on left).
  const dir = open ? (f + 1) & 3 : f;
  switch (dir) {
    case 0: return [[0, 0, 0, 1, 1, t]];        // facing +z: slab at -z edge
    case 1: return [[1 - t, 0, 0, 1, 1, 1]];    // facing -x: slab at +x edge
    case 2: return [[0, 0, 1 - t, 1, 1, 1]];    // facing -z
    default: return [[0, 0, 0, t, 1, 1]];       // facing +x
  }
}
export function ladderShape(meta) {
  const t = 2 / 16;
  switch (meta & 3) {
    case 0: return [[0, 0, 0, 1, 1, t]];        // on -z wall
    case 1: return [[1 - t, 0, 0, 1, 1, 1]];
    case 2: return [[0, 0, 1 - t, 1, 1, 1]];
    default: return [[0, 0, 0, t, 1, 1]];
  }
}
export function fenceShape(meta, ctx) {
  const boxes = [[6 / 16, 0, 6 / 16, 10 / 16, 1.5, 10 / 16]];
  if (!ctx) return boxes;
  const connects = (id) => { const d = BLOCKS[id]; return d && (d.opaque || d.fence); };
  if (connects(ctx.get(1, 0, 0))) boxes.push([10 / 16, 6 / 16, 7 / 16, 1, 15 / 16, 9 / 16]);
  if (connects(ctx.get(-1, 0, 0))) boxes.push([0, 6 / 16, 7 / 16, 6 / 16, 15 / 16, 9 / 16]);
  if (connects(ctx.get(0, 0, 1))) boxes.push([7 / 16, 6 / 16, 10 / 16, 9 / 16, 15 / 16, 1]);
  if (connects(ctx.get(0, 0, -1))) boxes.push([7 / 16, 6 / 16, 0, 9 / 16, 15 / 16, 6 / 16]);
  return boxes;
}
export function fenceRenderShape(meta, ctx) {
  // same as collision but post only 1 high
  const boxes = fenceShape(meta, ctx);
  boxes[0] = [6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16];
  return boxes;
}
const SNOW_SHAPES = []; for (let i = 0; i < 8; i++) SNOW_SHAPES.push([[0, 0, 0, 1, (i + 1) / 8, 1]]);

// ---------- registry ----------
reg('air', { render: 'none', solid: false, opaque: false, replaceable: true, hidden: true, hardness: 0 });
reg('stone', { hardness: 1.5, tool: 'pickaxe', needsTool: true, drops: () => [{ id: B.cobblestone, count: 1 }] });
reg('granite', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('diorite', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('andesite', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('deepslate', { hardness: 3, tool: 'pickaxe', needsTool: true, drops: () => [{ id: B.cobbled_deepslate, count: 1 }] });
reg('cobbled_deepslate', { hardness: 3.5, tool: 'pickaxe', needsTool: true });
reg('grass_block', { tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', drops: () => [{ id: B.dirt, count: 1 }], randomTick: true });
reg('dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel' });
reg('coarse_dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel' });
reg('podzol', { tex: { top: 'podzol_top', bottom: 'dirt', side: 'podzol_side' }, hardness: 0.5, tool: 'shovel', sound: 'gravel', drops: () => [{ id: B.dirt, count: 1 }] });
reg('cobblestone', { hardness: 2, tool: 'pickaxe', needsTool: true });
reg('mossy_cobblestone', { hardness: 2, tool: 'pickaxe', needsTool: true });
reg('bedrock', { hardness: -1, hidden: false, tab: 'building' });
reg('sand', { hardness: 0.5, tool: 'shovel', gravity: true, sound: 'sand' });
reg('red_sand', { hardness: 0.5, tool: 'shovel', gravity: true, sound: 'sand' });
reg('gravel', { hardness: 0.6, tool: 'shovel', gravity: true, sound: 'gravel', drops: (m, t, r) => [{ id: r() < 0.1 ? 'flint' : B.gravel, count: 1 }] });
reg('sandstone', { tex: { top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone' }, hardness: 0.8, tool: 'pickaxe', needsTool: true });
reg('red_sandstone', { tex: { top: 'red_sandstone_top', bottom: 'red_sandstone_top', side: 'red_sandstone' }, hardness: 0.8, tool: 'pickaxe', needsTool: true });
reg('clay', { hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: () => [{ id: 'clay_ball', count: 4 }] });
reg('snow_block', { hardness: 0.2, tool: 'shovel', needsTool: true, sound: 'snow', drops: () => [{ id: 'snowball', count: 4 }] });
reg('snow', { displayName: 'Snow Layer', render: 'box', opaque: false, solid: true, hardness: 0.1, tool: 'shovel', needsTool: true, sound: 'snow', replaceable: true,
  shape: (m) => SNOW_SHAPES[m & 7], drops: (m) => [{ id: 'snowball', count: (m & 7) + 1 }] });
reg('ice', { translucent: true, cullSame: true, opaque: false, lightBlock: 2, hardness: 0.5, tool: 'pickaxe', drops: () => [], slippery: true });
reg('packed_ice', { hardness: 0.5, tool: 'pickaxe', drops: () => [], slippery: true });
reg('obsidian', { hardness: 50, tool: 'pickaxe', minTier: 3, needsTool: true });
reg('water', { render: 'fluid', solid: false, opaque: false, translucent: true, cullSame: true, lightBlock: 2, replaceable: true, hardness: 100, fluid: true, tab: 'misc', hidden: true, sound: 'water' });
reg('lava', { render: 'fluid', solid: false, opaque: false, cullSame: true, light: 15, replaceable: true, hardness: 100, fluid: true, lava: true, tab: 'misc', hidden: true, sound: 'water' });
reg('netherrack', { hardness: 0.4, tool: 'pickaxe', needsTool: true });
reg('soul_sand', { hardness: 0.5, tool: 'shovel', sound: 'sand', shape: () => [[0, 0, 0, 1, 7 / 8, 1]], render: 'box', slow: true });
reg('glowstone', { light: 15, hardness: 0.3, tool: 'pickaxe', sound: 'glass', drops: (m, t, r) => [{ id: 'glowstone_dust', count: 2 + Math.floor(r() * 3) }] });
reg('nether_bricks', { hardness: 2, tool: 'pickaxe', needsTool: true });
reg('magma_block', { light: 3, hardness: 0.5, tool: 'pickaxe', needsTool: true, damage: true });
reg('end_stone', { hardness: 3, tool: 'pickaxe', needsTool: true });
reg('basalt', { tex: { top: 'basalt_top', bottom: 'basalt_top', side: 'basalt' }, hardness: 1.25, tool: 'pickaxe', needsTool: true });
reg('blackstone', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('nether_portal', { render: 'box', solid: false, opaque: false, translucent: true, light: 11, hardness: -1, hidden: true, tab: 'misc',
  shape: (m) => (m & 1) ? [[6 / 16, 0, 0, 10 / 16, 1, 1]] : [[0, 0, 6 / 16, 1, 1, 10 / 16]], drops: () => [], sound: 'glass' });

// ores
const ore = (name, drop, tier, xp) => reg(name, { hardness: 3, tool: 'pickaxe', needsTool: true, minTier: tier, xp, drops: drop });
ore('coal_ore', () => [{ id: 'coal', count: 1 }], 0, 1);
ore('iron_ore', () => [{ id: 'raw_iron', count: 1 }], 1, 0);
ore('copper_ore', (m, t, r) => [{ id: 'raw_copper', count: 2 + Math.floor(r() * 3) }], 1, 0);
ore('gold_ore', () => [{ id: 'raw_gold', count: 1 }], 2, 0);
ore('redstone_ore', (m, t, r) => [{ id: 'redstone', count: 4 + Math.floor(r() * 2) }], 2, 3);
ore('lapis_ore', (m, t, r) => [{ id: 'lapis_lazuli', count: 4 + Math.floor(r() * 5) }], 1, 3);
ore('diamond_ore', () => [{ id: 'diamond', count: 1 }], 2, 5);
ore('emerald_ore', () => [{ id: 'emerald', count: 1 }], 2, 5);
ore('nether_gold_ore', (m, t, r) => [{ id: 'gold_nugget', count: 2 + Math.floor(r() * 5) }], 0, 1);
ore('nether_quartz_ore', () => [{ id: 'quartz', count: 1 }], 0, 2);
ore('ancient_debris', () => [{ id: B.ancient_debris, count: 1 }], 3, 0);

// wood types
export const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'];
for (const w of WOODS) {
  reg(`${w}_log`, { tex: (m) => { const a = m & 3, s = `${w}_log`, t = `${w}_log_top`;
    if (a === 1) return { east: t, west: t, top: s, bottom: s, north: s, south: s, rot: 1 };
    if (a === 2) return { north: t, south: t, top: s, bottom: s, east: s, west: s, rot: 2 };
    return { top: t, bottom: t, side: s }; }, hardness: 2, tool: 'axe', sound: 'wood', flammable: 5, axisPlace: true, tab: 'building' });
  reg(`${w}_planks`, { hardness: 2, tool: 'axe', sound: 'wood', flammable: 20, fuel: 300 });
  reg(`${w}_leaves`, { cutout: true, opaque: false, lightBlock: 1, hardness: 0.2, tool: 'shears', sound: 'grass', flammable: 60, randomTick: true, tab: 'nature', leaves: true, wood: w,
    drops: (m, tool, r) => { if (tool === 'shears') return [{ id: B[`${w}_leaves`], count: 1 }];
      const out = []; if (r() < 0.05) out.push({ id: B[`${w}_sapling`], count: 1 }); if (w === 'oak' && r() < 0.005) out.push({ id: 'apple', count: 1 }); if (r() < 0.02) out.push({ id: 'stick', count: 1 }); return out; } });
  reg(`${w}_sapling`, { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', randomTick: true, tab: 'nature', sapling: w, needsSoil: true, flammable: 10 });
  reg(`${w}_stairs`, { render: 'box', opaque: false, tex: `${w}_planks`, hardness: 2, tool: 'axe', sound: 'wood', shape: stairShape, stairs: true, flammable: 20, fuel: 300 });
  reg(`${w}_slab`, { render: 'box', opaque: false, tex: `${w}_planks`, hardness: 2, tool: 'axe', sound: 'wood', shape: slabShape, slab: true, flammable: 20, fuel: 150,
    drops: (m) => [{ id: B[`${w}_slab`], count: m === 2 ? 2 : 1 }] });
  reg(`${w}_fence`, { render: 'box', opaque: false, tex: `${w}_planks`, hardness: 2, tool: 'axe', sound: 'wood', shape: fenceShape, renderShape: fenceRenderShape, fence: true, flammable: 20, fuel: 300 });
  reg(`${w}_door`, { render: 'box', opaque: false, cutout: true, tex: (m) => (m & 8) ? `${w}_door_top` : `${w}_door_bottom`, hardness: 3, tool: 'axe', sound: 'wood', shape: doorShape, door: true, tab: 'redstone', stack: 64,
    drops: (m) => (m & 8) ? [] : [{ id: B[`${w}_door`], count: 1 }] });
}
// stone-ish decorative
reg('stone_bricks', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('mossy_stone_bricks', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('cracked_stone_bricks', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('bricks', { hardness: 2, tool: 'pickaxe', needsTool: true });
reg('smooth_stone', { hardness: 2, tool: 'pickaxe', needsTool: true });
reg('quartz_block', { hardness: 0.8, tool: 'pickaxe', needsTool: true });
reg('cobblestone_stairs', { render: 'box', opaque: false, tex: 'cobblestone', hardness: 2, tool: 'pickaxe', needsTool: true, shape: stairShape, stairs: true });
reg('cobblestone_slab', { render: 'box', opaque: false, tex: 'cobblestone', hardness: 2, tool: 'pickaxe', needsTool: true, shape: slabShape, slab: true, drops: (m) => [{ id: B.cobblestone_slab, count: m === 2 ? 2 : 1 }] });
reg('stone_brick_stairs', { render: 'box', opaque: false, tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', needsTool: true, shape: stairShape, stairs: true });
reg('stone_brick_slab', { render: 'box', opaque: false, tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', needsTool: true, shape: slabShape, slab: true, drops: (m) => [{ id: B.stone_brick_slab, count: m === 2 ? 2 : 1 }] });
reg('stone_slab', { render: 'box', opaque: false, tex: 'smooth_stone', hardness: 2, tool: 'pickaxe', needsTool: true, shape: slabShape, slab: true, drops: (m) => [{ id: B.stone_slab, count: m === 2 ? 2 : 1 }] });
reg('sandstone_stairs', { render: 'box', opaque: false, tex: 'sandstone', hardness: 0.8, tool: 'pickaxe', needsTool: true, shape: stairShape, stairs: true });
reg('sandstone_slab', { render: 'box', opaque: false, tex: 'sandstone', hardness: 0.8, tool: 'pickaxe', needsTool: true, shape: slabShape, slab: true, drops: (m) => [{ id: B.sandstone_slab, count: m === 2 ? 2 : 1 }] });
reg('brick_stairs', { render: 'box', opaque: false, tex: 'bricks', hardness: 2, tool: 'pickaxe', needsTool: true, shape: stairShape, stairs: true });
reg('nether_brick_stairs', { render: 'box', opaque: false, tex: 'nether_bricks', hardness: 2, tool: 'pickaxe', needsTool: true, shape: stairShape, stairs: true });
reg('cobblestone_wall', { render: 'box', opaque: false, tex: 'cobblestone', hardness: 2, tool: 'pickaxe', needsTool: true, shape: fenceShape, renderShape: fenceRenderShape, fence: true });
reg('iron_bars', { render: 'box', opaque: false, cutout: true, hardness: 5, tool: 'pickaxe', needsTool: true, shape: fenceShape, renderShape: fenceRenderShape, fence: true, sound: 'metal' });

// mineral blocks
reg('coal_block', { hardness: 5, tool: 'pickaxe', needsTool: true, fuel: 16000 });
reg('iron_block', { hardness: 5, tool: 'pickaxe', needsTool: true, minTier: 1, sound: 'metal' });
reg('copper_block', { hardness: 3, tool: 'pickaxe', needsTool: true, minTier: 1, sound: 'metal' });
reg('gold_block', { hardness: 3, tool: 'pickaxe', needsTool: true, minTier: 2, sound: 'metal' });
reg('diamond_block', { hardness: 5, tool: 'pickaxe', needsTool: true, minTier: 2, sound: 'metal' });
reg('emerald_block', { hardness: 5, tool: 'pickaxe', needsTool: true, minTier: 2, sound: 'metal' });
reg('lapis_block', { hardness: 3, tool: 'pickaxe', needsTool: true, minTier: 1 });
reg('redstone_block', { hardness: 5, tool: 'pickaxe', needsTool: true });
reg('netherite_block', { hardness: 50, tool: 'pickaxe', needsTool: true, minTier: 3, sound: 'metal' });

// functional
reg('crafting_table', { tex: { top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side', north: 'crafting_table_front', south: 'crafting_table_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', flammable: 5, fuel: 300, interact: 'crafting', tab: 'functional' });
reg('furnace', { tex: (m) => ({ top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: (m & 4) ? 'furnace_front_on' : 'furnace_front', facing: m & 3 }), hardness: 3.5, tool: 'pickaxe', needsTool: true, facingPlace: true, interact: 'furnace', light: 0, tab: 'functional', container: true,
  lightOf: (m) => (m & 4) ? 13 : 0 });
reg('chest', { render: 'box', opaque: false, tex: (m) => ({ top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front', facing: m & 3 }), hardness: 2.5, tool: 'axe', sound: 'wood', shape: () => [[1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16]], facingPlace: true, interact: 'chest', flammable: 5, fuel: 300, tab: 'functional', container: true });
reg('torch', { render: 'box', opaque: false, cutout: true, solid: false, light: 14, hardness: 0, sound: 'wood', shape: torchShape, torch: true, tab: 'functional', attaches: true });
reg('ladder', { render: 'box', opaque: false, cutout: true, solid: false, hardness: 0.4, tool: 'axe', sound: 'wood', shape: ladderShape, ladder: true, tab: 'functional', wallOnly: true, flammable: 5 });
reg('bookshelf', { tex: { top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf' }, hardness: 1.5, tool: 'axe', sound: 'wood', flammable: 30, drops: () => [{ id: 'book', count: 3 }], fuel: 300 });
reg('tnt', { tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hardness: 0, sound: 'grass', tnt: true, tab: 'redstone', flammable: 15 });
reg('glass', { cutout: true, cullSame: true, opaque: false, hardness: 0.3, sound: 'glass', drops: () => [] });
reg('glass_pane', { render: 'box', opaque: false, cutout: true, tex: 'glass', hardness: 0.3, sound: 'glass', shape: fenceShape, renderShape: (m, ctx) => {
  const boxes = [[7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16]];
  if (!ctx) return boxes; const c = (id) => { const d = BLOCKS[id]; return d && (d.opaque || d.fence || id === B.glass_pane); };
  if (c(ctx.get(1, 0, 0))) boxes.push([9 / 16, 0, 7 / 16, 1, 1, 9 / 16]); if (c(ctx.get(-1, 0, 0))) boxes.push([0, 0, 7 / 16, 7 / 16, 1, 9 / 16]);
  if (c(ctx.get(0, 0, 1))) boxes.push([7 / 16, 0, 9 / 16, 9 / 16, 1, 1]); if (c(ctx.get(0, 0, -1))) boxes.push([7 / 16, 0, 0, 9 / 16, 1, 7 / 16]); return boxes; }, fence: true, drops: () => [] });
reg('bed', { render: 'box', opaque: false, tex: (m) => ({ top: (m & 4) ? 'bed_head' : 'bed_foot', bottom: 'oak_planks', side: 'bed_side', facing: m & 3 }), hardness: 0.2, sound: 'cloth', shape: () => [[0, 0, 0, 1, 9 / 16, 1]], bed: true, interact: 'bed', tab: 'functional',
  drops: (m) => (m & 4) ? [] : [{ id: B.bed, count: 1 }] });
reg('enchanting_table', { render: 'box', opaque: false, tex: { top: 'enchanting_table_top', bottom: 'obsidian', side: 'enchanting_table_side' }, hardness: 5, tool: 'pickaxe', needsTool: true, shape: () => [[0, 0, 0, 1, 0.75, 1]], light: 7, tab: 'functional' });
reg('jack_o_lantern', { tex: (m) => ({ top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'jack_o_lantern_front', facing: m & 3 }), light: 15, hardness: 1, tool: 'axe', sound: 'wood', facingPlace: true, tab: 'functional' });
reg('lantern', { render: 'box', opaque: false, cutout: true, solid: true, light: 15, hardness: 3.5, tool: 'pickaxe', sound: 'metal', shape: () => [[5 / 16, 0, 5 / 16, 11 / 16, 9 / 16, 11 / 16]], tab: 'functional' });
reg('sea_lantern', { light: 15, hardness: 0.3, sound: 'glass', tab: 'functional' });
reg('hay_block', { tex: { top: 'hay_block_top', bottom: 'hay_block_top', side: 'hay_block_side' }, hardness: 0.5, tool: 'hoe', sound: 'grass', flammable: 60, softLanding: true });
reg('sponge', { hardness: 0.6, tool: 'hoe', sound: 'grass' });
reg('cobweb', { render: 'cross', solid: false, opaque: false, cutout: true, hardness: 4, tool: 'sword', sound: 'cloth', web: true, tab: 'nature', drops: (m, t) => t === 'shears' ? [{ id: B.cobweb, count: 1 }] : [{ id: 'string', count: 1 }] });
reg('spawner', { cutout: true, cullSame: false, opaque: false, hardness: 5, tool: 'pickaxe', needsTool: true, drops: () => [], tab: 'functional', xp: 30 });
reg('fire', { render: 'cross', solid: false, opaque: false, cutout: true, light: 15, hardness: 0, hidden: true, replaceable: true, fire: true, randomTick: true, drops: () => [], tab: 'misc', sound: 'cloth' });
reg('farmland', { render: 'box', opaque: false, tex: (m) => ({ top: (m & 7) ? 'farmland_wet' : 'farmland_dry', bottom: 'dirt', side: 'dirt' }), hardness: 0.6, tool: 'shovel', sound: 'gravel', shape: () => [[0, 0, 0, 1, 15 / 16, 1]], drops: () => [{ id: B.dirt, count: 1 }], randomTick: true, farmland: true, tab: 'nature' });
reg('dirt_path', { render: 'box', opaque: false, tex: { top: 'dirt_path_top', bottom: 'dirt', side: 'dirt_path_side' }, hardness: 0.65, tool: 'shovel', sound: 'grass', shape: () => [[0, 0, 0, 1, 15 / 16, 1]], drops: () => [{ id: B.dirt, count: 1 }], tab: 'nature' });
reg('mycelium', { tex: { top: 'mycelium_top', bottom: 'dirt', side: 'mycelium_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', drops: () => [{ id: B.dirt, count: 1 }], tab: 'nature' });

// plants
reg('short_grass', { displayName: 'Grass', render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', replaceable: true, needsSoil: true, tab: 'nature', flammable: 60,
  drops: (m, t, r) => t === 'shears' ? [{ id: B.short_grass, count: 1 }] : (r() < 0.125 ? [{ id: 'wheat_seeds', count: 1 }] : []) });
reg('fern', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', replaceable: true, needsSoil: true, tab: 'nature', flammable: 60,
  drops: (m, t, r) => t === 'shears' ? [{ id: B.fern, count: 1 }] : (r() < 0.125 ? [{ id: 'wheat_seeds', count: 1 }] : []) });
reg('dead_bush', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', replaceable: true, tab: 'nature', flammable: 100, drops: (m, t, r) => [{ id: 'stick', count: r() < 0.5 ? 1 : 2 }] });
for (const f of ['dandelion', 'poppy', 'blue_orchid', 'allium', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'tulip_red', 'tulip_orange', 'tulip_white', 'tulip_pink'])
  reg(f, { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', needsSoil: true, tab: 'nature', flower: true, flammable: 60 });
reg('brown_mushroom', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', light: 1, tab: 'nature', mushroom: true });
reg('red_mushroom', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', tab: 'nature', mushroom: true });
reg('wheat', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', hidden: true, crop: true, stages: 8, tex: (m) => `wheat_stage${Math.min(7, m & 7)}`, randomTick: true, tab: 'nature',
  drops: (m, t, r) => (m & 7) >= 7 ? [{ id: 'wheat', count: 1 }, { id: 'wheat_seeds', count: Math.floor(r() * 4) }] : [{ id: 'wheat_seeds', count: 1 }] });
reg('carrots', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', hidden: true, crop: true, stages: 8, tex: (m) => `carrots_stage${Math.min(3, (m & 7) >> 1)}`, randomTick: true, tab: 'nature',
  drops: (m, t, r) => (m & 7) >= 7 ? [{ id: 'carrot', count: 2 + Math.floor(r() * 3) }] : [{ id: 'carrot', count: 1 }] });
reg('potatoes', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', hidden: true, crop: true, stages: 8, tex: (m) => `potatoes_stage${Math.min(3, (m & 7) >> 1)}`, randomTick: true, tab: 'nature',
  drops: (m, t, r) => (m & 7) >= 7 ? [{ id: 'potato', count: 2 + Math.floor(r() * 3) }] : [{ id: 'potato', count: 1 }] });
reg('melon_stem', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', hidden: true, crop: true, stages: 8, tex: (m) => `stem_stage${Math.min(7, m & 7)}`, randomTick: true, tab: 'nature', stemFruit: 'melon', drops: (m, t, r) => r() < 0.5 ? [{ id: 'melon_seeds', count: 1 }] : [] });
reg('pumpkin_stem', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', hidden: true, crop: true, stages: 8, tex: (m) => `stem_stage${Math.min(7, m & 7)}`, randomTick: true, tab: 'nature', stemFruit: 'pumpkin', drops: (m, t, r) => r() < 0.5 ? [{ id: 'pumpkin_seeds', count: 1 }] : [] });
reg('melon', { tex: { top: 'melon_top', bottom: 'melon_top', side: 'melon_side' }, hardness: 1, tool: 'axe', sound: 'wood', tab: 'nature', drops: (m, t, r) => [{ id: 'melon_slice', count: 3 + Math.floor(r() * 5) }] });
reg('pumpkin', { tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side' }, hardness: 1, tool: 'axe', sound: 'wood', tab: 'nature' });
reg('carved_pumpkin', { tex: (m) => ({ top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'carved_pumpkin_front', facing: m & 3 }), hardness: 1, tool: 'axe', sound: 'wood', facingPlace: true, tab: 'nature' });
reg('cactus', { render: 'box', opaque: false, cutout: true, tex: { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' }, hardness: 0.4, sound: 'cloth', shape: () => [[1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16]], randomTick: true, cactus: true, damage: true, tab: 'nature' });
reg('sugar_cane', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', randomTick: true, cane: true, tab: 'nature' });
reg('lily_pad', { render: 'box', opaque: false, cutout: true, solid: true, hardness: 0, sound: 'grass', shape: () => [[0, 0, 0, 1, 1 / 16, 1]], tab: 'nature', lilypad: true });
reg('vine', { render: 'box', opaque: false, cutout: true, solid: false, hardness: 0.2, tool: 'shears', sound: 'grass', shape: ladderShape, ladder: true, tab: 'nature', wallOnly: true, flammable: 30, drops: (m, t) => t === 'shears' ? [{ id: B.vine, count: 1 }] : [] });
reg('bamboo', { render: 'box', opaque: false, cutout: true, hardness: 1, tool: 'axe', sound: 'wood', shape: () => [[6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16]], tab: 'nature', fuel: 50 });

// wool
export const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
for (const c of COLORS) reg(`${c}_wool`, { hardness: 0.8, tool: 'shears', sound: 'cloth', flammable: 30, tab: 'colored' });
for (const c of COLORS) reg(`${c}_carpet`, { render: 'box', opaque: false, tex: `${c}_wool`, hardness: 0.1, sound: 'cloth', shape: () => [[0, 0, 0, 1, 1 / 16, 1]], flammable: 60, tab: 'colored' });
for (const c of COLORS) reg(`${c}_concrete`, { hardness: 1.8, tool: 'pickaxe', needsTool: true, tab: 'colored' });
for (const c of COLORS) reg(`${c}_terracotta`, { hardness: 1.25, tool: 'pickaxe', needsTool: true, tab: 'colored' });
reg('terracotta', { hardness: 1.25, tool: 'pickaxe', needsTool: true, tab: 'colored' });
for (const c of COLORS) reg(`${c}_stained_glass`, { translucent: true, cullSame: true, opaque: false, lightBlock: 0, hardness: 0.3, sound: 'glass', drops: () => [], tab: 'colored' });

// extra natural / misc
reg('moss_block', { hardness: 0.1, tool: 'hoe', sound: 'grass', tab: 'nature' });
reg('tuff', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('calcite', { hardness: 0.75, tool: 'pickaxe', needsTool: true });
reg('dripstone_block', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('amethyst_block', { hardness: 1.5, tool: 'pickaxe', needsTool: true, sound: 'glass', light: 0 });
reg('prismarine', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('dark_prismarine', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('purpur_block', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('crying_obsidian', { light: 10, hardness: 50, tool: 'pickaxe', minTier: 3, needsTool: true });
reg('warped_nylium', { tex: { top: 'warped_nylium_top', bottom: 'netherrack', side: 'warped_nylium_side' }, hardness: 0.4, tool: 'pickaxe', needsTool: true, drops: () => [{ id: B.netherrack, count: 1 }] });
reg('crimson_nylium', { tex: { top: 'crimson_nylium_top', bottom: 'netherrack', side: 'crimson_nylium_side' }, hardness: 0.4, tool: 'pickaxe', needsTool: true, drops: () => [{ id: B.netherrack, count: 1 }] });
reg('warped_stem', { tex: { top: 'warped_stem_top', bottom: 'warped_stem_top', side: 'warped_stem' }, hardness: 2, tool: 'axe', sound: 'wood' });
reg('crimson_stem', { tex: { top: 'crimson_stem_top', bottom: 'crimson_stem_top', side: 'crimson_stem' }, hardness: 2, tool: 'axe', sound: 'wood' });
reg('warped_wart_block', { hardness: 1, tool: 'hoe', sound: 'grass' });
reg('nether_wart_block', { hardness: 1, tool: 'hoe', sound: 'grass' });
reg('shroomlight', { light: 15, hardness: 1, tool: 'hoe', sound: 'grass' });
reg('soul_soil', { hardness: 0.5, tool: 'shovel', sound: 'sand' });
reg('bone_block', { tex: { top: 'bone_block_top', bottom: 'bone_block_top', side: 'bone_block_side' }, hardness: 2, tool: 'pickaxe', needsTool: true });
reg('slime_block', { translucent: true, cullSame: true, opaque: false, hardness: 0, sound: 'cloth', bouncy: true, tab: 'redstone' });
reg('honey_block', { translucent: true, cullSame: true, opaque: false, hardness: 0, sound: 'cloth', tab: 'redstone' });
reg('cake', { render: 'box', opaque: false, tex: { top: 'cake_top', bottom: 'cake_bottom', side: 'cake_side' }, hardness: 0.5, sound: 'cloth', shape: (m) => [[(1 + 2 * (m & 7)) / 16, 0, 1 / 16, 15 / 16, 0.5, 15 / 16]], interact: 'cake', stack: 1, drops: () => [], tab: 'food' });
reg('note_block', { hardness: 0.8, tool: 'axe', sound: 'wood', interact: 'note', tab: 'redstone', fuel: 300 });
reg('jukebox', { tex: { top: 'jukebox_top', bottom: 'jukebox_side', side: 'jukebox_side' }, hardness: 2, tool: 'axe', sound: 'wood', tab: 'redstone', fuel: 300 });
reg('barrel', { tex: (m) => ({ top: 'barrel_top', bottom: 'barrel_bottom', side: 'barrel_side' }), hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'chest', container: true, tab: 'functional', fuel: 300 });
reg('smoker', { tex: (m) => ({ top: 'smoker_top', bottom: 'smoker_top', side: 'smoker_side', front: (m & 4) ? 'smoker_front_on' : 'smoker_front', facing: m & 3 }), hardness: 3.5, tool: 'pickaxe', needsTool: true, facingPlace: true, interact: 'furnace', furnaceSpeed: 2, foodOnly: true, tab: 'functional', container: true, lightOf: (m) => (m & 4) ? 13 : 0 });
reg('blast_furnace', { tex: (m) => ({ top: 'blast_furnace_top', bottom: 'blast_furnace_top', side: 'blast_furnace_side', front: (m & 4) ? 'blast_furnace_front_on' : 'blast_furnace_front', facing: m & 3 }), hardness: 3.5, tool: 'pickaxe', needsTool: true, facingPlace: true, interact: 'furnace', furnaceSpeed: 2, oreOnly: true, tab: 'functional', container: true, lightOf: (m) => (m & 4) ? 13 : 0 });
reg('campfire', { render: 'box', opaque: false, cutout: true, tex: { top: 'campfire_top', bottom: 'campfire_bottom', side: 'campfire_side' }, hardness: 2, tool: 'axe', sound: 'wood', shape: () => [[0, 0, 0, 1, 7 / 16, 1]], light: 15, damage: true, tab: 'functional', drops: () => [{ id: 'charcoal', count: 2 }] });
reg('scaffolding', { render: 'box', opaque: false, cutout: true, solid: true, hardness: 0, sound: 'wood', shape: () => [[0, 14 / 16, 0, 1, 1, 1]], ladder: true, tab: 'functional' });
reg('stripped_oak_log', { tex: { top: 'stripped_oak_log_top', bottom: 'stripped_oak_log_top', side: 'stripped_oak_log' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: 5, fuel: 300 });
reg('dead_coral', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'stone', tab: 'nature', drops: () => [] });
reg('seagrass', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', replaceable: true, tab: 'nature', drops: () => [], underwater: true });
reg('kelp', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', tab: 'nature', underwater: true, drops: () => [{ id: B.kelp, count: 1 }] });
reg('tall_grass', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', replaceable: true, needsSoil: true, tab: 'nature', flammable: 60, tex: (m) => (m & 8) ? 'tall_grass_top' : 'tall_grass_bottom', tall: true,
  drops: (m, t, r) => (t === 'shears' && !(m & 8)) ? [{ id: B.tall_grass, count: 1 }] : (r() < 0.125 && !(m & 8) ? [{ id: 'wheat_seeds', count: 1 }] : []) });
reg('sunflower', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', needsSoil: true, tab: 'nature', flammable: 60, tex: (m) => (m & 8) ? 'sunflower_top' : 'sunflower_bottom', tall: true, flower: true, drops: (m) => (m & 8) ? [] : [{ id: B.sunflower, count: 1 }] });
reg('rose_bush', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', needsSoil: true, tab: 'nature', flammable: 60, tex: (m) => (m & 8) ? 'rose_bush_top' : 'rose_bush_bottom', tall: true, flower: true, drops: (m) => (m & 8) ? [] : [{ id: B.rose_bush, count: 1 }] });
reg('lilac', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', needsSoil: true, tab: 'nature', flammable: 60, tex: (m) => (m & 8) ? 'lilac_top' : 'lilac_bottom', tall: true, flower: true, drops: (m) => (m & 8) ? [] : [{ id: B.lilac, count: 1 }] });
reg('large_fern', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', replaceable: true, needsSoil: true, tab: 'nature', flammable: 60, tex: (m) => (m & 8) ? 'large_fern_top' : 'large_fern_bottom', tall: true, drops: (m, t) => (t === 'shears' && !(m & 8)) ? [{ id: B.large_fern, count: 1 }] : [] });
reg('nether_wart', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', hidden: true, crop: true, stages: 4, tex: (m) => `nether_wart_stage${Math.min(3, m & 3)}`, randomTick: true, tab: 'nature', soil: 'soul_sand',
  drops: (m, t, r) => (m & 3) >= 3 ? [{ id: 'nether_wart', count: 2 + Math.floor(r() * 3) }] : [{ id: 'nether_wart', count: 1 }] });
reg('brewing_stand', { render: 'box', opaque: false, cutout: true, hardness: 0.5, tool: 'pickaxe', needsTool: true, shape: () => [[7 / 16, 0, 7 / 16, 9 / 16, 14 / 16, 9 / 16]], light: 1, tab: 'functional' });
reg('anvil', { render: 'box', opaque: false, tex: { top: 'anvil_top', bottom: 'anvil_base', side: 'anvil_side' }, hardness: 5, tool: 'pickaxe', needsTool: true, shape: () => [[2 / 16, 0, 2 / 16, 14 / 16, 1, 14 / 16]], sound: 'metal', gravity: true, tab: 'functional' });
reg('beacon', { translucent: true, cullSame: true, opaque: false, hardness: 3, light: 15, sound: 'glass', tab: 'functional' });
reg('mud', { hardness: 0.5, tool: 'shovel', sound: 'gravel', render: 'box', opaque: false, shape: () => [[0, 0, 0, 1, 14 / 16, 1]], tab: 'nature' });
reg('rooted_dirt', { hardness: 0.5, tool: 'shovel', sound: 'gravel', tab: 'nature' });
reg('cherry_log', { tex: { top: 'cherry_log_top', bottom: 'cherry_log_top', side: 'cherry_log' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: 5, fuel: 300 });
reg('cherry_planks', { hardness: 2, tool: 'axe', sound: 'wood', flammable: 20, fuel: 300 });
reg('cherry_leaves', { cutout: true, opaque: false, lightBlock: 1, hardness: 0.2, tool: 'shears', sound: 'grass', flammable: 60, tab: 'nature', leaves: true, wood: 'cherry', drops: (m, t, r) => t === 'shears' ? [{ id: B.cherry_leaves, count: 1 }] : (r() < 0.05 ? [{ id: B.cherry_sapling, count: 1 }] : []) });
reg('cherry_sapling', { render: 'cross', solid: false, opaque: false, hardness: 0, sound: 'grass', randomTick: true, tab: 'nature', sapling: 'cherry', needsSoil: true });
reg('pink_petals', { render: 'box', opaque: false, cutout: true, solid: false, hardness: 0, sound: 'grass', shape: () => [[0, 0, 0, 1, 1 / 16, 1]], tab: 'nature', replaceable: true });
reg('smooth_sandstone', { hardness: 2, tool: 'pickaxe', needsTool: true });
reg('chiseled_stone_bricks', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('polished_deepslate', { hardness: 3.5, tool: 'pickaxe', needsTool: true });
reg('deepslate_bricks', { hardness: 3.5, tool: 'pickaxe', needsTool: true });
reg('polished_blackstone_bricks', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('polished_andesite', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('polished_granite', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('polished_diorite', { hardness: 1.5, tool: 'pickaxe', needsTool: true });
reg('quartz_pillar', { tex: { top: 'quartz_pillar_top', bottom: 'quartz_pillar_top', side: 'quartz_pillar' }, hardness: 0.8, tool: 'pickaxe', needsTool: true });
reg('chiseled_quartz_block', { hardness: 0.8, tool: 'pickaxe', needsTool: true });
reg('end_stone_bricks', { hardness: 3, tool: 'pickaxe', needsTool: true });
reg('red_nether_bricks', { hardness: 2, tool: 'pickaxe', needsTool: true });
reg('cut_copper', { hardness: 3, tool: 'pickaxe', needsTool: true, minTier: 1, sound: 'metal' });
reg('oxidized_copper', { hardness: 3, tool: 'pickaxe', needsTool: true, minTier: 1, sound: 'metal' });
reg('deepslate_coal_ore', { hardness: 4.5, tool: 'pickaxe', needsTool: true, drops: () => [{ id: 'coal', count: 1 }], xp: 1 });
reg('deepslate_iron_ore', { hardness: 4.5, tool: 'pickaxe', needsTool: true, minTier: 1, drops: () => [{ id: 'raw_iron', count: 1 }] });
reg('deepslate_gold_ore', { hardness: 4.5, tool: 'pickaxe', needsTool: true, minTier: 2, drops: () => [{ id: 'raw_gold', count: 1 }] });
reg('deepslate_diamond_ore', { hardness: 4.5, tool: 'pickaxe', needsTool: true, minTier: 2, drops: () => [{ id: 'diamond', count: 1 }], xp: 5 });
reg('deepslate_redstone_ore', { hardness: 4.5, tool: 'pickaxe', needsTool: true, minTier: 2, drops: (m, t, r) => [{ id: 'redstone', count: 4 + Math.floor(r() * 2) }], xp: 3 });
reg('deepslate_lapis_ore', { hardness: 4.5, tool: 'pickaxe', needsTool: true, minTier: 1, drops: (m, t, r) => [{ id: 'lapis_lazuli', count: 4 + Math.floor(r() * 5) }], xp: 3 });
reg('deepslate_emerald_ore', { hardness: 4.5, tool: 'pickaxe', needsTool: true, minTier: 2, drops: () => [{ id: 'emerald', count: 1 }], xp: 5 });
reg('deepslate_copper_ore', { hardness: 4.5, tool: 'pickaxe', needsTool: true, minTier: 1, drops: (m, t, r) => [{ id: 'raw_copper', count: 2 + Math.floor(r() * 3) }] });
reg('lava_cauldron', { hidden: true, light: 15, hardness: 2, tool: 'pickaxe', tab: 'misc' });
reg('end_portal_frame', { hardness: -1, light: 1, tab: 'misc' });
reg('end_portal', { render: 'box', opaque: false, translucent: true, solid: false, light: 15, hardness: -1, hidden: true, shape: () => [[0, 0, 0, 1, 12 / 16, 1]], drops: () => [], tab: 'misc' });
reg('chorus_plant', { render: 'box', opaque: false, hardness: 0.4, tool: 'axe', sound: 'wood', shape: () => [[3 / 16, 0, 3 / 16, 13 / 16, 1, 13 / 16]], tab: 'nature' });
reg('end_rod', { render: 'box', opaque: false, cutout: true, light: 14, hardness: 0, shape: () => [[6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16]], tab: 'functional' });
reg('dragon_egg', { render: 'box', opaque: false, hardness: 3, light: 1, shape: () => [[1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16]], gravity: true, tab: 'misc' });

// stone tools of the build-tab: cobble variants of other stones for completeness
reg('polished_basalt', { tex: { top: 'polished_basalt_top', bottom: 'polished_basalt_top', side: 'polished_basalt' }, hardness: 1.25, tool: 'pickaxe', needsTool: true });
reg('mossy_cobblestone_stairs', { render: 'box', opaque: false, tex: 'mossy_cobblestone', hardness: 2, tool: 'pickaxe', needsTool: true, shape: stairShape, stairs: true });
reg('quartz_stairs', { render: 'box', opaque: false, tex: 'quartz_block', hardness: 0.8, tool: 'pickaxe', needsTool: true, shape: stairShape, stairs: true });
reg('quartz_slab', { render: 'box', opaque: false, tex: 'quartz_block', hardness: 0.8, tool: 'pickaxe', needsTool: true, shape: slabShape, slab: true, drops: (m) => [{ id: B.quartz_slab, count: m === 2 ? 2 : 1 }] });
reg('brick_slab', { render: 'box', opaque: false, tex: 'bricks', hardness: 2, tool: 'pickaxe', needsTool: true, shape: slabShape, slab: true, drops: (m) => [{ id: B.brick_slab, count: m === 2 ? 2 : 1 }] });
reg('nether_brick_slab', { render: 'box', opaque: false, tex: 'nether_bricks', hardness: 2, tool: 'pickaxe', needsTool: true, shape: slabShape, slab: true, drops: (m) => [{ id: B.nether_brick_slab, count: m === 2 ? 2 : 1 }] });
reg('nether_brick_fence', { render: 'box', opaque: false, tex: 'nether_bricks', hardness: 2, tool: 'pickaxe', needsTool: true, shape: fenceShape, renderShape: fenceRenderShape, fence: true });
reg('stone_brick_wall', { render: 'box', opaque: false, tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', needsTool: true, shape: fenceShape, renderShape: fenceRenderShape, fence: true });

if (BLOCKS.length > 1024) throw new Error('Too many blocks: ' + BLOCKS.length);
export const ITEM_ID_BASE = 1024; // item ids start here; block ids are < 1024 (chunks store Uint16)
export const BLOCK_COUNT = BLOCKS.length;

// Convenience predicates
export function isOpaque(id) { const d = BLOCKS[id]; return d ? d.opaque : false; }
export function isSolid(id) { const d = BLOCKS[id]; return d ? d.solid : false; }
export function isFluid(id) { return id === B.water || id === B.lava; }
export function isReplaceable(id) { const d = BLOCKS[id]; return d ? d.replaceable : false; }
export function isSoil(id) { return id === B.grass_block || id === B.dirt || id === B.coarse_dirt || id === B.podzol || id === B.farmland || id === B.mycelium || id === B.moss_block || id === B.rooted_dirt || id === B.mud; }
