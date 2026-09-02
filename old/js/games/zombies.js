// ============================================================
// ZOMBIE BLOCKS: LAST STAND — wave survival (Bloxverse original)
// Night square, endless waves, wall-buy weapons, points economy,
// 3 AI squadmates who fight for real and panic in chat.
// ============================================================
import * as THREE from 'three';
import { GameApp } from '../engine/core.js';
import { R15Character } from '../engine/character.js';
import { CharController, distXZ } from '../engine/physics.js';
import { pickBots, BotBase, ChatterManager } from '../engine/bots.js';
import { WEAPONS, buildGunMesh, hitscan, spreadDir, spawnMuzzleFlash, GunState } from '../engine/guns.js';
import { sfx } from '../engine/sfx.js';
import { addBlux } from '../site/common.js';
import { createGameNet } from '../engine/netplay.js';
import * as W from '../engine/world.js';

const ZTYPES = {
  walker: { hp: 60, speed: 7.5, dmg: 12, pts: 60, skin: '#7fae62', shirt: '#4a5a43', scale: 1 },
  runner: { hp: 45, speed: 14, dmg: 9, pts: 70, skin: '#93b45e', shirt: '#6e3f3f', scale: 0.95 },
  brute: { hp: 340, speed: 5.2, dmg: 24, pts: 250, skin: '#5f7f4a', shirt: '#33402e', scale: 1.4 },
};

export default async function launch({ root, user, game }) {
  const app = new GameApp({
    root, title: game.name, gameId: 'zombies',
    skyTop: '#0a0f24', skyBottom: '#252d49',
    fog: { color: '#161c30', near: 40, far: 190 },
    hemiSky: 0x33406b, hemiGround: 0x1a2030, hemiIntensity: 0.75,
    ambient: 0.16, sunIntensity: 0.35,
    shadowArea: 110, camDist: 9,
  });
  const { scene, world, input, ui, camera } = app;
  app.setCameraMode('shooter');
  app.camTargetY = 4.6;
  app.sun.color.set(0x9db4ff); // moonlight

  // multiplayer state (wired up in the MULTIPLAYER section below)
  let net = null;
  let zseq = 1, lastHostWave = 0;
  const proxies = new Map();       // zombie id -> rendered proxy (non-host)
  const remoteHumans = [];         // wrappers for host zombie-targeting

  // ================= MAP: Blockton Square at night =================
  W.ground(scene, world, 260, W.asphaltTexture(22));
  W.part(scene, world, { x: 0, y: 0.12, z: 0, w: 70, h: 0.24, d: 70, tex: W.checkerTexture('#5c636e', '#4a515b', 10), castShadow: false, collide: false });
  // fountain centerpiece
  W.part(scene, world, { x: 0, y: 1, z: 0, w: 12, h: 2, d: 12, color: '#565e69' });
  W.part(scene, world, { x: 0, y: 3.4, z: 0, w: 2, h: 3, d: 2, color: '#565e69' });
  // perimeter shops with 4 gate gaps (N/S/E/W)
  const shopTex = (c) => new THREE.MeshLambertMaterial({ map: W.windowsTexture(c, 0.12) });
  const shops = [
    [-55, -70, 50, 20, 22, '#5d5348'], [55, -70, 50, 20, 22, '#4a4a55'],
    [-55, 70, 50, 20, 22, '#554a4a'], [55, 70, 50, 20, 22, '#48554e'],
    [-70, -35, 20, 40, 26, '#50485d'], [-70, 35, 20, 40, 26, '#5d5348'],
    [70, -35, 20, 40, 26, '#48505d'], [70, 35, 20, 40, 26, '#555555'],
  ];
  for (const [x, z, w, d, h, c] of shops) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shopTex(c));
    m.position.set(x, h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    world.addCollider(m);
  }
  // boarded planks on shopfronts (decor)
  const plankMat = new THREE.MeshLambertMaterial({ map: W.plankTexture('#6a4c2d', 2) });
  [[-55, -59.6], [55, -59.6], [-55, 59.6], [55, 59.6]].forEach(([x, z]) => {
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 0.4), plankMat);
      p.position.set(x + (i - 1) * 3, 4 + i * 2.2, z);
      p.rotation.z = (Math.random() - 0.5) * 0.4;
      scene.add(p);
    }
  });
  // cover crates + barricades
  const crateTex = W.plankTexture('#7a5533', 2);
  [[-25, -25], [25, 25], [-25, 25], [25, -25], [0, -40], [0, 40], [-42, 0], [42, 0]].forEach(([x, z]) => {
    W.part(scene, world, { x, y: 2.5, z, w: 5, h: 5, d: 5, tex: crateTex });
  });
  // flickering lamps
  const lamps = [[-30, -30], [30, 30], [-30, 30], [30, -30]].map(([x, z]) => W.lampPost(scene, world, x, z, true));
  app.onUpdate((dt, t) => {
    lamps.forEach((l, i) => {
      if (!l.light) return;
      const flick = Math.sin(t * 17 + i * 9) > -0.85 ? 1 : 0.15;
      l.light.intensity = 26 * flick * (0.8 + Math.sin(t * 3 + i) * 0.2);
    });
  });
  // gates (zombie spawn points) with warning glow
  const GATES = [new THREE.Vector3(0, 0.5, -95), new THREE.Vector3(0, 0.5, 95), new THREE.Vector3(-95, 0.5, 0), new THREE.Vector3(95, 0.5, 0)];
  GATES.forEach((g) => {
    const glow = new THREE.Mesh(new THREE.BoxGeometry(16, 0.3, 16), W.mat('#37452e', { emissive: '#4a7a34', emissiveIntensity: 0.5 }));
    glow.position.set(g.x, 0.15, g.z);
    scene.add(glow);
  });
  // outer walls (overlapping corners — no escape gaps)
  const HB = 118;
  [[0, -HB, HB * 2 + 16, 3], [0, HB, HB * 2 + 16, 3], [-HB, 0, 3, HB * 2 + 16], [HB, 0, 3, HB * 2 + 16]].forEach(([x, z, w, d]) =>
    W.part(scene, world, { x, y: 10, z, w, h: 20, d, color: '#2d323c' }));

  // ================= squad =================
  const chatter = new ChatterManager(ui, user.name);
  chatter.idleSituation = 'idle';
  const humans = [];
  let nextId = 1;

  function equip(h, weaponId) {
    h.gun = h.guns[weaponId] || (h.guns[weaponId] = new GunState(weaponId));
    h.weaponId = weaponId;
    h.char.holdItem(buildGunMesh(weaponId), WEAPONS[weaponId].pose);
    // barrel along the raised arm: hand -Y becomes world-forward when aiming
    h.char.item.rotation.x = Math.PI / 2;
    h.char.item.position.set(0, -0.6, 0.38);
    // defer: during initial construction `player`/`ammoPill` aren't assigned yet
    if (h.isPlayer) queueMicrotask(() => refreshWeaponUI());
  }

  function makeHuman({ name, avatar, isPlayer, persona }) {
    if (!name && persona) name = persona.name;
    let char, ctrl, bot = null;
    // Wide per-squadmate skill spread: some are dead weight, some carry hard.
    const skill = 0.15 + Math.random() * 0.85;
    if (isPlayer) {
      char = new R15Character({ name, avatar, nameTagColor: '#8fd3ff' });
      ctrl = new CharController({ speed: 18 });
    } else {
      bot = new BotBase(persona, { nameTagColor: '#8fd3ff', ctrl: { speed: 15 + skill * 4 } });
      char = bot.char;
      ctrl = bot.ctrl;
    }
    scene.add(char.group);
    const h = {
      id: nextId++, name, char, ctrl, isPlayer, bot,
      hp: 100, alive: true, downed: false, points: isPlayer ? 500 : 500,
      kills: 0, guns: { pistol: new GunState('pistol') }, gun: null, weaponId: 'pistol',
      hurtT: 0,
      ai: bot ? { target: null, retargetT: 0, fireT: 0, skill, boughtAR: false } : null,
    };
    if (bot) h.chat = chatter.register(name, bot.brain, char);
    equip(h, 'pistol');
    const a = humans.length * (Math.PI / 2) + Math.PI / 4;
    ctrl.teleport(Math.cos(a) * 14, 0.5, Math.sin(a) * 14);
    humans.push(h);
    return h;
  }

  const player = makeHuman({ name: user.name, avatar: user.avatar, isPlayer: true });
  pickBots(3).forEach((p) => makeHuman({ persona: p, isPlayer: false }));
  chatter.playerChar = player.char;

  const camProxy = { position: new THREE.Vector3() };
  app.followTarget = camProxy;

  // ================= zombies =================
  const zombies = [];
  function spawnZombie(typeId) {
    const T = ZTYPES[typeId];
    const char = new R15Character({
      name: 'zombie', nameTag: false,
      avatar: { skin: T.skin, shirt: T.shirt, pants: '#3d3d33', face: 'zombie', hat: 'none' },
    });
    char.holdPose = 'zombie';
    char.group.scale.setScalar(T.scale);
    scene.add(char.group);
    const gate = GATES[Math.floor(Math.random() * GATES.length)];
    const ctrl = new CharController({ speed: T.speed * speedMult(), halfW: 0.9 * T.scale, height: 5 * T.scale });
    ctrl.teleport(gate.x + (Math.random() - 0.5) * 10, 0.5, gate.z + (Math.random() - 0.5) * 10);
    const z = {
      id: 'z' + nextId++, nid: zseq++, char, ctrl, type: T, typeId,
      hp: T.hp * (1 + wave * 0.06), maxHp: T.hp, alive: true,
      attackT: 0, groanT: Math.random() * 6, target: null, retargetT: 0,
    };
    zombies.push(z);
    return z;
  }
  const speedMult = () => 1 + Math.floor(wave / 5) * 0.12;

  // ================= wave state =================
  let wave = 0, toSpawn = 0, spawnT = 0, betweenT = 4, gameOver = false;

  function startWave() {
    wave++;
    toSpawn = 5 + wave * 3;
    spawnT = 0.5;
    sfx.play('wave');
    ui.announce(`WAVE ${wave}`, `${toSpawn} zombies incoming`, 2.6);
    updatePills();
    // revive downed squad
    humans.forEach((h) => {
      if (h.downed) {
        h.downed = false; h.alive = true; h.hp = 100;
        h.char.respawnVisual();
        h.char.setHealth(100);
        if (h.isPlayer) { ui.respawnScreen(false); ui.setHealth(100, 100); }
      }
    });
    humans.filter((h) => h.chat).forEach((h, i) => chatter.botSay(h.chat, 'wave', { wave }, 0.45, 0.8 + i * 1.2));
  }

  function waveSpawner(dt) {
    if (gameOver) return;
    if (net && !net.isHost) return; // the host runs the horde
    if (toSpawn > 0) {
      spawnT -= dt;
      if (spawnT <= 0 && zombies.filter((z) => z.alive).length < 22) {
        spawnT = Math.max(0.35, 1.4 - wave * 0.05);
        toSpawn--;
        const roll = Math.random();
        spawnZombie(roll < 0.12 && wave >= 3 ? 'brute' : roll < 0.4 && wave >= 2 ? 'runner' : 'walker');
        updatePills();
      }
    } else if (!zombies.some((z) => z.alive)) {
      betweenT -= dt;
      if (betweenT <= 0) {
        betweenT = 5;
        if (wave > 0) {
          humans.forEach((h) => { if (h.alive) addPoints(h, 100); });
          ui.announce('WAVE CLEARED', '+100 points — buy at the walls!', 2.4);
          sfx.play('win');
        }
        startWave();
      }
    }
  }

  // ================= points & buys =================
  function addPoints(h, n) {
    h.points += n;
    if (h.isPlayer) updatePills();
  }
  function updatePills() {
    // non-host: the horde count comes from the host's snapshot
    const left = (net && !net.isHost)
      ? (hostRp()?.extra?.lf ?? proxies.size)
      : zombies.filter((z) => z.alive).length + toSpawn;
    ui.setPills([
      { icon: '💰', value: player.points, label: 'pts' },
      { icon: '🌊', value: `Wave ${Math.max(1, wave)}` },
      { icon: '🧟', value: left, label: 'left' },
    ]);
  }
  ui.setBoard(['Kills']);
  const refreshBoard = () => {
    humans.forEach((h) => { if (!h.benched) ui.board(h.name, [h.kills], { isPlayer: h.isPlayer, color: '#8fd3ff' }); });
    if (net) for (const rp of net.remotes.values()) {
      ui.board(rp.name, [rp.stats.kills || 0], { color: '#7ddf8a' });
    }
  };
  refreshBoard();
  ui.setHealth(100, 100);
  ui.system('Survive the horde! Earn points per hit, spend them at the glowing wall-buys.');

  // wall-buys
  const BUYS = [
    { x: -36, z: -58, item: 'ar', label: 'Assault Rifle', price: 1000 },
    { x: 36, z: 58, item: 'shotgun', label: 'Shotgun', price: 1500 },
    { x: -58, z: 30, item: 'sniper', label: 'Sniper', price: 2500 },
    { x: 58, z: -30, item: 'ammo', label: 'Refill Ammo', price: 500 },
    { x: 0, z: 58, item: 'medkit', label: 'Medkit (full heal)', price: 750 },
  ];
  for (const b of BUYS) {
    const icon = b.item === 'ammo' ? '📦' : b.item === 'medkit' ? '💊' : WEAPONS[b.item].icon;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.5),
      W.mat('#20262e', { emissive: '#3fc679', emissiveIntensity: 0.35 }));
    sign.position.set(b.x, 6, b.z);
    scene.add(sign);
    if (b.item !== 'ammo' && b.item !== 'medkit') {
      const gun = buildGunMesh(b.item);
      gun.scale.setScalar(1.6);
      gun.position.set(b.x, 6, b.z + (b.z > 0 ? -1 : 1));
      gun.rotation.y = Math.PI / 2;
      scene.add(gun);
      app.addEffect((dt) => { gun.rotation.y += dt; return true; });
    }
    ui.addPrompt({
      getPos: () => new THREE.Vector3(b.x, 5, b.z),
      text: `${icon} ${b.label} — ${b.price} pts`, key: 'E', radius: 9, hold: 0.5,
      onTrigger: () => {
        if (player.points < b.price) { ui.system('Not enough points!'); sfx.play('error'); return; }
        player.points -= b.price;
        sfx.play('buy');
        if (b.item === 'ammo') {
          for (const id in player.guns) { player.guns[id].ammo = player.guns[id].weapon.mag; player.guns[id].reloading = 0; }
          ui.system('Ammo refilled!');
        } else if (b.item === 'medkit') {
          player.hp = 100; player.char.setHealth(100); ui.setHealth(100, 100);
          sfx.play('medkit');
          ui.system('Patched up!');
        } else {
          equip(player, b.item);
          ui.system(`Bought ${b.label}!`);
        }
        updatePills();
        refreshWeaponUI();
      },
    });
  }

  // ammo readout
  const ammoPill = document.createElement('div');
  ammoPill.className = 'pill';
  ammoPill.style.cssText = 'position:absolute;right:12px;bottom:calc(14px + env(safe-area-inset-bottom, 0px));font-size:16px;font-weight:800;pointer-events:none';
  ui.hud.appendChild(ammoPill);
  function refreshWeaponUI() {
    const g = player.gun;
    ammoPill.textContent = `${g.weapon.icon} ${g.reloading > 0 ? 'RELOADING' : `${g.ammo} / ${g.weapon.mag}`}`;
    Object.keys(player.guns).forEach((id) => ui.hotbarActive(id, id === player.weaponId));
  }

  // ================= combat =================
  function chestPos(o) { return new THREE.Vector3(o.ctrl.pos.x, o.ctrl.pos.y + 3.6 * (o.type?.scale || 1), o.ctrl.pos.z); }
  const zTargets = () => {
    if (net && !net.isHost) {
      // non-host: shoot the host's rendered horde
      return [...proxies.values()].map((p) => ({ id: 'zp' + p.id, ctrl: p.ctrl, alive: true, ref: p }));
    }
    return zombies.filter((z) => z.alive).map((z) => ({ id: z.id, ctrl: z.ctrl, alive: z.alive, ref: z }));
  };

  function fireWeapon(h, origin, dir) {
    const g = h.gun;
    if (!g.canFire() || !h.alive || gameOver) return;
    g.fire();
    h.char.playAction('recoil', 0.14);
    if (h.char.item) spawnMuzzleFlash(h.char.item);
    const pellets = g.weapon.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const d = spreadDir(dir, g.weapon.spread);
      const hit = hitscan({ world, scene, origin: origin.clone(), dir: d, weapon: g.weapon, targets: zTargets(), shooterId: h.id });
      if (hit && hit.target) hurtZombie(h, hit.target.ref, g.weapon.damage * (hit.headshot ? g.weapon.headMult : 1), hit.headshot, hit.point);
    }
    if (h.isPlayer) { refreshWeaponUI(); app.screenShake(g.weapon.id === 'sniper' ? 0.35 : 0.1); }
  }

  function hurtZombie(h, z, dmg, headshot, point) {
    // proxy zombie (we're not the host): take hit points locally, tell host
    if (z.proxy) {
      addPoints(h, 10);
      sfx.play('zombiehit', { volume: 0.35 });
      if (h.isPlayer) {
        ui.hitmarker(headshot);
        ui.popup(camera, point || chestPos(z), `-${Math.round(dmg)}`, headshot ? '#ff5b5b' : '#b8e994', headshot ? 16 : 13);
      }
      net?.sendTopic('zhit', { id: z.id, dmg: Math.round(dmg * 10) / 10, head: !!headshot });
      return;
    }
    if (!z.alive) return;
    z.hp -= dmg;
    addPoints(h, 10);
    sfx.play('zombiehit', { volume: 0.35 });
    if (h.isPlayer) {
      ui.hitmarker(headshot);
      ui.popup(camera, point || chestPos(z), `-${Math.round(dmg)}`, headshot ? '#ff5b5b' : '#b8e994', headshot ? 16 : 13);
    }
    if (z.hp <= 0) {
      z.alive = false;
      h.kills++;
      addPoints(h, z.type.pts + (headshot ? 30 : 0));
      z.char.breakApart(scene, 0);
      sfx.play('oof', { volume: 0.5 });
      // let everyone else play the death (no bounty for us in the payload)
      net?.sendTopic('zdeath', { id: z.nid, by: null, pts: 0 });
      refreshBoard();
      updatePills();
      if (h.chat && Math.random() < 0.06) chatter.botSay(h.chat, 'kill', { victim: 'that zombie' }, 0.8, 0.3);
    }
  }

  function hurtHuman(z, h, dmg) {
    if (!h.alive || gameOver) return;
    h.hp -= dmg;
    h.char.setHealth(h.hp);
    sfx.play('hit', { volume: 0.5 });
    if (h.isPlayer) { ui.damageFlash(); ui.setHealth(h.hp, 100); }
    if (h.chat && h.hp < 30 && Math.random() < 0.25) chatter.botSay(h.chat, 'lowhp', {}, 0.7, 0.2);
    if (h.hp <= 0) downHuman(h);
  }

  function downHuman(h) {
    h.alive = false;
    h.downed = true;
    h.char.setRagdoll(true);
    sfx.play('oof');
    ui.killfeed('The horde', h.name, '🧟', '#7fae62', '#8fd3ff');
    if (h.isPlayer) ui.respawnScreen(true, 'Downed! You’ll be back next wave — if your squad survives...');
    if (h.chat) chatter.botSay(h.chat, 'downed', {}, 0.85, 0.6);
    humans.filter((o) => o.chat && o !== h && o.alive).slice(0, 1).forEach((o) =>
      chatter.botSay(o.chat, 'teammateDown', { name: h.name }, 0.5, 1.5));
    const localAlive = humans.some((x) => !x.benched && x.alive);
    const remotesAlive = net ? remoteHumans.some((r) => r.alive) : false;
    if (!localAlive && !remotesAlive) {
      if (!net || net.isHost || net.humanCount === 0) {
        net?.sendTopic('zwipe', { wave });
        endGame();
      }
    }
  }

  function endGame(waveReached) {
    if (gameOver) return;
    gameOver = true;
    const w = waveReached || wave;
    const reward = w * 10;
    addBlux(reward);
    ui.announce('SQUAD WIPED', `You survived ${w} waves! +${reward} Blux — restarting...`, 6);
    sfx.play('lose');
    setTimeout(() => location.reload(), 6500);
  }

  // ================= zombie AI =================
  function zombieThink(z, dt) {
    if (!z.alive) return;
    z.groanT -= dt;
    if (z.groanT <= 0) {
      z.groanT = 4 + Math.random() * 8;
      if (z.ctrl.pos.distanceTo(player.ctrl.pos) < 45) sfx.play('growl', { volume: 0.25 });
    }
    z.retargetT -= dt;
    if (!z.target || !z.target.alive || z.retargetT <= 0) {
      z.retargetT = 1.5 + Math.random();
      let best = null, bd = Infinity;
      for (const h of humans) {
        if (h.benched || !h.alive) continue;
        const d = distXZ(z.ctrl.pos, h.ctrl.pos);
        if (d < bd) { bd = d; best = h; }
      }
      // the host's zombies also hunt remote survivors
      for (const r of remoteHumans) {
        if (!r.alive) continue;
        const d = distXZ(z.ctrl.pos, r.ctrl.pos);
        if (d < bd) { bd = d; best = r; }
      }
      z.target = best;
    }
    const tgt = z.target;
    if (!tgt) { z.ctrl.moveDir.set(0, 0, 0); return; }
    const d = distXZ(z.ctrl.pos, tgt.ctrl.pos);
    if (d > 3.4) {
      const dx = (tgt.ctrl.pos.x - z.ctrl.pos.x) / d, dz = (tgt.ctrl.pos.z - z.ctrl.pos.z) / d;
      z.ctrl.moveDir.set(dx, 0, dz);
      z.char.group.rotation.y = Math.atan2(dx, dz);
      if (z.ctrl.grounded && Math.hypot(z.ctrl.vel.x, z.ctrl.vel.z) < z.ctrl.speed * 0.3) z.ctrl.wantJump = true;
      // proximity warning to player
      if (tgt.isPlayer && d < 8 && Math.random() < dt * 0.06) {
        const buddy = humans.find((h) => h.chat && h.alive);
        if (buddy) chatter.botSay(buddy.chat, 'zombieNear', {}, 0.3);
      }
    } else {
      z.ctrl.moveDir.set(0, 0, 0);
      z.char.group.rotation.y = Math.atan2(tgt.ctrl.pos.x - z.ctrl.pos.x, tgt.ctrl.pos.z - z.ctrl.pos.z);
      z.attackT -= dt;
      if (z.attackT <= 0) {
        z.attackT = 1.15;
        z.char.playAction(Math.random() < 0.5 ? 'punchR' : 'punchL', 0.35);
        setTimeout(() => {
          if (!z.alive || !tgt.alive || distXZ(z.ctrl.pos, tgt.ctrl.pos) >= 4.4) return;
          if (tgt.remote) net?.sendTopic('zatk', { to: tgt.peerId, dmg: z.type.dmg });
          else hurtHuman(z, tgt, z.type.dmg);
        }, 180);
      }
    }
  }

  // ================= squad bot AI =================
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
  function botThink(h, dt) {
    const ai = h.ai;
    if (!h.alive) return;
    const g = h.gun;
    g.update(dt);
    if (g.ammo === 0 && g.reloading <= 0) g.startReload();
    // buy AR once rich enough (they hustle to the wall)
    if (!ai.boughtAR && h.points >= 1200) {
      const buy = BUYS[0];
      if (h.bot.distTo(new THREE.Vector3(buy.x, 0, buy.z)) > 7) { h.bot.seek(new THREE.Vector3(buy.x, 0.5, buy.z), { strafe: 0.2 }); return; }
      ai.boughtAR = true;
      h.points -= 1000;
      equip(h, 'ar');
      sfx.play('buy', { volume: 0.4 });
      if (h.chat) chatter.botSay(h.chat, 'paid', { money: 1000 }, 0.5, 0.5);
    }
    ai.retargetT -= dt;
    if (!ai.target || !ai.target.alive || ai.retargetT <= 0) {
      ai.retargetT = 1 + Math.random();
      let best = null, bd = Infinity;
      for (const z of zombies) {
        if (!z.alive) continue;
        const d = distXZ(h.ctrl.pos, z.ctrl.pos);
        if (d < bd) { bd = d; best = z; }
      }
      ai.target = best;
    }
    const tgt = ai.target;
    if (!tgt) {
      // regroup near the player
      if (h.bot.distTo(player.ctrl.pos) > 12) h.bot.seek(player.ctrl.pos, { strafe: 0.3 });
      else h.bot.stop();
      return;
    }
    const d = distXZ(h.ctrl.pos, tgt.ctrl.pos);
    // kite: back away if close, else hold
    if (d < 10) {
      _v1.set(h.ctrl.pos.x * 2 - tgt.ctrl.pos.x, 0, h.ctrl.pos.z * 2 - tgt.ctrl.pos.z);
      h.bot.seek(_v1, { strafe: 0.4 });
      h.bot.faceToward(tgt.ctrl.pos);
    } else if (d > 30) {
      h.bot.seek(tgt.ctrl.pos, { strafe: 0.3 });
    } else {
      h.bot.stop();
      h.bot.faceToward(tgt.ctrl.pos);
    }
    // shoot on LOS
    ai.fireT -= dt;
    if (ai.fireT <= 0 && g.canFire()) {
      ai.fireT = (g.weapon.auto ? 0.12 : 60 / g.weapon.rpm) + (1 - ai.skill) * 0.2;
      const origin = chestPos(h);
      const aim = chestPos(tgt);
      aim.x += (Math.random() - 0.5) * (1 - ai.skill) * 4;
      aim.z += (Math.random() - 0.5) * (1 - ai.skill) * 4;
      _v2.copy(aim).sub(origin);
      const dist3 = _v2.length();
      _v2.normalize();
      if (!world.raycast(origin, _v2, dist3 - 1)) {
        h.char.aimPitch = Math.asin(Math.max(-1, Math.min(1, _v2.y)));
        fireWeapon(h, origin, _v2);
      }
    }
  }

  // ================= MULTIPLAYER (co-op horde) =================
  // The longest-connected player is HOST: they simulate the horde and
  // publish a compact snapshot in their presence. Everyone else renders
  // interpolated zombie proxies and sends hit events; the host applies
  // damage and announces kills. If the host leaves, the next player
  // adopts the horde from the last snapshot. Squad bots bench while
  // friends are here.
  const ZTYPE_IDS = ['walker', 'runner', 'brute'];

  function hostRp() {
    if (!net || net.isHost) return null;
    let best = null;
    for (const rp of net.remotes.values()) {
      if (!best || rp.peerId < best.peerId) best = rp;
    }
    return best;
  }
  function setBotsBenched(on) {
    for (const h of humans) {
      if (!h.bot || !!h.benched === on) continue;
      h.benched = on;
      h.char.group.visible = !on;
      if (on) { h.alive = false; ui.removeBoardRow(h.name); }
      else { h.alive = true; h.downed = false; h.hp = 100; h.char.respawnVisual(); }
    }
    ui.system(on ? 'Real survivors are here — the bot squad stepped aside!' : 'All alone again... the bot squad is back.');
    refreshBoard();
  }
  function hordeSnapshot() {
    const zs = [];
    for (const z of zombies) {
      if (!z.alive) continue;
      zs.push([z.nid, ZTYPE_IDS.indexOf(z.typeId), Math.round(z.ctrl.pos.x * 10) / 10,
        Math.round(z.ctrl.pos.z * 10) / 10, Math.round(z.char.group.rotation.y * 100) / 100,
        Math.round((z.hp / (z.type.hp * (1 + wave * 0.06))) * 100)]);
    }
    return { zs, wv: wave, lf: zombies.filter((x) => x.alive).length + toSpawn };
  }
  function syncProxies(ex) {
    if (!ex || !ex.zs) return;
    const seen = new Set();
    for (const [id, ti, x, z, ry] of ex.zs) {
      seen.add(id);
      let p = proxies.get(id);
      if (!p) {
        const T = ZTYPES[ZTYPE_IDS[ti]] || ZTYPES.walker;
        const char = new R15Character({
          name: 'zombie', nameTag: false,
          avatar: { skin: T.skin, shirt: T.shirt, pants: '#3d3d33', face: 'zombie', hat: 'none' },
        });
        char.holdPose = 'zombie';
        char.group.scale.setScalar(T.scale);
        char.group.position.set(x, 0.5, z);
        scene.add(char.group);
        p = { proxy: true, id, char, type: T, ctrl: { pos: new THREE.Vector3(x, 0.5, z) }, tx: x, tz: z, ry, alive: true };
        proxies.set(id, p);
      }
      p.tx = x; p.tz = z; p.ry = ry;
    }
    // remove proxies the host no longer reports (death visuals come via zdeath)
    for (const [id, p] of proxies) {
      if (!seen.has(id)) { p.char.dispose(); proxies.delete(id); }
    }
    // wave changes announced by host state
    if (ex.wv && ex.wv !== lastHostWave) {
      lastHostWave = ex.wv;
      wave = ex.wv;
      sfx.play('wave');
      ui.announce(`WAVE ${ex.wv}`, 'Hold the line together!', 2.4);
      if (player.downed) { // revived at wave start, same as solo
        player.downed = false; player.alive = true; player.hp = 100;
        player.char.respawnVisual(); player.char.setHealth(100);
        ui.respawnScreen(false); ui.setHealth(100, 100);
      }
    }
    updatePills();
  }
  function adoptHorde() {
    // previous host left — resurrect the horde from the last proxy snapshot
    for (const [, p] of proxies) {
      const typeId = ZTYPE_IDS[Math.max(0, ZTYPE_IDS.findIndex((t) => ZTYPES[t] === p.type))] || 'walker';
      const z = spawnZombie(typeId);
      z.ctrl.teleport(p.ctrl.pos.x, 0.5, p.ctrl.pos.z);
      p.char.dispose();
    }
    proxies.clear();
    if (lastHostWave > wave) wave = lastHostWave;
    ui.system('You are now hosting the horde!');
  }
  createGameNet({
    scene, ui, gameId: 'zombies', user,
    localState: () => ({
      x: player.ctrl.pos.x, y: player.ctrl.pos.y, z: player.ctrl.pos.z,
      ry: player.char.group.rotation.y,
      sp: Math.hypot(player.ctrl.vel.x, player.ctrl.vel.z), gr: player.ctrl.grounded, vy: player.ctrl.vel.y,
      hp: Math.max(player.downed ? 0 : 1, Math.round(player.hp)), mhp: 100,
      stats: { kills: player.kills, down: player.downed },
      pose: player.char.holdPose,
    }),
    onHit: () => { },
    onPeersChanged: (count, isHost) => {
      remoteHumans.length = 0;
      for (const [pid, rp] of net.remotes) {
        remoteHumans.push({ remote: true, peerId: pid, name: rp.name, rp, ctrl: rp.ctrl, get alive() { return rp.alive && !rp.stats.down; } });
      }
      setBotsBenched(count > 0);
      if (isHost && proxies.size) adoptHorde();
    },
    topics: {
      zhit: (d) => { // host applies remote players' hits to the real horde
        if (!net?.isHost || !d) return;
        const z = zombies.find((x) => x.nid === d.id && x.alive);
        if (!z) return;
        z.hp -= d.dmg || 0;
        z.lastHitBy = d._from;
        if (z.hp <= 0) killZombieAuthoritative(z, d._from);
      },
      zdeath: (d) => { // everyone plays the death; the killer takes the bounty
        if (!d) return;
        const p = proxies.get(d.id);
        if (p) { p.char.breakApart(scene, 0); proxies.delete(p.id); sfx.play('oof', { volume: 0.5 }); }
        if (d.by === net?.room?.peerId) {
          player.kills++;
          addPoints(player, d.pts || 60);
          refreshBoard();
        }
      },
      zatk: (d) => { // a host zombie bit ME
        if (!d || d.to !== net?.room?.peerId || !player.alive) return;
        hurtHuman(null, player, d.dmg || 12);
      },
      zwipe: (d) => { if (!gameOver) endGame(d?.wave); },
    },
  }).then((gn) => {
    net = gn;
    if (net.online) ui.system('🌐 Online — survive the horde together!');
    const origPlay = player.char.playAction.bind(player.char);
    player.char.playAction = (name, dur) => { net.action(name, dur); origPlay(name, dur); };
  });
  // host-side: a zombie died (by anyone) — announce with kill credit
  function killZombieAuthoritative(z, byPeer) {
    z.alive = false;
    z.char.breakApart(scene, 0);
    sfx.play('oof', { volume: 0.5 });
    net?.sendTopic('zdeath', { id: z.nid, by: byPeer, pts: z.type.pts });
    updatePills();
  }

  // ================= player bindings =================
  function playerFire() {
    if (ui.menuOpen || !player.alive || gameOver) return;
    const { origin, dir } = app.aimRay();
    origin.addScaledVector(dir, app.camDist * 0.4);
    fireWeapon(player, origin, dir);
  }
  input.onMouseDown(() => playerFire());
  let fireHeld = false;
  if (input.isTouch) {
    input.setFireButton(() => { fireHeld = true; playerFire(); }, () => { fireHeld = false; });
    input.registerAction({ id: 'swap', label: 'Weapon', icon: '🔁', onDown: () => {
      const ids = Object.keys(player.guns);
      equip(player, ids[(ids.indexOf(player.weaponId) + 1) % ids.length]);
    } });
    input.registerAction({ id: 'reload', label: 'Reload', icon: '🔄', onDown: () => { player.gun.startReload(); refreshWeaponUI(); } });
  } else {
    input.bindKey('r', () => { player.gun.startReload(); refreshWeaponUI(); });
    ['1', '2', '3'].forEach((k, i) => input.bindKey(k, () => {
      const ids = Object.keys(player.guns);
      if (ids[i]) equip(player, ids[i]);
    }));
    ui.hotbarSlot('1', '🔸', 'Pistol', 'pistol');
  }
  refreshWeaponUI();
  updatePills();
  app.onChatSend((t) => { chatter.onPlayerMessage(t); net?.sendChat(t); });
  let boardT = 0;

  setTimeout(() => {
    humans.filter((h) => h.chat).forEach((h, i) => chatter.botSay(h.chat, 'spawn', {}, 0.7, 0.5 + i * 1.4));
  }, 1000);

  // ================= main loop =================
  const moveTmp = new THREE.Vector3();
  let autoFireT = 0;
  app.onUpdate((dt) => {
    chatter.update(dt);
    waveSpawner(dt);

    // player
    player.gun.update(dt);
    if (player.gun.reloading > 0) refreshWeaponUI();
    if (player.alive && !ui.menuOpen) {
      app.moveWorld(moveTmp);
      player.ctrl.moveDir.copy(moveTmp);
      if (input.jumpHeld) player.ctrl.wantJump = true;
      player.char.group.rotation.y = app.camYaw + Math.PI;
      player.char.aimPitch = app.camPitch * 0.85;
      const wantFire = (input.mouseDown && !input.isTouch && input.pointerLocked) || fireHeld;
      if (wantFire && player.gun.weapon.auto) {
        autoFireT -= dt;
        if (autoFireT <= 0) { playerFire(); autoFireT = 0; }
      }
    } else player.ctrl.moveDir.set(0, 0, 0);

    for (const h of humans) {
      if (h.benched) continue;
      if (h.bot && h.alive) botThink(h, dt);
      if (h.bot && h.gun) h.gun.update(dt);
      if (!h.downed) {
        h.ctrl.update(dt, world);
        h.ctrl.pos.x = Math.max(-HB + 2, Math.min(HB - 2, h.ctrl.pos.x));
        h.ctrl.pos.z = Math.max(-HB + 2, Math.min(HB - 2, h.ctrl.pos.z));
        if (h.bot) h.bot.syncVisual(dt);
        else {
          h.char.group.position.copy(h.ctrl.pos);
          h.char.update(dt, { speed: Math.hypot(h.ctrl.vel.x, h.ctrl.vel.z), grounded: h.ctrl.grounded, velY: h.ctrl.vel.y });
        }
      } else {
        h.char.update(dt, {});
      }
    }

    // zombies
    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i];
      if (!z.alive) { z.char.dispose(); zombies.splice(i, 1); continue; }
      zombieThink(z, dt);
      z.ctrl.update(dt, world);
      z.ctrl.pos.x = Math.max(-HB + 2, Math.min(HB - 2, z.ctrl.pos.x));
      z.ctrl.pos.z = Math.max(-HB + 2, Math.min(HB - 2, z.ctrl.pos.z));
      z.char.group.position.copy(z.ctrl.pos);
      z.char.update(dt, { speed: Math.hypot(z.ctrl.vel.x, z.ctrl.vel.z), grounded: z.ctrl.grounded, velY: z.ctrl.vel.y });
    }

    // camera shoulder proxy
    const yaw = app.camYaw;
    camProxy.position.set(
      player.ctrl.pos.x + Math.cos(yaw) * 1.6,
      player.ctrl.pos.y,
      player.ctrl.pos.z - Math.sin(yaw) * 1.6);

    // ---- multiplayer ----
    if (net) {
      if (net.isHost) {
        // publish the authoritative horde snapshot with our presence
        if (net.humanCount) net.setExtra(hordeSnapshot());
      } else {
        // render the host's horde as interpolated proxies
        const host = hostRp();
        if (host) syncProxies(host.extra);
        for (const p of proxies.values()) {
          const px = p.ctrl.pos.x, pz = p.ctrl.pos.z;
          p.ctrl.pos.x += (p.tx - px) * Math.min(1, dt * 8);
          p.ctrl.pos.z += (p.tz - pz) * Math.min(1, dt * 8);
          p.char.group.position.set(p.ctrl.pos.x, 0.5, p.ctrl.pos.z);
          p.char.group.rotation.y = p.ry;
          const sp = Math.hypot(p.ctrl.pos.x - px, p.ctrl.pos.z - pz) / Math.max(dt, 0.001);
          p.char.update(dt, { speed: Math.min(sp, 16), grounded: true, velY: 0 });
        }
      }
      net.tick(dt);
      boardT -= dt;
      if (boardT <= 0 && net.humanCount) {
        boardT = 0.8;
        refreshBoard();
        if (!net.isHost) updatePills();
      }
    }

    ui.updatePrompts(dt, camera, player.ctrl.pos, input.keys);
  });

  app.start();
}
