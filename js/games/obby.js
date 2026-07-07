// ============================================================
// MEGA SKY OBBY — 30-stage sky tower race (Bloxverse original)
// Kill bricks, spinners, movers, vanishing tiles, checkpoints,
// and 5 AI racers who celebrate, choke, and rage in chat.
// ============================================================
import * as THREE from 'three';
import { GameApp } from '../engine/core.js';
import { R15Character } from '../engine/character.js';
import { CharController } from '../engine/physics.js';
import { pickBots, BotBase, ChatterManager } from '../engine/bots.js';
import { sfx } from '../engine/sfx.js';
import { addBlux, getUser, saveUser } from '../site/common.js';
import { createGameNet } from '../engine/netplay.js';
import * as W from '../engine/world.js';

const BEST_KEY = 'bloxverse_obby_best_v1';
const STAGES = 30;
const PALETTE = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac'];

export default async function launch({ root, user, game }) {
  const app = new GameApp({
    root, title: game.name, gameId: 'obby',
    skyTop: '#5db2f0', skyBottom: '#d5ecfa',
    shadowArea: 100, camDist: 15,
  });
  const { scene, world, input, ui, camera } = app;
  world.killY = 2; // lava level

  // ================= lava floor =================
  {
    const lavaTex = W.studsTexture('#c33b2c', 30);
    const lava = new THREE.Mesh(new THREE.BoxGeometry(900, 2, 900),
      new THREE.MeshLambertMaterial({ map: lavaTex, emissive: '#993322', emissiveIntensity: 0.55 }));
    lava.position.y = -1;
    scene.add(lava);
  }
  const cloudTick = W.clouds(scene, 14, 500, 60);
  app.onUpdate(cloudTick);

  // ================= tower builder =================
  const waypoints = [];         // {pos, stage, isCheckpoint}
  const movers = [];            // {mesh, col, a, b, speed, phase}
  const blinkers = [];          // {mesh, col, offset}
  const spinners = [];          // {bar, speed}
  let checkpointPos = [];       // stage -> Vector3

  const stageLabel = (n, pos) => {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const c = cv.getContext('2d');
    c.font = '900 84px system-ui, Arial';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillText(String(n), 131, 95);
    c.fillStyle = '#ffffff';
    c.fillText(String(n), 128, 92);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    sp.scale.set(6, 3, 1);
    sp.position.copy(pos).add(new THREE.Vector3(0, 6.5, 0));
    scene.add(sp);
  };

  function platform(x, y, z, w, d, color, opts = {}) {
    const { mesh, col } = W.part(scene, world, {
      x, y: y - 0.5, z, w, h: 1, d,
      color, touch: opts.kill ? 'kill' : opts.touch, solid: !opts.kill,
      data: opts.data,
      ...(opts.kill ? { mat: new THREE.MeshLambertMaterial({ color: '#e03131', emissive: '#a61e1e', emissiveIntensity: 0.7 }) } : {}),
    });
    if (opts.kill) { col.solid = true; col.touch = 'kill'; } // kill bricks are solid AND deadly
    return { mesh, col };
  }

  // build the spiral
  let cx = 0, cz = 0, cy = 6;
  let dirIdx = 0; // 0:+z 1:+x 2:-z 3:-x
  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const rand = (a, b) => a + Math.random() * (b - a);

  for (let s = 1; s <= STAGES; s++) {
    const color = PALETTE[(s - 1) % PALETTE.length];
    const [dx, dz] = DIRS[dirIdx];
    const diff = Math.min(1, s / STAGES + 0.15);

    // checkpoint pad
    platform(cx, cy, cz, 12, 12, s === 1 ? '#e9ecef' : color, { touch: 'checkpoint', data: s });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.3, 18),
      W.mat('#40c057', { emissive: '#2f9e44', emissiveIntensity: 0.5 }));
    pad.position.set(cx, cy + 0.2, cz);
    scene.add(pad);
    stageLabel(s, new THREE.Vector3(cx, cy, cz));
    checkpointPos[s] = new THREE.Vector3(cx, cy + 0.6, cz);
    waypoints.push({ pos: new THREE.Vector3(cx, cy, cz), stage: s, isCheckpoint: true });

    if (s === STAGES) break; // summit!

    // obstacle section toward the next checkpoint
    const kind = s === 1 ? 0 : (s - 1) % 5;
    let px = cx, py = cy, pz = cz;
    const step = (fw, up, w = 5, d = 5, o = {}) => {
      px += dx * fw; pz += dz * fw; py += up;
      platform(px, py, pz, w, d, o.color || color, o);
      waypoints.push({ pos: new THREE.Vector3(px, py, pz), stage: s });
      return { x: px, y: py, z: pz };
    };

    if (kind === 0) {
      // classic jumps
      const n = 3 + Math.floor(diff * 3);
      for (let i = 0; i < n; i++) step(rand(7.5, 9.5), rand(0.5, 2), rand(4, 5.5), rand(4, 5.5));
    } else if (kind === 1) {
      // kill brick alley: safe tiles with red tiles beside them
      for (let i = 0; i < 4; i++) {
        const at = step(8, 1, 4.6, 4.6);
        // flanking kill bricks
        const side = [dz, dx];
        platform(at.x + side[0] * 5, at.y, at.z + side[1] * 5, 4.6, 4.6, color, { kill: true });
        if (Math.random() < diff) platform(at.x - side[0] * 5, at.y, at.z - side[1] * 5, 4.6, 4.6, color, { kill: true });
      }
      step(8, 1, 5, 5);
    } else if (kind === 2) {
      // moving platforms across a big gap
      const start = { x: px, y: py, z: pz };
      const gap = 30;
      const mid1 = { x: px + dx * gap * 0.33, y: py + 1, z: pz + dz * gap * 0.33 };
      const mid2 = { x: px + dx * gap * 0.66, y: py + 2, z: pz + dz * gap * 0.66 };
      for (const [i, m] of [mid1, mid2].entries()) {
        const { mesh, col } = W.part(scene, world, { x: m.x, y: m.y - 0.5, z: m.z, w: 6, h: 1, d: 6, color: '#dee2e6' });
        // patrol perpendicular to travel dir
        const amp = 6 + diff * 4;
        movers.push({
          mesh, col,
          a: new THREE.Vector3(m.x - dz * amp, m.y - 0.5, m.z - dx * amp),
          b: new THREE.Vector3(m.x + dz * amp, m.y - 0.5, m.z + dx * amp),
          speed: 0.5 + diff * 0.5, phase: i * 1.7,
        });
        waypoints.push({ pos: new THREE.Vector3(m.x, m.y, m.z), stage: s, mover: movers[movers.length - 1] });
      }
      px += dx * gap; pz += dz * gap; py += 3;
      platform(px, py, pz, 7, 7, color);
      waypoints.push({ pos: new THREE.Vector3(px, py, pz), stage: s });
    } else if (kind === 3) {
      // spinner platform
      const at = step(11, 1.5, 16, 16);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(15, 1.6, 1.6),
        new THREE.MeshLambertMaterial({ color: '#e03131', emissive: '#a61e1e', emissiveIntensity: 0.6 }));
      bar.position.set(at.x, at.y + 1.3, at.z);
      scene.add(bar);
      const col = world.addCollider(bar, { solid: false, touch: 'kill', obb: { half: new THREE.Vector3(7.5, 0.8, 0.8) } });
      spinners.push({ bar, speed: (0.9 + diff * 1.3) * (Math.random() < 0.5 ? 1 : -1), col });
      step(11, 1.5, 6, 6);
    } else {
      // vanishing tiles
      for (let i = 0; i < 5; i++) {
        const at = step(7, 0.8, 4.4, 4.4, { color: '#ffe066' });
        const rec = { offset: i * 0.65 };
        const built = platform(at.x, at.y, at.z, 4.4, 4.4, '#ffe066'); // replaced below
        // ^ platform() already added by step(); remove duplicate
        scene.remove(built.mesh);
        world.remove(built.col);
        // find the just-created mesh/col from step's platform: track via bounding search
        blinkers.push({ x: at.x, y: at.y, z: at.z, ...rec });
      }
    }

    // hop to next checkpoint location
    const fw = rand(8, 9.5);
    px += dx * fw; pz += dz * fw; py += 1.5;
    cx = px; cy = py; cz = pz;
    if (s % 3 === 0) dirIdx = (dirIdx + 1) % 4;
  }

  // wire blinkers to their real platform colliders (nearest collider to coords)
  for (const b of blinkers) {
    let best = null, bd = Infinity;
    for (const col of world.colliders) {
      if (!col.mesh) continue;
      const c = col.box.getCenter(new THREE.Vector3());
      const d = Math.abs(c.x - b.x) + Math.abs(c.z - b.z) + Math.abs(c.y - (b.y - 0.5));
      if (d < bd) { bd = d; best = col; }
    }
    if (best && bd < 2) { b.col = best; b.mesh = best.mesh; }
  }

  // summit decorations
  const summit = checkpointPos[STAGES];
  {
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 12, 8), W.mat('#dee2e6'));
    flagPole.position.copy(summit).add(new THREE.Vector3(0, 6, 0));
    scene.add(flagPole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.2), W.mat('#ffd43b', { emissive: '#f5b301', emissiveIntensity: 0.4 }));
    flag.position.copy(summit).add(new THREE.Vector3(2.6, 10, 0));
    scene.add(flag);
  }

  // ================= racers =================
  const chatter = new ChatterManager(ui, user.name);
  chatter.idleSituation = 'idle';

  const playerChar = new R15Character({ name: user.name, avatar: user.avatar, nameTagColor: '#ffffff' });
  scene.add(playerChar.group);
  const ctrl = new CharController({ speed: 16 });
  app.followTarget = playerChar.group;
  chatter.playerChar = playerChar;

  const me = { stage: 1, startT: performance.now() / 1000, won: false };
  let best = 0;
  try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { }

  function respawnPlayer(reason) {
    const p = checkpointPos[me.stage];
    ctrl.teleport(p.x + rand(-1, 1), p.y + 1, p.z + rand(-1, 1));
    sfx.play('oof');
    ui.damageFlash();
    if (reason === 'lava') ui.system('You fell into the void!');
  }
  ctrl.teleport(checkpointPos[1].x, checkpointPos[1].y + 1, checkpointPos[1].z);

  const personas = pickBots(5);
  const racers = personas.map((p) => {
    // Wide skill spread: clumsy racers (fall a lot, slower) up to near-flawless
    // speedrunners. Skill drives both fall chance and run pace.
    const skill = 0.3 + Math.random() * 0.68;        // 0.3 .. 0.98
    const b = new BotBase(p, { ctrl: { speed: 12.5 + skill * 4.5 } });
    scene.add(b.char.group);
    b.chat = chatter.register(p.name, b.brain, b.char);
    b.stage = 1;
    b.wpIndex = 0;
    b.skill = skill;
    b.slipT = 0;
    b.deadT = 0;
    b.won = false;
    b.ctrl.teleport(checkpointPos[1].x + rand(-3, 3), checkpointPos[1].y + 1, checkpointPos[1].z + rand(-3, 3));
    return b;
  });

  // ================= MULTIPLAYER =================
  // Remote racers appear on the tower with live stage progress; the summit
  // win is announced to everyone and the race resets together. AI racers
  // bench while friends are here (each client simulates its own bots).
  let net = null;
  function setBotsBenched(on) {
    for (const r of racers) {
      if (!!r.benched === on) continue;
      r.benched = on;
      r.char.group.visible = !on;
      if (on) ui.removeBoardRow(r.name);
      else {
        r.stage = 1; r.wpIndex = 0; r.won = false; r.deadT = 0;
        r.ctrl.teleport(checkpointPos[1].x + rand(-3, 3), checkpointPos[1].y + 1, checkpointPos[1].z + rand(-3, 3));
      }
    }
    ui.system(on ? 'Real racers are here — the bots stepped aside!' : 'All alone again... the bots are back.');
    refreshBoard();
  }
  createGameNet({
    scene, ui, gameId: 'obby', user,
    localState: () => ({
      x: ctrl.pos.x, y: ctrl.pos.y, z: ctrl.pos.z,
      ry: playerChar.group.rotation.y,
      sp: Math.hypot(ctrl.vel.x, ctrl.vel.z), gr: ctrl.grounded, vy: ctrl.vel.y,
      hp: 100, stats: { stage: me.stage },
    }),
    onPeersChanged: (count) => setBotsBenched(count > 0),
    topics: {
      summit: (d) => {
        if (resetT != null || !d?.name) return;
        const rp = net && [...net.remotes.values()].find((r) => r.name === d.name);
        win(d.name, false, rp?.char);
      },
    },
  }).then((gn) => {
    net = gn;
    if (net.online) ui.system('🌐 Online — race your friends to the top!');
  });

  // ================= HUD =================
  ui.setBoard(['Stage']);
  const refreshBoard = () => {
    ui.board(user.name, [me.stage], { isPlayer: true, color: '#fff' });
    racers.forEach((r) => { if (!r.benched) ui.board(r.name, [r.stage]); });
    if (net) for (const rp of net.remotes.values()) {
      ui.board(rp.name, [rp.stats.stage || 1], { color: '#8fd3ff' });
    }
  };
  refreshBoard();
  ui.setHealth(100, 100);
  ui.el.hpText.textContent = 'Sky Runner';
  ui.system(`Race to Stage ${STAGES}! Green pads save your checkpoint. Watch out for red bricks.`);
  function updatePills() {
    const t = performance.now() / 1000 - me.startT;
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    ui.setPills([
      { icon: '🏁', value: `Stage ${me.stage}/${STAGES}` },
      { icon: '⏱️', value: `${mm}:${String(ss).padStart(2, '0')}` },
      { icon: '👑', value: `Best: ${Math.max(best, me.stage)}` },
    ]);
  }
  updatePills();
  app.onChatSend((t) => { chatter.onPlayerMessage(t); net?.sendChat(t); });
  app.onRespawnRequest(() => respawnPlayer());
  let boardT = 0;

  setTimeout(() => {
    racers.slice(0, 3).forEach((r, i) => chatter.botSay(r.chat, 'spawn', {}, 0.8, 0.5 + i * 1.5));
  }, 1000);

  function saveBest() {
    if (me.stage > best) {
      best = me.stage;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch { }
    }
  }

  // ================= win / reset =================
  let resetT = null;
  function win(name, isPlayer, char) {
    if (isPlayer) net?.sendTopic('summit', { name: user.name });
    ui.announce(`${name} WINS! 👑`, isPlayer ? '+200 Blux! New race starting soon...' : 'New race starting soon...', 5);
    sfx.play('win');
    // fireworks at the summit
    let shots = 0;
    const fw = setInterval(() => {
      sfx.play('firework', { volume: 0.5 });
      app.burst(summit.clone().add(new THREE.Vector3(rand(-8, 8), rand(8, 16), rand(-8, 8))), {
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)], count: 30, speed: 22, size: 0.4, life: 1.1, gravity: 24,
      });
      if (++shots > 9) clearInterval(fw);
    }, 350);
    if (isPlayer) addBlux(200);
    char?.setEmote('dance');
    // reactions
    racers.forEach((r, i) => {
      if (r.char === char) chatter.botSay(r.chat, 'win', {}, 0.9, 1 + i * 0.5);
      else chatter.botSay(r.chat, 'lose', {}, 0.55, 1.5 + i * 1.1);
    });
    resetT = 8;
  }
  function resetRace() {
    resetT = null;
    me.stage = 1; me.won = false; me.startT = performance.now() / 1000;
    respawnPlayer();
    playerChar.setEmote(null);
    racers.forEach((r) => {
      r.stage = 1; r.wpIndex = 0; r.won = false;
      r.char.setEmote(null);
      r.ctrl.teleport(checkpointPos[1].x + rand(-3, 3), checkpointPos[1].y + 1, checkpointPos[1].z + rand(-3, 3));
    });
    refreshBoard();
    ui.announce('NEW RACE', 'Go go go!', 2);
  }

  // ================= main loop =================
  const moveTmp = new THREE.Vector3();
  let pillT = 0;
  app.onUpdate((dt, t) => {
    chatter.update(dt);
    pillT -= dt;
    if (pillT <= 0) { pillT = 0.5; updatePills(); }
    if (resetT != null) { resetT -= dt; if (resetT <= 0) resetRace(); }

    // ---- movers ----
    for (const m of movers) {
      const f = (Math.sin(t * m.speed + m.phase) + 1) / 2;
      const old = m.mesh.position.x + m.mesh.position.z;
      const prev = m.mesh.position.clone();
      m.mesh.position.lerpVectors(m.a, m.b, f);
      world.refresh(m.col);
      m.col.carry = m.mesh.position.clone().sub(prev).divideScalar(dt || 0.016);
    }
    // ---- blinkers ----
    for (const b of blinkers) {
      if (!b.col) continue;
      const cyc = (t + b.offset) % 2.6;
      const solidNow = cyc < 1.6;
      const warning = cyc > 1.15 && cyc < 1.6;
      b.col.enabled = solidNow;
      b.mesh.visible = solidNow;
      if (warning) b.mesh.material.transparent = true, b.mesh.material.opacity = 0.35 + Math.sin(t * 30) * 0.2;
      else if (solidNow) { b.mesh.material.opacity = 1; b.mesh.material.transparent = false; }
    }
    // ---- spinners ----
    for (const s of spinners) s.bar.rotation.y += s.speed * dt;

    // ---- player ----
    if (!ui.menuOpen) {
      app.moveWorld(moveTmp);
      ctrl.moveDir.copy(moveTmp);
      if (input.jumpHeld) ctrl.wantJump = true;
      if (moveTmp.lengthSq() > 0.01) {
        const yaw = Math.atan2(moveTmp.x, moveTmp.z);
        let d = yaw - playerChar.group.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        playerChar.group.rotation.y += d * Math.min(1, dt * 12);
      }
    } else ctrl.moveDir.set(0, 0, 0);
    ctrl.update(dt, world);
    playerChar.group.position.copy(ctrl.pos);
    playerChar.update(dt, { speed: Math.hypot(ctrl.vel.x, ctrl.vel.z), grounded: ctrl.grounded, velY: ctrl.vel.y });

    // touches
    for (const c of ctrl.touching) {
      if (c.touch === 'kill') { respawnPlayer(); break; }
      if (c.touch === 'checkpoint' && c.data > me.stage && !me.won) {
        me.stage = c.data;
        sfx.play('checkpoint');
        ui.announce(`Stage ${me.stage}`, '', 1.2);
        saveBest();
        refreshBoard();
        if (me.stage === STAGES) { me.won = true; win(user.name, true, playerChar); }
      }
    }
    if (ctrl.fellOff) respawnPlayer('lava');

    // ---- racers ----
    for (const r of racers) {
      if (r.benched) continue;
      if (r.deadT > 0) {
        r.deadT -= dt;
        if (r.deadT <= 0) {
          const p = checkpointPos[r.stage];
          r.ctrl.teleport(p.x + rand(-2, 2), p.y + 1, p.z + rand(-2, 2));
          r.char.respawnVisual();
          // rewind waypoint index to checkpoint
          r.wpIndex = waypoints.findIndex((w) => w.isCheckpoint && w.stage === r.stage);
        }
        continue;
      }
      if (r.won) { r.stop(); r.syncVisual(dt); continue; }

      const wp = waypoints[Math.min(r.wpIndex + 1, waypoints.length - 1)];
      if (wp) {
        let target = wp.pos;
        if (wp.mover) target = wp.mover.mesh.position; // chase the moving platform
        const dist = r.seek(target, { jumpIfStuck: false });
        // hop across gaps
        if (r.ctrl.grounded && (dist > 2.8 || target.y > r.ctrl.pos.y + 0.5)) r.ctrl.wantJump = true;
        // slip mechanic — sometimes they just fumble it
        if (r.slipT > 0) {
          r.slipT -= dt;
          const md = r.ctrl.moveDir;
          md.set(md.z, 0, -md.x); // veer sideways
        }
        if (dist < 2.4 && Math.abs(target.y - r.ctrl.pos.y) < 3) {
          r.wpIndex = Math.min(r.wpIndex + 1, waypoints.length - 1);
          const diff = Math.min(1, wp.stage / STAGES + 0.2);
          if (Math.random() > r.skill * (1.05 - diff * 0.25)) r.slipT = 0.45;
          if (wp.isCheckpoint && wp.stage > r.stage) {
            r.stage = wp.stage;
            refreshBoard();
            if (Math.random() < 0.3) chatter.botSay(r.chat, 'checkpoint', { stage: r.stage }, 0.6, 0.3);
            if (r.stage === STAGES) { r.won = true; win(r.name, false, r.char); }
          }
        }
      }
      r.ctrl.update(dt, world);
      // deaths
      let died = r.ctrl.fellOff;
      for (const c of r.ctrl.touching) if (c.touch === 'kill') died = true;
      if (died) {
        r.deadT = 1.2;
        r.char.breakApart(scene, r.ctrl.pos.y);
        sfx.play('oof', { volume: 0.4 });
        r.ctrl.fellOff = false;
        chatter.botSay(r.chat, 'fall', { stage: r.stage }, r.brain.mood === 'angry' ? 0.85 : 0.45, 0.5 + Math.random());
        continue;
      }
      r.syncVisual(dt);
    }

    // multiplayer: interpolate remote racers + publish our progress
    if (net) {
      net.tick(dt);
      boardT -= dt;
      if (boardT <= 0 && net.humanCount) { boardT = 0.8; refreshBoard(); }
    }

    ui.updatePrompts(dt, camera, ctrl.pos, input.keys);
  });

  app.start();
}
