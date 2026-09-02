// Gamepad (Xbox-style) support and the shared input-source interface used by every player.
//
// An input source answers the questions the player controller asks each frame:
//   axes()      -> { fwd, strafe }        movement on the ground plane
//   look(dt)    -> { dx, dy }             camera delta in "mouse pixels"
//   down(a)     -> bool                   action held this frame
//   pressed(a)  -> bool                   action went down this frame
// Actions: jump sneak sprint attack use inventory drop swap pause camera chat
//          hotbarNext hotbarPrev hotbar1..hotbar9 menuUp menuDown menuLeft menuRight
//          menuSelect menuAlt menuBack menuShift

export const ACTIONS = ['jump', 'sneak', 'sprint', 'attack', 'use', 'inventory', 'drop', 'swap', 'pause', 'camera', 'chat',
  'hotbarNext', 'hotbarPrev', 'menuUp', 'menuDown', 'menuLeft', 'menuRight', 'menuSelect', 'menuAlt', 'menuBack', 'menuShift', 'tabPrev', 'tabNext'];

// Standard gamepad mapping (Xbox layout).
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, GUIDE: 16 };
const BUTTON_ACTIONS = {
  jump: BTN.A, sneak: BTN.LB, sprint: BTN.L3, attack: BTN.RT, use: BTN.LT,
  inventory: BTN.Y, drop: BTN.B, swap: BTN.X, pause: BTN.START, camera: BTN.R3, chat: BTN.BACK,
  hotbarPrev: BTN.LEFT, hotbarNext: BTN.RIGHT,
  menuUp: BTN.UP, menuDown: BTN.DOWN, menuLeft: BTN.LEFT, menuRight: BTN.RIGHT,
  menuSelect: BTN.A, menuAlt: BTN.X, menuBack: BTN.B, menuShift: BTN.Y, tabPrev: BTN.LB, tabNext: BTN.RB,
};
const DEAD = 0.22;
function dz(v) { const a = Math.abs(v); return a < DEAD ? 0 : Math.sign(v) * (a - DEAD) / (1 - DEAD); }

export class GamepadSource {
  constructor(index) {
    this.index = index; this.kind = 'gamepad';
    this.state = new Array(20).fill(0); this.prev = new Array(20).fill(0);
    this.axes = [0, 0, 0, 0]; this.repeat = {}; this.connected = true; this.suppress = 0;
  }
  get pad() { const pads = navigator.getGamepads ? navigator.getGamepads() : []; return pads && pads[this.index] || null; }
  poll(dt) {
    const p = this.pad; this.prev = this.state.slice();
    if (!p) { this.connected = false; this.state.fill(0); this.axes = [0, 0, 0, 0]; return; }
    this.connected = true;
    for (let i = 0; i < this.state.length; i++) { const b = p.buttons[i]; this.state[i] = b ? (b.pressed || b.value > 0.5 ? 1 : 0) : 0; }
    this.axes = [dz(p.axes[0] || 0), dz(p.axes[1] || 0), dz(p.axes[2] || 0), dz(p.axes[3] || 0)];
    // analog triggers report as axes on some drivers
    if (p.buttons[BTN.LT]) this.state[BTN.LT] = p.buttons[BTN.LT].value > 0.35 ? 1 : 0;
    if (p.buttons[BTN.RT]) this.state[BTN.RT] = p.buttons[BTN.RT].value > 0.35 ? 1 : 0;
    // key repeat for menu navigation
    for (const a of ['menuUp', 'menuDown', 'menuLeft', 'menuRight']) {
      const held = this.rawDown(a); const r = this.repeat[a] || (this.repeat[a] = { t: 0, fire: false });
      if (!held) { r.t = 0; r.fire = false; continue; }
      r.t += dt; r.fire = false;
      if (r.t > 0.42) { r.t = 0.42 - 0.11; r.fire = true; }
    }
  }
  rawDown(a) {
    const b = BUTTON_ACTIONS[a]; if (b === undefined) return false;
    if (this.state[b]) return true;
    // left stick also drives menu navigation
    if (a === 'menuUp') return this.axes[1] < -0.55; if (a === 'menuDown') return this.axes[1] > 0.55;
    if (a === 'menuLeft') return this.axes[0] < -0.55; if (a === 'menuRight') return this.axes[0] > 0.55;
    return false;
  }
  down(a) { return this.rawDown(a); }
  // Ignore presses for a couple of frames (used when a pad claims a player so the
  // joining button press is not also read as an in-game action).
  suppressInput(frames = 3) { this.suppress = frames; }
  pressed(a) {
    if (this.suppress > 0) return false;
    const b = BUTTON_ACTIONS[a];
    if (b !== undefined && this.state[b] && !this.prev[b]) return true;
    if (['menuUp', 'menuDown', 'menuLeft', 'menuRight'].includes(a)) {
      const r = this.repeat[a];
      if (r && r.fire) return true;
      const axis = (a === 'menuUp' || a === 'menuDown') ? 1 : 0; const sign = (a === 'menuUp' || a === 'menuLeft') ? -1 : 1;
      const now = this.axes[axis] * sign > 0.55, was = this.prevAxes ? this.prevAxes[axis] * sign > 0.55 : false;
      if (now && !was) return true;
    }
    return false;
  }
  move() { return { fwd: -this.axes[1], strafe: this.axes[0] }; }
  look(dt, sens) { const s = 3.2 * sens * dt; const x = this.axes[2], y = this.axes[3]; return { dx: x * Math.abs(x) * s, dy: y * Math.abs(y) * s }; }
  hotbarDigit() { return -1; }
  endFrame() { this.prevAxes = this.axes.slice(); if (this.suppress > 0) this.suppress--; }
  rumble(ms = 120, strong = 0.4, weak = 0.2) {
    const p = this.pad; if (!p) return;
    const act = p.vibrationActuator; if (!act) return;
    try { act.playEffect ? act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }) : act.pulse && act.pulse(strong, ms); } catch { }
  }
}

// Keyboard + mouse source, backed by the game's global Input object.
export class KeyboardSource {
  constructor(input, game) { this.input = input; this.game = game; this.kind = 'keyboard'; }
  poll() { }
  move() {
    const i = this.input; const t = this.game && this.game.touch;
    if (t && t.active && (t.axis.fwd || t.axis.strafe)) return { fwd: t.axis.fwd, strafe: t.axis.strafe };
    return { fwd: i.key('KeyW') - i.key('KeyS'), strafe: i.key('KeyD') - i.key('KeyA') };
  }
  look(dt, sens) { const i = this.input; const k = sens * 0.0022; return { dx: i.dx * k, dy: i.dy * k }; }
  down(a) {
    const i = this.input;
    switch (a) {
      case 'jump': return !!i.key('Space');
      case 'sneak': return !!(i.key('ShiftLeft') || i.key('ShiftRight'));
      case 'sprint': return !!(i.key('ControlLeft') || i.key('KeyR'));
      case 'attack': return i.mouse(0);
      case 'use': return i.mouse(2);
      default: return false;
    }
  }
  pressed(a) {
    const i = this.input;
    switch (a) {
      case 'jump': return i.pressed('Space');
      case 'inventory': return i.pressed('KeyE');
      case 'drop': return i.pressed('KeyQ');
      case 'swap': return i.pressed('KeyF');
      case 'pause': return i.pressed('Escape');
      case 'camera': return i.pressed('F5');
      case 'chat': return i.pressed('KeyT');
      default: return false;
    }
  }
  hotbarDigit() { for (let n = 1; n <= 9; n++) if (this.input.pressed('Digit' + n)) return n - 1; return -1; }
  endFrame() { }
  rumble() { }
}

// Tracks connected pads and hands out sources. Pads are claimed by players in join order.
export class GamepadManager {
  constructor(game) {
    this.game = game; this.sources = new Map(); this.onConnect = null;
    window.addEventListener('gamepadconnected', (e) => { this.sync(); if (this.onConnect) this.onConnect(e.gamepad.index); });
    window.addEventListener('gamepaddisconnected', () => this.sync());
    this.sync();
  }
  sync() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) { const p = pads[i]; if (p && p.connected && !this.sources.has(i)) this.sources.set(i, new GamepadSource(i)); }
    for (const [i, s] of this.sources) { const p = pads[i]; if (!p || !p.connected) { s.connected = false; } }
  }
  list() { this.sync(); return [...this.sources.values()].filter(s => s.connected); }
  // A pad not yet claimed by any player
  free(claimed) { return this.list().filter(s => !claimed.includes(s)); }
  poll(dt) { for (const s of this.sources.values()) s.poll(dt); }
  endFrame() { for (const s of this.sources.values()) s.endFrame(); }
  // Any unclaimed pad pressing Start/A (used to let a player drop in)
  joinRequest(claimed) { for (const s of this.free(claimed)) if (s.pressed('pause') || s.pressed('jump')) return s; return null; }
}
export function gamepadsAvailable() { const p = navigator.getGamepads ? navigator.getGamepads() : []; for (const g of p) if (g && g.connected) return true; return false; }
