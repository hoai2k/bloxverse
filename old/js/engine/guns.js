// ============================================================
// BLOXVERSE engine — guns: weapon definitions, box-built view
// models, hitscan firing with tracers, muzzle flash, impacts.
// ============================================================
import * as THREE from 'three';
import { sfx } from './sfx.js';

export const WEAPONS = {
  ar: {
    id: 'ar', name: 'Assault Rifle', icon: '🔫',
    damage: 8, rpm: 600, spread: 0.022, range: 300,
    mag: 30, reload: 2.0, auto: true, sound: 'shoot_ar',
    tracer: '#ffd166', pose: 'rifle', headMult: 1.6,
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', icon: '💥',
    damage: 7, rpm: 78, spread: 0.065, pellets: 8, range: 90,
    mag: 6, reload: 2.6, auto: false, sound: 'shoot_shotgun',
    tracer: '#ff9f43', pose: 'rifle', headMult: 1.4,
  },
  sniper: {
    id: 'sniper', name: 'Sniper', icon: '🎯',
    damage: 70, rpm: 38, spread: 0.001, range: 600,
    mag: 5, reload: 3.0, auto: false, sound: 'shoot_sniper',
    tracer: '#74d0f1', pose: 'rifle', headMult: 2.0, zoom: true,
  },
  pistol: {
    id: 'pistol', name: 'Pistol', icon: '🔸',
    damage: 22, rpm: 320, spread: 0.015, range: 200,
    mag: 12, reload: 1.4, auto: false, sound: 'shoot_pistol',
    tracer: '#e8e8e8', pose: 'pistol', headMult: 1.8,
  },
};

// ---------------- box-built gun models ----------------
export function buildGunMesh(kind) {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: '#26282c' });
  const grey = new THREE.MeshLambertMaterial({ color: '#4a4e55' });
  const wood = new THREE.MeshLambertMaterial({ color: '#6d4a2f' });
  const B = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  if (kind === 'ar') {
    B(0.22, 0.28, 1.7, dark, 0, 0, 0.5);          // body
    B(0.12, 0.12, 0.9, grey, 0, 0.02, 1.7);       // barrel
    B(0.16, 0.5, 0.26, dark, 0, -0.35, 0.35);     // mag
    B(0.18, 0.3, 0.5, dark, 0, -0.05, -0.5);      // stock
    B(0.08, 0.14, 0.5, grey, 0, 0.24, 0.7);       // sight
  } else if (kind === 'shotgun') {
    B(0.24, 0.26, 1.5, wood, 0, 0, 0.4);
    B(0.15, 0.15, 1.2, dark, 0, 0.05, 1.4);
    B(0.15, 0.13, 0.7, grey, 0, -0.12, 1.1);      // pump
    B(0.2, 0.34, 0.5, wood, 0, -0.08, -0.5);
  } else if (kind === 'sniper') {
    B(0.2, 0.26, 2.1, dark, 0, 0, 0.6);
    B(0.1, 0.1, 1.2, grey, 0, 0.03, 2.1);
    B(0.14, 0.2, 0.6, dark, 0, 0.3, 0.5);         // scope base
    const scope = B(0.16, 0.16, 0.7, grey, 0, 0.42, 0.5);
    scope.geometry = new THREE.CylinderGeometry(0.11, 0.11, 0.7, 8);
    scope.rotation.x = Math.PI / 2;
    B(0.18, 0.34, 0.55, dark, 0, -0.1, -0.6);
    B(0.14, 0.42, 0.22, dark, 0, -0.3, 0.5);
  } else { // pistol
    B(0.18, 0.22, 0.75, dark, 0, 0.05, 0.15);
    B(0.15, 0.4, 0.24, grey, 0, -0.2, -0.1);
  }
  g.userData.muzzle = kind === 'sniper' ? 2.7 : kind === 'ar' ? 2.15 : kind === 'shotgun' ? 2.0 : 0.6;
  return g;
}

// ---------------- transient FX ----------------
const fx = [];
const _tmp = new THREE.Vector3();

export function spawnTracer(scene, from, to, color = '#ffd166') {
  const len = from.distanceTo(to);
  if (len < 0.5) return;
  const geo = new THREE.CylinderGeometry(0.035, 0.035, len, 4, 1, true);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.lookAt(to);
  m.rotateX(Math.PI / 2);
  scene.add(m);
  fx.push({ mesh: m, life: 0.09, fade: 0.09 });
}

export function spawnImpact(scene, at, color = '#cccccc') {
  const geo = new THREE.SphereGeometry(0.22, 6, 4);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  m.position.copy(at);
  scene.add(m);
  fx.push({ mesh: m, life: 0.14, fade: 0.14, grow: 4 });
}

export function spawnMuzzleFlash(gun) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 6, 4),
    new THREE.MeshBasicMaterial({ color: '#ffd28a', transparent: true, opacity: 0.95 }));
  m.position.set(0, 0.02, gun.userData.muzzle || 1.6);
  m.scale.set(1, 1, 1.8);
  gun.add(m);
  fx.push({ mesh: m, life: 0.05, fade: 0.05, grow: 6 });
}

export function updateGunFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= dt;
    if (f.grow) {
      const s = 1 + (1 - Math.max(0, f.life) / f.fade) * f.grow * dt * 30;
      f.mesh.scale.multiplyScalar(Math.min(1.4, s));
    }
    f.mesh.material.opacity = Math.max(0, f.life / f.fade) * 0.9;
    if (f.life <= 0) {
      f.mesh.parent?.remove(f.mesh);
      f.mesh.geometry.dispose();
      f.mesh.material.dispose();
      fx.splice(i, 1);
    }
  }
}

// ---------------- hitscan ----------------
// targets: [{id, char, ctrl, alive, team}] — hits nearest target or wall.
// Returns {target, point, headshot, dist} | {point} (wall) | null
export function hitscan({ world, scene, origin, dir, weapon, targets, shooterId, maxDist }) {
  const range = maxDist ?? weapon.range;
  const wall = world.raycast(origin, dir, range);
  let wallDist = wall ? wall.dist : range;

  let best = null;
  const ray = new THREE.Ray(origin, dir);
  const box = new THREE.Box3();
  for (const t of targets) {
    if (!t.alive || t.id === shooterId) continue;
    const p = t.ctrl.pos;
    box.min.set(p.x - 1.1, p.y, p.z - 1.1);
    box.max.set(p.x + 1.1, p.y + 5.2, p.z + 1.1);
    if (ray.intersectBox(box, _tmp)) {
      const d = origin.distanceTo(_tmp);
      if (d < wallDist && d <= range && (!best || d < best.dist)) {
        const headshot = _tmp.y > p.y + 4.0;
        best = { target: t, point: _tmp.clone(), headshot, dist: d };
      }
    }
  }
  if (best) {
    spawnTracer(scene, origin, best.point, weapon.tracer);
    spawnImpact(scene, best.point, best.headshot ? '#ff5b5b' : '#ffb0a0');
    return best;
  }
  if (wall) {
    spawnTracer(scene, origin, wall.point, weapon.tracer);
    spawnImpact(scene, wall.point, '#c9c9c9');
    return { point: wall.point, dist: wall.dist };
  }
  const end = origin.clone().addScaledVector(dir, range);
  spawnTracer(scene, origin, end, weapon.tracer);
  return null;
}

export function spreadDir(baseDir, spread) {
  const d = baseDir.clone();
  d.x += (Math.random() - 0.5) * 2 * spread;
  d.y += (Math.random() - 0.5) * 2 * spread;
  d.z += (Math.random() - 0.5) * 2 * spread;
  return d.normalize();
}

// Simple ammo/refire/reload state machine shared by player + bots
export class GunState {
  constructor(weaponId) { this.set(weaponId); }
  set(weaponId) {
    this.weapon = WEAPONS[weaponId];
    this.ammo = this.weapon.mag;
    this.reserve = Infinity;
    this.cool = 0;
    this.reloading = 0;
  }
  update(dt) {
    if (this.cool > 0) this.cool -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.ammo = this.weapon.mag;
    }
  }
  canFire() { return this.cool <= 0 && this.reloading <= 0 && this.ammo > 0; }
  fire() {
    this.ammo--;
    this.cool = 60 / this.weapon.rpm;
    sfx.play(this.weapon.sound, { volume: 0.8 });
    if (this.ammo <= 0) this.startReload();
  }
  startReload() {
    if (this.reloading > 0 || this.ammo === this.weapon.mag) return;
    this.reloading = this.weapon.reload;
    sfx.play('reload', { volume: 0.6 });
  }
}
