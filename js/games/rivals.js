// ============================================================
// RIVALS — fast team arena shooter
// Round-based TDM to 20 kills, 4 hitscan weapons w/ reload +
// headshots, pointer-lock aim, mobile FIRE button, combat bots.
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

const TEAM = {
  orange: { name: 'Orange', color: '#ff8c1a', hex: 0xff8c1a },
  teal: { name: 'Teal', color: '#17c3b2', hex: 0x17c3b2 },
};
const ROUND_KILLS = 20;
const MOVE_SPEED = 20;

export default async function launch({ root, user, game }) {
  const app = new GameApp({
    root, title: game.name, gameId: 'rivals',
    skyTop: '#87b7e8', skyBottom: '#f3e4c8',
    fog: { color: '#d7dee6', near: 200, far: 600 },
    shadowArea: 120, camDist: 8.5,
  });
  const { scene, world, input, ui, camera } = app;
  app.setCameraMode('shooter');
  app.camTargetY = 4.6;

  // ================= MAP: symmetric arena =================
  W.ground(scene, world, 260, W.studsTexture('#8f9aa8', 26));
  const crateTex = W.plankTexture('#9a6b3f', 2);
  const crate = (x, y, z, s = 6) => W.part(scene, world, { x, y: y + s / 2, z, w: s, h: s, d: s, tex: crateTex });
  const wall = (x, z, w, h, d, color = '#c8cdd4') => W.part(scene, world, { x, y: h / 2, z, w, h, d, color });

  // team bases (elevated pads at ±x)
  for (const side of [-1, 1]) {
    const col = side === -1 ? TEAM.orange.color : TEAM.teal.color;
    W.part(scene, world, { x: 86 * side, y: 1, z: 0, w: 26, h: 2, d: 34, color: col });
    // spawn cover walls
    wall(72 * side, -12, 2.5, 7, 12, '#aab2bc');
    wall(72 * side, 12, 2.5, 7, 12, '#aab2bc');
    W.part(scene, world, { x: 96 * side, y: 6, z: 0, w: 2, h: 12, d: 36, color: '#aab2bc' });
    // ramp steps down from base
    W.part(scene, world, { x: 74 * side, y: 0.6, z: 0, w: 4, h: 1.2, d: 14, color: '#b9c0c9' });
  }
  // mid tower with step access
  wall(0, 0, 18, 2, 18, '#a3abb5');
  W.part(scene, world, { x: 0, y: 3, z: 0, w: 12, h: 2, d: 12, color: '#98a1ac' });
  W.part(scene, world, { x: 0, y: 5, z: 0, w: 8, h: 2, d: 8, color: '#8d96a2' });
  // tower cover
  wall(0, -7.5, 14, 5.5, 1.5, '#7b8894');
  wall(0, 7.5, 14, 5.5, 1.5, '#7b8894');
  // lane walls
  wall(-30, -28, 16, 8, 3);
  wall(30, 28, 16, 8, 3);
  wall(-30, 28, 16, 8, 3, '#b7a27f');
  wall(30, -28, 16, 8, 3, '#b7a27f');
  wall(0, -46, 40, 10, 3, '#9aa3ae');
  wall(0, 46, 40, 10, 3, '#9aa3ae');
  // crates
  [[-48, -14], [-48, 14], [48, -14], [48, 14], [-16, -34], [16, 34], [-16, 34], [16, -34], [-52, 38], [52, -38]].forEach(([x, z]) => crate(x, 0, z));
  crate(-48, 6, -14, 4); crate(48, 6, 14, 4);
  // side platforms
  W.part(scene, world, { x: -52, y: 7, z: 38, w: 14, h: 1.5, d: 14, color: '#8d96a2' });
  W.part(scene, world, { x: 52, y: 7, z: -38, w: 14, h: 1.5, d: 14, color: '#8d96a2' });
  // arena border walls (overlapping corners — no escape gaps)
  const HB = 108, HZ = 62;
  wall(0, -HZ, HB * 2 + 16, 16, 3, '#818b97'); wall(0, HZ, HB * 2 + 16, 16, 3, '#818b97');
  wall(-HB, 0, 3, 16, HZ * 2 + 16, '#818b97'); wall(HB, 0, 3, 16, HZ * 2 + 16, '#818b97');
  const cloudTick = W.clouds(scene, 6, 420, 100);
  app.onUpdate(cloudTick);

  function spawnPointFor(team) {
    const sx = team === 'orange' ? -86 : 86;
    return new THREE.Vector3(sx + (Math.random() - 0.5) * 16, 2.5, (Math.random() - 0.5) * 24);
  }
  // bot roam waypoints
  const WAYPOINTS = [
    [0, 8, 0], [0, 0, -20], [0, 0, 20], [-48, 0, 0], [48, 0, 0],
    [-30, 0, -36], [30, 0, 36], [-52, 8.5, 38], [52, 8.5, -38], [-16, 0, 26], [16, 0, -26],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));

  // ================= players =================
  const fighters = [];
  const chatter = new ChatterManager(ui, user.name);
  chatter.idleSituation = 'idle';
  let nextId = 1;

  function equip(f, weaponId) {
    f.gun = f.guns[weaponId];
    f.weaponId = weaponId;
    f.char.holdItem(buildGunMesh(weaponId), WEAPONS[weaponId].pose);
    // barrel along the raised arm: hand -Y becomes world-forward when aiming
    f.char.item.rotation.x = Math.PI / 2;
    f.char.item.position.set(0, -0.6, 0.38);
    // defer: during initial construction `player`/`ammoPill` aren't assigned yet
    if (f.isPlayer) queueMicrotask(() => refreshWeaponUI());
  }

  function makeFighter({ name, avatar, isPlayer, persona, team }) {
    if (!name && persona) name = persona.name;
    let char, ctrl, bot = null;
    const tagColor = TEAM[team].color;
    // Per-bot skill tier — wide spread so some are clearly cracked and some
    // are clearly fodder. Drives aim, reaction and movement together.
    const skill = 0.1 + Math.random() * 0.9;         // 0.1 (bot) .. 1.0 (pro)
    const moveMul = 0.82 + skill * 0.36;             // weak bots slower, pros faster
    if (isPlayer) {
      char = new R15Character({ name, avatar, nameTagColor: tagColor });
      ctrl = new CharController({ speed: MOVE_SPEED });
    } else {
      bot = new BotBase(persona, { nameTagColor: tagColor, ctrl: { speed: MOVE_SPEED * moveMul } });
      char = bot.char;
      ctrl = bot.ctrl;
    }
    scene.add(char.group);
    const f = {
      id: nextId++, name, char, ctrl, isPlayer, bot, team,
      hp: 100, alive: true, kills: 0, deaths: 0, respawnT: 0,
      guns: { ar: new GunState('ar'), shotgun: new GunState('shotgun'), sniper: new GunState('sniper'), pistol: new GunState('pistol') },
      gun: null, weaponId: 'ar', lastHitBy: null,
      ai: bot ? {
        skill,                                       // accuracy/reaction quality
        target: null, retargetT: 0, waypoint: null, wpT: 0, burstT: 0, fireT: 0,
        pref: ['ar', 'ar', 'shotgun', 'sniper'][Math.floor(Math.random() * 4)],
      } : null,
    };
    if (bot) f.chat = chatter.register(name, bot.brain, char);
    equip(f, bot ? f.ai.pref : 'ar');
    const p = spawnPointFor(team);
    ctrl.teleport(p.x, p.y, p.z);
    fighters.push(f);
    return f;
  }

  const player = makeFighter({ name: user.name, avatar: user.avatar, isPlayer: true, team: 'orange' });
  const personas = pickBots(7);
  personas.slice(0, 3).forEach((p) => makeFighter({ persona: p, isPlayer: false, team: 'orange' }));
  personas.slice(3, 7).forEach((p) => makeFighter({ persona: p, isPlayer: false, team: 'teal' }));
  chatter.playerChar = player.char;

  // ================= MULTIPLAYER =================
  // Humans get deterministic, balanced teams: sort every human name and
  // alternate orange/teal — every client computes the same assignment.
  // Damage between humans is victim-authoritative via 'hit' topics; each
  // death is announced once by its victim, so scores converge everywhere.
  let net = null;
  const remoteFighters = [];
  const combatants = () => {
    const out = [];
    for (const f of fighters) if (!f.benched) out.push(f);
    for (const r of remoteFighters) { r.alive = r.rp.alive; out.push(r); }
    return out;
  };
  function setBotsBenched(on) {
    for (const f of fighters) {
      if (!f.bot || !!f.benched === on) continue;
      f.benched = on;
      f.char.group.visible = !on;
      if (on) { f.alive = false; ui.removeBoardRow(f.name); }
      else respawn(f);
    }
    ui.system(on ? 'Real players are here — the bots stepped aside!' : 'All alone again... the bots are back.');
    refreshBoard();
  }
  function reassignTeams() {
    const names = [user.name, ...[...net.remotes.values()].map((r) => r.name)].sort();
    const teamAt = (n) => names.indexOf(n) % 2 === 0 ? 'orange' : 'teal';
    const myTeam = teamAt(user.name);
    if (myTeam !== player.team) {
      player.team = myTeam;
      player.char.nameTagColor = TEAM[myTeam].color;
      player.char.refreshNameTag();
      const p = spawnPointFor(myTeam);
      player.ctrl.teleport(p.x, p.y, p.z);
      ui.announce(`You're on ${TEAM[myTeam].name} team!`, '', 2);
    }
    for (const r of remoteFighters) {
      r.team = teamAt(r.name);
      r.rp.char.nameTagColor = TEAM[r.team].color;
      r.rp.char.refreshNameTag();
    }
  }
  function applyRemoteHit(d) {
    if (!player.alive || phase !== 'play') return;
    player.hp -= d.dmg || 0;
    player.char.setHealth(player.hp);
    ui.damageFlash();
    ui.setHealth(player.hp, 100);
    refreshWeaponUI();
    if (player.hp <= 0) {
      player.alive = false;
      player.deaths++;
      player.char.breakApart(scene, 0);
      sfx.play('oof');
      player.respawnT = 4;
      ui.respawnScreen(true, 'Respawning in 4...');
      net?.sendDied({ killer: d.from || 'Player', victim: user.name, vteam: player.team, head: !!d.head });
      applyScoredDeath(d.from || 'Player', user.name, player.team, !!d.head, null);
    }
  }
  // one death event = one score tick, on every client
  function applyScoredDeath(killerName, victimName, victimTeam, head, killerPeerId) {
    const killerTeam = victimTeam === 'orange' ? 'teal' : 'orange';
    score[killerTeam]++;
    ui.killfeed(killerName, victimName, head ? '🎯' : '💥', TEAM[killerTeam].color, TEAM[victimTeam].color);
    if (killerPeerId && killerPeerId === net?.room?.peerId) {
      player.kills++;
      addBlux(3);
      sfx.play('kill', { volume: 0.6 });
    }
    refreshBoard();
    updatePills();
    if (score[killerTeam] >= ROUND_KILLS && phase === 'play') endRound(killerTeam);
  }
  createGameNet({
    scene, ui, gameId: 'rivals', user,
    localState: () => ({
      x: player.ctrl.pos.x, y: player.ctrl.pos.y, z: player.ctrl.pos.z,
      ry: player.char.group.rotation.y,
      sp: Math.hypot(player.ctrl.vel.x, player.ctrl.vel.z), gr: player.ctrl.grounded, vy: player.ctrl.vel.y,
      hp: player.hp, mhp: 100,
      stats: { k: player.kills, d: player.deaths },
      pose: player.char.holdPose,
    }),
    onHit: (d, fromPeer) => applyRemoteHit(d, fromPeer),
    onPeerDied: (d, fromPeer) => {
      const victim = net?.remotes.get(fromPeer);
      applyScoredDeath(d.killer || 'Player', d.victim || victim?.name || 'Player', d.vteam || 'teal', !!d.head, d.by);
    },
    onPeersChanged: (count) => {
      remoteFighters.length = 0;
      for (const [pid, rp] of net.remotes) {
        remoteFighters.push({ remote: true, peerId: pid, name: rp.name, rp, ctrl: rp.ctrl, alive: rp.alive, team: 'teal' });
      }
      reassignTeams();
      setBotsBenched(count > 0);
    },
    topics: {
      round: (d) => { if (phase === 'play' && d?.winner) endRound(d.winner); },
    },
  }).then((gn) => {
    net = gn;
    if (net.online) ui.system('🌐 Online — friends can join the arena!');
    const origPlay = player.char.playAction.bind(player.char);
    player.char.playAction = (name, dur) => { net.action(name, dur); origPlay(name, dur); };
  });

  // camera follows a right-shoulder proxy
  const camProxy = { position: new THREE.Vector3() };
  app.followTarget = camProxy;

  // ================= round state =================
  const score = { orange: 0, teal: 0 };
  const roundsWon = { orange: 0, teal: 0 };
  let phase = 'play'; // 'play' | 'intermission'
  let phaseT = 0;

  ui.setBoard(['K', 'D']);
  const refreshBoard = () => {
    fighters.forEach((f) => {
      if (!f.benched) ui.board(f.name, [f.kills, f.deaths], { isPlayer: f.isPlayer, color: TEAM[f.team].color });
    });
    if (net) for (const r of remoteFighters) {
      ui.board(r.name, [r.rp.stats.k || 0, r.rp.stats.d || 0], { color: TEAM[r.team]?.color });
    }
  };
  refreshBoard();
  ui.setHealth(100, 100);

  function updatePills() {
    ui.setPills([
      { icon: '🟠', value: score.orange, label: `rounds ${roundsWon.orange}`, color: TEAM.orange.color },
      { icon: '🔵', value: score.teal, label: `rounds ${roundsWon.teal}`, color: TEAM.teal.color },
    ]);
  }
  updatePills();
  ui.system(`First team to ${ROUND_KILLS} eliminations wins the round. Headshots hurt extra!`);

  function refreshWeaponUI() {
    const g = player.gun;
    ['ar', 'shotgun', 'sniper', 'pistol'].forEach((id) => ui.hotbarActive(id, id === player.weaponId));
    const ammoEl = g.reloading > 0 ? 'RELOADING' : `${g.ammo} / ${g.weapon.mag}`;
    ui.el.hpText.textContent = `${Math.ceil(Math.max(0, player.hp))} HP`;
    ammoPill.textContent = `${g.weapon.icon} ${ammoEl}`;
  }
  // dedicated ammo readout
  const ammoPill = document.createElement('div');
  ammoPill.className = 'pill';
  ammoPill.style.cssText = 'position:absolute;right:12px;bottom:calc(14px + env(safe-area-inset-bottom, 0px));font-size:16px;font-weight:800;pointer-events:none';
  ui.hud.appendChild(ammoPill);

  // ================= combat =================
  function chestPos(f) { return new THREE.Vector3(f.ctrl.pos.x, f.ctrl.pos.y + 3.6, f.ctrl.pos.z); }

  function dealDamage(att, tgt, dmg, headshot, point) {
    if (!tgt.alive || phase !== 'play') return;
    if (att.team === tgt.team && att !== tgt) return; // no friendly fire
    // Remote player hit: only our own shots count (victim applies the damage
    // on their client and announces the death — scores converge from that).
    if (tgt.remote) {
      if (!att.isPlayer || !net) return;
      net.sendHit(tgt.peerId, { dmg: Math.round(dmg * 10) / 10, head: !!headshot, from: user.name, by: net.room.peerId });
      ui.popup(camera, point || chestPos(tgt), `-${Math.round(dmg)}`, headshot ? '#ff5b5b' : '#ffd166', headshot ? 17 : 14);
      ui.hitmarker(headshot);
      if (headshot) sfx.play('headshot', { volume: 0.5 });
      return;
    }
    tgt.hp -= dmg;
    tgt.lastHitBy = att;
    tgt.char.setHealth(tgt.hp);
    ui.popup(camera, point || chestPos(tgt), `-${Math.round(dmg)}`, headshot ? '#ff5b5b' : '#ffd166', headshot ? 17 : 14);
    if (att.isPlayer) { ui.hitmarker(headshot); if (headshot) sfx.play('headshot', { volume: 0.5 }); }
    if (tgt.isPlayer) { ui.damageFlash(); refreshWeaponUI(); ui.setHealth(tgt.hp, 100); }
    if (tgt.hp <= 0) kill(att, tgt, headshot);
    else if (tgt.hp <= 25 && tgt.chat) chatter.botSay(tgt.chat, 'lowhp', {}, 0.25, 0.3);
  }

  function kill(att, tgt, headshot) {
    tgt.alive = false;
    tgt.deaths++;
    att.kills++;
    score[att.team]++;
    tgt.char.breakApart(scene, 0);
    sfx.play('oof');
    if (att.isPlayer) { sfx.play('kill', { volume: 0.6 }); addBlux(3); }
    ui.killfeed(att.name, tgt.name, headshot ? '🎯' : att.gun.weapon.icon, TEAM[att.team].color, TEAM[tgt.team].color);
    refreshBoard();
    updatePills();
    tgt.respawnT = 4;
    if (tgt.isPlayer) ui.respawnScreen(true, 'Respawning in 4...');
    if (tgt.chat) chatter.botSay(tgt.chat, 'death', { killer: att.name }, tgt.bot.brain.mood === 'angry' ? 0.9 : 0.45, 0.6 + Math.random());
    if (att.chat) chatter.botSay(att.chat, 'kill', { victim: tgt.name }, 0.4, 0.4 + Math.random());
    if (score[att.team] >= ROUND_KILLS && phase === 'play') endRound(att.team);
  }

  function respawn(f) {
    const p = spawnPointFor(f.team);
    f.ctrl.teleport(p.x, p.y, p.z);
    f.hp = 100;
    f.alive = true;
    f.char.respawnVisual();
    for (const id in f.guns) { f.guns[id].ammo = f.guns[id].weapon.mag; f.guns[id].reloading = 0; }
    if (f.isPlayer) { ui.setHealth(100, 100); ui.respawnScreen(false); refreshWeaponUI(); }
  }

  function endRound(winner) {
    if (phase !== 'play') return;
    net?.sendTopic('round', { winner });
    phase = 'intermission';
    phaseT = 7;
    roundsWon[winner]++;
    const won = winner === player.team;
    ui.announce(won ? 'VICTORY!' : 'DEFEAT', `${TEAM[winner].name} team wins the round ${score.orange} — ${score.teal}`, 5);
    sfx.play(won ? 'win' : 'lose');
    if (won) addBlux(25);
    fighters.forEach((f) => { f.ctrl.frozen = true; });
    // team reactions
    fighters.filter((f) => f.chat).forEach((f, i) => {
      chatter.botSay(f.chat, f.team === winner ? 'win' : 'lose', {}, 0.5, 0.8 + i * 0.9);
    });
    updatePills();
  }

  function startRound() {
    score.orange = 0; score.teal = 0;
    phase = 'play';
    fighters.forEach((f) => {
      f.kills = 0; f.deaths = 0;
      f.ctrl.frozen = false;
      if (!f.alive) { f.respawnT = 0; respawn(f); }
      else { const p = spawnPointFor(f.team); f.ctrl.teleport(p.x, p.y, p.z); f.hp = 100; f.char.setHealth(100); }
    });
    refreshBoard();
    updatePills();
    ui.announce('ROUND START', `First to ${ROUND_KILLS}!`, 2.2);
    if (player.isPlayer) { ui.setHealth(100, 100); refreshWeaponUI(); }
    fighters.filter((f) => f.chat).slice(0, 2).forEach((f, i) =>
      chatter.botSay(f.chat, 'roundStart', {}, 0.6, 0.5 + i * 1.2));
  }

  // ---- firing ----
  const targetsFor = (f) => combatants().filter((t) => t.team !== f.team);

  function fireWeapon(f, aimOrigin, aimDir) {
    const g = f.gun;
    if (!g.canFire() || !f.alive || phase !== 'play') return false;
    g.fire();
    f.char.playAction('recoil', 0.14);
    if (f.char.item) spawnMuzzleFlash(f.char.item);
    const pellets = g.weapon.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const dir = spreadDir(aimDir, g.weapon.spread * (f.isPlayer ? 1 : 1));
      const hit = hitscan({
        world, scene, origin: aimOrigin.clone(), dir, weapon: g.weapon,
        targets: targetsFor(f), shooterId: f.id,
      });
      if (hit && hit.target) {
        const dmg = g.weapon.damage * (hit.headshot ? g.weapon.headMult : 1);
        dealDamage(f, hit.target, dmg, hit.headshot, hit.point);
      }
    }
    if (f.isPlayer) { refreshWeaponUI(); app.screenShake(g.weapon.id === 'sniper' ? 0.4 : 0.12); }
    return true;
  }

  function playerFire() {
    if (ui.menuOpen || !player.alive) return;
    const { origin, dir } = app.aimRay();
    // shift origin forward past the character to avoid self-clip
    origin.addScaledVector(dir, app.camDist * 0.4);
    fireWeapon(player, origin, dir);
  }

  // zoom (sniper)
  let zoomed = false;
  function setZoom(on) {
    if (on && player.weaponId !== 'sniper') on = false;
    zoomed = on;
    camera.fov = on ? 26 : 70;
    camera.updateProjectionMatrix();
    app.camDist = on ? 3.5 : 8.5;
  }

  // ================= player bindings =================
  input.onMouseDown(() => playerFire());
  window.addEventListener('mousedown', (e) => { if (e.button === 2) setZoom(true); });
  window.addEventListener('mouseup', (e) => { if (e.button === 2) setZoom(false); });
  let fireHeld = false;
  if (input.isTouch) {
    input.setFireButton(() => { fireHeld = true; playerFire(); }, () => { fireHeld = false; });
    input.registerAction({ id: 'swap', label: 'Weapon', icon: '🔁', onDown: () => {
      const order = ['ar', 'shotgun', 'sniper', 'pistol'];
      const next = order[(order.indexOf(player.weaponId) + 1) % order.length];
      setZoom(false); equip(player, next);
    } });
    input.registerAction({ id: 'reload', label: 'Reload', icon: '🔄', onDown: () => { player.gun.startReload(); refreshWeaponUI(); } });
    input.registerAction({ id: 'zoom', label: 'Scope', icon: '🔭', onDown: () => setZoom(!zoomed) });
  } else {
    ['ar', 'shotgun', 'sniper', 'pistol'].forEach((id, i) => {
      input.bindKey(String(i + 1), () => { setZoom(false); equip(player, id); });
      const slot = ui.hotbarSlot(String(i + 1), WEAPONS[id].icon, WEAPONS[id].name, id);
      slot.addEventListener('click', () => { setZoom(false); equip(player, id); });
    });
    input.bindKey('r', () => { player.gun.startReload(); refreshWeaponUI(); });
  }
  refreshWeaponUI();

  app.onChatSend((t) => { chatter.onPlayerMessage(t); net?.sendChat(t); });
  let boardT = 0;
  app.onRespawnRequest(() => { if (player.alive) { player.hp = 0; kill(player, player, false); player.kills++; score[player.team]--; refreshBoard(); } });

  setTimeout(() => {
    fighters.filter((f) => f.chat).slice(0, 3).forEach((f, i) =>
      chatter.botSay(f.chat, 'spawn', {}, 0.7, 0.5 + i * 1.4));
  }, 1000);

  // ================= bot AI =================
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
  function botThink(f, dt) {
    const ai = f.ai;
    if (!f.alive || phase !== 'play') { f.bot.stop(); return; }
    ai.retargetT -= dt;
    if (!ai.target || !ai.target.alive || ai.retargetT <= 0) {
      ai.retargetT = 1.5 + Math.random() * 2;
      let best = null, bestD = Infinity;
      for (const t of targetsFor(f)) {
        if (!t.alive) continue;
        const d = distXZ(f.ctrl.pos, t.ctrl.pos);
        if (d < bestD) { bestD = d; best = t; }
      }
      ai.target = best;
    }
    const tgt = ai.target;
    const g = f.gun;
    g.update(dt);
    if (g.ammo === 0 && g.reloading <= 0) g.startReload();

    if (!tgt) { roam(f, dt); return; }
    const d = distXZ(f.ctrl.pos, tgt.ctrl.pos);
    // line of sight
    _v1.copy(chestPos(f));
    _v2.copy(chestPos(tgt)).sub(_v1);
    const dist3 = _v2.length();
    _v2.normalize();
    const losHit = world.raycast(_v1, _v2, dist3 - 1);
    const visible = !losHit;

    if (!visible || d > (f.weaponId === 'sniper' ? 120 : 60)) {
      // push toward target
      f.bot.seek(tgt.ctrl.pos, { strafe: 0.2 });
      return;
    }
    // combat: strafe + fire bursts
    f.bot.faceToward(tgt.ctrl.pos);
    const idealRange = f.weaponId === 'shotgun' ? 10 : f.weaponId === 'sniper' ? 45 : 22;
    if (d > idealRange + 6) f.bot.seek(tgt.ctrl.pos, { strafe: 0.6 });
    else if (d < idealRange - 6) {
      const away = _v1.set(f.ctrl.pos.x * 2 - tgt.ctrl.pos.x, 0, f.ctrl.pos.z * 2 - tgt.ctrl.pos.z);
      f.bot.seek(away, { strafe: 0.7 });
    } else {
      // hold range, strafe
      f.bot.seek(tgt.ctrl.pos, { strafe: 1.4 });
      f.ctrl.moveDir.multiplyScalar(0.8);
    }
    if (Math.random() < dt * 0.6) f.ctrl.wantJump = true;
    // aim & fire
    ai.fireT -= dt;
    if (ai.fireT <= 0 && g.canFire()) {
      ai.fireT = (g.weapon.auto ? 0.1 : 60 / g.weapon.rpm) + (1 - ai.skill) * 0.25;
      const origin = chestPos(f);
      const aim = chestPos(tgt);
      // lead + skill-based sway; sometimes aim at head
      if (Math.random() < ai.skill * 0.35) aim.y += 0.9;
      aim.x += (Math.random() - 0.5) * (1 - ai.skill) * 6;
      aim.y += (Math.random() - 0.5) * (1 - ai.skill) * 4;
      aim.z += (Math.random() - 0.5) * (1 - ai.skill) * 6;
      const dir = aim.sub(origin).normalize();
      f.char.aimPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      fireWeapon(f, origin, dir);
    }
  }
  function roam(f, dt) {
    const ai = f.ai;
    ai.wpT -= dt;
    if (!ai.waypoint || ai.wpT <= 0 || f.bot.distTo(ai.waypoint) < 4) {
      ai.waypoint = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
      ai.wpT = 8 + Math.random() * 6;
    }
    f.bot.seek(ai.waypoint, { strafe: 0.1 });
  }

  // ================= main loop =================
  const moveTmp = new THREE.Vector3();
  let autoFireT = 0;
  app.onUpdate((dt) => {
    chatter.update(dt);

    // phase
    if (phase === 'intermission') {
      phaseT -= dt;
      if (phaseT <= 0) startRound();
    }

    // ---- player ----
    player.gun.update(dt);
    if (player.gun.reloading > 0) refreshWeaponUI();
    if (player.alive && !ui.menuOpen && phase === 'play') {
      app.moveWorld(moveTmp);
      player.ctrl.moveDir.copy(moveTmp);
      if (input.jumpHeld) player.ctrl.wantJump = true;
      // face camera direction (shooter mode)
      player.char.group.rotation.y = app.camYaw + Math.PI;
      player.char.aimPitch = app.camPitch * 0.85;
      // hold to auto-fire
      const wantFire = (input.mouseDown && !input.isTouch && input.pointerLocked) || fireHeld;
      if (wantFire && player.gun.weapon.auto) {
        autoFireT -= dt;
        if (autoFireT <= 0) { playerFire(); autoFireT = 0; }
      }
    } else {
      player.ctrl.moveDir.set(0, 0, 0);
    }

    // ---- fighters ----
    for (const f of fighters) {
      if (f.benched) continue;
      if (!f.alive) {
        f.respawnT -= dt;
        if (f.isPlayer) ui.respawnScreen(true, `Respawning in ${Math.max(0, f.respawnT).toFixed(1)}...`);
        if (f.respawnT <= 0 && phase === 'play') respawn(f);
        continue;
      }
      if (f.bot) botThink(f, dt);
      f.ctrl.update(dt, world);
      // hard arena clamp (belt & braces on top of the walls)
      f.ctrl.pos.x = Math.max(-HB + 2, Math.min(HB - 2, f.ctrl.pos.x));
      f.ctrl.pos.z = Math.max(-HZ + 2, Math.min(HZ - 2, f.ctrl.pos.z));
      if (f.ctrl.fellOff) { f.hp = 0; kill(f.lastHitBy || f, f, false); continue; }
      if (f.bot) f.bot.syncVisual(dt);
      else {
        f.char.group.position.copy(f.ctrl.pos);
        f.char.update(dt, { speed: Math.hypot(f.ctrl.vel.x, f.ctrl.vel.z), grounded: f.ctrl.grounded, velY: f.ctrl.vel.y });
      }
    }

    // camera shoulder proxy
    const yaw = app.camYaw;
    camProxy.position.set(
      player.ctrl.pos.x + Math.cos(yaw) * 1.6,
      player.ctrl.pos.y,
      player.ctrl.pos.z - Math.sin(yaw) * 1.6);

    // multiplayer: interpolate remotes, publish state, keep remote guns in sync
    if (net) {
      net.setExtra({ wpn: player.weaponId });
      net.tick(dt);
      for (const r of remoteFighters) {
        const wpn = r.rp.extra?.wpn;
        if (wpn && wpn !== r._wpn && WEAPONS[wpn]) {
          r._wpn = wpn;
          r.rp.char.holdItem(buildGunMesh(wpn), WEAPONS[wpn].pose);
          r.rp.char.item.rotation.x = Math.PI / 2;
          r.rp.char.item.position.set(0, -0.6, 0.38);
        }
      }
      boardT -= dt;
      if (boardT <= 0 && net.humanCount) { boardT = 0.8; refreshBoard(); }
    }

    ui.updatePrompts(dt, camera, player.ctrl.pos, input.keys);
  });

  app.start();
}
