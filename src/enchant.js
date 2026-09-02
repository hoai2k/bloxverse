// Enchantments: definitions, random enchanting, effects lookup, anvil repair/combine.
import { getItem, I, maxStack } from './items.js';

export const ENCHANTS = {
  sharpness: { name: 'Sharpness', max: 5, applies: (d) => d.tool && (d.tool.type === 'sword' || d.tool.type === 'axe'), weight: 10 },
  smite: { name: 'Smite', max: 5, applies: (d) => d.tool && d.tool.type === 'sword', weight: 5 },
  knockback: { name: 'Knockback', max: 2, applies: (d) => d.tool && d.tool.type === 'sword', weight: 5 },
  fire_aspect: { name: 'Fire Aspect', max: 2, applies: (d) => d.tool && d.tool.type === 'sword', weight: 2 },
  looting: { name: 'Looting', max: 3, applies: (d) => d.tool && d.tool.type === 'sword', weight: 2 },
  efficiency: { name: 'Efficiency', max: 5, applies: (d) => d.tool && ['pickaxe', 'axe', 'shovel', 'hoe', 'shears'].includes(d.tool.type), weight: 10 },
  fortune: { name: 'Fortune', max: 3, applies: (d) => d.tool && ['pickaxe', 'axe', 'shovel'].includes(d.tool.type), weight: 2 },
  silk_touch: { name: 'Silk Touch', max: 1, applies: (d) => d.tool && ['pickaxe', 'axe', 'shovel'].includes(d.tool.type), weight: 1, exclusive: ['fortune'] },
  unbreaking: { name: 'Unbreaking', max: 3, applies: (d) => (d.tool && d.tool.durability) || d.armor, weight: 5 },
  mending: { name: 'Mending', max: 1, applies: (d) => (d.tool && d.tool.durability) || d.armor, weight: 2 },
  protection: { name: 'Protection', max: 4, applies: (d) => d.armor && !d.armor.elytra, weight: 10 },
  fire_protection: { name: 'Fire Protection', max: 4, applies: (d) => d.armor && !d.armor.elytra, weight: 5 },
  blast_protection: { name: 'Blast Protection', max: 4, applies: (d) => d.armor && !d.armor.elytra, weight: 2 },
  projectile_protection: { name: 'Projectile Protection', max: 4, applies: (d) => d.armor && !d.armor.elytra, weight: 5 },
  thorns: { name: 'Thorns', max: 3, applies: (d) => d.armor && d.armor.slot === 1, weight: 1 },
  feather_falling: { name: 'Feather Falling', max: 4, applies: (d) => d.armor && d.armor.slot === 3, weight: 5 },
  depth_strider: { name: 'Depth Strider', max: 3, applies: (d) => d.armor && d.armor.slot === 3, weight: 2 },
  respiration: { name: 'Respiration', max: 3, applies: (d) => d.armor && d.armor.slot === 0, weight: 2 },
  aqua_affinity: { name: 'Aqua Affinity', max: 1, applies: (d) => d.armor && d.armor.slot === 0, weight: 2 },
  power: { name: 'Power', max: 5, applies: (d) => d.tool && d.tool.type === 'bow', weight: 10 },
  punch: { name: 'Punch', max: 2, applies: (d) => d.tool && d.tool.type === 'bow', weight: 2 },
  flame: { name: 'Flame', max: 1, applies: (d) => d.tool && d.tool.type === 'bow', weight: 2 },
  infinity: { name: 'Infinity', max: 1, applies: (d) => d.tool && d.tool.type === 'bow', weight: 1 },
  lure: { name: 'Lure', max: 3, applies: (d) => d.tool && d.tool.type === 'fishing_rod', weight: 2 },
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export function enchantLevel(stack, key) { return stack && stack.ench ? (stack.ench[key] || 0) : 0; }
export function isEnchanted(stack) { return !!(stack && stack.ench && Object.keys(stack.ench).length); }
export function enchantLines(stack) { if (!isEnchanted(stack)) return []; return Object.entries(stack.ench).map(([k, v]) => `${ENCHANTS[k]?.name || k} ${ROMAN[v] || v}`); }
export function applicable(def, isBook = false) { return Object.entries(ENCHANTS).filter(([k, e]) => isBook || (def && e.applies(def))).map(([k]) => k); }

// Random enchant for a given experience cost (1..30) like an enchanting table.
export function rollEnchantments(stack, cost, rng = Math.random) {
  const def = getItem(stack.id); const isBook = stack.id === I.book;
  let pool = applicable(def, isBook); if (!pool.length) return null;
  const out = {};
  const pick = () => {
    const opts = pool.filter(k => !(k in out) && !Object.keys(out).some(o => (ENCHANTS[o].exclusive || []).includes(k) || (ENCHANTS[k].exclusive || []).includes(o)));
    if (!opts.length) return false;
    const tw = opts.reduce((a, k) => a + ENCHANTS[k].weight, 0); let r = rng() * tw; let key = opts[0];
    for (const k of opts) { r -= ENCHANTS[k].weight; if (r <= 0) { key = k; break; } }
    const e = ENCHANTS[key]; const lvl = Math.max(1, Math.min(e.max, Math.round(cost / 30 * e.max + (rng() - 0.3))));
    out[key] = lvl; return true;
  };
  pick();
  let extra = cost / 50; while (rng() < extra && pick()) extra /= 2;
  return out;
}
export function applyEnchant(stack, ench) { const s = { ...stack, ench: { ...(stack.ench || {}), ...ench } }; if (s.id === I.book) s.id = I.enchanted_book; return s; }

// Anvil: combine two stacks (same item => repair + merge enchants; item + enchanted book => add enchants; item + material => repair)
export function anvilResult(a, b) {
  if (!a) return null;
  const da = getItem(a.id); if (!da) return null;
  const dur = da.tool?.durability || da.armor?.durability || 0;
  if (!b) return null;
  const db = getItem(b.id);
  let out = { ...a, ench: { ...(a.ench || {}) } }; let cost = 1; let changed = false;
  const merge = (ench) => { for (const [k, v] of Object.entries(ench || {})) { if (!ENCHANTS[k] || !(ENCHANTS[k].applies(da))) continue; const cur = out.ench[k] || 0; const nv = cur === v ? Math.min(ENCHANTS[k].max, v + 1) : Math.max(cur, v); if (nv !== cur) { out.ench[k] = nv; cost += nv; changed = true; } } };
  if (b.id === I.enchanted_book && b.ench) merge(b.ench);
  else if (b.id === a.id && dur) { const remA = dur - (a.dmg || 0), remB = dur - (b.dmg || 0); const nd = Math.max(0, dur - Math.min(dur, remA + remB + Math.floor(dur * 0.12))); if (nd !== (a.dmg || 0)) { out.dmg = nd; cost += 2; changed = true; } merge(b.ench); }
  else if (dur && da.material && repairMaterial(da.material) === b.id) { const nd = Math.max(0, (a.dmg || 0) - Math.ceil(dur / 4) * Math.min(b.count, 4)); if (nd !== (a.dmg || 0)) { out.dmg = nd; cost += 1; changed = true; out._used = Math.min(b.count, 4, Math.ceil((a.dmg || 0) / Math.ceil(dur / 4))); } }
  if (!changed) return null;
  if (!Object.keys(out.ench).length) delete out.ench;
  return { result: out, cost: Math.min(39, cost) };
}
function repairMaterial(mat) { return { wooden: I.stick, stone: 1 /* cobblestone id resolved lazily */, iron: I.iron_ingot, golden: I.gold_ingot, diamond: I.diamond, netherite: I.netherite_ingot, leather: I.leather, chainmail: I.iron_ingot }[mat]; }
