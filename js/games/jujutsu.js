// ============================================================
// JUJUTSU SHENANIGANS — city battleground fighter
// M1 combos, 4 cursed abilities, block, dash, Awakening ult,
// 7 AI fighters with moods, ragdolls & break-apart deaths.
// ============================================================
import * as THREE from 'three';
import { GameApp } from '../engine/core.js';
import { R15Character, nameColor } from '../engine/character.js';
import { CharController, distXZ } from '../engine/physics.js';
import { pickBots, BotBase, ChatterManager } from '../engine/bots.js';
import { sfx } from '../engine/sfx.js';
import { addBlux } from '../site/common.js';
import * as W from '../engine/world.js';

const ARENA = 240;

export default async function launch({ root, user, game }) {
  const app = new GameApp({
    root, title: game.name, gameId: 'jujutsu',
    skyTop: '#6db5ea', skyBottom: '#e8d9c4',
    fog: { color: '#cfd8de', near: 160, far: 520 },
    shadowArea: 150, camDist: 15,
  });
  const { scene, world, input, ui, camera } = app;

  // ================= MAP: city block =================
  W.ground(scene, world, ARENA + 60, W.asphaltTexture(20));
  // central plaza
  W.part(scene, world, { x: 0, y: 0.15, z: 0, w: 64, h: 0.3, d: 64, tex: W.checkerTexture('#b9bec6', '#a3a9b2', 10), castShadow: false });
  // fountain
  W.part(scene, world, { x: 0, y: 1, z: 0, w: 14, h: 2, d: 14, color: '#8f98a3' });
  W.part(scene, world, { x: 0, y: 2.6, z: 0, w: 10, h: 1.2, d: 10, color: '#68d0e8', castShadow: false });
  W.part(scene, world, { x: 0, y: 4.5, z: 0, w: 2.4, h: 5, d: 2.4, color: '#8f98a3' });
  {
    const jet = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), W.mat('#9fe4f5', { opacity: 0.7 }));
    jet.position.set(0, 8, 0);
    scene.add(jet);
    app.addEffect((dt) => { jet.scale.setScalar(1 + Math.sin(app.time * 3) * 0.15); return true; });
  }
  // buildings around the plaza on a grid
  const cells = [
    [-90, -90, 44, 44, 34], [-30, -95, 40, 34, 22], [40, -92, 46, 40, 46],
    [95, -40, 34, 44, 28], [92, 30, 40, 40, 38], [88, 92, 44, 44, 24],
    [30, 95, 40, 34, 30], [-40, 92, 44, 40, 42], [-95, 40, 36, 44, 26],
    [-92, -30, 38, 36, 32],
  ];
  const palette = ['#8d99a6', '#a6764f', '#7b8894', '#997a63', '#77808d', '#9b6a56'];
  cells.forEach(([x, z, w, d, h], i) => W.building(scene, world, x, z, w, d, h, { color: palette[i % palette.length], lit: 0.35 }));
  // trees + benches + lamps around plaza
  [[-42, -42], [42, -42], [-42, 42], [42, 42]].forEach(([x, z]) => W.tree(scene, world, x, z, 1.3));
  [[-24, 0, Math.PI / 2], [24, 0, -Math.PI / 2], [0, -24, 0], [0, 24, Math.PI]].forEach(([x, z, r]) => W.bench(scene, world, x, z, r));
  [[-55, -20], [-55, 20], [55, -20], [55, 20], [-20, -55], [20, 55]].forEach(([x, z]) => W.lampPost(scene, world, x, z, false));
  // parked cars
  const carColors = ['#c0392b', '#2980b9', '#f1c40f', '#27ae60', '#8e44ad'];
  [[-64, -8, 0], [-64, 10, 0], [64, -12, 0], [8, -64, Math.PI / 2], [-14, 64, Math.PI / 2]].forEach(([x, z, ry], i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2, 11), W.mat(carColors[i % 5]));
    body.position.y = 1.8;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 1.9, 5.4), W.mat('#22262a', { opacity: 0.92 }));
    cab.position.y = 3.6;
    g.add(body, cab);
    for (const [wx, wz] of [[-2.6, -3.4], [2.6, -3.4], [-2.6, 3.4], [2.6, 3.4]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.8, 10), W.mat('#191a1c'));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 1, wz);
      g.add(wheel);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    scene.add(g);
    world.addCollider(body);
  });
  const cloudTick = W.clouds(scene, 8, 500, 110);
  app.onUpdate(cloudTick);
  // arena walls (invisible, thick so knockback can never tunnel through)
  const HB = ARENA / 2 + 20;
  world.addBox3(new THREE.Box3(new THREE.Vector3(-HB - 40, -10, -HB - 40), new THREE.Vector3(-HB, 80, HB + 40)));
  world.addBox3(new THREE.Box3(new THREE.Vector3(HB, -10, -HB - 40), new THREE.Vector3(HB + 40, 80, HB + 40)));
  world.addBox3(new THREE.Box3(new THREE.Vector3(-HB, -10, -HB - 40), new THREE.Vector3(HB, 80, -HB)));
  world.addBox3(new THREE.Box3(new THREE.Vector3(-HB, -10, HB), new THREE.Vector3(HB, 80, HB + 40)));

  const SPAWNS = [[-20, -20], [20, -20], [-20, 20], [20, 20], [0, -34], [0, 34], [-34, 0], [34, 0]];
  function spawnPoint() {
    const [x, z] = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    return new THREE.Vector3(x + (Math.random() - 0.5) * 6, 0.4, z + (Math.random() - 0.5) * 6);
  }

  // ================= fighters =================
  const fighters = [];
  const chatter = new ChatterManager(ui, user.name);
  let nextId = 1;

  function makeFighter({ name, avatar, isPlayer, persona }) {
    if (!name && persona) name = persona.name;
    let char, ctrl, bot = null, brainEntry = null;
    if (isPlayer) {
      char = new R15Character({ name, avatar, nameTagColor: '#ffffff', maxHealth: 100 });
      ctrl = new CharController({ speed: 16 });
    } else {
      bot = new BotBase(persona, { maxHealth: 100 });
      char = bot.char;
      ctrl = bot.ctrl;
    }
    scene.add(char.group);
    const f = {
      id: nextId++, name, char, ctrl, isPlayer, bot,
      hp: 100, alive: true, kos: 0, deaths: 0,
      blocking: false, blockHp: 30, stunT: 0, iframeT: 0,
      ult: 0, awakenT: 0, comboStep: 0, comboIdleT: 0, m1Cool: 0,
      cds: { rush: 0, barrage: 0, slam: 0, blast: 0, dash: 0 },
      barrageT: 0, respawnT: 0, lastHitBy: null, yaw: 0,
      aura: 0,
      // bot combat brain params — one wide skill tier drives reaction speed
      // and aggression together, so fighters range from clumsy to menacing.
      ai: bot ? (() => {
        const skill = Math.random();                 // 0 (scrub) .. 1 (demon)
        return {
          skill,
          reaction: 0.6 - skill * 0.48,              // 0.6s slow .. 0.12s twitch
          aggression: 0.3 + skill * 0.65,            // 0.3 passive .. 0.95 relentless
          retargetT: 0, target: null, thinkT: 0, retreatT: 0,
        };
      })() : null,
    };
    if (bot) {
      brainEntry = chatter.register(name, bot.brain, char);
      f.chat = brainEntry;
    }
    const p = spawnPoint();
    ctrl.teleport(p.x, p.y, p.z);
    fighters.push(f);
    return f;
  }

  const player = makeFighter({ name: user.name, avatar: user.avatar, isPlayer: true });
  const personas = pickBots(7);
  personas.forEach((p) => makeFighter({ persona: p, isPlayer: false }));
  app.followTarget = player.char.group;
  chatter.playerChar = player.char;

  // ================= HUD =================
  ui.setBoard(['KOs', 'Falls']);
  const refreshBoard = () => fighters.forEach((f) =>
    ui.board(f.name, [f.kos, f.deaths], { isPlayer: f.isPlayer, color: f.isPlayer ? '#ffffff' : undefined }));
  refreshBoard();
  ui.setHealth(100, 100);
  ui.system(`Welcome to ${game.name}! Fight for KOs. Fill your meter, then press G to AWAKEN.`);

  const updatePills = () => {
    ui.setPills([
      { icon: '🌀', value: `${Math.floor(player.ult)}%`, label: 'meter', color: player.ult >= 100 ? '#b06df5' : undefined },
      { icon: '👊', value: player.kos, label: 'KOs' },
    ]);
  };
  updatePills();

  // ================= combat =================
  const FORWARD = new THREE.Vector3();
  function fwdOf(f, out) {
    out.set(Math.sin(f.char.group.rotation.y), 0, Math.cos(f.char.group.rotation.y));
    return out;
  }
  function chestPos(f) {
    return new THREE.Vector3(f.ctrl.pos.x, f.ctrl.pos.y + 3.4, f.ctrl.pos.z);
  }

  function enemiesInArc(self, range, arcDot = 0.35) {
    const fwd = fwdOf(self, FORWARD);
    const out = [];
    for (const f of fighters) {
      if (f === self || !f.alive) continue;
      const dx = f.ctrl.pos.x - self.ctrl.pos.x, dz = f.ctrl.pos.z - self.ctrl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const dot = (dx / (d || 1)) * fwd.x + (dz / (d || 1)) * fwd.z;
      if (dot > arcDot || d < 2.2) out.push(f);
    }
    return out;
  }

  function dealDamage(att, tgt, dmg, opts = {}) {
    if (!tgt.alive || tgt.iframeT > 0) return;
    if (att.awakenT > 0) dmg *= 1.5;
    let blocked = false;
    if (tgt.blocking && !opts.unblockable) {
      tgt.blockHp -= dmg;
      dmg *= 0.15;
      blocked = true;
      if (tgt.blockHp <= 0) {
        stopBlock(tgt);
        tgt.stunT = 1.4;
        tgt.char.playAction('recoil', 1.4);
        ui.popup(camera, chestPos(tgt), 'GUARD BREAK', '#ffd166', 15);
        sfx.play('hit');
      }
    }
    tgt.hp -= dmg;
    tgt.lastHitBy = att;
    tgt.char.setHealth(tgt.hp);
    att.ult = Math.min(100, att.ult + dmg * 0.55);
    tgt.ult = Math.min(100, tgt.ult + dmg * 0.35);
    // feedback
    const cp = chestPos(tgt);
    app.burst(cp, { color: blocked ? '#9aa7b5' : '#ffd166', count: 8, speed: 12, size: 0.22, life: 0.3 });
    ui.popup(camera, cp, `-${Math.round(dmg)}`, blocked ? '#9aa7b5' : (att.isPlayer ? '#ffd166' : '#ff8888'), att.isPlayer ? 17 : 14);
    if (tgt.isPlayer) { ui.damageFlash(); ui.setHealth(tgt.hp, 100); }
    if (att.isPlayer) ui.hitmarker();
    sfx.play('punch', { volume: 0.7 });
    // knockback
    if (opts.knock) {
      const dir = new THREE.Vector3(tgt.ctrl.pos.x - att.ctrl.pos.x, 0, tgt.ctrl.pos.z - att.ctrl.pos.z).normalize();
      tgt.ctrl.knockback.addScaledVector(dir, opts.knock);
      if (opts.up) tgt.ctrl.vel.y = opts.up;
    }
    if (opts.ragdoll && tgt.alive) {
      tgt.char.setRagdoll(true);
      tgt.stunT = Math.max(tgt.stunT, opts.ragdoll);
      setTimeout(() => { if (tgt.alive) tgt.char.setRagdoll(false); }, opts.ragdoll * 1000);
    }
    if (tgt.hp <= 0) kill(att, tgt);
    else if (tgt.hp <= 25 && tgt.hp + dmg > 25 && tgt.chat) {
      chatter.botSay(tgt.chat, 'lowhp', {}, 0.5, 0.4);
    }
    if (tgt.isPlayer) updatePills();
    if (att.isPlayer) updatePills();
  }

  function kill(att, tgt) {
    tgt.alive = false;
    tgt.deaths++;
    att.kos++;
    att.ult = Math.min(100, att.ult + 30);
    tgt.char.breakApart(scene, tgt.ctrl.pos.y);
    app.burst(chestPos(tgt), { color: '#ffffff', count: 20, speed: 24, size: 0.35, life: 0.6 });
    sfx.play('oof');
    ui.killfeed(att.name, tgt.name, '👊', att.isPlayer ? '#fff' : undefined, tgt.isPlayer ? '#fff' : undefined);
    refreshBoard();
    tgt.respawnT = 3;
    tgt.blocking = false;
    if (att.isPlayer) {
      addBlux(5);
      ui.popup(camera, chestPos(tgt), '+5 Blux', '#ffb400', 15);
      updatePills();
    }
    if (tgt.isPlayer) {
      ui.respawnScreen(true, 'Respawning in 3...');
      updatePills();
    }
    // chat reactions — the salt is the feature
    if (tgt.chat) chatter.botSay(tgt.chat, 'death', { killer: att.name }, tgt.bot.brain.mood === 'angry' ? 0.95 : 0.6, 0.7 + Math.random());
    if (att.chat) chatter.botSay(att.chat, 'kill', { victim: tgt.name }, 0.55, 0.4 + Math.random() * 0.8);
  }

  function respawn(f) {
    const p = spawnPoint();
    f.ctrl.teleport(p.x, p.y, p.z);
    f.hp = 100;
    f.blockHp = 30;
    f.alive = true;
    f.stunT = 0;
    f.iframeT = 2;
    f.char.respawnVisual();
    f.char.setHealth(100);
    if (f.isPlayer) { ui.setHealth(100, 100); ui.respawnScreen(false); }
  }

  // ---- M1 combo ----
  function doM1(f) {
    if (!f.alive || f.stunT > 0 || f.m1Cool > 0 || f.barrageT > 0) return;
    f.m1Cool = 0.32;
    f.comboIdleT = 1.1;
    f.comboStep = (f.comboStep % 4) + 1;
    const acts = ['punchL', 'punchR', 'punchL', 'kick'];
    f.char.playAction(acts[f.comboStep - 1], 0.3);
    sfx.play('whoosh', { volume: 0.4 });
    // small lunge
    const fwd = fwdOf(f, FORWARD);
    f.ctrl.knockback.addScaledVector(fwd, 7);
    const targets = enemiesInArc(f, 5.2);
    for (const t of targets) {
      if (f.comboStep === 4) dealDamage(f, t, 9, { knock: 34, up: 16, ragdoll: 0.9 });
      else dealDamage(f, t, 5.5, { knock: 6 });
    }
    if (f.comboStep === 4 && f.isPlayer) app.screenShake(0.3);
  }

  // ---- abilities ----
  function abilityRush(f) {
    if (!f.alive || f.stunT > 0 || f.cds.rush > 0) return false;
    f.cds.rush = 6;
    const fwd = fwdOf(f, FORWARD);
    f.char.playAction('punchR', 0.35);
    sfx.play('dash');
    f.iframeT = Math.max(f.iframeT, 0.25);
    const start = f.ctrl.pos.clone();
    f.ctrl.knockback.addScaledVector(fwd, 85);
    // trail
    for (let i = 0; i < 5; i++) {
      setTimeout(() => app.burst(chestPos(f), { color: '#7fd4ff', count: 6, speed: 4, size: 0.3, life: 0.35, gravity: 0 }), i * 40);
    }
    setTimeout(() => {
      for (const t of fighters) {
        if (t === f || !t.alive) continue;
        // hit anyone near the dash line
        const d = distToSegXZ(t.ctrl.pos, start, f.ctrl.pos);
        if (d < 4) dealDamage(f, t, 18, { knock: 40, up: 12, ragdoll: 0.7 });
      }
    }, 210);
    if (f.isPlayer) { ui.hotbarCooldown('rush', 6); input.triggerCooldown('rush', 6); }
    return true;
  }

  function abilityBarrage(f) {
    if (!f.alive || f.stunT > 0 || f.cds.barrage > 0) return false;
    f.cds.barrage = 10;
    f.barrageT = 1.3;
    f.char.playAction('barrage', 1.3);
    if (f.isPlayer) { ui.hotbarCooldown('barrage', 10); input.triggerCooldown('barrage', 10); }
    return true;
  }

  function abilitySlam(f) {
    if (!f.alive || f.stunT > 0 || f.cds.slam > 0) return false;
    f.cds.slam = 14;
    f.char.playAction('slam', 0.75);
    f.ctrl.vel.y = 34;
    const fwd = fwdOf(f, FORWARD);
    f.ctrl.knockback.addScaledVector(fwd, 26);
    sfx.play('whoosh');
    f._slamPending = 0.35;
    if (f.isPlayer) { ui.hotbarCooldown('slam', 14); input.triggerCooldown('slam', 14); }
    return true;
  }
  function slamImpact(f) {
    const at = f.ctrl.pos.clone();
    app.ring(at, { color: '#ffb35c', maxR: 12, life: 0.5 });
    app.burst(at, { color: '#c9a06a', count: 26, speed: 26, size: 0.4, life: 0.6 });
    sfx.play('explosion', { volume: 0.7 });
    if (f.isPlayer) app.screenShake(0.8);
    for (const t of fighters) {
      if (t === f || !t.alive) continue;
      if (distXZ(t.ctrl.pos, at) < 10) dealDamage(f, t, 25, { knock: 30, up: 30, ragdoll: 1.1 });
    }
  }

  const projectiles = [];
  function abilityBlast(f) {
    if (!f.alive || f.stunT > 0 || f.cds.blast > 0) return false;
    f.cds.blast = 20;
    f.char.playAction('cast', 0.8);
    sfx.play('charge');
    if (f.isPlayer) { ui.hotbarCooldown('blast', 20); input.triggerCooldown('blast', 20); }
    setTimeout(() => {
      if (!f.alive) return;
      const fwd = fwdOf(f, FORWARD);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 10),
        new THREE.MeshBasicMaterial({ color: '#b06df5' }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 10),
        new THREE.MeshBasicMaterial({ color: '#7b3fd4', transparent: true, opacity: 0.35 }));
      mesh.add(glow);
      mesh.position.copy(chestPos(f)).addScaledVector(fwd, 2.5);
      scene.add(mesh);
      sfx.play('blast');
      projectiles.push({ mesh, vel: fwd.clone().multiplyScalar(72), owner: f, life: 2.2 });
    }, 500);
    return true;
  }

  function explodeBlast(p) {
    const at = p.mesh.position;
    app.ring(new THREE.Vector3(at.x, Math.max(0.2, at.y - 3), at.z), { color: '#b06df5', maxR: 14, life: 0.55 });
    app.burst(at, { color: '#b06df5', count: 30, speed: 30, size: 0.45, life: 0.7, gravity: 20 });
    sfx.play('explosion');
    app.screenShake(0.5);
    for (const t of fighters) {
      if (t === p.owner || !t.alive) continue;
      if (t.ctrl.pos.distanceTo(at) < 11) dealDamage(p.owner, t, 35, { knock: 45, up: 24, ragdoll: 1.2, unblockable: true });
    }
    scene.remove(p.mesh);
  }

  function abilityDash(f) {
    if (!f.alive || f.stunT > 0 || f.cds.dash > 0) return false;
    f.cds.dash = 2.4;
    const dir = f.ctrl.moveDir.lengthSq() > 0.01 ? f.ctrl.moveDir.clone().normalize() : fwdOf(f, FORWARD);
    f.ctrl.knockback.addScaledVector(dir, 55);
    f.iframeT = Math.max(f.iframeT, 0.2);
    sfx.play('dash', { volume: 0.5 });
    app.burst(new THREE.Vector3(f.ctrl.pos.x, f.ctrl.pos.y + 1, f.ctrl.pos.z), { color: '#ffffff', count: 8, speed: 6, size: 0.25, life: 0.3, gravity: 0 });
    if (f.isPlayer) input.triggerCooldown('dash', 2.4);
    return true;
  }

  function startBlock(f) {
    if (!f.alive || f.stunT > 0) return;
    f.blocking = true;
    f.char.playAction('block', 999);
  }
  function stopBlock(f) {
    f.blocking = false;
    if (f.char.action?.name === 'block') f.char.action = null;
  }

  function awaken(f) {
    if (!f.alive || f.ult < 100 || f.awakenT > 0) return false;
    f.ult = 0;
    f.awakenT = 12;
    f.hp = Math.min(100, f.hp + 40);
    f.char.setHealth(f.hp);
    sfx.play('awaken');
    ui.killfeed(f.name, 'AWAKENED', '🌀', undefined, '#b06df5');
    if (f.isPlayer) {
      ui.setHealth(f.hp, 100);
      ui.announce('AWAKENING', 'Damage up! Speed up!', 2.2);
      ui.tint('#7b3fd4', 0.16);
      app.screenShake(1.0);
      updatePills();
    }
    if (f.chat) chatter.botSay(f.chat, 'roundStart', {}, 0.5, 0.6);
    return true;
  }

  // ================= player bindings =================
  const attack = () => doM1(player);
  input.onMouseDown(() => { if (!ui.menuOpen) attack(); });
  if (input.isTouch) {
    input.setFireButton(() => attack());
  }
  input.registerAction({ id: 'rush', label: 'Rush', icon: '💨', key: '1', cooldown: 6, onDown: () => abilityRush(player) });
  input.registerAction({ id: 'barrage', label: 'Barrage', icon: '🌀', key: '2', cooldown: 10, onDown: () => abilityBarrage(player) });
  input.registerAction({ id: 'slam', label: 'Slam', icon: '🌋', key: '3', cooldown: 14, onDown: () => abilitySlam(player) });
  input.registerAction({ id: 'blast', label: 'Void', icon: '🟣', key: '4', cooldown: 20, onDown: () => abilityBlast(player) });
  input.registerAction({ id: 'dash', label: 'Dash', icon: '⚡', key: 'q', cooldown: 2.4, onDown: () => abilityDash(player) });
  input.registerAction({ id: 'block', label: 'Block', icon: '🛡️', key: 'f', onDown: () => startBlock(player), onUp: () => stopBlock(player) });
  input.registerAction({ id: 'ult', label: 'Awaken', icon: '☄️', key: 'g', onDown: () => awaken(player) });
  // desktop hotbar display
  if (!input.isTouch) {
    ui.hotbarSlot('1', '💨', 'Rush', 'rush');
    ui.hotbarSlot('2', '🌀', 'Barrage', 'barrage');
    ui.hotbarSlot('3', '🌋', 'Slam', 'slam');
    ui.hotbarSlot('4', '🟣', 'Void', 'blast');
    ui.hotbarSlot('Q', '⚡', 'Dash', 'dash');
    ui.hotbarSlot('F', '🛡️', 'Block', 'block');
    ui.hotbarSlot('G', '☄️', 'Awaken', 'ult');
  }

  app.onChatSend((text) => chatter.onPlayerMessage(text));
  app.onRespawnRequest(() => { if (player.alive) { player.hp = 0; kill(player, player); player.kos--; player.deaths--; refreshBoard(); } });

  // spawn greetings
  setTimeout(() => {
    const greeters = fighters.filter((f) => f.chat).slice(0, 3);
    greeters.forEach((f, i) => chatter.botSay(f.chat, 'spawn', {}, 0.8, i * 1.6 + 0.5));
  }, 1200);

  // ================= bot combat AI =================
  function botThink(f, dt) {
    const ai = f.ai;
    if (!f.alive) return;
    if (f.stunT > 0) { f.bot.stop(); return; }
    // pick target
    ai.retargetT -= dt;
    if (!ai.target || !ai.target.alive || ai.retargetT <= 0) {
      ai.retargetT = 2.5 + Math.random() * 2.5;
      let best = null, bestD = Infinity;
      for (const t of fighters) {
        if (t === f || !t.alive) continue;
        let d = distXZ(f.ctrl.pos, t.ctrl.pos);
        if (t === f.lastHitBy) d *= 0.55;       // revenge bias
        if (t.isPlayer) d *= 0.8;               // slight player bias
        if (d < bestD) { bestD = d; best = t; }
      }
      ai.target = best;
    }
    const tgt = ai.target;
    if (!tgt) { f.bot.stop(); return; }
    const d = distXZ(f.ctrl.pos, tgt.ctrl.pos);

    // retreat when low & not aggressive
    if (f.hp < 22 && ai.aggression < 0.7 && ai.retreatT <= 0 && Math.random() < 0.01) ai.retreatT = 2;
    if (ai.retreatT > 0) {
      ai.retreatT -= dt;
      const away = new THREE.Vector3(f.ctrl.pos.x * 2 - tgt.ctrl.pos.x, 0, f.ctrl.pos.z * 2 - tgt.ctrl.pos.z);
      f.bot.seek(away, { strafe: 0.4 });
      return;
    }

    ai.thinkT -= dt;
    if (d > 5.5) {
      f.bot.seek(tgt.ctrl.pos, { strafe: d < 16 ? 0.45 : 0.1 });
      if (ai.thinkT <= 0) {
        ai.thinkT = ai.reaction + Math.random() * 0.5;
        if (d > 7 && d < 22 && Math.random() < 0.35 * ai.aggression) abilityRush(f);
        else if (d > 14 && d < 38 && Math.random() < 0.3) { f.bot.faceToward(tgt.ctrl.pos); abilityBlast(f); }
        else if (d < 20 && Math.random() < 0.2) abilityDash(f);
      }
    } else {
      // melee range
      f.bot.faceToward(tgt.ctrl.pos);
      if (d > 3.4) f.bot.seek(tgt.ctrl.pos, { strafe: 0.35 });
      else f.bot.stop();
      if (ai.thinkT <= 0) {
        ai.thinkT = ai.reaction * (0.6 + Math.random() * 0.8);
        const roll = Math.random();
        if (f.ult >= 100 && Math.random() < 0.6) awaken(f);
        else if (roll < 0.12 && f.cds.slam <= 0) abilitySlam(f);
        else if (roll < 0.2 && f.cds.barrage <= 0) abilityBarrage(f);
        else if (roll < 0.3 && !f.blocking && tgt.barrageT > 0) { startBlock(f); setTimeout(() => stopBlock(f), 900 + Math.random() * 600); }
        else doM1(f);
      }
    }
  }

  // ================= main loop =================
  const moveTmp = new THREE.Vector3();
  app.onUpdate((dt) => {
    chatter.update(dt);

    // ---- player control ----
    if (player.alive && !ui.menuOpen) {
      app.moveWorld(moveTmp);
      const stunned = player.stunT > 0;
      const spd = (player.awakenT > 0 ? 21 : 16) * (player.blocking ? 0.4 : 1);
      player.ctrl.speed = spd;
      player.ctrl.moveDir.copy(stunned ? moveTmp.set(0, 0, 0) : moveTmp);
      if (!stunned && input.jumpHeld) player.ctrl.wantJump = true;
      // face movement dir (or camera when attacking)
      if (moveTmp.lengthSq() > 0.01 && !stunned) {
        player.yaw = Math.atan2(moveTmp.x, moveTmp.z);
      }
      if ((input.mouseDown && !input.isTouch) || player.barrageT > 0) {
        player.yaw = app.camYaw + Math.PI;
      }
      let dy = player.yaw - player.char.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      player.char.group.rotation.y += dy * Math.min(1, dt * 12);
    } else {
      player.ctrl.moveDir.set(0, 0, 0);
    }

    // ---- per-fighter update ----
    for (const f of fighters) {
      for (const k in f.cds) if (f.cds[k] > 0) f.cds[k] -= dt;
      if (f.m1Cool > 0) f.m1Cool -= dt;
      if (f.iframeT > 0) f.iframeT -= dt;
      if (f.stunT > 0) f.stunT -= dt;
      if (f.comboIdleT > 0) { f.comboIdleT -= dt; if (f.comboIdleT <= 0) f.comboStep = 0; }
      if (f.awakenT > 0) {
        f.awakenT -= dt;
        f.aura -= dt;
        if (f.aura <= 0) {
          f.aura = 0.22;
          app.burst(new THREE.Vector3(f.ctrl.pos.x, f.ctrl.pos.y + 0.6, f.ctrl.pos.z),
            { color: '#b06df5', count: 5, speed: 7, size: 0.3, life: 0.5, gravity: -18, spread: 0.8 });
        }
        if (f.awakenT <= 0 && f.isPlayer) { ui.tint('#7b3fd4', 0); updatePills(); }
      }
      // barrage ticks
      if (f.barrageT > 0) {
        f.barrageT -= dt;
        f._barrageTick = (f._barrageTick || 0) - dt;
        if (f._barrageTick <= 0) {
          f._barrageTick = 0.16;
          sfx.play('punch', { volume: 0.35 });
          for (const t of enemiesInArc(f, 5.6)) dealDamage(f, t, 3.2, { knock: 3 });
        }
      }
      // slam landing
      if (f._slamPending != null) {
        f._slamPending -= dt;
        if (f._slamPending <= 0 && f.ctrl.grounded) { slamImpact(f); f._slamPending = null; }
        else if (f._slamPending < -2) f._slamPending = null;
      }
      // respawn
      if (!f.alive) {
        f.respawnT -= dt;
        if (f.isPlayer) ui.respawnScreen(true, `Respawning in ${Math.max(0, f.respawnT).toFixed(1)}...`);
        if (f.respawnT <= 0) respawn(f);
        continue;
      }
      // AI
      if (f.bot) {
        botThink(f, dt);
        if (f.blocking) f.ctrl.speed = 6;
        else f.ctrl.speed = f.awakenT > 0 ? 21 : 16;
      }
      f.ctrl.update(dt, world);
      // hard arena clamp (belt & braces on top of the walls)
      f.ctrl.pos.x = Math.max(-HB + 1, Math.min(HB - 1, f.ctrl.pos.x));
      f.ctrl.pos.z = Math.max(-HB + 1, Math.min(HB - 1, f.ctrl.pos.z));
      if (f.ctrl.fellOff) {
        f.hp = 0;
        if (f.lastHitBy && f.lastHitBy !== f) kill(f.lastHitBy, f);
        else { f.alive = false; f.deaths++; f.char.breakApart(scene, 0); sfx.play('oof'); f.respawnT = 3; refreshBoard(); if (f.isPlayer) ui.respawnScreen(true, 'Respawning in 3...'); }
        continue;
      }
      // sync visuals
      if (f.bot) f.bot.syncVisual(dt);
      else {
        f.char.group.position.copy(f.ctrl.pos);
        const hSpeed = Math.hypot(f.ctrl.vel.x, f.ctrl.vel.z);
        f.char.update(dt, { speed: hSpeed, grounded: f.ctrl.grounded, velY: f.ctrl.vel.y });
      }
    }

    // ---- projectiles ----
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.y += dt * 6;
      let boom = p.life <= 0;
      // wall hit
      if (!boom && world.raycast(p.mesh.position, new THREE.Vector3(0, -1, 0), 1.4)) { /* near ground ok */ }
      if (!boom) {
        for (const col of world.colliders) {
          if (col.solid && col.box.containsPoint(p.mesh.position)) { boom = true; break; }
        }
      }
      if (!boom) {
        for (const t of fighters) {
          if (t === p.owner || !t.alive) continue;
          if (p.mesh.position.distanceTo(chestPos(t)) < 3) { boom = true; break; }
        }
      }
      if (boom) { explodeBlast(p); projectiles.splice(i, 1); }
    }

    ui.updatePrompts(dt, camera, player.ctrl.pos, input.keys);
  });

  app.start();
}

// distance from point P to segment AB (XZ plane)
function distToSegXZ(p, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const apx = p.x - a.x, apz = p.z - a.z;
  const len2 = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / len2));
  const dx = apx - abx * t, dz = apz - abz * t;
  return Math.hypot(dx, dz);
}
