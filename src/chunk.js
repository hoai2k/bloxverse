// Chunk storage: 16 x 128 x 16 columns. Index = (x*CZ + z)*CY + y so a column is contiguous.
export const CX = 16, CY = 128, CZ = 16;
export const CHUNK_VOLUME = CX * CY * CZ;

export function idx(x, y, z) { return (x * CZ + z) * CY + y; }
export function chunkKey(cx, cz) { return cx + ',' + cz; }

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.blocks = new Uint16Array(CHUNK_VOLUME);
    this.meta = new Uint8Array(CHUNK_VOLUME);
    this.light = new Uint8Array(CHUNK_VOLUME); // low nibble: block light, high nibble: sky light
    this.state = 0;         // 0 empty, 1 generated, 2 lit, 3 meshed
    this.dirty = false;     // needs remesh
    this.modified = false;  // needs saving
    this.meshes = null;     // {opaque, translucent}
    this.tileEntities = new Map(); // "x,y,z" (local) -> data
    this.lastAccess = 0;
    this.entitiesSpawned = false;
  }
  get(x, y, z) { return this.blocks[idx(x, y, z)]; }
  set(x, y, z, id) { this.blocks[idx(x, y, z)] = id; }
  getMeta(x, y, z) { return this.meta[idx(x, y, z)]; }
  setMeta(x, y, z, m) { this.meta[idx(x, y, z)] = m; }
  getSky(x, y, z) { return this.light[idx(x, y, z)] >> 4; }
  getBlockLight(x, y, z) { return this.light[idx(x, y, z)] & 15; }
  setSky(x, y, z, v) { const i = idx(x, y, z); this.light[i] = (this.light[i] & 15) | (v << 4); }
  setBlockLight(x, y, z, v) { const i = idx(x, y, z); this.light[i] = (this.light[i] & 0xF0) | v; }

  // Highest non-air y in column, or -1
  topY(x, z) {
    const base = (x * CZ + z) * CY;
    for (let y = CY - 1; y >= 0; y--) if (this.blocks[base + y] !== 0) return y;
    return -1;
  }
}
