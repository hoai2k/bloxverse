// ============================================================
// BLOXVERSE engine — in-game HUD: chat, leaderboard, health,
// killfeed, announcements, respawn, menu, proximity prompts.
// ============================================================
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { nameColor } from './character.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export class GameUI {
  constructor(root, opts = {}) {
    this.root = root;
    this.gameName = opts.gameName || 'Game';
    this.gameId = opts.gameId || '';
    this.onChatSend = opts.onChatSend || (() => {});
    this.onRespawn = opts.onRespawn || null;
    this.prompts = [];
    this._boardCols = [];
    this._boardRows = new Map();
    this.menuOpen = false;
    this.input = opts.input || null;
    this.#build();
  }

  #build() {
    const hud = document.createElement('div');
    hud.className = 'hud';
    hud.innerHTML = `
      <div class="hud-top">
        <button class="hud-menu-btn hud-clickable" id="hudMenuBtn">
          <span></span><span></span><span></span>
        </button>
        <div class="hud-title">${esc(this.gameName)}</div>
        <button class="hud-chat-btn hud-clickable" id="hudChatBtn">💬</button>
      </div>
      <div class="chat-panel hud-panel" id="chatPanel">
        <div class="chat-msgs" id="chatMsgs"></div>
        <div class="chat-input-row">
          <input id="chatInput" maxlength="120" placeholder="Click here or press / to chat" autocomplete="off" />
        </div>
      </div>
      <div class="board hud-panel" id="board"><div class="board-head" id="boardHead"></div><div class="board-rows" id="boardRows"></div></div>
      <div class="killfeed" id="killfeed"></div>
      <div class="announce" id="announce"><div class="a-main"></div><div class="a-sub"></div></div>
      <div class="bottom-hud">
        <div class="stat-pills" id="statPills"></div>
        <div class="healthbar"><div class="hp-fill" id="hpFill"></div><span class="hp-text" id="hpText"></span></div>
        <div class="hotbar" id="hotbar"></div>
      </div>
      <div class="crosshair" id="crosshair">+</div>
      <div class="hitmarker" id="hitmarker">✕</div>
      <div class="vignette" id="vignette"></div>
      <div class="overlay-tint" id="overlayTint"></div>
      <div class="respawn-screen" id="respawnScreen">
        <div class="rs-title">You died!</div>
        <div class="rs-sub"></div>
      </div>
      <div class="game-menu" id="gameMenu">
        <div class="gm-card">
          <div class="gm-logo"><span class="tilt">B</span> BLOXVERSE</div>
          <div class="gm-game">${esc(this.gameName)}</div>
          <button class="gm-btn" id="gmResume">Resume</button>
          <button class="gm-btn" id="gmRespawn">Respawn</button>
          <label class="gm-vol">Volume <input type="range" id="gmVol" min="0" max="100" value="50"/></label>
          <button class="gm-btn leave" id="gmLeave">Leave Game</button>
        </div>
      </div>`;
    this.root.appendChild(hud);
    this.hud = hud;
    this.el = {};
    ['chatPanel', 'chatMsgs', 'chatInput', 'board', 'boardHead', 'boardRows', 'killfeed', 'announce',
      'hpFill', 'hpText', 'hotbar', 'crosshair', 'hitmarker', 'vignette', 'overlayTint', 'respawnScreen',
      'gameMenu', 'statPills'].forEach((id) => this.el[id] = hud.querySelector('#' + id));

    // chat
    const input = this.el.chatInput;
    input.addEventListener('focus', () => { if (this.input) this.input.typing = true; this.el.chatPanel.classList.add('typing'); });
    input.addEventListener('blur', () => { if (this.input) this.input.typing = false; this.el.chatPanel.classList.remove('typing'); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = input.value.trim();
        input.value = '';
        if (text) this.onChatSend(text);
        input.blur();
      }
      if (e.key === 'Escape') input.blur();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== input && !this.menuOpen) {
        e.preventDefault();
        input.focus();
      }
      if (e.key === 'Escape' && document.activeElement !== input) this.toggleMenu();
    });
    hud.querySelector('#hudChatBtn').addEventListener('click', () => {
      this.el.chatPanel.classList.toggle('hidden');
    });
    // start collapsed on small screens
    if (innerWidth < 700) this.el.chatPanel.classList.add('mini');

    // menu
    hud.querySelector('#hudMenuBtn').addEventListener('click', () => this.toggleMenu());
    hud.querySelector('#gmResume').addEventListener('click', () => this.toggleMenu(false));
    hud.querySelector('#gmRespawn').addEventListener('click', () => {
      this.toggleMenu(false);
      this.onRespawn && this.onRespawn();
    });
    hud.querySelector('#gmLeave').addEventListener('click', () => {
      location.href = this.gameId ? `game.html?g=${this.gameId}` : 'index.html';
    });
    hud.querySelector('#gmVol').addEventListener('input', (e) => sfx.setVolume(e.target.value / 100));
  }

  toggleMenu(force) {
    this.menuOpen = force !== undefined ? force : !this.menuOpen;
    this.el.gameMenu.classList.toggle('open', this.menuOpen);
    if (this.input) this.input.enabled = !this.menuOpen;
    if (this.menuOpen && document.pointerLockElement) document.exitPointerLock();
  }

  // ---------------- chat ----------------
  addChat(name, text, color, opts = {}) {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    if (opts.system) {
      div.innerHTML = `<span class="sys">${esc(text)}</span>`;
    } else {
      div.innerHTML = `<b style="color:${color || nameColor(name)}">${esc(name)}:</b> ${esc(text)}`;
    }
    this.el.chatMsgs.appendChild(div);
    while (this.el.chatMsgs.children.length > 60) this.el.chatMsgs.firstChild.remove();
    this.el.chatMsgs.scrollTop = this.el.chatMsgs.scrollHeight;
    setTimeout(() => div.classList.add('faded'), 18000);
  }
  system(text) { this.addChat('', text, '', { system: true }); }

  // ---------------- leaderboard ----------------
  setBoard(columns) {
    this._boardCols = columns;
    this.el.boardHead.innerHTML =
      `<span class="bname">Players</span>` + columns.map((c) => `<span class="bcol">${esc(c)}</span>`).join('');
  }
  board(name, values, opts = {}) {
    let row = this._boardRows.get(name);
    if (!row) {
      row = { el: document.createElement('div'), values: [] };
      row.el.className = 'board-row';
      this._boardRows.set(name, row);
      this.el.boardRows.appendChild(row.el);
    }
    row.values = values;
    row.el.classList.toggle('me', !!opts.isPlayer);
    row.el.innerHTML =
      `<span class="bname" style="color:${opts.color || nameColor(name)}">${esc(name)}</span>` +
      values.map((v) => `<span class="bcol">${esc(v)}</span>`).join('');
    // sort rows by first column desc
    const rows = [...this._boardRows.entries()];
    rows.sort((a, b) => (Number(b[1].values[0]) || 0) - (Number(a[1].values[0]) || 0));
    rows.forEach(([, r]) => this.el.boardRows.appendChild(r.el));
  }
  removeBoardRow(name) {
    const row = this._boardRows.get(name);
    if (row) { row.el.remove(); this._boardRows.delete(name); }
  }

  // ---------------- killfeed ----------------
  killfeed(killer, victim, icon = '💥', kColor, vColor) {
    const div = document.createElement('div');
    div.className = 'kf-row';
    div.innerHTML = `<b style="color:${kColor || nameColor(killer)}">${esc(killer)}</b> <span class="kf-ico">${icon}</span> <b style="color:${vColor || nameColor(victim)}">${esc(victim)}</b>`;
    this.el.killfeed.prepend(div);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => { div.classList.add('out'); setTimeout(() => div.remove(), 400); }, 4500);
  }

  // ---------------- health / stats ----------------
  setHealth(hp, max) {
    const f = Math.max(0, hp / max);
    this.el.hpFill.style.width = (f * 100) + '%';
    this.el.hpFill.style.background = f > 0.5 ? '#3fc679' : f > 0.25 ? '#ffb400' : '#f74d59';
    this.el.hpText.textContent = `${Math.ceil(Math.max(0, hp))} / ${max}`;
  }
  setPills(pills) {
    // pills: [{icon,label,value,color?}]
    this.el.statPills.innerHTML = pills.map((p) =>
      `<span class="pill" ${p.color ? `style="border-color:${p.color}"` : ''}>${p.icon || ''} <b>${esc(p.value)}</b>${p.label ? ` <small>${esc(p.label)}</small>` : ''}</span>`).join('');
  }

  // desktop hotbar slot display
  hotbarSlot(key, icon, label, id) {
    const slot = document.createElement('div');
    slot.className = 'hb-slot';
    slot.dataset.id = id || label;
    slot.innerHTML = `<span class="hb-key">${esc(key)}</span><span class="hb-icon">${icon}</span><span class="hb-label">${esc(label)}</span><span class="hb-cd"></span>`;
    this.el.hotbar.appendChild(slot);
    return slot;
  }
  hotbarCooldown(id, seconds) {
    const slot = this.el.hotbar.querySelector(`[data-id="${CSS.escape(id)}"] .hb-cd`);
    if (!slot) return;
    slot.style.transition = 'none';
    slot.style.height = '100%';
    requestAnimationFrame(() => {
      slot.style.transition = `height ${seconds}s linear`;
      slot.style.height = '0%';
    });
  }
  hotbarActive(id, on) {
    const slot = this.el.hotbar.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (slot) slot.classList.toggle('active', on);
  }

  // ---------------- feedback ----------------
  announce(main, sub = '', dur = 2.6) {
    const a = this.el.announce;
    a.querySelector('.a-main').textContent = main;
    a.querySelector('.a-sub').textContent = sub;
    a.classList.add('show');
    clearTimeout(this._aTimer);
    this._aTimer = setTimeout(() => a.classList.remove('show'), dur * 1000);
  }
  hitmarker(head = false) {
    const h = this.el.hitmarker;
    h.style.color = head ? '#ff5b5b' : '#ffffff';
    h.classList.remove('pop');
    void h.offsetWidth;
    h.classList.add('pop');
  }
  damageFlash() {
    const v = this.el.vignette;
    v.classList.remove('flash');
    void v.offsetWidth;
    v.classList.add('flash');
  }
  tint(color, opacity = 0) {
    this.el.overlayTint.style.background = color;
    this.el.overlayTint.style.opacity = opacity;
  }
  crosshair(on) { this.el.crosshair.style.display = on ? 'block' : 'none'; }

  respawnScreen(show, sub = '') {
    this.el.respawnScreen.classList.toggle('show', show);
    this.el.respawnScreen.querySelector('.rs-sub').textContent = sub;
  }

  // ---------------- proximity prompts ----------------
  // {getPos: ()=>Vector3, text, key='E', radius=8, hold=0, onTrigger, filter?}
  addPrompt(p) {
    const el = document.createElement('div');
    el.className = 'prox-prompt hud-clickable';
    el.innerHTML = `<span class="pp-key">${esc(p.key || 'E')}</span><span class="pp-text">${esc(p.text)}</span><svg class="pp-ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16"/></svg>`;
    el.style.display = 'none';
    this.hud.appendChild(el);
    const prompt = { ...p, key: p.key || 'E', radius: p.radius ?? 8, hold: p.hold ?? 0, el, holding: 0, visible: false, enabled: true };
    // touch/tap support
    el.addEventListener('pointerdown', () => { prompt.holding = 0.0001; });
    el.addEventListener('pointerup', () => { if (prompt.hold === 0) this.#firePrompt(prompt); prompt.holding = 0; });
    this.prompts.push(prompt);
    return prompt;
  }
  removePrompt(p) {
    p.el.remove();
    this.prompts = this.prompts.filter((x) => x !== p);
  }
  #firePrompt(p) {
    sfx.play('click');
    p.onTrigger && p.onTrigger();
  }

  updatePrompts(dt, camera, playerPos, keysDown) {
    const v = new THREE.Vector3();
    let nearest = null, nearestD = Infinity;
    for (const p of this.prompts) {
      const pos = p.getPos();
      const d = playerPos.distanceTo(pos);
      const ok = p.enabled && d < p.radius && (!p.filter || p.filter());
      if (ok && d < nearestD) { nearest = p; nearestD = d; }
      p._ok = ok;
    }
    for (const p of this.prompts) {
      const show = p === nearest;
      if (show) {
        v.copy(p.getPos());
        v.project(camera);
        if (v.z < 1) {
          p.el.style.display = 'flex';
          p.el.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
          p.el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
        } else p.el.style.display = 'none';
        // hold-key logic
        const holdingKey = keysDown && keysDown.has(p.key.toLowerCase());
        if (holdingKey || p.holding > 0) {
          if (p.hold > 0) {
            p.holding += dt;
            const frac = Math.min(1, p.holding / p.hold);
            p.el.style.setProperty('--ring', String(frac));
            if (p.holding >= p.hold) { p.holding = -999; this.#firePrompt(p); setTimeout(() => p.holding = 0, 400); }
          } else if (holdingKey && !p._fired) {
            p._fired = true;
            this.#firePrompt(p);
          }
        } else {
          p._fired = false;
          if (p.holding > 0) p.holding = 0;
          p.el.style.setProperty('--ring', '0');
        }
      } else {
        p.el.style.display = 'none';
        if (p.holding > 0) p.holding = 0;
      }
    }
  }

  // floating world-space text popup (damage numbers, +cash)
  popup(camera, worldPos, text, color = '#fff', size = 18) {
    const v = new THREE.Vector3().copy(worldPos).project(camera);
    if (v.z >= 1) return;
    const el = document.createElement('div');
    el.className = 'popup3d';
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = size + 'px';
    el.style.left = ((v.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 30) + 'px';
    el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight - 10) + 'px';
    this.hud.appendChild(el);
    requestAnimationFrame(() => el.classList.add('fly'));
    setTimeout(() => el.remove(), 900);
  }

  dispose() { this.hud.remove(); }
}
