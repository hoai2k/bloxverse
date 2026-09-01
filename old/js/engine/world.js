// ============================================================
// BLOXVERSE engine — world building: procedural canvas textures
// (studs, grass, brick, roads, windows...) + map part helpers.
// ============================================================
import * as THREE from 'three';

// ---------------- deterministic RNG ----------------
// Seeded generators so every client builds an IDENTICAL world from the same
// seed (required for multiplayer: remote players are rendered at absolute
// world coordinates, so the geometry under those coordinates must match on
// every machine, or friends appear to float/teleport).
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 — tiny, fast, well-distributed PRNG. Returns a function that
// yields floats in [0,1); same seed → same sequence on every platform.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- procedural textures ----------------
const texCache = new Map();
function canvasTex(key, size, draw, repeat = 1) {
  const k = `${key}|${repeat}`;
  if (texCache.has(k)) return texCache.get(k);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  texCache.set(k, tex);
  return tex;
}

export function studsTexture(base = '#6dab53', repeat = 16) {
  return canvasTex('studs' + base, 128, (c, s) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    const grid = 4, cell = s / grid;
    for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
      const cx = x * cell + cell / 2, cy = y * cell + cell / 2;
      c.fillStyle = 'rgba(255,255,255,0.10)';
      c.beginPath(); c.arc(cx, cy - 1.5, cell * 0.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.14)';
      c.beginPath(); c.arc(cx, cy + 1.5, cell * 0.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = base;
      c.beginPath(); c.arc(cx, cy, cell * 0.28, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.06)';
      c.beginPath(); c.arc(cx, cy, cell * 0.28, 0, Math.PI * 2); c.fill();
    }
  }, repeat);
}

export function grassTexture(base = '#5d9e4a', repeat = 24) {
  return canvasTex('grass' + base, 128, (c, s) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 500; i++) {
      const a = Math.random();
      c.fillStyle = a < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
      c.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  }, repeat);
}

export function asphaltTexture(repeat = 8) {
  return canvasTex('asphalt', 128, (c, s) => {
    c.fillStyle = '#3c3f43';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.1)';
      c.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  }, repeat);
}

export function roadTexture() {
  // one tile = one road segment with center dashes, repeat along length
  return canvasTex('road', 128, (c, s) => {
    c.fillStyle = '#3c3f43';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 300; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.1)';
      c.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    c.fillStyle = '#e8d44d';
    c.fillRect(s / 2 - 3, 10, 6, 44);
    c.fillRect(s / 2 - 3, 74, 6, 44);
  }, 1);
}

export function brickTexture(base = '#b8574b', repeat = 6) {
  return canvasTex('brick' + base, 128, (c, s) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 3;
    const rh = s / 4;
    for (let r = 0; r < 4; r++) {
      c.beginPath(); c.moveTo(0, r * rh); c.lineTo(s, r * rh); c.stroke();
      const off = r % 2 ? s / 4 : 0;
      for (let x = 0; x < 3; x++) {
        c.beginPath(); c.moveTo(off + x * (s / 2), r * rh); c.lineTo(off + x * (s / 2), (r + 1) * rh); c.stroke();
      }
    }
    c.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 60; i++) c.fillRect(Math.random() * s, Math.random() * s, 3, 2);
  }, repeat);
}

export function windowsTexture(base = '#4b5560', lit = 0.5, repeat = 1) {
  return canvasTex(`win${base}${lit}`, 256, (c, s) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    const cols = 5, rows = 6, pw = s / cols, ph = s / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const isLit = Math.random() < lit;
      c.fillStyle = isLit ? (Math.random() < 0.5 ? '#ffd98a' : '#bcd6e8') : '#222831';
      c.fillRect(x * pw + pw * 0.18, y * ph + ph * 0.18, pw * 0.64, ph * 0.6);
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(x * pw + pw * 0.18, y * ph + ph * 0.18, pw * 0.64, ph * 0.12);
    }
  }, repeat);
}

export function plankTexture(base = '#9a6b3f', repeat = 4) {
  return canvasTex('plank' + base, 128, (c, s) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(0,0,0,0.28)';
    c.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(0, i * s / 4); c.lineTo(s, i * s / 4); c.stroke(); }
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const y = Math.random() * s;
      c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(s / 3, y + 3, s * 2 / 3, y - 3, s, y); c.stroke();
    }
  }, repeat);
}

export function checkerTexture(a = '#e5e7ea', b = '#c9ccd1', repeat = 8) {
  return canvasTex(`chk${a}${b}`, 64, (c, s) => {
    c.fillStyle = a; c.fillRect(0, 0, s, s);
    c.fillStyle = b;
    c.fillRect(0, 0, s / 2, s / 2);
    c.fillRect(s / 2, s / 2, s / 2, s / 2);
  }, repeat);
}

// ---------------- materials ----------------
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({
      color,
      emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: !!opts.opacity && opts.opacity < 1,
      opacity: opts.opacity ?? 1,
    }));
  }
  return matCache.get(key);
}

// ---------------- part builders ----------------
// Generic box part: creates mesh (+ optional collider) in one call.
export function part(scene, world, o) {
  const geo = new THREE.BoxGeometry(o.w, o.h, o.d);
  let material;
  if (o.mat) material = o.mat;
  else if (o.tex) material = new THREE.MeshLambertMaterial({ map: o.tex, color: o.color || '#ffffff' });
  else material = mat(o.color || '#aaaaaa', o);
  const m = new THREE.Mesh(geo, material);
  m.position.set(o.x, o.y, o.z);
  if (o.ry) m.rotation.y = o.ry;
  m.castShadow = o.castShadow !== false;
  m.receiveShadow = o.receiveShadow !== false;
  scene.add(m);
  let col = null;
  if (world && o.collide !== false) {
    col = world.addCollider(m, { solid: o.solid !== false, touch: o.touch, data: o.data });
  }
  return { mesh: m, col };
}

export function ground(scene, world, size, tex, y = 0) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(size, 2, size),
    new THREE.MeshLambertMaterial({ map: tex }));
  g.position.y = y - 1;
  g.receiveShadow = true;
  scene.add(g);
  world.addCollider(g);
  return g;
}

export function building(scene, world, x, z, w, d, h, opts = {}) {
  const bodyColor = opts.color || ['#8d99a6', '#a6764f', '#7b8894', '#997a63', '#6f7f8c'][Math.floor(Math.random() * 5)];
  const winTex = windowsTexture(bodyColor, opts.lit ?? 0.45);
  winTex.repeat.set(Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(h / 16)));
  const matWin = new THREE.MeshLambertMaterial({ map: winTex });
  const matTop = mat(new THREE.Color(bodyColor).multiplyScalar(0.8).getStyle());
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [matWin, matWin, matTop, matTop, matWin, matWin]);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  world.addCollider(mesh);
  // roof lip
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1, d + 1), matTop);
  lip.position.set(x, h + 0.5, z);
  scene.add(lip);
  world.addCollider(lip);
  return mesh;
}

export function tree(scene, world, x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * scale, 0.7 * scale, 4 * scale, 7), mat('#6d4a2f'));
  trunk.position.y = 2 * scale;
  trunk.castShadow = true;
  const leaf = (yy, s) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), mat('#3f8a3c'));
    l.position.y = yy;
    l.castShadow = true;
    return l;
  };
  g.add(trunk, leaf(5 * scale, 2.4 * scale), leaf(6.6 * scale, 1.7 * scale));
  g.position.set(x, 0, z);
  scene.add(g);
  if (world) {
    const b = new THREE.Box3(
      new THREE.Vector3(x - 0.7 * scale, 0, z - 0.7 * scale),
      new THREE.Vector3(x + 0.7 * scale, 4 * scale, z + 0.7 * scale));
    world.addBox3(b);
  }
  return g;
}

export function lampPost(scene, world, x, z, on = true) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 9, 6), mat('#2f3338'));
  pole.position.y = 4.5;
  const armGeo = new THREE.BoxGeometry(2.2, 0.22, 0.22);
  const arm = new THREE.Mesh(armGeo, mat('#2f3338'));
  arm.position.set(0.9, 8.9, 0);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.6),
    mat('#fff2c0', on ? { emissive: '#ffdf8a', emissiveIntensity: 1.5 } : {}));
  bulb.position.set(1.8, 8.75, 0);
  g.add(pole, arm, bulb);
  g.position.set(x, 0, z);
  scene.add(g);
  if (world) world.addBox3(new THREE.Box3(
    new THREE.Vector3(x - 0.3, 0, z - 0.3), new THREE.Vector3(x + 0.3, 9, z + 0.3)));
  let light = null;
  if (on) {
    light = new THREE.PointLight(0xffdf8a, 30, 22, 1.8);
    light.position.set(x + 1.8, 8.3, z);
    scene.add(light);
  }
  return { group: g, bulb, light };
}

export function bench(scene, world, x, z, ry = 0) {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ map: plankTexture('#8a5c33', 2) });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(5, 0.35, 1.6), wood);
  seat.position.y = 1.5;
  const back = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 0.3), wood);
  back.position.set(0, 2.5, -0.75);
  const legMat = mat('#3a3d40');
  for (const sx of [-2, 2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.5, 1.4), legMat);
    leg.position.set(sx, 0.75, 0);
    g.add(leg);
  }
  g.add(seat, back);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  scene.add(g);
  if (world) world.addCollider(g.children[2] /* seat */);
  return g;
}

// simple drifting clouds; returns update fn
export function clouds(scene, n = 10, area = 400, height = 90) {
  const group = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });
  const items = [];
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group();
    const parts = 2 + Math.floor(Math.random() * 3);
    for (let p = 0; p < parts; p++) {
      const s = 8 + Math.random() * 14;
      const b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.35, s * 0.7), m);
      b.position.set(p * s * 0.55 - parts * 3, Math.random() * 2, Math.random() * 4);
      c.add(b);
    }
    c.position.set((Math.random() - 0.5) * area, height + Math.random() * 30, (Math.random() - 0.5) * area);
    group.add(c);
    items.push({ c, speed: 1 + Math.random() * 2 });
  }
  scene.add(group);
  return (dt) => {
    for (const it of items) {
      it.c.position.x += it.speed * dt;
      if (it.c.position.x > area / 2 + 40) it.c.position.x = -area / 2 - 40;
    }
  };
}

// gradient sky dome
export function skyDome(scene, topColor = '#7ec8f2', bottomColor = '#dff1fb') {
  const geo = new THREE.SphereGeometry(900, 24, 12);
  const matSky = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(topColor) },
      bottom: { value: new THREE.Color(bottomColor) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
      void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottom, top, smoothstep(0.35, 0.8, h)), 1.0); }`,
  });
  const dome = new THREE.Mesh(geo, matSky);
  dome.name = 'sky';
  scene.add(dome);
  return dome;
}
