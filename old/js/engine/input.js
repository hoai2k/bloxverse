// ============================================================
// BLOXVERSE engine — input: keyboard, mouse, pointer-lock aim,
// and mobile touch (dynamic thumbstick, camera drag, buttons).
// ============================================================

export class Input {
  constructor(root) {
    this.root = root;
    this.keys = new Set();
    this.moveX = 0; this.moveZ = 0;          // raw input space (-1..1), rel. to camera
    this.jumpHeld = false;
    this.jumpQueued = false;
    this.lookDX = 0; this.lookDY = 0;        // accumulated per-frame camera deltas
    this.wheelDelta = 0;
    this.mouseDown = false;                   // LMB held
    this.mouse2Down = false;                  // RMB held
    this.rotating = false;
    this.pointerLocked = false;
    this.lockOnClick = false;
    this.enabled = true;
    this.typing = false;                      // chat focus — suppress game keys
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.actions = new Map();                 // id -> action def
    this._downHandlers = [];
    this._keyHandlers = new Map();            // key -> [{down,up}]
    this.#bindKeyboard();
    this.#bindMouse();
    if (this.isTouch) this.#buildTouchUI();
  }

  // ---------------- desktop ----------------
  #bindKeyboard() {
    this._onKeyDown = (e) => {
      if (this.typing) return;
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ') { this.jumpQueued = true; this.jumpHeld = true; e.preventDefault(); }
      const hs = this._keyHandlers.get(k);
      if (hs && this.enabled) hs.forEach((h) => h.down && h.down());
    };
    this._onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === ' ') this.jumpHeld = false;
      const hs = this._keyHandlers.get(k);
      if (hs) hs.forEach((h) => h.up && h.up());
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  #bindMouse() {
    const el = this.root;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.hud-clickable')) return;
      if (e.button === 0) {
        this.mouseDown = true;
        if (this.lockOnClick && !this.pointerLocked) el.requestPointerLock?.();
        this._downHandlers.forEach((h) => this.enabled && h(e));
      }
      if (e.button === 2) { this.mouse2Down = true; this.rotating = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) { this.mouse2Down = false; this.rotating = false; }
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.lookDX += e.movementX; this.lookDY += e.movementY;
      } else if (this.rotating) {
        this.lookDX += e.movementX; this.lookDY += e.movementY;
      }
    });
    el.addEventListener('wheel', (e) => { this.wheelDelta += e.deltaY; e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement != null;
    });
  }

  onMouseDown(fn) { this._downHandlers.push(fn); }
  bindKey(key, down, up) {
    const k = key.toLowerCase();
    if (!this._keyHandlers.has(k)) this._keyHandlers.set(k, []);
    this._keyHandlers.get(k).push({ down, up });
  }

  // Called by camera rig each frame after consuming
  consumeLook() {
    const d = { x: this.lookDX, y: this.lookDY };
    this.lookDX = 0; this.lookDY = 0;
    return d;
  }
  consumeWheel() { const w = this.wheelDelta; this.wheelDelta = 0; return w; }
  consumeJump() { const j = this.jumpQueued; this.jumpQueued = false; return j; }

  // WASD move vector (raw, camera-relative applied by caller)
  readMove() {
    if (this.typing || !this.enabled) return { x: this.stickX || 0, z: this.stickZ || 0 };
    let x = 0, z = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) z -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) z += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (x === 0 && z === 0) { x = this.stickX || 0; z = this.stickZ || 0; }
    return { x, z };
  }

  // ---------------- mobile ----------------
  #buildTouchUI() {
    const zone = document.createElement('div');
    zone.className = 'touch-zone';
    this.root.appendChild(zone);
    this.touchZone = zone;

    // dynamic joystick
    const joy = document.createElement('div');
    joy.className = 'joystick';
    joy.innerHTML = '<div class="joy-knob"></div>';
    joy.style.display = 'none';
    zone.appendChild(joy);
    const knob = joy.querySelector('.joy-knob');

    // jump button
    const jump = document.createElement('button');
    jump.className = 'btn-jump hud-clickable';
    jump.innerHTML = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M6 14l6-6 6 6"/></svg>`;
    zone.appendChild(jump);
    const jdown = (e) => { e.preventDefault(); this.jumpQueued = true; this.jumpHeld = true; };
    const jup = () => { this.jumpHeld = false; };
    jump.addEventListener('touchstart', jdown, { passive: false });
    jump.addEventListener('touchend', jup);

    // action button dock (populated by registerAction)
    const dock = document.createElement('div');
    dock.className = 'action-dock';
    zone.appendChild(dock);
    this.actionDock = dock;

    // touch move/camera
    this.stickX = 0; this.stickZ = 0;
    let joyId = null, joyCX = 0, joyCY = 0;
    let camId = null, camX = 0, camY = 0;
    const R = 52;

    this.root.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.target.closest('.hud-clickable') || t.target.closest('.hud-panel')) continue;
        const leftSide = t.clientX < innerWidth * 0.42 && t.clientY > innerHeight * 0.3;
        if (leftSide && joyId === null) {
          joyId = t.identifier;
          joyCX = t.clientX; joyCY = t.clientY;
          joy.style.display = 'block';
          joy.style.left = (joyCX - R) + 'px';
          joy.style.top = (joyCY - R) + 'px';
          knob.style.transform = 'translate(0px,0px)';
        } else if (camId === null) {
          camId = t.identifier;
          camX = t.clientX; camY = t.clientY;
        }
      }
    }, { passive: true });

    this.root.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          let dx = t.clientX - joyCX, dy = t.clientY - joyCY;
          const len = Math.hypot(dx, dy);
          if (len > R) { dx = dx / len * R; dy = dy / len * R; }
          knob.style.transform = `translate(${dx}px,${dy}px)`;
          this.stickX = dx / R;
          this.stickZ = dy / R;
        } else if (t.identifier === camId) {
          this.lookDX += (t.clientX - camX) * 1.9;
          this.lookDY += (t.clientY - camY) * 1.9;
          camX = t.clientX; camY = t.clientY;
        }
      }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          this.stickX = 0; this.stickZ = 0;
          joy.style.display = 'none';
        }
        if (t.identifier === camId) camId = null;
      }
    };
    this.root.addEventListener('touchend', endTouch);
    this.root.addEventListener('touchcancel', endTouch);
  }

  // Register a game action: keyboard key + on-screen mobile button + optional
  // desktop hotbar display. opts: {id,label,icon,key,onDown,onUp,cooldown,size,color,hold}
  registerAction(opts) {
    const act = { ...opts, readyAt: 0, el: null, cdEl: null };
    this.actions.set(opts.id, act);
    if (opts.key) {
      this.bindKey(opts.key, () => this.#fire(act), () => opts.onUp && opts.onUp());
    }
    if (this.isTouch && this.actionDock) {
      const b = document.createElement('button');
      b.className = 'btn-action hud-clickable' + (opts.size === 'big' ? ' big' : '');
      if (opts.color) b.style.borderColor = opts.color;
      b.innerHTML = `<span class="icon">${opts.icon || '❖'}</span><span class="lbl">${opts.label || ''}</span><span class="cd"></span>`;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.#fire(act); }, { passive: false });
      b.addEventListener('touchend', () => opts.onUp && opts.onUp());
      this.actionDock.appendChild(b);
      act.el = b;
      act.cdEl = b.querySelector('.cd');
    }
    return act;
  }

  #fire(act) {
    if (!this.enabled || this.typing) return;
    const now = performance.now() / 1000;
    if (act.cooldown && now < act.readyAt) return;
    if (act.cooldown) {
      act.readyAt = now + act.cooldown;
      if (act.cdEl) {
        act.cdEl.style.transition = 'none';
        act.cdEl.style.height = '100%';
        requestAnimationFrame(() => {
          act.cdEl.style.transition = `height ${act.cooldown}s linear`;
          act.cdEl.style.height = '0%';
        });
      }
    }
    act.onDown && act.onDown();
  }

  triggerCooldown(id, seconds) {
    const act = this.actions.get(id);
    if (!act) return;
    act.readyAt = performance.now() / 1000 + seconds;
    if (act.cdEl) {
      act.cdEl.style.transition = 'none';
      act.cdEl.style.height = '100%';
      requestAnimationFrame(() => {
        act.cdEl.style.transition = `height ${seconds}s linear`;
        act.cdEl.style.height = '0%';
      });
    }
  }

  setFireButton(onDown, onUp) {
    if (!this.isTouch || !this.touchZone) return;
    const b = document.createElement('button');
    b.className = 'btn-fire hud-clickable';
    b.innerHTML = '<span>◎</span>';
    this.touchZone.appendChild(b);
    b.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.enabled) onDown(); }, { passive: false });
    b.addEventListener('touchend', () => onUp && onUp());
    return b;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
