// Sky light and block light propagation across chunks (flood fill).
import { BLOCKS } from './blocks.js';
import { CX, CY, CZ, idx } from './chunk.js';

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const LB = new Uint8Array(BLOCKS.length); for (let i = 0; i < BLOCKS.length; i++) LB[i] = BLOCKS[i].lightBlock;
function lightBlockOf(id) { return LB[id] || 0; }
function emissionOf(id, meta) { const d = BLOCKS[id]; if (!d) return 0; if (d.lightOf) return d.lightOf(meta); return d.light; }

export class Lighting {
  constructor(world) {
    this.world = world;
    this.queue = []; // [x,y,z] to propagate from (both channels)
    this.dirty = new Set(); // chunk keys touched
  }

  // ---- accessors (world coords) ----
  getSky(x, y, z) { const c = this.world.chunkAt(x, z); if (!c || y < 0 || y >= CY) return y >= CY ? 15 : 0; return c.light[idx(x & 15, y, z & 15)] >> 4; }
  getBlk(x, y, z) { const c = this.world.chunkAt(x, z); if (!c || y < 0 || y >= CY) return 0; return c.light[idx(x & 15, y, z & 15)] & 15; }
  setSky(x, y, z, v) { const c = this.world.chunkAt(x, z); if (!c) return; const i = idx(x & 15, y, z & 15); c.light[i] = (c.light[i] & 15) | (v << 4); this.dirty.add(c); }
  setBlk(x, y, z, v) { const c = this.world.chunkAt(x, z); if (!c) return; const i = idx(x & 15, y, z & 15); c.light[i] = (c.light[i] & 0xF0) | v; this.dirty.add(c); }

  // ---- initial lighting for a freshly generated chunk (neighbours must be generated) ----
  initChunk(chunk) {
    const { blocks, meta, light } = chunk;
    light.fill(0);
    const bx = chunk.cx * CX, bz = chunk.cz * CZ;
    const q = [];
    // sky columns
    for (let x = 0; x < CX; x++) for (let z = 0; z < CZ; z++) {
      const base = (x * CZ + z) * CY;
      let v = 15;
      for (let y = CY - 1; y >= 0; y--) {
        const id = blocks[base + y];
        const lb = lightBlockOf(id);
        if (lb > 0) { v = Math.max(0, v - lb); if (v === 0) { /* still walk to y=0 to zero-fill (already 0) */ } }
        if (v === 0) break;
        light[base + y] = v << 4;
      }
    }
    // block emitters
    for (let i = 0; i < blocks.length; i++) {
      const id = blocks[i]; if (id === 0) continue;
      const e = emissionOf(id, meta[i]);
      if (e > 0) { light[i] = (light[i] & 0xF0) | e; const y = i % CY, xz = (i - y) / CY, z = xz % CZ, x = (xz - z) / CZ; q.push([bx + x, y, bz + z]); }
    }
    // seed sky propagation: lit cells with a darker horizontal neighbour, and chunk borders
    for (let x = 0; x < CX; x++) for (let z = 0; z < CZ; z++) {
      const base = (x * CZ + z) * CY;
      for (let y = 0; y < CY; y++) {
        const s = light[base + y] >> 4; if (s === 0) continue;
        let seed = x === 0 || x === CX - 1 || z === 0 || z === CZ - 1;
        if (!seed) {
          if ((light[((x + 1) * CZ + z) * CY + y] >> 4) < s - 1 || (light[((x - 1) * CZ + z) * CY + y] >> 4) < s - 1 ||
              (light[(x * CZ + z + 1) * CY + y] >> 4) < s - 1 || (light[(x * CZ + z - 1) * CY + y] >> 4) < s - 1) seed = true;
        }
        if (seed) q.push([bx + x, y, bz + z]);
      }
    }
    // pull light in from neighbouring chunks' border cells
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.world.getChunk(chunk.cx + dx, chunk.cz + dz); if (!n || n.state < 2) continue;
      const nbx = n.cx * CX, nbz = n.cz * CZ;
      const xs = dx === 1 ? [0] : dx === -1 ? [CX - 1] : null; const zs = dz === 1 ? [0] : dz === -1 ? [CZ - 1] : null;
      for (let x = 0; x < CX; x++) { if (xs && x !== xs[0]) continue; for (let z = 0; z < CZ; z++) { if (zs && z !== zs[0]) continue;
        const base = (x * CZ + z) * CY; for (let y = 0; y < CY; y++) if (n.light[base + y] > 0x11 || (n.light[base + y] & 15) > 1 || (n.light[base + y] >> 4) > 1) q.push([nbx + x, y, nbz + z]); } }
    }
    this.queue = q;
    this.dirty.add(chunk);
    this.propagate();
  }

  propagate() {
    // typed queue of packed coordinates; chunk lookups cached by chunk coords
    let q = this.queue; let n = q.length;
    let qx = new Int32Array(Math.max(1024, n * 2)), qy = new Int32Array(qx.length), qz = new Int32Array(qx.length);
    for (let i = 0; i < n; i++) { qx[i] = q[i][0]; qy[i] = q[i][1]; qz[i] = q[i][2]; }
    let head = 0, tail = n;
    let ccx = 1e9, ccz = 1e9, cc = null;
    const world = this.world;
    const getChunk = (x, z) => { const cx = x >> 4, cz = z >> 4; if (cx !== ccx || cz !== ccz) { ccx = cx; ccz = cz; cc = world.getChunk(cx, cz); } return cc; };
    const push = (x, y, z) => { if (tail >= qx.length) { const nx = new Int32Array(qx.length * 2), ny = new Int32Array(qx.length * 2), nz = new Int32Array(qx.length * 2); nx.set(qx); ny.set(qy); nz.set(qz); qx = nx; qy = ny; qz = nz; } qx[tail] = x; qy[tail] = y; qz[tail] = z; tail++; };
    while (head < tail) {
      const x = qx[head], y = qy[head], z = qz[head]; head++;
      const c = getChunk(x, z); if (!c) continue;
      const i = idx(x & 15, y, z & 15);
      const s = c.light[i] >> 4, b = c.light[i] & 15;
      if (s <= 1 && b <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        if (ny < 0 || ny >= CY) continue;
        const nc = getChunk(nx, nz); if (!nc) continue;
        const ni = idx(nx & 15, ny, nz & 15);
        const lb = LB[nc.blocks[ni]];
        if (lb >= 15) continue;
        const cur = nc.light[ni]; const ns = cur >> 4, nb = cur & 15;
        const newS = (s === 15 && d === 3 && lb === 0) ? 15 : s - (lb > 1 ? lb : 1);
        const newB = b - (lb > 1 ? lb : 1);
        let v = cur; let changed = false;
        if (newS > ns) { v = (v & 15) | (newS << 4); changed = true; }
        if (newB > nb) { v = (v & 0xF0) | newB; changed = true; }
        if (changed) { nc.light[ni] = v; push(nx, ny, nz); this.dirty.add(nc); }
      }
    }
    this.queue = [];
  }

  // ---- incremental update after a block change at (x,y,z) ----
  update(x, y, z) {
    const c = this.world.chunkAt(x, z); if (!c) return;
    const i = idx(x & 15, y, z & 15);
    const id = c.blocks[i], meta = c.meta[i];
    const lb = lightBlockOf(id);
    const emit = emissionOf(id, meta);
    // remove both channels from this cell then relight from surroundings
    const oldS = c.light[i] >> 4, oldB = c.light[i] & 15;
    c.light[i] = 0; this.dirty.add(c);
    const relight = [];
    if (oldS > 0) this.removeChannel(x, y, z, oldS, true, relight);
    if (oldB > 0) this.removeChannel(x, y, z, oldB, false, relight);
    // new value for this cell
    if (lb < 15) {
      let s = 0;
      if (y === CY - 1) s = 15;
      else { const above = this.getSky(x, y + 1, z); s = above === 15 && lb === 0 ? 15 : Math.max(0, above - Math.max(1, lb)); }
      for (let d = 0; d < 6; d++) { const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2]; if (ny < 0 || ny >= CY) continue;
        s = Math.max(s, this.getSky(nx, ny, nz) - Math.max(1, lb)); }
      c.light[i] = (Math.max(0, s) << 4) | emit;
    } else c.light[i] = emit; // opaque emitters (e.g. glowstone) keep block light
    if ((c.light[i] >> 4) > 0 || emit > 0) relight.push([x, y, z]);
    for (let d = 0; d < 6; d++) { const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2]; if (ny < 0 || ny >= CY) continue; relight.push([nx, ny, nz]); }
    this.queue = relight;
    this.propagate();
  }

  removeChannel(x, y, z, startVal, sky, relight) {
    const q = [[x, y, z, startVal]]; let head = 0;
    while (head < q.length) {
      const [cx, cy, cz, v] = q[head++];
      for (let d = 0; d < 6; d++) {
        const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1], nz = cz + DIRS[d][2];
        if (ny < 0 || ny >= CY) continue;
        const nc = this.world.chunkAt(nx, nz); if (!nc) continue;
        const ni = idx(nx & 15, ny, nz & 15);
        const nv = sky ? (nc.light[ni] >> 4) : (nc.light[ni] & 15);
        if (nv === 0) continue;
        // sky light going straight down keeps 15, so a 15 below a removed 15 depends on it
        if (nv < v || (sky && d === 3 && v === 15 && nv === 15)) {
          if (sky) nc.light[ni] &= 15; else nc.light[ni] &= 0xF0;
          this.dirty.add(nc);
          // an emitter keeps its own light
          const e = sky ? 0 : emissionOf(nc.blocks[ni], nc.meta[ni]);
          if (e > 0) { nc.light[ni] |= e; relight.push([nx, ny, nz]); }
          q.push([nx, ny, nz, nv]);
        } else relight.push([nx, ny, nz]);
      }
    }
  }
}
