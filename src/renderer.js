// Three.js rendering: chunk meshes with a custom lit shader, sky, weather, selection box, held item.
import * as THREE from '../vendor/three.module.js';
import { BLOCKS, B } from './blocks.js';
import { getItem, isBlockItem } from './items.js';
import { buildAtlas, tileFor, tileUV, faceTexName, ATLAS_TILES, itemIcon } from './textures.js';
import { CY } from './chunk.js';
import { mulberry32 } from './noise.js';

const CHUNK_VERT = `
attribute vec2 aLight; attribute float aShade;
varying vec2 vUv; varying float vLight; varying float vWarm; varying float vDist;
uniform float uSun; uniform float uAmbient;
void main() {
  vUv = uv;
  float sky = aLight.x / 15.0; float blk = aLight.y / 15.0;
  float s = sky * uSun;
  float l = max(max(s, blk), uAmbient);
  float b = mix(l / (4.0 - 3.0 * l), l, 0.25);
  vLight = (0.03 + 0.97 * b) * aShade;
  vWarm = clamp(blk - s, 0.0, 1.0) * b;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const CHUNK_FRAG = `
precision highp float;
uniform sampler2D uAtlas; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uAlphaTest; uniform float uAlphaMul;
varying vec2 vUv; varying float vLight; varying float vWarm; varying float vDist;
void main() {
  vec4 c = texture2D(uAtlas, vUv);
  if (c.a < uAlphaTest) discard;
  vec3 col = c.rgb * vLight;
  col *= mix(vec3(1.0), vec3(1.05, 0.95, 0.8), vWarm);
  float f = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, c.a * uAlphaMul);
  #include <colorspace_fragment>
}`;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.three = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.three.autoClear = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1200);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    // atlas
    const atlasCanvas = buildAtlas();
    this.atlas = new THREE.CanvasTexture(atlasCanvas);
    this.atlas.magFilter = THREE.NearestFilter; this.atlas.minFilter = THREE.NearestFilter; this.atlas.generateMipmaps = false; this.atlas.flipY = false; this.atlas.colorSpace = THREE.SRGBColorSpace;
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    const uniforms = () => ({ uAtlas: { value: this.atlas }, uSun: { value: 1 }, uAmbient: { value: 0 }, uFogColor: { value: new THREE.Color(0.6, 0.75, 1) }, uFogNear: { value: 60 }, uFogFar: { value: 96 }, uAlphaTest: { value: 0.5 }, uAlphaMul: { value: 1 } });
    this.matOpaque = new THREE.ShaderMaterial({ vertexShader: CHUNK_VERT, fragmentShader: CHUNK_FRAG, uniforms: uniforms(), side: THREE.FrontSide });
    this.matTrans = new THREE.ShaderMaterial({ vertexShader: CHUNK_VERT, fragmentShader: CHUNK_FRAG, uniforms: uniforms(), transparent: true, depthWrite: true, side: THREE.FrontSide });
    this.matTrans.uniforms.uAlphaTest.value = 0.02;
    this.chunkGroup = new THREE.Group(); this.scene.add(this.chunkGroup);
    this.chunkMeshes = new Map();
    this.entityGroup = new THREE.Group(); this.scene.add(this.entityGroup);
    // lights for entities (Lambert)
    this.ambient = new THREE.AmbientLight(0xffffff, 0.9); this.scene.add(this.ambient);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.5); this.sunLight.position.set(0.3, 1, 0.5); this.scene.add(this.sunLight);
    this.buildSky();
    this.buildSelection();
    this.buildHand();
    this.weather = { rain: 0, snow: false };
    this.buildRain();
    this.underwater = false; this.inLava = false;
    this.fogDistance = 96;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.three.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  setFov(f) { this.camera.fov = f; this.camera.updateProjectionMatrix(); }

  // ---------- chunks ----------
  updateChunk(chunk, data) {
    this.removeChunk(chunk);
    const entry = {};
    for (const [key, mat] of [['opaque', this.matOpaque], ['translucent', this.matTrans]]) {
      const d = data[key]; if (!d) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
      g.setAttribute('aLight', new THREE.BufferAttribute(d.light, 2));
      g.setAttribute('aShade', new THREE.BufferAttribute(d.shade, 1));
      g.setIndex(new THREE.BufferAttribute(d.index, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = true; m.matrixAutoUpdate = false;
      if (key === 'translucent') m.renderOrder = 10;
      this.chunkGroup.add(m); entry[key] = m;
    }
    this.chunkMeshes.set(chunk.key, entry);
  }
  removeChunk(chunk) {
    const e = this.chunkMeshes.get(chunk.key); if (!e) return;
    for (const m of Object.values(e)) { this.chunkGroup.remove(m); m.geometry.dispose(); }
    this.chunkMeshes.delete(chunk.key);
  }
  clearChunks() { for (const e of this.chunkMeshes.values()) for (const m of Object.values(e)) { this.chunkGroup.remove(m); m.geometry.dispose(); } this.chunkMeshes.clear(); }

  // ---------- sky ----------
  buildSky() {
    this.skyGroup = new THREE.Group(); this.scene.add(this.skyGroup);
    const sunTex = makeSunMoonTexture(true), moonTex = makeSunMoonTexture(false);
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false }));
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, fog: false, depthWrite: false }));
    this.sun.position.set(0, 0, -600); this.moon.position.set(0, 0, 600); this.moon.rotation.y = Math.PI;
    this.celestial = new THREE.Group(); this.celestial.add(this.sun); this.celestial.add(this.moon); this.skyGroup.add(this.celestial);
    // stars
    const starGeo = new THREE.BufferGeometry(); const pts = []; const rng = mulberry32(42);
    for (let i = 0; i < 900; i++) { const v = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(700); pts.push(v.x, v.y, v.z); }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.celestial.add(this.stars);
    // clouds
    const cg = new THREE.BufferGeometry(); const cp = []; const ci = []; const crng = mulberry32(7);
    const N = 64, S = 12; let vi = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const n = Math.sin(i * 0.9) * Math.cos(j * 0.7) + crng() * 1.2 + Math.sin((i + j) * 0.35);
      if (n < 0.9) continue;
      const x = (i - N / 2) * S, z = (j - N / 2) * S;
      cp.push(x, 0, z, x + S, 0, z, x + S, 0, z + S, x, 0, z + S);
      ci.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2); vi += 4;
    }
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setIndex(ci); cg.computeVertexNormals();
    this.cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, fog: false, side: THREE.DoubleSide, depthWrite: false });
    this.clouds = new THREE.Mesh(cg, this.cloudMat); this.clouds.position.y = CY + 8; this.scene.add(this.clouds);
    this.cloudSize = N * S;
    this.skyColor = new THREE.Color(); this.fogColor = new THREE.Color();
    this.three.setClearColor(0x78a7ff);
  }

  // time: 0..24000 ticks. Returns sun brightness 0..1
  updateSky(time, camPos, dim = 0) {
    const t = ((time % 24000) + 24000) % 24000;
    const angle = (t / 24000) * Math.PI * 2 - Math.PI / 2; // sunrise at 0 => sun on horizon east
    this.celestial.rotation.set(0, 0, 0); this.celestial.rotation.z = -angle; this.celestial.position.copy(camPos);
    this.stars.rotation.set(0, 0, 0);
    // daylight factor: 1 at noon, 0 at midnight with smooth transitions around 12000-13800 and 22200-24000
    let day;
    if (t < 12000) day = 1; else if (t < 13800) day = 1 - (t - 12000) / 1800; else if (t < 22200) day = 0; else day = (t - 22200) / 1800;
    const sun = 0.25 + 0.75 * day;
    let sky, fog;
    if (dim === 1) { sky = new THREE.Color(0.22, 0.04, 0.04); fog = new THREE.Color(0.3, 0.06, 0.05); }
    else if (dim === 2) { sky = new THREE.Color(0.03, 0.02, 0.05); fog = new THREE.Color(0.08, 0.06, 0.1); }
    else {
      const dayC = new THREE.Color(0.47, 0.66, 1.0), nightC = new THREE.Color(0.01, 0.015, 0.04), duskC = new THREE.Color(0.95, 0.5, 0.2);
      sky = nightC.clone().lerp(dayC, day);
      fog = new THREE.Color(0.75, 0.85, 1.0).lerp(new THREE.Color(0.02, 0.025, 0.06), 1 - day);
      const dusk = (t > 11500 && t < 14000) ? 1 - Math.abs(t - 12750) / 1250 : (t > 22000 || t < 500) ? 1 - Math.abs(((t + 1000) % 24000) - 1000) / 1000 : 0;
      if (dusk > 0) { fog.lerp(duskC, dusk * 0.6); sky.lerp(duskC, dusk * 0.25); }
      if (this.weather.rain > 0) { const g = this.weather.rain * 0.7; sky.lerp(new THREE.Color(0.35, 0.38, 0.45).multiplyScalar(day + 0.05), g); fog.lerp(new THREE.Color(0.45, 0.48, 0.55).multiplyScalar(day + 0.05), g); }
    }
    let sunU = dim === 1 ? 0.55 : dim === 2 ? 0.7 : sun * (1 - this.weather.rain * 0.25);
    let fogNear = this.fogDistance * 0.75, fogFar = this.fogDistance;
    if (this.underwater) { fog = new THREE.Color(0.1, 0.25, 0.6); sky = fog.clone(); fogNear = 2; fogFar = 18 + 10 * day; }
    if (this.inLava) { fog = new THREE.Color(0.9, 0.3, 0.05); sky = fog.clone(); fogNear = 0; fogFar = 2; }
    const ambient = dim === 1 ? 0.45 : dim === 2 ? 0.4 : 0;
    for (const m of [this.matOpaque, this.matTrans]) { m.uniforms.uSun.value = sunU; m.uniforms.uAmbient.value = ambient; m.uniforms.uFogColor.value.copy(fog); m.uniforms.uFogNear.value = fogNear; m.uniforms.uFogFar.value = fogFar; }
    this.three.setClearColor(sky);
    this.skyColor.copy(sky); this.fogColor.copy(fog);
    this.stars.material.opacity = dim === 2 ? 1 : dim === 1 ? 0 : Math.max(0, 1 - day * 1.5) * (1 - this.weather.rain);
    this.sun.visible = dim === 0; this.moon.visible = dim === 0; this.clouds.visible = dim === 0 && camPos.y < CY + 8;
    this.sun.material.opacity = 1 - this.weather.rain * 0.8; this.moon.material.opacity = 1 - this.weather.rain * 0.8;
    this.cloudMat.color.setScalar(0.2 + 0.8 * day).multiplyScalar(1 - this.weather.rain * 0.4);
    // clouds drift
    const cs = this.cloudSize;
    this.clouds.position.x = camPos.x - ((camPos.x - t * 0.02 - performance.now() * 0.0005) % cs + cs) % cs + cs / 2 - cs / 2;
    this.clouds.position.x = Math.floor((camPos.x) / cs) * cs + ((performance.now() * 0.0006) % cs) - cs / 2;
    this.clouds.position.z = Math.floor(camPos.z / cs) * cs;
    this.ambient.intensity = 0.25 + 0.75 * sunU; this.sunLight.intensity = 0.45 * sunU;
    return sunU;
  }
  setFogDistance(d) { this.fogDistance = d; }

  // ---------- selection & break overlay ----------
  buildSelection() {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const e = new THREE.EdgesGeometry(g);
    this.selection = new THREE.LineSegments(e, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 }));
    this.selection.visible = false; this.scene.add(this.selection);
    const bg = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.breakMat = new THREE.MeshBasicMaterial({ map: this.atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.breakMesh = new THREE.Mesh(bg, this.breakMat); this.breakMesh.visible = false; this.breakMesh.renderOrder = 5; this.scene.add(this.breakMesh);
  }
  showSelection(box) { // box: [x0,y0,z0,x1,y1,z1] world coords or null
    if (!box) { this.selection.visible = false; return; }
    this.selection.visible = true;
    this.selection.position.set((box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2);
    this.selection.scale.set(box[3] - box[0] + 0.004, box[4] - box[1] + 0.004, box[5] - box[2] + 0.004);
  }
  showBreak(x, y, z, stage) {
    if (stage < 0) { this.breakMesh.visible = false; return; }
    this.breakMesh.visible = true; this.breakMesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    const idx = tileFor('destroy_' + Math.min(9, stage)); const [u, v] = tileUV(idx); const s = 1 / ATLAS_TILES;
    const uv = this.breakMesh.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const iu = i % 4; const uu = (iu === 1 || iu === 3) ? 0 : 1; const vv = (iu >= 2) ? 1 : 0; uv.setXY(i, u + (iu === 0 || iu === 2 ? 0 : 1) * s, v + (iu < 2 ? 0 : 1) * s); }
    uv.needsUpdate = true;
  }

  // ---------- first person hand ----------
  buildHand() {
    this.hand = new THREE.Group(); this.camera.add(this.hand);
    this.handItem = null; this.handId = -1; this.handMeta = -1;
    this.swingT = 0; this.bobT = 0;
    this.armMat = new THREE.MeshLambertMaterial({ color: 0xd9a58a });
  }
  setHeldItem(id, meta = 0) {
    if (id === this.handId && meta === this.handMeta) return;
    this.handId = id; this.handMeta = meta;
    if (this.handItem) { this.hand.remove(this.handItem); disposeObj(this.handItem); this.handItem = null; }
    let obj;
    if (!id) { obj = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.6), this.armMat); obj.position.set(0.5, -0.5, -0.75); obj.rotation.set(0.25, 0.35, 0); }
    else if (isBlockItem(id) && BLOCKS[id].render !== 'cross') { obj = this.makeBlockMesh(id, meta); obj.scale.setScalar(0.32); obj.position.set(0.5, -0.5, -0.8); obj.rotation.set(0.1, -0.6, 0); }
    else { obj = this.makeItemMesh(id); obj.scale.setScalar(0.5); obj.position.set(0.48, -0.45, -0.75); obj.rotation.set(0.1, -0.35, -0.3); }
    this.handItem = obj; this.hand.add(obj);
  }
  makeBlockMesh(id, meta = 0) {
    const def = BLOCKS[id]; const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.atlas, transparent: def.translucent || def.cutout, alphaTest: def.translucent ? 0.02 : 0.5, side: def.cutout ? THREE.DoubleSide : THREE.FrontSide });
    let boxes = def.render === 'cube' || def.render === 'fluid' ? [[0, 0, 0, 1, 1, 1]] : (def.renderShape || def.shape)(meta, null);
    if (def.render === 'cross') boxes = [[0, 0, 0, 1, 1, 1]];
    for (const b of boxes) {
      const g = new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
      const uv = g.attributes.uv; const s = 1 / ATLAS_TILES;
      // BoxGeometry face order: +x,-x,+y,-y,+z,-z ; 4 verts each: (0,1),(1,1),(0,0),(1,0) in uv-space (v up)
      for (let f = 0; f < 6; f++) {
        const name = faceTexName(def, meta, f); const [tu, tv] = tileUV(tileFor(name));
        const cropU = f < 2 ? [b[2], b[5]] : [b[0], b[3]], cropV = f === 2 || f === 3 ? [b[2], b[5]] : [b[1], b[4]];
        for (let i = 0; i < 4; i++) {
          const u = (i === 1 || i === 3) ? cropU[1] : cropU[0]; const v = (i < 2) ? cropV[1] : cropV[0];
          uv.setXY(f * 4 + i, tu + u * s, tv + (1 - v) * s);
        }
      }
      const m = new THREE.Mesh(g, mat); m.position.set((b[0] + b[3]) / 2 - 0.5, (b[1] + b[4]) / 2 - 0.5, (b[2] + b[5]) / 2 - 0.5); group.add(m);
    }
    return group;
  }
  makeItemMesh(id) {
    const def = getItem(id); let name = def.tex; if (typeof name === 'function') name = name(0); if (typeof name === 'object') name = name.side || name.top;
    if (isBlockItem(id)) name = faceTexName(def, 0, 4);
    const [tu, tv] = tileUV(tileFor(name)); const s = 1 / ATLAS_TILES;
    const g = new THREE.PlaneGeometry(1, 1); const uv = g.attributes.uv;
    uv.setXY(0, tu, tv); uv.setXY(1, tu + s, tv); uv.setXY(2, tu, tv + s); uv.setXY(3, tu + s, tv + s);
    const mat = new THREE.MeshLambertMaterial({ map: this.atlas, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    return new THREE.Mesh(g, mat);
  }
  swing() { this.swingT = 1; }
  updateHand(dt, moving, lightLevel) {
    if (this.swingT > 0) this.swingT = Math.max(0, this.swingT - dt * 3.2);
    if (moving) this.bobT += dt * 7; 
    const s = Math.sin(this.swingT * Math.PI);
    this.hand.position.set(Math.sin(this.bobT) * 0.02 * (moving ? 1 : 0) - s * 0.3, Math.abs(Math.cos(this.bobT)) * 0.02 * (moving ? 1 : 0) - s * 0.35, -s * 0.2);
    this.hand.rotation.set(-s * 1.2, s * 0.5, 0);
    const l = 0.15 + 0.85 * lightLevel;
    this.hand.traverse(o => { if (o.isMesh) { const m = o.material; if (!m.userData.base) m.userData.base = m.color.clone(); m.color.copy(m.userData.base).multiplyScalar(l); } });
  }
  setHandVisible(v) { this.hand.visible = v; }

  // ---------- weather ----------
  buildRain() {
    const N = 900; this.rainN = N;
    const g = new THREE.BufferGeometry(); const pos = new Float32Array(N * 6);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0x9fb8e8, transparent: true, opacity: 0.55 });
    this.rain = new THREE.LineSegments(g, this.rainMat); this.rain.visible = false; this.rain.frustumCulled = false; this.scene.add(this.rain);
    this.rainDrops = new Float32Array(N * 4); // x,y,z,speed
    for (let i = 0; i < N; i++) this.rainDrops[i * 4 + 3] = 0;
  }
  updateRain(dt, camPos, world, snow) {
    const intensity = this.weather.rain; this.rain.visible = intensity > 0.02;
    if (!this.rain.visible) return;
    const pos = this.rain.geometry.attributes.position.array; const d = this.rainDrops; const R = 14;
    const len = snow ? 0.12 : 0.9; this.rainMat.color.set(snow ? 0xffffff : 0x9fb8e8); this.rainMat.opacity = snow ? 0.9 : 0.5 * intensity;
    const active = Math.floor(this.rainN * intensity);
    for (let i = 0; i < this.rainN; i++) {
      if (i >= active) { pos[i * 6 + 1] = -1000; pos[i * 6 + 4] = -1000; continue; }
      if (d[i * 4 + 3] === 0 || d[i * 4 + 1] < camPos.y - 8 || Math.abs(d[i * 4] - camPos.x) > R || Math.abs(d[i * 4 + 2] - camPos.z) > R) {
        const x = camPos.x + (Math.random() - 0.5) * 2 * R, z = camPos.z + (Math.random() - 0.5) * 2 * R;
        const y = camPos.y + 6 + Math.random() * 10;
        if (world.getSky(Math.floor(x), Math.min(CY - 1, Math.floor(y)), Math.floor(z)) < 15) { d[i * 4 + 3] = 0; pos[i * 6 + 1] = -1000; pos[i * 6 + 4] = -1000; continue; }
        d[i * 4] = x; d[i * 4 + 1] = y; d[i * 4 + 2] = z; d[i * 4 + 3] = snow ? 1.5 + Math.random() : 14 + Math.random() * 6;
      }
      d[i * 4 + 1] -= d[i * 4 + 3] * dt;
      const ground = world.surfaceY(Math.floor(d[i * 4]), Math.floor(d[i * 4 + 2]));
      if (d[i * 4 + 1] < ground + 1) d[i * 4 + 3] = 0;
      if (snow) d[i * 4] += Math.sin(performance.now() * 0.001 + i) * dt * 0.3;
      pos[i * 6] = d[i * 4]; pos[i * 6 + 1] = d[i * 4 + 1]; pos[i * 6 + 2] = d[i * 4 + 2];
      pos[i * 6 + 3] = d[i * 4]; pos[i * 6 + 4] = d[i * 4 + 1] + len; pos[i * 6 + 5] = d[i * 4 + 2];
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  render() { this.three.render(this.scene, this.camera); }
}

function makeSunMoonTexture(sun) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16; const ctx = c.getContext('2d');
  ctx.fillStyle = sun ? '#fff5b0' : '#e8e8f0'; ctx.fillRect(2, 2, 12, 12);
  if (sun) { ctx.fillStyle = '#ffe070'; ctx.fillRect(4, 4, 8, 8); } else { ctx.fillStyle = '#c8c8d8'; ctx.fillRect(5, 5, 4, 4); ctx.fillRect(9, 8, 3, 3); }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; return t;
}
export function disposeObj(o) { o.traverse(x => { if (x.geometry) x.geometry.dispose(); }); }
export { THREE };
