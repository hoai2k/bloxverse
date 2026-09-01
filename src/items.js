// Item registry. Ids >= ITEM_ID_BASE; block ids double as item ids below that.
import { BLOCKS, B, ITEM_ID_BASE, getBlock } from './blocks.js';

export const ITEMS = new Map(); // id -> def
export const I = {};            // name -> id
let nextId = ITEM_ID_BASE;

function reg(name, props = {}) {
  const id = nextId++;
  const def = Object.assign({
    id, name,
    displayName: name.split('_').map(s => s[0].toUpperCase() + s.slice(1)).join(' '),
    tex: name, stack: 64, tab: 'misc',
  }, props);
  ITEMS.set(id, def);
  I[name] = id;
  return def;
}

// ---------- tools ----------
export const TOOL_MATERIALS = {
  wooden:    { tier: 0, speed: 2,  durability: 59,   damage: 0, ench: 15, fuel: 200 },
  stone:     { tier: 1, speed: 4,  durability: 131,  damage: 1, ench: 5 },
  iron:      { tier: 2, speed: 6,  durability: 250,  damage: 2, ench: 14 },
  golden:    { tier: 0, speed: 12, durability: 32,   damage: 0, ench: 22 },
  diamond:   { tier: 3, speed: 8,  durability: 1561, damage: 3, ench: 10 },
  netherite: { tier: 4, speed: 9,  durability: 2031, damage: 4, ench: 15 },
};
const TOOL_TYPES = { sword: 4, pickaxe: 2, axe: 3, shovel: 1.5, hoe: 1 }; // base attack damage
for (const [mat, m] of Object.entries(TOOL_MATERIALS)) {
  for (const [type, base] of Object.entries(TOOL_TYPES)) {
    let dmg = base + m.damage;
    if (type === 'axe') dmg = { wooden: 7, stone: 9, iron: 9, golden: 7, diamond: 9, netherite: 10 }[mat];
    if (type === 'hoe') dmg = 1;
    reg(`${mat}_${type}`, { stack: 1, tool: { type, tier: m.tier, speed: m.speed, durability: m.durability, damage: dmg }, tab: 'tools', fuel: m.fuel, material: mat });
  }
}
reg('shears', { stack: 1, tool: { type: 'shears', tier: 0, speed: 15, durability: 238, damage: 1 }, tab: 'tools' });
reg('flint_and_steel', { stack: 1, tool: { type: 'igniter', tier: 0, speed: 1, durability: 64, damage: 1 }, tab: 'tools' });
reg('bow', { stack: 1, tool: { type: 'bow', durability: 384, damage: 1 }, tab: 'combat' });
reg('arrow', { tab: 'combat' });
reg('shield', { stack: 1, tool: { type: 'shield', durability: 336, damage: 1 }, tab: 'combat' });
reg('fishing_rod', { stack: 1, tool: { type: 'fishing_rod', durability: 64, damage: 1 }, tab: 'tools' });
reg('bucket', { stack: 16, tab: 'tools', bucket: 'empty' });
reg('water_bucket', { stack: 1, tab: 'tools', bucket: 'water' });
reg('lava_bucket', { stack: 1, tab: 'tools', bucket: 'lava', fuel: 20000 });
reg('milk_bucket', { stack: 1, tab: 'tools', food: { hunger: 0, saturation: 0, milk: true } });
reg('compass', { stack: 1, tab: 'tools' });
reg('clock', { stack: 1, tab: 'tools' });
reg('spyglass', { stack: 1, tab: 'tools' });
reg('totem_of_undying', { stack: 1, tab: 'combat' });
reg('elytra', { stack: 1, tab: 'combat', armor: { slot: 1, defense: 0, durability: 432, elytra: true } });

// ---------- armor ----------
export const ARMOR_MATERIALS = {
  leather:   { durability: [55, 80, 75, 65],   defense: [1, 3, 2, 1], toughness: 0 },
  chainmail: { durability: [165, 240, 225, 195], defense: [2, 5, 4, 1], toughness: 0 },
  iron:      { durability: [165, 240, 225, 195], defense: [2, 6, 5, 2], toughness: 0 },
  golden:    { durability: [77, 112, 105, 91],  defense: [2, 5, 3, 1], toughness: 0 },
  diamond:   { durability: [363, 528, 495, 429], defense: [3, 8, 6, 3], toughness: 2 },
  netherite: { durability: [407, 592, 555, 481], defense: [3, 8, 6, 3], toughness: 3 },
};
const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
for (const [mat, m] of Object.entries(ARMOR_MATERIALS)) {
  ARMOR_SLOTS.forEach((slot, i) => reg(`${mat}_${slot}`, { stack: 1, armor: { slot: i, defense: m.defense[i], durability: m.durability[i], toughness: m.toughness }, tab: 'combat', material: mat }));
}
reg('turtle_helmet', { stack: 1, armor: { slot: 0, defense: 2, durability: 275, toughness: 0 }, tab: 'combat' });

// ---------- materials ----------
const mats = ['stick', 'coal', 'charcoal', 'raw_iron', 'iron_ingot', 'iron_nugget', 'raw_gold', 'gold_ingot', 'gold_nugget', 'raw_copper', 'copper_ingot',
  'diamond', 'emerald', 'redstone', 'lapis_lazuli', 'quartz', 'netherite_scrap', 'netherite_ingot', 'flint', 'string', 'feather', 'leather', 'bone',
  'gunpowder', 'spider_eye', 'ender_pearl', 'ender_eye', 'blaze_rod', 'blaze_powder', 'slime_ball', 'clay_ball', 'brick', 'nether_brick', 'paper', 'book',
  'sugar', 'glowstone_dust', 'egg', 'wheat', 'bowl', 'ink_sac', 'glass_bottle', 'amethyst_shard', 'echo_shard', 'honeycomb', 'phantom_membrane',
  'prismarine_shard', 'prismarine_crystals', 'nautilus_shell', 'heart_of_the_sea', 'rabbit_hide', 'scute', 'magma_cream', 'ghast_tear', 'nether_star', 'dragon_breath',
  'name_tag', 'saddle', 'lead', 'music_disc', 'enchanted_book', 'writable_book', 'map', 'painting', 'item_frame', 'armor_stand'];
for (const m of mats) reg(m, { tab: 'materials' });
ITEMS.get(I.coal).fuel = 1600; ITEMS.get(I.charcoal).fuel = 1600; ITEMS.get(I.stick).fuel = 100; ITEMS.get(I.blaze_rod).fuel = 2400;
reg('snowball', { stack: 16, tab: 'materials', throwable: true });
reg('bone_meal', { tab: 'materials', bonemeal: true });
reg('wheat_seeds', { tab: 'materials', place: 'wheat', crop: true });
reg('melon_seeds', { tab: 'materials', place: 'melon_stem', crop: true });
reg('pumpkin_seeds', { tab: 'materials', place: 'pumpkin_stem', crop: true });
reg('beetroot_seeds', { tab: 'materials', place: 'wheat', crop: true });
reg('nether_wart', { tab: 'materials', place: 'nether_wart', crop: true, soil: 'soul_sand' });
reg('sugar_cane', { tab: 'materials', place: 'sugar_cane' });
reg('kelp', { tab: 'materials', place: 'kelp' });
reg('redstone_torch', { tab: 'redstone' });
reg('lever', { tab: 'redstone' });
reg('repeater', { tab: 'redstone' });
reg('firework_rocket', { tab: 'misc' });
for (const c of ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'])
  reg(`${c}_dye`, { tab: 'materials', dye: c });

// ---------- food ----------
const foods = {
  apple: [4, 2.4], golden_apple: [4, 9.6], enchanted_golden_apple: [4, 9.6], bread: [5, 6], cookie: [2, 0.4], melon_slice: [2, 1.2], carrot: [3, 3.6], golden_carrot: [6, 14.4],
  potato: [1, 0.6], baked_potato: [5, 6], poisonous_potato: [2, 1.2], beef: [3, 1.8], cooked_beef: [8, 12.8], porkchop: [3, 1.8], cooked_porkchop: [8, 12.8],
  chicken: [2, 1.2], cooked_chicken: [6, 7.2], mutton: [2, 1.2], cooked_mutton: [6, 9.6], rabbit: [3, 1.8], cooked_rabbit: [5, 6], cod: [2, 0.4], cooked_cod: [5, 6],
  salmon: [2, 0.4], cooked_salmon: [6, 9.6], rotten_flesh: [4, 0.8], pumpkin_pie: [8, 4.8], mushroom_stew: [6, 7.2], rabbit_stew: [10, 12], beetroot: [1, 1.2], beetroot_soup: [6, 7.2],
  dried_kelp: [1, 0.6], sweet_berries: [2, 0.4], glow_berries: [2, 0.4], honey_bottle: [6, 1.2], chorus_fruit: [4, 2.4], spider_eye_food: [2, 3.2], tropical_fish: [1, 0.2], pufferfish: [1, 0.2],
};
for (const [name, [h, s]] of Object.entries(foods)) {
  if (name === 'spider_eye_food') continue;
  reg(name, { tab: 'food', food: { hunger: h, saturation: s } });
}
ITEMS.get(I.mushroom_stew).stack = 1; ITEMS.get(I.rabbit_stew).stack = 1; ITEMS.get(I.beetroot_soup).stack = 1; ITEMS.get(I.honey_bottle).stack = 16;
ITEMS.get(I.rotten_flesh).food.poison = 0.8; ITEMS.get(I.poisonous_potato).food.poison = 0.6; ITEMS.get(I.pufferfish).food.poison = 1; ITEMS.get(I.chicken).food.poison = 0.3;
ITEMS.get(I.golden_apple).food.regen = 5; ITEMS.get(I.enchanted_golden_apple).food.regen = 20; ITEMS.get(I.enchanted_golden_apple).food.absorption = 8;
ITEMS.get(I.spider_eye).food = { hunger: 2, saturation: 3.2, poison: 1 }; ITEMS.get(I.spider_eye).tab = 'materials';
ITEMS.get(I.chorus_fruit).food.teleport = true;

// ---------- spawn eggs ----------
export const MOB_TYPES = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'cow', 'pig', 'sheep', 'chicken', 'wolf', 'villager', 'zombified_piglin', 'ghast', 'slime', 'witch', 'blaze', 'iron_golem', 'horse', 'cat', 'bee', 'phantom', 'drowned', 'husk', 'stray'];
for (const m of MOB_TYPES) reg(`${m}_spawn_egg`, { tab: 'spawn_eggs', spawnEgg: m, tex: 'spawn_egg', eggColor: m });

export const ITEM_COUNT = nextId - ITEM_ID_BASE;

// ---------- unified lookup ----------
export function getItem(id) {
  if (id < ITEM_ID_BASE) return BLOCKS[id];
  return ITEMS.get(id);
}
export function isBlockItem(id) { return id > 0 && id < ITEM_ID_BASE; }
export function resolveId(x) {
  if (typeof x === 'number') return x;
  if (B[x] !== undefined) return B[x];
  if (I[x] !== undefined) return I[x];
  throw new Error('Unknown item: ' + x);
}
export function itemName(id) { const d = getItem(id); return d ? d.displayName : '?'; }
export function maxStack(id) { const d = getItem(id); return d ? (d.stack || 64) : 64; }
export function fuelValue(id) { const d = getItem(id); if (!d) return 0; if (d.fuel) return d.fuel; if (d.name && (d.name.endsWith('_planks') || d.name.endsWith('_log') || d.name.endsWith('_stairs') || d.name.endsWith('_fence') || d.name.endsWith('_slab') && d.sound === 'wood' || d.name.endsWith('_sapling'))) return d.name.endsWith('_sapling') ? 100 : 300; if (d.name === 'crafting_table' || d.name === 'chest' || d.name === 'bookshelf') return 300; return 0; }

// Stack helpers: a stack is {id, count, dmg?} or null
export function makeStack(id, count = 1, dmg = 0) { id = resolveId(id); return { id, count, dmg }; }
export function canMerge(a, b) { return a && b && a.id === b.id && (a.dmg || 0) === (b.dmg || 0) && maxStack(a.id) > 1; }

// Furnace recipes: input id -> {id, count, xp}
export const SMELTING = new Map();
function smelt(input, output, xp = 0.1, count = 1) { SMELTING.set(resolveId(input), { id: resolveId(output), count, xp }); }
smelt('raw_iron', 'iron_ingot', 0.7); smelt('raw_gold', 'gold_ingot', 1); smelt('raw_copper', 'copper_ingot', 0.7);
smelt('iron_ore', 'iron_ingot', 0.7); smelt('gold_ore', 'gold_ingot', 1); smelt('copper_ore', 'copper_ingot', 0.7);
smelt('deepslate_iron_ore', 'iron_ingot', 0.7); smelt('deepslate_gold_ore', 'gold_ingot', 1); smelt('nether_gold_ore', 'gold_ingot', 1);
smelt('sand', 'glass', 0.1); smelt('red_sand', 'glass', 0.1); smelt('cobblestone', 'stone', 0.1); smelt('stone', 'smooth_stone', 0.1);
smelt('clay_ball', 'brick', 0.3); smelt('clay', 'terracotta', 0.35); smelt('netherrack', 'nether_brick', 0.1); smelt('cobbled_deepslate', 'deepslate', 0.1);
smelt('stone_bricks', 'cracked_stone_bricks', 0.1); smelt('sandstone', 'smooth_sandstone', 0.1); smelt('quartz_block', 'quartz_block', 0);
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']) smelt(`${w}_log`, 'charcoal', 0.15);
smelt('cactus', 'lime_dye', 1); smelt('ancient_debris', 'netherite_scrap', 2); 
smelt('beef', 'cooked_beef', 0.35); smelt('porkchop', 'cooked_porkchop', 0.35); smelt('chicken', 'cooked_chicken', 0.35); smelt('mutton', 'cooked_mutton', 0.35);
smelt('rabbit', 'cooked_rabbit', 0.35); smelt('cod', 'cooked_cod', 0.35); smelt('salmon', 'cooked_salmon', 0.35); smelt('potato', 'baked_potato', 0.35); smelt('kelp', 'dried_kelp', 0.1);
smelt('coal_ore', 'coal', 0.1); smelt('deepslate_coal_ore', 'coal', 0.1); smelt('diamond_ore', 'diamond', 1); smelt('lapis_ore', 'lapis_lazuli', 0.2); smelt('redstone_ore', 'redstone', 0.7); smelt('emerald_ore', 'emerald', 1);
smelt('iron_pickaxe', 'iron_nugget', 0.1); smelt('golden_pickaxe', 'gold_nugget', 0.1); smelt('chainmail_helmet', 'iron_nugget', 0.1);
smelt('nether_quartz_ore', 'quartz', 0.2); smelt('basalt', 'smooth_stone', 0.1); smelt('sea_lantern', 'sea_lantern', 0);
