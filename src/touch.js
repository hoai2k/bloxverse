// Touch controls: virtual joystick, look-by-drag, tap to use, long-press to mine, action buttons.
export function hasTouch() { return ('ontouchstart' in window) || navigator.maxTouchPoints > 0; }

export class TouchControls {
  constructor(game) {
    this.game = game; this.axis = { fwd: 0, strafe: 0 }; this.active = false;
    const root = document.createElement('div'); root.id = 'touch'; root.innerHTML = `
      <div id="joy"><div id="joy-knob"></div></div>
      <div class="tbtn" id="tb-jump">▲</div>
      <div class="tbtn" id="tb-sneak">⇩</div>
      <div class="tbtn small" id="tb-inv">☰</div>
      <div class="tbtn small" id="tb-chat">💬</div>
      <div class="tbtn small" id="tb-drop">Q</div>
      <div class="tbtn small" id="tb-cam">👁</div>`;
    document.body.appendChild(root); this.root = root;
    this.joy = root.querySelector('#joy'); this.knob = root.querySelector('#joy-knob');
    this.bind();
  }
  show(v) { this.root.style.display = v ? 'block' : 'none'; this.active = v; if (v) this.game.input.locked = true; }
  bind() {
    const g = this.game, inp = g.input;
    // joystick
    let joyId = null, jc = null;
    const joyMove = (t) => { const dx = t.clientX - jc.x, dy = t.clientY - jc.y; const r = 45; const l = Math.hypot(dx, dy) || 1; const k = Math.min(1, l / r); const nx = dx / l * k, ny = dy / l * k; this.knob.style.transform = `translate(${nx * r}px, ${ny * r}px)`; this.axis.strafe = Math.abs(nx) > 0.15 ? nx : 0; this.axis.fwd = Math.abs(ny) > 0.15 ? -ny : 0; this.sprint = k > 0.95; };
    this.joy.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; joyId = t.identifier; const rect = this.joy.getBoundingClientRect(); jc = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; joyMove(t); }, { passive: false });
    this.joy.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === joyId) joyMove(t); }, { passive: false });
    const joyEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; this.axis.fwd = this.axis.strafe = 0; this.sprint = false; this.knob.style.transform = ''; } };
    this.joy.addEventListener('touchend', joyEnd); this.joy.addEventListener('touchcancel', joyEnd);
    // look / mine / place on the canvas
    const c = g.canvas; let lookId = null, last = null, start = null, moved = false, pressTimer = null, mining = false;
    c.addEventListener('touchstart', (e) => {
      if (!this.active || g.ui.screenOpen) return; e.preventDefault();
      const t = e.changedTouches[0]; if (lookId !== null) return; lookId = t.identifier; last = { x: t.clientX, y: t.clientY }; start = { ...last, t: performance.now() }; moved = false;
      pressTimer = setTimeout(() => { if (!moved) { mining = true; inp.buttons.add(0); if (g.player.lookEntity) g.player.attack(); } }, 280);
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      if (!this.active) return; e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === lookId) { const dx = t.clientX - last.x, dy = t.clientY - last.y; if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 12) moved = true; inp.dx += dx * 2.2; inp.dy += dy * 2.2; last = { x: t.clientX, y: t.clientY }; }
    }, { passive: false });
    const endLook = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) { lookId = null; clearTimeout(pressTimer); if (mining) { mining = false; inp.buttons.delete(0); } else if (!moved && performance.now() - start.t < 280 && !g.ui.screenOpen) { if (g.player.lookEntity) g.player.attack(); else g.onMouseDown(2); } } };
    c.addEventListener('touchend', endLook); c.addEventListener('touchcancel', endLook);
    // buttons
    const hold = (id, code) => { const b = this.root.querySelector(id); b.addEventListener('touchstart', (e) => { e.preventDefault(); inp.keys.add(code); b.classList.add('on'); }, { passive: false }); const up = (e) => { e.preventDefault(); inp.keys.delete(code); b.classList.remove('on'); }; b.addEventListener('touchend', up); b.addEventListener('touchcancel', up); };
    hold('#tb-jump', 'Space');
    const sneak = this.root.querySelector('#tb-sneak'); sneak.addEventListener('touchstart', (e) => { e.preventDefault(); if (inp.keys.has('ShiftLeft')) { inp.keys.delete('ShiftLeft'); sneak.classList.remove('on'); } else { inp.keys.add('ShiftLeft'); sneak.classList.add('on'); } }, { passive: false });
    const tap = (id, fn) => { const b = this.root.querySelector(id); b.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false }); };
    tap('#tb-inv', () => { if (g.ui.screenOpen) g.ui.closeScreen(); else g.ui.openInventory(); });
    tap('#tb-chat', () => { if (g.ui.chatOpen) g.ui.closeChat(); else g.ui.openChat(''); });
    tap('#tb-drop', () => g.dropHeld(false));
    tap('#tb-cam', () => { g.thirdPerson = (g.thirdPerson + 1) % 3; });
    // hotbar taps select slots (the hotbar has pointer-events none by default in HUD; enable for touch)
    const hb = document.getElementById('hotbar'); hb.style.pointerEvents = 'auto';
    hb.addEventListener('touchstart', (e) => { const el = e.target.closest('.slot'); if (!el) return; const idx = [...hb.children].indexOf(el); if (idx >= 0) { if (g.player.inventory.selected === idx) g.player.use(); g.player.inventory.selected = idx; } e.preventDefault(); }, { passive: false });
  }
  update() { const inp = this.game.input; if (this.sprint) inp.keys.add('ControlLeft'); else inp.keys.delete('ControlLeft'); }
}
