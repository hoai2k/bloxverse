// DOM user interface: HUD, inventory & container screens, chat, pause/options, death screen, debug overlay.
import { BLOCKS, B } from './blocks.js';
import { I, ITEMS, getItem, isBlockItem, maxStack, canMerge, makeStack, itemName, fuelValue, SMELTING } from './items.js';
import { itemIcon } from './textures.js';
import { findRecipe, craftableRecipes, recipeIngredients, ingredientOptions, RECIPES } from './crafting.js';
import { Container } from './inventory.js';
import { runCommand } from './commands.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// ---------- HUD icons ----------
const ICONS = {};
function icon(name, rows, pal) {
  const c = document.createElement('canvas'); c.width = 9; c.height = 9; const ctx = c.getContext('2d');
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) { const ch = rows[y][x]; if (pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(x, y, 1, 1); } }
  ICONS[name] = c; return c;
}
const HEART = ['.RR.RR...', 'RrrRrrR..', 'RrrrrrrR.', 'RrrrrrrR.', '.RrrrrR..', '..RrrR...', '...RR....', '.........', '.........'];
const HEART_HALF = ['.RR.OO...', 'RrrRooO..', 'RrrrooOO.', 'RrrroooO.', '.RrrooO..', '..RroO...', '...RO....', '.........', '.........'];
icon('heart', HEART, { R: '#3a0000', r: '#ff1313' }); icon('heart_half', HEART_HALF, { R: '#3a0000', r: '#ff1313', O: '#2a2a2a', o: '#4a4a4a' }); icon('heart_empty', HEART, { R: '#2a2a2a', r: '#4a4a4a' });
icon('heart_abs', HEART, { R: '#5a4a00', r: '#f5c800' }); icon('heart_poison', HEART, { R: '#1a3a00', r: '#8ab020' });
const FOOD = ['...KKK...', '..KkkkK..', '..KkkkK..', '..KkkKK..', '...KKB...', '...BB....', '..BB.....', '.BB......', '.........'];
icon('food', FOOD, { K: '#4a2a10', k: '#c8803a', B: '#a06a30' }); icon('food_half', FOOD, { K: '#4a2a10', k: '#8a6a4a', B: '#5a4a3a' }); icon('food_empty', FOOD, { K: '#2a2a2a', k: '#4a4a4a', B: '#3a3a3a' });
const ARMOR = ['.AAAAAAA.', 'AaaaaaaaA', 'AaaaaaaaA', 'AaaaaaaaA', '.AaaaaaA.', '..AaaaA..', '...AAA...', '.........', '.........'];
icon('armor', ARMOR, { A: '#4a4a4a', a: '#d0d0d0' }); icon('armor_half', ARMOR, { A: '#4a4a4a', a: '#8a8a8a' }); icon('armor_empty', ARMOR, { A: '#2a2a2a', a: '#4a4a4a' });
const BUBBLE = ['..BBBB...', '.BwwwwB..', 'BwWwwwwB.', 'BwwwwwwB.', 'BwwwwwwB.', '.BwwwwB..', '..BBBB...', '.........', '.........'];
icon('bubble', BUBBLE, { B: '#1a3a7a', w: '#7ab0ff', W: '#ffffff' });

const CREATIVE_TABS = [['building', 'Building'], ['nature', 'Nature'], ['functional', 'Functional'], ['redstone', 'Redstone'], ['colored', 'Colored'], ['tools', 'Tools'], ['combat', 'Combat'], ['food', 'Food'], ['materials', 'Materials'], ['spawn_eggs', 'Spawn Eggs'], ['misc', 'Misc'], ['search', 'Search']];

export class UI {
  constructor(game) {
    this.game = game; this.screen = null; this.cursor = null; this.slotEls = []; this.invDirty = true; this.hudCache = {}; this.chatOpen = false; this.debugOn = false; this.toastT = 0; this.titleT = 0; this.lastHover = null; this.chatHistory = []; this.histIdx = -1;
    this.buildHotbar();
    this.bindGlobal();
  }
  get screenOpen() { return !!this.screen || this.chatOpen; }

  // ---------- HUD ----------
  buildHotbar() {
    const hb = $('#hotbar'); hb.innerHTML = ''; this.hotbarEls = [];
    for (let i = 0; i < 9; i++) { const s = el('div', 'slot'); hb.appendChild(s); this.hotbarEls.push(s); }
  }
  renderSlot(slotEl, stack, cache = true) {
    const key = stack ? stack.id + ':' + stack.count + ':' + (stack.dmg || 0) : '';
    if (cache && slotEl.dataset.key === key) return; slotEl.dataset.key = key;
    slotEl.innerHTML = '';
    if (!stack) return;
    const ic = itemIcon(stack.id); const c = document.createElement('canvas'); c.width = 32; c.height = 32; c.getContext('2d').drawImage(ic, 0, 0); slotEl.appendChild(c);
    if (stack.count > 1) slotEl.appendChild(el('span', 'count', String(stack.count)));
    const d = getItem(stack.id); const dur = d?.tool?.durability || d?.armor?.durability;
    if (dur && stack.dmg > 0) { const bar = el('div', 'dur'); const f = el('i'); const p = 1 - stack.dmg / dur; f.style.width = (p * 100) + '%'; f.style.background = p > 0.5 ? '#4f4' : p > 0.25 ? '#ff4' : '#f44'; bar.appendChild(f); slotEl.appendChild(bar); }
  }
  updateHUD(dt) {
    const g = this.game, p = g.player; const hud = this.hudCache;
    for (let i = 0; i < 9; i++) { this.renderSlot(this.hotbarEls[i], p.inventory.slots[i]); this.hotbarEls[i].classList.toggle('selected', i === p.inventory.selected); }
    this.renderSlot($('#offhand-slot'), p.inventory.offhand[0]);
    $('#offhand-slot').style.display = p.inventory.offhand[0] ? '' : 'none';
    const survival = !p.invulnerable;
    $('#status').classList.toggle('creative', !survival);
    const rows = ['hearts', 'hunger', 'armor', 'air', 'xp']; for (const r of rows) $('#' + r).style.display = survival ? '' : 'none';
    if (survival) {
      const hp = Math.ceil(p.health), abs = Math.ceil(p.effects.absorption); const hKey = hp + ':' + abs + ':' + (p.effects.poison > 0) + ':' + (p.hurtTimer > 0.4);
      if (hud.h !== hKey) { hud.h = hKey; const row = $('#hearts'); row.innerHTML = ''; const total = 10 + Math.ceil(abs / 2); for (let i = 0; i < Math.min(20, total); i++) { const v = hp - i * 2; let n = i >= 10 ? 'heart_abs' : v >= 2 ? (p.effects.poison > 0 ? 'heart_poison' : 'heart') : v === 1 ? 'heart_half' : 'heart_empty'; if (i >= 10 && abs - (i - 10) * 2 <= 0) n = 'heart_empty'; const c = ICONS[n].cloneNode(true); c.getContext('2d').drawImage(ICONS[n], 0, 0); if (p.hurtTimer > 0.4) c.style.transform = 'translateY(-2px)'; row.appendChild(c); } }
      const hu = Math.ceil(p.hunger); if (hud.f !== hu) { hud.f = hu; const row = $('#hunger'); row.innerHTML = ''; for (let i = 9; i >= 0; i--) { const v = hu - i * 2; const n = v >= 2 ? 'food' : v === 1 ? 'food_half' : 'food_empty'; const c = ICONS[n].cloneNode(true); c.getContext('2d').drawImage(ICONS[n], 0, 0); row.appendChild(c); } }
      const ar = p.inventory.armorValue(); if (hud.a !== ar) { hud.a = ar; const row = $('#armor'); row.innerHTML = ''; if (ar > 0) for (let i = 0; i < 10; i++) { const v = ar - i * 2; const n = v >= 2 ? 'armor' : v === 1 ? 'armor_half' : 'armor_empty'; const c = ICONS[n].cloneNode(true); c.getContext('2d').drawImage(ICONS[n], 0, 0); row.appendChild(c); } }
      const air = p.headInWater ? Math.ceil(p.air / 30) : -1; if (hud.air !== air) { hud.air = air; const row = $('#air'); row.innerHTML = ''; if (air >= 0) for (let i = 0; i < air; i++) { const c = ICONS.bubble.cloneNode(true); c.getContext('2d').drawImage(ICONS.bubble, 0, 0); row.appendChild(c); } }
      const xk = p.level + ':' + Math.round(p.xpProgress / p.xpForLevel(p.level) * 100); if (hud.x !== xk) { hud.x = xk; $('#xp-fill').style.width = (p.xpProgress / p.xpForLevel(p.level) * 100) + '%'; $('#xp-level').textContent = p.level > 0 ? p.level : ''; }
    }
    // item name popup
    const held = p.inventory.held; const nk = held ? held.id : 0; if (hud.n !== nk) { hud.n = nk; if (held) { $('#item-name').textContent = itemName(held.id); $('#item-name').style.opacity = 1; this.nameT = 2; } else $('#item-name').style.opacity = 0; }
    if (this.nameT > 0) { this.nameT -= dt; if (this.nameT <= 0) $('#item-name').style.opacity = 0; }
    // overlays
    $('#water-overlay').style.display = p.headInWater ? 'block' : 'none';
    $('#fire-overlay').style.display = p.fire > 0 || p.headInLava ? 'block' : 'none';
    const po = $('#portal-overlay'); if (p.portalT > 0) { po.style.display = 'block'; po.style.background = `rgba(120,40,200,${Math.min(0.7, p.portalT / 4 * 0.7)})`; } else po.style.display = 'none';
    $('#pumpkin-overlay').style.display = (p.inventory.armor[0] && p.inventory.armor[0].id === B.carved_pumpkin && g.thirdPerson === 0) ? 'block' : 'none';
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('#toast').style.opacity = 0; }
    if (this.titleT > 0) { this.titleT -= dt; if (this.titleT <= 0) { $('#title-big').style.opacity = 0; $('#title-small').style.opacity = 0; } }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) $('#vignette').classList.remove('hurt'); }
    // effects list
    const fx = Object.entries(p.effects).filter(([k, v]) => v > 0).map(([k, v]) => `${{ poison: 'Poison', regen: 'Regeneration', absorption: 'Absorption', fireRes: 'Fire Resistance', speed: 'Speed', strength: 'Strength' }[k] || k} ${k === 'absorption' ? '' : Math.ceil(v) + 's'}`).join('|');
    if (hud.fx !== fx) { hud.fx = fx; const e = $('#effects'); e.innerHTML = ''; for (const f of fx.split('|').filter(Boolean)) e.appendChild(el('div', 'effect', f)); }
    // chat fade
    if (!this.chatOpen) for (const line of $('#chat-log').children) { if (line._t && performance.now() - line._t > 10000) line.classList.add('faded'); }
    // boss bar
    const boss = g.bossEntity; const bb = $('#bossbar'); if (boss && !boss.dead && !boss.removed) { bb.hidden = false; bb.querySelector('.boss-name').textContent = 'Ender Dragon'; bb.querySelector('.boss-fill').style.width = Math.max(0, boss.health / boss.maxHealth * 100) + '%'; } else bb.hidden = true;
    // sleeping
    const so = $('#sleep-overlay'); if (p.sleeping) { so.hidden = false; so.style.opacity = Math.min(1, p.sleepT / 2); } else if (!so.hidden) { so.style.opacity = 0; setTimeout(() => { if (!p.sleeping) so.hidden = true; }, 500); }
    if (this.debugOn) this.updateDebug();
    if (this.screen && this.screen.update && this.screen.type === 'furnace') this.screen.update();
  }
  damageFlash() { $('#vignette').classList.add('hurt'); this.flashT = 0.4; }
  showToast(t) { $('#toast').textContent = t; $('#toast').style.opacity = 1; this.toastT = 3; }
  showTitle(big, small, t = 4) { $('#title-big').textContent = big; $('#title-small').textContent = small; $('#title-big').style.opacity = 1; $('#title-small').style.opacity = 1; this.titleT = t; }
  chatMessage(text, color = '#fff') { const log = $('#chat-log'); const line = el('div', 'chat-line', text); line.style.color = color; line._t = performance.now(); log.appendChild(line); while (log.children.length > 60) log.removeChild(log.firstChild); }
  toggleDebug() { this.debugOn = !this.debugOn; $('#debug').hidden = !this.debugOn; }
  updateDebug() {
    const g = this.game, p = g.player, w = g.world;
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const dirs = ['south (+z)', 'west (-x)', 'north (-z)', 'east (+x)']; const lookX = -Math.sin(p.yaw), lookZ = -Math.cos(p.yaw); const f = Math.abs(lookX) > Math.abs(lookZ) ? (lookX > 0 ? 3 : 1) : (lookZ > 0 ? 0 : 2);
    const hit = p.lookHit; const biome = w.biomeAt(bx, bz);
    const lines = [
      `Craftverse 1.0  ${g.fps.toFixed(0)} fps  (${g.frameMs.toFixed(1)} ms)`,
      `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}`,
      `Block: ${bx} ${by} ${bz}   Chunk: ${bx & 15} ${by} ${bz & 15} in ${bx >> 4} ${bz >> 4}`,
      `Facing: ${dirs[f]}  yaw ${(p.yaw * 180 / Math.PI).toFixed(1)} pitch ${(p.pitch * 180 / Math.PI).toFixed(1)}`,
      `Light: ${w.getLightLevel(bx, by, bz, g.sunLevel).toFixed(0)} (sky ${w.getSky(bx, by, bz)}, block ${w.getBlockLight(bx, by, bz)})   Biome: ${biome.name}`,
      `Time: day ${Math.floor(g.time / 24000)} ${Math.floor(g.time % 24000)}  ${g.isDay() ? 'day' : 'night'}  weather: ${g.weather.raining ? (g.weather.thunder ? 'thunder' : 'rain') : 'clear'}`,
      `Chunks: ${w.chunks.size} loaded, ${w.stats.meshed} meshed, queue ${w.meshQueue.size}   Entities: ${g.entities.list.length}   Particles`, 
      `Dimension: ${['Overworld', 'Nether', 'The End'][w.dim]}   Seed: ${g.seed}   Mode: ${p.gamemode}  Difficulty: ${['Peaceful', 'Easy', 'Normal', 'Hard'][g.difficulty]}`,
      `Speed: ${Math.hypot(p.vx, p.vz).toFixed(2)} m/s  vy ${p.vy.toFixed(2)}  ground ${p.onGround} water ${p.inWater} fly ${p.flying}`,
      hit ? `Targeted: ${BLOCKS[hit.id].name} meta ${w.getMeta(hit.x, hit.y, hit.z)} at ${hit.x} ${hit.y} ${hit.z} face ${hit.face}` : 'Targeted: none',
      p.lookEntity ? `Entity: ${p.lookEntity.type} hp ${p.lookEntity.health}/${p.lookEntity.maxHealth}` : '',
    ];
    $('#debug').textContent = lines.join('\n');
  }

  // ---------- global input ----------
  bindGlobal() {
    const g = this.game;
    document.addEventListener('keydown', (e) => {
      if (!g.running) return;
      if (this.chatOpen) {
        if (e.code === 'Escape') { this.closeChat(); e.preventDefault(); }
        else if (e.code === 'Enter') { const v = $('#chat-input').value.trim(); if (v) { this.chatHistory.push(v); if (v.startsWith('/')) runCommand(g, v); else this.chatMessage('<Player> ' + v); } this.closeChat(); e.preventDefault(); }
        else if (e.code === 'ArrowUp') { if (this.chatHistory.length) { this.histIdx = Math.max(0, (this.histIdx < 0 ? this.chatHistory.length : this.histIdx) - 1); $('#chat-input').value = this.chatHistory[this.histIdx]; } e.preventDefault(); }
        else if (e.code === 'ArrowDown') { if (this.histIdx >= 0) { this.histIdx++; $('#chat-input').value = this.chatHistory[this.histIdx] || ''; if (this.histIdx >= this.chatHistory.length) this.histIdx = -1; } e.preventDefault(); }
        return;
      }
      if (this.screen) {
        if (e.code === 'Escape' || (e.code === 'KeyE' && this.screen.type !== 'pause' && this.screen.type !== 'options' && this.screen.type !== 'death' && this.screen.type !== 'trade')) { if (this.screen.type === 'options') this.openPause(); else if (this.screen.type !== 'death') this.closeScreen(); e.preventDefault(); return; }
        if (this.screen.type !== 'pause' && this.screen.type !== 'options' && this.screen.type !== 'death' && e.target.tagName !== 'INPUT') {
          if (e.code.startsWith('Digit') && this.lastHover) { const n = parseInt(e.code.slice(5)) - 1; if (n >= 0 && n < 9) { this.swapWithHotbar(this.lastHover, n); e.preventDefault(); } }
          if (e.code === 'KeyQ' && this.lastHover) { this.dropFromSlot(this.lastHover, e.ctrlKey); e.preventDefault(); }
        }
        return;
      }
      switch (e.code) {
        case 'Escape': this.openPause(); break;
        case 'KeyE': if (g.player.dead) break; this.openInventory(); e.preventDefault(); break;
        case 'KeyT': this.openChat(''); e.preventDefault(); break;
        case 'Slash': this.openChat('/'); e.preventDefault(); break;
        case 'KeyQ': g.dropHeld(e.ctrlKey); break;
        case 'F3': this.toggleDebug(); e.preventDefault(); break;
        case 'F5': g.thirdPerson = (g.thirdPerson + 1) % 3; e.preventDefault(); break;
        case 'F1': $('#status').style.display = $('#status').style.display === 'none' ? '' : 'none'; e.preventDefault(); break;
        case 'F2': g.screenshot(); e.preventDefault(); break;
        case 'KeyF': { const p = g.player; const t = p.inventory.offhand[0]; p.inventory.offhand[0] = p.inventory.held; p.inventory.setHeld(t); this.invalidateInventory(); break; }
        case 'F11': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); e.preventDefault(); break;
        default: if (e.code.startsWith('Digit')) { const n = parseInt(e.code.slice(5)) - 1; if (n >= 0 && n < 9) g.player.inventory.selected = n; }
      }
    });
    document.addEventListener('wheel', (e) => { if (!g.running || this.screenOpen) return; const inv = g.player.inventory; inv.selected = (inv.selected + (e.deltaY > 0 ? 1 : -1) + 9) % 9; }, { passive: true });
    $('#chat-input').addEventListener('blur', () => { if (this.chatOpen) setTimeout(() => { if (this.chatOpen) $('#chat-input').focus(); }, 0); });
    document.addEventListener('mousemove', (e) => { const cs = $('#cursor-stack'); cs.style.left = (e.clientX - 20) + 'px'; cs.style.top = (e.clientY - 20) + 'px'; const tt = $('#tooltip'); tt.style.left = (e.clientX + 14) + 'px'; tt.style.top = (e.clientY + 10) + 'px'; });
    $('#modal').addEventListener('mousedown', (e) => { if (e.target === $('#modal') && this.cursor && this.screen && this.screen.type !== 'pause') { g.dropStack(this.cursor); this.cursor = null; this.refresh(); } });
    $('#modal').addEventListener('contextmenu', (e) => e.preventDefault());
  }
  openChat(prefix) { this.chatOpen = true; const inp = $('#chat-input'); inp.hidden = false; inp.value = prefix; this.histIdx = -1; setTimeout(() => inp.focus(), 0); document.exitPointerLock && document.exitPointerLock(); for (const line of $('#chat-log').children) line.classList.remove('faded'); }
  closeChat() { this.chatOpen = false; const inp = $('#chat-input'); inp.hidden = true; inp.value = ''; inp.blur(); this.game.requestPointerLock(); }

  // ---------- generic slot screens ----------
  invalidateInventory() { this.invDirty = true; if (this.screen && this.screen.refresh) this.screen.refresh(); }
  openScreen(type, build) {
    this.closeScreen(true);
    const box = $('#modal-box'); box.innerHTML = ''; box.className = '';
    this.screen = { type, slots: [], refresh: null };
    build(box);
    $('#modal').hidden = false;
    document.exitPointerLock && document.exitPointerLock();
    this.refresh();
  }
  closeScreen(silent = false) {
    if (!this.screen) return;
    const s = this.screen;
    if (s.onClose) s.onClose();
    if (this.cursor) { this.game.player.give(this.cursor); this.cursor = null; }
    this.screen = null; $('#modal').hidden = true; $('#tooltip').hidden = true; $('#cursor-stack').hidden = true; this.lastHover = null;
    if (!silent) this.game.requestPointerLock();
  }
  openPause() {
    this.openScreen('pause', (box) => {
      box.className = 'pause'; const pb = el('div', 'pause-box'); box.appendChild(pb);
      pb.appendChild(el('h2', '', 'Game Menu'));
      const mk = (t, fn) => { const b = el('button', 'mc-btn', t); b.onclick = fn; pb.appendChild(b); return b; };
      mk('Back to Game', () => this.closeScreen());
      mk('Options...', () => this.openOptions());
      mk('Statistics', () => this.openStats());
      mk(this.game.cheats ? 'Cheats: ON' : 'Cheats: OFF (locked)', () => { }).disabled = true;
      mk('Save & Quit to Title', () => this.game.quitToTitle());
    });
  }
  openStats() {
    this.openScreen('pause', (box) => { box.className = 'pause'; const pb = el('div', 'pause-box'); box.appendChild(pb); pb.appendChild(el('h2', '', 'Statistics')); const p = this.game.player; const s = el('div', 'stats-list'); const st = p.stats; const d = Math.floor(this.game.time / 24000); s.innerHTML = `Days survived: ${d}<br>Blocks mined: ${st.blocksMined}<br>Blocks placed: ${st.blocksPlaced}<br>Distance walked: ${Math.round(st.distance)} m<br>Mobs killed: ${this.game.stats.mobKills || 0}<br>Deaths: ${st.deaths}<br>Score: ${p.score}`; pb.appendChild(s); const b = el('button', 'mc-btn', 'Done'); b.onclick = () => this.openPause(); pb.appendChild(b); });
  }
  openOptions() {
    this.openScreen('options', (box) => { box.className = 'pause'; const pb = el('div', 'pause-box'); box.appendChild(pb); pb.appendChild(el('h2', '', 'Options')); const body = el('div'); pb.appendChild(body); buildOptions(body, this.game.settings, (s) => this.game.applySettings(s), this.game); const b = el('button', 'mc-btn', 'Done'); b.onclick = () => this.openPause(); pb.appendChild(b); });
  }
  showDeath(cause) {
    this.openScreen('death', (box) => { box.className = 'pause'; const pb = el('div', 'death-box'); box.appendChild(pb); pb.appendChild(el('h1', '', 'You Died!')); pb.appendChild(el('p', '', 'Player ' + cause)); pb.appendChild(el('p', '', 'Score: ' + this.game.player.score));
      if (this.game.hardcore) { pb.appendChild(el('p', '', 'Hardcore mode: this world is over.')); const b = el('button', 'mc-btn', 'Spectate World'); b.onclick = () => { this.closeScreen(); this.game.player.respawn(); this.game.player.setGamemode('spectator'); }; pb.appendChild(b); }
      else { const b = el('button', 'mc-btn', 'Respawn'); b.onclick = () => { this.closeScreen(); this.game.player.respawn(); }; pb.appendChild(b); }
      const q = el('button', 'mc-btn', 'Title Screen'); q.onclick = () => this.game.quitToTitle(); pb.appendChild(q); });
  }
  // slot group helper. group: {slots, offset, count, cols, kind, accepts?, takeOnly?}
  addGrid(parent, group) {
    const grid = el('div', 'grid'); grid.style.gridTemplateColumns = `repeat(${group.cols}, var(--slot))`; parent.appendChild(grid);
    for (let i = 0; i < group.count; i++) {
      const s = el('div', 'slot'); const ref = { slots: group.slots, index: group.offset + i, kind: group.kind, el: s, group };
      if (group.icons) { s.classList.add('empty-armor'); s.dataset.icon = group.icons[i]; }
      s.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); this.slotClick(ref, e.button, e.shiftKey, e.detail); });
      s.addEventListener('mouseenter', () => { this.lastHover = ref; this.showTooltip(ref); });
      s.addEventListener('mouseleave', () => { if (this.lastHover === ref) this.lastHover = null; $('#tooltip').hidden = true; });
      grid.appendChild(s); this.screen.slots.push(ref);
    }
    return grid;
  }
  addPlayerInventory(parent) {
    const sec = el('div', 'inv-section'); parent.appendChild(sec);
    const inv = this.game.player.inventory;
    this.addGrid(sec, { slots: inv.slots, offset: 9, count: 27, cols: 9, kind: 'inv' });
    this.addGrid(sec, { slots: inv.slots, offset: 0, count: 9, cols: 9, kind: 'hotbar' });
    return sec;
  }
  refresh() {
    if (!this.screen) return;
    for (const ref of this.screen.slots) { const st = ref.slots[ref.index]; this.renderSlot(ref.el, ref.kind === 'creative' && st ? { id: st.id, count: 1 } : st, false); }
    const cs = $('#cursor-stack'); if (this.cursor) { cs.hidden = false; this.renderSlot(cs, this.cursor, false); } else cs.hidden = true;
    if (this.screen.update) this.screen.update();
    if (this.lastHover) this.showTooltip(this.lastHover);
  }
  showTooltip(ref) {
    const st = ref.slots[ref.index]; const tt = $('#tooltip'); if (!st) { tt.hidden = true; return; }
    const d = getItem(st.id); tt.innerHTML = ''; tt.appendChild(el('div', '', itemName(st.id)));
    if (d?.tool) tt.appendChild(el('div', 'sub', `${d.tool.type}  dmg ${d.tool.damage}  durability ${d.tool.durability - (st.dmg || 0)}/${d.tool.durability}`));
    if (d?.armor) tt.appendChild(el('div', 'sub', `armor +${d.armor.defense}  durability ${d.armor.durability - (st.dmg || 0)}/${d.armor.durability}`));
    if (d?.food) tt.appendChild(el('div', 'sub', `food +${d.food.hunger}  saturation +${d.food.saturation}`));
    if (fuelValue(st.id) && !d?.food) tt.appendChild(el('div', 'sub', `fuel: ${(fuelValue(st.id) / 200).toFixed(1)} items`));
    if (d?.light) tt.appendChild(el('div', 'sub', `light level ${d.light}`));
    tt.hidden = false;
  }
  canPlace(ref, stack) {
    if (!stack) return true;
    if (ref.kind === 'craftOut' || ref.kind === 'furnaceOut' || ref.kind === 'creative') return false;
    if (ref.kind === 'armor') { const d = getItem(stack.id); if (ref.index === 0 && stack.id === B.carved_pumpkin) return true; return !!(d?.armor && d.armor.slot === ref.index); }
    if (ref.kind === 'furnaceFuel') return fuelValue(stack.id) > 0;
    if (ref.kind === 'furnaceIn') return SMELTING.has(stack.id);
    if (ref.kind === 'trash') return true;
    return true;
  }
  slotClick(ref, button, shift, detail) {
    const g = this.game; const slots = ref.slots, i = ref.index; const st = slots[i]; const cur = this.cursor;
    if (ref.kind === 'creative') { if (!st) { if (cur) { this.cursor = null; } this.refresh(); return; } if (shift) { g.player.inventory.add(makeStack(st.id, maxStack(st.id))); } else if (cur && cur.id === st.id) { cur.count = Math.min(maxStack(st.id), cur.count + (button === 2 ? 1 : maxStack(st.id))); } else this.cursor = makeStack(st.id, button === 2 ? 1 : maxStack(st.id)); this.refresh(); return; }
    if (ref.kind === 'trash') { if (cur) this.cursor = null; this.refresh(); return; }
    if (ref.kind === 'craftOut') { this.takeCraft(ref, shift); return; }
    if (ref.kind === 'furnaceOut') { if (!st) return; if (shift) { const left = g.player.inventory.add(st); slots[i] = left > 0 ? { ...st, count: left } : null; } else if (!cur) { this.cursor = st; slots[i] = null; } else if (canMerge(cur, st) && cur.count + st.count <= maxStack(st.id)) { cur.count += st.count; slots[i] = null; } this.onFurnaceTake(ref); this.refresh(); return; }
    if (shift) { this.quickMove(ref); this.refresh(); return; }
    if (detail >= 2 && button === 0 && cur) { this.gather(cur); this.refresh(); return; }
    if (button === 0) {
      if (!cur) { if (st) { slots[i] = null; this.cursor = st; } }
      else if (!st) { if (this.canPlace(ref, cur)) { slots[i] = cur; this.cursor = null; } }
      else if (canMerge(cur, st)) { const n = Math.min(maxStack(st.id) - st.count, cur.count); st.count += n; cur.count -= n; if (cur.count <= 0) this.cursor = null; }
      else if (this.canPlace(ref, cur)) { slots[i] = cur; this.cursor = st; }
    } else if (button === 2) {
      if (!cur) { if (st) { const half = Math.ceil(st.count / 2); this.cursor = { id: st.id, count: half, dmg: st.dmg }; st.count -= half; if (st.count <= 0) slots[i] = null; } }
      else if (!st) { if (this.canPlace(ref, cur)) { slots[i] = { id: cur.id, count: 1, dmg: cur.dmg }; cur.count--; if (cur.count <= 0) this.cursor = null; } }
      else if (canMerge(cur, st) && st.count < maxStack(st.id)) { st.count++; cur.count--; if (cur.count <= 0) this.cursor = null; }
    }
    this.afterChange(ref); this.refresh();
  }
  gather(cur) { for (const ref of this.screen.slots) { if (ref.kind === 'creative' || ref.kind === 'craftOut' || ref.kind === 'furnaceOut') continue; const st = ref.slots[ref.index]; if (st && st !== cur && canMerge(cur, st)) { const n = Math.min(maxStack(cur.id) - cur.count, st.count); st.count -= n; cur.count += n; if (st.count <= 0) ref.slots[ref.index] = null; if (cur.count >= maxStack(cur.id)) break; } } }
  quickMove(ref) {
    const g = this.game, inv = g.player.inventory; const st = ref.slots[ref.index]; if (!st) return;
    const containers = this.screen.slots.filter(r => r.kind !== 'inv' && r.kind !== 'hotbar' && r.kind !== 'craftOut' && r.kind !== 'furnaceOut' && r.kind !== 'creative' && r.kind !== 'trash');
    const put = (targets, stack) => { for (const t of targets) { if (!this.canPlace(t, stack)) continue; const ts = t.slots[t.index]; if (canMerge(ts, stack)) { const n = Math.min(maxStack(stack.id) - ts.count, stack.count); ts.count += n; stack.count -= n; if (stack.count <= 0) return true; } } for (const t of targets) { if (!this.canPlace(t, stack)) continue; if (!t.slots[t.index]) { t.slots[t.index] = { ...stack }; stack.count = 0; return true; } } return false; };
    if (ref.kind === 'inv' || ref.kind === 'hotbar') {
      const d = getItem(st.id); const armorSlots = containers.filter(c => c.kind === 'armor');
      if (d?.armor && armorSlots.length && !armorSlots[d.armor.slot].slots[d.armor.slot]) { armorSlots[d.armor.slot].slots[d.armor.slot] = st; ref.slots[ref.index] = null; return; }
      const others = containers.filter(c => c.kind !== 'armor' && c.kind !== 'offhand');
      if (others.length) { put(others, st); if (st.count <= 0) ref.slots[ref.index] = null; return; }
      const dest = this.screen.slots.filter(r => r.kind === (ref.kind === 'inv' ? 'hotbar' : 'inv')); put(dest, st); if (st.count <= 0) ref.slots[ref.index] = null;
    } else { const dest = this.screen.slots.filter(r => r.kind === 'hotbar').concat(this.screen.slots.filter(r => r.kind === 'inv')); put(dest, st); if (st.count <= 0) ref.slots[ref.index] = null; }
    this.afterChange(ref);
  }
  swapWithHotbar(ref, n) { if (ref.kind === 'creative') { const st = ref.slots[ref.index]; if (st) this.game.player.inventory.slots[n] = makeStack(st.id, maxStack(st.id)); this.refresh(); return; } if (ref.kind === 'craftOut' || ref.kind === 'furnaceOut') return; const inv = this.game.player.inventory; const a = ref.slots[ref.index], b = inv.slots[n]; if (b && !this.canPlace(ref, b)) return; ref.slots[ref.index] = b || null; inv.slots[n] = a || null; this.afterChange(ref); this.refresh(); }
  dropFromSlot(ref, all) { const st = ref.slots[ref.index]; if (!st || ref.kind === 'creative' || ref.kind === 'craftOut') return; const n = all ? st.count : 1; this.game.dropStack({ id: st.id, count: n, dmg: st.dmg }); st.count -= n; if (st.count <= 0) ref.slots[ref.index] = null; this.afterChange(ref); this.refresh(); }
  afterChange(ref) { if (ref.kind === 'craft') this.updateCraft(); if (ref.kind.startsWith('furnace')) { } this.game.world.markModified(this.game.player.x, this.game.player.z); if (this.screen.te) this.game.world.markModified(this.screen.te.x, this.screen.te.z); }
  // crafting
  updateCraft() { const s = this.screen; if (!s.craft) return; const r = findRecipe(s.craft.slots); s.craftOut[0] = r ? makeStack(r.id, r.count) : null; s.lastRecipe = r; }
  takeCraft(ref, shift) {
    const s = this.screen; const out = s.craftOut[0]; if (!out) return;
    const consume = () => { for (let i = 0; i < s.craft.slots.length; i++) { const st = s.craft.slots[i]; if (!st) continue; const d = getItem(st.id); st.count--; if (d?.bucket && d.bucket !== 'empty') { s.craft.slots[i] = makeStack(I.bucket, 1); continue; } if (st.count <= 0) s.craft.slots[i] = null; } };
    if (shift) { let n = 0; while (n < 64) { const r = findRecipe(s.craft.slots); if (!r) break; const left = this.game.player.inventory.add(makeStack(r.id, r.count)); if (left > 0) { this.game.player.inventory.remove(r.id, r.count - left); break; } consume(); n++; } }
    else { if (!this.cursor) { this.cursor = { ...out }; consume(); } else if (canMerge(this.cursor, out) && this.cursor.count + out.count <= maxStack(out.id)) { this.cursor.count += out.count; consume(); } else return; }
    this.updateCraft(); this.game.audio.play('click'); this.refresh();
  }
  buildCraftArea(parent, size) {
    const s = this.screen; s.craft = new Container(size * size); s.craftOut = [null];
    const area = el('div', 'inv-layout'); area.style.alignItems = 'center'; parent.appendChild(area);
    this.addGrid(area, { slots: s.craft.slots, offset: 0, count: size * size, cols: size, kind: 'craft' });
    area.appendChild(el('div', 'arrow'));
    this.addGrid(area, { slots: s.craftOut, offset: 0, count: 1, cols: 1, kind: 'craftOut' });
    s.onClose = () => { for (const st of s.craft.slots) if (st) this.game.player.give(st); };
    return area;
  }
  buildRecipeBook(parent, size) {
    const s = this.screen; const inv = this.game.player.inventory;
    const book = el('div', 'recipe-book'); parent.appendChild(book);
    const render = () => {
      book.innerHTML = '';
      const list = craftableRecipes((id) => inv.count(id) + (s.craft.slots.reduce((a, st) => a + (st && st.id === id ? st.count : 0), 0)), size);
      for (const r of list.slice(0, 120)) { const sl = el('div', 'slot'); this.renderSlot(sl, makeStack(r.result, r.count), false); sl.title = itemName(r.result); sl.onmousedown = (e) => { e.preventDefault(); this.fillRecipe(r, size, e.shiftKey); }; book.appendChild(sl); }
      if (!list.length) book.appendChild(el('div', 'help-text', 'No craftable recipes with your items'));
    };
    render(); s.recipeRender = render;
    const prevRefresh = s.update; s.update = () => { if (prevRefresh) prevRefresh(); };
    s._bookRender = render;
  }
  fillRecipe(r, size, all) {
    const s = this.screen; const inv = this.game.player.inventory;
    for (const st of s.craft.slots) if (st) inv.add(st); s.craft.slots.fill(null);
    const ings = r.type === 'shaped' ? r.rows : [r.ings];
    const w = r.type === 'shaped' ? r.w : Math.min(size, r.ings.length);
    let ok = true;
    for (let y = 0; y < ings.length && ok; y++) for (let x = 0; x < ings[y].length && ok; x++) {
      const ing = ings[y][x]; if (!ing) continue; const gi = r.type === 'shaped' ? y * size + x : (y * size + x);
      const opts = ingredientOptions(ing); const id = opts.find(o => inv.count(o) > 0); if (id === undefined) { ok = false; break; }
      inv.remove(id, 1); s.craft.slots[gi] = makeStack(id, 1);
    }
    if (all) { let added = true; while (added) { added = false; const test = s.craft.slots.map(st => st ? st.id : null); if (test.every((id, i) => !id || inv.count(id) > 0) && s.craft.slots.some(st => st && st.count < maxStack(st.id))) { for (let i = 0; i < s.craft.slots.length; i++) { const st = s.craft.slots[i]; if (st) { if (st.count >= maxStack(st.id)) { added = false; break; } inv.remove(st.id, 1); st.count++; added = true; } } } } }
    this.updateCraft(); this.refresh(); if (s._bookRender) s._bookRender();
  }
  openInventory() {
    const g = this.game, p = g.player;
    if (p.creative) return this.openCreative();
    this.openScreen('inventory', (box) => {
      box.appendChild(el('h3', '', 'Crafting'));
      const top = el('div', 'inv-layout'); box.appendChild(top);
      const armorSec = el('div', 'inv-section'); top.appendChild(armorSec);
      this.addGrid(armorSec, { slots: p.inventory.armor, offset: 0, count: 4, cols: 1, kind: 'armor', icons: ['⛑', '👕', '👖', '👢'] });
      const mid = el('div', 'inv-section'); top.appendChild(mid);
      this.buildCraftArea(mid, 2);
      const off = el('div'); off.appendChild(el('div', 'help-text', 'Offhand')); this.addGrid(off, { slots: p.inventory.offhand, offset: 0, count: 1, cols: 1, kind: 'offhand' }); mid.appendChild(off);
      this.buildRecipeBook(top, 2);
      this.addPlayerInventory(box);
      box.appendChild(el('div', 'help-text', 'Shift-click to move quickly · right-click to split · 1-9 to swap into hotbar · Q to drop'));
      this.screen.update = () => { if (this.screen._bookRender) this.screen._bookRender(); };
    });
  }
  openCrafting(x, y, z) {
    this.openScreen('crafting', (box) => {
      box.appendChild(el('h3', '', 'Crafting Table'));
      const top = el('div', 'inv-layout'); box.appendChild(top);
      const mid = el('div', 'inv-section'); top.appendChild(mid); this.buildCraftArea(mid, 3);
      this.buildRecipeBook(top, 3);
      this.addPlayerInventory(box);
      this.screen.update = () => { if (this.screen._bookRender) this.screen._bookRender(); };
      this.screen.pos = [x, y, z];
    });
  }
  openChest(te, title = 'Chest') {
    te.slots = te.slots || new Array(27).fill(null);
    this.openScreen('chest', (box) => { box.appendChild(el('h3', '', title)); this.addGrid(box, { slots: te.slots, offset: 0, count: 27, cols: 9, kind: 'chest' }); box.appendChild(el('div', 'help-text', 'Inventory')); this.addPlayerInventory(box); this.screen.te = te; this.screen.pos = [te.x, te.y, te.z]; });
    this.game.audio.play('chest');
  }
  openFurnace(te, def) {
    te.slots = te.slots || [null, null, null];
    this.openScreen('furnace', (box) => {
      box.appendChild(el('h3', '', def.displayName));
      const lay = el('div', 'inv-layout'); lay.style.alignItems = 'center'; box.appendChild(lay);
      const col = el('div', 'inv-section'); lay.appendChild(col);
      this.addGrid(col, { slots: te.slots, offset: 0, count: 1, cols: 1, kind: 'furnaceIn' });
      const flame = el('div', 'flame'); col.appendChild(flame);
      this.addGrid(col, { slots: te.slots, offset: 1, count: 1, cols: 1, kind: 'furnaceFuel' });
      const arrow = el('div', 'arrow'); const fill = el('div', 'fill'); arrow.appendChild(fill); lay.appendChild(arrow);
      this.addGrid(lay, { slots: te.slots, offset: 2, count: 1, cols: 1, kind: 'furnaceOut' });
      this.addPlayerInventory(box);
      this.screen.te = te; this.screen.pos = [te.x, te.y, te.z];
      this.screen.update = () => { fill.style.width = (Math.min(1, (te.cook || 0) / 200) * 24) + 'px'; flame.style.setProperty('--p', (te.burnMax ? (te.burn / te.burnMax) * 100 : 0) + '%'); };
    });
  }
  onFurnaceTake(ref) { const te = this.screen.te; if (te && te.xp > 0) { const n = Math.floor(te.xp); if (n > 0 || Math.random() < te.xp) this.game.entities.spawnXP(this.game.player.x, this.game.player.y + 1, this.game.player.z, Math.max(1, n)); te.xp = 0; } }
  openCreative() {
    const p = this.game.player; let tab = this.creativeTab || 'building';
    this.openScreen('creative', (box) => {
      const tabs = el('div', 'tabs'); box.appendChild(tabs);
      const listWrap = el('div'); box.appendChild(listWrap);
      const list = []; const cont = { slots: list };
      const render = () => {
        tabs.innerHTML = ''; for (const [k, name] of CREATIVE_TABS) { const t = el('div', 'tab' + (k === tab ? ' active' : ''), name); t.onclick = () => { tab = k; this.creativeTab = k; render(); }; tabs.appendChild(t); }
        listWrap.innerHTML = ''; this.screen.slots = this.screen.slots.filter(r => r.kind !== 'creative');
        let items = [];
        const all = [...BLOCKS.filter(b => b.id && !b.hidden).map(b => b.id), ...[...ITEMS.keys()]];
        if (tab === 'search') { const inp = el('input', 'search'); inp.placeholder = 'Search items...'; inp.value = this.searchText || ''; inp.oninput = () => { this.searchText = inp.value; renderGrid(); }; listWrap.appendChild(inp); setTimeout(() => inp.focus(), 0); }
        const gridHolder = el('div', 'creative-grid'); listWrap.appendChild(gridHolder);
        const renderGrid = () => {
          gridHolder.innerHTML = ''; this.screen.slots = this.screen.slots.filter(r => r.kind !== 'creative');
          if (tab === 'search') { const q = (this.searchText || '').toLowerCase(); items = q ? all.filter(id => itemName(id).toLowerCase().includes(q)) : all; }
          else items = all.filter(id => (getItem(id).tab || 'misc') === tab);
          list.length = 0; for (const id of items) list.push({ id, count: 1 });
          this.addGrid(gridHolder, { slots: list, offset: 0, count: list.length, cols: 9, kind: 'creative' });
          this.refresh();
        };
        renderGrid();
      };
      render();
      box.appendChild(el('div', 'help-text', 'Click an item to pick up a stack · shift-click to add to inventory · click the trash slot to delete'));
      const bottom = el('div', 'inv-layout'); box.appendChild(bottom);
      this.addPlayerInventory(bottom);
      const side = el('div', 'inv-section'); bottom.appendChild(side);
      side.appendChild(el('div', 'help-text', 'Armor')); this.addGrid(side, { slots: p.inventory.armor, offset: 0, count: 4, cols: 4, kind: 'armor', icons: ['⛑', '👕', '👖', '👢'] });
      const trash = [null]; side.appendChild(el('div', 'help-text', 'Delete')); this.addGrid(side, { slots: trash, offset: 0, count: 1, cols: 1, kind: 'trash', icons: ['🗑'] });
    });
  }
  openTrade(villager) {
    const g = this.game, p = g.player;
    if (!villager.trades) villager.trades = makeTrades();
    this.openScreen('trade', (box) => {
      box.appendChild(el('h3', '', villager.profession + ' Villager'));
      const list = el('div'); box.appendChild(list);
      const render = () => {
        list.innerHTML = '';
        for (const t of villager.trades) {
          const row = el('div', 'trade'); const a = el('div', 'slot'); this.renderSlot(a, makeStack(t.in, t.inN), false); row.appendChild(a); row.appendChild(el('span', '', '→')); const b = el('div', 'slot'); this.renderSlot(b, makeStack(t.out, t.outN), false); row.appendChild(b);
          const can = p.inventory.count(t.in) >= t.inN && t.uses < 8; if (!can) row.classList.add('disabled');
          const btn = el('button', 'mc-btn', can ? 'Trade' : t.uses >= 8 ? 'Sold out' : 'Need ' + t.inN + ' ' + itemName(t.in)); btn.disabled = !can; btn.onclick = () => { p.inventory.remove(t.in, t.inN); p.give(makeStack(t.out, t.outN)); t.uses++; g.audio.play('villager'); g.entities.spawnXP(villager.x, villager.y + 1, villager.z, 2); render(); }; row.appendChild(btn); list.appendChild(row);
        }
      };
      render();
      const close = el('button', 'mc-btn', 'Done'); close.onclick = () => this.closeScreen(); box.appendChild(close);
    });
    g.audio.play('villager');
  }
}
function makeTrades() {
  const profs = {
    Farmer: [['wheat', 20, 'emerald', 1], ['emerald', 1, 'bread', 6], ['carrot', 22, 'emerald', 1], ['emerald', 1, 'apple', 4], ['emerald', 3, 'golden_carrot', 3], ['emerald', 1, 'pumpkin_pie', 4]],
    Librarian: [['paper', 24, 'emerald', 1], ['emerald', 6, 'bookshelf', 3], ['book', 4, 'emerald', 1], ['emerald', 12, 'enchanted_book', 1], ['emerald', 1, 'lantern', 1], ['emerald', 4, 'compass', 1]],
    Toolsmith: [['coal', 15, 'emerald', 1], ['emerald', 1, 'stone_pickaxe', 1], ['iron_ingot', 4, 'emerald', 1], ['emerald', 8, 'iron_pickaxe', 1], ['emerald', 22, 'diamond_pickaxe', 1], ['flint', 30, 'emerald', 1]],
    Cleric: [['rotten_flesh', 32, 'emerald', 1], ['emerald', 1, 'redstone', 2], ['gold_ingot', 3, 'emerald', 1], ['emerald', 3, 'lapis_lazuli', 1], ['emerald', 5, 'ender_pearl', 1], ['emerald', 4, 'glowstone', 1]],
    Butcher: [['chicken', 14, 'emerald', 1], ['emerald', 1, 'cooked_porkchop', 5], ['beef', 10, 'emerald', 1], ['emerald', 1, 'cooked_chicken', 8], ['coal', 15, 'emerald', 1]],
    Armorer: [['coal', 15, 'emerald', 1], ['emerald', 5, 'iron_helmet', 1], ['emerald', 9, 'iron_chestplate', 1], ['iron_ingot', 4, 'emerald', 1], ['emerald', 4, 'shield', 1], ['emerald', 25, 'diamond_chestplate', 1]],
    Shepherd: [['white_wool', 18, 'emerald', 1], ['emerald', 2, 'shears', 1], ['emerald', 1, 'red_wool', 1], ['emerald', 1, 'blue_wool', 1], ['emerald', 3, 'bed', 1], ['emerald', 1, 'painting', 2]],
    Fisherman: [['string', 20, 'emerald', 1], ['emerald', 1, 'cooked_cod', 6], ['cod', 6, 'emerald', 1], ['emerald', 3, 'fishing_rod', 1], ['emerald', 2, 'cooked_salmon', 4]],
  };
  const names = Object.keys(profs); const prof = names[Math.floor(Math.random() * names.length)];
  const trades = profs[prof].map(([a, an, b, bn]) => { try { return { in: I[a] ?? B[a], inN: an, out: I[b] ?? B[b], outN: bn, uses: 0 }; } catch { return null; } }).filter(t => t && t.in !== undefined && t.out !== undefined);
  trades.profession = prof;
  return Object.assign(trades, { profession: prof });
}
// Ensure profession is visible on the villager
const _origOpenTrade = UI.prototype.openTrade;
UI.prototype.openTrade = function (villager) { if (!villager.trades) { villager.trades = makeTrades(); } villager.profession = villager.trades.profession; return _origOpenTrade.call(this, villager); };

// ---------- options builder (shared with the title screen) ----------
export function buildOptions(body, settings, onChange, game = null) {
  body.innerHTML = '';
  const slider = (label, key, min, max, step, fmt) => {
    const row = el('div', 'opt-row'); row.appendChild(el('span', '', label)); const wrap = el('div', 'slider-wrap'); const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = settings[key]; const val = el('b', '', fmt(settings[key])); inp.oninput = () => { settings[key] = parseFloat(inp.value); val.textContent = fmt(settings[key]); onChange(settings); }; wrap.appendChild(inp); wrap.appendChild(val); row.appendChild(wrap); body.appendChild(row);
  };
  const toggle = (label, key) => { const row = el('div', 'opt-row'); row.appendChild(el('span', '', label)); const b = el('button', 'mc-btn small', settings[key] ? 'ON' : 'OFF'); b.onclick = () => { settings[key] = !settings[key]; b.textContent = settings[key] ? 'ON' : 'OFF'; onChange(settings); }; row.appendChild(b); body.appendChild(row); };
  slider('Render Distance', 'renderDistance', 3, 12, 1, v => v + ' chunks');
  slider('FOV', 'fov', 50, 110, 1, v => v);
  slider('Mouse Sensitivity', 'sensitivity', 0.1, 2, 0.05, v => Math.round(v * 100) + '%');
  slider('Sound Volume', 'volume', 0, 1, 0.05, v => Math.round(v * 100) + '%');
  slider('Music Volume', 'music', 0, 1, 0.05, v => Math.round(v * 100) + '%');
  toggle('Auto-Jump', 'autoJump');
  toggle('Show FPS', 'showFps');
  toggle('Fancy Graphics (clouds, rain)', 'fancyGraphics');
  if (game) {
    const row = el('div', 'opt-row'); row.appendChild(el('span', '', 'Difficulty')); const names = ['Peaceful', 'Easy', 'Normal', 'Hard']; const b = el('button', 'mc-btn small', names[game.difficulty]); b.disabled = game.hardcore; b.onclick = () => { game.difficulty = (game.difficulty + 1) % 4; b.textContent = names[game.difficulty]; }; row.appendChild(b); body.appendChild(row);
  }
}
