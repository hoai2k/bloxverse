// ============================================================
// BLOXVERSE engine — physics: AABB world + character controller
// Tuned to feel like the classic platform: gravity 196.2,
// walk speed 16, jump velocity 50, auto step-up.
// ============================================================
import * as THREE from 'three';

export const GRAVITY = 196.2;
export const WALK_SPEED = 16;
export const JUMP_POWER = 50;

const _box = new THREE.Box3();
const _v = new THREE.Vector3();

export class World {
  constructor() {
    this.colliders = [];
    this.killY = -60;
  }

  // Register a mesh as an axis-aligned box collider.
  addCollider(mesh, opts = {}) {
    mesh.updateWorldMatrix(true, false);
    const col = {
      mesh,
      box: new THREE.Box3().setFromObject(mesh),
      solid: opts.solid !== false,
      touch: opts.touch || null,       // 'kill' | 'checkpoint' | custom tag
      data: opts.data || null,
      carry: null,                     // Vector3 velocity for moving platforms
      obb: opts.obb || null,           // {half: Vector3} -> test in mesh local space
      enabled: true,
    };
    this.colliders.push(col);
    return col;
  }

  addBox3(box3, opts = {}) {
    const col = { mesh: null, box: box3.clone(), solid: opts.solid !== false, touch: opts.touch || null, data: opts.data || null, carry: null, obb: null, enabled: true };
    this.colliders.push(col);
    return col;
  }

  remove(col) {
    const i = this.colliders.indexOf(col);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  // Re-fit collider box to (moved) mesh; returns movement delta
  refresh(col) {
    const old = col.box.min.x;
    col.mesh.updateWorldMatrix(true, false);
    col.box.setFromObject(col.mesh);
    return col.box.min.x - old;
  }

  // Ray vs solid colliders. Returns {dist, point, col} or null.
  raycast(origin, dir, maxDist, ignore = null) {
    const ray = new THREE.Ray(origin, dir);
    let best = null;
    for (const col of this.colliders) {
      if (!col.enabled || !col.solid || col === ignore) continue;
      if (ray.intersectBox(col.box, _v)) {
        const d = origin.distanceTo(_v);
        if (d <= maxDist && (!best || d < best.dist)) best = { dist: d, point: _v.clone(), col };
      }
    }
    return best;
  }
}

export class CharController {
  constructor(opts = {}) {
    this.pos = new THREE.Vector3();       // feet position
    this.vel = new THREE.Vector3();
    this.halfW = opts.halfW ?? 0.85;
    this.height = opts.height ?? 5.0;
    this.speed = opts.speed ?? WALK_SPEED;
    this.jumpPower = opts.jumpPower ?? JUMP_POWER;
    this.gravityScale = opts.gravityScale ?? 1;
    this.stepHeight = opts.stepHeight ?? 2.3;
    this.moveDir = new THREE.Vector3();   // desired horizontal dir (normalized)
    this.wantJump = false;
    this.grounded = false;
    this.groundCol = null;
    this.touching = [];
    this.frozen = false;
    this.noclip = false;
    this.knockback = new THREE.Vector3(); // decaying external velocity
    this.fellOff = false;
  }

  box(out, px = this.pos.x, py = this.pos.y, pz = this.pos.z) {
    out.min.set(px - this.halfW, py, pz - this.halfW);
    out.max.set(px + this.halfW, py + this.height, pz + this.halfW);
    return out;
  }

  teleport(x, y, z) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.knockback.set(0, 0, 0);
    this.fellOff = false;
  }

  update(dt, world) {
    if (this.frozen) { this.touching.length = 0; return; }
    const kb = this.knockback;

    // horizontal velocity: instant like the classic engine + knockback overlay
    this.vel.x = this.moveDir.x * this.speed + kb.x;
    this.vel.z = this.moveDir.z * this.speed + kb.z;
    kb.x *= Math.max(0, 1 - dt * 3.2);
    kb.z *= Math.max(0, 1 - dt * 3.2);
    if (Math.abs(kb.x) < 0.3) kb.x = 0;
    if (Math.abs(kb.z) < 0.3) kb.z = 0;

    // gravity + jump
    this.vel.y -= GRAVITY * this.gravityScale * dt;
    if (this.vel.y < -140) this.vel.y = -140;
    if (this.wantJump && this.grounded) {
      this.vel.y = this.jumpPower;
      this.grounded = false;
    }
    this.wantJump = false;

    if (this.noclip) {
      this.pos.addScaledVector(this.vel, dt);
      this.touching.length = 0;
      return;
    }

    // carried by moving platform
    if (this.grounded && this.groundCol?.carry) {
      this.pos.addScaledVector(this.groundCol.carry, dt);
    }

    const cols = world.colliders;
    // --- X axis ---
    this.#moveAxis(cols, 'x', this.vel.x * dt);
    // --- Z axis ---
    this.#moveAxis(cols, 'z', this.vel.z * dt);

    // --- Y axis (SWEPT: catches the crossing no matter how large the frame
    // step is, so a slow first frame on mobile can never tunnel the player
    // through the floor). X/Z are already resolved, so XZ overlap is exact. ---
    const prevFeet = this.pos.y;
    const dy = this.vel.y * dt;
    this.pos.y = prevFeet + dy;
    this.grounded = false;
    this.groundCol = null;
    const REST = 0.5; // tolerance for staying glued to a surface

    if (this.vel.y <= 0) {
      // Landing: among every solid top we crossed (feet were at/above it and
      // are now at/below it), snap to the HIGHEST one.
      let landY = -Infinity, landCol = null;
      for (const col of cols) {
        if (!col.enabled || !col.solid || col.obb) continue;
        if (!this.#overlapXZ(col)) continue;
        const top = col.box.max.y;
        if (prevFeet >= top - REST && this.pos.y <= top && top > landY) {
          landY = top; landCol = col;
        }
      }
      if (landCol) {
        this.pos.y = landY;
        this.vel.y = 0;
        this.grounded = true;
        this.groundCol = landCol;
      }
    } else {
      // Rising: bonk the lowest ceiling we crossed.
      let hitY = Infinity;
      const prevHead = prevFeet + this.height;
      for (const col of cols) {
        if (!col.enabled || !col.solid || col.obb) continue;
        if (!this.#overlapXZ(col)) continue;
        const bottom = col.box.min.y;
        if (prevHead <= bottom + REST && this.pos.y + this.height >= bottom && bottom < hitY) {
          hitY = bottom;
        }
      }
      if (hitY !== Infinity) {
        this.pos.y = hitY - this.height;
        this.vel.y = 0;
      }
    }
    this.box(_box);

    // --- touch collection (kill bricks, checkpoints, zones, OBBs) ---
    this.touching.length = 0;
    this.box(_box);
    for (const col of cols) {
      if (!col.enabled || (!col.touch && col.solid)) continue;
      if (col.obb) {
        if (this.#obbTouch(col)) this.touching.push(col);
      } else if (_box.intersectsBox(col.box)) {
        this.touching.push(col);
      }
    }

    if (this.pos.y < world.killY) this.fellOff = true;
  }

  #moveAxis(cols, axis, delta) {
    if (delta === 0) return;
    this.pos[axis] += delta;
    this.box(_box);
    for (const col of cols) {
      if (!col.enabled || !col.solid || col.obb) continue;
      if (!_box.intersectsBox(col.box)) continue;
      // How far the collider's top rises above our feet.
      const stepUp = col.box.max.y - this.pos.y;
      // A surface at (or below, within tolerance of) our feet is a FLOOR we are
      // standing on — not a wall. Never shove the player sideways out of it,
      // or they get flung off the edge of the ground plane. This is the fix
      // for "falling through the floor" (esp. on a slow first mobile frame,
      // where the feet sink a hair below the ground top).
      if (stepUp <= 0.2) continue;
      // A low ledge we can walk straight up onto.
      if (stepUp <= this.stepHeight && (this.grounded || this.vel.y <= 0) && this.#headroom(cols, col.box.max.y)) {
        this.pos.y = col.box.max.y;
        this.box(_box);
        continue;
      }
      // Otherwise it is a real wall: push out horizontally.
      if (delta > 0) this.pos[axis] = col.box.min[axis] - this.halfW - 0.001;
      else this.pos[axis] = col.box.max[axis] + this.halfW + 0.001;
      this.box(_box);
    }
  }

  // Does the player's footprint overlap this collider on the XZ plane?
  #overlapXZ(col) {
    return this.pos.x + this.halfW > col.box.min.x &&
      this.pos.x - this.halfW < col.box.max.x &&
      this.pos.z + this.halfW > col.box.min.z &&
      this.pos.z - this.halfW < col.box.max.z;
  }

  #headroom(cols, floorY) {
    this.box(_box, this.pos.x, floorY + 0.05, this.pos.z);
    for (const col of cols) {
      if (!col.enabled || !col.solid || col.obb) continue;
      if (_box.intersectsBox(col.box) && col.box.max.y > floorY + this.stepHeight) return false;
    }
    return true;
  }

  // OBB touch test: transform char center into mesh local space
  #obbTouch(col) {
    const m = col.mesh;
    m.updateWorldMatrix(true, false);
    _v.set(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z);
    m.worldToLocal(_v);
    const h = col.obb.half;
    const pad = this.halfW;
    return Math.abs(_v.x) < h.x + pad && Math.abs(_v.y) < h.y + this.height * 0.5 && Math.abs(_v.z) < h.z + pad;
  }
}

// Distance helpers used by game AI
export function distXZ(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
