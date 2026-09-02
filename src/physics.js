// Axis-aligned bounding box movement with swept collision resolution against block shapes.
import { BLOCKS, B } from './blocks.js';

export const GRAVITY = 32; // blocks/s^2
const EPS = 1e-4;

export class AABB {
  constructor(x, y, z, w, h) { this.x = x; this.y = y; this.z = z; this.w = w; this.h = h; }
  get minX() { return this.x - this.w / 2; } get maxX() { return this.x + this.w / 2; }
  get minY() { return this.y; } get maxY() { return this.y + this.h; }
  get minZ() { return this.z - this.w / 2; } get maxZ() { return this.z + this.w / 2; }
}

// Moves the entity by (dx,dy,dz) resolving collisions axis by axis. Returns {onGround, hitX, hitZ, hitY}.
export function moveEntity(world, e, dx, dy, dz, stepHeight = 0) {
  const res = { onGround: false, hitX: false, hitZ: false, hitY: false, crushed: false };
  const boxes = world.collisionBoxes(e.x - e.w / 2 + Math.min(0, dx) - 1, e.y + Math.min(0, dy) - 1, e.z - e.w / 2 + Math.min(0, dz) - 1, e.x + e.w / 2 + Math.max(0, dx) + 1, e.y + e.h + Math.max(0, dy) + 1, e.z + e.w / 2 + Math.max(0, dz) + 1);
  // Y
  let ny = sweep(boxes, e, 1, dy);
  if (ny !== dy) { res.hitY = true; if (dy < 0) res.onGround = true; }
  e.y += ny;
  // X
  let nx = sweep(boxes, e, 0, dx);
  if (nx !== dx) res.hitX = true;
  // Z
  e.x += nx;
  let nz = sweep(boxes, e, 2, dz);
  if (nz !== dz) res.hitZ = true;
  e.z += nz;
  // step up (auto-step) when blocked horizontally and on ground
  if (stepHeight > 0 && (res.hitX || res.hitZ) && (res.onGround || e.onGround)) {
    const ox = e.x, oy = e.y, oz = e.z;
    e.x -= nx; e.z -= nz;
    const up = sweep(boxes, e, 1, stepHeight); e.y += up;
    const sx = sweep(boxes, e, 0, dx); e.x += sx;
    const sz = sweep(boxes, e, 2, dz); e.z += sz;
    const down = sweep(boxes, e, 1, -stepHeight); e.y += down;
    const gained = Math.abs(sx) + Math.abs(sz), before = Math.abs(nx) + Math.abs(nz);
    if (gained > before + EPS && e.y > oy - EPS) { res.hitX = sx !== dx; res.hitZ = sz !== dz; res.onGround = true; }
    else { e.x = ox; e.y = oy; e.z = oz; }
  }
  return res;
}

function sweep(boxes, e, axis, d) {
  if (d === 0) return 0;
  const minX = e.x - e.w / 2, maxX = e.x + e.w / 2, minY = e.y, maxY = e.y + e.h, minZ = e.z - e.w / 2, maxZ = e.z + e.w / 2;
  for (const b of boxes) {
    if (axis !== 0 && (maxX <= b[0] + EPS || minX >= b[3] - EPS)) continue;
    if (axis !== 1 && (maxY <= b[1] + EPS || minY >= b[4] - EPS)) continue;
    if (axis !== 2 && (maxZ <= b[2] + EPS || minZ >= b[5] - EPS)) continue;
    if (axis === 0) { if (d > 0 && maxX <= b[0] + EPS) d = Math.min(d, b[0] - maxX); else if (d < 0 && minX >= b[3] - EPS) d = Math.max(d, b[3] - minX); }
    else if (axis === 1) { if (d > 0 && maxY <= b[1] + EPS) d = Math.min(d, b[1] - maxY); else if (d < 0 && minY >= b[4] - EPS) d = Math.max(d, b[4] - minY); }
    else { if (d > 0 && maxZ <= b[2] + EPS) d = Math.min(d, b[2] - maxZ); else if (d < 0 && minZ >= b[5] - EPS) d = Math.max(d, b[5] - minZ); }
  }
  if (Math.abs(d) < EPS) return 0;
  return d;
}

export function intersectsSolid(world, minX, minY, minZ, maxX, maxY, maxZ) {
  const boxes = world.collisionBoxes(minX, minY, minZ, maxX, maxY, maxZ);
  for (const b of boxes) if (maxX > b[0] + EPS && minX < b[3] - EPS && maxY > b[1] + EPS && minY < b[4] - EPS && maxZ > b[2] + EPS && minZ < b[5] - EPS) return true;
  return false;
}

// Which fluid (if any) the given AABB is in; returns {water: bool, lava: bool, head: bool(eye in fluid)}
export function fluidState(world, e, eyeY) {
  let water = false, lava = false;
  const x0 = Math.floor(e.x - e.w / 2), x1 = Math.floor(e.x + e.w / 2), z0 = Math.floor(e.z - e.w / 2), z1 = Math.floor(e.z + e.w / 2);
  const y0 = Math.floor(e.y), y1 = Math.floor(e.y + e.h * 0.5);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const id = world.getBlock(x, y, z); if (id === B.water) water = true; else if (id === B.lava) lava = true; }
  const headId = world.getBlock(Math.floor(e.x), Math.floor(eyeY), Math.floor(e.z));
  return { water, lava, head: headId === B.water, headLava: headId === B.lava };
}
