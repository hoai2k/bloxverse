import { generateChunk } from './worldgen.js';
self.onmessage = (e) => {
  const { id, seed, cx, cz, dim, worldType } = e.data;
  const out = generateChunk(seed, cx, cz, dim, worldType);
  self.postMessage({ id, cx, cz, blocks: out.blocks, meta: out.meta, loot: out.loot }, [out.blocks.buffer, out.meta.buffer]);
};
