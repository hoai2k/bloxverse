// Entities: mobs (AI + procedural models), items, XP orbs, projectiles, TNT, falling blocks, particles, spawning.
import { THREE } from './renderer.js';
import { BLOCKS, B, isSoil } from './blocks.js';
import { I, getItem, resolveId, isBlockItem, maxStack, makeStack } from './items.js';
import { moveEntity, GRAVITY, fluidState, intersectsSolid } from './physics.js';
import { CY, CX, CZ } from './chunk.js';
import { tileFor, tileUV, faceTexName, ATLAS_TILES, generateTile } from './textures.js';

let uid = 1;
const texCache = new Map();
const matCache = new Map();
function colorMat(c) { const k = 'c' + c; if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color: c })); return matCache.get(k); }
function faceTex(key, painter) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = 16; c.height = 16; const ctx = c.getContext('2d'); painter(ctx);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; texCache.set(key, t); return t;
}
function hexStr(c) { return '#' + c.toString(16).padStart(6, '0'); }
// Box part: colors {all|side,top,bottom,front}, optional front painter for face features
function box(w, h, d, colors, frontKey, painter, noise = true) {
  const g = new THREE.BoxGeometry(w, h, d);
  const side = colors.side ?? colors.all, top = colors.top ?? side, bottom = colors.bottom ?? shadeHex(side, 0.7), front = colors.front ?? side;
  let frontMat;
  if (painter) frontMat = new THREE.MeshLambertMaterial({ map: faceTex(frontKey, (ctx) => { ctx.fillStyle = hexStr(front); ctx.fillRect(0, 0, 16, 16); if (noise) speckle(ctx, 0.15); painter(ctx); }) });
  else frontMat = colorMat(front);
  const mats = [colorMat(side), colorMat(side), colorMat(top), colorMat(bottom), colorMat(side), frontMat];
  const m = new THREE.Mesh(g, mats); return m;
}
function speckle(ctx, a) { for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * a})`; ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1); } }
function shadeHex(c, k) { const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k); return (r << 16) | (g << 8) | b; }
function eyes(ctx, color = '#000', white = null, y = 5, dx = 3) { if (white) { ctx.fillStyle = white; ctx.fillRect(dx, y, 4, 2); ctx.fillRect(16 - dx - 4, y, 4, 2); } ctx.fillStyle = color; ctx.fillRect(dx + (white ? 2 : 0), y, 2, 2); ctx.fillRect(16 - dx - 2 - (white ? 2 : 0), y, 2, 2); }

// ---------- models ----------
// A model is a group with named parts used for animation: head, body, legs[], arms[]
function humanoid(colors, opts = {}) {
  const g = new THREE.Group(); const s = 1 / 16;
  const head = box(8 * s, 8 * s, 8 * s, { all: colors.skin, top: colors.hair ?? colors.skin }, opts.key + '_head', opts.face); head.position.y = 24 * s + 4 * s; g.add(head);
  const body = box(8 * s, 12 * s, 4 * s, { all: colors.shirt }, opts.key + '_body', opts.bodyFace); body.position.y = 18 * s; g.add(body);
  const armC = colors.sleeve ?? colors.skin;
  const arms = [], legs = [];
  for (const sgn of [-1, 1]) {
    const arm = box(4 * s, 12 * s, 4 * s, { all: armC }); const pivot = new THREE.Group(); pivot.position.set(sgn * 6 * s, 24 * s, 0); arm.position.y = -6 * s; pivot.add(arm); g.add(pivot); arms.push(pivot);
    const leg = box(4 * s, 12 * s, 4 * s, { all: colors.pants }); const lp = new THREE.Group(); lp.position.set(sgn * 2 * s, 12 * s, 0); leg.position.y = -6 * s; lp.add(leg); g.add(lp); legs.push(lp);
  }
  g.userData = { head, body, arms, legs, zombieArms: opts.zombieArms };
  return g;
}
function quadruped(colors, opts) {
  const g = new THREE.Group(); const s = 1 / 16; const bw = opts.bw || 8, bh = opts.bh || 10, bl = opts.bl || 16, lh = opts.lh || 12, hw = opts.hw || 8;
  const body = box(bw * s, bh * s, bl * s, { all: colors.body, top: colors.top ?? colors.body }); body.position.set(0, (lh + bh / 2) * s, 0); g.add(body);
  const head = box(hw * s, (opts.hh || 8) * s, (opts.hd || 6) * s, { all: colors.head ?? colors.body, front: colors.face ?? colors.head ?? colors.body }, opts.key + '_head', opts.face); head.position.set(0, (lh + bh - 1) * s, -(bl / 2 + (opts.hd || 6) / 2 - 1) * s); g.add(head);
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = box(4 * s, lh * s, 4 * s, { all: colors.legs ?? colors.body }); const p = new THREE.Group(); p.position.set(sx * (bw / 2 - 2) * s, lh * s, sz * (bl / 2 - 2) * s); leg.position.y = -lh / 2 * s; p.add(leg); g.add(p); legs.push(p); }
  if (opts.horns) for (const sx of [-1, 1]) { const horn = box(1 * s, 3 * s, 1 * s, { all: 0xd8d0c0 }); horn.position.set(sx * 4 * s, 3 * s, 0); head.add(horn); }
  if (opts.wool) { const w = box((bw + 2) * s, (bh + 2) * s, (bl + 2) * s, { all: colors.wool }); w.position.copy(body.position); g.add(w); g.userData.wool = w; }
  if (opts.snout) { const sn = box(4 * s, 3 * s, 2 * s, { all: colors.snout }); sn.position.set(0, -2 * s, -4 * s); head.add(sn); }
  if (opts.tail) { const t = box(2 * s, 2 * s, 6 * s, { all: colors.body }); t.position.set(0, (lh + bh - 2) * s, (bl / 2 + 2) * s); g.add(t); }
  if (opts.mane) { const m = box(2 * s, 6 * s, 8 * s, { all: colors.mane }); m.position.set(0, 3 * s, 3 * s); head.add(m); }
  Object.assign(g.userData, { head, body, legs, arms: [] });
  return g;
}
function chickenModel(key) {
  const g = new THREE.Group(); const s = 1 / 16;
  const body = box(6 * s, 6 * s, 8 * s, { all: 0xf0f0f0 }); body.position.y = 8 * s; g.add(body);
  const head = box(4 * s, 6 * s, 3 * s, { all: 0xf0f0f0 }, key + '_head', (ctx) => { eyes(ctx, '#000', null, 4, 4); ctx.fillStyle = '#e0a020'; ctx.fillRect(6, 8, 4, 3); ctx.fillStyle = '#c03030'; ctx.fillRect(7, 11, 2, 3); }); head.position.set(0, 12 * s, -4 * s); g.add(head);
  const legs = []; for (const sx of [-1, 1]) { const l = box(1 * s, 5 * s, 3 * s, { all: 0xe0a020 }); const p = new THREE.Group(); p.position.set(sx * 1.5 * s, 5 * s, 1 * s); l.position.y = -2.5 * s; p.add(l); g.add(p); legs.push(p); }
  const arms = []; for (const sx of [-1, 1]) { const w = box(1 * s, 4 * s, 6 * s, { all: 0xe8e8e8 }); const p = new THREE.Group(); p.position.set(sx * 3.5 * s, 11 * s, 0); w.position.y = -2 * s; p.add(w); g.add(p); arms.push(p); }
  g.userData = { head, body, legs, arms }; return g;
}
function spiderModel(key, color = 0x2a1f1a, eye = '#c02020') {
  const g = new THREE.Group(); const s = 1 / 16;
  const body = box(10 * s, 8 * s, 12 * s, { all: color }); body.position.set(0, 7 * s, 4 * s); g.add(body);
  const head = box(8 * s, 8 * s, 8 * s, { all: color }, key + '_head', (ctx) => { ctx.fillStyle = eye; ctx.fillRect(3, 4, 2, 2); ctx.fillRect(11, 4, 2, 2); ctx.fillRect(6, 6, 1, 1); ctx.fillRect(9, 6, 1, 1); ctx.fillRect(5, 3, 1, 1); ctx.fillRect(10, 3, 1, 1); }); head.position.set(0, 7 * s, -5 * s); g.add(head);
  const legs = []; for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { const l = box(16 * s, 2 * s, 2 * s, { all: color }); const p = new THREE.Group(); p.position.set(sx * 4 * s, 7 * s, (i * 3 - 3) * s); l.position.x = sx * 8 * s; p.rotation.z = sx * 0.6; p.rotation.y = (i - 1.5) * 0.3; p.add(l); g.add(p); legs.push(p); }
  g.userData = { head, body, legs, arms: [] }; return g;
}
function slimeModel(size) { const g = new THREE.Group(); const c = box(size * 0.8 * 1.0, size * 0.8, size * 0.8, { all: 0x6fc26f }, 'slime', (ctx) => { eyes(ctx, '#111', null, 6, 3); ctx.fillStyle = '#111'; ctx.fillRect(7, 9, 2, 1); }); c.position.y = size * 0.4; c.material.forEach && 0; g.add(c); const inner = new THREE.Mesh(new THREE.BoxGeometry(size * 0.6, size * 0.6, size * 0.6), new THREE.MeshLambertMaterial({ color: 0x9fe09f })); inner.position.y = size * 0.4; g.add(inner); g.userData = { head: null, body: c, legs: [], arms: [] }; return g; }
function ghastModel() { const g = new THREE.Group(); const b = box(4, 4, 4, { all: 0xf4f4f4 }, 'ghast', (ctx) => { ctx.fillStyle = '#222'; ctx.fillRect(3, 6, 3, 2); ctx.fillRect(10, 6, 3, 2); ctx.fillRect(5, 10, 6, 2); ctx.fillStyle = '#888'; ctx.fillRect(3, 6, 1, 1); ctx.fillRect(10, 6, 1, 1); }); b.position.y = 2; g.add(b); const legs = []; for (let i = 0; i < 9; i++) { const t = box(0.3, 1.6, 0.3, { all: 0xe8e8e8 }); const p = new THREE.Group(); p.position.set((i % 3 - 1) * 1.2, 0.2, (Math.floor(i / 3) - 1) * 1.2); t.position.y = -0.8; p.add(t); g.add(p); legs.push(p); } g.userData = { head: b, body: b, legs, arms: [] }; return g; }
function dragonModel() {
  const g = new THREE.Group();
  const body = box(3, 2, 6, { all: 0x1c1c22 }); g.add(body);
  const head = box(2, 1.6, 2.6, { all: 0x1c1c22 }, 'dragon_head', (ctx) => { ctx.fillStyle = '#c040e0'; ctx.fillRect(2, 5, 3, 3); ctx.fillRect(11, 5, 3, 3); ctx.fillStyle = '#888'; ctx.fillRect(4, 12, 8, 2); }); head.position.set(0, 0.5, -4.2); g.add(head);
  const wings = []; for (const sx of [-1, 1]) { const w = box(8, 0.2, 4, { all: 0x2a2530 }); const p = new THREE.Group(); p.position.set(sx * 1.5, 0.8, 0); w.position.x = sx * 4; p.add(w); g.add(p); wings.push(p); }
  const tail = []; let prev = body; for (let i = 0; i < 5; i++) { const t = box(1.2 - i * 0.15, 1.2 - i * 0.15, 2, { all: 0x1c1c22 }); t.position.set(0, 0, 3 + i * 2); g.add(t); tail.push(t); }
  g.userData = { head, body, legs: [], arms: wings, tail }; return g;
}
function blazeModel() { const g = new THREE.Group(); const h = box(0.5, 0.5, 0.5, { all: 0xf0b030 }, 'blaze', (ctx) => { ctx.fillStyle = '#301000'; ctx.fillRect(4, 5, 3, 2); ctx.fillRect(9, 5, 3, 2); }); h.position.y = 1.5; g.add(h); const legs = []; for (let i = 0; i < 8; i++) { const r = box(0.2, 0.7, 0.2, { all: 0xe0a020 }); const p = new THREE.Group(); p.position.y = 0.6 + (i % 2) * 0.5; r.position.x = 0.6; p.rotation.y = i * Math.PI / 4; p.add(r); g.add(p); legs.push(p); } g.userData = { head: h, body: h, legs, arms: [] }; return g; }
function beeModel() { const g = new THREE.Group(); const s = 1 / 16; const b = box(7 * s, 7 * s, 10 * s, { all: 0xe8c030 }, 'bee', (ctx) => { eyes(ctx, '#111', null, 5, 3); }); b.position.y = 4 * s; g.add(b); const arms = []; for (const sx of [-1, 1]) { const w = box(6 * s, 1 * s, 4 * s, { all: 0xd0e0ff }); const p = new THREE.Group(); p.position.set(sx * 3 * s, 8 * s, 0); w.position.x = sx * 3 * s; p.add(w); g.add(p); arms.push(p); } g.userData = { head: b, body: b, legs: [], arms }; return g; }
function phantomModel() { const g = new THREE.Group(); const b = box(0.6, 0.4, 1.4, { all: 0x3a4a6a }, 'phantom', (ctx) => { ctx.fillStyle = '#40e040'; ctx.fillRect(4, 6, 2, 2); ctx.fillRect(10, 6, 2, 2); }); b.position.y = 0.5; g.add(b); const arms = []; for (const sx of [-1, 1]) { const w = box(1.6, 0.1, 0.9, { all: 0x2e3a55 }); const p = new THREE.Group(); p.position.set(sx * 0.3, 0.6, 0); w.position.x = sx * 0.8; p.add(w); g.add(p); arms.push(p); } g.userData = { head: b, body: b, legs: [], arms }; return g; }

const MOBS = {
  zombie: { w: 0.6, h: 1.95, health: 20, speed: 2.3, hostile: true, damage: 3, sound: 'zombie', xp: 5, burns: true, drops: [['rotten_flesh', 0, 2, 1], ['iron_ingot', 1, 1, 0.03], ['carrot', 1, 1, 0.03], ['potato', 1, 1, 0.03]],
    model: (k) => humanoid({ skin: 0x4a7a3a, shirt: 0x2a8f9a, pants: 0x3d3a8f, sleeve: 0x4a7a3a }, { key: k, face: (ctx) => eyes(ctx, '#111', null, 5, 3), zombieArms: true }) },
  husk: { w: 0.6, h: 1.95, health: 20, speed: 2.2, hostile: true, damage: 3, sound: 'zombie', xp: 5, drops: [['rotten_flesh', 0, 2, 1]],
    model: (k) => humanoid({ skin: 0x9a8a5a, shirt: 0x7a6a4a, pants: 0x5a5040, sleeve: 0x9a8a5a }, { key: k, face: (ctx) => eyes(ctx, '#222', null, 5, 3), zombieArms: true }) },
  drowned: { w: 0.6, h: 1.95, health: 20, speed: 2.2, hostile: true, damage: 3, sound: 'zombie', xp: 5, drops: [['rotten_flesh', 0, 2, 1], ['gold_ingot', 1, 1, 0.05]], aquatic: true,
    model: (k) => humanoid({ skin: 0x5a8a8a, shirt: 0x2a5a6a, pants: 0x1a3a4a, sleeve: 0x5a8a8a }, { key: k, face: (ctx) => eyes(ctx, '#20e0e0', null, 5, 3), zombieArms: true }) },
  skeleton: { w: 0.6, h: 1.99, health: 20, speed: 2.4, hostile: true, damage: 2, ranged: true, keepDistance: 7, sound: 'skeleton', xp: 5, burns: true, drops: [['bone', 0, 2, 1], ['arrow', 0, 2, 1], ['bow', 1, 1, 0.08]],
    model: (k) => humanoid({ skin: 0xd8d8d8, shirt: 0xc8c8c8, pants: 0xd0d0d0, sleeve: 0xd8d8d8 }, { key: k, face: (ctx) => { eyes(ctx, '#222', null, 5, 3); ctx.fillStyle = '#444'; ctx.fillRect(6, 9, 4, 1); } }) },
  stray: { w: 0.6, h: 1.99, health: 20, speed: 2.4, hostile: true, damage: 2, ranged: true, keepDistance: 7, sound: 'skeleton', xp: 5, burns: true, drops: [['bone', 0, 2, 1], ['arrow', 0, 2, 1]],
    model: (k) => humanoid({ skin: 0xb8c8d8, shirt: 0x6a7a8a, pants: 0x5a6a7a, sleeve: 0xb8c8d8 }, { key: k, face: (ctx) => eyes(ctx, '#222', null, 5, 3) }) },
  creeper: { w: 0.6, h: 1.7, health: 20, speed: 2.4, hostile: true, damage: 0, explode: true, sound: 'creeper', xp: 5, drops: [['gunpowder', 0, 2, 1]],
    model: (k) => { const g = new THREE.Group(); const s = 1 / 16; const body = box(8 * s, 12 * s, 4 * s, { all: 0x2f9b2f }); body.position.y = 12 * s; g.add(body); const head = box(8 * s, 8 * s, 8 * s, { all: 0x2f9b2f }, k + '_head', (ctx) => { ctx.fillStyle = '#111'; ctx.fillRect(3, 5, 4, 3); ctx.fillRect(9, 5, 4, 3); ctx.fillRect(6, 8, 4, 5); ctx.fillRect(5, 11, 1, 3); ctx.fillRect(10, 11, 1, 3); }); head.position.y = 22 * s; g.add(head); const legs = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = box(4 * s, 6 * s, 4 * s, { all: 0x2f9b2f }); const p = new THREE.Group(); p.position.set(sx * 2 * s, 6 * s, sz * 3 * s); l.position.y = -3 * s; p.add(l); g.add(p); legs.push(p); } g.userData = { head, body, legs, arms: [] }; return g; } },
  spider: { w: 1.4, h: 0.9, health: 16, speed: 3.2, hostile: true, neutralInLight: true, damage: 2, climb: true, sound: 'spider', xp: 5, drops: [['string', 0, 2, 1], ['spider_eye', 1, 1, 0.33]], model: (k) => spiderModel(k) },
  cave_spider: { w: 0.7, h: 0.5, health: 12, speed: 3.4, hostile: true, damage: 2, poison: true, climb: true, sound: 'spider', xp: 5, drops: [['string', 0, 2, 1]], model: (k) => { const m = spiderModel(k, 0x0e3a3a, '#e02020'); m.scale.setScalar(0.6); return m; } },
  enderman: { w: 0.6, h: 2.9, health: 40, speed: 3.2, neutral: true, damage: 7, teleport: true, sound: 'enderman', xp: 5, drops: [['ender_pearl', 0, 1, 1]], waterHurts: true,
    model: (k) => { const g = humanoid({ skin: 0x121212, shirt: 0x121212, pants: 0x121212, sleeve: 0x121212 }, { key: k, face: (ctx) => { ctx.fillStyle = '#d070e0'; ctx.fillRect(2, 5, 5, 2); ctx.fillRect(9, 5, 5, 2); ctx.fillStyle = '#f0b0ff'; ctx.fillRect(3, 5, 1, 2); ctx.fillRect(12, 5, 1, 2); } }); g.userData.legs.forEach(l => { l.children[0].scale.y = 2.2; l.children[0].position.y = -0.85; l.position.y = 1.65; }); g.userData.arms.forEach(a => { a.children[0].scale.y = 2.2; a.children[0].position.y = -0.85; a.position.y = 2.4; }); g.userData.body.position.y = 2.0; g.userData.body.scale.y = 1.0; g.userData.head.position.y = 2.65; return g; } },
  zombified_piglin: { w: 0.6, h: 1.95, health: 20, speed: 2.5, neutral: true, swarm: true, damage: 5, sound: 'zombie', xp: 5, drops: [['rotten_flesh', 0, 1, 1], ['gold_nugget', 0, 1, 1], ['gold_ingot', 1, 1, 0.03]], nether: true,
    model: (k) => humanoid({ skin: 0xe09090, shirt: 0x6a4a3a, pants: 0x4a3a3a, sleeve: 0xe09090 }, { key: k, face: (ctx) => { eyes(ctx, '#111', null, 4, 3); ctx.fillStyle = '#b06070'; ctx.fillRect(4, 8, 8, 4); ctx.fillStyle = '#e0e0e0'; ctx.fillRect(3, 10, 1, 3); ctx.fillRect(12, 10, 1, 3); }, zombieArms: true }) },
  blaze: { w: 0.6, h: 1.8, health: 20, speed: 2, hostile: true, damage: 4, flies: true, fireball: true, keepDistance: 6, sound: 'fire', xp: 10, drops: [['blaze_rod', 0, 1, 1]], nether: true, model: () => blazeModel() },
  ghast: { w: 4, h: 4, health: 10, speed: 1.6, hostile: true, flies: true, fireball: true, big: true, keepDistance: 20, sound: 'ghast', xp: 5, drops: [['ghast_tear', 0, 1, 1], ['gunpowder', 1, 2, 1]], nether: true, model: () => ghastModel() },
  slime: { w: 1.2, h: 1.2, health: 16, speed: 1.5, hostile: true, hop: true, damage: 2, sound: 'slime', xp: 4, drops: [['slime_ball', 0, 2, 1]], model: (k, e) => slimeModel(e.size || 2) },
  witch: { w: 0.6, h: 1.95, health: 26, speed: 2.2, hostile: true, damage: 3, ranged: true, keepDistance: 5, sound: 'villager', xp: 5, drops: [['glass_bottle', 0, 2, 1], ['sugar', 0, 2, 1], ['redstone', 0, 2, 1], ['gunpowder', 0, 2, 1]],
    model: (k) => { const g = humanoid({ skin: 0x9aa08a, shirt: 0x2a1a3a, pants: 0x2a1a3a, sleeve: 0x2a1a3a }, { key: k, face: (ctx) => { eyes(ctx, '#3a8a3a', '#fff', 5, 2); ctx.fillStyle = '#7a806a'; ctx.fillRect(7, 8, 2, 5); } }); const hat = box(0.6, 0.8, 0.6, { all: 0x1a1a1a }); hat.position.y = 0.7; g.userData.head.add(hat); return g; } },
  phantom: { w: 0.9, h: 0.5, health: 20, speed: 5, hostile: true, flies: true, swoop: true, damage: 2, sound: 'enderman', xp: 5, burns: true, drops: [['phantom_membrane', 0, 1, 1]], model: () => phantomModel() },
  cow: { w: 0.9, h: 1.4, health: 10, speed: 1.4, passive: true, sound: 'cow', xp: 2, food: ['wheat'], drops: [['leather', 0, 2, 1], ['beef', 1, 3, 1]], milk: true,
    model: (k) => quadruped({ body: 0x4a3a2a, top: 0x5a4a3a, head: 0x4a3a2a, legs: 0x3a2a1a, face: 0x4a3a2a }, { key: k, horns: true, face: (ctx) => { eyes(ctx, '#111', null, 3, 3); ctx.fillStyle = '#d0b0a0'; ctx.fillRect(4, 9, 8, 6); } }) },
  pig: { w: 0.9, h: 0.9, health: 10, speed: 1.6, passive: true, sound: 'pig', xp: 2, food: ['carrot', 'potato', 'beetroot'], drops: [['porkchop', 1, 3, 1]],
    model: (k) => quadruped({ body: 0xf0a0a0, head: 0xf0a0a0, legs: 0xe09090, snout: 0xe08080 }, { key: k, bh: 8, lh: 6, bl: 16, snout: true, face: (ctx) => eyes(ctx, '#111', null, 4, 3) }) },
  sheep: { w: 0.9, h: 1.3, health: 8, speed: 1.4, passive: true, sound: 'sheep', xp: 2, food: ['wheat'], drops: [['mutton', 1, 2, 1]], shearable: true, eatsGrass: true,
    model: (k, e) => quadruped({ body: 0xd8d8d8, head: 0xe8e8e8, legs: 0xd0d0d0, wool: e.color ?? 0xf0f0f0 }, { key: k, bh: 8, lh: 12, bl: 14, wool: !e.sheared, face: (ctx) => eyes(ctx, '#111', null, 4, 3) }) },
  chicken: { w: 0.4, h: 0.7, health: 4, speed: 1.6, passive: true, sound: 'chicken', xp: 1, food: ['wheat_seeds', 'melon_seeds', 'pumpkin_seeds'], drops: [['feather', 0, 2, 1], ['chicken', 1, 1, 1]], glides: true, layEggs: true, model: (k) => chickenModel(k) },
  horse: { w: 1.4, h: 1.6, health: 20, speed: 3.5, passive: true, sound: 'cow', xp: 2, food: ['apple', 'wheat', 'golden_carrot', 'golden_apple'], drops: [['leather', 0, 2, 1]],
    model: (k, e) => quadruped({ body: e.color ?? 0x8a5a30, head: e.color ?? 0x8a5a30, legs: e.color ?? 0x8a5a30, mane: 0x3a2a1a }, { key: k, bw: 10, bh: 12, bl: 22, lh: 16, hw: 6, hh: 12, hd: 8, mane: true, tail: true, face: (ctx) => eyes(ctx, '#111', null, 3, 2) }) },
  wolf: { w: 0.6, h: 0.85, health: 8, speed: 3, neutral: true, tameable: 'bone', damage: 3, sound: 'wolf', xp: 2, food: ['beef', 'porkchop', 'chicken', 'mutton', 'rotten_flesh', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton'], drops: [],
    model: (k, e) => quadruped({ body: 0xc8c8c8, head: 0xd0d0d0, legs: 0xc0c0c0, snout: 0xa0a0a0 }, { key: k, bw: 6, bh: 6, bl: 12, lh: 8, hw: 6, hh: 6, hd: 6, snout: true, tail: true, face: (ctx) => eyes(ctx, e.tamed ? '#3060c0' : '#111', null, 3, 3) }) },
  cat: { w: 0.5, h: 0.6, health: 10, speed: 2.5, passive: true, tameable: 'cod', sound: 'chicken', xp: 2, food: ['cod', 'salmon'], drops: [],
    model: (k, e) => quadruped({ body: e.color ?? 0xd0a050, head: e.color ?? 0xd0a050, legs: e.color ?? 0xc09040 }, { key: k, bw: 5, bh: 5, bl: 12, lh: 6, hw: 5, hh: 5, hd: 5, tail: true, face: (ctx) => eyes(ctx, '#20c040', null, 3, 3) }) },
  villager: { w: 0.6, h: 1.95, health: 20, speed: 1.6, passive: true, sound: 'villager', xp: 0, drops: [], villager: true,
    model: (k) => { const g = humanoid({ skin: 0xc0906a, shirt: 0x6a5040, pants: 0x4a3a30, sleeve: 0x6a5040 }, { key: k, face: (ctx) => { eyes(ctx, '#3a8a3a', null, 5, 2); ctx.fillStyle = '#a07050'; ctx.fillRect(7, 7, 2, 6); ctx.fillStyle = '#3a2a1a'; ctx.fillRect(4, 9, 3, 1); ctx.fillRect(9, 9, 3, 1); } }); g.userData.arms.forEach(a => { a.rotation.x = -1.2; }); return g; } },
  iron_golem: { w: 1.4, h: 2.7, health: 100, speed: 1.8, neutral: true, guardian: true, damage: 11, sound: 'anvil', xp: 0, drops: [['iron_ingot', 3, 5, 1], ['poppy', 0, 2, 1]],
    model: (k) => { const g = humanoid({ skin: 0xd8d0c8, shirt: 0xc8c0b8, pants: 0xb8b0a8, sleeve: 0xd8d0c8 }, { key: k, face: (ctx) => { eyes(ctx, '#c02020', null, 5, 3); ctx.fillStyle = '#404040'; ctx.fillRect(7, 8, 2, 5); } }); g.scale.set(1.6, 1.45, 1.6); g.userData.arms.forEach(a => { a.children[0].scale.y = 1.4; a.children[0].position.y = -0.55; }); return g; } },
  bee: { w: 0.7, h: 0.6, health: 10, speed: 2.5, neutral: true, flies: true, damage: 2, sound: 'chicken', xp: 1, drops: [], model: () => beeModel() },
  ender_dragon: { w: 6, h: 3, health: 200, speed: 8, boss: true, flies: true, damage: 10, sound: 'dragon', xp: 500, drops: [], model: () => dragonModel(), end: true },
};
export const MOB_LIST = Object.keys(MOBS);

// ---------- base entity ----------
export class Entity {
  constructor(game, x, y, z) {
    this.game = game; this.world = game.world; this.id = uid++;
    this.x = x; this.y = y; this.z = z; this.vx = 0; this.vy = 0; this.vz = 0;
    this.w = 0.5; this.h = 0.5; this.yaw = 0; this.pitch = 0; this.onGround = false; this.dead = false; this.age = 0; this.removed = false;
    this.obj = null; this.noGravity = false; this.fire = 0; this.inWater = false; this.fallStart = null;
  }
  get cx() { return Math.floor(this.x) >> 4; } get cz() { return Math.floor(this.z) >> 4; }
  physics(dt, opts = {}) {
    const fs = fluidState(this.world, this, this.y + this.h * 0.8);
    this.inWater = fs.water; this.inLava = fs.lava;
    if (!this.noGravity) {
      if (fs.water || fs.lava) { this.vy -= GRAVITY * 0.12 * dt; this.vy *= 0.9; if (opts.swim) this.vy += 12 * dt; }
      else this.vy -= GRAVITY * dt * (opts.gravityScale ?? 1);
    }
    this.vy = Math.max(this.vy, -78);
    const drag = this.onGround ? (opts.groundDrag ?? 0.6) : (opts.airDrag ?? 0.91);
    const dtk = dt * 20;
    const r = moveEntity(this.world, this, this.vx * dt, this.vy * dt, this.vz * dt, opts.step || 0);
    if (r.hitY) this.vy = 0;
    if (r.hitX) this.vx = 0; if (r.hitZ) this.vz = 0;
    this.onGround = r.onGround;
    const f = Math.pow(drag, dtk); this.vx *= f; this.vz *= f;
    if (fs.water) { this.vx *= Math.pow(0.8, dtk); this.vz *= Math.pow(0.8, dtk); }
    return r;
  }
  distTo(e) { return Math.hypot(e.x - this.x, e.y - this.y, e.z - this.z); }
  remove() { this.removed = true; if (this.obj) { this.game.renderer.entityGroup.remove(this.obj); this.obj.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.obj = null; } }
  syncObject() { if (!this.obj) return; this.obj.position.set(this.x, this.y, this.z); this.obj.rotation.y = this.yaw; this.updateLight(); }
  updateLight() {
    if (!this.obj) return;
    const bx = Math.floor(this.x), by = Math.floor(this.y + this.h * 0.5), bz = Math.floor(this.z);
    const l = this.world.getLightLevel(bx, by, bz, this.game.sunLevel) / 15; const br = 0.12 + 0.88 * (l / (4 - 3 * l));
    const tint = this.hurtTimer > 0 ? [1, 0.4, 0.4] : (this.flash ? [1.6, 1.6, 1.6] : [1, 1, 1]);
    this.obj.traverse(o => { if (o.isMesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) { if (!m.userData.base) { m.userData.base = m.color.clone(); } if (!m.userData.shared) { m.color.copy(m.userData.base).multiplyScalar(br); m.color.r *= tint[0]; m.color.g *= tint[1]; m.color.b *= tint[2]; } } } });
  }
  serialize() { return null; }
}
// Because colorMat() materials are shared between entities, per-entity tinting needs unique materials.
function uniqueMaterials(obj) { obj.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); } }); }

// ---------- living entity (mobs & player-like) ----------
export class Mob extends Entity {
  constructor(game, type, x, y, z, extra = {}) {
    super(game, x, y, z);
    this.type = type; const def = MOBS[type]; this.def = def;
    this.w = def.w; this.h = def.h; this.maxHealth = def.health; this.health = extra.health ?? def.health;
    this.extra = extra; this.baby = !!extra.baby; this.growth = extra.growth || 0; this.size = extra.size || (type === 'slime' ? 1 + Math.floor(Math.random() * 3) : 0);
    if (type === 'slime') { this.w = this.h = 0.5 * this.size + 0.1; this.maxHealth = this.health = this.size * this.size * 4; }
    if (this.baby) { this.w *= 0.5; this.h *= 0.5; }
    this.yaw = Math.random() * Math.PI * 2; this.headYaw = this.yaw; this.headPitch = 0;
    this.target = null; this.wanderT = 0; this.wx = 0; this.wz = 0; this.moving = false; this.attackCd = 0; this.hurtTimer = 0; this.panic = 0; this.love = extra.love || 0; this.fuse = -1; this.anger = 0;
    this.tamed = extra.tamed || false; this.sitting = extra.sitting || false; this.sheared = extra.sheared || false; this.color = extra.color; this.home = extra.home || { x, y, z }; this.jumpCd = 0; this.soundT = 2 + Math.random() * 8; this.eggT = 200 + Math.random() * 300; this.dyingT = 0;
    this.lastHurtBy = null; this.noDespawn = !!extra.noDespawn || this.tamed;
    this.buildModel();
  }
  buildModel() {
    if (this.obj) { this.game.renderer.entityGroup.remove(this.obj); }
    const key = this.type + (this.tamed ? '_t' : '');
    this.obj = this.def.model(key, this); uniqueMaterials(this.obj);
    if (this.baby) { this.obj.scale.multiplyScalar(0.5); const h = this.obj.userData.head; if (h) h.scale.setScalar(1.6); }
    this.parts = this.obj.userData;
    this.game.renderer.entityGroup.add(this.obj);
  }
  get hostile() { return this.def.hostile || (this.def.neutral && this.anger > 0); }
  update(dt) {
    this.age += dt; this.attackCd = Math.max(0, this.attackCd - dt); this.hurtTimer = Math.max(0, this.hurtTimer - dt); this.jumpCd = Math.max(0, this.jumpCd - dt);
    if (this.dead) { this.dyingT += dt; if (this.obj) { this.obj.rotation.z = Math.min(Math.PI / 2, this.dyingT * 4); this.obj.position.y = this.y - Math.min(0.5, this.dyingT) * 0.2; } if (this.dyingT > 0.6) this.remove(); return; }
    const g = this.game, p = g.nearestPlayer(this.x, this.y, this.z) || g.player;
    if (this.panic > 0) this.panic -= dt; if (this.anger > 0) this.anger -= dt; if (this.love > 0) this.love -= dt;
    if (this.baby) { this.growth += dt; if (this.growth > 1200) { this.baby = false; this.w = this.def.w; this.h = this.def.h; this.buildModel(); } }
    // environment damage
    if (this.def.burns && g.world.dim === 0 && g.isDay() && g.world.getSky(Math.floor(this.x), Math.floor(this.y + this.h), Math.floor(this.z)) >= 15 && !this.inWater && !g.weather.raining) this.fire = Math.max(this.fire, 1);
    if (this.fire > 0) { this.fire -= dt; if (!this._fireTick) this._fireTick = 0; this._fireTick += dt; if (this._fireTick > 1) { this._fireTick = 0; this.hurt(1, null); } if (this.inWater) this.fire = 0; g.particles.emit(this.x, this.y + this.h * 0.6, this.z, 'flame', 1); }
    if (this.inLava) { this.fire = 5; if (Math.random() < dt * 4) this.hurt(4, null); }
    if (this.def.waterHurts && (this.inWater || (g.weather.raining && g.world.getSky(Math.floor(this.x), Math.floor(this.y + 2), Math.floor(this.z)) >= 15))) { if (Math.random() < dt) { this.hurt(1, null); this.teleportRandom(); } }
    const blockIn = g.world.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    if (blockIn === B.cactus || blockIn === B.fire || blockIn === B.campfire) { if (Math.random() < dt * 2) this.hurt(1, null); if (blockIn !== B.cactus) this.fire = 3; }
    // AI
    this.ai(dt);
    // physics
    if (this.def.flies) { this.noGravity = true; const r = moveEntity(g.world, this, this.vx * dt, this.vy * dt, this.vz * dt); if (r.hitX) this.vx = 0; if (r.hitZ) this.vz = 0; if (r.hitY) this.vy = 0; this.onGround = r.onGround; const f = Math.pow(0.9, dt * 20); this.vx *= f; this.vy *= f; this.vz *= f; }
    else {
      const r = this.physics(dt, { step: this.def.climb ? 1.0 : 0.6, swim: this.def.aquatic ? false : this.inWater && this.vy < 1, gravityScale: this.def.glides && this.vy < 0 ? 0.3 : 1 });
      if (this.def.climb && (r.hitX || r.hitZ) && this.target) this.vy = 3;
      if (this.fallStart === null && !this.onGround && !this.inWater) this.fallStart = this.y;
      if (this.onGround && this.fallStart !== null) { const d = this.fallStart - this.y - 3; if (d > 0 && !this.def.glides && !this.def.hop) this.hurt(Math.floor(d), null); this.fallStart = null; }
      if (this.inWater) this.fallStart = null;
    }
    if (this.y < -8) this.hurt(4, null);
    // sounds
    this.soundT -= dt; if (this.soundT <= 0) { this.soundT = 4 + Math.random() * 12; if (this.def.sound && Math.random() < 0.6) g.playSoundAt(this.def.sound, this.x, this.y, this.z, { volume: 0.6 }); }
    // chicken eggs
    if (this.def.layEggs && !this.baby) { this.eggT -= dt; if (this.eggT <= 0) { this.eggT = 300 + Math.random() * 300; g.entities.dropItem(this.x, this.y, this.z, makeStack(I.egg, 1)); g.playSoundAt('pop', this.x, this.y, this.z); } }
    // sheep eat grass to regrow wool
    if (this.def.eatsGrass && this.sheared && Math.random() < dt * 0.02) { const bx = Math.floor(this.x), by = Math.floor(this.y) - 1, bz = Math.floor(this.z); if (g.world.getBlock(bx, by, bz) === B.grass_block) { g.world.setBlock(bx, by, bz, B.dirt); this.sheared = false; this.buildModel(); } }
    this.animate(dt);
  }
  ai(dt) {
    const g = this.game, def = this.def;
    const p = g.nearestPlayer(this.x, this.y, this.z, { notCreative: !def.boss && this.anger <= 0 }) || g.nearestPlayer(this.x, this.y, this.z) || g.player;
    const dp = Math.hypot(p.x - this.x, p.z - this.z), dpy = p.y - this.y;
    const peaceful = g.difficulty === 0;
    // target selection
    if (def.hostile || (def.neutral && this.anger > 0)) {
      if (!peaceful && !p.dead && !(def.neutralInLight && g.world.getLightLevel(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z), g.sunLevel) > 7 && this.anger <= 0)) {
        if (dp < (def.big ? 48 : 16) && Math.abs(dpy) < 12 && !p.dead && p.gamemode !== 'spectator' && !(p.gamemode === 'creative' && !def.boss && this.anger <= 0)) this.target = p; else if (this.target === p && dp > 24) this.target = null;
      } else this.target = null;
    }
    if (def.guardian) { // iron golem: attack nearest hostile
      if (!this.target || this.target.removed || this.target.dead) { this.target = null; let best = null, bd = 12; for (const e of g.entities.list) if (e instanceof Mob && e.def.hostile && !e.dead) { const d = this.distTo(e); if (d < bd) { bd = d; best = e; } } this.target = best; }
    }
    const owner = this.ownerPlayer || (this.tamed ? g.players[this.ownerIndex || 0] : null);
    if (this.tamed && owner && !this.sitting) { // wolf: attack what hurt the owner / owner's target
      if (!this.target && owner.lastAttacker && !owner.lastAttacker.removed && !owner.lastAttacker.dead && owner.lastAttackerT > g.time - 200) this.target = owner.lastAttacker;
      if (!this.target && owner.lastTarget && !owner.lastTarget.removed && !owner.lastTarget.dead && owner.lastTargetT > g.time - 200 && owner.lastTarget !== this) this.target = owner.lastTarget;
    }
    if (this.target && (this.target.removed || this.target.dead)) this.target = null;
    // villagers flee zombies
    if (def.villager) { for (const e of g.entities.list) if (e instanceof Mob && (e.type === 'zombie' || e.type === 'husk') && this.distTo(e) < 8) { this.panic = 1; this.fleeFrom = e; } }
    if (this.sitting) { this.moving = false; this.vx *= 0.5; this.vz *= 0.5; return; }
    let moveX = 0, moveZ = 0, speed = def.speed * (this.baby ? 0.9 : 1);
    if (this.panic > 0) { const from = this.fleeFrom || p; const dx = this.x - from.x, dz = this.z - from.z, d = Math.hypot(dx, dz) || 1; moveX = dx / d; moveZ = dz / d; speed *= 1.6; }
    else if (this.target) {
      const t = this.target; const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz) || 1;
      this.headYaw = Math.atan2(-dx, -dz); this.headPitch = Math.atan2(t.y + (t.h || 1.6) * 0.8 - (this.y + this.h * 0.9), d);
      if (def.explode) {
        if (d < 3 && Math.abs(t.y - this.y) < 2) { if (this.fuse < 0) { this.fuse = 1.5; g.playSoundAt('creeper', this.x, this.y, this.z); } }
        else if (this.fuse > 0 && d > 6) this.fuse = -1;
        if (this.fuse > 0) { this.fuse -= dt; this.flash = Math.floor(this.fuse * 8) % 2 === 0; if (this.fuse <= 0) { this.remove(); g.explode(this.x, this.y + 0.5, this.z, 3, this); return; } }
        else { moveX = dx / d; moveZ = dz / d; }
      } else if (def.ranged || def.fireball) {
        const keep = def.keepDistance || 6;
        if (d > keep + 2) { moveX = dx / d; moveZ = dz / d; } else if (d < keep - 2) { moveX = -dx / d; moveZ = -dz / d; } else { moveX = -dz / d * 0.5; moveZ = dx / d * 0.5; }
        if (this.attackCd <= 0 && d < 20 && g.entities.canSee(this, t)) { this.attackCd = def.fireball ? 3 : (this.type === 'witch' ? 2.5 : 2); if (def.fireball) g.entities.spawnFireball(this, t, def.big ? 1.2 : 0.6); else if (this.type === 'witch') g.entities.spawnPotion(this, t); else g.entities.spawnArrow(this, t, 1.6); if (!def.fireball) g.playSoundAt('bow', this.x, this.y, this.z); }
      } else if (def.swoop) {
        // circle above then dive
        this.circleT = (this.circleT || 0) + dt; const cx = t.x + Math.cos(this.circleT * 0.6) * 12, cz = t.z + Math.sin(this.circleT * 0.6) * 12; const cy = t.y + 14;
        const dive = (Math.floor(this.circleT / 8) % 2 === 1);
        const tx = dive ? t.x : cx, ty = dive ? t.y + 1 : cy, tz = dive ? t.z : cz;
        const vx = tx - this.x, vy = ty - this.y, vz = tz - this.z, vd = Math.hypot(vx, vy, vz) || 1;
        this.vx += vx / vd * speed * dt * 4; this.vy += vy / vd * speed * dt * 4; this.vz += vz / vd * speed * dt * 4; this.yaw = Math.atan2(-this.vx, -this.vz);
        if (dive && this.distTo(t) < 1.5 && this.attackCd <= 0) { this.attackCd = 1; if (t.isPlayer) t.hurt(def.damage, this); else if (t.hurt) t.hurt(def.damage, this); }
        this.moving = true; return;
      } else { moveX = dx / d; moveZ = dz / d; if (d < (def.big ? 3 : 1.2) + this.w / 2 + (t.w || 0.6) / 2 && Math.abs(t.y - this.y) < 2.5 && this.attackCd <= 0) { this.attackCd = 1; const dmg = def.damage * (g.difficulty === 1 ? 0.7 : g.difficulty === 3 ? 1.4 : 1); if (t.isPlayer) t.hurt(Math.max(1, Math.round(dmg)), this); else if (t.hurt) t.hurt(dmg, this); if (def.poison && t.isPlayer) t.effects.poison = 5; } }
      if (def.teleport && d > 12 && Math.random() < dt * 0.5) this.teleportNear(t);
      if (def.flies && !def.swoop) { const ty = t.y + (def.big ? 6 : 1.5) - this.y; this.vy += Math.sign(ty) * Math.min(Math.abs(ty), 1) * speed * dt * 3; }
    } else {
      // wander / follow owner / breeding
      if (this.tamed && owner) { const od = Math.hypot(owner.x - this.x, owner.z - this.z) || 1; if (od > 12) { this.x = owner.x; this.y = owner.y; this.z = owner.z; } else if (od > 4) { moveX = (owner.x - this.x) / od; moveZ = (owner.z - this.z) / od; speed *= 1.3; } }
      else if (this.love > 0) {
        let mate = null, md = 8; for (const e of g.entities.list) if (e !== this && e instanceof Mob && e.type === this.type && e.love > 0 && !e.baby) { const d = this.distTo(e); if (d < md) { md = d; mate = e; } }
        if (mate) { moveX = (mate.x - this.x) / (md || 1); moveZ = (mate.z - this.z) / (md || 1); if (md < 1.2) { this.love = 0; mate.love = 0; g.entities.spawnMob(this.type, (this.x + mate.x) / 2, this.y, (this.z + mate.z) / 2, { baby: true, color: this.color }); g.entities.spawnXP((this.x + mate.x) / 2, this.y, (this.z + mate.z) / 2, 3); for (let i = 0; i < 6; i++) g.particles.emit(this.x, this.y + this.h, this.z, 'heart', 1); } }
        else if (dp < 6 && p.inventory.held && this.def.food && this.def.food.some(f => I[f] === p.inventory.held.id)) { moveX = (p.x - this.x) / dp; moveZ = (p.z - this.z) / dp; }
      }
      else if (!this.tamed && this.def.food && dp < 6 && p.inventory.held && this.def.food.some(f => I[f] === p.inventory.held.id) && dp > 1.5) { moveX = (p.x - this.x) / dp; moveZ = (p.z - this.z) / dp; this.headYaw = Math.atan2(-(p.x - this.x), -(p.z - this.z)); }
      else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = 2 + Math.random() * 5; if (Math.random() < 0.6) { const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 6; const hx = def.villager ? this.home.x : this.x, hz = def.villager ? this.home.z : this.z; this.wx = hx + Math.cos(a) * r; this.wz = hz + Math.sin(a) * r; this.wandering = true; } else this.wandering = false; }
        if (this.wandering) { const dx = this.wx - this.x, dz = this.wz - this.z, d = Math.hypot(dx, dz); if (d < 0.8) this.wandering = false; else { moveX = dx / d; moveZ = dz / d; speed *= 0.55; } }
        if (def.flies && !def.boss) { const ground = g.world.surfaceY(Math.floor(this.x), Math.floor(this.z)); const want = ground + (def.big ? 12 : 3) + Math.sin(this.age) * 1.5; this.vy += (want - this.y) * dt * 2; }
        // look at player when close
        if (dp < 5 && Math.random() < 0.9) { this.headYaw = Math.atan2(-(p.x - this.x), -(p.z - this.z)); this.headPitch = Math.atan2(p.y + 1.5 - (this.y + this.h * 0.9), dp); } else { this.headYaw = this.yaw; this.headPitch = 0; }
        if (def.villager && !g.isDay()) { const dh = Math.hypot(this.home.x - this.x, this.home.z - this.z); if (dh > 2) { moveX = (this.home.x - this.x) / dh; moveZ = (this.home.z - this.z) / dh; } else { moveX = moveZ = 0; } }
      }
    }
    if (def.boss) return this.dragonAI(dt);
    // cliff / lava avoidance when wandering
    if ((moveX || moveZ) && !this.target && this.panic <= 0 && !def.flies) {
      const ax = Math.floor(this.x + moveX * 1.2), az = Math.floor(this.z + moveZ * 1.2), ay = Math.floor(this.y);
      let drop = 0; while (drop < 4 && !BLOCKS[g.world.getBlock(ax, ay - 1 - drop, az)].solid) drop++;
      const ahead = g.world.getBlock(ax, ay, az), aheadDown = g.world.getBlock(ax, ay - 1, az);
      if (drop >= 3 || ahead === B.lava || aheadDown === B.lava || ahead === B.fire || (aheadDown === B.water && !def.aquatic && Math.random() < 0.7)) { this.wandering = false; this.wanderT = 0.5; moveX = moveZ = 0; this.yaw += Math.PI * 0.5; }
    }
    this.moving = !!(moveX || moveZ);
    if (this.moving) {
      const targetYaw = Math.atan2(-moveX, -moveZ); let dy = targetYaw - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; this.yaw += dy * Math.min(1, dt * 8);
      if (!this.target) this.headYaw = this.yaw;
      if (def.hop) { if (this.onGround && this.jumpCd <= 0) { this.vy = 6 + this.size; this.vx = moveX * speed * 2.5; this.vz = moveZ * speed * 2.5; this.jumpCd = 0.8 + Math.random(); g.playSoundAt('slime', this.x, this.y, this.z, { volume: 0.4 }); } }
      else if (def.flies) { this.vx += moveX * speed * dt * 3; this.vz += moveZ * speed * dt * 3; }
      else { const acc = this.onGround ? 10 : 2; this.vx += (moveX * speed - this.vx) * Math.min(1, dt * acc); this.vz += (moveZ * speed - this.vz) * Math.min(1, dt * acc); }
      // jump when blocked
      const fx = Math.floor(this.x + moveX * (this.w / 2 + 0.3)), fz = Math.floor(this.z + moveZ * (this.w / 2 + 0.3)), fy = Math.floor(this.y + 0.1);
      const blocked = BLOCKS[g.world.getBlock(fx, fy, fz)].solid && !BLOCKS[g.world.getBlock(fx, fy + 1, fz)].solid;
      if ((blocked || (this.inWater && !def.aquatic)) && this.onGround !== false && this.jumpCd <= 0 && !def.hop && !def.flies) { if (this.onGround || this.inWater) { this.vy = this.inWater ? 4 : 8.2; this.jumpCd = 0.5; } }
      if (this.inWater && !def.aquatic && this.vy < 2) this.vy += 20 * dt;
    }
    if (def.aquatic) { if (this.inWater) { if (this.target) this.vy += (this.target.y - this.y) * dt * 3; else this.vy += (Math.sin(this.age) * 0.5) * dt; this.noGravity = true; } else this.noGravity = false; }
  }
  dragonAI(dt) {
    const g = this.game, p = g.nearestPlayer(this.x, this.y, this.z) || g.player; this.moving = true;
    this.phaseT = (this.phaseT || 0) + dt;
    const phase = Math.floor(this.phaseT / 12) % 3; // 0,1 circle ; 2 charge
    let tx, ty, tz;
    if (phase < 2) { const a = this.phaseT * 0.25; tx = Math.cos(a) * 45; tz = Math.sin(a) * 45; ty = 80 + Math.sin(this.phaseT * 0.5) * 8; }
    else { tx = p.x; ty = p.y + 2; tz = p.z; }
    const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z, d = Math.hypot(dx, dy, dz) || 1;
    const sp = this.def.speed * (phase === 2 ? 1.6 : 1);
    this.vx += (dx / d * sp - this.vx) * dt * 1.5; this.vy += (dy / d * sp - this.vy) * dt * 1.5; this.vz += (dz / d * sp - this.vz) * dt * 1.5;
    this.yaw = Math.atan2(-this.vx, -this.vz); this.headYaw = this.yaw;
    if (this.distTo(p) < 5 && this.attackCd <= 0) { this.attackCd = 1.5; p.hurt(this.def.damage, this); p.vx += this.vx * 0.5; p.vy += 6; p.vz += this.vz * 0.5; }
    if (phase === 2 && this.attackCd <= 0 && Math.random() < dt * 0.3 && this.distTo(p) > 12) { this.attackCd = 2; g.entities.spawnFireball(this, p, 1.5); }
    if (this.y < 40) this.vy += 10 * dt;
    // destroy blocks it flies through (except end stone/obsidian/bedrock)
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    for (let ox = -2; ox <= 2; ox++) for (let oy = -1; oy <= 2; oy++) for (let oz = -2; oz <= 2; oz++) { const id = g.world.getBlock(bx + ox, by + oy, bz + oz); if (id && id !== B.end_stone && id !== B.obsidian && id !== B.bedrock && id !== B.end_portal_frame && id !== B.end_portal && id !== B.iron_bars) g.world.setBlock(bx + ox, by + oy, bz + oz, 0); }
  }
  teleportRandom() { const g = this.game; for (let i = 0; i < 16; i++) { const nx = this.x + (Math.random() - 0.5) * 32, nz = this.z + (Math.random() - 0.5) * 32; const ny = g.world.surfaceY(Math.floor(nx), Math.floor(nz)) + 1; if (ny > 0 && !BLOCKS[g.world.getBlock(Math.floor(nx), ny, Math.floor(nz))].solid) { g.particles.emit(this.x, this.y + 1, this.z, 'portal', 12); this.x = nx; this.y = ny; this.z = nz; g.playSoundAt('teleport', nx, ny, nz); return; } } }
  teleportNear(t) { const g = this.game; for (let i = 0; i < 8; i++) { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 3; const nx = t.x + Math.cos(a) * r, nz = t.z + Math.sin(a) * r; const ny = g.world.surfaceY(Math.floor(nx), Math.floor(nz)) + 1; if (Math.abs(ny - t.y) < 4) { g.particles.emit(this.x, this.y + 1, this.z, 'portal', 12); this.x = nx; this.y = ny; this.z = nz; g.playSoundAt('teleport', nx, ny, nz); return; } } }
  hurt(amount, source, knock = 0.5) {
    if (this.dead) return false;
    const g = this.game;
    this.health -= amount; this.hurtTimer = 0.4; this.lastHurtBy = source;
    if (source) { const dx = this.x - source.x, dz = this.z - source.z, d = Math.hypot(dx, dz) || 1; this.vx += dx / d * knock * 8; this.vz += dz / d * knock * 8; this.vy += 3 * knock; }
    if (this.def.passive) { this.panic = 3; this.fleeFrom = source; }
    if (this.def.neutral && source) { this.anger = 20; this.target = source; if (this.def.swarm) for (const e of g.entities.list) if (e instanceof Mob && e.type === this.type && this.distTo(e) < 24) { e.anger = 20; e.target = source; } }
    if (this.def.teleport && Math.random() < 0.5) this.teleportRandom();
    if (this.def.tameable && this.tamed && this.sitting) this.sitting = false;
    g.playSoundAt(this.def.sound === 'zombie' ? 'zombie_hurt' : 'hit', this.x, this.y, this.z, { volume: 0.7 });
    if (this.health <= 0) this.die(source);
    return true;
  }
  die(source) {
    const g = this.game; this.dead = true; this.health = 0;
    g.playSoundAt('death', this.x, this.y, this.z, { volume: 0.6 });
    const playerKill = (source && source.isPlayer) || (source && source.owner === 'player') || (source && source.shooter && source.shooter.isPlayer);
    const loot = playerKill ? (this.looting || 0) : 0;
    if (!(this.def.villager)) for (const [item, min, max, chance] of this.def.drops) { if (Math.random() > Math.min(1, chance + loot * 0.05)) continue; const n = min + Math.floor(Math.random() * (max - min + 1 + loot)) + (playerKill && Math.random() < 0.3 ? 1 : 0); if (n > 0) { let id; try { id = resolveId(item); } catch { continue; } if (this.fire > 0 && item === 'beef') id = I.cooked_beef; if (this.fire > 0 && item === 'porkchop') id = I.cooked_porkchop; if (this.fire > 0 && item === 'chicken') id = I.cooked_chicken; g.entities.dropItem(this.x, this.y + 0.5, this.z, makeStack(id, n), true); } }
    if (this.type === 'sheep' && !this.sheared) g.entities.dropItem(this.x, this.y + 0.5, this.z, makeStack(this.woolId(), 1), true);
    if (playerKill && this.def.xp) g.entities.spawnXP(this.x, this.y + 0.5, this.z, this.def.xp);
    if (this.type === 'slime' && this.size > 1) for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) g.entities.spawnMob('slime', this.x + Math.random() - 0.5, this.y, this.z + Math.random() - 0.5, { size: this.size - 1 });
    if (this.def.boss) g.onDragonKilled(this);
    if (playerKill) { g.stats.kills = (g.stats.kills || 0) + 1; }
    g.stats.mobKills = (g.stats.mobKills || 0) + (playerKill ? 1 : 0);
  }
  woolId() { const { COLORS } = this.game.consts; const c = this.colorName || 'white'; return B[`${c}_wool`]; }
  // Player right-clicks the mob with an item. Returns true if handled.
  interact(player, stack) {
    const g = this.game; const def = this.def; const id = stack ? stack.id : 0; const item = id ? getItem(id) : null;
    if (def.shearable && id === I.shears && !this.sheared && !this.baby) { this.sheared = true; this.buildModel(); for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) g.entities.dropItem(this.x, this.y + 0.5, this.z, makeStack(this.woolId(), 1), true); player.inventory.damageHeld(1); g.playSoundAt('shear', this.x, this.y, this.z); return true; }
    if (def.milk && id === I.bucket && !this.baby) { player.inventory.consumeHeld(1); player.give(makeStack(I.milk_bucket, 1)); g.playSoundAt('bucket', this.x, this.y, this.z); return true; }
    if (def.tameable && !this.tamed && id && I[def.tameable] === id) { player.inventory.consumeHeld(1); if (Math.random() < 0.34) { this.tamed = true; this.owner = 'player'; this.ownerIndex = player.index; this.ownerPlayer = player; this.noDespawn = true; this.buildModel(); this.anger = 0; this.target = null; for (let i = 0; i < 8; i++) g.particles.emit(this.x, this.y + this.h, this.z, 'heart', 1); } else for (let i = 0; i < 4; i++) g.particles.emit(this.x, this.y + this.h, this.z, 'smoke', 1); return true; }
    if (this.tamed && (!id || !(def.food && def.food.some(f => I[f] === id)))) { this.sitting = !this.sitting; return true; }
    if (def.food && id && def.food.some(f => I[f] === id)) {
      if (this.tamed && this.health < this.maxHealth) { this.health = Math.min(this.maxHealth, this.health + 4); player.inventory.consumeHeld(1); for (let i = 0; i < 4; i++) g.particles.emit(this.x, this.y + this.h, this.z, 'heart', 1); return true; }
      if (this.baby) { this.growth += 120; player.inventory.consumeHeld(1); g.particles.emit(this.x, this.y + this.h, this.z, 'happy', 4); return true; }
      if (this.love <= 0) { this.love = 30; player.inventory.consumeHeld(1); for (let i = 0; i < 6; i++) g.particles.emit(this.x, this.y + this.h, this.z, 'heart', 1); g.playSoundAt('eat', this.x, this.y, this.z); return true; }
    }
    if (def.villager) { g.ui.openTrade(player, this); return true; }
    if (item && item.dye && this.type === 'sheep') { this.colorName = item.dye; this.color = g.consts.COLOR_HEX[item.dye]; player.inventory.consumeHeld(1); this.buildModel(); return true; }
    if (id === I.name_tag) { player.inventory.consumeHeld(1); this.noDespawn = true; this.named = true; return true; }
    return false;
  }
  animate(dt) {
    if (!this.parts) return;
    const P = this.parts; const sp = Math.hypot(this.vx, this.vz);
    this.animT = (this.animT || 0) + dt * (this.moving || sp > 0.3 ? Math.max(sp, 1.5) * 4 : 0);
    const sw = Math.sin(this.animT) * (sp > 0.2 ? Math.min(1, sp / 2) * 0.8 : 0);
    P.legs.forEach((l, i) => { if (this.def.flies && this.type !== 'ghast') return; l.rotation.x = (i % 2 === 0 ? sw : -sw) * (this.type === 'spider' || this.type === 'cave_spider' ? 0.3 : 1); if (this.type === 'ghast') l.rotation.x = Math.sin(this.age * 2 + i) * 0.2; });
    P.arms.forEach((a, i) => {
      if (this.def.flies) { a.rotation.z = Math.sin(this.age * (this.type === 'bee' ? 40 : this.type === 'ender_dragon' ? 4 : 8)) * (i === 0 ? 0.6 : -0.6); return; }
      if (P.zombieArms) { a.rotation.x = -Math.PI / 2 + Math.sin(this.age * 2) * 0.05; a.rotation.z = (i === 0 ? 0.1 : -0.1); }
      else if (this.type === 'villager') a.rotation.x = -1.2; else a.rotation.x = (i % 2 === 0 ? -sw : sw);
      if (this.type === 'chicken') a.rotation.z = (i === 0 ? 1 : -1) * (this.onGround ? Math.abs(Math.sin(this.animT)) * 0.2 : Math.abs(Math.sin(this.age * 20)) * 1.2);
    });
    if (P.head) { let dy = this.headYaw - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; P.head.rotation.y = Math.max(-1.2, Math.min(1.2, dy)); P.head.rotation.x = -this.headPitch * 0.8; }
    if (P.tail) P.tail.forEach((t, i) => { t.position.x = Math.sin(this.age * 2 - i * 0.5) * (0.4 + i * 0.25); });
    if (this.type === 'slime' && P.body) { const sq = this.onGround ? 1 + Math.max(0, -this.vy) * 0.02 : 1; P.body.scale.set(sq, 1 / sq, sq); }
    if (this.sitting && P.legs.length === 4) { P.legs.forEach(l => l.rotation.x = -1.3); this.obj.position.y = this.y - 0.2; }
    if (this.type === 'ender_dragon') this.obj.rotation.x = -this.vy * 0.05;
    this.syncObject();
    if (this.sitting) this.obj.position.y = this.y - 0.25;
    if (this.flash !== undefined) this.updateLight();
  }
  serialize() { return { type: this.type, x: this.x, y: this.y, z: this.z, health: this.health, extra: { tamed: this.tamed, owner: this.owner, sitting: this.sitting, sheared: this.sheared, color: this.color, colorName: this.colorName, baby: this.baby, growth: this.growth, size: this.size, home: this.home, noDespawn: this.noDespawn, named: this.named, love: this.love } }; }
}

// ---------- item entity ----------
export class ItemEntity extends Entity {
  constructor(game, x, y, z, stack, pickupDelay = 0.5) {
    super(game, x, y, z); this.stack = stack; this.w = 0.25; this.h = 0.25; this.pickupDelay = pickupDelay; this.spin = Math.random() * 6; this.life = 300;
    this.build();
  }
  build() { const r = this.game.renderer; if (this.obj) r.entityGroup.remove(this.obj); const id = this.stack.id; const isB = isBlockItem(id) && BLOCKS[id].render !== 'cross'; this.obj = isB ? r.makeBlockMesh(id, 0) : r.makeItemMesh(id); this.obj.scale.setScalar(isB ? 0.25 : 0.35); uniqueMaterials(this.obj); r.entityGroup.add(this.obj); }
  update(dt) {
    this.age += dt; this.life -= dt; this.pickupDelay -= dt; if (this.life <= 0) { this.remove(); return; }
    this.physics(dt, { groundDrag: 0.5 }); if (this.inWater) this.vy += 20 * dt; if (this.inLava) { this.remove(); return; }
    if (this.y < -20) { this.remove(); return; }
    const p = this.game.nearestPlayer(this.x, this.y, this.z); if (this.pickupDelay <= 0 && p) {
      const d = Math.hypot(p.x - this.x, p.y + 0.9 - this.y, p.z - this.z);
      if (d < 1.6) { const left = p.inventory.add(this.stack); if (left < this.stack.count) { this.game.playSoundAt('pop', this.x, this.y, this.z, { volume: 0.5 }); this.game.ui.invalidateInventory(p); } if (left <= 0) { this.remove(); return; } this.stack.count = left; }
      else if (d < 3) { this.vx += (p.x - this.x) / d * dt * 6; this.vz += (p.z - this.z) / d * dt * 6; }
    }
    // merge with nearby same items
    if (this.pickupDelay <= 0 && this.age % 1 < dt) for (const e of this.game.entities.list) if (e !== this && e instanceof ItemEntity && !e.removed && e.stack.id === this.stack.id && (e.stack.dmg || 0) === (this.stack.dmg || 0) && !e.stack.ench && !this.stack.ench && this.distTo(e) < 0.8 && e.stack.count + this.stack.count <= maxStack(this.stack.id)) { this.stack.count += e.stack.count; e.remove(); }
    if (this.obj) { this.spin += dt * 2; this.obj.position.set(this.x, this.y + 0.15 + Math.sin(this.age * 3) * 0.05, this.z); this.obj.rotation.y = this.spin; this.updateLight(); }
  }
  serialize() { return { type: 'item', x: this.x, y: this.y, z: this.z, stack: this.stack }; }
}
export class XPOrb extends Entity {
  constructor(game, x, y, z, value) { super(game, x, y, z); this.value = value; this.w = 0.3; this.h = 0.3; this.life = 300; const m = new THREE.Mesh(new THREE.SphereGeometry(0.12 + Math.min(0.15, value * 0.01), 6, 6), new THREE.MeshBasicMaterial({ color: value > 20 ? 0xf0f040 : 0x70f040 })); this.obj = m; game.renderer.entityGroup.add(m); this.vx = (Math.random() - 0.5) * 3; this.vy = 3 + Math.random() * 2; this.vz = (Math.random() - 0.5) * 3; }
  update(dt) { this.age += dt; this.life -= dt; if (this.life <= 0) { this.remove(); return; } this.physics(dt, { groundDrag: 0.5 }); const p = this.game.nearestPlayer(this.x, this.y, this.z); if (!p) return; const d = Math.hypot(p.x - this.x, p.y + 0.9 - this.y, p.z - this.z); if (d < 0.9) { p.addXP(this.value); this.game.playSoundAt('orb', this.x, this.y, this.z, { volume: 0.5 }); this.remove(); return; } if (d < 7) { this.vx += (p.x - this.x) / d * dt * 30; this.vy += (p.y + 0.9 - this.y) / d * dt * 30; this.vz += (p.z - this.z) / d * dt * 30; } if (this.obj) { this.obj.position.set(this.x, this.y + 0.15, this.z); this.obj.material.color.setHSL(0.25 + Math.sin(this.age * 6) * 0.05, 0.9, 0.6); } }
}
export class Projectile extends Entity {
  constructor(game, kind, x, y, z, vx, vy, vz, shooter, opts = {}) {
    super(game, x, y, z); this.kind = kind; this.vx = vx; this.vy = vy; this.vz = vz; this.shooter = shooter; this.w = 0.25; this.h = 0.25; this.opts = opts; this.stuck = false; this.life = 60; this.damage = opts.damage || 2;
    const r = game.renderer;
    if (kind === 'arrow') { this.obj = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.6), new THREE.MeshLambertMaterial({ color: 0x8a6a40 })); }
    else if (kind === 'fireball') { this.obj = new THREE.Mesh(new THREE.BoxGeometry(opts.size || 0.6, opts.size || 0.6, opts.size || 0.6), new THREE.MeshBasicMaterial({ color: 0xff8020 })); this.noGravity = true; this.w = this.h = opts.size || 0.6; }
    else if (kind === 'potion') { this.obj = r.makeItemMesh(I.glass_bottle); this.obj.scale.setScalar(0.35); }
    else { this.obj = r.makeItemMesh(kind === 'snowball' ? I.snowball : kind === 'egg' ? I.egg : I.ender_pearl); this.obj.scale.setScalar(0.35); }
    r.entityGroup.add(this.obj);
  }
  update(dt) {
    this.age += dt; this.life -= dt; if (this.life <= 0) { this.remove(); return; }
    const g = this.game;
    if (this.stuck) { this.stuckT = (this.stuckT || 0) + dt; if (this.stuckT > 8) this.remove(); if (this.kind === 'arrow' && this.stuckT > 0.3) { const p = g.nearestPlayer(this.x, this.y, this.z); if (p && Math.hypot(p.x - this.x, p.y + 0.9 - this.y, p.z - this.z) < 1.5) { if (p.gamemode !== 'creative') p.give(makeStack(I.arrow, 1)); g.playSoundAt('pop', this.x, this.y, this.z, { volume: 0.4 }); this.remove(); } } return; }
    const ox = this.x, oy = this.y, oz = this.z;
    if (!this.noGravity) this.vy -= (this.kind === 'arrow' ? 20 : 25) * dt;
    const r = moveEntity(g.world, this, this.vx * dt, this.vy * dt, this.vz * dt);
    if (this.kind === 'fireball') g.particles.emit(this.x, this.y + this.h / 2, this.z, 'smoke', 1);
    if (this.flaming && Math.random() < 0.5) g.particles.emit(this.x, this.y + this.h / 2, this.z, 'flame', 1);
    // hit entities
    const hitE = g.entities.hitTest(this.x, this.y, this.z, this.w, this.shooter);
    let hitP = null;
    if (!hitE) for (const pl of g.players) { if (pl === this.shooter || pl.dead || pl.gamemode === 'spectator' || pl.gamemode === 'creative') continue; if (Math.hypot(pl.x - this.x, pl.y + 0.9 - this.y, pl.z - this.z) < 0.7) { hitP = pl; break; } }
    if (hitE || hitP) {
      const target = hitE || hitP;
      this.onHit(target); return;
    }
    if (r.hitX || r.hitY || r.hitZ) {
      if (this.kind === 'arrow') { this.stuck = true; this.vx = this.vy = this.vz = 0; g.playSoundAt('arrow_hit', this.x, this.y, this.z); }
      else if (this.kind === 'fireball') { const own = this.shooter && this.shooter.type === 'blaze' ? 0 : (this.opts.power || 1); if (own) g.explode(this.x, this.y, this.z, own, this.shooter, true); else { g.world.setBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z), B.fire); } this.remove(); }
      else if (this.kind === 'ender_pearl') { const sh = this.shooter; if (sh && sh.isPlayer) { sh.x = this.x; sh.y = this.y; sh.z = this.z; sh.hurt(5, null, { fall: true }); g.playSoundAt('teleport', this.x, this.y, this.z); } this.remove(); }
      else if (this.kind === 'potion') { g.particles.emit(this.x, this.y, this.z, 'potion', 10); this.remove(); }
      else { if (this.kind === 'egg' && Math.random() < 0.125) g.entities.spawnMob('chicken', this.x, this.y, this.z, { baby: true }); g.particles.emit(this.x, this.y, this.z, 'snow', 6); this.remove(); }
      return;
    }
    if (this.obj) { this.obj.position.set(this.x, this.y + this.h / 2, this.z); const hd = Math.hypot(this.vx, this.vz); this.obj.rotation.y = Math.atan2(-this.vx, -this.vz); this.obj.rotation.x = -Math.atan2(this.vy, hd); }
  }
  onHit(target) {
    const g = this.game;
    if (this.kind === 'arrow' || this.kind === 'fireball' || this.kind === 'potion') {
      let dmg = this.damage; if (this.kind === 'fireball') dmg = 6;
      if (target.isPlayer) { if (this.kind === 'potion') { target.effects.poison = 8; } else target.hurt(dmg, this.shooter || this); if (this.kind === 'fireball') target.fire = 5; }
      else if (target.hurt) { target.hurt(dmg, this.shooter || this, 0.4 + (this.punch || 0) * 0.5); if (this.kind === 'fireball' || this.flaming) target.fire = 5; if (this.shooter && this.shooter.isPlayer) { this.shooter.lastTarget = target; this.shooter.lastTargetT = g.time; } }
      if (this.kind === 'fireball' && this.opts.power) g.explode(this.x, this.y, this.z, this.opts.power, this.shooter, true);
    } else if (this.kind === 'ender_pearl') { const sh = this.shooter; if (sh && sh.isPlayer) { sh.x = this.x; sh.y = this.y; sh.z = this.z; sh.hurt(5, null, { fall: true }); } }
    else { if (target.hurt) target.hurt(this.kind === 'snowball' && target.type === 'blaze' ? 3 : 0, this.shooter, 0.3); }
    this.remove();
  }
}
export class PrimedTNT extends Entity {
  constructor(game, x, y, z, fuse) { super(game, x, y, z); this.fuse = fuse / 20; this.w = 0.98; this.h = 0.98; this.obj = game.renderer.makeBlockMesh(B.tnt, 0); uniqueMaterials(this.obj); game.renderer.entityGroup.add(this.obj); this.vy = 4; this.vx = (Math.random() - 0.5) * 2; this.vz = (Math.random() - 0.5) * 2; game.playSoundAt('fuse', x, y, z); }
  update(dt) { this.age += dt; this.fuse -= dt; this.physics(dt); if (this.fuse <= 0) { this.remove(); this.game.explode(this.x, this.y + 0.5, this.z, 4, this); return; } if (this.obj) { this.obj.position.set(this.x, this.y + 0.49, this.z); this.flash = Math.floor(this.fuse * 5) % 2 === 0; this.updateLight(); } this.game.particles.emit(this.x, this.y + 1, this.z, 'smoke', 1); }
}
export class FallingBlock extends Entity {
  constructor(game, x, y, z, id, meta) { super(game, x + 0.5, y, z + 0.5); this.blockId = id; this.meta = meta; this.w = 0.98; this.h = 0.98; this.obj = game.renderer.makeBlockMesh(id, meta); uniqueMaterials(this.obj); game.renderer.entityGroup.add(this.obj); }
  update(dt) { this.age += dt; const r = this.physics(dt); if (this.obj) { this.obj.position.set(this.x, this.y + 0.49, this.z); this.updateLight(); }
    if (this.onGround || this.age > 30) { const bx = Math.floor(this.x), by = Math.round(this.y), bz = Math.floor(this.z); const cur = this.game.world.getBlock(bx, by, bz); if (cur === 0 || BLOCKS[cur].replaceable) this.game.world.setBlock(bx, by, bz, this.blockId, this.meta); else this.game.entities.dropItem(this.x, this.y, this.z, makeStack(this.blockId, 1)); if (this.blockId === B.anvil && this.age > 0.5) for (const p of this.game.players) { if (Math.abs(p.x - this.x) < 0.8 && Math.abs(p.z - this.z) < 0.8 && Math.abs(p.y + 1.8 - this.y) < 1.2) p.hurt(Math.min(20, Math.floor(this.age * 8)), null); } this.remove(); }
    if (this.y < -5) this.remove(); }
}

// ---------- particles ----------
export class Particles {
  constructor(game) {
    this.game = game; this.N = 1500; this.pos = new Float32Array(this.N * 3); this.col = new Float32Array(this.N * 3); this.data = []; this.free = []; for (let i = 0; i < this.N; i++) { this.free.push(i); this.pos[i * 3 + 1] = -1000; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.15, vertexColors: true, sizeAttenuation: true })); this.points.frustumCulled = false; game.renderer.scene.add(this.points);
  }
  emit(x, y, z, type, count = 1, blockId = 0) {
    for (let n = 0; n < count; n++) {
      if (!this.free.length) return; const i = this.free.pop();
      let c = [1, 1, 1], life = 1, vx = (Math.random() - 0.5) * 2, vy = Math.random() * 3, vz = (Math.random() - 0.5) * 2, grav = 12;
      if (type === 'block') { const t = generateTile(faceTexName(BLOCKS[blockId], 0, 4)); const p = Math.floor(Math.random() * 256) * 4; c = [t.d[p] / 255, t.d[p + 1] / 255, t.d[p + 2] / 255]; if (t.d[p + 3] < 50) c = [0.5, 0.5, 0.5]; vx *= 2; vz *= 2; }
      else if (type === 'smoke') { c = [0.3, 0.3, 0.3]; vx *= 0.2; vz *= 0.2; vy = 0.8; grav = -0.5; life = 1.2; }
      else if (type === 'flame') { c = [1, 0.6, 0.1]; vx *= 0.3; vz *= 0.3; vy = 1; grav = -1; life = 0.6; }
      else if (type === 'heart') { c = [1, 0.2, 0.3]; vx *= 0.3; vz *= 0.3; vy = 1; grav = -0.3; life = 1; }
      else if (type === 'happy') { c = [0.3, 1, 0.3]; vy = 1.5; grav = 2; life = 0.8; }
      else if (type === 'portal') { c = [0.7, 0.2, 0.9]; vy = (Math.random() - 0.5) * 3; grav = 0; life = 1; }
      else if (type === 'crit') { c = [1, 1, 0.5]; vy = 2; life = 0.5; }
      else if (type === 'snow') { c = [1, 1, 1]; life = 0.6; }
      else if (type === 'water') { c = [0.3, 0.5, 1]; life = 0.6; }
      else if (type === 'explosion') { c = [0.9, 0.9, 0.9]; vx *= 6; vy = (Math.random() - 0.5) * 12; vz *= 6; grav = 0; life = 0.7; }
      else if (type === 'potion') { c = [0.4, 0.8, 0.4]; life = 0.8; }
      else if (type === 'bubble') { c = [0.8, 0.9, 1]; vy = 1.5; grav = -1; life = 0.8; vx *= 0.2; vz *= 0.2; }
      this.data[i] = { x, y, z, vx, vy, vz, life, grav };
      this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    }
    this.points.geometry.attributes.color.needsUpdate = true;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.N; i++) { const d = this.data[i]; if (!d) continue; any = true; d.life -= dt; if (d.life <= 0) { this.data[i] = null; this.free.push(i); this.pos[i * 3 + 1] = -1000; continue; } d.vy -= d.grav * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; if (d.grav > 5 && BLOCKS[this.game.world.getBlock(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z))].solid) { d.y -= d.vy * dt; d.vy = 0; d.vx *= 0.5; d.vz *= 0.5; } this.pos[i * 3] = d.x; this.pos[i * 3 + 1] = d.y; this.pos[i * 3 + 2] = d.z; }
    if (any) this.points.geometry.attributes.position.needsUpdate = true;
    const l = this.game.sunLevel; this.points.material.opacity = 1; 
  }
}

// ---------- manager ----------
export class EntityManager {
  constructor(game) { this.game = game; this.list = []; this.spawnT = 0; this.passiveT = 0; }
  add(e) { this.list.push(e); return e; }
  spawnMob(type, x, y, z, extra = {}) { if (!MOBS[type]) return null; const m = new Mob(this.game, type, x, y, z, extra); if (type === 'sheep' && !extra.color) { const r = Math.random(); m.colorName = r < 0.82 ? 'white' : r < 0.88 ? 'black' : r < 0.93 ? 'gray' : r < 0.98 ? 'light_gray' : 'pink'; m.color = this.game.consts.COLOR_HEX[m.colorName]; m.buildModel(); } if (extra.colorName) { m.colorName = extra.colorName; } if (type === 'horse' && !extra.color) { m.color = [0x8a5a30, 0xc0a070, 0x3a2a1a, 0xd8d8d8, 0x6a4a2a][Math.floor(Math.random() * 5)]; m.buildModel(); } if (type === 'cat' && !extra.color) { m.color = [0xd0a050, 0x303030, 0xe8e8e8, 0x8a6a4a][Math.floor(Math.random() * 4)]; m.buildModel(); } return this.add(m); }
  dropItem(x, y, z, stack, scatter = false, vel = null) { if (!stack || stack.count <= 0) return null; const st = { id: stack.id, count: stack.count, dmg: stack.dmg || 0 }; if (stack.ench) st.ench = { ...stack.ench }; const e = new ItemEntity(this.game, x, y, z, st); if (scatter) { e.vx = (Math.random() - 0.5) * 3; e.vy = 3 + Math.random() * 2; e.vz = (Math.random() - 0.5) * 3; } if (vel) { e.vx = vel[0]; e.vy = vel[1]; e.vz = vel[2]; e.pickupDelay = 1.5; } return this.add(e); }
  spawnXP(x, y, z, amount) { while (amount > 0) { const v = amount >= 37 ? 37 : amount >= 17 ? 17 : amount >= 7 ? 7 : amount >= 3 ? 3 : 1; amount -= v; this.add(new XPOrb(this.game, x, y, z, v)); } }
  spawnArrow(shooter, target, speed = 1, damage = 2) { const sx = shooter.x, sy = shooter.y + (shooter.h || 1.8) * 0.85, sz = shooter.z; let dx, dy, dz; if (target) { dx = target.x - sx; dy = target.y + (target.h || 1.8) * 0.5 - sy; dz = target.z - sz; const d = Math.hypot(dx, dz); dy += d * 0.08; } else { dx = -Math.sin(shooter.yaw) * Math.cos(shooter.pitch); dy = Math.sin(shooter.pitch); dz = -Math.cos(shooter.yaw) * Math.cos(shooter.pitch); } const d = Math.hypot(dx, dy, dz) || 1; const v = 28 * speed; return this.add(new Projectile(this.game, 'arrow', sx + dx / d * 0.5, sy, sz + dz / d * 0.5, dx / d * v, dy / d * v, dz / d * v, shooter, { damage })); }
  spawnFireball(shooter, target, size) { const sx = shooter.x, sy = shooter.y + shooter.h * 0.6, sz = shooter.z; const dx = target.x - sx, dy = target.y + 1 - sy, dz = target.z - sz; const d = Math.hypot(dx, dy, dz) || 1; const v = 14; return this.add(new Projectile(this.game, 'fireball', sx + dx / d * 2, sy, sz + dz / d * 2, dx / d * v, dy / d * v, dz / d * v, shooter, { size, power: shooter.type === 'blaze' ? 0 : size > 1 ? 1.5 : 1 })); }
  spawnPotion(shooter, target) { const sx = shooter.x, sy = shooter.y + 1.5, sz = shooter.z; const dx = target.x - sx, dy = target.y + 1 - sy, dz = target.z - sz; const d = Math.hypot(dx, dz) || 1; return this.add(new Projectile(this.game, 'potion', sx, sy, sz, dx / d * 10, 5 + dy, dz / d * 10, shooter)); }
  throwItem(player, kind) { const dx = -Math.sin(player.yaw) * Math.cos(player.pitch), dy = Math.sin(player.pitch), dz = -Math.cos(player.yaw) * Math.cos(player.pitch); const v = 22; return this.add(new Projectile(this.game, kind, player.x + dx * 0.5, player.y + 1.5, player.z + dz * 0.5, dx * v + player.vx, dy * v, dz * v + player.vz, player)); }
  spawnTNT(x, y, z, fuse) { return this.add(new PrimedTNT(this.game, x, y, z, fuse)); }
  spawnFallingBlock(x, y, z, id, meta) { return this.add(new FallingBlock(this.game, x, y, z, id, meta)); }
  hitTest(x, y, z, r, exclude) { for (const e of this.list) { if (e === exclude || e.removed || e.dead || !(e instanceof Mob)) continue; if (Math.abs(e.x - x) < e.w / 2 + r && Math.abs(e.z - z) < e.w / 2 + r && y > e.y - r && y < e.y + e.h + r) return e; } return null; }
  canSee(a, b) { const ax = a.x, ay = a.y + (a.h || 1.8) * 0.85, az = a.z; const bx = b.x, by = b.y + (b.h || 1.8) * 0.5, bz = b.z; const dx = bx - ax, dy = by - ay, dz = bz - az; const d = Math.hypot(dx, dy, dz) || 1; const hit = this.game.world.raycast(ax, ay, az, dx / d, dy / d, dz / d, d); return !hit; }
  // Pick the mob the player is looking at within reach
  raycastEntities(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = null, bd = maxDist;
    for (const e of this.list) { if (e.removed || e.dead || !(e instanceof Mob)) continue; const pad = 0.1; const t = rayAABB(ox, oy, oz, dx, dy, dz, e.x - e.w / 2 - pad, e.y - pad, e.z - e.w / 2 - pad, e.x + e.w / 2 + pad, e.y + e.h + pad, e.z + e.w / 2 + pad); if (t !== null && t < bd) { bd = t; best = e; } }
    return best ? { entity: best, dist: bd } : null;
  }
  countMobs(filter) { let n = 0; for (const e of this.list) if (e instanceof Mob && !e.dead && filter(e)) n++; return n; }
  update(dt) {
    const g = this.game;
    for (const e of this.list) { if (e.removed) continue; let d2 = Infinity; for (const pl of g.players) d2 = Math.min(d2, (e.x - pl.x) ** 2 + (e.z - pl.z) ** 2); if (d2 > 110 * 110) { if (e instanceof Mob && !e.noDespawn && !e.def.boss) e.remove(); continue; } if (!g.world.isLoaded(Math.floor(e.x), Math.floor(e.z))) continue; try { e.update(dt); } catch (err) { console.error('entity update', e.type, err); e.remove(); } }
    // random despawn far away
    if (Math.random() < dt * 0.5) for (const e of this.list) if (e instanceof Mob && !e.noDespawn && !e.def.boss && !e.dead) { const d = g.nearestPlayerDist(e.x, e.y, e.z); if (d > 40 && Math.random() < 0.02) e.remove(); }
    this.list = this.list.filter(e => !e.removed);
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 0.8; this.trySpawn(); }
    this.passiveT -= dt; if (this.passiveT <= 0) { this.passiveT = 12; this.tryPassiveSpawn(); }
  }
  trySpawn() {
    const g = this.game, w = g.world; const p = g.players[Math.floor(Math.random() * g.players.length)] || g.player; if (g.difficulty === 0) { for (const e of this.list) if (e instanceof Mob && e.def.hostile && !e.def.boss) e.remove(); return; }
    const hostileCount = this.countMobs(e => e.def.hostile);
    const cap = 30 + g.difficulty * 6; if (hostileCount >= cap) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 30;
      const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
      if (!w.isLoaded(x, z)) continue;
      const y = Math.floor(Math.random() * (w.dim === 2 ? 70 : CY - 2)) + 1;
      const below = w.getBlock(x, y - 1, z); const bd = BLOCKS[below];
      const inWater = w.getBlock(x, y, z) === B.water;
      if (!inWater && (w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0 || !bd.opaque || below === B.bedrock)) continue;
      const light = w.getLightLevel(x, y, z, g.sunLevel); const sky = w.getSky(x, y, z);
      let types;
      if (w.dim === 1) { const bm = w.biomeAt(x, z).id; types = bm === 'soul_sand_valley' ? ['skeleton', 'ghast'] : bm === 'basalt_deltas' ? ['slime_placeholder'] : bm === 'warped_forest' ? ['enderman'] : ['zombified_piglin', 'zombified_piglin', 'zombified_piglin', 'ghast', 'blaze']; if (bd.id === B.nether_bricks) types = ['blaze', 'skeleton']; if (types[0] === 'slime_placeholder') types = ['slime']; }
      else if (w.dim === 2) { types = ['enderman']; }
      else {
        if (light > 7 && !inWater) continue;
        if (inWater) { if (light > 7 && sky > 7) continue; types = ['drowned']; }
        else { const biome = w.biomeAt(x, z); if (biome.peaceful) continue; types = ['zombie', 'zombie', 'skeleton', 'creeper', 'spider']; if (biome.id === 'desert' && sky > 8) types = ['husk', 'husk', 'skeleton', 'creeper']; if (biome.snow && sky > 8) types = ['stray', 'zombie', 'creeper', 'spider']; if (biome.swamp) types.push('slime', 'witch'); if (Math.random() < 0.05) types = ['enderman']; if (y < 40 && Math.random() < 0.15) types = ['cave_spider', 'slime']; if (!g.isDay() && g.daysSinceSleep >= 3 && sky >= 15 && Math.random() < 0.2) types = ['phantom']; }
      }
      const type = types[Math.floor(Math.random() * types.length)];
      if (!MOBS[type]) continue;
      const pack = type === 'ghast' || type === 'enderman' || type === 'phantom' ? 1 : 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < pack; i++) { const sx = x + 0.5 + (Math.random() - 0.5) * 3, sz = z + 0.5 + (Math.random() - 0.5) * 3; if (!intersectsSolid(w, sx - 0.3, y, sz - 0.3, sx + 0.3, y + 1.8, sz + 0.3)) this.spawnMob(type, sx, type === 'ghast' ? y + 6 : y, sz); }
      return;
    }
  }
  tryPassiveSpawn() {
    const g = this.game, w = g.world; const p = g.players[Math.floor(Math.random() * g.players.length)] || g.player; if (w.dim !== 0) return;
    if (this.countMobs(e => e.def.passive) > 16) return;
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 25; const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
    if (!w.isLoaded(x, z)) return; const y = w.surfaceY(x, z) + 1; if (w.getBlock(x, y - 1, z) !== B.grass_block || w.getSky(x, y, z) < 9) return;
    const biome = w.biomeAt(x, z); const types = this.passiveTypesFor(biome); if (!types.length) return;
    const type = types[Math.floor(Math.random() * types.length)]; const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.spawnMob(type, x + 0.5 + (Math.random() - 0.5) * 4, y, z + 0.5 + (Math.random() - 0.5) * 4);
  }
  passiveTypesFor(biome) {
    switch (biome.id) { case 'plains': case 'sunflower_plains': return ['cow', 'pig', 'sheep', 'chicken', 'horse']; case 'forest': case 'birch_forest': case 'dark_forest': case 'flower_forest': return ['cow', 'pig', 'sheep', 'chicken', 'wolf']; case 'taiga': case 'snowy_taiga': return ['wolf', 'sheep', 'chicken']; case 'savanna': return ['horse', 'cow', 'sheep']; case 'jungle': return ['chicken', 'cat']; case 'swamp': return ['pig', 'chicken']; case 'cherry_grove': return ['sheep', 'pig', 'bee']; case 'windswept_hills': return ['sheep']; default: return []; }
  }
  // initial population of a freshly generated chunk
  populateChunk(chunk) {
    const g = this.game, w = g.world; if (chunk.entitiesSpawned) return; chunk.entitiesSpawned = true;
    if (chunk.savedEntities) { for (const s of chunk.savedEntities) this.deserialize(s); chunk.savedEntities = null; return; }
    if (w.dim !== 0) return;
    const bx = chunk.cx * CX, bz = chunk.cz * CZ;
    // villagers near beds, golems near village wells
    let beds = 0, well = false;
    for (const [k] of [[0]]) { for (let x = 0; x < CX; x++) for (let z = 0; z < CZ; z++) for (let y = 40; y < CY; y++) { const id = chunk.get(x, y, z); if (id === B.bed && (chunk.getMeta(x, y, z) & 4)) { beds++; if (Math.random() < 0.7) this.spawnMob('villager', bx + x + 0.5, y + 1, bz + z + 0.5, { home: { x: bx + x, y, z: bz + z }, noDespawn: true }); } if (id === B.cobblestone_wall && !well && chunk.get(x, y - 2, z) === B.cobblestone) { well = true; } } }
    if (well && Math.random() < 0.6) { const x = bx + 8, z = bz + 8; this.spawnMob('iron_golem', x + 3, w.surfaceY(x + 3, z) + 1, z + 3, { noDespawn: true }); }
    if (Math.random() > 0.12) return;
    const x = bx + 4 + Math.floor(Math.random() * 8), z = bz + 4 + Math.floor(Math.random() * 8); const y = chunk.topY(x - bx, z - bz) + 1;
    if (chunk.get(x - bx, y - 1, z - bz) !== B.grass_block) return;
    const types = this.passiveTypesFor(w.biomeAt(x, z)); if (!types.length) return;
    const type = types[Math.floor(Math.random() * types.length)]; const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.spawnMob(type, x + 0.5 + (Math.random() - 0.5) * 4, y, z + 0.5 + (Math.random() - 0.5) * 4);
  }
  // save/restore
  serializeChunk(chunk) { const out = []; for (const e of this.list) if (!e.removed && !e.dead && e.cx === chunk.cx && e.cz === chunk.cz) { const s = e.serialize(); if (s) out.push(s); } return out; }
  unloadChunk(chunk) { const saved = this.serializeChunk(chunk); for (const e of this.list) if (e.cx === chunk.cx && e.cz === chunk.cz) e.remove(); this.list = this.list.filter(e => !e.removed); return saved; }
  deserialize(s) { if (s.type === 'item') return this.dropItem(s.x, s.y, s.z, s.stack); if (MOBS[s.type]) return this.spawnMob(s.type, s.x, s.y, s.z, Object.assign({ health: s.health }, s.extra || {})); return null; }
  clear() { for (const e of this.list) e.remove(); this.list = []; }
}

function rayAABB(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity;
  for (const [o, d, lo, hi] of [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return null;
  }
  return tmin;
}
export { MOBS, humanoid as humanoidModel };
