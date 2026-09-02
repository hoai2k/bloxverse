// Crafting recipes (shaped + shapeless) with ingredient groups.
import { B, BLOCKS, WOODS, COLORS } from './blocks.js';
import { I, resolveId, getItem } from './items.js';

export const RECIPES = [];
const GROUPS = {
  planks: () => WOODS.map(w => B[`${w}_planks`]).concat([B.cherry_planks]),
  log: () => WOODS.map(w => B[`${w}_log`]).concat([B.cherry_log, B.stripped_oak_log, B.warped_stem, B.crimson_stem]),
  wool: () => COLORS.map(c => B[`${c}_wool`]),
  cobble: () => [B.cobblestone, B.cobbled_deepslate, B.blackstone],
  stone_any: () => [B.stone, B.granite, B.diorite, B.andesite],
  coal_any: () => [I.coal, I.charcoal],
  sand_any: () => [B.sand, B.red_sand],
  dye: () => COLORS.map(c => I[`${c}_dye`]),
  leaves: () => WOODS.map(w => B[`${w}_leaves`]),
  wooden_slab: () => WOODS.map(w => B[`${w}_slab`]),
  stone_slab: () => [B.stone_slab, B.cobblestone_slab, B.stone_brick_slab, B.sandstone_slab, B.quartz_slab, B.brick_slab, B.nether_brick_slab],
};
const groupCache = new Map();
function ingredient(x) {
  if (x == null) return null;
  if (typeof x === 'string' && GROUPS[x]) { if (!groupCache.has(x)) groupCache.set(x, new Set(GROUPS[x]())); const set = groupCache.get(x); return { set, name: x }; }
  return { id: resolveId(x) };
}
function matches(ing, stack) { if (!ing) return !stack; if (!stack) return false; return ing.set ? ing.set.has(stack.id) : ing.id === stack.id; }

export function shaped(pattern, key, result, count = 1) {
  const rows = pattern.map(r => [...r].map(ch => ch === ' ' ? null : ingredient(key[ch])));
  RECIPES.push({ type: 'shaped', rows, w: rows[0].length, h: rows.length, result: resolveId(result), count });
}
export function shapeless(ings, result, count = 1) { RECIPES.push({ type: 'shapeless', ings: ings.map(ingredient), result: resolveId(result), count }); }

// Find recipe for a grid (array of stacks, size 4 or 9, row-major). Returns {id,count,recipe} or null.
export function findRecipe(grid) {
  const size = grid.length === 4 ? 2 : 3;
  // bounding box of used cells
  let minX = 9, minY = 9, maxX = -1, maxY = -1, used = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const s = grid[y * size + x]; if (s) { used.push(s); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); } }
  if (!used.length) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  for (const r of RECIPES) {
    if (r.type === 'shaped') {
      if (r.w !== w || r.h !== h) continue;
      let ok = true, okM = true;
      for (let y = 0; y < h && (ok || okM); y++) for (let x = 0; x < w; x++) {
        const s = grid[(minY + y) * size + (minX + x)];
        if (!matches(r.rows[y][x], s)) ok = false;
        if (!matches(r.rows[y][w - 1 - x], s)) okM = false;
      }
      if (ok || okM) return { id: r.result, count: r.count, recipe: r };
    } else {
      if (r.ings.length !== used.length) continue;
      const pool = used.slice(); let ok = true;
      for (const ing of r.ings) { const i = pool.findIndex(s => matches(ing, s)); if (i < 0) { ok = false; break; } pool.splice(i, 1); }
      if (ok) return { id: r.result, count: r.count, recipe: r };
    }
  }
  return null;
}

// Recipes that could be made from an inventory (for the recipe book)
export function craftableRecipes(countFn, gridSize) {
  const out = [];
  for (const r of RECIPES) {
    if (gridSize === 2 && r.type === 'shaped' && (r.w > 2 || r.h > 2)) continue;
    if (gridSize === 2 && r.type === 'shapeless' && r.ings.length > 4) continue;
    const need = new Map();
    const ings = r.type === 'shaped' ? r.rows.flat().filter(Boolean) : r.ings;
    let ok = true;
    for (const ing of ings) { const key = ing.set ? ing.name : ing.id; need.set(key, (need.get(key) || 0) + 1); }
    for (const [key, n] of need) { const have = typeof key === 'string' ? [...GROUPS[key]()].reduce((a, id) => a + countFn(id), 0) : countFn(key); if (have < n) { ok = false; break; } }
    if (ok) out.push(r);
  }
  return out;
}
// Return the item ids a recipe needs, expanded to what the inventory has (first match of a group)
export function recipeIngredients(r) { return (r.type === 'shaped' ? r.rows.flat().filter(Boolean) : r.ings); }
export function ingredientOptions(ing) { return ing.set ? [...ing.set] : [ing.id]; }

// ---------- recipe definitions ----------
for (const w of WOODS) {
  shapeless([`${w}_log`], `${w}_planks`, 4);
  const p = `${w}_planks`;
  shaped(['###'], { '#': p }, `${w}_slab`, 6);
  shaped(['#  ', '## ', '###'], { '#': p }, `${w}_stairs`, 4);
  shaped(['#/#', '#/#'], { '#': p, '/': 'stick' }, `${w}_fence`, 3);
  shaped(['##', '##', '##'], { '#': p }, `${w}_door`, 3);
}
shapeless(['cherry_log'], 'cherry_planks', 4);
shapeless(['stripped_oak_log'], 'oak_planks', 4); shapeless(['warped_stem'], 'oak_planks', 4); shapeless(['crimson_stem'], 'oak_planks', 4);
shaped(['#', '#'], { '#': 'planks' }, 'stick', 4);
shaped(['#', '#'], { '#': 'bamboo' }, 'stick', 1);
shaped(['##', '##'], { '#': 'planks' }, 'crafting_table');
shaped(['###', '# #', '###'], { '#': 'cobble' }, 'furnace');
shaped(['###', '# #', '###'], { '#': 'planks' }, 'chest');
shaped(['#', '/'], { '#': 'coal_any', '/': 'stick' }, 'torch', 4);
shaped(['###', '#/#', '###'], { '#': 'planks', '/': 'chest' }, 'barrel');
shaped(['#', 'o', '#'], { '#': 'iron_nugget', 'o': 'torch' }, 'lantern');
shaped(['/', 'c', '#'], { '/': 'stick', 'c': 'coal_any', '#': 'log' }, 'campfire');
shaped(['#', 'X', '#'], { '#': 'log', 'X': 'furnace' }, 'smoker');
shaped(['III', 'IFI', 'SSS'], { 'I': 'iron_ingot', 'F': 'furnace', 'S': 'smooth_stone' }, 'blast_furnace');
// tools & armor
for (const [mat, ing] of [['wooden', 'planks'], ['stone', 'cobble'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond']]) {
  shaped(['###', ' / ', ' / '], { '#': ing, '/': 'stick' }, `${mat}_pickaxe`);
  shaped(['##', '#/', ' /'], { '#': ing, '/': 'stick' }, `${mat}_axe`);
  shaped(['#', '/', '/'], { '#': ing, '/': 'stick' }, `${mat}_shovel`);
  shaped(['##', ' /', ' /'], { '#': ing, '/': 'stick' }, `${mat}_hoe`);
  shaped(['#', '#', '/'], { '#': ing, '/': 'stick' }, `${mat}_sword`);
}
for (const t of ['pickaxe', 'axe', 'shovel', 'hoe', 'sword']) shapeless([`diamond_${t}`, 'netherite_ingot'], `netherite_${t}`);
for (const [mat, ing] of [['leather', 'leather'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond']]) {
  shaped(['###', '# #'], { '#': ing }, `${mat}_helmet`);
  shaped(['# #', '###', '###'], { '#': ing }, `${mat}_chestplate`);
  shaped(['###', '# #', '# #'], { '#': ing }, `${mat}_leggings`);
  shaped(['# #', '# #'], { '#': ing }, `${mat}_boots`);
}
for (const a of ['helmet', 'chestplate', 'leggings', 'boots']) shapeless([`diamond_${a}`, 'netherite_ingot'], `netherite_${a}`);
shaped(['###', '# #'], { '#': 'iron_nugget' }, 'chainmail_helmet'); shaped(['# #', '###', '###'], { '#': 'iron_nugget' }, 'chainmail_chestplate');
shaped(['###', '# #', '# #'], { '#': 'iron_nugget' }, 'chainmail_leggings'); shaped(['# #', '# #'], { '#': 'iron_nugget' }, 'chainmail_boots');
shapeless(['netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot'], 'netherite_ingot');
shapeless(['scute', 'scute', 'scute', 'scute', 'scute'], 'turtle_helmet');
shaped([' #', '# '], { '#': 'iron_ingot' }, 'shears');
shapeless(['iron_ingot', 'flint'], 'flint_and_steel');
shaped([' /s', '/ s', ' /s'], { '/': 'stick', 's': 'string' }, 'bow');
shaped(['f', '/', 'F'], { 'f': 'flint', '/': 'stick', 'F': 'feather' }, 'arrow', 4);
shaped(['# #', ' # '], { '#': 'iron_ingot' }, 'bucket');
shaped([' # ', '#r#', ' # '], { '#': 'iron_ingot', 'r': 'redstone' }, 'compass');
shaped([' # ', '#r#', ' # '], { '#': 'gold_ingot', 'r': 'redstone' }, 'clock');
shaped(['#I#', '###', ' # '], { '#': 'planks', 'I': 'iron_ingot' }, 'shield');
shaped(['  /', ' /s', '/ s'], { '/': 'stick', 's': 'string' }, 'fishing_rod');
shaped(['A', 'C', 'C'], { 'A': 'amethyst_shard', 'C': 'copper_ingot' }, 'spyglass');
shaped(['###', '#c#', '###'], { '#': 'gold_ingot', 'c': 'apple' }, 'golden_apple');
shaped(['###', '#c#', '###'], { '#': 'gold_nugget', 'c': 'carrot' }, 'golden_carrot');
shapeless(['paper', 'gunpowder'], 'firework_rocket', 3);
shapeless(['ender_pearl', 'blaze_powder'], 'ender_eye'); shapeless(['blaze_rod'], 'blaze_powder', 2); shapeless(['slime_ball', 'blaze_powder'], 'magma_cream');
shapeless(['string', 'string', 'string', 'string', 'slime_ball'], 'lead', 2);
shaped(['sss', 'sls', 'sss'], { 's': 'stick', 'l': 'leather' }, 'item_frame'); shaped(['sss', 'sws', 'sss'], { 's': 'stick', 'w': 'wool' }, 'painting');
shaped(['ppp', 'pcp', 'ppp'], { 'p': 'paper', 'c': 'compass' }, 'map');
shaped(['# #', ' # '], { '#': 'glass' }, 'glass_bottle', 3);
shaped(['#', '/'], { '#': 'redstone', '/': 'stick' }, 'redstone_torch');
shaped(['/', '#'], { '/': 'stick', '#': 'cobblestone' }, 'lever');
shaped(['TRT', 'SSS'], { 'T': 'redstone_torch', 'R': 'redstone', 'S': 'stone' }, 'repeater');
// food
shaped(['###'], { '#': 'wheat' }, 'bread');
shapeless(['brown_mushroom', 'red_mushroom', 'bowl'], 'mushroom_stew');
shapeless(['pumpkin', 'sugar', 'egg'], 'pumpkin_pie');
shapeless(['wheat', 'wheat', 'sweet_berries'], 'cookie', 8);
shaped(['MMM', 'SES', 'WWW'], { 'M': 'milk_bucket', 'S': 'sugar', 'E': 'egg', 'W': 'wheat' }, 'cake');
shapeless(['sugar_cane'], 'sugar');
shaped(['###'], { '#': 'sugar_cane' }, 'paper', 3);
shapeless(['paper', 'paper', 'paper', 'leather'], 'book');
shapeless(['book', 'feather', 'ink_sac'], 'writable_book');
shaped(['###', 'bbb', '###'], { '#': 'planks', 'b': 'book' }, 'bookshelf');
shaped(['# #', ' # '], { '#': 'planks' }, 'bowl', 4);
shapeless(['melon_slice'], 'melon_seeds');
shapeless(['pumpkin'], 'pumpkin_seeds', 4);
shaped(['###', '###', '###'], { '#': 'melon_slice' }, 'melon');
shapeless(['bone'], 'bone_meal', 3);
shapeless(['kelp', 'kelp', 'kelp', 'kelp', 'kelp', 'kelp', 'kelp', 'kelp', 'kelp'], 'dried_kelp', 9);
shapeless(['cooked_rabbit', 'carrot', 'baked_potato', 'brown_mushroom', 'bowl'], 'rabbit_stew');
shapeless(['bowl', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot'], 'beetroot_soup');
shapeless(['glass_bottle', 'honeycomb'], 'honey_bottle');
shapeless(['honeycomb', 'honeycomb', 'honeycomb', 'honeycomb'], 'honey_block');
// blocks
shaped(['###', '###', '###'], { '#': 'wheat' }, 'hay_block'); shapeless(['hay_block'], 'wheat', 9);
shaped(['###', '###', '###'], { '#': 'bone_meal' }, 'bone_block'); shapeless(['bone_block'], 'bone_meal', 9);
shaped(['##', '##'], { '#': 'snowball' }, 'snow_block'); shaped(['###'], { '#': 'snow_block' }, 'snow', 6);
shaped(['##', '##'], { '#': 'clay_ball' }, 'clay');
shaped(['##', '##'], { '#': 'brick' }, 'bricks'); shaped(['##', '##'], { '#': 'nether_brick' }, 'nether_bricks');
shapeless(['nether_brick', 'nether_brick', 'nether_wart', 'nether_wart'], 'red_nether_bricks');
shaped(['##', '##'], { '#': 'glowstone_dust' }, 'glowstone');
shaped(['##', '##'], { '#': 'quartz' }, 'quartz_block');
shaped(['##', '##'], { '#': 'sand_any' }, 'sandstone');
shaped(['##', '##'], { '#': 'stone' }, 'stone_bricks', 4);
shaped(['##', '##'], { '#': 'end_stone' }, 'end_stone_bricks', 4);
shaped(['##', '##'], { '#': 'deepslate' }, 'polished_deepslate', 4); shaped(['##', '##'], { '#': 'polished_deepslate' }, 'deepslate_bricks', 4);
shaped(['##', '##'], { '#': 'granite' }, 'polished_granite', 4); shaped(['##', '##'], { '#': 'diorite' }, 'polished_diorite', 4); shaped(['##', '##'], { '#': 'andesite' }, 'polished_andesite', 4);
shapeless(['diorite', 'quartz'], 'granite'); shapeless(['cobblestone', 'quartz'], 'diorite', 2); shapeless(['diorite', 'cobblestone'], 'andesite', 2);
shaped(['##', '##'], { '#': 'blackstone' }, 'polished_blackstone_bricks', 4);
shaped(['##', '##'], { '#': 'basalt' }, 'polished_basalt', 4);
shaped(['#', '#'], { '#': 'quartz_slab' }, 'chiseled_quartz_block'); shaped(['#', '#'], { '#': 'quartz_block' }, 'quartz_pillar', 2);
shaped(['#', '#'], { '#': 'stone_brick_slab' }, 'chiseled_stone_bricks');
shapeless(['cobblestone', 'vine'], 'mossy_cobblestone'); shapeless(['stone_bricks', 'vine'], 'mossy_stone_bricks');
shaped(['###', '###', '###'], { '#': 'coal' }, 'coal_block'); shapeless(['coal_block'], 'coal', 9);
for (const [ing, blk] of [['iron_ingot', 'iron_block'], ['gold_ingot', 'gold_block'], ['diamond', 'diamond_block'], ['emerald', 'emerald_block'], ['lapis_lazuli', 'lapis_block'], ['redstone', 'redstone_block'], ['copper_ingot', 'copper_block'], ['netherite_ingot', 'netherite_block'], ['slime_ball', 'slime_block'], ['amethyst_shard', 'amethyst_block'], ['nether_wart', 'nether_wart_block']]) {
  shaped(['###', '###', '###'], { '#': ing }, blk); shapeless([blk], ing, 9);
}
for (const [nug, ing] of [['iron_nugget', 'iron_ingot'], ['gold_nugget', 'gold_ingot']]) { shaped(['###', '###', '###'], { '#': nug }, ing); shapeless([ing], nug, 9); }
shaped(['##', '##'], { '#': 'copper_block' }, 'cut_copper', 4);
shaped(['##', '##'], { '#': 'magma_cream' }, 'magma_block');
shaped(['##', '##'], { '#': 'prismarine_shard' }, 'prismarine');
shaped(['SSS', 'SCS', 'SSS'], { 'S': 'prismarine_shard', 'C': 'prismarine_crystals' }, 'sea_lantern');
shapeless(['chorus_fruit', 'chorus_fruit', 'chorus_fruit', 'chorus_fruit'], 'purpur_block', 4);
shaped(['##', '##'], { '#': 'string' }, 'white_wool');
for (const c of COLORS) {
  shaped(['##'], { '#': `${c}_wool` }, `${c}_carpet`, 3);
  if (c !== 'white') shapeless(['wool', `${c}_dye`], `${c}_wool`);
  shapeless(['terracotta', `${c}_dye`], `${c}_terracotta`);
  shaped(['###', '#d#', '###'], { '#': 'glass', 'd': `${c}_dye` }, `${c}_stained_glass`, 8);
  shapeless(['sand_any', 'sand_any', 'sand_any', 'sand_any', 'gravel', 'gravel', 'gravel', 'gravel', `${c}_dye`], `${c}_concrete`, 8);
}
shapeless(['dandelion'], 'yellow_dye'); shapeless(['poppy'], 'red_dye'); shapeless(['blue_orchid'], 'light_blue_dye'); shapeless(['allium'], 'magenta_dye'); shapeless(['oxeye_daisy'], 'light_gray_dye');
shapeless(['cornflower'], 'blue_dye'); shapeless(['lily_of_the_valley'], 'white_dye'); shapeless(['tulip_red'], 'red_dye'); shapeless(['tulip_orange'], 'orange_dye'); shapeless(['tulip_white'], 'light_gray_dye'); shapeless(['tulip_pink'], 'pink_dye');
shapeless(['sunflower'], 'yellow_dye', 2); shapeless(['rose_bush'], 'red_dye', 2); shapeless(['lilac'], 'magenta_dye', 2); shapeless(['cactus'], 'green_dye');
shapeless(['lapis_lazuli'], 'blue_dye'); shapeless(['bone_meal'], 'white_dye'); shapeless(['ink_sac'], 'black_dye'); shapeless(['red_dye', 'yellow_dye'], 'orange_dye', 2); shapeless(['blue_dye', 'white_dye'], 'light_blue_dye', 2);
shapeless(['red_dye', 'white_dye'], 'pink_dye', 2); shapeless(['green_dye', 'white_dye'], 'lime_dye', 2); shapeless(['blue_dye', 'green_dye'], 'cyan_dye', 2); shapeless(['blue_dye', 'red_dye'], 'purple_dye', 2);
shapeless(['black_dye', 'white_dye'], 'gray_dye', 2); shapeless(['gray_dye', 'white_dye'], 'light_gray_dye', 2); shapeless(['red_dye', 'green_dye'], 'brown_dye', 2); shapeless(['purple_dye', 'pink_dye'], 'magenta_dye', 2);
shaped(['###', '###'], { '#': 'glass' }, 'glass_pane', 16);
shaped(['###', '###'], { '#': 'iron_ingot' }, 'iron_bars', 16);
shaped(['/ /', '///', '/ /'], { '/': 'stick' }, 'ladder', 3);
shaped(['S', 'B', 'B'], { 'S': 'string', 'B': 'bamboo' }, 'scaffolding', 6);
shaped(['###', 'ppp'], { '#': 'wool', 'p': 'planks' }, 'bed');
shaped(['#X#', 'X#X', '#X#'], { '#': 'gunpowder', 'X': 'sand_any' }, 'tnt');
shaped([' b ', 'dod', 'ooo'], { 'b': 'book', 'd': 'diamond', 'o': 'obsidian' }, 'enchanting_table');
shaped(['III', ' i ', 'iii'], { 'I': 'iron_block', 'i': 'iron_ingot' }, 'anvil');
shaped(['###', '#r#', '###'], { '#': 'planks', 'r': 'redstone' }, 'note_block');
shaped(['###', '#d#', '###'], { '#': 'planks', 'd': 'diamond' }, 'jukebox');
shaped(['ggg', 'gNg', 'ooo'], { 'g': 'glass', 'N': 'nether_star', 'o': 'obsidian' }, 'beacon');
shapeless(['pumpkin', 'torch'], 'jack_o_lantern'); shapeless(['carved_pumpkin', 'torch'], 'jack_o_lantern');
shapeless(['pumpkin', 'shears'], 'carved_pumpkin');
shaped([' B ', 'CCC'], { 'B': 'blaze_rod', 'C': 'cobble' }, 'brewing_stand');
shaped(['B', 'C'], { 'B': 'blaze_rod', 'C': 'chorus_fruit' }, 'end_rod', 4);
shaped(['#/#', '#/#'], { '#': 'nether_bricks', '/': 'nether_brick' }, 'nether_brick_fence', 6);
for (const [base, stairs, slab] of [['cobblestone', 'cobblestone_stairs', 'cobblestone_slab'], ['stone_bricks', 'stone_brick_stairs', 'stone_brick_slab'], ['sandstone', 'sandstone_stairs', 'sandstone_slab'], ['bricks', 'brick_stairs', 'brick_slab'], ['nether_bricks', 'nether_brick_stairs', 'nether_brick_slab'], ['quartz_block', 'quartz_stairs', 'quartz_slab'], ['mossy_cobblestone', 'mossy_cobblestone_stairs', null], ['smooth_stone', null, 'stone_slab']]) {
  if (stairs) shaped(['#  ', '## ', '###'], { '#': base }, stairs, 4);
  if (slab) shaped(['###'], { '#': base }, slab, 6);
}
shaped(['###', '###'], { '#': 'cobblestone' }, 'cobblestone_wall', 6);
shaped(['###', '###'], { '#': 'stone_bricks' }, 'stone_brick_wall', 6);
shaped(['##', '##'], { '#': 'sandstone' }, 'smooth_sandstone', 4);

export const RECIPE_COUNT = RECIPES.length;
