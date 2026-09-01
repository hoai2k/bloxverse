// World: chunk lifecycle (load/generate -> light -> mesh), block access, ticks, raycasts, collision queries.
import { BLOCKS, B, blockShape } from './blocks.js';
import { Chunk, CX, CY, CZ, idx, chunkKey } from './chunk.js';
import { Lighting } from './lighting.js';
import { meshChunk } from './mesher.js';
import { generateChunk, getGenerator, DIM } from './worldgen.js';

class GenPool {
  constructor(seed, dim, worldType) {
    this.seed = seed; this.dim = dim; this.worldType = worldType;
    this.workers = []; this.pending = new Map(); this.nextId = 1; this.queue = []; this.busy = 0;
    this.results = [];
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./worldgen.worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => { this.busy--; const cb = this.pending.get(e.data.id); this.pending.delete(e.data.id); if (cb) cb(e.data); this.pump(); };
        w.onerror = (e) => { console.warn('worldgen worker error, falling back to inline generation', e.message); this.workers = []; this.inline = true; this.pump(); };
        this.workers.push(w);
      }
    } catch (e) { console.warn('Workers unavailable, generating inline', e); this.workers = []; this.inline = true; }
    this.rr = 0;
  }
  request(cx, cz, cb) { this.queue.push({ cx, cz, cb }); this.pump(); }
  pump() {
    if (this.inline || this.workers.length === 0) {
      // inline: generate one per pump call to avoid long stalls; caller drains over frames
      return;
    }
    while (this.queue.length && this.busy < this.workers.length * 2) {
      const job = this.queue.shift();
      const id = this.nextId++;
      this.pending.set(id, job.cb);
      const w = this.workers[this.rr++ % this.workers.length];
      this.busy++;
      w.postMessage({ id, seed: this.seed, cx: job.cx, cz: job.cz, dim: this.dim, worldType: this.worldType });
    }
  }
  // inline fallback drained by world.update with a time budget
  drainInline(budgetMs) {
    if (!(this.inline || this.workers.length === 0)) return;
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const job = this.queue.shift();
      const out = generateChunk(this.seed, job.cx, job.cz, this.dim, this.worldType);
      job.cb({ cx: job.cx, cz: job.cz, blocks: out.blocks, meta: out.meta, loot: out.loot });
    }
  }
  cancel(cx, cz) { this.queue = this.queue.filter(j => j.cx !== cx || j.cz !== cz); }
  dispose() { for (const w of this.workers) w.terminate(); this.workers = []; }
}

const NEIGHBORS8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export class World {
  constructor({ seed, dim = DIM.OVERWORLD, worldType = 'default', renderDistance = 6, loader = null }) {
    this.seed = seed >>> 0; this.dim = dim; this.worldType = worldType;
    this.renderDistance = renderDistance;
    this.chunks = new Map();
    this.pool = new GenPool(this.seed, dim, worldType);
    this.gen = getGenerator(this.seed, dim, worldType);
    this.lighting = new Lighting(this);
    this.loader = loader; // async (cx,cz) => saved chunk data or null
    this.requested = new Set();
    this.tickQueue = [];
    this.tickTime = 0;
    this.onMesh = null; this.onUnload = null; this.onChunkReady = null; this.onBlockChange = null;
    this.lootChests = [];
    this._lastCx = null; this._lastCz = null; this._order = [];
    this.pendingResults = [];
    this.meshQueue = new Set();
    this.stats = { generated: 0, meshed: 0 };
    this.frozen = false;
  }

  // ---------- chunk access ----------
  getChunk(cx, cz) { return this.chunks.get(chunkKey(cx, cz)); }
  chunkAt(x, z) { return this.chunks.get(chunkKey(x >> 4, z >> 4)); }
  isLoaded(x, z) { const c = this.chunkAt(x, z); return !!c && c.state >= 1; }

  getBlock(x, y, z) {
    if (y < 0 || y >= CY) return 0;
    const c = this.chunkAt(x, z); if (!c || c.state < 1) return 0;
    return c.blocks[idx(x & 15, y, z & 15)];
  }
  getMeta(x, y, z) {
    if (y < 0 || y >= CY) return 0;
    const c = this.chunkAt(x, z); if (!c) return 0;
    return c.meta[idx(x & 15, y, z & 15)];
  }
  getDef(x, y, z) { return BLOCKS[this.getBlock(x, y, z)]; }
  getSky(x, y, z) { return this.lighting.getSky(x, y, z); }
  getBlockLight(x, y, z) { return this.lighting.getBlk(x, y, z); }
  getLightLevel(x, y, z, sun = 1) { return Math.max(this.getSky(x, y, z) * sun, this.getBlockLight(x, y, z)); }

  setBlock(x, y, z, id, meta = 0, opts = {}) {
    if (y < 0 || y >= CY) return false;
    const c = this.chunkAt(x, z); if (!c || c.state < 1) return false;
    const i = idx(x & 15, y, z & 15);
    const old = c.blocks[i], oldMeta = c.meta[i];
    if (old === id && oldMeta === meta) return true;
    c.blocks[i] = id; c.meta[i] = meta; c.modified = true;
    if (old !== id) c.tileEntities.delete((x & 15) + ',' + y + ',' + (z & 15));
    if (!opts.noLight) {
      const od = BLOCKS[old], nd = BLOCKS[id];
      const oe = od.lightOf ? od.lightOf(oldMeta) : od.light, ne = nd.lightOf ? nd.lightOf(meta) : nd.light;
      if (od.lightBlock !== nd.lightBlock || oe !== ne) this.lighting.update(x, y, z);
    }
    this.markDirtyAround(x, y, z);
    for (const ch of this.lighting.dirty) if (ch.state >= 3) this.meshQueue.add(ch);
    this.lighting.dirty.clear();
    if (!opts.noUpdate) {
      if (this.onBlockChange) this.onBlockChange(x, y, z, old, id);
      this.notifyNeighbors(x, y, z);
      const nd = BLOCKS[id];
      if (nd.onPlaced && !opts.silent) nd.onPlaced(this, x, y, z, meta);
    }
    return true;
  }
  setMeta(x, y, z, meta) {
    const c = this.chunkAt(x, z); if (!c) return;
    const i = idx(x & 15, y, z & 15); if (c.meta[i] === meta) return;
    const id = c.blocks[i]; const d = BLOCKS[id];
    const oe = d.lightOf ? d.lightOf(c.meta[i]) : d.light;
    c.meta[i] = meta; c.modified = true;
    const ne = d.lightOf ? d.lightOf(meta) : d.light;
    if (oe !== ne) { this.lighting.update(x, y, z); for (const ch of this.lighting.dirty) if (ch.state >= 3) this.meshQueue.add(ch); this.lighting.dirty.clear(); }
    this.markDirtyAround(x, y, z);
  }
  markDirtyAround(x, y, z) {
    const c = this.chunkAt(x, z); if (c && c.state >= 3) this.meshQueue.add(c);
    const lx = x & 15, lz = z & 15;
    const n = (dx, dz) => { const cc = this.getChunk((x >> 4) + dx, (z >> 4) + dz); if (cc && cc.state >= 3) this.meshQueue.add(cc); };
    if (lx === 0) n(-1, 0); if (lx === 15) n(1, 0); if (lz === 0) n(0, -1); if (lz === 15) n(0, 1);
    if (lx === 0 && lz === 0) n(-1, -1); if (lx === 15 && lz === 15) n(1, 1); if (lx === 0 && lz === 15) n(-1, 1); if (lx === 15 && lz === 0) n(1, -1);
  }
  notifyNeighbors(x, y, z) {
    for (const [dx, dy, dz] of DIRS6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const id = this.getBlock(nx, ny, nz); if (!id) continue;
      const d = BLOCKS[id]; if (d.onNeighborChanged) d.onNeighborChanged(this, nx, ny, nz, x, y, z);
    }
  }

  // ---------- tile entities ----------
  getTileEntity(x, y, z, create = true) {
    const c = this.chunkAt(x, z); if (!c) return null;
    const k = (x & 15) + ',' + y + ',' + (z & 15);
    let te = c.tileEntities.get(k);
    if (!te && create) { te = { x, y, z }; c.tileEntities.set(k, te); c.modified = true; }
    return te || null;
  }
  markModified(x, z) { const c = this.chunkAt(x, z); if (c) c.modified = true; }

  // ---------- ticks ----------
  scheduleTick(x, y, z, delay, data) { this.tickQueue.push({ x, y, z, t: this.tickTime + delay, data }); }
  processTicks(ticks) {
    this.tickTime += ticks;
    if (!this.tickQueue.length) return;
    const due = [], rest = [];
    for (const t of this.tickQueue) (t.t <= this.tickTime ? due : rest).push(t);
    this.tickQueue = rest;
    for (const t of due) { const id = this.getBlock(t.x, t.y, t.z); const d = BLOCKS[id]; if (d && d.onTick) d.onTick(this, t.x, t.y, t.z, this.getMeta(t.x, t.y, t.z), t.data); }
  }
  randomTicks(px, pz, radius, perChunk, rng) {
    const pcx = px >> 4, pcz = pz >> 4;
    for (let cx = pcx - radius; cx <= pcx + radius; cx++) for (let cz = pcz - radius; cz <= pcz + radius; cz++) {
      const c = this.getChunk(cx, cz); if (!c || c.state < 2) continue;
      for (let i = 0; i < perChunk; i++) {
        const x = Math.floor(rng() * CX), y = Math.floor(rng() * CY), z = Math.floor(rng() * CZ);
        const id = c.blocks[idx(x, y, z)]; if (!id) continue;
        const d = BLOCKS[id]; if (d.randomTick && d.onRandomTick) d.onRandomTick(this, cx * CX + x, y, cz * CZ + z, c.meta[idx(x, y, z)], rng);
      }
    }
  }

  // ---------- chunk pipeline ----------
  setRenderDistance(r) { this.renderDistance = r; this._lastCx = null; }

  update(px, pz, budgetMs = 6) {
    const t0 = performance.now();
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const R = this.renderDistance;
    if (pcx !== this._lastCx || pcz !== this._lastCz) {
      this._lastCx = pcx; this._lastCz = pcz;
      // ordering by distance
      const order = [];
      for (let dx = -R - 1; dx <= R + 1; dx++) for (let dz = -R - 1; dz <= R + 1; dz++) { const d = dx * dx + dz * dz; if (d <= (R + 1) * (R + 1)) order.push([dx, dz, d]); }
      order.sort((a, b) => a[2] - b[2]);
      this._order = order;
      // unload far chunks
      for (const c of this.chunks.values()) {
        const dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > (R + 3) * (R + 3)) this.unloadChunk(c);
      }
      // request missing
      for (const [dx, dz] of order) {
        const cx = pcx + dx, cz = pcz + dz; const key = chunkKey(cx, cz);
        if (!this.chunks.has(key)) this.requestChunk(cx, cz);
      }
    }
    this.pool.drainInline(Math.max(1, budgetMs * 0.5));
    // integrate results
    let did = 0;
    while (this.pendingResults.length && performance.now() - t0 < budgetMs) { this.integrate(this.pendingResults.shift()); did++; }
    // lighting for generated chunks whose neighbours are generated (nearest first)
    for (const [dx, dz, d] of this._order) {
      if (performance.now() - t0 > budgetMs) break;
      if (d > R * R) break;
      const c = this.getChunk(pcx + dx, pcz + dz); if (!c || c.state !== 1) continue;
      if (!this.neighborsAtLeast(c, 1)) continue;
      this.lighting.initChunk(c); c.state = 2;
      for (const ch of this.lighting.dirty) if (ch.state >= 3) this.meshQueue.add(ch);
      this.lighting.dirty.clear();
      if (this.onChunkReady) this.onChunkReady(c);
    }
    // meshing: new chunks nearest first, then dirty re-meshes
    for (const [dx, dz, d] of this._order) {
      if (performance.now() - t0 > budgetMs) break;
      if (d > R * R) break;
      const c = this.getChunk(pcx + dx, pcz + dz); if (!c || c.state !== 2) continue;
      if (!this.neighborsAtLeast(c, 2)) continue;
      this.remesh(c); c.state = 3;
    }
    if (this.meshQueue.size && performance.now() - t0 < budgetMs + 4) {
      // closest dirty chunks first
      const arr = [...this.meshQueue].sort((a, b) => ((a.cx - pcx) ** 2 + (a.cz - pcz) ** 2) - ((b.cx - pcx) ** 2 + (b.cz - pcz) ** 2));
      for (const c of arr) { if (performance.now() - t0 > budgetMs + 4) break; this.meshQueue.delete(c); if (c.state >= 3) this.remesh(c); }
    }
  }
  neighborsAtLeast(c, state) {
    for (const [dx, dz] of NEIGHBORS8) { const n = this.getChunk(c.cx + dx, c.cz + dz); if (!n || n.state < state) return false; }
    return true;
  }
  remesh(c) {
    const data = meshChunk(this, c);
    c.dirty = false; this.stats.meshed++;
    if (this.onMesh) this.onMesh(c, data);
  }
  requestChunk(cx, cz) {
    const c = new Chunk(cx, cz); this.chunks.set(c.key, c);
    const fromGen = () => this.pool.request(cx, cz, (res) => { if (this.chunks.get(c.key) === c) this.pendingResults.push({ chunk: c, res }); });
    if (this.loader) {
      this.loader(cx, cz).then(saved => {
        if (this.chunks.get(c.key) !== c) return;
        if (saved) this.pendingResults.push({ chunk: c, res: saved, saved: true }); else fromGen();
      }).catch(() => fromGen());
    } else fromGen();
  }
  integrate({ chunk, res, saved }) {
    chunk.blocks = res.blocks; chunk.meta = res.meta; chunk.state = 1; this.stats.generated++;
    if (saved) {
      chunk.modified = false;
      if (res.tileEntities) for (const te of res.tileEntities) chunk.tileEntities.set((te.x & 15) + ',' + te.y + ',' + (te.z & 15), te);
      chunk.entitiesSpawned = !!res.entitiesSpawned;
      chunk.savedEntities = res.entities || null;
    } else if (res.loot) { for (const l of res.loot) { if ((l.x >> 4) !== chunk.cx || (l.z >> 4) !== chunk.cz) continue; chunk.tileEntities.set((l.x & 15) + ',' + l.y + ',' + (l.z & 15), { x: l.x, y: l.y, z: l.z, lootKind: l.kind }); } }
    // neighbours that were waiting on this one get picked up next update
  }
  unloadChunk(c) {
    this.chunks.delete(c.key);
    this.pool.cancel(c.cx, c.cz);
    this.meshQueue.delete(c);
    if (this.onUnload) this.onUnload(c);
  }
  addLoadedChunk(cx, cz, blocks, meta) { const c = new Chunk(cx, cz); c.blocks = blocks; c.meta = meta; c.state = 1; this.chunks.set(c.key, c); return c; }

  // ---------- queries ----------
  surfaceY(x, z) { // highest solid block top (y of block), ignoring leaves? returns y of highest non-air
    const c = this.chunkAt(x, z); if (c && c.state >= 1) return c.topY(x & 15, z & 15);
    return this.gen.heightAt(Math.floor(x), Math.floor(z));
  }
  biomeAt(x, z) { return this.gen.biomeAt(Math.floor(x), Math.floor(z)); }

  // Collision boxes of blocks overlapping the AABB [minX..maxX]
  collisionBoxes(minX, minY, minZ, maxX, maxY, maxZ, out = [], includeFluids = false) {
    const x0 = Math.floor(minX), x1 = Math.floor(maxX), y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(CY - 1, Math.floor(maxY)), z0 = Math.floor(minZ), z1 = Math.floor(maxZ);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) {
      const id = this.getBlock(x, y, z); if (!id) continue;
      const d = BLOCKS[id]; if (!d.solid) continue;
      const meta = this.getMeta(x, y, z);
      const boxes = d.shape(meta, d.fence || d.name === 'glass_pane' ? { get: (dx, dy, dz) => this.getBlock(x + dx, y + dy, z + dz) } : null);
      for (const b of boxes) out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5], id]);
    }
    if (y0 <= 0 && minY < 0) out.push([x0, -10, z0, x1 + 1, 0, z1 + 1, B.bedrock]);
    return out;
  }

  // Raycast against block shapes (DDA + per-box slab test). Returns {x,y,z,face,px,py,pz,dist} or null
  raycast(ox, oy, oz, dx, dy, dz, maxDist, fluids = false, ignoreNonSolidPlants = false) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity, tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity, tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx !== 0 ? ((stepX > 0 ? x + 1 - ox : ox - x) * tDeltaX) : Infinity;
    let tMaxY = dy !== 0 ? ((stepY > 0 ? y + 1 - oy : oy - y) * tDeltaY) : Infinity;
    let tMaxZ = dz !== 0 ? ((stepZ > 0 ? z + 1 - oz : oz - z) * tDeltaZ) : Infinity;
    let t = 0, face = -1;
    for (let i = 0; i < 200 && t <= maxDist; i++) {
      const id = (y >= 0 && y < CY) ? this.getBlock(x, y, z) : 0;
      if (id) {
        const d = BLOCKS[id];
        const isFluid = d.fluid;
        if (!isFluid || fluids) {
          const meta = this.getMeta(x, y, z);
          let boxes = d.render === 'cross' || d.render === 'none' ? [[0.1, 0, 0.1, 0.9, 0.8, 0.9]] : isFluid ? [[0, 0, 0, 1, 0.875, 1]] : (d.renderShape || d.shape)(meta, { get: (ax, ay, az) => this.getBlock(x + ax, y + ay, z + az) });
          if (d.render === 'cross' && d.crop) boxes = [[0.1, 0, 0.1, 0.9, 0.6, 0.9]];
          if (boxes.length === 0) boxes = [[0, 0, 0, 1, 1, 1]];
          let best = null;
          for (const b of boxes) {
            const hit = rayBox(ox, oy, oz, dx, dy, dz, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
            if (hit && hit.t <= maxDist && (!best || hit.t < best.t)) best = hit;
          }
          if (best) return { x, y, z, id, face: best.face, dist: best.t, px: ox + dx * best.t, py: oy + dy * best.t, pz: oz + dz * best.t };
        }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; face = stepX > 0 ? 1 : 0; }
      else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; face = stepY > 0 ? 3 : 2; }
      else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 5 : 4; }
    }
    return null;
  }

  dispose() { this.pool.dispose(); this.chunks.clear(); }
}

// Ray vs AABB; returns {t, face} with face: 0 +x,1 -x,2 +y,3 -y,4 +z,5 -z (the face that was hit)
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, face = -1;
  const axes = [[ox, dx, x0, x1, 1, 0], [oy, dy, y0, y1, 3, 2], [oz, dz, z0, z1, 5, 4]];
  for (const [o, d, lo, hi, fNeg, fPos] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d, f = fNeg;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; f = fPos; }
    if (t1 > tmin) { tmin = t1; face = f; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  if (tmin < 0) return { t: 0, face: -1 }; // inside
  return { t: tmin, face };
}
export { DIM };
