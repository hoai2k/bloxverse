// Builds chunk geometry: per-face culling, smooth lighting, ambient occlusion, box/cross/fluid shapes.
// Written for speed: no per-face allocations, precomputed face tiles, typed padded buffers.
import { BLOCKS, B, FULL_BOX, BLOCK_COUNT } from './blocks.js';
import { CX, CY, CZ } from './chunk.js';
import { tileFor, faceTexName, ATLAS_TILES } from './textures.js';

const PX = CX + 2, PZ = CZ + 2;
const STRIDE_X = PZ * CY, STRIDE_Z = CY;
function pidx(x, y, z) { return ((x + 1) * PZ + (z + 1)) * CY + y; }

// Face table. axis: 0 x,1 y,2 z. dir: +1/-1. ua/va: axes for texture u/v, uflip/vflip.
const FACES = [
  { axis: 0, dir: 1, ua: 2, uflip: true, va: 1, vflip: false, shade: 0.6, n: [1, 0, 0] },
  { axis: 0, dir: -1, ua: 2, uflip: false, va: 1, vflip: false, shade: 0.6, n: [-1, 0, 0] },
  { axis: 1, dir: 1, ua: 0, uflip: false, va: 2, vflip: true, shade: 1.0, n: [0, 1, 0] },
  { axis: 1, dir: -1, ua: 0, uflip: false, va: 2, vflip: false, shade: 0.5, n: [0, -1, 0] },
  { axis: 2, dir: 1, ua: 0, uflip: false, va: 1, vflip: false, shade: 0.8, n: [0, 0, 1] },
  { axis: 2, dir: -1, ua: 0, uflip: true, va: 1, vflip: false, shade: 0.8, n: [0, 0, -1] },
];
function faceCorners(f, box) {
  const plane = f.dir > 0 ? box[f.axis + 3] : box[f.axis];
  const umin = box[f.ua], umax = box[f.ua + 3], vmin = box[f.va], vmax = box[f.va + 3];
  const u0 = f.uflip ? umax : umin, u1 = f.uflip ? umin : umax;
  const v0 = f.vflip ? vmax : vmin, v1 = f.vflip ? vmin : vmax;
  const mk = (u, v) => { const p = [0, 0, 0]; p[f.axis] = plane; p[f.ua] = u; p[f.va] = v; return p; };
  return [mk(u0, v0), mk(u1, v0), mk(u1, v1), mk(u0, v1)];
}
function faceUVRange(f, box) {
  const umin = box[f.ua], umax = box[f.ua + 3], vmin = box[f.va], vmax = box[f.va + 3];
  const u0 = f.uflip ? 1 - umax : umin, u1 = f.uflip ? 1 - umin : umax;
  const v0 = f.vflip ? 1 - vmax : vmin, v1 = f.vflip ? 1 - vmin : vmax;
  return [u0, u1, v0, v1];
}
// Precompute per face: winding flip, unit-cube corners (flat), corner tangent signs, side offsets
for (const f of FACES) {
  const c = faceCorners(f, FULL_BOX[0]);
  const ax = c[1][0] - c[0][0], ay = c[1][1] - c[0][1], az = c[1][2] - c[0][2];
  const bx = c[2][0] - c[0][0], by = c[2][1] - c[0][1], bz = c[2][2] - c[0][2];
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  f.flip = (nx * f.n[0] + ny * f.n[1] + nz * f.n[2]) < 0;
  f.cube = new Float32Array(12); for (let i = 0; i < 4; i++) { f.cube[i * 3] = c[i][0]; f.cube[i * 3 + 1] = c[i][1]; f.cube[i * 3 + 2] = c[i][2]; }
  // For each corner: offsets of the two side samples (s1 along ua, s2 along va) in padded index units
  const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  f.s1 = new Int32Array(4); f.s2 = new Int32Array(4); f.s1v = new Int32Array(4); f.s2v = new Int32Array(4);
  const strideOf = (axis) => axis === 0 ? STRIDE_X : axis === 1 ? 1 : STRIDE_Z;
  for (let i = 0; i < 4; i++) {
    const su = f.uflip ? -signs[i][0] : signs[i][0], sv = f.vflip ? -signs[i][1] : signs[i][1];
    f.s1[i] = su * strideOf(f.ua); f.s2[i] = sv * strideOf(f.va);
    f.s1v[i] = f.ua === 1 ? su : 0; f.s2v[i] = f.va === 1 ? sv : 0; // y deltas for bounds checks
  }
  f.noff = f.n[0] * STRIDE_X + f.n[1] + f.n[2] * STRIDE_Z;
}

const AO_CURVE = [0.45, 0.65, 0.82, 1.0];
const EPS = 0.0005;
const TS = 1 / ATLAS_TILES;

class Builder {
  constructor() { this.pos = []; this.uv = []; this.light = []; this.shade = []; this.index = []; this.n = 0; }
  // 4 corners as flat (x,y,z)*4, uv as u0,u1,v0,v1 in atlas coords, lights sky/blk per corner, shades per corner
  quad(px, py, pz, cx, u0, u1, v0, v1, ls, lb, sh, flip) {
    const base = this.n; const P = this.pos, U = this.uv, L = this.light, S = this.shade;
    for (let i = 0; i < 4; i++) { P.push(cx[i * 3] + px, cx[i * 3 + 1] + py, cx[i * 3 + 2] + pz); L.push(ls[i], lb[i]); S.push(sh[i]); }
    U.push(u0, v0, u1, v0, u1, v1, u0, v1);
    const alt = (sh[0] + sh[2]) < (sh[1] + sh[3]);
    const I = this.index;
    if (!flip) { if (alt) I.push(base + 1, base + 2, base + 3, base + 1, base + 3, base); else I.push(base, base + 1, base + 2, base, base + 2, base + 3); }
    else { if (alt) I.push(base + 1, base + 3, base + 2, base + 1, base, base + 3); else I.push(base, base + 2, base + 1, base, base + 3, base + 2); }
    this.n += 4;
  }
  build() {
    if (this.n === 0) return null;
    return { pos: new Float32Array(this.pos), uv: new Float32Array(this.uv), light: new Float32Array(this.light), shade: new Float32Array(this.shade), index: this.n > 65535 ? new Uint32Array(this.index) : new Uint16Array(this.index) };
  }
}

const padBlocks = new Uint16Array(PX * CY * PZ);
const padMeta = new Uint8Array(PX * CY * PZ);
const padLight = new Uint8Array(PX * CY * PZ);
const padOpaque = new Uint8Array(PX * CY * PZ);
const OPAQUE = new Uint8Array(BLOCK_COUNT); for (let i = 0; i < BLOCK_COUNT; i++) OPAQUE[i] = BLOCKS[i].opaque ? 1 : 0;
// face tile cache: (id*16+meta)*6+face -> tile index (0 = not computed; tiles are offset by 1)
const faceTile = new Int32Array(BLOCK_COUNT * 16 * 6);
function tileOf(def, meta, face) {
  const k = (def.id * 16 + (meta & 15)) * 6 + face; let t = faceTile[k];
  if (t === 0) { t = tileFor(faceTexName(def, meta, face)) + 1; faceTile[k] = t; }
  return t - 1;
}
const scratchLs = new Float32Array(4), scratchLb = new Float32Array(4), scratchSh = new Float32Array(4);
const cornerBuf = new Float32Array(12);

export function meshChunk(world, chunk) {
  const bx = chunk.cx * CX, bz = chunk.cz * CZ;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const c = world.getChunk(chunk.cx + dx, chunk.cz + dz);
    const x0 = dx === -1 ? CX - 1 : 0, x1 = dx === 1 ? 0 : CX - 1;
    const z0 = dz === -1 ? CZ - 1 : 0, z1 = dz === 1 ? 0 : CZ - 1;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const px = x + dx * CX, pz = z + dz * CZ;
      const dst = pidx(px, 0, pz), src = (x * CZ + z) * CY;
      if (c && c.state >= 1) { padBlocks.set(c.blocks.subarray(src, src + CY), dst); padMeta.set(c.meta.subarray(src, src + CY), dst); padLight.set(c.light.subarray(src, src + CY), dst); }
      else { padBlocks.fill(0, dst, dst + CY); padMeta.fill(0, dst, dst + CY); padLight.fill(0xF0, dst, dst + CY); }
    }
  }
  for (let i = 0; i < padBlocks.length; i++) padOpaque[i] = OPAQUE[padBlocks[i]];
  const opaque = new Builder(), trans = new Builder();
  const ctxCache = { get: null };
  for (let x = 0; x < CX; x++) for (let z = 0; z < CZ; z++) {
    const colBase = pidx(x, 0, z);
    for (let y = 0; y < CY; y++) {
      const i = colBase + y; const id = padBlocks[i]; if (id === 0) continue;
      const def = BLOCKS[id]; const r = def.render; if (r === 'none') continue;
      const meta = padMeta[i];
      const b = def.translucent ? trans : opaque;
      if (r === 'cube') {
        // quick reject: fully surrounded by opaque
        if (padOpaque[i + STRIDE_X] && padOpaque[i - STRIDE_X] && padOpaque[i + STRIDE_Z] && padOpaque[i - STRIDE_Z] && (y === CY - 1 || padOpaque[i + 1]) && (y === 0 || padOpaque[i - 1])) continue;
        cubeFaces(b, def, id, meta, i, x, y, z, bx, bz);
      }
      else if (r === 'cross') crossQuads(b, def, meta, i, x, y, z, bx, bz);
      else if (r === 'fluid') fluidFaces(b, def, id, meta, i, x, y, z, bx, bz);
      else if (r === 'box') {
        ctxCache.get = (dx, dy, dz) => (y + dy < 0 || y + dy >= CY) ? 0 : padBlocks[i + dx * STRIDE_X + dy + dz * STRIDE_Z];
        const boxes = (def.renderShape || def.shape)(meta, ctxCache);
        for (const box of boxes) boxFaces(b, def, meta, i, x, y, z, bx, bz, box);
      }
    }
  }
  return { opaque: opaque.build(), translucent: trans.build() };
}

function opaqueAt(i, y) { if (y < 0 || y >= CY) return 0; return padOpaque[i]; }
function skyAt(i, y) { if (y >= CY) return 15; if (y < 0) return 0; return padLight[i] >> 4; }
function blkAt(i, y) { if (y < 0 || y >= CY) return 0; return padLight[i] & 15; }

function shouldCull(def, id, nid) {
  if (nid === 0) return false;
  const nd = BLOCKS[nid];
  if (nd.opaque) return true;
  if (def.cullSame && nid === id) return true;
  return false;
}

function cubeFaces(b, def, id, meta, i, x, y, z, bx, bz) {
  for (let fi = 0; fi < 6; fi++) {
    const f = FACES[fi];
    const ny = y + f.n[1];
    const ni = i + f.noff;
    const nid = ny < 0 ? B.bedrock : ny >= CY ? 0 : padBlocks[ni];
    if (shouldCull(def, id, nid)) continue;
    // per-corner AO + smooth light
    for (let c = 0; c < 4; c++) {
      const i1 = ni + f.s1[c], i2 = ni + f.s2[c], ic = ni + f.s1[c] + f.s2[c];
      const y1 = ny + f.s1v[c], y2 = ny + f.s2v[c], yc = ny + f.s1v[c] + f.s2v[c];
      const o1 = opaqueAt(i1, y1), o2 = opaqueAt(i2, y2), oc = opaqueAt(ic, yc);
      const ao = (o1 && o2) ? 0 : 3 - (o1 + o2 + oc);
      let sky = 0, blk = 0, cnt = 0;
      if (!opaqueAt(ni, ny)) { sky += skyAt(ni, ny); blk += blkAt(ni, ny); cnt++; }
      if (!o1) { sky += skyAt(i1, y1); blk += blkAt(i1, y1); cnt++; }
      if (!o2) { sky += skyAt(i2, y2); blk += blkAt(i2, y2); cnt++; }
      if (!(o1 && o2) && !oc) { sky += skyAt(ic, yc); blk += blkAt(ic, yc); cnt++; }
      if (cnt === 0) { sky = skyAt(ni, ny); blk = blkAt(ni, ny); cnt = 1; }
      scratchLs[c] = sky / cnt; scratchLb[c] = blk / cnt; scratchSh[c] = AO_CURVE[ao] * f.shade;
    }
    const t = tileOf(def, meta, fi); const tu = (t % ATLAS_TILES) * TS, tv = Math.floor(t / ATLAS_TILES) * TS;
    b.quad(bx + x, y, bz + z, f.cube, tu + EPS * TS, tu + TS - EPS * TS, tv + TS - EPS * TS, tv + EPS * TS, scratchLs, scratchLb, scratchSh, f.flip);
  }
}

function boxFaces(b, def, meta, i, x, y, z, bx, bz, box) {
  const ownS = skyAt(i, y), ownB = blkAt(i, y);
  for (let fi = 0; fi < 6; fi++) {
    const f = FACES[fi];
    const flush = f.dir > 0 ? box[f.axis + 3] >= 1 - 1e-6 : box[f.axis] <= 1e-6;
    const ny = y + f.n[1]; const ni = i + f.noff;
    let ls = ownS, lb = ownB;
    if (flush) {
      const nid = ny < 0 ? B.bedrock : ny >= CY ? 0 : padBlocks[ni];
      if (OPAQUE[nid]) continue;
      ls = Math.max(ownS, skyAt(ni, ny)); lb = Math.max(ownB, blkAt(ni, ny));
    }
    const corners = faceCorners(f, box); for (let c = 0; c < 4; c++) { cornerBuf[c * 3] = corners[c][0]; cornerBuf[c * 3 + 1] = corners[c][1]; cornerBuf[c * 3 + 2] = corners[c][2]; }
    const [u0, u1, v0, v1] = faceUVRange(f, box);
    const t = tileOf(def, meta, fi); const tu = (t % ATLAS_TILES) * TS, tv = Math.floor(t / ATLAS_TILES) * TS;
    const sh = f.shade * (def.torch ? 1.0 : 0.95);
    scratchLs[0] = scratchLs[1] = scratchLs[2] = scratchLs[3] = ls; scratchLb[0] = scratchLb[1] = scratchLb[2] = scratchLb[3] = lb; scratchSh[0] = scratchSh[1] = scratchSh[2] = scratchSh[3] = sh;
    b.quad(bx + x, y, bz + z, cornerBuf, tu + (u0 + EPS) * TS, tu + (u1 - EPS) * TS, tv + (1 - v0 - EPS) * TS, tv + (1 - v1 + EPS) * TS, scratchLs, scratchLb, scratchSh, f.flip);
  }
}

const CROSS_A = new Float32Array([0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0]);
const CROSS_B = new Float32Array([1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0]);
function crossQuads(b, def, meta, i, x, y, z, bx, bz) {
  const ls = skyAt(i, y), lb = blkAt(i, y);
  const t = tileOf(def, meta, 4); const tu = (t % ATLAS_TILES) * TS, tv = Math.floor(t / ATLAS_TILES) * TS;
  scratchLs.fill(ls); scratchLb.fill(lb); scratchSh.fill(0.9);
  const u0 = tu + EPS * TS, u1 = tu + TS - EPS * TS, v0 = tv + TS - EPS * TS, v1 = tv + EPS * TS;
  b.quad(bx + x, y, bz + z, CROSS_A, u0, u1, v0, v1, scratchLs, scratchLb, scratchSh, false);
  b.quad(bx + x, y, bz + z, CROSS_A, u0, u1, v0, v1, scratchLs, scratchLb, scratchSh, true);
  b.quad(bx + x, y, bz + z, CROSS_B, u0, u1, v0, v1, scratchLs, scratchLb, scratchSh, false);
  b.quad(bx + x, y, bz + z, CROSS_B, u0, u1, v0, v1, scratchLs, scratchLb, scratchSh, true);
}

function fluidHeight(id, meta, above) {
  if (above === id) return 1;
  const level = meta & 7;
  if (level === 0) return 14 / 16;
  return Math.max(2 / 16, (8 - level) / 9);
}
const fluidBox = [0, 0, 0, 1, 1, 1];
function fluidFaces(b, def, id, meta, i, x, y, z, bx, bz) {
  const above = y + 1 < CY ? padBlocks[i + 1] : 0;
  const h = fluidHeight(id, meta, above);
  fluidBox[4] = h;
  const ownS = skyAt(i, y), ownB = blkAt(i, y);
  const t = tileOf(def, 0, 0); const tu = (t % ATLAS_TILES) * TS, tv = Math.floor(t / ATLAS_TILES) * TS;
  for (let fi = 0; fi < 6; fi++) {
    const f = FACES[fi];
    const ny = y + f.n[1]; const ni = i + f.noff;
    const nid = ny < 0 ? B.bedrock : ny >= CY ? 0 : padBlocks[ni];
    if (nid === id) continue;
    const nd = BLOCKS[nid];
    if (nd.opaque && fi !== 2) continue;
    if (fi !== 2 && nd.fluid) continue;
    const ls = nd.opaque ? ownS : Math.max(ownS, skyAt(ni, ny)), lb = nd.opaque ? ownB : Math.max(ownB, blkAt(ni, ny));
    const corners = faceCorners(f, fluidBox); for (let c = 0; c < 4; c++) { cornerBuf[c * 3] = corners[c][0]; cornerBuf[c * 3 + 1] = corners[c][1]; cornerBuf[c * 3 + 2] = corners[c][2]; }
    const [u0, u1, v0, v1] = faceUVRange(f, fluidBox);
    scratchLs.fill(ls); scratchLb.fill(lb); scratchSh.fill(f.shade);
    b.quad(bx + x, y, bz + z, cornerBuf, tu + (u0 + EPS) * TS, tu + (u1 - EPS) * TS, tv + (1 - v0 - EPS) * TS, tv + (1 - v1 + EPS) * TS, scratchLs, scratchLb, scratchSh, f.flip);
    if (fi === 2 && h < 1) b.quad(bx + x, y, bz + z, cornerBuf, tu + (u0 + EPS) * TS, tu + (u1 - EPS) * TS, tv + (1 - v0 - EPS) * TS, tv + (1 - v1 + EPS) * TS, scratchLs, scratchLb, scratchSh, !f.flip);
  }
}
