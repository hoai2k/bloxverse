// ============================================================
// BLOXVERSE engine — netplay: remote players + per-game glue.
//
// RemotePlayer: an interpolated R15 avatar driven by a peer's
// presence snapshots (position, facing, anim inputs, hp, one-shot
// actions, chat bubbles).
//
// GameNet: joins the game room, publishes your state each frame,
// keeps the remote-player map in sync with presence, wires chat
// and damage topics, elects a host (for the Zombies horde), and
// tells the game when humans join/leave so bots can bench.
// ============================================================
import * as THREE from 'three';
import { R15Character, nameColor } from './character.js';
import { joinGameRoom, nameHash } from './net.js';

const LERP_DELAY = 0.13; // seconds of interpolation buffer

export class RemotePlayer {
  constructor(scene, presence) {
    this.peerId = presence.pid;
    this.name = presence.n || 'Player';
    this.char = new R15Character({
      name: this.name,
      avatar: presence.av || {},
      nameTagColor: '#8fd3ff',
    });
    scene.add(this.char.group);
    this.scene = scene;
    // interpolation buffer of {t, x, y, z, ry}
    this.buf = [];
    this.hp = presence.hp ?? 100;
    this.maxHp = presence.mhp ?? 100;
    this.alive = this.hp > 0;
    this.lastAseq = presence.aseq || 0;
    this.stats = presence.stats || {};
    this.extra = {};
    // shim so game hit-detection can treat remotes like local fighters
    this.ctrl = { pos: new THREE.Vector3(presence.x || 0, presence.y || 0, presence.z || 0) };
    this._sp = 0; this._gr = true; this._vy = 0;
    this.applyPresence(presence);
    this.char.group.position.copy(this.ctrl.pos);
  }

  applyPresence(p) {
    const now = performance.now() / 1000;
    if (typeof p.x === 'number') {
      this.buf.push({ t: now, x: p.x, y: p.y, z: p.z, ry: p.ry || 0 });
      if (this.buf.length > 20) this.buf.shift();
    }
    this._sp = p.sp || 0; this._gr = p.gr !== false; this._vy = p.vy || 0;
    this.stats = p.stats || this.stats;
    this.extra = p.ex || this.extra;
    const hp = p.hp ?? this.hp;
    if (hp !== this.hp) {
      this.hp = hp;
      this.char.setHealth((hp / (p.mhp || 100)) * this.char.maxHealth);
    }
    const wasAlive = this.alive;
    this.alive = hp > 0;
    if (this.alive && !wasAlive) this.char.respawnVisual();
    // replay one-shot actions (punches, casts, recoil...)
    if (p.aseq && p.aseq !== this.lastAseq) {
      this.lastAseq = p.aseq;
      if (p.act && this.alive) this.char.playAction(p.act, p.adur || 0.35);
    }
    if (p.pose !== undefined) this.char.holdPose = p.pose || null;
  }

  say(text) { this.char.say(text); }

  die() {
    if (this.char.group.visible) this.char.breakApart(this.scene, this.ctrl.pos.y);
    this.alive = false;
  }

  tick(dt) {
    // interpolate LERP_DELAY behind the newest snapshot
    const now = performance.now() / 1000 - LERP_DELAY;
    const b = this.buf;
    let target = null;
    if (b.length >= 2) {
      let i = b.length - 1;
      while (i > 0 && b[i - 1].t > now) i--;
      const a = b[Math.max(0, i - 1)], c = b[i];
      const span = Math.max(0.001, c.t - a.t);
      const f = Math.max(0, Math.min(1, (now - a.t) / span));
      target = {
        x: a.x + (c.x - a.x) * f,
        y: a.y + (c.y - a.y) * f,
        z: a.z + (c.z - a.z) * f,
        ry: lerpAngle(a.ry, c.ry, f),
      };
    } else if (b.length === 1) {
      target = b[0];
    }
    if (target) {
      this.ctrl.pos.set(target.x, target.y, target.z);
      this.char.group.position.copy(this.ctrl.pos);
      this.char.group.rotation.y = lerpAngle(this.char.group.rotation.y, target.ry, Math.min(1, dt * 14));
    }
    if (this.alive) {
      this.char.update(dt, { speed: this._sp, grounded: this._gr, velY: this._vy });
    } else {
      this.char.update(dt, {});
    }
  }

  dispose() { this.char.dispose(); }
}

function lerpAngle(a, b, f) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

// ------------------------------------------------------------
export class GameNet {
  // opts: { scene, ui, gameId, user, localState():obj,
  //         onHit(data, fromPeer), onPeersChanged(count),
  //         onPeerDied(data, fromPeer), topics: {name: cb} }
  constructor(opts) {
    this.o = opts;
    this.room = null;
    this.remotes = new Map();     // peerId -> RemotePlayer
    this.online = false;
    this.isHost = true;           // alone = host of your own world
    this._aseq = 0;
    this._act = null;
    this._extra = null;
  }

  async connect() {
    this.room = await joinGameRoom(this.o.gameId);
    if (typeof window !== 'undefined') window.__bvNet = this; // debug handle
    if (!this.room) return this;   // offline — stay inert
    this.online = true;
    this.room.onPeers((peers) => this.#syncPeers(peers));
    this.room.onTopic('chat', (d) => {
      if (!d) return;
      const rp = this.remotes.get(d._from) || [...this.remotes.values()].find((r) => r.name === d.name);
      this.o.ui.addChat(d.name || 'Player', d.text || '', '#8fd3ff');
      rp?.say(d.text || '');
    });
    this.room.onTopic('hit', (d) => {
      if (!d || d.to !== this.room.peerId) return;
      this.o.onHit && this.o.onHit(d, d._from);
    });
    this.room.onTopic('died', (d) => {
      if (!d) return;
      const rp = this.remotes.get(d._from);
      rp?.die();
      this.o.onPeerDied && this.o.onPeerDied(d, d._from);
    });
    for (const [name, cb] of Object.entries(this.o.topics || {})) {
      this.room.onTopic(name, cb);
    }
    // publish immediately so peers see us fast
    this.publish(true);
    return this;
  }

  #syncPeers(peers) {
    let changed = false;
    for (const [pid, presence] of peers) {
      if (!this.remotes.has(pid)) {
        if (!presence.n) continue;             // wait until they publish real state
        const rp = new RemotePlayer(this.o.scene, presence);
        this.remotes.set(pid, rp);
        this.o.ui.system(`${rp.name} joined the game!`);
        changed = true;
      } else {
        this.remotes.get(pid).applyPresence(presence);
      }
    }
    for (const [pid, rp] of this.remotes) {
      if (!peers.has(pid)) {
        this.o.ui.system(`${rp.name} left.`);
        this.o.ui.removeBoardRow && this.o.ui.removeBoardRow(rp.name);
        rp.dispose();
        this.remotes.delete(pid);
        changed = true;
      }
    }
    // host = lexicographically smallest peerId among everyone present
    const ids = [...this.remotes.keys(), this.room.peerId].sort();
    const newHost = ids[0] === this.room.peerId;
    if (newHost !== this.isHost) { this.isHost = newHost; changed = true; }
    if (changed) this.o.onPeersChanged && this.o.onPeersChanged(this.remotes.size, this.isHost);
  }

  // record a one-shot action so remotes replay it
  action(name, dur) { this._act = { name, dur }; this._aseq++; }
  setExtra(obj) { this._extra = obj; }

  publish(force) {
    if (!this.room) return;
    const st = this.o.localState();
    if (!st) return;
    const u = this.o.user;
    const payload = {
      n: u.name, av: u.avatar,
      x: r2(st.x), y: r2(st.y), z: r2(st.z), ry: r2(st.ry || 0),
      sp: r1(st.sp || 0), gr: st.gr !== false, vy: r1(st.vy || 0),
      hp: Math.round(st.hp ?? 100), mhp: st.mhp || 100,
      stats: st.stats || {},
      aseq: this._aseq,
    };
    if (this._act) { payload.act = this._act.name; payload.adur = this._act.dur; }
    if (st.pose !== undefined) payload.pose = st.pose;
    if (this._extra) payload.ex = this._extra;
    this.room.publishState(payload);
    if (force) this.room.flushPending?.();
  }

  sendChat(text) {
    this.room?.sendTopic('chat', { name: this.o.user.name, text });
  }
  sendHit(peerId, data) {
    this.room?.sendTopic('hit', { ...data, to: peerId });
  }
  sendDied(data) {
    this.room?.sendTopic('died', data || {});
  }
  sendTopic(name, data) { this.room?.sendTopic(name, data); }

  get humanCount() { return this.remotes.size; }
  teamOf(name) { return nameHash(name) % 2 === 0 ? 'orange' : 'teal'; }

  tick(dt) {
    for (const rp of this.remotes.values()) rp.tick(dt);
    this.publish();
  }

  dispose() {
    for (const rp of this.remotes.values()) rp.dispose();
    this.remotes.clear();
    this.room?.leave();
  }
}

function r2(n) { return Math.round((n || 0) * 100) / 100; }
function r1(n) { return Math.round((n || 0) * 10) / 10; }

// convenience: create + connect (never throws)
export async function createGameNet(opts) {
  try {
    const gn = new GameNet(opts);
    await gn.connect();
    return gn;
  } catch {
    return new GameNet(opts); // inert offline instance
  }
}

export { nameColor };
