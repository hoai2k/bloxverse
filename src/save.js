// IndexedDB persistence: world list, per-world metadata, modified chunks.
const DB_NAME = 'craftverse';
const DB_VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
let dbPromise = null;
function db() { if (!dbPromise) dbPromise = openDB(); return dbPromise; }
function tx(store, mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode); const s = t.objectStore(store); const r = fn(s);
    t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : r); t.onerror = () => reject(t.error);
    if (r && 'onsuccess' in r) r.onsuccess = () => { resolve(r.result); };
  }));
}

export const SaveStore = {
  async listWorlds() { const all = await tx('worlds', 'readonly', s => s.getAll()); return (all || []).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)); },
  async getWorld(id) { return tx('worlds', 'readonly', s => s.get(id)); },
  async putWorld(meta) { return tx('worlds', 'readwrite', s => s.put(meta)); },
  async deleteWorld(id) {
    await tx('worlds', 'readwrite', s => s.delete(id));
    const d = await db();
    await new Promise((resolve) => {
      const t = d.transaction('chunks', 'readwrite'); const s = t.objectStore('chunks');
      const range = IDBKeyRange.bound(id + '|', id + '|￿');
      const req = s.openCursor(range);
      req.onsuccess = () => { const c = req.result; if (c) { c.delete(); c.continue(); } };
      t.oncomplete = resolve; t.onerror = resolve;
    });
  },
  async getChunk(worldId, dim, cx, cz) {
    const r = await tx('chunks', 'readonly', s => s.get(`${worldId}|${dim}|${cx},${cz}`));
    if (!r) return null;
    return { blocks: new Uint16Array(r.blocks), meta: new Uint8Array(r.meta), tileEntities: r.tileEntities || [], entities: r.entities || [], entitiesSpawned: r.entitiesSpawned };
  },
  async putChunks(worldId, dim, chunks) {
    if (!chunks.length) return;
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('chunks', 'readwrite'); const s = t.objectStore('chunks');
      for (const c of chunks) s.put({ key: `${worldId}|${dim}|${c.cx},${c.cz}`, blocks: c.blocks.buffer.slice(0), meta: c.meta.buffer.slice(0), tileEntities: c.tileEntities, entities: c.entities, entitiesSpawned: c.entitiesSpawned });
      t.oncomplete = resolve; t.onerror = () => reject(t.error);
    });
  },
};

export const Settings = {
  load() { try { return Object.assign({ renderDistance: 6, fov: 70, sensitivity: 0.5, volume: 0.6, music: 0.3, showFps: false, fancyGraphics: true, autoJump: true }, JSON.parse(localStorage.getItem('craftverse.settings') || '{}')); } catch { return { renderDistance: 6, fov: 70, sensitivity: 0.5, volume: 0.6, music: 0.3 }; } },
  save(s) { try { localStorage.setItem('craftverse.settings', JSON.stringify(s)); } catch { } },
};
