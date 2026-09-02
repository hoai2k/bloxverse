// Player inventory: 36 main slots (0-8 hotbar), 4 armor slots, 1 offhand.
import { maxStack, canMerge, getItem } from './items.js';
import { enchantLevel } from './enchant.js';

export class Inventory {
  constructor() { this.slots = new Array(36).fill(null); this.armor = new Array(4).fill(null); this.offhand = [null]; this.selected = 0; }
  get held() { return this.slots[this.selected]; }
  setHeld(s) { this.slots[this.selected] = s; }
  // Adds a stack; returns number of items that did not fit.
  add(stack) {
    if (!stack || stack.count <= 0) return 0;
    let count = stack.count; const max = maxStack(stack.id);
    // merge into existing (hotbar first)
    for (let i = 0; i < 36 && count > 0; i++) { const s = this.slots[i]; if (canMerge(s, stack) && s.count < max) { const n = Math.min(max - s.count, count); s.count += n; count -= n; } }
    for (let i = 0; i < 36 && count > 0; i++) { if (!this.slots[i]) { const n = Math.min(max, count); this.slots[i] = { id: stack.id, count: n, dmg: stack.dmg || 0 }; if (stack.ench) this.slots[i].ench = { ...stack.ench }; if (stack.te) this.slots[i].te = stack.te; count -= n; } }
    return count;
  }
  count(id) { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.count; return n; }
  has(id, n = 1) { return this.count(id) >= n; }
  remove(id, n = 1) { let left = n; for (let i = 0; i < 36 && left > 0; i++) { const s = this.slots[i]; if (s && s.id === id) { const k = Math.min(s.count, left); s.count -= k; left -= k; if (s.count <= 0) this.slots[i] = null; } } return n - left; }
  consumeHeld(n = 1) { const s = this.held; if (!s) return; s.count -= n; if (s.count <= 0) this.slots[this.selected] = null; }
  damageHeld(n = 1) { const s = this.held; if (!s) return false; const d = getItem(s.id); const dur = d?.tool?.durability || d?.armor?.durability; if (!dur) return false; const ub = enchantLevel(s, 'unbreaking'); if (ub && Math.random() < ub / (ub + 1)) return false; s.dmg = (s.dmg || 0) + n; if (s.dmg >= dur) { this.slots[this.selected] = null; return true; } return false; }
  clear() { this.slots.fill(null); this.armor.fill(null); this.offhand[0] = null; }
  isEmpty() { return this.slots.every(s => !s) && this.armor.every(s => !s) && !this.offhand[0]; }
  // Mending: repair one enchanted item by xp amount; returns leftover xp
  mend(xp) { const all = [this.held, ...this.armor, this.offhand[0]].filter(s => s && s.dmg > 0 && enchantLevel(s, 'mending')); if (!all.length) return xp; const s = all[Math.floor(Math.random() * all.length)]; const r = Math.min(s.dmg, xp * 2); s.dmg -= r; return xp - Math.ceil(r / 2); }
  serialize() { return { slots: this.slots, armor: this.armor, offhand: this.offhand, selected: this.selected }; }
  deserialize(d) { if (!d) return; this.slots = (d.slots || []).concat(new Array(36).fill(null)).slice(0, 36); this.armor = (d.armor || []).concat(new Array(4).fill(null)).slice(0, 4); this.offhand = d.offhand || [null]; this.selected = d.selected || 0; }
  // total armor defense points
  armorValue() { let v = 0; for (const s of this.armor) if (s) { const d = getItem(s.id); if (d?.armor) v += d.armor.defense; } return v; }
  damageArmor(n = 1) { for (let i = 0; i < 4; i++) { const s = this.armor[i]; if (!s) continue; const d = getItem(s.id); if (!d?.armor) continue; const ub = enchantLevel(s, 'unbreaking'); if (ub && Math.random() < ub * 0.2) continue; s.dmg = (s.dmg || 0) + n; if (s.dmg >= d.armor.durability) this.armor[i] = null; } }
}

// Generic slot container used by chests, furnaces and crafting grids
export class Container {
  constructor(size) { this.slots = new Array(size).fill(null); }
  add(stack) { let count = stack.count; const max = maxStack(stack.id);
    for (let i = 0; i < this.slots.length && count > 0; i++) { const s = this.slots[i]; if (canMerge(s, stack) && s.count < max) { const n = Math.min(max - s.count, count); s.count += n; count -= n; } }
    for (let i = 0; i < this.slots.length && count > 0; i++) { if (!this.slots[i]) { const n = Math.min(max, count); this.slots[i] = { id: stack.id, count: n, dmg: stack.dmg || 0 }; if (stack.ench) this.slots[i].ench = { ...stack.ench }; count -= n; } }
    return count; }
  isEmpty() { return this.slots.every(s => !s); }
}
