// ============================================================
// WELCOME TO BLOXVILLE — life sim
// Own a plot, keep your needs up, work shifts at Bloxy Burgers,
// furnish your home in Build Mode (auto-saves), and share the
// cul-de-sac with AI neighbors who commute, gossip and visit.
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

const SAVE_KEY = 'bloxverse_bloxburg_v1';
const PLOT = { minX: -26, maxX: 26, minZ: 14, maxZ: 54 };
const HOUSE = { minX: -16, maxX: 16, minZ: 24, maxZ: 46 };

// ---------------- furniture catalog ----------------
const CATALOG = {
  bed: { name: 'Cozy Bed', price: 400, icon: '🛏️', w: 5, d: 7, use: 'sleep' },
  sofa: { name: 'Sofa', price: 350, icon: '🛋️', w: 6, d: 2.6, use: 'sit' },
  table: { name: 'Table', price: 150, icon: '🍽️', w: 5, d: 3 },
  chair: { name: 'Chair', price: 75, icon: '🪑', w: 2, d: 2, use: 'sit' },
  fridge: { name: 'Fridge', price: 500, icon: '🧊', w: 2.6, d: 2.6, use: 'eat' },
  stove: { name: 'Stove', price: 450, icon: '🍳', w: 3, d: 2.6, use: 'cook' },
  counter: { name: 'Counter', price: 200, icon: '🧱', w: 4, d: 2.4 },
  tv: { name: 'Flat TV', price: 600, icon: '📺', w: 5, d: 1.2, use: 'tv' },
  lamp: { name: 'Lamp', price: 120, icon: '💡', w: 1.4, d: 1.4 },
  plant: { name: 'Plant', price: 60, icon: '🪴', w: 1.6, d: 1.6 },
  shower: { name: 'Shower', price: 400, icon: '🚿', w: 3, d: 3, use: 'shower' },
  toilet: { name: 'Toilet', price: 250, icon: '🚽', w: 2, d: 2.6, use: 'toilet' },
  shelf: { name: 'Bookshelf', price: 220, icon: '📚', w: 4, d: 1.4 },
  rug: { name: 'Rug', price: 90, icon: '🟥', w: 6, d: 4 },
};

function buildFurniture(type) {
  const g = new THREE.Group();
  const B = (w, h, d, color, x, y, z, opts) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), W.mat(color, opts));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  switch (type) {
    case 'bed':
      B(5, 1.2, 7, '#8a5c33', 0, 0.6, 0);
      B(4.6, 0.8, 6.2, '#e8ecf2', 0, 1.5, 0.2);
      B(4.2, 0.5, 1.6, '#5aa7e0', 0, 1.9, -2.2);
      B(5, 2.2, 0.4, '#8a5c33', 0, 1.1, 3.35);
      break;
    case 'sofa':
      B(6, 1.4, 2.6, '#b04a4a', 0, 0.7, 0);
      B(6, 1.6, 0.7, '#9c3f3f', 0, 2, -0.95);
      B(0.7, 1, 2.6, '#9c3f3f', -2.65, 1.6, 0);
      B(0.7, 1, 2.6, '#9c3f3f', 2.65, 1.6, 0);
      break;
    case 'table':
      B(5, 0.4, 3, '#9a6b3f', 0, 2.2, 0);
      for (const [x, z] of [[-2.2, -1.2], [2.2, -1.2], [-2.2, 1.2], [2.2, 1.2]]) B(0.4, 2.2, 0.4, '#7b5330', x, 1.1, z);
      break;
    case 'chair':
      B(2, 0.35, 2, '#9a6b3f', 0, 1.5, 0);
      B(2, 2, 0.35, '#9a6b3f', 0, 2.6, -0.85);
      for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) B(0.3, 1.5, 0.3, '#7b5330', x, 0.75, z);
      break;
    case 'fridge':
      B(2.6, 5.6, 2.6, '#dfe4ea', 0, 2.8, 0);
      B(0.25, 1.4, 0.3, '#9aa2ac', 1.1, 3.6, 1.35);
      break;
    case 'stove':
      B(3, 3, 2.6, '#c8cdd4', 0, 1.5, 0);
      B(2.8, 0.2, 2.4, '#2b2e33', 0, 3.05, 0);
      for (const [x, z] of [[-0.7, -0.5], [0.7, -0.5], [-0.7, 0.6], [0.7, 0.6]]) {
        const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10), W.mat('#4a4e55'));
        burner.position.set(x, 3.2, z);
        g.add(burner);
      }
      break;
    case 'counter':
      B(4, 3, 2.4, '#b9c0c9', 0, 1.5, 0);
      B(4.2, 0.3, 2.6, '#8a5c33', 0, 3.1, 0);
      break;
    case 'tv': {
      B(4.6, 0.4, 1.2, '#3a3d42', 0, 2.05, 0);
      B(0.5, 1.4, 0.5, '#3a3d42', 0, 1.2, 0);
      B(5, 2.8, 0.25, '#17181b', 0, 3.9, 0);
      const screen = B(4.6, 2.4, 0.1, '#2f6fb3', 0, 3.9, 0.15, { emissive: '#2f6fb3', emissiveIntensity: 0.8 });
      g.userData.screen = screen;
      break;
    }
    case 'lamp':
      B(1.2, 0.3, 1.2, '#3a3d42', 0, 0.15, 0);
      B(0.25, 3, 0.25, '#3a3d42', 0, 1.6, 0);
      B(1.4, 1.2, 1.4, '#ffe9b0', 0, 3.6, 0, { emissive: '#ffd98a', emissiveIntensity: 0.9 });
      break;
    case 'plant': {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 1, 8), W.mat('#b0603a'));
      pot.position.y = 0.5;
      g.add(pot);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), W.mat('#3f8a3c'));
      bush.position.y = 1.9;
      bush.castShadow = true;
      g.add(bush);
      break;
    }
    case 'shower':
      B(3, 0.3, 3, '#dfe4ea', 0, 0.15, 0);
      B(0.3, 6, 0.3, '#9aa2ac', -1.3, 3, -1.3);
      B(1.2, 0.25, 1.2, '#c8cdd4', -0.8, 5.9, -0.8);
      B(3, 6, 0.15, '#bcd6e8', 0, 3, 1.45, { opacity: 0.35 });
      break;
    case 'toilet':
      B(2, 1.4, 2, '#eef1f5', 0, 0.7, 0.2);
      B(2, 2.4, 0.7, '#eef1f5', 0, 1.6, -0.85);
      break;
    case 'shelf':
      B(4, 5.4, 1.4, '#8a5c33', 0, 2.7, 0);
      for (let i = 0; i < 3; i++) {
        for (let b = 0; b < 4; b++) {
          B(0.5, 1.1, 1, ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad'][(i * 4 + b) % 5], -1.4 + b * 0.9, 1.2 + i * 1.6, 0.1);
        }
      }
      break;
    case 'rug':
      B(6, 0.12, 4, '#b04a4a', 0, 0.06, 0);
      B(5, 0.14, 3, '#d8b45a', 0, 0.07, 0);
      break;
  }
  return g;
}

export default async function launch({ root, user, game }) {
  const app = new GameApp({
    root, title: game.name, gameId: 'bloxburg',
    skyTop: '#7ec8f2', skyBottom: '#ffe8c9',
    shadowArea: 160, camDist: 17,
  });
  const { scene, world, input, ui, camera } = app;
  world.killY = -40;
  let net = null; // multiplayer (wired up further below)

  // ================= save state =================
  let save;
  try { save = JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { save = null; }
  if (!save) {
    save = {
      money: 2500, promo: 0, orders: 0,
      needs: { hunger: 80, energy: 90, fun: 70, hygiene: 85 },
      furniture: [
        { type: 'bed', x: -11, z: 42, rot: 0 },
        { type: 'fridge', x: 13, z: 44, rot: 2 },
        { type: 'stove', x: 9, z: 44, rot: 2 },
        { type: 'counter', x: 13, z: 40, rot: 3 },
        { type: 'sofa', x: -4, z: 28, rot: 0 },
        { type: 'tv', x: -4, z: 36, rot: 2 },
        { type: 'rug', x: -4, z: 32, rot: 0 },
        { type: 'shower', x: 12, z: 28, rot: 0 },
        { type: 'toilet', x: 8, z: 27, rot: 0 },
        { type: 'lamp', x: -14, z: 26, rot: 0 },
        { type: 'plant', x: 14, z: 33, rot: 0 },
      ],
      clock: 8 * 60, day: 1,
    };
  }
  const persist = () => localStorage.setItem(SAVE_KEY, JSON.stringify(save));

  // ================= NEIGHBORHOOD =================
  W.ground(scene, world, 360, W.grassTexture('#5d9e4a', 34));
  // road: straight + cul-de-sac
  W.part(scene, world, { x: -30, y: 0.1, z: 0, w: 200, h: 0.22, d: 14, tex: W.roadTexture(), castShadow: false, collide: false });
  {
    const circle = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 0.22, 28), new THREE.MeshLambertMaterial({ map: W.asphaltTexture(4) }));
    circle.position.set(70, 0.11, 0);
    circle.receiveShadow = true;
    scene.add(circle);
  }
  // sidewalks
  for (const sz of [-9.5, 9.5]) W.part(scene, world, { x: -30, y: 0.14, z: sz, w: 200, h: 0.3, d: 5, color: '#c8cdd4', castShadow: false, collide: false });

  // player plot
  W.part(scene, world, { x: 0, y: 0.16, z: 34, w: 56, h: 0.34, d: 44, tex: W.grassTexture('#6cb457', 10), castShadow: false, collide: false });
  // house floor + walls (front gap door)
  W.part(scene, world, { x: 0, y: 0.3, z: 35, w: 34, h: 0.34, d: 24, tex: W.plankTexture('#a97e4f', 6), castShadow: false, collide: false });
  const wallMat = '#e8e3d8';
  const WALL_H = 9;
  W.part(scene, world, { x: 0, y: WALL_H / 2, z: HOUSE.maxZ, w: 34, h: WALL_H, d: 1, color: wallMat });          // back
  W.part(scene, world, { x: HOUSE.minX, y: WALL_H / 2, z: 35, w: 1, h: WALL_H, d: 24, color: wallMat });          // left
  W.part(scene, world, { x: HOUSE.maxX, y: WALL_H / 2, z: 35, w: 1, h: WALL_H, d: 24, color: wallMat });          // right
  W.part(scene, world, { x: -10.5, y: WALL_H / 2, z: HOUSE.minZ, w: 12, h: WALL_H, d: 1, color: wallMat });       // front-left
  W.part(scene, world, { x: 10.5, y: WALL_H / 2, z: HOUSE.minZ, w: 12, h: WALL_H, d: 1, color: wallMat });        // front-right
  W.part(scene, world, { x: 0, y: WALL_H - 1, z: HOUSE.minZ, w: 10, h: 2, d: 1, color: wallMat });                // door header
  // mailbox
  W.part(scene, world, { x: -20, y: 1.5, z: 13, w: 0.4, h: 3, d: 0.4, color: '#7b5330' });
  W.part(scene, world, { x: -20, y: 3.2, z: 13, w: 1.6, h: 1.2, d: 0.9, color: '#c0392b' });

  // neighbor houses
  function neighborHouse(x, z, color, flip = 1) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(24, 10, 18), new THREE.MeshLambertMaterial({ map: W.windowsTexture(color, 0.5) }));
    body.position.set(0, 5, 0);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(17, 7, 4), W.mat('#8a4a3a'));
    roof.position.set(0, 13.5, 0);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5.5, 0.5), W.mat('#6d4a2f'));
    door.position.set(0, 2.75, 9.2 * flip);
    g.add(door);
    g.position.set(x, 0, z);
    scene.add(g);
    world.addCollider(body);
    return g;
  }
  neighborHouse(-70, 34, '#b8574b', -1);
  neighborHouse(-70, -34, '#4f7ea8', 1);
  neighborHouse(-8, -34, '#7fa05a', 1);
  // trees + lamps
  [[-45, 16], [-100, 20], [-45, -16], [-100, -22], [30, 20], [26, -20], [95, 12], [95, -14]].forEach(([x, z]) => W.tree(scene, world, x, z, 1 + Math.random() * 0.5));
  const lamps = [];
  [[-90, 10], [-40, -10], [8, 10], [52, -12]].forEach(([x, z]) => lamps.push(W.lampPost(scene, world, x, z, false)));

  // Bloxy Burgers
  const BB = { x: 70, z: -40 };
  {
    const shop = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 18), new THREE.MeshLambertMaterial({ map: W.windowsTexture('#d9903f', 0.75) }));
    shop.position.set(BB.x, 4.5, BB.z);
    shop.castShadow = shop.receiveShadow = true;
    scene.add(shop);
    world.addCollider(shop);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(18, 3, 0.6), W.mat('#c0392b', { emissive: '#e74c3c', emissiveIntensity: 0.5 }));
    sign.position.set(BB.x, 10.8, BB.z + 9);
    scene.add(sign);
    // register counter outside (drive-thru style window)
    W.part(scene, world, { x: BB.x - 6, y: 1.6, z: BB.z + 11, w: 8, h: 3.2, d: 2.4, color: '#b9c0c9' });
  }
  const REGISTER = new THREE.Vector3(BB.x - 6, 0.3, BB.z + 15);
  const cloudTick = W.clouds(scene, 9, 500, 100);
  app.onUpdate(cloudTick);

  // ================= characters =================
  const chatter = new ChatterManager(ui, user.name);
  chatter.idleSituation = 'idle';

  const playerChar = new R15Character({ name: user.name, avatar: user.avatar, nameTagColor: '#ffffff' });
  scene.add(playerChar.group);
  const ctrl = new CharController({ speed: 16 });
  ctrl.teleport(0, 0.5, 6);
  app.followTarget = playerChar.group;
  chatter.playerChar = playerChar;

  const personas = pickBots(4);
  const HOMES = [new THREE.Vector3(-70, 0.3, 22), new THREE.Vector3(-70, 0.3, -22), new THREE.Vector3(-8, 0.3, -22), new THREE.Vector3(40, 0.3, 14)];
  const neighbors = personas.map((p, i) => {
    const b = new BotBase(p, { ctrl: { speed: 12 } });
    scene.add(b.char.group);
    b.ctrl.teleport(HOMES[i].x, 0.5, HOMES[i].z);
    b.home = HOMES[i];
    b.state = 'wander';
    b.stateT = Math.random() * 5;
    b.dest = null;
    b.chat = chatter.register(p.name, b.brain, b.char);
    return b;
  });

  // ================= HUD: needs / money / clock =================
  const needIcons = { hunger: '🍔', energy: '⚡', fun: '🎉', hygiene: '🧼' };
  function fmtClock() {
    const h = Math.floor(save.clock / 60) % 24, m = Math.floor(save.clock % 60);
    const ap = h >= 12 ? 'PM' : 'AM';
    const hh = ((h + 11) % 12) + 1;
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
  }
  function updatePills() {
    ui.setPills([
      { icon: '💵', value: `$${Math.floor(save.money).toLocaleString()}` },
      { icon: '🕐', value: fmtClock(), label: `Day ${save.day}` },
      ...Object.entries(save.needs).map(([k, v]) => ({
        icon: needIcons[k], value: Math.floor(v),
        color: v < 25 ? '#f74d59' : undefined,
      })),
    ]);
  }
  updatePills();
  ui.setBoard(['$$$']);
  const refreshBoard = () => {
    ui.board(user.name, ['$' + Math.floor(save.money).toLocaleString()], { isPlayer: true, color: '#fff' });
    neighbors.forEach((n, i) => ui.board(n.name, ['$' + (1200 + i * 730).toLocaleString()]));
    if (net) for (const rp of net.remotes.values()) {
      ui.board(rp.name, ['$' + (rp.stats.money ?? 0).toLocaleString()], { color: '#8fd3ff' });
    }
  };
  refreshBoard();
  ui.setHealth(100, 100);
  ui.el.hpText.textContent = 'Bloxville Resident';
  ui.system('Welcome to Bloxville! Keep your needs up, work at Bloxy Burgers, and press B to build.');

  function pay(amount, at) {
    save.money += amount;
    if (amount > 0) sfx.play('cash');
    ui.popup(camera, at || playerChar.group.position.clone().add(new THREE.Vector3(0, 6, 0)), `${amount >= 0 ? '+' : '-'}$${Math.abs(amount)}`, amount >= 0 ? '#7ddf8a' : '#f74d59', 16);
    updatePills(); refreshBoard(); persist();
  }

  // ================= needs =================
  const DECAY = { hunger: 0.55, energy: 0.35, fun: 0.5, hygiene: 0.4 }; // per game-minute
  let lowWarned = {};
  function needTick(gameMinutes) {
    for (const k in save.needs) {
      save.needs[k] = Math.max(0, save.needs[k] - DECAY[k] * gameMinutes);
      if (save.needs[k] < 20 && !lowWarned[k]) {
        lowWarned[k] = true;
        ui.system(`Your ${k} is getting low!`);
        sfx.play('error', { volume: 0.4 });
      }
      if (save.needs[k] > 40) lowWarned[k] = false;
    }
  }
  function boost(k, amt) {
    save.needs[k] = Math.min(100, save.needs[k] + amt);
    updatePills(); persist();
  }
  const moodPenalty = () => Object.values(save.needs).filter((v) => v < 15).length;

  // ================= furniture placement =================
  const placed = []; // {type, x, z, rot, group, col}
  function placeItem(item, silent = false) {
    const def = CATALOG[item.type];
    const g = buildFurniture(item.type);
    g.position.set(item.x, 0.47, item.z);
    g.rotation.y = item.rot * Math.PI / 2;
    scene.add(g);
    let col = null;
    if (item.type !== 'rug') {
      const w = item.rot % 2 === 0 ? def.w : def.d;
      const d = item.rot % 2 === 0 ? def.d : def.w;
      col = world.addBox3(new THREE.Box3(
        new THREE.Vector3(item.x - w / 2, 0, item.z - d / 2),
        new THREE.Vector3(item.x + w / 2, 3, item.z + d / 2)));
    }
    const rec = { ...item, group: g, col };
    placed.push(rec);
    if (!silent) { sfx.play('place'); persist(); }
    return rec;
  }
  function removeItem(rec, refund) {
    scene.remove(rec.group);
    if (rec.col) world.remove(rec.col);
    placed.splice(placed.indexOf(rec), 1);
    save.furniture = save.furniture.filter((f) => f !== rec.data);
    if (refund) pay(Math.floor(CATALOG[rec.type].price / 2), rec.group.position.clone().add(new THREE.Vector3(0, 5, 0)));
    rebuildPrompts();
    persist();
  }
  save.furniture.forEach((f) => { const rec = placeItem(f, true); rec.data = f; });

  // ---------------- interactions ----------------
  let busy = false;
  function doTimed(seconds, label, done) {
    if (busy) return;
    busy = true;
    ui.announce(label, '', seconds);
    setTimeout(() => { busy = false; done(); }, seconds * 1000);
  }
  const interactions = {
    eat: (rec) => ({
      text: 'Eat Snack ($15)', hold: 0, fn: () => {
        if (save.money < 15) return ui.system('Not enough money!');
        pay(-15); sfx.play('eat');
        playerChar.playAction('eat', 1.4);
        boost('hunger', 35);
      },
    }),
    cook: (rec) => ({
      text: 'Cook Meal ($30)', hold: 1.2, fn: () => {
        if (save.money < 30) return ui.system('Not enough money!');
        pay(-30); sfx.play('eat');
        doTimed(2.5, 'Cooking... 🍳', () => { boost('hunger', 75); boost('fun', 10); ui.system('Delicious!'); });
      },
    }),
    sleep: (rec) => ({
      text: 'Sleep until morning', hold: 1.2, fn: () => {
        sfx.play('sleep');
        playerChar.setEmote('sleep');
        ui.tint('#000814', 0.85);
        doTimed(2.5, '💤 Sleeping...', () => {
          playerChar.setEmote(null);
          ui.tint('#000814', 0);
          const mins = save.clock;
          save.clock = 7 * 60;
          if (mins > 7 * 60) save.day++;
          boost('energy', 100);
          boost('hunger', -10);
          ui.announce(`Day ${save.day}`, 'Rise and shine!', 2.5);
          updatePills(); persist();
        });
      },
    }),
    shower: (rec) => ({
      text: 'Take Shower', hold: 1.2, fn: () => {
        sfx.play('shower');
        doTimed(2.2, '🚿 Showering...', () => boost('hygiene', 100));
        app.burst(rec.group.position.clone().add(new THREE.Vector3(0, 5, 0)), { color: '#9fd8f0', count: 22, speed: 8, size: 0.2, life: 1, gravity: 30 });
      },
    }),
    tv: (rec) => ({
      text: 'Watch TV', hold: 0, fn: () => {
        doTimed(2.2, '📺 Watching Blox shows...', () => boost('fun', 45));
      },
    }),
    sit: (rec) => ({ text: 'Sit', hold: 0, fn: () => { boost('fun', 8); boost('energy', 6); } }),
    toilet: (rec) => ({ text: 'Use Toilet', hold: 0, fn: () => { boost('hygiene', 12); sfx.play('click'); } }),
  };
  let prompts = [];
  function rebuildPrompts() {
    prompts.forEach((p) => ui.removePrompt(p));
    prompts = [];
    for (const rec of placed) {
      const use = CATALOG[rec.type].use;
      if (!use || !interactions[use]) continue;
      const info = interactions[use](rec);
      prompts.push(ui.addPrompt({
        getPos: () => rec.group.position.clone().add(new THREE.Vector3(0, 4, 0)),
        text: info.text, key: 'E', radius: 7, hold: info.hold,
        onTrigger: () => { if (!buildMode) info.fn(); },
      }));
    }
  }
  rebuildPrompts();

  // ================= Bloxy Burgers job =================
  const ORDER_ITEMS = ['🍔', '🍟', '🥤', '🍕', '🍦'];
  let shiftOn = false;
  let order = [], orderIdx = 0;
  const jobUI = document.createElement('div');
  jobUI.className = 'hud-panel';
  jobUI.style.cssText = `position:absolute;left:50%;top:56%;transform:translateX(-50%);display:none;flex-direction:column;align-items:center;gap:10px;background:rgba(16,18,20,.82);padding:16px 20px;border-radius:14px;border:1px solid rgba(255,255,255,.25);z-index:40`;
  jobUI.innerHTML = `<div style="font-weight:900;font-size:15px">🍔 Bloxy Burgers — Order Up!</div>
    <div id="jobOrder" style="font-size:30px;letter-spacing:8px"></div>
    <div id="jobBtns" style="display:flex;gap:8px"></div>
    <button id="jobQuit" style="background:#f74d59;border:none;color:#fff;font-weight:800;border-radius:8px;padding:7px 16px;cursor:pointer">End Shift</button>`;
  ui.hud.appendChild(jobUI);
  const jobOrderEl = jobUI.querySelector('#jobOrder');
  const jobBtnsEl = jobUI.querySelector('#jobBtns');
  ORDER_ITEMS.forEach((it) => {
    const b = document.createElement('button');
    b.textContent = it;
    b.style.cssText = 'font-size:26px;width:54px;height:54px;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);cursor:pointer';
    b.addEventListener('click', () => tapIngredient(it));
    jobBtnsEl.appendChild(b);
  });
  jobUI.querySelector('#jobQuit').addEventListener('click', endShift);

  function newOrder() {
    order = Array.from({ length: 3 + Math.min(2, Math.floor(save.promo / 2)) }, () => ORDER_ITEMS[Math.floor(Math.random() * ORDER_ITEMS.length)]);
    orderIdx = 0;
    renderOrder();
  }
  function renderOrder() {
    jobOrderEl.innerHTML = order.map((it, i) =>
      `<span style="opacity:${i < orderIdx ? 0.25 : 1}">${it}</span>`).join('');
  }
  function tapIngredient(it) {
    if (!shiftOn) return;
    if (it === order[orderIdx]) {
      orderIdx++;
      sfx.play('tick');
      renderOrder();
      if (orderIdx >= order.length) {
        const wage = 35 + save.promo * 10;
        save.orders++;
        pay(wage, playerChar.group.position.clone().add(new THREE.Vector3(0, 7, 0)));
        boost('fun', -3); boost('energy', -4);
        if (save.orders % 5 === 0) {
          save.promo++;
          addBlux(20);
          sfx.play('win');
          ui.announce('PROMOTED! 🎉', `You are now level ${save.promo} — wage $${35 + save.promo * 10}/order (+20 Blux)`, 3.2);
          neighbors.forEach((n, i) => { if (Math.random() < 0.4) chatter.botSay(n.chat, 'praise', { player: user.name }, 0.8, 1 + i); });
        }
        persist();
        setTimeout(newOrder, 350);
      }
    } else {
      sfx.play('error');
      orderIdx = 0;
      renderOrder();
    }
  }
  function startShift() {
    if (buildMode) return;
    shiftOn = true;
    jobUI.style.display = 'flex';
    newOrder();
    chatter.botSay(neighbors[0].chat, 'working', {}, 0.4, 2);
  }
  function endShift() {
    shiftOn = false;
    jobUI.style.display = 'none';
  }
  prompts.push(ui.addPrompt({
    getPos: () => new THREE.Vector3(REGISTER.x, 5, REGISTER.z - 2),
    text: 'Work at Bloxy Burgers', key: 'E', radius: 9, hold: 0.8,
    onTrigger: startShift,
  }));

  // ================= build mode =================
  let buildMode = false;
  let ghost = null, ghostType = null, ghostRot = 0;
  const buildBar = document.createElement('div');
  buildBar.className = 'hud-panel';
  buildBar.style.cssText = `position:absolute;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:none;gap:6px;background:rgba(16,18,20,.85);padding:10px;border-radius:14px;border:1px solid rgba(255,255,255,.25);z-index:40;max-width:94vw;overflow-x:auto`;
  ui.hud.appendChild(buildBar);
  for (const [type, def] of Object.entries(CATALOG)) {
    const b = document.createElement('button');
    b.innerHTML = `<div style="font-size:20px">${def.icon}</div><div style="font-size:9px;font-weight:800">${def.name}</div><div style="font-size:9px;color:#7ddf8a;font-weight:800">$${def.price}</div>`;
    b.style.cssText = 'min-width:62px;padding:6px 4px;border-radius:9px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;flex-shrink:0';
    b.addEventListener('click', () => selectGhost(type));
    buildBar.appendChild(b);
  }
  const buildHint = document.createElement('div');
  buildHint.style.cssText = 'position:absolute;top:52px;left:50%;transform:translateX(-50%);background:rgba(16,18,20,.7);padding:7px 14px;border-radius:9px;font-size:12px;font-weight:700;display:none;z-index:40;text-align:center';
  ui.hud.appendChild(buildHint);

  function selectGhost(type) {
    clearGhost();
    ghostType = type;
    ghost = buildFurniture(type);
    ghost.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.6; } });
    scene.add(ghost);
  }
  function clearGhost() {
    if (ghost) scene.remove(ghost);
    ghost = null; ghostType = null;
  }
  function setBuildMode(on) {
    buildMode = on;
    buildBar.style.display = on ? 'flex' : 'none';
    buildHint.style.display = on ? 'block' : 'none';
    buildHint.innerHTML = input.isTouch
      ? 'BUILD MODE — pick an item, tap your plot to place. Tap furniture to sell (50%).'
      : 'BUILD MODE — pick an item, click your plot to place. <b>R</b> rotates. Click furniture to sell (50%). <b>B</b> to exit.';
    if (!on) clearGhost();
    sfx.play('click');
  }
  input.registerAction({ id: 'build', label: 'Build', icon: '🔨', key: 'b', onDown: () => setBuildMode(!buildMode) });
  input.registerAction({ id: 'rotate', label: 'Rotate', icon: '↻', key: 'r', onDown: () => { if (buildMode) { ghostRot = (ghostRot + 1) % 4; sfx.play('rotate'); } } });
  if (!input.isTouch) {
    ui.hotbarSlot('B', '🔨', 'Build', 'build');
    ui.hotbarSlot('R', '↻', 'Rotate', 'rotate');
    ui.hotbarSlot('E', '👆', 'Interact', 'interact');
  }

  // pointer tracking for placement
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const plotPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
  root.addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  });
  function ghostAt() {
    raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plotPlane, hit)) return null;
    hit.x = Math.round(hit.x / 2) * 2;
    hit.z = Math.round(hit.z / 2) * 2;
    if (hit.x < PLOT.minX || hit.x > PLOT.maxX || hit.z < PLOT.minZ || hit.z > PLOT.maxZ) return null;
    return hit;
  }
  root.addEventListener('pointerdown', (e) => {
    if (!buildMode || ui.menuOpen) return;
    if (e.target.closest('.hud-panel') || e.target.closest('.hud-clickable') || e.target.closest('button')) return;
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    // sell tap: check placed items first
    raycaster.setFromCamera(pointer, camera);
    const meshes = [];
    placed.forEach((rec) => rec.group.traverse((m) => { if (m.isMesh) { m.userData.rec = rec; meshes.push(m); } }));
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length && !ghostType) {
      const rec = hits[0].object.userData.rec;
      removeItem(rec, true);
      sfx.play('sell');
      return;
    }
    // place ghost
    if (ghostType) {
      const at = ghostAt();
      if (!at) return;
      const def = CATALOG[ghostType];
      if (save.money < def.price) { ui.system('Not enough money!'); sfx.play('error'); return; }
      pay(-def.price);
      const data = { type: ghostType, x: at.x, z: at.z, rot: ghostRot };
      save.furniture.push(data);
      const rec = placeItem(data);
      rec.data = data;
      rebuildPrompts();
    }
  });

  // ================= neighbors AI =================
  const PLAZA = new THREE.Vector3(70, 0.3, 0);
  function neighborThink(n, dt, hour) {
    n.stateT -= dt;
    const inState = (s) => n.state === s;
    // decide state by time of day
    let want;
    if (hour >= 22 || hour < 7) want = 'sleep';
    else if (hour >= 9 && hour < 17) want = n === neighbors[0] || n === neighbors[1] ? 'work' : 'wander';
    else want = Math.random() < 0.003 ? 'visit' : (inState('visit') ? 'visit' : 'wander');
    if (want !== n.state && !(want === 'wander' && inState('visit') && n.stateT > 0)) {
      n.state = want;
      n.stateT = 20 + Math.random() * 30;
      if (want === 'visit' && Math.random() < 0.8) chatter.botSay(n.chat, 'visit', {}, 0.7, 3 + Math.random() * 3);
      if (want === 'work' && Math.random() < 0.5) chatter.botSay(n.chat, 'working', {}, 0.5, 2 + Math.random() * 4);
    }
    switch (n.state) {
      case 'sleep':
        if (n.distTo(n.home) > 3) { n.char.setEmote(null); n.seek(n.home); }
        else { n.stop(); n.char.setEmote('sleep'); }
        break;
      case 'work': {
        n.char.setEmote(null);
        const spot = new THREE.Vector3(BB.x - 10 + neighbors.indexOf(n) * 5, 0.3, BB.z + 14);
        if (n.distTo(spot) > 2.5) n.seek(spot);
        else { n.stop(); n.faceToward(new THREE.Vector3(BB.x, 0, BB.z)); }
        break;
      }
      case 'visit': {
        n.char.setEmote(null);
        if (!n.dest || n.stateT <= 0 || n.distTo(n.dest) < 2) {
          n.dest = new THREE.Vector3(
            PLOT.minX + 6 + Math.random() * (PLOT.maxX - PLOT.minX - 12), 0.3,
            PLOT.minZ + 2 + Math.random() * 16);
          if (n.stateT <= 0) { n.state = 'wander'; }
        }
        if (n.dest) n.seek(n.dest);
        break;
      }
      default: { // wander
        n.char.setEmote(null);
        if (!n.dest || n.distTo(n.dest) < 2.5) {
          const spots = [PLAZA, n.home, new THREE.Vector3(-60 + Math.random() * 120, 0.3, (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 8))];
          n.dest = spots[Math.floor(Math.random() * spots.length)].clone();
        }
        n.seek(n.dest);
        // occasionally dance near the player
        if (distXZ(n.ctrl.pos, ctrl.pos) < 12 && Math.random() < dt * 0.02) {
          n.char.setEmote('dance');
          setTimeout(() => n.char.setEmote(null), 4000);
        }
      }
    }
  }

  // ================= day/night =================
  const sky = scene.getObjectByName('sky');
  const DAY_TOP = new THREE.Color('#7ec8f2'), DAY_BOT = new THREE.Color('#ffe8c9');
  const NIGHT_TOP = new THREE.Color('#0d1330'), NIGHT_BOT = new THREE.Color('#2b3557');
  let lampsOn = false;
  function daylightTick() {
    const h = (save.clock / 60) % 24;
    // 0 = midnight, 1 = noon brightness
    const dayness = Math.max(0, Math.min(1, (Math.cos((h - 12) / 24 * Math.PI * 2) + 0.6) / 1.4));
    app.sun.intensity = 0.15 + dayness * 2.1;
    app.hemi.intensity = 0.25 + dayness * 0.8;
    app.ambient.intensity = 0.18 + dayness * 0.25;
    const ang = ((h - 6) / 12) * Math.PI;
    app.sun.position.set(Math.cos(ang) * 100, Math.max(8, Math.sin(ang) * 120), 40);
    if (sky) {
      sky.material.uniforms.top.value.lerpColors(NIGHT_TOP, DAY_TOP, dayness);
      sky.material.uniforms.bottom.value.lerpColors(NIGHT_BOT, DAY_BOT, dayness);
    }
    const wantLamps = dayness < 0.35;
    if (wantLamps !== lampsOn) {
      lampsOn = wantLamps;
      lamps.forEach((l) => {
        l.bulb.material = W.mat('#fff2c0', wantLamps ? { emissive: '#ffdf8a', emissiveIntensity: 1.5 } : {});
        if (!l.light && wantLamps) {
          l.light = new THREE.PointLight(0xffdf8a, 26, 20, 1.8);
          l.light.position.copy(l.group.position).add(new THREE.Vector3(1.8, 8.3, 0));
          scene.add(l.light);
        } else if (l.light) { l.light.visible = wantLamps; }
      });
    }
  }

  app.onChatSend((t) => { chatter.onPlayerMessage(t); net?.sendChat(t); });

  // ================= MULTIPLAYER =================
  // Friends stroll the same neighborhood: shared presence avatars + chat.
  // Houses stay personal (saved per account); AI neighbors remain — they're
  // ambient scenery, so everyone keeping their own is harmless.
  createGameNet({
    scene, ui, gameId: 'bloxburg', user,
    localState: () => ({
      x: ctrl.pos.x, y: ctrl.pos.y, z: ctrl.pos.z,
      ry: playerChar.group.rotation.y,
      sp: Math.hypot(ctrl.vel.x, ctrl.vel.z), gr: ctrl.grounded, vy: ctrl.vel.y,
      hp: 100, stats: { money: Math.floor(save.money) },
    }),
    onPeersChanged: () => refreshBoard(),
  }).then((gn) => {
    net = gn;
    if (net.online) ui.system('🌐 Online — your friends can visit Bloxville too!');
  });

  setTimeout(() => {
    neighbors.slice(0, 2).forEach((n, i) => chatter.botSay(n.chat, 'spawn', {}, 0.8, 0.6 + i * 1.7));
  }, 1200);

  // ================= main loop =================
  const moveTmp = new THREE.Vector3();
  let minuteAcc = 0, pillT = 0;
  app.onUpdate((dt) => {
    chatter.update(dt);
    // clock: 1 real second = 1 game minute
    minuteAcc += dt;
    if (minuteAcc >= 1) {
      const mins = Math.floor(minuteAcc);
      minuteAcc -= mins;
      save.clock += mins;
      if (save.clock >= 24 * 60) { save.clock -= 24 * 60; save.day++; ui.announce(`Day ${save.day}`, '', 2); persist(); }
      needTick(mins);
    }
    pillT -= dt;
    if (pillT <= 0) { pillT = 1; updatePills(); }
    daylightTick();

    // player movement
    if (!ui.menuOpen && !busy) {
      app.moveWorld(moveTmp);
      const penal = moodPenalty();
      ctrl.speed = 16 - penal * 3;
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
    if (ctrl.fellOff) ctrl.teleport(0, 0.5, 6);
    playerChar.group.position.copy(ctrl.pos);
    playerChar.update(dt, { speed: Math.hypot(ctrl.vel.x, ctrl.vel.z), grounded: ctrl.grounded, velY: ctrl.vel.y });

    // auto-close shift if player walks away
    if (shiftOn && distXZ(ctrl.pos, REGISTER) > 14) endShift();

    // neighbors
    const hour = (save.clock / 60) % 24;
    for (const n of neighbors) {
      neighborThink(n, dt, hour);
      n.ctrl.update(dt, world);
      if (n.ctrl.fellOff) n.ctrl.teleport(n.home.x, 0.5, n.home.z);
      n.syncVisual(dt);
    }

    // ghost preview follows pointer
    if (buildMode && ghost) {
      const at = ghostAt();
      if (at) {
        ghost.visible = true;
        ghost.position.set(at.x, 0.47, at.z);
        ghost.rotation.y = ghostRot * Math.PI / 2;
      } else ghost.visible = false;
    }

    // multiplayer: interpolate visiting friends + publish our stroll
    net?.tick(dt);

    ui.updatePrompts(dt, camera, ctrl.pos, input.keys);
  });

  app.start();
}
