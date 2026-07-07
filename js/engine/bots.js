// ============================================================
// BLOXVERSE engine — AI player personas, bot base + chatter
// ============================================================
import * as THREE from 'three';
import { ChatBrain } from './chatbrain.js';
import { CharController, distXZ } from './physics.js';
import { R15Character, nameColor } from './character.js';

// Invented usernames with fixed personalities & looks
export const BOT_POOL = [
  { name: 'xX_DarkSlayr_Xx', mood: 'angry', chattiness: 0.85, avatar: { skin: '#d5d8dd', shirt: '#22262a', pants: '#22262a', hat: 'cap', face: 'angry' } },
  { name: 'noobslayer2012', mood: 'angry', chattiness: 0.75, avatar: { skin: '#f5cd30', shirt: '#c22f2f', pants: '#22262a', hat: 'none', face: 'angry' } },
  { name: 'RageQuitRandy', mood: 'angry', chattiness: 0.9, avatar: { skin: '#fdc180', shirt: '#e88b12', pants: '#274a8a', hat: 'none', face: 'angry' } },
  { name: 'ToxicTina_TTV', mood: 'angry', chattiness: 0.8, avatar: { skin: '#f2b8c6', shirt: '#7b3fd4', pants: '#22262a', hat: 'headphones', face: 'angry' } },
  { name: 'SunnyBunny_77', mood: 'happy', chattiness: 0.9, avatar: { skin: '#fdc180', shirt: '#ff69b4', pants: '#f2f4f5', hat: 'halo', face: 'happy' } },
  { name: 'EpicPizzaDude', mood: 'happy', chattiness: 0.7, avatar: { skin: '#f5cd30', shirt: '#c22f2f', pants: '#2a9e35', hat: 'cap', face: 'happy' } },
  { name: 'WaffleQueen_yt', mood: 'happy', chattiness: 0.8, avatar: { skin: '#a05a2c', shirt: '#e88b12', pants: '#6d4229', hat: 'crown', face: 'happy' } },
  { name: 'GoldenRetrieverIRL', mood: 'happy', chattiness: 0.85, avatar: { skin: '#f5cd30', shirt: '#0f7abd', pants: '#2a9e35', hat: 'none', face: 'happy' } },
  { name: 'lofi_larry', mood: 'chill', chattiness: 0.45, avatar: { skin: '#e0a370', shirt: '#01655c', pants: '#22262a', hat: 'headphones', face: 'chill' } },
  { name: 'TofuTornado', mood: 'chill', chattiness: 0.5, avatar: { skin: '#8ad06a', shirt: '#f2f4f5', pants: '#274a8a', hat: 'none', face: 'chill' } },
  { name: 'zen_zeke', mood: 'chill', chattiness: 0.4, avatar: { skin: '#6d4229', shirt: '#9aa0a6', pants: '#22262a', hat: 'none', face: 'chill' } },
  { name: 'CasualCarrot', mood: 'chill', chattiness: 0.55, avatar: { skin: '#fdc180', shirt: '#e88b12', pants: '#2a9e35', hat: 'cap', face: 'chill' } },
  { name: 'sigma_kai', mood: 'competitive', chattiness: 0.6, avatar: { skin: '#d5d8dd', shirt: '#22262a', pants: '#9aa0a6', hat: 'none', face: 'smile' } },
  { name: 'MLG_Mackenzie', mood: 'competitive', chattiness: 0.7, avatar: { skin: '#f2b8c6', shirt: '#7b3fd4', pants: '#22262a', hat: 'headphones', face: 'smile' } },
  { name: 'ProModeOnly', mood: 'competitive', chattiness: 0.65, avatar: { skin: '#e0a370', shirt: '#274a8a', pants: '#22262a', hat: 'cap', face: 'smile' } },
  { name: 'SpeedrunSteve', mood: 'competitive', chattiness: 0.6, avatar: { skin: '#f5cd30', shirt: '#f2f4f5', pants: '#c22f2f', hat: 'none', face: 'smile' } },
  { name: 'QuackityMcDuck', mood: 'silly', chattiness: 0.9, avatar: { skin: '#f5cd30', shirt: '#f2f4f5', pants: '#e88b12', hat: 'tophat', face: 'silly' } },
  { name: 'BananaPhoneBob', mood: 'silly', chattiness: 0.85, avatar: { skin: '#f5cd30', shirt: '#2a9e35', pants: '#7b3fd4', hat: 'none', face: 'silly' } },
  { name: 'ChaoticNoodle', mood: 'silly', chattiness: 0.9, avatar: { skin: '#f2b8c6', shirt: '#ff69b4', pants: '#0f7abd', hat: 'cap', face: 'silly' } },
  { name: 'GuestLover3000', mood: 'silly', chattiness: 0.8, avatar: { skin: '#9aa0a6', shirt: '#0f7abd', pants: '#2a9e35', hat: 'none', face: 'silly' } },
  { name: 'PhantomOfTheObby', mood: 'dramatic', chattiness: 0.7, avatar: { skin: '#d5d8dd', shirt: '#22262a', pants: '#22262a', hat: 'tophat', face: 'sad' } },
  { name: 'VioletStorm_RP', mood: 'dramatic', chattiness: 0.75, avatar: { skin: '#f2b8c6', shirt: '#7b3fd4', pants: '#22262a', hat: 'none', face: 'sad' } },
  { name: 'Sir_Lancelot_III', mood: 'dramatic', chattiness: 0.65, avatar: { skin: '#fdc180', shirt: '#9aa0a6', pants: '#274a8a', hat: 'crown', face: 'smile' } },
  { name: 'MidnightMoth', mood: 'dramatic', chattiness: 0.6, avatar: { skin: '#e0a370', shirt: '#22262a', pants: '#7b3fd4', hat: 'none', face: 'sad' } },
  { name: 'quiet_quinn', mood: 'shy', chattiness: 0.3, avatar: { skin: '#fdc180', shirt: '#9aa0a6', pants: '#274a8a', hat: 'none', face: 'sad' } },
  { name: 'smolbean_sam', mood: 'shy', chattiness: 0.35, avatar: { skin: '#f2b8c6', shirt: '#f2f4f5', pants: '#e0e3e7', hat: 'none', face: 'smile' } },
  { name: 'wallflower_wes', mood: 'shy', chattiness: 0.25, avatar: { skin: '#6d4229', shirt: '#01655c', pants: '#22262a', hat: 'none', face: 'smile' } },
  { name: 'PebbleCollector', mood: 'shy', chattiness: 0.35, avatar: { skin: '#8ad06a', shirt: '#274a8a', pants: '#6d4229', hat: 'none', face: 'smile' } },
  { name: 'BuilderBen_2007', mood: 'chill', chattiness: 0.5, avatar: { skin: '#f5cd30', shirt: '#0f7abd', pants: '#2a9e35', hat: 'cap', face: 'smile' } },
  { name: 'PinkUnicorn_xo', mood: 'happy', chattiness: 0.8, avatar: { skin: '#f2b8c6', shirt: '#ff69b4', pants: '#f2f4f5', hat: 'halo', face: 'happy' } },
  { name: 'DefNotABot', mood: 'silly', chattiness: 0.75, avatar: { skin: '#9aa0a6', shirt: '#9aa0a6', pants: '#9aa0a6', hat: 'none', face: 'smile' } },
  { name: 'CrimsonReaper_09', mood: 'competitive', chattiness: 0.55, avatar: { skin: '#d5d8dd', shirt: '#c22f2f', pants: '#22262a', hat: 'none', face: 'angry' } },
];

export function pickBots(n, exclude = []) {
  const pool = BOT_POOL.filter((b) => !exclude.includes(b.name));
  const out = [];
  const used = new Set();
  while (out.length < n && used.size < pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(pool[i]);
  }
  return out;
}

// ------------------------------------------------------------
// BotBase: R15 char + controller + brain + steering helpers
// ------------------------------------------------------------
export class BotBase {
  constructor(persona, opts = {}) {
    this.persona = persona;
    this.name = persona.name;
    this.brain = new ChatBrain(persona);
    this.char = new R15Character({
      name: persona.name,
      avatar: persona.avatar,
      nameTagColor: opts.nameTagColor || nameColor(persona.name),
      maxHealth: opts.maxHealth || 100,
    });
    this.ctrl = new CharController(opts.ctrl || {});
    this.alive = true;
    this.targetYaw = 0;
    this._jinkT = 0;
    this._jinkDir = 0;
  }

  get pos() { return this.ctrl.pos; }

  syncVisual(dt) {
    this.char.group.position.copy(this.ctrl.pos);
    // smooth turn toward targetYaw
    let d = this.targetYaw - this.char.group.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.char.group.rotation.y += d * Math.min(1, dt * 10);
    const hSpeed = Math.hypot(this.ctrl.vel.x, this.ctrl.vel.z);
    this.char.update(dt, { speed: hSpeed, grounded: this.ctrl.grounded, velY: this.ctrl.vel.y });
  }

  faceToward(p) {
    this.targetYaw = Math.atan2(p.x - this.ctrl.pos.x, p.z - this.ctrl.pos.z);
  }

  // steer toward point; returns remaining XZ distance
  seek(p, { strafe = 0, jumpIfStuck = true } = {}) {
    const dx = p.x - this.ctrl.pos.x, dz = p.z - this.ctrl.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.2) { this.ctrl.moveDir.set(0, 0, 0); return dist; }
    let mx = dx / dist, mz = dz / dist;
    if (strafe) {
      // add perpendicular strafing (combat movement)
      this._jinkT -= 1 / 60;
      if (this._jinkT <= 0) { this._jinkT = 0.5 + Math.random() * 1.2; this._jinkDir = Math.random() < 0.5 ? -1 : 1; }
      mx += -mz * strafe * this._jinkDir;
      mz += mx * strafe * this._jinkDir * 0.5;
      const l = Math.hypot(mx, mz);
      mx /= l; mz /= l;
    }
    this.ctrl.moveDir.set(mx, 0, mz);
    this.faceToward(p);
    // jump if blocked (barely moving while trying to)
    if (jumpIfStuck && this.ctrl.grounded) {
      const sp = Math.hypot(this.ctrl.vel.x, this.ctrl.vel.z);
      if (sp < this.ctrl.speed * 0.3 && dist > 2) this.ctrl.wantJump = true;
    }
    return dist;
  }

  stop() { this.ctrl.moveDir.set(0, 0, 0); }

  distTo(p) { return distXZ(this.ctrl.pos, p); }
}

// ------------------------------------------------------------
// ChatterManager: routes lines into the HUD chat + head bubbles,
// schedules idle banter and reply chains between bots.
// ------------------------------------------------------------
export class ChatterManager {
  constructor(ui, playerName) {
    this.ui = ui;
    this.playerName = playerName;
    this.entries = [];             // {name, brain, char, color}
    this._queue = [];              // scheduled {at, entry, text}
    this._idleT = 5 + Math.random() * 6;
    this.idleSituation = 'idle';
    this.idleCtx = {};
    this.muted = false;
  }

  register(name, brain, char, color) {
    const e = { name, brain, char, color: color || nameColor(name) };
    this.entries.push(e);
    return e;
  }
  unregister(name) {
    this.entries = this.entries.filter((e) => e.name !== name);
  }

  // immediate speech from a bot
  say(entry, text) {
    if (!text || this.muted) return;
    this.ui.addChat(entry.name, text, entry.color);
    entry.char?.say(text);
    this.#maybeChain(entry.name, text);
  }

  // situation line with probability
  botSay(entry, situation, ctx = {}, prob = null, delay = 0) {
    if (this.muted) return;
    const p = prob ?? entry.brain.chattiness;
    if (Math.random() > p) return;
    const text = entry.brain.line(situation, ctx);
    if (!text) return;
    if (delay > 0) this._queue.push({ at: performance.now() / 1000 + delay, entry, text });
    else this.say(entry, text);
  }

  // player typed a message — bots may respond
  onPlayerMessage(text) {
    this.ui.addChat(this.playerName, text, '#ffffff', { isPlayer: true });
    this.playerChar?.say(text);
    this.#maybeChain(this.playerName, text, 0.9);
  }

  #maybeChain(fromName, text, boost = 0.45) {
    const candidates = this.entries.filter((e) => e.name !== fromName && e.char?.group.visible !== false);
    if (!candidates.length) return;
    // at most 1-2 responders
    const responders = candidates.sort(() => Math.random() - 0.5).slice(0, Math.random() < 0.25 ? 2 : 1);
    for (const e of responders) {
      if (Math.random() > e.brain.chattiness * boost) continue;
      const reply = e.brain.reply(text, fromName, e.name);
      if (reply) this._queue.push({ at: performance.now() / 1000 + 1.2 + Math.random() * 3, entry: e, text: reply });
    }
  }

  update(dt) {
    const now = performance.now() / 1000;
    for (let i = this._queue.length - 1; i >= 0; i--) {
      if (now >= this._queue[i].at) {
        const q = this._queue.splice(i, 1)[0];
        // don't chain replies-to-replies too aggressively
        if (!this.muted && q.text) {
          this.ui.addChat(q.entry.name, q.text, q.entry.color);
          q.entry.char?.say(q.text);
        }
      }
    }
    // idle banter
    this._idleT -= dt;
    if (this._idleT <= 0) {
      this._idleT = 9 + Math.random() * 14;
      const alive = this.entries.filter((e) => e.char?.group.visible !== false);
      if (alive.length && !this.muted) {
        const e = alive[Math.floor(Math.random() * alive.length)];
        this.botSay(e, this.idleSituation, this.idleCtx, e.brain.chattiness * 0.55);
      }
    }
  }
}
