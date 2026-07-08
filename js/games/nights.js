// ============================================================
// 99 NIGHTS IN THE FOREST — Bloxverse co-op survival
// Gather wood & food by day, feed the central campfire, and
// fight off wolves each night. Survive as many Nights as you
// can (99 to win). Day/night cycle, hunger, AI survivors, and
// host-authoritative co-op monsters over the net layer.
// ============================================================
import * as THREE from 'three';
import { GameApp } from '../engine/core.js';
import { R15Character } from '../engine/character.js';
import { CharController, distXZ } from '../engine/physics.js';
import { pickBots, BotBase, ChatterManager } from '../engine/bots.js';
import { sfx } from '../engine/sfx.js';
import { addBlux } from '../site/common.js';
import { createGameNet } from '../engine/netplay.js';
import * as W from '../engine/world.js';

const DAY_LEN = 52;     // seconds of daylight
const NIGHT_LEN = 42;   // seconds of night
const WIN_NIGHT = 99;
const FIRE = new THREE.Vector3(0, 0.5, 0);

// ---------------- wolf creature model ----------------
function buildWolf(scale = 1) {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: '#484d55' });
  const dark = new THREE.MeshLambertMaterial({ color: '#2b3037' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.35, 3.0), fur);
  body.position.y = 1.85; body.castShadow = true; g.add(body);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), fur);
  neck.position.set(0, 2.2, 1.5); g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.2), fur);
  head.position.set(0, 2.35, 2.2); g.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.7), dark);
  snout.position.set(0, 2.15, 2.9); g.add(snout);
  for (const sx of [-0.42, 0.42]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.55, 0.22), dark);
    ear.position.set(sx, 3.05, 1.95); g.add(ear);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.12), new THREE.MeshBasicMaterial({ color: '#ffdd55' }));
    eye.position.set(sx * 0.55, 2.45, 2.82); g.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1.3), fur);
  tail.position.set(0, 2.1, -1.7); tail.rotation.x = 0.5; g.add(tail);
  const legs = [];
  for (const [lx, lz, ph] of [[-0.55, -1.0, 0], [0.55, -1.0, Math.PI], [-0.55, 1.0, Math.PI], [0.55, 1.0, 0]]) {
    const hip = new THREE.Group();
    hip.position.set(lx, 1.6, lz); g.add(hip);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.7, 0.38), dark);
    leg.position.y = -0.85; leg.castShadow = true; hip.add(leg);
    legs.push({ hip, ph });
  }
  g.userData.legs = legs;
  g.scale.setScalar(scale);
  return g;
}
function animWolf(g, dt, speed, t) {
  const amp = Math.min(0.8, speed * 0.06);
  for (const l of g.userData.legs) l.hip.rotation.x = Math.sin(t * 10 + l.ph) * amp;
}

export default async function launch({ root, user, game }) {
  const app = new GameApp({
    root, title: game.name, gameId: 'nights',
    skyTop: '#7ec8f2', skyBottom: '#dfeee0',
    fog: { color: '#bcd0c0', near: 90, far: 300 },
    shadowArea: 150, camDist: 16,
  });
  const { scene, world, input, ui, camera } = app;
  world.killY = -40;

  // multiplayer state (wired below)
  let net = null;
  let wseq = 1, lastHostNight = 0;
  const proxies = new Map();
  const remoteHumans = [];

  // ================= FOREST MAP =================
  W.ground(scene, world, 400, W.grassTexture('#4f8f42', 40));
  W.skyDome && null;
  const cloudTick = W.clouds(scene, 10, 460, 90);
  app.onUpdate(cloudTick);
  // clearing ring around the fire (dirt)
  {
    const clearing = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 0.2, 32),
      new THREE.MeshLambertMaterial({ map: W.grassTexture('#6a5334', 6) }));
    clearing.position.set(0, 0.12, 0); clearing.receiveShadow = true; scene.add(clearing);
  }

  // ---- campfire ----
  const fireGroup = new THREE.Group();
  fireGroup.position.copy(FIRE);
  scene.add(fireGroup);
  // stone ring
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), W.mat('#8a8f96'));
    stone.position.set(Math.cos(a) * 2.2, 0.35, Math.sin(a) * 2.2);
    stone.rotation.y = a; stone.castShadow = true; fireGroup.add(stone);
  }
  // logs
  for (const r of [0, 1, 2]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.6, 6), W.mat('#6a4526'));
    log.rotation.z = Math.PI / 2; log.rotation.y = r * 1.05; log.position.y = 0.4;
    fireGroup.add(log);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.6, 8),
    new THREE.MeshBasicMaterial({ color: '#ff9a2e' }));
  flame.position.y = 1.6; fireGroup.add(flame);
  const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 8),
    new THREE.MeshBasicMaterial({ color: '#ffe58a' }));
  flameCore.position.y = 1.3; fireGroup.add(flameCore);
  const fireLight = new THREE.PointLight(0xffb552, 40, 40, 1.6);
  fireLight.position.set(0, 3, 0); fireGroup.add(fireLight);

  // ---- trees (choppable), bushes (food), rocks ----
  const resources = []; // {type, group, pos, prompt, depleted, regrow, hitsMesh}
  function buildTree(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 6, 7), W.mat('#6d4a2f'));
    trunk.position.y = 3; trunk.castShadow = true; g.add(trunk);
    const leafMat = W.mat('#3f8a3c');
    for (const [ly, ls] of [[6.4, 3], [8.2, 2.3], [9.6, 1.5]]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(ls, 8, 6), leafMat);
      leaf.position.y = ly; leaf.castShadow = true; g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    world.addBox3(new THREE.Box3(new THREE.Vector3(x - 0.8, 0, z - 0.8), new THREE.Vector3(x + 0.8, 6, z + 0.8)));
    return g;
  }
  function buildBush(x, z) {
    const g = new THREE.Group();
    const bush = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), W.mat('#2f7d3a'));
    bush.position.y = 1.2; bush.scale.y = 0.8; bush.castShadow = true; g.add(bush);
    const berries = [];
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshLambertMaterial({ color: '#d63b5a', emissive: '#8a1f30', emissiveIntensity: 0.3 }));
      const a = Math.random() * Math.PI * 2;
      b.position.set(Math.cos(a) * 1.1, 1.1 + Math.random() * 0.6, Math.sin(a) * 1.1);
      g.add(b); berries.push(b);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    return { g, berries };
  }
  // scatter forest (avoid the clearing)
  const rand = (a, b) => a + Math.random() * (b - a);
  function scatterPos(minR, maxR) {
    const a = Math.random() * Math.PI * 2, r = rand(minR, maxR);
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  for (let i = 0; i < 26; i++) {
    const p = scatterPos(18, 120);
    const g = buildTree(p.x, p.z);
    resources.push({ type: 'tree', group: g, pos: p.clone(), depleted: false, regrow: 0 });
  }
  for (let i = 0; i < 14; i++) {
    const p = scatterPos(14, 110);
    const bb = buildBush(p.x, p.z);
    resources.push({ type: 'bush', group: bb.g, berries: bb.berries, pos: p.clone(), depleted: false, regrow: 0 });
  }
  // scenery rocks + logs
  for (let i = 0; i < 12; i++) {
    const p = scatterPos(10, 130);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1, 2.4)), W.mat('#7c828a'));
    rock.position.set(p.x, 0.6, p.z); rock.castShadow = true; scene.add(rock);
    world.addBox3(new THREE.Box3(new THREE.Vector3(p.x - 1.4, 0, p.z - 1.4), new THREE.Vector3(p.x + 1.4, 2, p.z + 1.4)));
  }
  // distant tree wall (visual boundary) + invisible fence
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    buildTree(Math.cos(a) * 150 + rand(-6, 6), Math.sin(a) * 150 + rand(-6, 6));
  }
  const HB = 145;
  [[0, -HB, HB * 2 + 20, 4], [0, HB, HB * 2 + 20, 4], [-HB, 0, 4, HB * 2 + 20], [HB, 0, 4, HB * 2 + 20]].forEach(([x, z, w, d]) =>
    world.addBox3(new THREE.Box3(new THREE.Vector3(x - w / 2, 0, z - d / 2), new THREE.Vector3(x + w / 2, 30, z + d / 2))));

  // ================= state =================
  const save = { fuel: 70, night: 0, phase: 'day', clock: 0 };
  let gameOver = false, won = false;

  const chatter = new ChatterManager(ui, user.name);
  chatter.idleSituation = 'idle';
  const humans = [];
  let nextId = 1;

  function makeHuman({ name, avatar, isPlayer, persona }) {
    if (!name && persona) name = persona.name;
    let char, ctrl, bot = null;
    const skill = 0.2 + Math.random() * 0.75;
    if (isPlayer) {
      char = new R15Character({ name, avatar, nameTagColor: '#8fe0a0' });
      ctrl = new CharController({ speed: 17 });
    } else {
      bot = new BotBase(persona, { nameTagColor: '#8fe0a0', ctrl: { speed: 14 + skill * 3 } });
      char = bot.char; ctrl = bot.ctrl;
    }
    // give them an axe
    const axe = buildAxe();
    char.holdItem(axe, 'sword');
    char.item.position.set(0, -0.3, 0.2);
    scene.add(char.group);
    const h = {
      id: nextId++, name, char, ctrl, isPlayer, bot,
      hp: 100, alive: true, downed: false, wood: 0, food: 0, kills: 0,
      hunger: 100, swingCd: 0, gatherT: 0,
      ai: bot ? { skill, target: null, retargetT: 0, task: 'gather', node: null, chopT: 0 } : null,
    };
    if (bot) h.chat = chatter.register(name, bot.brain, char);
    const a = humans.length * 1.4 + 0.5;
    ctrl.teleport(Math.cos(a) * 8, 0.5, Math.sin(a) * 8);
    humans.push(h);
    return h;
  }
  function buildAxe() {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16), W.mat('#6a4526'));
    handle.position.y = -0.4; g.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.2), W.mat('#c8ccd2'));
    head.position.set(0.22, 0.2, 0); g.add(head);
    g.rotation.x = Math.PI / 2;
    return g;
  }

  const player = makeHuman({ name: user.name, avatar: user.avatar, isPlayer: true });
  pickBots(2).forEach((p) => makeHuman({ persona: p, isPlayer: false }));
  app.followTarget = player.char.group;
  chatter.playerChar = player.char;

  // ================= wolves (host-authoritative) =================
  const wolves = [];
  function spawnWolf() {
    const scale = Math.random() < 0.18 && save.night >= 4 ? 1.5 : 1;
    const g = buildWolf(scale);
    const edge = scatterPos(70, 120);
    g.position.set(edge.x, 0, edge.z);
    scene.add(g);
    const ctrl = new CharController({ speed: (11 + save.night * 0.25) * (scale > 1 ? 0.8 : 1), halfW: 1.1 * scale, height: 3 * scale });
    ctrl.teleport(edge.x, 0.5, edge.z);
    const w = {
      id: 'w' + nextId++, nid: wseq++, group: g, ctrl, scale,
      hp: (28 + save.night * 5) * (scale > 1 ? 2.4 : 1), maxHp: 28 + save.night * 5,
      alive: true, attackT: 0, target: null, retargetT: 0, phase: Math.random() * 6,
    };
    wolves.push(w);
    return w;
  }
  const wolfTargets = () => {
    const out = [];
    for (const h of humans) if (!h.benched && h.alive) out.push(h);
    for (const r of remoteHumans) if (r.alive) out.push(r);
    return out;
  };

  // ================= HUD =================
  ui.setHealth(100, 100);
  ui.el.hpText.textContent = 'Survivor';
  function updatePills() {
    const fuel = (net && !net.isHost) ? (hostRp()?.extra?.fu ?? save.fuel) : save.fuel;
    const night = (net && !net.isHost) ? (hostRp()?.extra?.ni ?? save.night) : save.night;
    const phase = (net && !net.isHost) ? (hostRp()?.extra?.ph ?? save.phase) : save.phase;
    ui.setPills([
      { icon: phase === 'night' ? '🌙' : '☀️', value: phase === 'night' ? `Night ${night}` : `Day ${night + 1}`, color: phase === 'night' ? '#8fa0ff' : undefined },
      { icon: '🔥', value: `${Math.ceil(fuel)}%`, label: 'fire', color: fuel < 25 ? '#f74d59' : undefined },
      { icon: '🪵', value: player.wood, label: 'wood' },
      { icon: '🍓', value: player.food, label: 'food' },
      { icon: '🍗', value: Math.ceil(player.hunger), label: 'hunger', color: player.hunger < 25 ? '#f74d59' : undefined },
    ]);
  }
  ui.setBoard(['Wood', 'Kills']);
  const refreshBoard = () => {
    humans.forEach((h) => { if (!h.benched) ui.board(h.name, [h.wood, h.kills], { isPlayer: h.isPlayer, color: '#8fe0a0' }); });
    if (net) for (const rp of net.remotes.values()) ui.board(rp.name, [rp.stats.wood || 0, rp.stats.kills || 0], { color: '#7ddf8a' });
  };
  refreshBoard();
  updatePills();
  ui.system('Chop trees (hold E) for wood, feed the campfire, and survive the night!');

  // ================= interactions =================
  let busy = false;
  const prompts = [];
  function addResourcePrompts() {
    for (const r of resources) {
      const p = ui.addPrompt({
        getPos: () => r.pos.clone().add(new THREE.Vector3(0, r.type === 'tree' ? 4 : 1.5, 0)),
        text: r.type === 'tree' ? '🪓 Chop tree' : '🍓 Pick berries', key: 'E',
        radius: r.type === 'tree' ? 6 : 5, hold: r.type === 'tree' ? 1.3 : 0.9,
        filter: () => !r.depleted && !busy,
        onTrigger: () => gather(r),
      });
      prompts.push(p);
    }
  }
  function gather(r) {
    if (r.depleted) return;
    if (r.type === 'tree') {
      player.wood += 3;
      player.char.playAction('slash', 0.4);
      sfx.play('place', { volume: 0.5 });
      ui.popup(camera, r.pos.clone().add(new THREE.Vector3(0, 4, 0)), '+3 🪵', '#c8a15a', 16);
      r.depleted = true; r.regrow = 22;
      r.group.scale.y = 0.35; r.group.children.forEach((c, i) => { if (i > 0) c.visible = false; });
    } else {
      player.food += 2;
      sfx.play('eat', { volume: 0.5 });
      ui.popup(camera, r.pos.clone().add(new THREE.Vector3(0, 2, 0)), '+2 🍓', '#e05a76', 16);
      r.depleted = true; r.regrow = 16;
      r.berries.forEach((b) => b.visible = false);
    }
    updatePills(); refreshBoard();
  }
  addResourcePrompts();
  // feed the campfire
  prompts.push(ui.addPrompt({
    getPos: () => new THREE.Vector3(0, 2.5, 0),
    text: '🔥 Feed fire (1 🪵 → +12%)', key: 'E', radius: 6, hold: 0.4,
    filter: () => player.wood > 0 && !busy,
    onTrigger: () => {
      if (player.wood <= 0) return;
      player.wood--;
      sfx.play('whoosh', { volume: 0.4 });
      if (net && !net.isHost) net.sendTopic('feed', { amt: 12 });
      else save.fuel = Math.min(100, save.fuel + 12);
      player.char.playAction('cast', 0.4);
      updatePills(); refreshBoard();
    },
  }));

  // ================= combat =================
  function swingAxe() {
    if (busy || player.swingCd > 0 || !player.alive) return;
    player.swingCd = 0.55;
    player.char.playAction('slash', 0.4);
    sfx.play('whoosh', { volume: 0.4 });
    // face camera-forward-ish: use player facing
    const fwd = new THREE.Vector3(Math.sin(player.char.group.rotation.y), 0, Math.cos(player.char.group.rotation.y));
    const list = (net && !net.isHost) ? [...proxies.values()] : wolves;
    for (const w of list) {
      if (w.alive === false) continue;
      const wp = w.ctrl ? w.ctrl.pos : w.group.position;
      const dx = wp.x - player.ctrl.pos.x, dz = wp.z - player.ctrl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 5.5) continue;
      const dot = (dx / (d || 1)) * fwd.x + (dz / (d || 1)) * fwd.z;
      if (dot < 0.2 && d > 2.2) continue;
      hitWolf(player, w, 16 + Math.random() * 6);
    }
  }
  function hitWolf(h, w, dmg) {
    if (w.proxy) {
      // client: tell host, optimistic feedback
      net?.sendTopic('whit', { id: w.nid, dmg });
      app.burst(w.group.position.clone().add(new THREE.Vector3(0, 2, 0)), { color: '#c94b4b', count: 6, speed: 10, size: 0.2, life: 0.3 });
      ui.hitmarker();
      sfx.play('punch', { volume: 0.4 });
      return;
    }
    if (!w.alive) return;
    w.hp -= dmg;
    app.burst(w.group.position.clone().add(new THREE.Vector3(0, 2, 0)), { color: '#c94b4b', count: 6, speed: 10, size: 0.2, life: 0.3 });
    if (h.isPlayer) { ui.hitmarker(); sfx.play('punch', { volume: 0.4 }); }
    if (w.hp <= 0) killWolf(w, h);
  }
  function killWolf(w, h) {
    w.alive = false;
    scene.remove(w.group);
    sfx.play('growl', { volume: 0.3 });
    net?.sendTopic('wdeath', { id: w.nid, by: h?.isPlayer ? net?.room?.peerId : (h?.peerId || null) });
    if (h) { h.kills++; if (h.isPlayer) { addBlux(1); } }
    refreshBoard();
  }
  function hurtHuman(h, dmg) {
    if (!h.alive || gameOver) return;
    h.hp -= dmg;
    h.char.setHealth(h.hp);
    if (h.isPlayer) { ui.damageFlash(); ui.setHealth(h.hp, 100); }
    if (h.chat && h.hp < 35 && Math.random() < 0.25) chatter.botSay(h.chat, 'lowhp', {}, 0.7, 0.2);
    if (h.hp <= 0) downHuman(h);
  }
  function downHuman(h) {
    h.alive = false; h.downed = true;
    h.char.setRagdoll(true);
    sfx.play('oof');
    ui.killfeed('The forest', h.name, '🐺', '#7fae62', '#8fe0a0');
    if (h.isPlayer) ui.respawnScreen(true, 'You fell... hold on until dawn!');
    if (h.chat) chatter.botSay(h.chat, 'death', { killer: 'a wolf' }, 0.8, 0.5);
    const anyUp = humans.some((x) => !x.benched && x.alive) || remoteHumans.some((r) => r.alive);
    if (!anyUp && (!net || net.isHost)) { net?.sendTopic('over', { night: save.night }); endGame(false); }
  }
  function reviveAll() {
    for (const h of humans) {
      if (h.downed || !h.alive) {
        h.downed = false; h.alive = true; h.hp = 60; h.hunger = Math.max(h.hunger, 40);
        h.char.respawnVisual(); h.char.setHealth(h.hp);
        const a = Math.random() * Math.PI * 2;
        h.ctrl.teleport(Math.cos(a) * 7, 0.5, Math.sin(a) * 7);
        if (h.isPlayer) { ui.respawnScreen(false); ui.setHealth(h.hp, 100); }
      }
    }
  }
  function endGame(win) {
    if (gameOver) return;
    gameOver = true; won = win;
    const reward = win ? 999 : save.night * 8;
    addBlux(reward);
    if (win) { ui.announce('YOU SURVIVED 99 NIGHTS! 🏆', `Legendary! +${reward} Blux`, 8); sfx.play('win'); }
    else { ui.announce('YOU DIDN\'T MAKE IT', `Survived ${save.night} night${save.night === 1 ? '' : 's'} — +${reward} Blux`, 7); sfx.play('lose'); }
    setTimeout(() => location.reload(), win ? 9000 : 7000);
  }

  // ================= day / night =================
  const sky = scene.getObjectByName('sky');
  const DAY_TOP = new THREE.Color('#7ec8f2'), DAY_BOT = new THREE.Color('#dfeee0');
  const NIGHT_TOP = new THREE.Color('#0b1026'), NIGHT_BOT = new THREE.Color('#26324f');
  let toSpawnNight = 0, spawnT = 0;
  function startNight() {
    save.phase = 'night'; save.clock = 0;
    save.night++;
    toSpawnNight = 4 + save.night * 2;
    spawnT = 1;
    sfx.play('wave');
    ui.announce(`NIGHT ${save.night}`, 'They\'re coming — keep the fire lit!', 3);
    if (save.night === WIN_NIGHT) { /* survive this last night to win at dawn */ }
    humans.filter((h) => h.chat && !h.benched).forEach((h, i) => chatter.botSay(h.chat, 'wave', { wave: save.night }, 0.5, 0.8 + i));
    updatePills();
  }
  function startDay() {
    const survived = save.night;
    save.phase = 'day'; save.clock = 0;
    // clear leftover wolves at dawn
    for (const w of wolves) { if (w.alive) { w.alive = false; scene.remove(w.group); } }
    wolves.length = 0;
    reviveAll();
    if (survived >= WIN_NIGHT) { endGame(true); return; }
    if (survived > 0) {
      ui.announce('DAWN', `You survived Night ${survived}! Gather up.`, 3);
      sfx.play('checkpoint');
      addBlux(2);
      humans.filter((h) => h.chat && !h.benched).forEach((h, i) => chatter.botSay(h.chat, 'win', {}, 0.4, 0.6 + i));
    }
    updatePills();
  }
  function dayNightVisual() {
    // dayness 1 during day, 0 at deep night, with dawn/dusk transitions
    let dayness;
    if (save.phase === 'day') {
      const f = save.clock / DAY_LEN;
      dayness = f < 0.15 ? 0.3 + f / 0.15 * 0.7 : f > 0.85 ? 1 - (f - 0.85) / 0.15 * 0.7 : 1;
    } else {
      const f = save.clock / NIGHT_LEN;
      dayness = f < 0.12 ? 0.3 - f / 0.12 * 0.3 : f > 0.88 ? (f - 0.88) / 0.12 * 0.3 : 0;
    }
    app.sun.intensity = 0.2 + dayness * 2.0;
    app.hemi.intensity = 0.3 + dayness * 0.7;
    app.ambient.intensity = 0.18 + dayness * 0.25;
    app.sun.color.lerpColors(new THREE.Color('#9db4ff'), new THREE.Color('#fff2d8'), dayness);
    if (sky) {
      sky.material.uniforms.top.value.lerpColors(NIGHT_TOP, DAY_TOP, dayness);
      sky.material.uniforms.bottom.value.lerpColors(NIGHT_BOT, DAY_BOT, dayness);
    }
    if (app.scene.fog) app.scene.fog.color.lerpColors(new THREE.Color('#162036'), new THREE.Color('#bcd0c0'), dayness);
  }

  function hostRp() {
    if (!net || net.isHost) return null;
    let best = null;
    for (const rp of net.remotes.values()) if (!best || rp.peerId < best.peerId) best = rp;
    return best;
  }

  // ================= MULTIPLAYER =================
  function setBotsBenched(on) {
    for (const h of humans) {
      if (!h.bot || !!h.benched === on) continue;
      h.benched = on;
      h.char.group.visible = !on;
      if (on) { h.alive = false; ui.removeBoardRow(h.name); }
      else { h.alive = true; h.downed = false; h.hp = 100; h.char.respawnVisual(); }
    }
    ui.system(on ? 'Fellow survivors arrived — the AI campers stepped aside!' : 'Alone in the woods again... the AI survivors are back.');
    refreshBoard();
  }
  function wolfSnapshot() {
    const ws = [];
    for (const w of wolves) {
      if (!w.alive) continue;
      ws.push([w.nid, Math.round(w.group.position.x * 10) / 10, Math.round(w.group.position.z * 10) / 10,
        Math.round(w.group.rotation.y * 100) / 100, w.scale > 1 ? 1 : 0]);
    }
    return ws;
  }
  function syncProxies(ex) {
    if (!ex) return;
    if (typeof ex.fu === 'number') save.fuel = ex.fu;
    if (typeof ex.ni === 'number' && ex.ni !== lastHostNight) { lastHostNight = ex.ni; save.night = ex.ni; }
    if (ex.ph) save.phase = ex.ph;
    if (!ex.ws) return;
    const seen = new Set();
    for (const [id, x, z, ry, big] of ex.ws) {
      seen.add(id);
      let p = proxies.get(id);
      if (!p) {
        const g = buildWolf(big ? 1.5 : 1);
        g.position.set(x, 0, z);
        scene.add(g);
        p = { proxy: true, id, nid: id, group: g, tx: x, tz: z, ry, alive: true, ctrl: { pos: new THREE.Vector3(x, 0.5, z) }, phase: Math.random() * 6 };
        proxies.set(id, p);
      }
      p.tx = x; p.tz = z; p.ry = ry;
    }
    for (const [id, p] of proxies) if (!seen.has(id)) { scene.remove(p.group); proxies.delete(id); }
  }
  createGameNet({
    scene, ui, gameId: 'nights', user,
    localState: () => ({
      x: player.ctrl.pos.x, y: player.ctrl.pos.y, z: player.ctrl.pos.z,
      ry: player.char.group.rotation.y,
      sp: Math.hypot(player.ctrl.vel.x, player.ctrl.vel.z), gr: player.ctrl.grounded, vy: player.ctrl.vel.y,
      hp: Math.max(player.downed ? 0 : 1, Math.round(player.hp)), mhp: 100,
      stats: { wood: player.wood, kills: player.kills, down: player.downed },
    }),
    onPeersChanged: (count, isHost) => {
      remoteHumans.length = 0;
      for (const [pid, rp] of net.remotes) {
        remoteHumans.push({ remote: true, peerId: pid, name: rp.name, rp, ctrl: rp.ctrl, get alive() { return rp.alive && !rp.stats.down; } });
      }
      setBotsBenched(count > 0);
    },
    topics: {
      feed: (d) => { if (net?.isHost && d) save.fuel = Math.min(100, save.fuel + (d.amt || 12)); },
      whit: (d) => { if (!net?.isHost || !d) return; const w = wolves.find((x) => x.nid === d.id && x.alive); if (w) hitWolf({ isPlayer: false, peerId: d._from }, w, d.dmg || 10); },
      wdeath: (d) => {
        if (!d) return;
        const p = proxies.get(d.id);
        if (p) { scene.remove(p.group); proxies.delete(d.id); sfx.play('growl', { volume: 0.3 }); }
        if (d.by === net?.room?.peerId) { player.kills++; addBlux(1); refreshBoard(); }
      },
      watk: (d) => { if (d && d.to === net?.room?.peerId && player.alive) hurtHuman(player, d.dmg || 14); },
      over: () => { if (!gameOver) endGame(false); },
      win: () => { if (!gameOver) endGame(true); },
    },
  }).then((gn) => {
    net = gn;
    if (net.online) ui.system('🌐 Online — survive the forest together!');
    const origPlay = player.char.playAction.bind(player.char);
    player.char.playAction = (name, dur) => { net.action(name, dur); origPlay(name, dur); };
  });

  // ================= input =================
  const attack = () => swingAxe();
  input.onMouseDown(() => { if (!ui.menuOpen) attack(); });
  if (input.isTouch) input.setFireButton(() => attack());
  function eat() {
    if (player.food <= 0) { ui.system('No food! Pick berries first.'); return; }
    player.food--; player.hunger = Math.min(100, player.hunger + 25);
    player.hp = Math.min(100, player.hp + 8);
    player.char.playAction('eat', 1.2);
    sfx.play('eat'); ui.setHealth(player.hp, 100); updatePills(); refreshBoard();
  }
  input.registerAction({ id: 'eat', label: 'Eat', icon: '🍖', key: 'f', onDown: eat });
  if (!input.isTouch) {
    ui.hotbarSlot('LMB', '🪓', 'Swing', 'swing');
    ui.hotbarSlot('E', '✋', 'Gather', 'gather');
    ui.hotbarSlot('F', '🍖', 'Eat', 'eat');
  }
  app.onChatSend((t) => { chatter.onPlayerMessage(t); net?.sendChat(t); });

  setTimeout(() => humans.filter((h) => h.chat).forEach((h, i) => chatter.botSay(h.chat, 'spawn', {}, 0.7, 0.5 + i * 1.3)), 1000);

  // ================= wolf AI (host) =================
  function wolfThink(w, dt, t) {
    if (!w.alive) return;
    w.retargetT -= dt;
    if (!w.target || !w.target.alive || w.retargetT <= 0) {
      w.retargetT = 1.5 + Math.random();
      let best = null, bd = Infinity;
      for (const tg of wolfTargets()) {
        const d = distXZ(w.ctrl.pos, tg.ctrl.pos);
        if (d < bd) { bd = d; best = tg; }
      }
      // if no one's out, harass the campfire
      w.target = best;
    }
    const fuel = save.fuel;
    const fireR = 7 + fuel / 100 * 12; // bright ward radius
    const distFire = distXZ(w.ctrl.pos, FIRE);
    // burned by a strong fire
    if (distFire < fireR && fuel > 15) {
      w.burnT = (w.burnT || 0) - dt;
      if (w.burnT <= 0) { w.burnT = 0.5; w.hp -= 3 + fuel * 0.04; if (w.hp <= 0) return killWolf(w, null); }
    }
    const tgt = w.target;
    let goal;
    if (tgt) goal = tgt.ctrl.pos;
    else goal = FIRE;
    const d = distXZ(w.ctrl.pos, goal);
    // if fire is strong and target is inside the ward, hang at the edge
    const targetInWard = tgt && distXZ(tgt.ctrl.pos, FIRE) < fireR && fuel > 25;
    if (targetInWard && distFire <= fireR + 1.5) {
      // circle the ward
      const ang = Math.atan2(w.ctrl.pos.z - FIRE.z, w.ctrl.pos.x - FIRE.x) + dt * 0.8;
      const rx = FIRE.x + Math.cos(ang) * (fireR + 1.5), rz = FIRE.z + Math.sin(ang) * (fireR + 1.5);
      w.ctrl.moveDir.set(rx - w.ctrl.pos.x, 0, rz - w.ctrl.pos.z).normalize();
      w.group.rotation.y = Math.atan2(w.ctrl.moveDir.x, w.ctrl.moveDir.z);
    } else if (d > 3) {
      const dx = (goal.x - w.ctrl.pos.x) / d, dz = (goal.z - w.ctrl.pos.z) / d;
      w.ctrl.moveDir.set(dx, 0, dz);
      w.group.rotation.y = Math.atan2(dx, dz);
      if (w.ctrl.grounded && Math.hypot(w.ctrl.vel.x, w.ctrl.vel.z) < w.ctrl.speed * 0.3) w.ctrl.wantJump = true;
    } else {
      w.ctrl.moveDir.set(0, 0, 0);
      if (tgt) {
        w.group.rotation.y = Math.atan2(tgt.ctrl.pos.x - w.ctrl.pos.x, tgt.ctrl.pos.z - w.ctrl.pos.z);
        w.attackT -= dt;
        if (w.attackT <= 0) {
          w.attackT = 1.1;
          setTimeout(() => {
            if (!w.alive || !tgt.alive || distXZ(w.ctrl.pos, tgt.ctrl.pos) >= 4) return;
            if (tgt.remote) net?.sendTopic('watk', { to: tgt.peerId, dmg: 10 + save.night });
            else hurtHuman(tgt, 10 + save.night);
          }, 200);
        }
      }
    }
  }

  // ================= companion AI (day gather / night fight) =================
  function companionThink(h, dt) {
    const ai = h.ai;
    if (!h.alive) return;
    if (h.swingCd > 0) h.swingCd -= dt;
    const night = save.phase === 'night';
    if (night && (wolves.length || proxies.size)) {
      // fight nearest wolf
      const list = wolves.length ? wolves : [...proxies.values()];
      let best = null, bd = Infinity;
      for (const w of list) { if (w.alive === false) continue; const wp = w.ctrl ? w.ctrl.pos : w.group.position; const d = distXZ(h.ctrl.pos, wp); if (d < bd) { bd = d; best = w; } }
      if (best) {
        const wp = best.ctrl ? best.ctrl.pos : best.group.position;
        if (bd > 4) h.bot.seek(wp, { strafe: 0.2 });
        else {
          h.bot.stop(); h.bot.faceToward(wp);
          if (h.swingCd <= 0) { h.swingCd = 0.7; h.char.playAction('slash', 0.4); if (wolves.length) hitWolf(h, best, 12 + ai.skill * 8); }
        }
        return;
      }
      // no wolves near: stay by the fire
      if (h.bot.distTo(FIRE) > 12) h.bot.seek(FIRE, { strafe: 0.2 }); else h.bot.stop();
      return;
    }
    // day: gather wood, feed fire
    ai.chopT -= dt;
    if (!ai.node || ai.node.depleted) {
      const avail = resources.filter((r) => r.type === 'tree' && !r.depleted);
      ai.node = avail.length ? avail[Math.floor(Math.random() * avail.length)] : null;
    }
    if (h.wood >= 3) {
      // return to fire and feed
      if (h.bot.distTo(FIRE) > 4) h.bot.seek(FIRE, { strafe: 0.1 });
      else { h.bot.stop(); h.wood -= 3; save.fuel = Math.min(100, save.fuel + (net && !net.isHost ? 0 : 8)); h.char.playAction('cast', 0.4); if (Math.random() < 0.3 && h.chat) chatter.botSay(h.chat, 'working', {}, 0.5); }
      return;
    }
    if (ai.node) {
      if (h.bot.distTo(ai.node.pos) > 4) h.bot.seek(ai.node.pos, { strafe: 0.1 });
      else {
        h.bot.stop(); h.bot.faceToward(ai.node.pos);
        if (ai.chopT <= 0) {
          ai.chopT = 1.2;
          h.char.playAction('slash', 0.4);
          h.wood += 3;
          ai.node.depleted = true; ai.node.regrow = 22;
          ai.node.group.scale.y = 0.35; ai.node.group.children.forEach((c, i) => { if (i > 0) c.visible = false; });
          ai.node = null;
        }
      }
    } else { if (h.bot.distTo(FIRE) > 10) h.bot.seek(FIRE); else h.bot.stop(); }
  }

  // ================= main loop =================
  const moveTmp = new THREE.Vector3();
  let minuteAcc = 0, pillT = 0, boardT = 0;
  app.onUpdate((dt, t) => {
    chatter.update(dt);

    // ---- clock / phase (host authoritative; solo = host) ----
    if (!net || net.isHost) {
      save.clock += dt;
      const dur = save.phase === 'day' ? DAY_LEN : NIGHT_LEN;
      // fuel burns (faster at night)
      save.fuel = Math.max(0, save.fuel - dt * (save.phase === 'night' ? 2.4 : 0.9));
      if (save.clock >= dur) { save.phase === 'day' ? startNight() : startDay(); }
      // spawn wolves through the night
      if (save.phase === 'night' && !gameOver) {
        if (toSpawnNight > 0) { spawnT -= dt; if (spawnT <= 0 && wolves.filter((w) => w.alive).length < 16) { spawnT = Math.max(0.5, 2.2 - save.night * 0.06); toSpawnNight--; spawnWolf(); } }
      }
    } else {
      // client: read shared state from host
      const ex = hostRp()?.extra;
      if (ex) syncProxies(ex);
    }

    // ---- fire visual scales with fuel ----
    const fuelNow = (net && !net.isHost) ? save.fuel : save.fuel;
    const fscale = 0.25 + fuelNow / 100 * 1.0;
    const flick = 0.85 + Math.sin(t * 14) * 0.08 + Math.random() * 0.06;
    flame.scale.set(fscale * flick, fscale * (0.8 + flick * 0.4), fscale * flick);
    flameCore.scale.setScalar(fscale * flick * 0.9);
    flame.visible = flameCore.visible = fuelNow > 2;
    fireLight.intensity = 6 + fuelNow * 0.5 * flick;
    fireLight.distance = 14 + fuelNow / 100 * 28;

    // ---- needs (local player) ----
    minuteAcc += dt;
    if (minuteAcc >= 1) {
      const m = Math.floor(minuteAcc); minuteAcc -= m;
      player.hunger = Math.max(0, player.hunger - m * 1.1);
      if (player.hunger <= 0 && player.alive) hurtHuman(player, m * 2);
      else if (player.hunger > 55 && player.hp < 100 && player.alive) { player.hp = Math.min(100, player.hp + m * 1.5); player.char.setHealth(player.hp); ui.setHealth(player.hp, 100); }
      // cold damage if the fire is out at night and you're away from it
      if (save.phase === 'night' && fuelNow < 5 && player.alive && distXZ(player.ctrl.pos, FIRE) > 6) hurtHuman(player, m * 1.5);
    }

    // ---- resource regrow ----
    for (const r of resources) {
      if (r.depleted) { r.regrow -= dt; if (r.regrow <= 0) { r.depleted = false; if (r.type === 'tree') { r.group.scale.y = 1; r.group.children.forEach((c) => c.visible = true); } else r.berries.forEach((b) => b.visible = true); } }
    }

    // ---- player movement ----
    if (player.alive && !ui.menuOpen && !busy) {
      app.moveWorld(moveTmp);
      player.ctrl.moveDir.copy(moveTmp);
      if (input.jumpHeld) player.ctrl.wantJump = true;
      if (player.swingCd > 0) player.swingCd -= dt;
      if (moveTmp.lengthSq() > 0.01) {
        const yaw = Math.atan2(moveTmp.x, moveTmp.z);
        let dd = yaw - player.char.group.rotation.y;
        while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2;
        player.char.group.rotation.y += dd * Math.min(1, dt * 12);
      }
    } else player.ctrl.moveDir.set(0, 0, 0);
    player.ctrl.update(dt, world);
    if (player.ctrl.fellOff) player.ctrl.teleport(0, 0.5, 6);
    player.char.group.position.copy(player.ctrl.pos);
    player.char.update(dt, { speed: Math.hypot(player.ctrl.vel.x, player.ctrl.vel.z), grounded: player.ctrl.grounded, velY: player.ctrl.vel.y });

    // ---- companions ----
    for (const h of humans) {
      if (h.benched || h.isPlayer) continue;
      if (h.alive) companionThink(h, dt);
      h.ctrl.update(dt, world);
      if (h.bot) h.bot.syncVisual(dt);
    }

    // ---- wolves (host) ----
    if (!net || net.isHost) {
      for (let i = wolves.length - 1; i >= 0; i--) {
        const w = wolves[i];
        if (!w.alive) { wolves.splice(i, 1); continue; }
        wolfThink(w, dt, t);
        w.ctrl.update(dt, world);
        w.ctrl.pos.x = Math.max(-HB + 2, Math.min(HB - 2, w.ctrl.pos.x));
        w.ctrl.pos.z = Math.max(-HB + 2, Math.min(HB - 2, w.ctrl.pos.z));
        w.group.position.copy(w.ctrl.pos);
        animWolf(w.group, dt, Math.hypot(w.ctrl.vel.x, w.ctrl.vel.z), t + w.phase);
      }
    } else {
      // client: interpolate proxies
      for (const p of proxies.values()) {
        const px = p.ctrl.pos.x, pz = p.ctrl.pos.z;
        p.ctrl.pos.x += (p.tx - px) * Math.min(1, dt * 9);
        p.ctrl.pos.z += (p.tz - pz) * Math.min(1, dt * 9);
        p.group.position.set(p.ctrl.pos.x, 0.5, p.ctrl.pos.z);
        p.group.rotation.y = p.ry;
        animWolf(p.group, dt, Math.hypot(p.ctrl.pos.x - px, p.ctrl.pos.z - pz) / Math.max(dt, 0.001), t + p.phase);
      }
    }

    // ---- net ----
    if (net) {
      if (net.isHost && net.humanCount) net.setExtra({ ws: wolfSnapshot(), fu: Math.round(save.fuel), ni: save.night, ph: save.phase });
      net.tick(dt);
      boardT -= dt;
      if (boardT <= 0 && net.humanCount) { boardT = 0.9; refreshBoard(); }
    }

    dayNightVisual();
    pillT -= dt; if (pillT <= 0) { pillT = 0.5; updatePills(); }
    ui.updatePrompts(dt, camera, player.ctrl.pos, input.keys);
  });

  // debug handle (parallels window.__bvApp / __bvNet) — lets tests drive the
  // day/night phase without waiting out a full real-time cycle.
  if (typeof window !== 'undefined') {
    window.__bvNight = {
      get save() { return save; }, get wolves() { return wolves; },
      get player() { return player; }, startNight, startDay, spawnWolf,
    };
  }

  app.start();
}
