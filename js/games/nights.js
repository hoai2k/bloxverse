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

// ---------------- monster models ----------------
const glowEye = (c) => new THREE.MeshBasicMaterial({ color: c });

function buildWolf() {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: '#3a3f47' });
  const dark = new THREE.MeshLambertMaterial({ color: '#22262c' });
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
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.12), glowEye('#ffe24a'));
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
  return g;
}

function buildSpider() {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: '#16181f' });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), dark);
  body.position.set(0, 1.5, -0.4); body.scale.set(1, 0.85, 1.3); body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 6), dark);
  head.position.set(0, 1.45, 1.0); g.add(head);
  for (const [ex, ey] of [[-0.22, 0.12], [0.22, 0.12], [-0.38, -0.05], [0.38, -0.05]]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), glowEye('#ff3030'));
    eye.position.set(ex, 1.55 + ey, 1.5); g.add(eye);
  }
  const legs = [];
  let li = 0;
  for (const side of [-1, 1]) for (const zoff of [-0.7, -0.2, 0.3, 0.8]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.6, 1.55, zoff); g.add(hip);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1.9), dark);
    seg.position.set(side * 0.95, -0.1, 0); seg.rotation.z = side * 0.55; seg.rotation.y = Math.PI / 2; hip.add(seg);
    legs.push({ hip, ph: li * 0.55 }); li++;
  }
  g.userData.legs = legs; g.userData.crawl = true;
  return g;
}

function buildBear() {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: '#523721' });
  const dark = new THREE.MeshLambertMaterial({ color: '#332315' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.3, 4.2), fur);
  body.position.y = 2.7; body.castShadow = true; g.add(body);
  const hump = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 2.0), fur);
  hump.position.set(0, 3.9, -0.6); g.add(hump);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.7, 1.8), fur);
  head.position.set(0, 3.1, 2.7); g.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 0.9), dark);
  snout.position.set(0, 2.8, 3.5); g.add(snout);
  for (const sx of [-0.62, 0.62]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.35), fur);
    ear.position.set(sx, 4.0, 2.4); g.add(ear);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.12), glowEye('#ffb020'));
    eye.position.set(sx * 0.5, 3.3, 3.45); g.add(eye);
  }
  const legs = [];
  for (const [lx, lz, ph] of [[-0.95, -1.5, 0], [0.95, -1.5, Math.PI], [-0.95, 1.5, Math.PI], [0.95, 1.5, 0]]) {
    const hip = new THREE.Group();
    hip.position.set(lx, 2.1, lz); g.add(hip);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.2, 0.85), dark);
    leg.position.y = -1.1; leg.castShadow = true; hip.add(leg);
    legs.push({ hip, ph });
  }
  g.userData.legs = legs;
  return g;
}

// The boss: a towering mossy Forest Giant with real telegraphed smashes.
function buildGiant() {
  const g = new THREE.Group();
  const moss = new THREE.MeshLambertMaterial({ color: '#3c5738' });
  const bark = new THREE.MeshLambertMaterial({ color: '#4f3a20' });
  const dark = new THREE.MeshLambertMaterial({ color: '#26301f' });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(4.6, 5.6, 3.2), moss);
  torso.position.y = 9.0; torso.castShadow = true; g.add(torso);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.0, 2.9), bark);
  belly.position.y = 7.0; g.add(belly);
  const head = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.8, 2.8), moss);
  head.position.y = 13.2; g.add(head);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.2), dark);
  jaw.position.set(0, 12.1, 0.5); g.add(jaw);
  for (const sx of [-0.75, 0.75]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.2), glowEye('#ff2020'));
    eye.position.set(sx, 13.5, 1.45); g.add(eye);
  }
  for (const sx of [-1.1, 1.1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.38, 2.8, 5), bark);
    horn.position.set(sx, 15.2, 0); horn.rotation.z = sx > 0 ? -0.45 : 0.45; g.add(horn);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(side * 2.9, 11.2, 0); g.add(sh);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 5.2, 1.5), moss);
    arm.position.y = -2.4; arm.castShadow = true; sh.add(arm);
    const fist = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.8, 2.0), bark);
    fist.position.y = -5.1; sh.add(fist);
    arms.push({ sh, side });
  }
  const legs = [];
  for (const [lx, ph] of [[-1.3, 0], [1.3, Math.PI]]) {
    const hip = new THREE.Group();
    hip.position.set(lx, 6.2, 0); g.add(hip);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.7, 6.4, 1.7), moss);
    leg.position.y = -3.2; leg.castShadow = true; hip.add(leg);
    legs.push({ hip, ph });
  }
  g.userData.legs = legs; g.userData.arms = arms; g.userData.giant = true;
  return g;
}

// stats per monster type. ward=true: the campfire hurts/repels it.
const MOB_TYPES = {
  wolf:   { idx: 0, hp: 30,  speed: 11.5, dmg: 9,  reach: 4,  scale: 1,    pts: 1,  ward: true,  build: buildWolf,   chest: 2.4, height: 3 },
  spider: { idx: 1, hp: 15,  speed: 16,   dmg: 6,  reach: 3.4, scale: 0.9, pts: 1,  ward: true,  build: buildSpider, chest: 1.7, height: 2.5 },
  bear:   { idx: 2, hp: 95,  speed: 8.5,  dmg: 24, reach: 5,  scale: 1,    pts: 3,  ward: false, build: buildBear,   chest: 3.2, height: 4 },
  giant:  { idx: 3, hp: 620, speed: 6,    dmg: 48, reach: 8,  scale: 1,    pts: 20, ward: false, boss: true, build: buildGiant, chest: 9, height: 15 },
};
const MOB_BY_IDX = ['wolf', 'spider', 'bear', 'giant'];

function animMob(g, dt, speed, t) {
  const amp = Math.min(g.userData.giant ? 0.5 : 0.85, speed * 0.06);
  if (g.userData.legs) for (const l of g.userData.legs) l.hip.rotation.x = Math.sin(t * (g.userData.giant ? 4 : g.userData.crawl ? 13 : 10) + l.ph) * amp;
  if (g.userData.arms) {
    // giant idle arm sway; smash overrides via userData.smash (0..1)
    const sm = g.userData.smash || 0;
    for (const a of g.userData.arms) a.sh.rotation.x = -Math.sin(t * 4 + (a.side > 0 ? Math.PI : 0)) * amp * 0.6 - sm * 2.4;
  }
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

  const MAP = 340;   // half-extent of the playable forest (much bigger now)

  // ================= FOREST MAP =================
  W.ground(scene, world, MAP * 2 + 120, W.grassTexture('#4a8a3e', 70));
  const cloudTick = W.clouds(scene, 12, 700, 110);
  app.onUpdate(cloudTick);
  // a red "blood moon" that only shows on boss nights
  const bloodMoon = new THREE.Mesh(new THREE.SphereGeometry(26, 20, 16),
    new THREE.MeshBasicMaterial({ color: '#b83030' }));
  bloodMoon.position.set(180, 220, -320); bloodMoon.visible = false; scene.add(bloodMoon);
  const bloodGlow = new THREE.PointLight(0xff3a2a, 0, 500, 1.2);
  bloodGlow.position.set(120, 180, -220); scene.add(bloodGlow);

  // ---- camp clearing (dirt) ----
  {
    const clearing = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 0.2, 40),
      new THREE.MeshLambertMaterial({ map: W.grassTexture('#6a5334', 10) }));
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
  const rand = (a, b) => a + Math.random() * (b - a);
  function scatterPos(minR, maxR) {
    const a = Math.random() * Math.PI * 2, r = rand(minR, maxR);
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  const box = (x, y, z, w, h, d, mat, opts) => W.part(scene, world, { x, y, z, w, h, d, mat, ...(opts || {}) });
  const plank = (c, r = 2) => new THREE.MeshLambertMaterial({ map: W.plankTexture(c, r) });

  // ---------------- camp structures ----------------
  function buildCabin(x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const wallMat = plank('#7a5230', 3), roofMat = plank('#5a3d22', 2);
    const wall = (wx, wy, wz, ww, wh, wd) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), wallMat);
      m.position.set(wx, wy, wz); m.castShadow = m.receiveShadow = true; g.add(m);
      const wp = new THREE.Vector3(x + wx * Math.cos(ry) + wz * Math.sin(ry), 0, z - wx * Math.sin(ry) + wz * Math.cos(ry));
      world.addBox3(new THREE.Box3(new THREE.Vector3(wp.x - Math.max(ww, wd) / 2, 0, wp.z - Math.max(ww, wd) / 2), new THREE.Vector3(wp.x + Math.max(ww, wd) / 2, wy + wh / 2, wp.z + Math.max(ww, wd) / 2)));
    };
    wall(0, 3, -5, 12, 6, 0.6);             // back
    wall(-6, 3, 0, 0.6, 6, 10);             // left
    wall(6, 3, 0, 0.6, 6, 10);              // right
    wall(-4, 3, 5, 4, 6, 0.6);              // front-left
    wall(4, 3, 5, 4, 6, 0.6);               // front-right
    const roof = new THREE.Mesh(new THREE.ConeGeometry(10, 4, 4), roofMat);
    roof.position.set(0, 8, 0); roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5, 0.3), W.mat('#3a2714'));
    door.position.set(0, 2.5, 5); g.add(door);
    // warm window glow (lit at night)
    const win = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.2), new THREE.MeshLambertMaterial({ color: '#ffcf6b', emissive: '#ffb347', emissiveIntensity: 0.7 }));
    win.position.set(-4.5, 3.5, 5.05); g.add(win); g.userData.win = win;
    return g;
  }
  function buildTent(x, z, col) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const canvas = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 4), W.mat(col));
    canvas.position.y = 1.7; canvas.rotation.y = Math.PI / 4; canvas.castShadow = true; g.add(canvas);
    world.addBox3(new THREE.Box3(new THREE.Vector3(x - 2, 0, z - 2), new THREE.Vector3(x + 2, 3, z + 2)));
    return g;
  }
  function buildWatchtower(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const wood = plank('#6a4a2a', 2);
    for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 10, 0.5), wood);
      leg.position.set(lx, 5, lz); leg.castShadow = true; g.add(leg);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 6), wood); deck.position.y = 10; g.add(deck);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.6, 4), plank('#5a3d22', 1)); roof.position.y = 13; roof.rotation.y = Math.PI / 4; g.add(roof);
    const lantern = new THREE.PointLight(0xffd27a, 12, 30, 1.5); lantern.position.set(0, 11, 0); g.add(lantern);
    world.addBox3(new THREE.Box3(new THREE.Vector3(x - 2.4, 0, z - 2.4), new THREE.Vector3(x + 2.4, 10, z + 2.4)));
    return g;
  }
  function buildWell(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.6, 12), W.mat('#8a8f96'));
    ring.position.y = 0.8; ring.castShadow = true; g.add(ring);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.3, 12), W.mat('#111417'));
    hole.position.y = 1.55; g.add(hole);
    for (const sx of [-1.8, 1.8]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, 0.3), W.mat('#6a4526')); post.position.set(sx, 2.5, 0); g.add(post); }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), plank('#5a3d22', 1)); roof.position.y = 4.6; roof.rotation.y = Math.PI / 4; g.add(roof);
    world.addBox3(new THREE.Box3(new THREE.Vector3(x - 1.9, 0, z - 1.9), new THREE.Vector3(x + 1.9, 1.6, z + 1.9)));
    return g;
  }
  function buildFenceArc(cx, cz, radius, a0, a1, n) {
    const wood = plank('#5a3f24', 1);
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      const px = cx + Math.cos(a) * radius, pz = cz + Math.sin(a) * radius;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.4), wood);
      post.position.set(px, 1.5, pz); post.castShadow = true; scene.add(post);
      // sharpened top
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 4), wood); spike.position.set(px, 3.2, pz); scene.add(spike);
      world.addBox3(new THREE.Box3(new THREE.Vector3(px - 0.5, 0, pz - 0.5), new THREE.Vector3(px + 0.5, 3, pz + 0.5)));
    }
  }
  function buildRuin(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rand(0, 6.28); scene.add(g);
    const stone = plank('#5c5348', 2);
    const seg = (sx, sy, sz, sw, sh, sd) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), stone); m.position.set(sx, sy, sz); m.rotation.z = rand(-0.1, 0.1); m.castShadow = true; g.add(m); };
    seg(0, 2, -4, 9, 4, 0.7); seg(-4, 1.4, 0, 0.7, 2.8, 8); seg(4, 2.6, 1, 0.7, 5, 5);
    world.addBox3(new THREE.Box3(new THREE.Vector3(x - 5, 0, z - 5), new THREE.Vector3(x + 5, 4, z + 5)));
    return g;
  }
  function buildGraves(x, z) {
    for (let i = 0; i < 6; i++) {
      const gx = x + rand(-6, 6), gz = z + rand(-6, 6);
      const stone = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 0.3), W.mat('#6b7078'));
      stone.position.set(gx, 0.8, gz); stone.rotation.y = rand(0, 6.28); stone.rotation.z = rand(-0.15, 0.15); stone.castShadow = true; scene.add(stone);
    }
  }
  function buildCrate(x, z) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), plank('#8a6a3a', 1));
    c.position.set(x, 1.2, z); c.castShadow = true; scene.add(c);
    world.addBox3(new THREE.Box3(new THREE.Vector3(x - 1.3, 0, z - 1.3), new THREE.Vector3(x + 1.3, 2.4, z + 1.3)));
    return c;
  }

  // ---- place the camp around the fire ----
  const cabin = buildCabin(-16, -14, 0.6);
  buildTent(14, -12, '#8a5a3a'); buildTent(18, -6, '#5a6a8a');
  const tower = buildWatchtower(16, 14);
  buildWell(-14, 14);
  buildFenceArc(0, 0, 20, Math.PI * 0.15, Math.PI * 0.85, 12);
  buildFenceArc(0, 0, 20, Math.PI * 1.15, Math.PI * 1.85, 12);
  buildCrate(6, -10); buildCrate(-8, 8);

  // ---- forest: dense scatter across the big map ----
  for (let i = 0; i < 78; i++) {
    const p = scatterPos(26, MAP - 30);
    const g = buildTree(p.x, p.z);
    resources.push({ type: 'tree', group: g, pos: p.clone(), depleted: false, regrow: 0 });
  }
  for (let i = 0; i < 34; i++) {
    const p = scatterPos(24, MAP - 30);
    const bb = buildBush(p.x, p.z);
    resources.push({ type: 'bush', group: bb.g, berries: bb.berries, pos: p.clone(), depleted: false, regrow: 0 });
  }
  // a darker deep-woods cluster on the north side (denser, spookier)
  for (let i = 0; i < 40; i++) {
    const p = new THREE.Vector3(rand(-90, 90), 0, rand(-MAP + 40, -140));
    buildTree(p.x, p.z);
  }
  // scenery rocks
  for (let i = 0; i < 26; i++) {
    const p = scatterPos(24, MAP - 20);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1, 3)), W.mat('#7c828a'));
    rock.position.set(p.x, 0.5, p.z); rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); rock.castShadow = true; scene.add(rock);
    world.addBox3(new THREE.Box3(new THREE.Vector3(p.x - 1.6, 0, p.z - 1.6), new THREE.Vector3(p.x + 1.6, 2.2, p.z + 1.6)));
  }
  // scary landmarks out in the woods
  buildRuin(-120, -90); buildRuin(140, 60);
  buildGraves(90, -150); buildGraves(-160, 40);
  buildCrate(120, -120); buildCrate(-140, 130);

  // dense boundary tree wall + invisible fence
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    buildTree(Math.cos(a) * (MAP + 8) + rand(-8, 8), Math.sin(a) * (MAP + 8) + rand(-8, 8));
  }
  const HB = MAP;
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

  // ================= monsters (host-authoritative) =================
  const wolves = []; // holds ALL mobs (wolves, spiders, bears, the giant)
  function spawnMob(typeId) {
    const T = MOB_TYPES[typeId];
    const g = T.build();
    g.scale.setScalar(T.scale);
    // spawn from the treeline — the boss lumbers in closer so it reaches camp
    const edge = T.boss ? scatterPos(MAP * 0.22, MAP * 0.34) : scatterPos(MAP * 0.32, MAP * 0.58);
    g.position.set(edge.x, 0, edge.z);
    scene.add(g);
    const hpMul = T.boss ? (1 + save.night * 0.03) : (1 + save.night * 0.06);
    const ctrl = new CharController({ speed: (T.speed + save.night * 0.18), halfW: T.chest * 0.5, height: T.height });
    ctrl.teleport(edge.x, 0.6, edge.z);
    const w = {
      id: 'w' + nextId++, nid: wseq++, group: g, ctrl, typeId, type: T, boss: !!T.boss,
      hp: T.hp * hpMul, maxHp: T.hp * hpMul,
      alive: true, attackT: 0, target: null, retargetT: 0, phase: Math.random() * 6, smashT: 0,
    };
    wolves.push(w);
    return w;
  }
  function pickMobType(night) {
    const r = Math.random();
    if (night >= 3 && r < 0.1 + night * 0.012) return 'bear';
    if (r < 0.42) return 'spider';
    return 'wolf';
  }
  const isBossNight = (n) => n > 0 && (n % 5 === 0 || n === WIN_NIGHT);
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
    sfx.play(w.boss ? 'explosion' : 'growl', { volume: w.boss ? 0.7 : 0.3 });
    if (w.boss) { app.burst(w.group.position.clone().add(new THREE.Vector3(0, 8, 0)), { color: '#ff5b3a', count: 40, speed: 26, size: 0.5, life: 1.2 }); ui.announce('THE GIANT FALLS!', '', 3); }
    const pts = w.type?.pts || 1;
    net?.sendTopic('wdeath', { id: w.nid, by: h?.isPlayer ? net?.room?.peerId : (h?.peerId || null), pts, boss: !!w.boss });
    if (h) { h.kills += pts; if (h.isPlayer) addBlux(w.boss ? 25 : 1); }
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
  const NIGHT_TOP = new THREE.Color('#05070f'), NIGHT_BOT = new THREE.Color('#1a2138');
  const BOSS_TOP = new THREE.Color('#1a0608'), BOSS_BOT = new THREE.Color('#3a1418');
  let toSpawnNight = 0, spawnT = 0, bossNight = false;
  function setBloodMoon(on) {
    bloodMoon.visible = on;
    bossNight = on;
  }
  function startNight() {
    save.phase = 'night'; save.clock = 0;
    save.night++;
    toSpawnNight = 4 + save.night * 2;
    spawnT = 1.2;
    const boss = isBossNight(save.night);
    setBloodMoon(boss);
    sfx.play('wave');
    // distant howls set the mood
    setTimeout(() => sfx.play('growl', { volume: 0.5 }), 400);
    setTimeout(() => sfx.play('growl', { volume: 0.35 }), 1400);
    if (boss) {
      ui.announce(`NIGHT ${save.night} — BLOOD MOON`, 'A Forest Giant stirs. Run, or fight.', 4.5);
      spawnMob('giant');
      sfx.play('awaken', { volume: 0.6 });
    } else {
      ui.announce(`NIGHT ${save.night}`, 'They\'re coming — keep the fire lit!', 3);
    }
    humans.filter((h) => h.chat && !h.benched).forEach((h, i) => chatter.botSay(h.chat, 'wave', { wave: save.night }, 0.5, 0.8 + i));
    updatePills();
  }
  function startDay() {
    const survived = save.night;
    save.phase = 'day'; save.clock = 0;
    setBloodMoon(false);
    // clear leftover mobs at dawn
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
  function dayNightVisual(dt) {
    // dayness 1 during day, 0 at deep night, with dawn/dusk transitions
    let dayness;
    if (save.phase === 'day') {
      const f = save.clock / DAY_LEN;
      dayness = f < 0.15 ? 0.25 + f / 0.15 * 0.75 : f > 0.85 ? 1 - (f - 0.85) / 0.15 * 0.75 : 1;
    } else {
      const f = save.clock / NIGHT_LEN;
      dayness = f < 0.12 ? 0.25 - f / 0.12 * 0.25 : f > 0.88 ? (f - 0.88) / 0.12 * 0.25 : 0;
    }
    // nights are darker now (scarier) and boss nights redder
    app.sun.intensity = 0.08 + dayness * 2.1;
    app.hemi.intensity = 0.16 + dayness * 0.8;
    app.ambient.intensity = 0.1 + dayness * 0.3;
    app.sun.color.lerpColors(new THREE.Color(bossNight ? '#ff5a4a' : '#8faaff'), new THREE.Color('#fff2d8'), dayness);
    const nTop = bossNight ? BOSS_TOP : NIGHT_TOP, nBot = bossNight ? BOSS_BOT : NIGHT_BOT;
    if (sky) {
      sky.material.uniforms.top.value.lerpColors(nTop, DAY_TOP, dayness);
      sky.material.uniforms.bottom.value.lerpColors(nBot, DAY_BOT, dayness);
    }
    if (app.scene.fog) {
      // fog closes in at night — you can't see what's coming
      app.scene.fog.near = 30 + dayness * 60;
      app.scene.fog.far = 70 + dayness * 240;
      app.scene.fog.color.lerpColors(new THREE.Color(bossNight ? '#1a0a0c' : '#0c1120'), new THREE.Color('#bcd0c0'), dayness);
    }
    bloodGlow.intensity = bloodMoon.visible ? (1 - dayness) * 60 : 0;
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
        Math.round(w.group.rotation.y * 100) / 100, w.type.idx]);
    }
    return ws;
  }
  function syncProxies(ex) {
    if (!ex) return;
    if (typeof ex.fu === 'number') save.fuel = ex.fu;
    if (typeof ex.ni === 'number' && ex.ni !== lastHostNight) { lastHostNight = ex.ni; save.night = ex.ni; }
    if (ex.ph) save.phase = ex.ph;
    if (ex.boss !== undefined) setBloodMoon(!!ex.boss);
    if (!ex.ws) return;
    const seen = new Set();
    for (const [id, x, z, ry, idx] of ex.ws) {
      seen.add(id);
      let p = proxies.get(id);
      if (!p) {
        const T = MOB_TYPES[MOB_BY_IDX[idx] || 'wolf'];
        const g = T.build(); g.scale.setScalar(T.scale);
        g.position.set(x, 0, z);
        scene.add(g);
        p = { proxy: true, id, nid: id, group: g, type: T, tx: x, tz: z, ry, alive: true, ctrl: { pos: new THREE.Vector3(x, 0.5, z) }, phase: Math.random() * 6 };
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
        if (p) { scene.remove(p.group); proxies.delete(d.id); sfx.play(d.boss ? 'explosion' : 'growl', { volume: d.boss ? 0.6 : 0.3 }); }
        if (d.by === net?.room?.peerId) { player.kills += (d.pts || 1); addBlux(d.boss ? 25 : 1); refreshBoard(); }
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

  // ================= monster AI (host) =================
  function mobThink(w, dt, t) {
    if (!w.alive) return;
    const T = w.type;
    w.retargetT -= dt;
    if (!w.target || !w.target.alive || w.retargetT <= 0) {
      w.retargetT = 1.5 + Math.random();
      let best = null, bd = Infinity;
      for (const tg of wolfTargets()) {
        const d = distXZ(w.ctrl.pos, tg.ctrl.pos);
        if (d < bd) { bd = d; best = tg; }
      }
      w.target = best; // no one out -> harass the campfire
    }
    const fuel = save.fuel;
    const fireR = 6 + fuel / 100 * 12;
    const distFire = distXZ(w.ctrl.pos, FIRE);
    // only fire-fearing mobs (wolves/spiders) get burned by a strong fire
    if (T.ward && distFire < fireR && fuel > 15) {
      w.burnT = (w.burnT || 0) - dt;
      if (w.burnT <= 0) { w.burnT = 0.5; w.hp -= 3 + fuel * 0.04; if (w.hp <= 0) return killWolf(w, null); }
    }
    // ---- boss smash windup (raises arms, then AoE slam) ----
    if (w.smashT > 0) {
      w.smashT -= dt;
      w.group.userData.smash = Math.min(1, (0.65 - w.smashT) / 0.65);
      w.ctrl.moveDir.set(0, 0, 0);
      if (w.smashT <= 0) {
        w.group.userData.smash = 0;
        app.ring(new THREE.Vector3(w.ctrl.pos.x, 0.3, w.ctrl.pos.z), { color: '#ff5b3a', maxR: T.reach * 1.7, life: 0.5 });
        app.burst(w.ctrl.pos.clone().add(new THREE.Vector3(0, 1, 0)), { color: '#caa06a', count: 18, speed: 20, size: 0.4, life: 0.5 });
        sfx.play('explosion', { volume: 0.6 });
        for (const tg2 of wolfTargets()) {
          if (distXZ(w.ctrl.pos, tg2.ctrl.pos) < T.reach * 1.6) {
            if (tg2.remote) net?.sendTopic('watk', { to: tg2.peerId, dmg: T.dmg });
            else hurtHuman(tg2, T.dmg);
          }
        }
        if (distXZ(w.ctrl.pos, player.ctrl.pos) < 34) app.screenShake(1.1);
        w.attackT = 2.4;
      }
      return;
    }
    const tgt = w.target;
    const goal = tgt ? tgt.ctrl.pos : FIRE;
    const d = distXZ(w.ctrl.pos, goal);
    const targetInWard = T.ward && tgt && distXZ(tgt.ctrl.pos, FIRE) < fireR && fuel > 25;
    if (targetInWard && distFire <= fireR + 2) {
      // circle the ward, waiting for prey to step into the dark
      const ang = Math.atan2(w.ctrl.pos.z - FIRE.z, w.ctrl.pos.x - FIRE.x) + dt * 0.8;
      const rx = FIRE.x + Math.cos(ang) * (fireR + 2), rz = FIRE.z + Math.sin(ang) * (fireR + 2);
      w.ctrl.moveDir.set(rx - w.ctrl.pos.x, 0, rz - w.ctrl.pos.z).normalize();
      w.group.rotation.y = Math.atan2(w.ctrl.moveDir.x, w.ctrl.moveDir.z);
    } else if (d > T.reach) {
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
          if (w.boss) { w.smashT = 0.65; }   // begin the telegraphed slam
          else {
            w.attackT = 1.1;
            setTimeout(() => {
              if (!w.alive || !tgt.alive || distXZ(w.ctrl.pos, tgt.ctrl.pos) >= T.reach + 0.8) return;
              if (tgt.remote) net?.sendTopic('watk', { to: tgt.peerId, dmg: T.dmg });
              else hurtHuman(tgt, T.dmg);
            }, 200);
          }
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
      // spawn the horde through the night (bigger map holds more)
      if (save.phase === 'night' && !gameOver) {
        if (toSpawnNight > 0) { spawnT -= dt; if (spawnT <= 0 && wolves.filter((w) => w.alive).length < 22) { spawnT = Math.max(0.45, 2.0 - save.night * 0.06); toSpawnNight--; spawnMob(pickMobType(save.night)); } }
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

    // ---- monsters (host) ----
    if (!net || net.isHost) {
      for (let i = wolves.length - 1; i >= 0; i--) {
        const w = wolves[i];
        if (!w.alive) { wolves.splice(i, 1); continue; }
        mobThink(w, dt, t);
        w.ctrl.update(dt, world);
        w.ctrl.pos.x = Math.max(-HB + 2, Math.min(HB - 2, w.ctrl.pos.x));
        w.ctrl.pos.z = Math.max(-HB + 2, Math.min(HB - 2, w.ctrl.pos.z));
        w.group.position.copy(w.ctrl.pos);
        animMob(w.group, dt, Math.hypot(w.ctrl.vel.x, w.ctrl.vel.z), t + w.phase);
      }
    } else {
      // client: interpolate monster proxies
      for (const p of proxies.values()) {
        const px = p.ctrl.pos.x, pz = p.ctrl.pos.z;
        p.ctrl.pos.x += (p.tx - px) * Math.min(1, dt * 9);
        p.ctrl.pos.z += (p.tz - pz) * Math.min(1, dt * 9);
        p.group.position.set(p.ctrl.pos.x, 0.5, p.ctrl.pos.z);
        p.group.rotation.y = p.ry;
        animMob(p.group, dt, Math.hypot(p.ctrl.pos.x - px, p.ctrl.pos.z - pz) / Math.max(dt, 0.001), t + p.phase);
      }
    }

    // ---- net ----
    if (net) {
      if (net.isHost && net.humanCount) net.setExtra({ ws: wolfSnapshot(), fu: Math.round(save.fuel), ni: save.night, ph: save.phase, boss: bossNight });
      net.tick(dt);
      boardT -= dt;
      if (boardT <= 0 && net.humanCount) { boardT = 0.9; refreshBoard(); }
    }

    dayNightVisual(dt);
    pillT -= dt; if (pillT <= 0) { pillT = 0.5; updatePills(); }
    ui.updatePrompts(dt, camera, player.ctrl.pos, input.keys);
  });

  // debug handle (parallels window.__bvApp / __bvNet) — lets tests drive the
  // day/night phase without waiting out a full real-time cycle.
  if (typeof window !== 'undefined') {
    window.__bvNight = {
      get save() { return save; }, get wolves() { return wolves; },
      get player() { return player; }, startNight, startDay, spawnMob,
    };
  }

  app.start();
}
