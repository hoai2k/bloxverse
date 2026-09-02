// DOM user interface: HUD, inventory & container screens, chat, pause/options, death screen, debug overlay.
import { BLOCKS, B } from './blocks.js';
import { I, ITEMS, getItem, isBlockItem, maxStack, canMerge, makeStack, itemName, fuelValue, SMELTING } from './items.js';
import { itemIcon } from './textures.js';
import { findRecipe, craftableRecipes, recipeIngredients, ingredientOptions, RECIPES } from './crafting.js';
import { Container } from './inventory.js';
import { runCommand, completeCommand } from './commands.js';
import { VERSION, CHANGELOG, UPDATE_NAME, markUpdateSeen } from './version.js';
import { enchantLines, isEnchanted, rollEnchantments, applyEnchant, anvilResult, applicable } from './enchant.js';

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

function iconCopy(name) { const src = ICONS[name]; const c = src.cloneNode(true); c.getContext('2d').drawImage(src, 0, 0); return c; }
const CREATIVE_TABS = [['building', 'Building'], ['nature', 'Nature'], ['functional', 'Functional'], ['redstone', 'Redstone'], ['colored', 'Colored'], ['tools', 'Tools'], ['combat', 'Combat'], ['food', 'Food'], ['materials', 'Materials'], ['spawn_eggs', 'Spawn Eggs'], ['misc', 'Misc'], ['search', 'Search']];

export class UI {
  constructor(game) {
    this.game = game; this.huds = new Map(); this.globalScreen = null; this.globalBox = null;
    this.debugOn = false; this.toastT = 0; this.titleT = 0; this.chatHistory = []; this.histIdx = -1;
    this.chatPlayer = null; this.suggest = null; this.suggestIdx = 0;
    this.viewsRoot = document.getElementById('views');
    this.modalRoot = document.getElementById('modal');
    this.bindGlobal();
  }
  reset() {
    for (const [p, hud] of this.huds) hud.root.remove();
    this.huds.clear(); this.globalScreen = null;
    if (this.globalBox) { this.globalBox.remove(); this.globalBox = null; }
    document.getElementById('modal').hidden = true;
  }
  get screenOpen() { return this.game.anyScreenOpen(); }
  get chatOpen() { return !!this.chatPlayer; }

  // ---------- per-player HUD + modal container ----------
  addPlayerHud(p) {
    const root = el('div', 'pview');
    root.innerHTML = `<div class="crosshair"></div><div class="ov water"></div><div class="ov fire"></div><div class="ov portal"></div><div class="ov pumpkin"></div>
      <div class="pname"></div><div class="ptoast"></div>
      <div class="status"><div class="stat-row hearts"></div><div class="stat-row hunger"></div><div class="stat-row armor"></div><div class="stat-row air"></div>
      <div class="xp"><div class="xp-fill"></div><div class="xp-level"></div></div><div class="item-name"></div><div class="hotbar"></div><div class="slot offhand"></div></div>`;
    this.viewsRoot.appendChild(root);
    const modal = el('div', 'modal-slot'); const box = el('div', 'modal-box'); modal.appendChild(box);
    this.modalRoot.appendChild(modal);
    const hud = { root, box, modal, hotbar: [], cache: {}, nameT: 0, toastT: 0, flashT: 0 };
    const hb = root.querySelector('.hotbar');
    for (let i = 0; i < 9; i++) { const sl = el('div', 'slot'); hb.appendChild(sl); hud.hotbar.push(sl); }
    root.querySelector('.pname').textContent = p.name;
    root.querySelector('.pname').style.display = this.game.players.length > 1 ? '' : 'none';
    this.huds.set(p, hud); p.hud = hud;
    return hud;
  }
  removePlayerHud(p) { const h = this.huds.get(p); if (h) { h.root.remove(); h.modal.remove(); this.huds.delete(p); } p.hud = null; }
  layoutHuds() {
    const rects = this.game.renderer.layoutViews();
    const multi = this.game.players.length > 1;
    this.game.players.forEach((p, i) => {
      const h = this.huds.get(p); if (!h) return;
      const r = rects[i] || [0, 0, window.innerWidth, window.innerHeight];
      for (const node of [h.root, h.modal]) { node.style.left = r[0] + 'px'; node.style.top = r[1] + 'px'; node.style.width = r[2] + 'px'; node.style.height = r[3] + 'px'; }
      h.root.classList.toggle('split', multi);
      h.modal.classList.toggle('small', r[3] < 420 || r[2] < 620);
      const nm = h.root.querySelector('.pname'); nm.textContent = p.name; nm.style.display = multi ? '' : 'none';
    });
    document.getElementById('hud').classList.toggle('split', multi);
    // keep chat, debug and the boss bar inside player 1's view when split
    const r0 = rects[0] || [0, 0, window.innerWidth, window.innerHeight];
    const chat = $('#chat'); chat.style.left = (r0[0] + 8) + 'px'; chat.style.bottom = (window.innerHeight - r0[1] - r0[3] + (multi ? 46 : 96)) + 'px'; chat.style.width = Math.min(560, r0[2] * 0.75) + 'px';
    const dbg = $('#debug'); dbg.style.left = (r0[0] + 6) + 'px'; dbg.style.top = (r0[1] + 6) + 'px';
  }

  // ---------- HUD ----------
  renderSlot(slotEl, stack, cache = true) {
    const key = stack ? stack.id + ':' + stack.count + ':' + (stack.dmg || 0) + ':' + (stack.ench ? JSON.stringify(stack.ench) : '') : '';
    if (cache && slotEl.dataset.key === key) return; slotEl.dataset.key = key;
    slotEl.innerHTML = '';
    if (!stack) return;
    const ic = itemIcon(stack.id); const c = document.createElement('canvas'); c.width = 32; c.height = 32; c.getContext('2d').drawImage(ic, 0, 0); if (isEnchanted(stack)) c.classList.add('glint'); slotEl.appendChild(c);
    if (stack.count > 1) slotEl.appendChild(el('span', 'count', String(stack.count)));
    const d = getItem(stack.id); const dur = d?.tool?.durability || d?.armor?.durability;
    if (dur && stack.dmg > 0) { const bar = el('div', 'dur'); const f = el('i'); const pr = 1 - stack.dmg / dur; f.style.width = (pr * 100) + '%'; f.style.background = pr > 0.5 ? '#4f4' : pr > 0.25 ? '#ff4' : '#f44'; bar.appendChild(f); slotEl.appendChild(bar); }
  }
  updateHUD(dt) {
    for (const p of this.game.players) this.updatePlayerHUD(p, dt);
    const g = this.game;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('#toast').style.opacity = 0; }
    if (this.titleT > 0) { this.titleT -= dt; if (this.titleT <= 0) { $('#title-big').style.opacity = 0; $('#title-small').style.opacity = 0; } }
    if (!this.chatOpen) for (const line of $('#chat-log').children) { if (line._t && performance.now() - line._t > 10000) line.classList.add('faded'); }
    const boss = g.bossEntity; const bb = $('#bossbar');
    if (boss && !boss.dead && !boss.removed) { bb.hidden = false; bb.querySelector('.boss-name').textContent = 'Ender Dragon'; bb.querySelector('.boss-fill').style.width = Math.max(0, boss.health / boss.maxHealth * 100) + '%'; } else bb.hidden = true;
    const so = $('#sleep-overlay'); const sleeper = g.players.find(p => p.sleeping);
    if (sleeper) { so.hidden = false; so.style.opacity = Math.min(1, sleeper.sleepT / 2); so.firstElementChild.textContent = g.players.length > 1 ? `Sleeping (${g.players.filter(p => p.sleeping).length}/${g.livePlayers().length})...` : 'Sleeping...'; }
    else if (!so.hidden) { so.style.opacity = 0; setTimeout(() => { if (!g.players.some(p => p.sleeping)) so.hidden = true; }, 500); }
    if (this.debugOn) this.updateDebug();
  }
  updatePlayerHUD(p, dt) {
    const hud = this.huds.get(p); if (!hud) return;
    const g = this.game; const cache = hud.cache; const q = (sel) => hud.root.querySelector(sel);
    for (let i = 0; i < 9; i++) { this.renderSlot(hud.hotbar[i], p.inventory.slots[i]); hud.hotbar[i].classList.toggle('selected', i === p.inventory.selected); }
    const off = q('.offhand'); this.renderSlot(off, p.inventory.offhand[0]); off.style.display = p.inventory.offhand[0] ? '' : 'none';
    const survival = !p.invulnerable;
    for (const cls of ['.hearts', '.hunger', '.armor', '.air', '.xp']) q(cls).style.display = survival ? '' : 'none';
    if (survival) {
      const hp = Math.ceil(p.health), abs = Math.ceil(p.effects.absorption); const hKey = hp + ':' + abs + ':' + (p.effects.poison > 0) + ':' + (p.hurtTimer > 0.4);
      if (cache.h !== hKey) { cache.h = hKey; const row = q('.hearts'); row.innerHTML = ''; const total = 10 + Math.ceil(abs / 2); for (let i = 0; i < Math.min(20, total); i++) { const v = hp - i * 2; let n = i >= 10 ? 'heart_abs' : v >= 2 ? (p.effects.poison > 0 ? 'heart_poison' : 'heart') : v === 1 ? 'heart_half' : 'heart_empty'; if (i >= 10 && abs - (i - 10) * 2 <= 0) n = 'heart_empty'; row.appendChild(iconCopy(n)); } }
      const hu = Math.ceil(p.hunger); if (cache.f !== hu) { cache.f = hu; const row = q('.hunger'); row.innerHTML = ''; for (let i = 9; i >= 0; i--) { const v = hu - i * 2; row.appendChild(iconCopy(v >= 2 ? 'food' : v === 1 ? 'food_half' : 'food_empty')); } }
      const ar = p.inventory.armorValue(); if (cache.a !== ar) { cache.a = ar; const row = q('.armor'); row.innerHTML = ''; if (ar > 0) for (let i = 0; i < 10; i++) { const v = ar - i * 2; row.appendChild(iconCopy(v >= 2 ? 'armor' : v === 1 ? 'armor_half' : 'armor_empty')); } }
      const air = p.headInWater ? Math.ceil(p.air / 30) : -1; if (cache.air !== air) { cache.air = air; const row = q('.air'); row.innerHTML = ''; if (air >= 0) for (let i = 0; i < air; i++) row.appendChild(iconCopy('bubble')); }
      const xk = p.level + ':' + Math.round(p.xpProgress / p.xpForLevel(p.level) * 100); if (cache.x !== xk) { cache.x = xk; q('.xp-fill').style.width = (p.xpProgress / p.xpForLevel(p.level) * 100) + '%'; q('.xp-level').textContent = p.level > 0 ? p.level : ''; }
    }
    const held = p.inventory.held; const nk = held ? held.id : 0;
    if (cache.n !== nk) { cache.n = nk; const nameEl = q('.item-name'); if (held) { nameEl.textContent = itemName(held.id); nameEl.style.opacity = 1; hud.nameT = 2; } else nameEl.style.opacity = 0; }
    if (hud.nameT > 0) { hud.nameT -= dt; if (hud.nameT <= 0) q('.item-name').style.opacity = 0; }
    q('.ov.water').style.display = p.headInWater ? 'block' : 'none';
    q('.ov.fire').style.display = p.fire > 0 || p.headInLava ? 'block' : 'none';
    const po = q('.ov.portal'); if (p.portalT > 0) { po.style.display = 'block'; po.style.background = `rgba(120,40,200,${Math.min(0.7, p.portalT / 4 * 0.7)})`; } else po.style.display = 'none';
    q('.ov.pumpkin').style.display = (p.inventory.armor[0] && p.inventory.armor[0].id === B.carved_pumpkin && p.thirdPerson === 0) ? 'block' : 'none';
    if (hud.toastT > 0) { hud.toastT -= dt; if (hud.toastT <= 0) q('.ptoast').style.opacity = 0; }
    if (hud.flashT > 0) { hud.flashT -= dt; if (hud.flashT <= 0) hud.root.classList.remove('hurt'); }
    hud.root.classList.toggle('dead', p.dead);
  }
  damageFlash(p = this.game.player) { const h = this.huds.get(p); if (!h) return; h.root.classList.add('hurt'); h.flashT = 0.4; if (p.input && p.input.rumble) p.input.rumble(140, 0.5, 0.3); }
  lightningFlash() { const f = $('#flash'); if (!f) return; f.style.opacity = '0.75'; setTimeout(() => { f.style.opacity = '0'; }, 90); }
  showToast(t) { $('#toast').textContent = t; $('#toast').style.opacity = 1; this.toastT = 3; }
  showToastFor(p, t) {
    const h = this.huds.get(p);
    if (!h || this.game.players.length === 1) return this.showToast(t);
    const el2 = h.root.querySelector('.ptoast'); el2.textContent = t; el2.style.opacity = 1; h.toastT = 3;
  }
  showTitle(big, small, t = 4, p = null) { $('#title-big').textContent = big; $('#title-small').textContent = small; $('#title-big').style.opacity = 1; $('#title-small').style.opacity = 1; this.titleT = t; }
  chatMessage(text, color = '#fff') { const log = $('#chat-log'); const line = el('div', 'chat-line', text); line.style.color = color; line._t = performance.now(); log.appendChild(line); while (log.children.length > 60) log.removeChild(log.firstChild); }
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

  // ---------- global input (keyboard/mouse drives player 1) ----------
  bindGlobal() {
    const g = this.game;
    document.addEventListener('keydown', (e) => {
      if (!g.running) return;
      const p = g.player; if (!p) return;
      if (this.chatOpen) return this.chatKey(e);
      if (this.globalScreen) {
        if (e.code === 'Escape') { if (this.globalScreen === 'options' || this.globalScreen === 'updatelog' || this.globalScreen === 'stats') this.openPause(p); else this.closeGlobal(); e.preventDefault(); }
        return;
      }
      if (p.screen) {
        if (e.code === 'Escape' || (e.code === 'KeyE' && p.screen.type !== 'death')) { if (p.screen.type !== 'death') this.closeScreen(p); e.preventDefault(); return; }
        if (p.screen.type !== 'death' && e.target.tagName !== 'INPUT') {
          if (e.code.startsWith('Digit') && this.lastHover) { const n = parseInt(e.code.slice(5)) - 1; if (n >= 0 && n < 9) { this.swapWithHotbar(this.lastHover, n); e.preventDefault(); } }
          if (e.code === 'KeyQ' && this.lastHover) { this.dropFromSlot(this.lastHover, e.ctrlKey); e.preventDefault(); }
        }
        return;
      }
      switch (e.code) {
        case 'Escape': this.openPause(p); break;
        case 'KeyE': if (p.dead) break; this.openInventory(p); e.preventDefault(); break;
        case 'KeyT': this.openChat(p, ''); e.preventDefault(); break;
        case 'Slash': this.openChat(p, '/'); e.preventDefault(); break;
        case 'KeyQ': g.dropHeld(p, e.ctrlKey); break;
        case 'F3': this.toggleDebug(); e.preventDefault(); break;
        case 'F5': p.thirdPerson = (p.thirdPerson + 1) % 3; e.preventDefault(); break;
        case 'F1': document.getElementById('hud').classList.toggle('hide-hud'); e.preventDefault(); break;
        case 'F2': g.screenshot(); e.preventDefault(); break;
        case 'KeyF': { const t = p.inventory.offhand[0]; p.inventory.offhand[0] = p.inventory.held; p.inventory.setHeld(t); this.invalidateInventory(p); break; }
        case 'F11': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); e.preventDefault(); break;
        default: if (e.code.startsWith('Digit')) { const n = parseInt(e.code.slice(5)) - 1; if (n >= 0 && n < 9) p.inventory.selected = n; }
      }
    });
    document.addEventListener('wheel', (e) => { if (!g.running || this.screenOpen) return; const inv = g.player.inventory; inv.selected = (inv.selected + (e.deltaY > 0 ? 1 : -1) + 9) % 9; }, { passive: true });
    $('#chat-input').addEventListener('blur', () => { if (this.chatOpen) setTimeout(() => { if (this.chatOpen) $('#chat-input').focus(); }, 0); });
    $('#chat-input').addEventListener('input', () => this.updateSuggestions());
    document.addEventListener('mousemove', (e) => { const cs = $('#cursor-stack'); cs.style.left = (e.clientX - 20) + 'px'; cs.style.top = (e.clientY - 20) + 'px'; const tt = $('#tooltip'); tt.style.left = (e.clientX + 14) + 'px'; tt.style.top = (e.clientY + 10) + 'px'; });
    $('#modal').addEventListener('mousedown', (e) => { const p = g.player; if (e.target.classList.contains('modal-slot') && p && p.cursor && p.screen && p.screen.type !== 'death') { g.dropStack(p.cursor, p); p.cursor = null; this.refresh(p); } });
    $('#modal').addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.layoutHuds());
  }
  // ---------- chat with command auto-complete ----------
  chatKey(e) {
    const inp = $('#chat-input');
    if (e.code === 'Escape') { this.closeChat(); e.preventDefault(); return; }
    if (e.code === 'Tab') { this.acceptSuggestion(); e.preventDefault(); return; }
    if (this.suggest && this.suggest.options.length && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
      this.suggestIdx = (this.suggestIdx + (e.code === 'ArrowDown' ? 1 : -1) + this.suggest.options.length) % this.suggest.options.length;
      this.renderSuggestions(); e.preventDefault(); return;
    }
    if (e.code === 'Enter') {
      const v = inp.value.trim();
      const p = this.chatPlayer || this.game.player;
      this.closeChat();
      if (v) { this.chatHistory.push(v); if (v.startsWith('/')) runCommand(this.game, v, p); else this.chatMessage('<' + p.name + '> ' + v); }
      e.preventDefault(); return;
    }
    if (e.code === 'ArrowUp') { if (this.chatHistory.length) { this.histIdx = Math.max(0, (this.histIdx < 0 ? this.chatHistory.length : this.histIdx) - 1); inp.value = this.chatHistory[this.histIdx]; this.updateSuggestions(); } e.preventDefault(); return; }
    if (e.code === 'ArrowDown') { if (this.histIdx >= 0) { this.histIdx++; inp.value = this.chatHistory[this.histIdx] || ''; if (this.histIdx >= this.chatHistory.length) this.histIdx = -1; this.updateSuggestions(); } e.preventDefault(); return; }
    setTimeout(() => this.updateSuggestions(), 0);
  }
  updateSuggestions() {
    const inp = $('#chat-input'); const box = $('#suggest');
    const res = inp.value.startsWith('/') ? completeCommand(this.game, inp.value, inp.selectionStart ?? inp.value.length) : null;
    if (!res || !res.options.length) { this.suggest = null; box.hidden = true; return; }
    if (!this.suggest || this.suggest.start !== res.start || this.suggest.options.length !== res.options.length || this.suggest.options[0]?.value !== res.options[0]?.value) this.suggestIdx = 0;
    this.suggest = res; this.renderSuggestions();
  }
  renderSuggestions() {
    const box = $('#suggest'); box.innerHTML = ''; box.hidden = false;
    const opts = this.suggest.options;
    const view = opts.slice(Math.max(0, this.suggestIdx - 4), Math.max(0, this.suggestIdx - 4) + 10);
    for (const o of view) {
      const d = el('div', 'sug' + (opts.indexOf(o) === this.suggestIdx ? ' active' : ''), o.label || o.value);
      if (o.desc) d.appendChild(el('span', 'sug-desc', o.desc));
      d.onmousedown = (e) => { e.preventDefault(); this.suggestIdx = opts.indexOf(o); this.acceptSuggestion(); };
      box.appendChild(d);
    }
    if (opts.length > view.length) box.appendChild(el('div', 'sug-more', `${this.suggestIdx + 1}/${opts.length} · Tab to complete`));
    else box.appendChild(el('div', 'sug-more', 'Tab to complete'));
  }
  acceptSuggestion() {
    if (!this.suggest || !this.suggest.options.length) return;
    const inp = $('#chat-input'); const o = this.suggest.options[this.suggestIdx];
    const caret = inp.selectionStart ?? inp.value.length;
    inp.value = inp.value.slice(0, this.suggest.start) + o.value + inp.value.slice(caret) + '';
    const pos = this.suggest.start + o.value.length;
    if (!inp.value.slice(pos).startsWith(' ')) inp.value = inp.value.slice(0, pos) + ' ' + inp.value.slice(pos);
    inp.setSelectionRange(pos + 1, pos + 1);
    this.updateSuggestions();
  }
  openChat(p, prefix) {
    this.chatPlayer = p || this.game.player; const inp = $('#chat-input'); inp.hidden = false; inp.value = prefix; this.histIdx = -1;
    setTimeout(() => { inp.focus(); this.updateSuggestions(); }, 0);
    document.exitPointerLock && document.exitPointerLock();
    for (const line of $('#chat-log').children) line.classList.remove('faded');
    if (this.chatPlayer) this.chatPlayer.chatOpen = true;
  }
  closeChat() {
    if (this.chatPlayer) this.chatPlayer.chatOpen = false;
    this.chatPlayer = null; const inp = $('#chat-input'); inp.hidden = true; inp.value = ''; inp.blur();
    this.suggest = null; $('#suggest').hidden = true;
    this.game.requestPointerLock();
  }
  toggleDebug() { this.debugOn = !this.debugOn; $('#debug').hidden = !this.debugOn; }
  // ---------- generic slot screens (one modal per player, inside their viewport) ----------
  invalidateInventory(p = null) {
    for (const pl of this.game.players) if (!p || pl === p) { if (pl.screen && pl.screen.refresh) pl.screen.refresh(); }
  }
  boxFor(p) { const h = this.huds.get(p); return h ? h.box : null; }
  openScreen(p, type, build) {
    this.closeScreen(p, true);
    const box = this.boxFor(p); if (!box) return;
    box.innerHTML = ''; box.className = 'modal-box';
    p.screen = { type, slots: [], refresh: null, player: p };
    build(box);
    this.huds.get(p).modal.classList.add('open');
    $('#modal').hidden = false;
    if (p.input && p.input.kind === 'keyboard') document.exitPointerLock && document.exitPointerLock();
    p.gpSlot = 0;
    this.refresh(p);
    this.highlightGamepadSlot(p);
  }
  closeScreen(p, silent = false) {
    if (typeof p === 'boolean' || p === undefined) p = this.game.player;
    if (!p || !p.screen) return;
    const scr = p.screen;
    if (scr.onClose) scr.onClose();
    if (p.cursor) { p.give(p.cursor); p.cursor = null; }
    p.screen = null;
    const h = this.huds.get(p); if (h) { h.modal.classList.remove('open'); h.box.innerHTML = ''; }
    $('#tooltip').hidden = true; $('#cursor-stack').hidden = true; this.lastHover = null;
    if (!this.game.players.some(pl => pl.screen)) $('#modal').hidden = true;
    if (!silent && p.input && p.input.kind === 'keyboard') this.game.requestPointerLock();
  }
  closeAllScreens() { for (const p of this.game.players) this.closeScreen(p, true); this.closeGlobal(true); }
  // ---------- global (whole-game) screens: pause, options, stats, update log ----------
  openGlobal(type, build) {
    this.closeGlobal(true);
    this.globalScreen = type;
    const wrap = el('div', 'modal-slot global open'); const box = el('div', 'modal-box pause'); wrap.appendChild(box);
    this.modalRoot.appendChild(wrap); this.globalBox = wrap;
    build(box);
    $('#modal').hidden = false;
    document.exitPointerLock && document.exitPointerLock();
    this.globalBtn = 0; this.highlightGlobalButton();
  }
  closeGlobal(silent = false) {
    if (!this.globalScreen) return;
    this.globalScreen = null; if (this.globalBox) { this.globalBox.remove(); this.globalBox = null; }
    if (!this.game.players.some(pl => pl.screen)) $('#modal').hidden = true;
    if (!silent) this.game.requestPointerLock();
  }
  globalButtons() { return this.globalBox ? [...this.globalBox.querySelectorAll('button.mc-btn:not(:disabled)')] : []; }
  highlightGlobalButton() { const bs = this.globalButtons(); bs.forEach((b, i) => b.classList.toggle('gp-focus', i === this.globalBtn)); }
  openPause(p = this.game.player) {
    this.openGlobal('pause', (pb) => {
      pb.appendChild(el('h2', '', 'Game Menu'));
      const mk = (t, fn) => { const b = el('button', 'mc-btn', t); b.onclick = fn; pb.appendChild(b); return b; };
      mk('Back to Game', () => this.closeGlobal());
      mk('Options...', () => this.openOptions());
      mk('Statistics', () => this.openStats());
      mk('Update Log', () => this.openUpdateLog(() => this.openPause()));
      if (this.game.players.length < 4) pb.appendChild(el('div', 'help-text', 'Press START on another controller to join'));
      mk('Save & Quit to Title', () => this.game.quitToTitle());
    });
  }
  openStats() {
    this.openGlobal('stats', (pb) => {
      pb.appendChild(el('h2', '', 'Statistics'));
      const g = this.game; const d = Math.floor(g.time / 24000);
      for (const p of g.players) {
        const st = p.stats; const sec = el('div', 'stats-list');
        sec.innerHTML = `<b>${p.name}</b><br>Blocks mined: ${st.blocksMined}<br>Blocks placed: ${st.blocksPlaced}<br>Distance walked: ${Math.round(st.distance)} m<br>Deaths: ${st.deaths}<br>Score: ${p.score}`;
        pb.appendChild(sec);
      }
      pb.appendChild(el('div', 'stats-list', `Days survived: ${d}\nMobs killed: ${g.stats.mobKills || 0}`));
      const b = el('button', 'mc-btn', 'Done'); b.onclick = () => this.openPause(); pb.appendChild(b);
    });
  }
  openOptions() {
    this.openGlobal('options', (pb) => {
      pb.appendChild(el('h2', '', 'Options'));
      const body = el('div'); pb.appendChild(body);
      buildOptions(body, this.game.settings, (st) => this.game.applySettings(st), this.game);
      const b = el('button', 'mc-btn', 'Done'); b.onclick = () => this.openPause(); pb.appendChild(b);
    });
  }
  openUpdateLog(back = null) {
    markUpdateSeen();
    this.openGlobal('updatelog', (pb) => {
      pb.appendChild(el('h2', '', 'Update Log'));
      const list = el('div', 'changelog'); pb.appendChild(list);
      for (const c of CHANGELOG) {
        const entry = el('div', 'log-entry' + (c.major ? ' major' : ''));
        const head = el('div', 'log-head');
        head.appendChild(el('span', 'log-ver', c.version + (c.version === VERSION ? '  (current)' : '')));
        if (c.name) head.appendChild(el('span', 'log-name', c.name));
        head.appendChild(el('span', 'log-date', c.date));
        entry.appendChild(head);
        const ul = el('ul'); for (const ch of c.changes) ul.appendChild(el('li', '', ch)); entry.appendChild(ul);
        list.appendChild(entry);
      }
      const b = el('button', 'mc-btn', 'Done'); b.onclick = () => { if (back) back(); else this.closeGlobal(); }; pb.appendChild(b);
    });
  }
  showDeath(p, cause) {
    this.openScreen(p, 'death', (box) => {
      box.className = 'modal-box pause';
      const pb = el('div', 'death-box'); box.appendChild(pb);
      pb.appendChild(el('h1', '', 'You Died!'));
      pb.appendChild(el('p', '', p.name + ' ' + cause));
      pb.appendChild(el('p', '', 'Score: ' + p.score));
      if (this.game.hardcore && p.index === 0) {
        pb.appendChild(el('p', '', 'Hardcore mode: this world is over.'));
        const b = el('button', 'mc-btn', 'Spectate World'); b.onclick = () => { this.closeScreen(p); p.respawn(); p.setGamemode('spectator'); }; pb.appendChild(b);
      } else {
        const b = el('button', 'mc-btn', 'Respawn'); b.onclick = () => { this.closeScreen(p); p.respawn(); }; pb.appendChild(b);
        if (p.index > 0) { const l = el('button', 'mc-btn', 'Leave Game'); l.onclick = () => this.game.removePlayer(p); pb.appendChild(l); }
      }
      if (p.index === 0) { const q = el('button', 'mc-btn', 'Title Screen'); q.onclick = () => this.game.quitToTitle(); pb.appendChild(q); }
    });
  }
  // slot group helper. group: {slots, offset, count, cols, kind, icons?}
  addGrid(parent, group) {
    const p = group.player || this.buildingFor;
    const grid = el('div', 'grid'); grid.style.gridTemplateColumns = `repeat(${group.cols}, var(--slot))`; parent.appendChild(grid);
    for (let i = 0; i < group.count; i++) {
      const sl = el('div', 'slot'); const ref = { slots: group.slots, index: group.offset + i, kind: group.kind, el: sl, group, player: p };
      if (group.icons) { sl.classList.add('empty-armor'); sl.dataset.icon = group.icons[i]; }
      sl.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); this.slotClick(ref, e.button, e.shiftKey, e.detail); });
      sl.addEventListener('mouseenter', () => { this.lastHover = ref; this.showTooltip(ref); });
      sl.addEventListener('mouseleave', () => { if (this.lastHover === ref) this.lastHover = null; $('#tooltip').hidden = true; });
      grid.appendChild(sl); p.screen.slots.push(ref);
    }
    return grid;
  }
  addPlayerInventory(parent, p) {
    const sec = el('div', 'inv-section'); parent.appendChild(sec);
    const inv = p.inventory;
    this.addGrid(sec, { slots: inv.slots, offset: 9, count: 27, cols: 9, kind: 'inv', player: p });
    this.addGrid(sec, { slots: inv.slots, offset: 0, count: 9, cols: 9, kind: 'hotbar', player: p });
    return sec;
  }
  refresh(p) {
    const scr = p && p.screen; if (!scr) return;
    for (const ref of scr.slots) { const st = ref.slots[ref.index]; this.renderSlot(ref.el, ref.kind === 'creative' && st ? { id: st.id, count: 1 } : st, false); }
    const cs = $('#cursor-stack'); if (p.cursor) { cs.hidden = false; this.renderSlot(cs, p.cursor, false); } else if (!this.game.players.some(pl => pl.cursor)) cs.hidden = true;
    if (scr.update) scr.update();
    if (this.lastHover) this.showTooltip(this.lastHover);
    this.highlightGamepadSlot(p);
  }
  showTooltip(ref) {
    const st = ref.slots[ref.index]; const tt = $('#tooltip'); if (!st) { tt.hidden = true; return; }
    const d = getItem(st.id); tt.innerHTML = '';
    const title = el('div', '', itemName(st.id)); if (isEnchanted(st)) title.style.color = '#ff80ff'; tt.appendChild(title);
    for (const line of enchantLines(st)) tt.appendChild(el('div', 'sub ench', line));
    if (d?.tool) tt.appendChild(el('div', 'sub', `${d.tool.type}  dmg ${d.tool.damage}  durability ${d.tool.durability - (st.dmg || 0)}/${d.tool.durability}`));
    if (d?.armor) tt.appendChild(el('div', 'sub', `armor +${d.armor.defense}  durability ${d.armor.durability - (st.dmg || 0)}/${d.armor.durability}`));
    if (d?.food) tt.appendChild(el('div', 'sub', `food +${d.food.hunger}  saturation +${d.food.saturation}`));
    if (fuelValue(st.id) && !d?.food) tt.appendChild(el('div', 'sub', `fuel: ${(fuelValue(st.id) / 200).toFixed(1)} items`));
    if (d?.light) tt.appendChild(el('div', 'sub', `light level ${d.light}`));
    tt.hidden = false;
  }
  canPlace(ref, stack) {
    if (!stack) return true;
    if (ref.kind === 'craftOut' || ref.kind === 'furnaceOut' || ref.kind === 'creative' || ref.kind === 'anvilOut') return false;
    if (ref.kind === 'enchantLapis') return stack.id === I.lapis_lazuli;
    if (ref.kind === 'enchantItem' || ref.kind === 'anvilA' || ref.kind === 'anvilB') return true;
    if (ref.kind === 'armor') { const d = getItem(stack.id); if (ref.index === 0 && stack.id === B.carved_pumpkin) return true; return !!(d?.armor && d.armor.slot === ref.index); }
    if (ref.kind === 'furnaceFuel') return fuelValue(stack.id) > 0;
    if (ref.kind === 'furnaceIn') return SMELTING.has(stack.id);
    return true;
  }
  slotClick(ref, button, shift, detail) {
    const p = ref.player; const g = this.game; const slots = ref.slots, i = ref.index; const st = slots[i]; const cur = p.cursor;
    if (ref.kind === 'creative') { if (!st) { if (cur) p.cursor = null; this.refresh(p); return; } if (shift) { p.inventory.add(makeStack(st.id, maxStack(st.id))); } else if (cur && cur.id === st.id) { cur.count = Math.min(maxStack(st.id), cur.count + (button === 2 ? 1 : maxStack(st.id))); } else p.cursor = makeStack(st.id, button === 2 ? 1 : maxStack(st.id)); this.refresh(p); return; }
    if (ref.kind === 'trash') { if (cur) p.cursor = null; this.refresh(p); return; }
    if (ref.kind === 'craftOut') { this.takeCraft(p, ref, shift); return; }
    if (ref.kind === 'anvilOut') { this.takeAnvil(p, shift); return; }
    if (ref.kind === 'furnaceOut') { if (!st) return; if (shift) { const left = p.inventory.add(st); slots[i] = left > 0 ? { ...st, count: left } : null; } else if (!cur) { p.cursor = st; slots[i] = null; } else if (canMerge(cur, st) && cur.count + st.count <= maxStack(st.id)) { cur.count += st.count; slots[i] = null; } this.onFurnaceTake(p); this.refresh(p); return; }
    if (shift) { this.quickMove(ref); this.refresh(p); return; }
    if (detail >= 2 && button === 0 && cur) { this.gather(p, cur); this.refresh(p); return; }
    if (button === 0) {
      if (!cur) { if (st) { slots[i] = null; p.cursor = st; } }
      else if (!st) { if (this.canPlace(ref, cur)) { slots[i] = cur; p.cursor = null; } }
      else if (canMerge(cur, st)) { const n = Math.min(maxStack(st.id) - st.count, cur.count); st.count += n; cur.count -= n; if (cur.count <= 0) p.cursor = null; }
      else if (this.canPlace(ref, cur)) { slots[i] = cur; p.cursor = st; }
    } else if (button === 2) {
      if (!cur) { if (st) { const half = Math.ceil(st.count / 2); p.cursor = { id: st.id, count: half, dmg: st.dmg, ench: st.ench }; st.count -= half; if (st.count <= 0) slots[i] = null; } }
      else if (!st) { if (this.canPlace(ref, cur)) { slots[i] = { id: cur.id, count: 1, dmg: cur.dmg, ench: cur.ench }; cur.count--; if (cur.count <= 0) p.cursor = null; } }
      else if (canMerge(cur, st) && st.count < maxStack(st.id)) { st.count++; cur.count--; if (cur.count <= 0) p.cursor = null; }
    }
    this.afterChange(ref); this.refresh(p);
  }
  gather(p, cur) { for (const ref of p.screen.slots) { if (['creative', 'craftOut', 'furnaceOut', 'anvilOut'].includes(ref.kind)) continue; const st = ref.slots[ref.index]; if (st && st !== cur && canMerge(cur, st)) { const n = Math.min(maxStack(cur.id) - cur.count, st.count); st.count -= n; cur.count += n; if (st.count <= 0) ref.slots[ref.index] = null; if (cur.count >= maxStack(cur.id)) break; } } }
  quickMove(ref) {
    const p = ref.player; const st = ref.slots[ref.index]; if (!st) return;
    const all = p.screen.slots;
    const containers = all.filter(r => !['inv', 'hotbar', 'craftOut', 'furnaceOut', 'creative', 'trash', 'anvilOut'].includes(r.kind));
    const put = (targets, stack) => { for (const t of targets) { if (!this.canPlace(t, stack)) continue; const ts = t.slots[t.index]; if (canMerge(ts, stack)) { const n = Math.min(maxStack(stack.id) - ts.count, stack.count); ts.count += n; stack.count -= n; if (stack.count <= 0) return true; } } for (const t of targets) { if (!this.canPlace(t, stack)) continue; if (!t.slots[t.index]) { t.slots[t.index] = { ...stack }; stack.count = 0; return true; } } return false; };
    if (ref.kind === 'inv' || ref.kind === 'hotbar') {
      const d = getItem(st.id); const armorSlots = containers.filter(c => c.kind === 'armor');
      if (d?.armor && armorSlots.length && armorSlots[d.armor.slot] && !armorSlots[d.armor.slot].slots[d.armor.slot]) { armorSlots[d.armor.slot].slots[d.armor.slot] = st; ref.slots[ref.index] = null; return; }
      const others = containers.filter(c => c.kind !== 'armor' && c.kind !== 'offhand');
      if (others.length) { put(others, st); if (st.count <= 0) ref.slots[ref.index] = null; return; }
      const dest = all.filter(r => r.kind === (ref.kind === 'inv' ? 'hotbar' : 'inv')); put(dest, st); if (st.count <= 0) ref.slots[ref.index] = null;
    } else { const dest = all.filter(r => r.kind === 'hotbar').concat(all.filter(r => r.kind === 'inv')); put(dest, st); if (st.count <= 0) ref.slots[ref.index] = null; }
    this.afterChange(ref);
  }
  swapWithHotbar(ref, n) {
    const p = ref.player;
    if (ref.kind === 'creative') { const st = ref.slots[ref.index]; if (st) p.inventory.slots[n] = makeStack(st.id, maxStack(st.id)); this.refresh(p); return; }
    if (ref.kind === 'craftOut' || ref.kind === 'furnaceOut' || ref.kind === 'anvilOut') return;
    const a = ref.slots[ref.index], b = p.inventory.slots[n];
    if (b && !this.canPlace(ref, b)) return;
    ref.slots[ref.index] = b || null; p.inventory.slots[n] = a || null;
    this.afterChange(ref); this.refresh(p);
  }
  dropFromSlot(ref, all) { const p = ref.player; const st = ref.slots[ref.index]; if (!st || ref.kind === 'creative' || ref.kind === 'craftOut') return; const n = all ? st.count : 1; this.game.dropStack({ id: st.id, count: n, dmg: st.dmg, ench: st.ench }, p); st.count -= n; if (st.count <= 0) ref.slots[ref.index] = null; this.afterChange(ref); this.refresh(p); }
  afterChange(ref) {
    const p = ref.player; const scr = p.screen; if (!scr) return;
    if (ref.kind === 'craft') this.updateCraft(p);
    if (scr.update && (ref.kind.startsWith('anvil') || ref.kind.startsWith('enchant'))) scr.update();
    if (scr.te) this.game.world.markModified(scr.te.x, scr.te.z);
  }
  // ---------- gamepad-driven screen navigation ----------
  highlightGamepadSlot(p) {
    if (!p || !p.screen || !p.input || p.input.kind !== 'gamepad') return;
    const slots = p.screen.slots;
    if (slots.length) {
      const prev = p._gpPrevEl;
      const cur = slots[Math.min(p.gpSlot || 0, slots.length - 1)];
      if (prev && prev !== (cur && cur.el)) prev.classList.remove('gp-focus');
      if (cur) { cur.el.classList.add('gp-focus'); p._gpPrevEl = cur.el; if (cur.el.scrollIntoView && p._gpScroll !== p.gpSlot) { p._gpScroll = p.gpSlot; cur.el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } }
      return;
    }
    const btns = [...this.boxFor(p).querySelectorAll('button.mc-btn:not(:disabled)')];
    btns.forEach((b, i) => b.classList.toggle('gp-focus', i === (p.gpBtn || 0)));
  }
  slotRects(p) {
    const scr = p.screen; const now = performance.now();
    if (scr._rects && scr._rectsN === scr.slots.length && now - scr._rectsT < 400) return scr._rects;
    scr._rects = scr.slots.map(r => r.el.getBoundingClientRect());
    scr._rectsN = scr.slots.length; scr._rectsT = now;
    return scr._rects;
  }
  navSlot(p, dx, dy) {
    const slots = p.screen.slots; if (!slots.length) return;
    const rects = this.slotRects(p);
    if (p.gpSlot >= slots.length) p.gpSlot = 0;
    const cr = rects[p.gpSlot] || rects[0];
    let best = -1, bestScore = Infinity;
    slots.forEach((r, i) => {
      if (i === p.gpSlot) return; const b = rects[i]; if (!b) return;
      const ox = b.left - cr.left, oy = b.top - cr.top;
      const along = dx ? ox * dx : oy * dy, across = dx ? Math.abs(oy) : Math.abs(ox);
      if (along <= 1) return;
      const score = along + across * 3;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) p.gpSlot = best;
    else { // wrap around in reading order
      const step = (dx || dy) > 0 ? 1 : -1; p.gpSlot = (p.gpSlot + step + slots.length) % slots.length;
    }
  }
  gamepadNavigate(p) {
    const inp = p.input; if (!inp || inp.kind !== 'gamepad') return;
    if (this.globalScreen) return;
    const scr = p.screen; if (!scr) return;
    if (inp.pressed('menuBack') || inp.pressed('inventory')) { if (scr.type !== 'death') this.closeScreen(p); return; }
    const btns = [...this.boxFor(p).querySelectorAll('button.mc-btn:not(:disabled)')];
    if (!scr.slots.length) {
      p.gpBtn = p.gpBtn || 0;
      if (inp.pressed('menuDown')) p.gpBtn = (p.gpBtn + 1) % Math.max(1, btns.length);
      if (inp.pressed('menuUp')) p.gpBtn = (p.gpBtn - 1 + btns.length) % Math.max(1, btns.length);
      if (inp.pressed('menuSelect') && btns[p.gpBtn]) btns[p.gpBtn].click();
      btns.forEach((b, i) => b.classList.toggle('gp-focus', i === p.gpBtn));
      return;
    }
    if (inp.pressed('tabPrev') || inp.pressed('tabNext')) {
      const tabs = [...this.boxFor(p).querySelectorAll('.tab')];
      if (tabs.length) { const cur = tabs.findIndex(t => t.classList.contains('active')); const n = (cur + (inp.pressed('tabNext') ? 1 : -1) + tabs.length) % tabs.length; tabs[n].click(); p.gpSlot = 0; return; }
    }
    if (inp.pressed('menuLeft')) this.navSlot(p, -1, 0);
    if (inp.pressed('menuRight')) this.navSlot(p, 1, 0);
    if (inp.pressed('menuUp')) this.navSlot(p, 0, -1);
    if (inp.pressed('menuDown')) this.navSlot(p, 0, 1);
    const ref = scr.slots[p.gpSlot];
    if (ref) {
      this.lastHover = ref;
      if (inp.pressed('menuSelect')) this.slotClick(ref, 0, false, 1);
      else if (inp.pressed('menuAlt')) this.slotClick(ref, 2, false, 1);
      else if (inp.pressed('menuShift')) this.slotClick(ref, 0, true, 1);
      else if (inp.pressed('drop')) this.dropFromSlot(ref, false);
    }
    this.highlightGamepadSlot(p);
  }
  gamepadGlobal(p) {
    const inp = p.input; if (!inp || inp.kind !== 'gamepad' || !this.globalScreen) return;
    const bs = this.globalButtons(); if (!bs.length) return;
    this.globalBtn = this.globalBtn || 0;
    if (inp.pressed('menuDown')) this.globalBtn = (this.globalBtn + 1) % bs.length;
    if (inp.pressed('menuUp')) this.globalBtn = (this.globalBtn - 1 + bs.length) % bs.length;
    if (inp.pressed('menuSelect')) bs[this.globalBtn].click();
    if (inp.pressed('menuBack') || inp.pressed('pause')) this.closeGlobal();
    this.highlightGlobalButton();
  }
  // ---------- crafting ----------
  updateCraft(p) { const scr = p.screen; if (!scr || !scr.craft) return; const r = findRecipe(scr.craft.slots); scr.craftOut[0] = r ? makeStack(r.id, r.count) : null; scr.lastRecipe = r; }
  takeCraft(p, ref, shift) {
    const scr = p.screen; const out = scr.craftOut[0]; if (!out) return;
    const consume = () => { for (let i = 0; i < scr.craft.slots.length; i++) { const st = scr.craft.slots[i]; if (!st) continue; const d = getItem(st.id); st.count--; if (d?.bucket && d.bucket !== 'empty') { scr.craft.slots[i] = makeStack(I.bucket, 1); continue; } if (st.count <= 0) scr.craft.slots[i] = null; } };
    if (shift) { let n = 0; while (n < 64) { const r = findRecipe(scr.craft.slots); if (!r) break; const left = p.inventory.add(makeStack(r.id, r.count)); if (left > 0) { p.inventory.remove(r.id, r.count - left); break; } consume(); n++; } }
    else { if (!p.cursor) { p.cursor = { ...out }; consume(); } else if (canMerge(p.cursor, out) && p.cursor.count + out.count <= maxStack(out.id)) { p.cursor.count += out.count; consume(); } else return; }
    this.updateCraft(p); this.game.audio.play('click'); this.refresh(p);
  }
  buildCraftArea(p, parent, size) {
    const scr = p.screen; scr.craft = new Container(size * size); scr.craftOut = [null];
    const area = el('div', 'inv-layout'); area.style.alignItems = 'center'; parent.appendChild(area);
    this.addGrid(area, { slots: scr.craft.slots, offset: 0, count: size * size, cols: size, kind: 'craft', player: p });
    area.appendChild(el('div', 'arrow'));
    this.addGrid(area, { slots: scr.craftOut, offset: 0, count: 1, cols: 1, kind: 'craftOut', player: p });
    scr.onClose = () => { for (const st of scr.craft.slots) if (st) p.give(st); };
    return area;
  }
  buildRecipeBook(p, parent, size) {
    const scr = p.screen; const inv = p.inventory;
    const book = el('div', 'recipe-book'); parent.appendChild(book);
    const render = () => {
      book.innerHTML = '';
      const list = craftableRecipes((id) => inv.count(id) + scr.craft.slots.reduce((a, st) => a + (st && st.id === id ? st.count : 0), 0), size);
      for (const r of list.slice(0, 120)) { const sl = el('div', 'slot'); this.renderSlot(sl, makeStack(r.result, r.count), false); sl.title = itemName(r.result); sl.onmousedown = (e) => { e.preventDefault(); this.fillRecipe(p, r, size, e.shiftKey); }; book.appendChild(sl); }
      if (!list.length) book.appendChild(el('div', 'help-text', 'No craftable recipes with your items'));
    };
    render(); scr._bookRender = render;
  }
  fillRecipe(p, r, size, all) {
    const scr = p.screen; const inv = p.inventory;
    for (const st of scr.craft.slots) if (st) inv.add(st); scr.craft.slots.fill(null);
    const ings = r.type === 'shaped' ? r.rows : [r.ings];
    let ok = true;
    for (let y = 0; y < ings.length && ok; y++) for (let x = 0; x < ings[y].length && ok; x++) {
      const ing = ings[y][x]; if (!ing) continue; const gi = y * size + x;
      const opts = ingredientOptions(ing); const id = opts.find(o => inv.count(o) > 0); if (id === undefined) { ok = false; break; }
      inv.remove(id, 1); scr.craft.slots[gi] = makeStack(id, 1);
    }
    this.updateCraft(p); this.refresh(p); if (scr._bookRender) scr._bookRender();
  }
  // ---------- concrete screens ----------
  openInventory(p) {
    if (p.creative) return this.openCreative(p);
    this.buildingFor = p;
    this.openScreen(p, 'inventory', (box) => {
      box.appendChild(el('h3', '', 'Crafting'));
      const top = el('div', 'inv-layout'); box.appendChild(top);
      const armorSec = el('div', 'inv-section'); top.appendChild(armorSec);
      this.addGrid(armorSec, { slots: p.inventory.armor, offset: 0, count: 4, cols: 1, kind: 'armor', icons: ['⛑', '👕', '👖', '👢'], player: p });
      const mid = el('div', 'inv-section'); top.appendChild(mid);
      this.buildCraftArea(p, mid, 2);
      const off = el('div'); off.appendChild(el('div', 'help-text', 'Offhand')); this.addGrid(off, { slots: p.inventory.offhand, offset: 0, count: 1, cols: 1, kind: 'offhand', player: p }); mid.appendChild(off);
      this.buildRecipeBook(p, top, 2);
      this.addPlayerInventory(box, p);
      box.appendChild(el('div', 'help-text', p.input && p.input.kind === 'gamepad' ? 'D-pad move · A take/place · X split · Y quick-move · B close' : 'Shift-click to move quickly · right-click to split · 1-9 to swap into hotbar · Q to drop'));
      p.screen.update = () => { if (p.screen._bookRender) p.screen._bookRender(); };
    });
  }
  openCrafting(p, x, y, z) {
    this.buildingFor = p;
    this.openScreen(p, 'crafting', (box) => {
      box.appendChild(el('h3', '', 'Crafting Table'));
      const top = el('div', 'inv-layout'); box.appendChild(top);
      const mid = el('div', 'inv-section'); top.appendChild(mid); this.buildCraftArea(p, mid, 3);
      this.buildRecipeBook(p, top, 3);
      this.addPlayerInventory(box, p);
      p.screen.update = () => { if (p.screen._bookRender) p.screen._bookRender(); };
      p.screen.pos = [x, y, z];
    });
  }
  openChest(p, te, title = 'Chest') {
    te.slots = te.slots || new Array(27).fill(null);
    this.buildingFor = p;
    this.openScreen(p, 'chest', (box) => {
      box.appendChild(el('h3', '', title));
      this.addGrid(box, { slots: te.slots, offset: 0, count: 27, cols: 9, kind: 'chest', player: p });
      box.appendChild(el('div', 'help-text', 'Inventory'));
      this.addPlayerInventory(box, p);
      p.screen.te = te; p.screen.pos = [te.x, te.y, te.z];
    });
    this.game.audio.play('chest');
  }
  openFurnace(p, te, def) {
    te.slots = te.slots || [null, null, null];
    this.buildingFor = p;
    this.openScreen(p, 'furnace', (box) => {
      box.appendChild(el('h3', '', def.displayName));
      const lay = el('div', 'inv-layout'); lay.style.alignItems = 'center'; box.appendChild(lay);
      const col = el('div', 'inv-section'); lay.appendChild(col);
      this.addGrid(col, { slots: te.slots, offset: 0, count: 1, cols: 1, kind: 'furnaceIn', player: p });
      const flame = el('div', 'flame'); col.appendChild(flame);
      this.addGrid(col, { slots: te.slots, offset: 1, count: 1, cols: 1, kind: 'furnaceFuel', player: p });
      const arrow = el('div', 'arrow'); const fill = el('div', 'fill'); arrow.appendChild(fill); lay.appendChild(arrow);
      this.addGrid(lay, { slots: te.slots, offset: 2, count: 1, cols: 1, kind: 'furnaceOut', player: p });
      this.addPlayerInventory(box, p);
      p.screen.te = te; p.screen.pos = [te.x, te.y, te.z];
      p.screen.update = () => { fill.style.width = (Math.min(1, (te.cook || 0) / 200) * 24) + 'px'; flame.style.setProperty('--p', (te.burnMax ? (te.burn / te.burnMax) * 100 : 0) + '%'); };
    });
  }
  onFurnaceTake(p) { const te = p.screen && p.screen.te; if (te && te.xp > 0) { const n = Math.floor(te.xp); if (n > 0 || Math.random() < te.xp) this.game.entities.spawnXP(p.x, p.y + 1, p.z, Math.max(1, n)); te.xp = 0; } }
  openCreative(p) {
    let tab = p.creativeTab || 'building';
    this.buildingFor = p;
    this.openScreen(p, 'creative', (box) => {
      const tabs = el('div', 'tabs'); box.appendChild(tabs);
      const listWrap = el('div'); box.appendChild(listWrap);
      const list = [];
      const render = () => {
        tabs.innerHTML = ''; for (const [k, name] of CREATIVE_TABS) { const t = el('div', 'tab' + (k === tab ? ' active' : ''), name); t.onclick = () => { tab = k; p.creativeTab = k; render(); }; tabs.appendChild(t); }
        listWrap.innerHTML = ''; p.screen.slots = p.screen.slots.filter(r => r.kind !== 'creative');
        const all = [...BLOCKS.filter(b => b.id && !b.hidden).map(b => b.id), ...[...ITEMS.keys()]];
        if (tab === 'search') { const inp = el('input', 'search'); inp.placeholder = 'Search items...'; inp.value = p.searchText || ''; inp.oninput = () => { p.searchText = inp.value; renderGrid(); }; listWrap.appendChild(inp); setTimeout(() => inp.focus(), 0); }
        const gridHolder = el('div', 'creative-grid'); listWrap.appendChild(gridHolder);
        const renderGrid = () => {
          gridHolder.innerHTML = ''; p.screen.slots = p.screen.slots.filter(r => r.kind !== 'creative');
          let items;
          if (tab === 'search') { const q = (p.searchText || '').toLowerCase(); items = q ? all.filter(id => itemName(id).toLowerCase().includes(q)) : all; }
          else items = all.filter(id => (getItem(id).tab || 'misc') === tab);
          list.length = 0; for (const id of items) list.push({ id, count: 1 });
          this.addGrid(gridHolder, { slots: list, offset: 0, count: list.length, cols: 9, kind: 'creative', player: p });
          this.refresh(p);
        };
        renderGrid();
      };
      render();
      box.appendChild(el('div', 'help-text', 'Click an item to pick up a stack · shift-click to add to inventory · click the trash slot to delete'));
      const bottom = el('div', 'inv-layout'); box.appendChild(bottom);
      this.addPlayerInventory(bottom, p);
      const side = el('div', 'inv-section'); bottom.appendChild(side);
      side.appendChild(el('div', 'help-text', 'Armor')); this.addGrid(side, { slots: p.inventory.armor, offset: 0, count: 4, cols: 4, kind: 'armor', icons: ['⛑', '👕', '👖', '👢'], player: p });
      const trash = [null]; side.appendChild(el('div', 'help-text', 'Delete')); this.addGrid(side, { slots: trash, offset: 0, count: 1, cols: 1, kind: 'trash', icons: ['🗑'], player: p });
    });
  }
  openEnchant(p, x, y, z) {
    const g = this.game, w = g.world;
    let shelves = 0; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy <= 1; dy++) if ((Math.abs(dx) === 2 || Math.abs(dz) === 2) && w.getBlock(x + dx, y + dy, z + dz) === B.bookshelf) shelves++;
    shelves = Math.min(15, shelves);
    const slots = [null, null];
    this.buildingFor = p;
    this.openScreen(p, 'enchant', (box) => {
      box.appendChild(el('h3', '', 'Enchant' + (shelves ? ` (${shelves} bookshelves)` : '')));
      const lay = el('div', 'inv-layout'); lay.style.alignItems = 'center'; box.appendChild(lay);
      const col = el('div', 'inv-section'); lay.appendChild(col);
      this.addGrid(col, { slots, offset: 0, count: 1, cols: 1, kind: 'enchantItem', player: p }); col.appendChild(el('div', 'help-text', 'Item'));
      this.addGrid(col, { slots, offset: 1, count: 1, cols: 1, kind: 'enchantLapis', player: p }); col.appendChild(el('div', 'help-text', 'Lapis'));
      const opts = el('div', 'inv-section'); lay.appendChild(opts);
      const btns = []; for (let i = 0; i < 3; i++) { const b = el('button', 'mc-btn small', ''); b.style.minWidth = '220px'; opts.appendChild(b); btns.push(b); }
      const render = () => {
        const st = slots[0]; const d = st ? getItem(st.id) : null; const can = st && d && !isEnchanted(st) && applicable(d, st.id === I.book).length > 0;
        for (let i = 0; i < 3; i++) {
          const maxCost = 5 + Math.round(shelves * 25 / 15); const cost = Math.max(i + 1, Math.round(maxCost * (i + 1) / 3)); const lapisNeed = i + 1;
          const ok = can && (p.creative || (p.level >= cost && slots[1] && slots[1].id === I.lapis_lazuli && slots[1].count >= lapisNeed));
          btns[i].textContent = can ? `Level ${cost} · ${lapisNeed} lapis · ?` : '—'; btns[i].disabled = !ok;
          btns[i].onclick = () => { const ench = rollEnchantments(st, cost, Math.random); if (!ench) return; slots[0] = applyEnchant(st, ench); if (!p.creative) { p.setLevel(p.level - lapisNeed); slots[1].count -= lapisNeed; if (slots[1].count <= 0) slots[1] = null; } g.audio.play('levelup'); g.particles.emit(x + 0.5, y + 1.2, z + 0.5, 'portal', 12); this.refresh(p); };
        }
      };
      p.screen.update = render; render();
      this.addPlayerInventory(box, p);
      p.screen.onClose = () => { for (const st of slots) if (st) p.give(st); };
      box.appendChild(el('div', 'help-text', 'Surround the table with bookshelves (up to 15) for stronger enchantments'));
    });
  }
  openAnvil(p, x, y, z) {
    const slots = [null, null]; const out = [null];
    this.buildingFor = p;
    this.openScreen(p, 'anvil', (box) => {
      box.appendChild(el('h3', '', 'Repair & Combine'));
      const lay = el('div', 'inv-layout'); lay.style.alignItems = 'center'; box.appendChild(lay);
      this.addGrid(lay, { slots, offset: 0, count: 1, cols: 1, kind: 'anvilA', player: p }); lay.appendChild(el('span', '', '+')); this.addGrid(lay, { slots, offset: 1, count: 1, cols: 1, kind: 'anvilB', player: p }); lay.appendChild(el('div', 'arrow'));
      this.addGrid(lay, { slots: out, offset: 0, count: 1, cols: 1, kind: 'anvilOut', player: p });
      const costEl = el('div', 'help-text', ''); box.appendChild(costEl);
      p.screen.anvil = { slots, out };
      p.screen.update = () => { const r = anvilResult(slots[0], slots[1]); out[0] = r ? r.result : null; p.screen.anvilCost = r ? r.cost : 0; costEl.textContent = r ? `Enchantment cost: ${r.cost} level${r.cost > 1 ? 's' : ''}` + (p.level < r.cost && !p.creative ? ' (not enough levels)' : '') : 'Combine two of the same item, an item with its material, or an item with an enchanted book'; costEl.style.color = r && p.level < r.cost && !p.creative ? '#c00' : ''; for (const ref of p.screen.slots) if (ref.kind === 'anvilOut') this.renderSlot(ref.el, out[0], false); };
      p.screen.update();
      this.addPlayerInventory(box, p);
      p.screen.onClose = () => { for (const st of slots) if (st) p.give(st); };
    });
  }
  takeAnvil(p, shift) {
    const scr = p.screen; const r = anvilResult(scr.anvil.slots[0], scr.anvil.slots[1]); if (!r) return;
    if (!p.creative && p.level < r.cost) return;
    if (p.cursor && !shift) return;
    const res = { ...r.result }; const used = res._used; delete res._used;
    if (shift) p.give(res); else p.cursor = res;
    scr.anvil.slots[0] = null;
    if (used && scr.anvil.slots[1]) { scr.anvil.slots[1].count -= used; if (scr.anvil.slots[1].count <= 0) scr.anvil.slots[1] = null; } else scr.anvil.slots[1] = null;
    if (!p.creative) p.setLevel(p.level - r.cost);
    this.game.audio.play('anvil'); this.refresh(p);
  }
  openTrade(p, villager) {
    const g = this.game;
    if (!villager.trades) villager.trades = makeTrades();
    villager.profession = villager.trades.profession;
    this.buildingFor = p;
    this.openScreen(p, 'trade', (box) => {
      box.appendChild(el('h3', '', villager.profession + ' Villager'));
      const list = el('div'); box.appendChild(list);
      const render = () => {
        list.innerHTML = '';
        for (const t of villager.trades) {
          const row = el('div', 'trade'); const a = el('div', 'slot'); this.renderSlot(a, makeStack(t.in, t.inN), false); row.appendChild(a); row.appendChild(el('span', '', '→'));
          const b = el('div', 'slot'); this.renderSlot(b, makeStack(t.out, t.outN), false); row.appendChild(b);
          const can = p.inventory.count(t.in) >= t.inN && t.uses < 8; if (!can) row.classList.add('disabled');
          const btn = el('button', 'mc-btn', can ? 'Trade' : t.uses >= 8 ? 'Sold out' : 'Need ' + t.inN + ' ' + itemName(t.in)); btn.disabled = !can;
          btn.onclick = () => { p.inventory.remove(t.in, t.inN); const outStack = makeStack(t.out, t.outN); if (t.out === I.enchanted_book) outStack.ench = rollEnchantments({ id: I.book }, 15 + Math.floor(Math.random() * 15)); p.give(outStack); t.uses++; g.audio.play('villager'); g.entities.spawnXP(villager.x, villager.y + 1, villager.z, 2); render(); };
          row.appendChild(btn); list.appendChild(row);
        }
      };
      render();
      const close = el('button', 'mc-btn', 'Done'); close.onclick = () => this.closeScreen(p); box.appendChild(close);
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
