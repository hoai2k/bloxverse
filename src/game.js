// Game orchestration: loop, input, time/weather, dimensions, saving, block breaking, explosions, portals.
import { Renderer, THREE } from './renderer.js';
import { World, DIM } from './world.js';
import { Player } from './player.js';
import { EntityManager, Particles, Mob, humanoidModel } from './entities.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { SaveStore } from './save.js';
import { BLOCKS, B, COLORS } from './blocks.js';
import { I, getItem, makeStack, isBlockItem } from './items.js';
import { attachGame, furnaceTick, fillLoot } from './blocklogic.js';
import { CX, CY, CZ } from './chunk.js';
import { hashString, mulberry32 } from './noise.js';
import { SEA_LEVEL } from './worldgen.js';

const COLOR_HEX = { white: 0xf0f0f0, orange: 0xf07613, magenta: 0xbd44b3, light_blue: 0x3aafd9, yellow: 0xf8c527, lime: 0x70b919, pink: 0xed8dac, gray: 0x3e4447, light_gray: 0x8e8e86, cyan: 0x158991, purple: 0x792aac, blue: 0x35399d, brown: 0x724728, green: 0x546d1b, red: 0xa12722, black: 0x141519 };

class Input {
  constructor(game) {
    this.game = game; this.keys = new Set(); this.justPressed = new Set(); this.buttons = new Set(); this.dx = 0; this.dy = 0; this.locked = false;
    const c = game.canvas;
    document.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; if (!this.keys.has(e.code)) this.justPressed.add(e.code); this.keys.add(e.code); if (game.running && !game.ui.screenOpen && ['Space', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault(); });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    const unlockAudio = () => game.audio.ensure(); document.addEventListener('pointerdown', unlockAudio); document.addEventListener('keydown', unlockAudio);
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    c.addEventListener('mousedown', (e) => { if (!game.running) return; if (!this.locked) { game.requestPointerLock(); return; } this.buttons.add(e.button); game.onMouseDown(e.button); e.preventDefault(); });
    document.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => { if (!this.locked) return; this.dx += e.movementX; this.dy += e.movementY; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === c; if (!this.locked && game.running && !game.ui.screenOpen && !game.player.dead) { /* user pressed Esc: open pause */ game.ui.openPause(); } });
  }
  key(code) { return this.keys.has(code) ? 1 : 0; }
  pressed(code) { return this.justPressed.has(code); }
  mouse(b) { return this.buttons.has(b === 2 ? 2 : b); }
  endFrame() { this.justPressed.clear(); this.dx = 0; this.dy = 0; }
}

export class Game {
  constructor(canvas, settings) {
    this.canvas = canvas; this.settings = settings; this.running = false;
    this.consts = { COLORS, COLOR_HEX };
    this.renderer = null; this.audio = new Audio();
    this.time = 1000; this.weather = { raining: false, thunder: false, intensity: 0, timer: 6000 }; this.difficulty = 2; this.cheats = false; this.hardcore = false;
    this.fps = 0; this.frameMs = 0; this.thirdPerson = 0; this.sunLevel = 1; this.stats = {}; this.daysSinceSleep = 0; this.lastSleepDay = 0;
    this.worlds = new Map(); this.bossEntity = null; this.rng = mulberry32(Date.now() >>> 0);
  }
  requestPointerLock() { if (this.running && !this.ui.screenOpen) { try { const r = this.canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch { } } }

  // ---------- lifecycle ----------
  async start(meta) {
    this.meta = meta; this.worldId = meta.id; this.seed = meta.seed; this.cheats = !!meta.cheats; this.hardcore = !!meta.hardcore; this.difficulty = meta.difficulty ?? 2; this.time = meta.time ?? 1000;
    this.dragonKilled = !!meta.dragonKilled; this.stats = meta.stats || {}; this.daysSinceSleep = meta.daysSinceSleep || 0;
    if (meta.weather) Object.assign(this.weather, meta.weather);
    if (!this.renderer) { this.renderer = new Renderer(this.canvas); this.ui = new UI(this); this.input = new Input(this); attachGame(this); }
    this.applySettings(this.settings);
    this.entities = new EntityManager(this); this.particles = new Particles(this);
    this.world = this.createWorld(meta.dim || 0);
    this.player = new Player(this); this.player.world = this.world;
    this.playerModel = null;
    if (meta.player) this.player.deserialize(meta.player); else { this.player.setGamemode(meta.gamemode || 'survival'); this.player.x = 0.5; this.player.z = 0.5; this.player.y = 90; }
    this.firstSpawn = !meta.player;
    // loading: wait for chunks near player
    const loading = document.getElementById('loading'); loading.hidden = false; document.getElementById('hud').hidden = true;
    const bar = document.getElementById('loading-bar'), txt = document.getElementById('loading-text');
    if (this.firstSpawn) { const sp = this.findSpawn(); this.player.x = sp.x; this.player.z = sp.z; this.player.y = sp.y; this.player.spawn = { x: sp.x, y: sp.y, z: sp.z, dim: 0 }; }
    await this.preload((p, t) => { bar.style.width = (p * 100) + '%'; txt.textContent = t; });
    if (this.firstSpawn) { this.settleSpawn(this.player); this.player.spawn.y = this.player.y; if (meta.bonusChest) this.placeBonusChest(); }
    loading.hidden = true; document.getElementById('hud').hidden = false;
    this.running = true; this.lastT = performance.now(); this.tickAcc = 0; this.autosaveT = 0;
    this.ui.chatMessage('Welcome to ' + meta.name + '! Press E for inventory, T to chat, /help for commands.', '#aaffaa');
    if (this.hardcore) this.ui.chatMessage('Hardcore mode: you only get one life.', '#ff5555');
    this.requestPointerLock();
    requestAnimationFrame((t) => this.frame(t));
  }
  createWorld(dim) {
    if (this.worlds.has(dim)) { const w = this.worlds.get(dim); w.setRenderDistance(this.settings.renderDistance); return w; }
    const w = new World({ seed: this.seed, dim, worldType: this.meta.worldType || 'default', renderDistance: this.settings.renderDistance, loader: (cx, cz) => SaveStore.getChunk(this.worldId, dim, cx, cz) });
    w.onMesh = (c, data) => { if (this.world === w) this.renderer.updateChunk(c, data); };
    w.onUnload = (c) => { if (this.world === w) { this.renderer.removeChunk(c); const ents = this.entities.unloadChunk(c); if (ents.length) { c.savedEntities = ents; c.modified = true; } } this.saveChunks([c]); };
    w.onChunkReady = (c) => { if (this.world === w && this.entities) this.entities.populateChunk(c); };
    this.worlds.set(dim, w);
    return w;
  }
  async preload(progress) {
    const w = this.world, p = this.player; const need = 9 + 16; // 5x5 area meshed
    for (let i = 0; i < 1200; i++) {
      w.update(p.x, p.z, 12);
      let done = 0; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const c = w.getChunk((Math.floor(p.x) >> 4) + dx, (Math.floor(p.z) >> 4) + dz); if (c && c.state >= 3) done++; }
      progress(Math.min(1, done / 25), done < 25 ? `Preparing spawn area... ${Math.round(done / 25 * 100)}%` : 'Done');
      if (done >= 25) break;
      await new Promise(r => setTimeout(r, 0));
    }
  }
  findSpawn() {
    const g = this.world.gen; const rng = mulberry32(this.seed);
    for (let r = 0; r < 200; r++) { const x = Math.floor((rng() - 0.5) * 2 * r * 8), z = Math.floor((rng() - 0.5) * 2 * r * 8); const h = g.heightAt(x, z); const b = g.biomeAt(x, z); if (h >= SEA_LEVEL && !b.water && b.id !== 'ocean' && b.id !== 'mountains' && b.id !== 'snowy_mountains') return { x: x + 0.5, y: h + 2, z: z + 0.5 }; }
    return { x: 0.5, y: g.heightAt(0, 0) + 2, z: 0.5 };
  }
  settleSpawn(p) {
    const w = this.world; const bx = Math.floor(p.x), bz = Math.floor(p.z);
    if (!w.isLoaded(bx, bz)) { p.y = Math.max(p.y, 90); return; }
    let y = CY - 2; while (y > 1 && (w.getBlock(bx, y, bz) === 0 || BLOCKS[w.getBlock(bx, y, bz)].leaves || !BLOCKS[w.getBlock(bx, y, bz)].solid)) y--; y++;
    for (let k = 0; k < 20 && (BLOCKS[w.getBlock(bx, y, bz)].solid || BLOCKS[w.getBlock(bx, y + 1, bz)].solid); k++) y++;
    if (w.dim === 1 && y >= CY - 5) { for (let yy = 30; yy < CY - 5; yy++) if (w.getBlock(bx, yy, bz) === 0 && w.getBlock(bx, yy + 1, bz) === 0 && BLOCKS[w.getBlock(bx, yy - 1, bz)].solid) { y = yy; break; } }
    p.y = y; p.vy = 0; p.fallStart = null;
  }
  placeBonusChest() { const w = this.world, p = this.player; const x = Math.floor(p.x) + 2, z = Math.floor(p.z), y = w.surfaceY(x, z) + 1; w.setBlock(x, y, z, B.chest, 0); const te = w.getTileEntity(x, y, z); te.slots = new Array(27).fill(null); const items = [[B.oak_log, 6], [I.wooden_pickaxe, 1], [I.wooden_axe, 1], [I.bread, 4], [I.apple, 3], [B.torch, 8], [B.oak_planks, 12], [I.stick, 6]]; items.forEach(([id, n], i) => te.slots[i * 3] = makeStack(id, n)); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.getBlock(x + dx, y, z + dz) === 0 && Math.random() < 0.6) w.setBlock(x + dx, y, z + dz, B.torch, 0); }
  applySettings(s) {
    this.settings = s; if (!this.renderer) return;
    this.renderer.setFov(s.fov); this.audio.setVolume(s.volume); this.audio.musicVolume = s.music;
    this.renderer.setFogDistance(s.renderDistance * 16 - 6);
    if (this.world) this.world.setRenderDistance(s.renderDistance);
    this.renderer.clouds.visible = s.fancyGraphics !== false;
  }
  async quitToTitle() {
    this.ui.closeScreen(true); await this.save(true); this.running = false;
    document.exitPointerLock && document.exitPointerLock();
    for (const w of this.worlds.values()) w.dispose(); this.worlds.clear();
    this.renderer.clearChunks(); this.entities.clear(); this.renderer.scene.remove(this.particles.points); if (this.playerModel) { this.renderer.scene.remove(this.playerModel); this.playerModel = null; }
    document.getElementById('hud').hidden = true; document.getElementById('chat-log').innerHTML = '';
    if (this.onQuit) this.onQuit();
  }

  // ---------- main loop ----------
  frame(t) {
    if (!this.running) return;
    requestAnimationFrame((t2) => this.frame(t2));
    const t0 = performance.now();
    let dt = Math.min(0.1, (t - this.lastT) / 1000); this.lastT = t;
    this.fps = this.fps * 0.95 + (1 / Math.max(0.001, dt)) * 0.05;
    const paused = this.ui.screen && (this.ui.screen.type === 'pause' || this.ui.screen.type === 'options');
    const p = this.player;
    if (!paused) {
      // mouse look
      const inp = this.input; if (inp.locked && !this.ui.screenOpen && !p.sleeping) { const s = this.settings.sensitivity * 0.0022; p.yaw -= inp.dx * s; p.pitch -= inp.dy * s; p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch)); }
      // world & simulation
      this.tickAcc += dt; let ticks = 0; while (this.tickAcc >= 0.05 && ticks < 4) { this.tick(); this.tickAcc -= 0.05; ticks++; }
      if (this.world.isLoaded(Math.floor(p.x), Math.floor(p.z))) { const sub = dt > 0.034 ? 2 : 1; for (let i = 0; i < sub; i++) p.update(dt / sub); } else p.updateLook();
      // mining / using
      p.mine(dt, inp.mouse(0) && inp.locked && !this.ui.screenOpen);
      if (inp.mouse(2) && inp.locked && !this.ui.screenOpen) { this.useHold = (this.useHold || 0) + dt; if (this.useHold > 0.22) { this.useHold = 0; p.use(); } } else this.useHold = 0.2;
      this.entities.update(dt); this.particles.update(dt);
      this.updateTileEntitiesVisual();
    }
    this.world.update(p.x, p.z, this.fps > 50 ? 7 : 4);
    // camera
    this.updateCamera();
    this.sunLevel = this.renderer.updateSky(this.time, this.renderer.camera.position, this.world.dim);
    const biome = this.world.biomeAt(p.x, p.z); const snow = biome.snow || (biome.temp < 0.15);
    this.renderer.weather.rain = this.world.dim === 0 && !biome.dry ? this.weather.intensity : 0;
    if (this.settings.fancyGraphics !== false) this.renderer.updateRain(dt, this.renderer.camera.position, this.world, snow); else this.renderer.rain.visible = false;
    this.renderer.underwater = p.headInWater && this.thirdPerson === 0; this.renderer.inLava = p.headInLava && this.thirdPerson === 0;
    this.renderer.showSelection(p.selectedBox && !p.lookEntity && p.canBuild ? p.selectedBox : null);
    const held = p.inventory.held; this.renderer.setHeldItem(held ? held.id : 0, 0);
    const lightHere = this.world.getLightLevel(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z), this.sunLevel) / 15;
    this.renderer.updateHand(dt, p.moving && p.onGround, lightHere);
    this.renderer.setHandVisible(this.thirdPerson === 0 && !p.spectator && !p.dead);
    if (p.bowCharge >= 0) this.renderer.hand.position.z += p.bowCharge * 0.15;
    if (p.eating > 0) this.renderer.hand.rotation.x = -0.5 + Math.sin(p.eating * 30) * 0.1;
    this.renderer.render();
    if (this.wantScreenshot) { this.wantScreenshot = false; try { const a = document.createElement('a'); a.href = this.canvas.toDataURL('image/png'); a.download = 'craftverse-' + Date.now() + '.png'; a.click(); this.ui.showToast('Screenshot saved'); } catch (e) { this.ui.showToast('Screenshot failed'); } }
    this.ui.updateHUD(dt);
    this.input.endFrame();
    this.frameMs = performance.now() - t0;
    if (this.settings.showFps && !this.ui.debugOn) { this.fpsEl = this.fpsEl || document.getElementById('debug'); this.fpsEl.hidden = false; this.fpsEl.textContent = this.fps.toFixed(0) + ' fps'; } else if (this.fpsEl && !this.ui.debugOn) this.fpsEl.hidden = true;
    if (!paused) this.audio.updateMusic(dt, !this.isDay());
  }
  tick() {
    const p = this.player, w = this.world;
    this.time++;
    if (this.time % 24000 === 0) { this.daysSinceSleep++; }
    w.processTicks(1);
    w.randomTicks(Math.floor(p.x), Math.floor(p.z), 4, 3, this.rng);
    // tile entities: furnaces, spawners
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    for (let cx = pcx - 3; cx <= pcx + 3; cx++) for (let cz = pcz - 3; cz <= pcz + 3; cz++) { const c = w.getChunk(cx, cz); if (!c || c.state < 2 || !c.tileEntities.size) continue; for (const te of c.tileEntities.values()) { const id = w.getBlock(te.x, te.y, te.z); const def = BLOCKS[id]; if (def.interact === 'furnace') { if (furnaceTick(w, te, def) ) c.modified = true; if ((te.burn || 0) > 0 && Math.random() < 0.05) { this.particles.emit(te.x + 0.5, te.y + 0.5, te.z + 0.5, 'smoke', 1); if (Math.random() < 0.3) this.playSoundAt('furnace', te.x, te.y, te.z, { volume: 0.4 }); } } else if (id === B.spawner) this.tickSpawner(te); } }
    // weather
    this.updateWeather();
    // sleeping
    if (p.sleeping && p.sleepT > 2.5) { p.sleeping = false; this.time = Math.floor(this.time / 24000) * 24000 + 24000 + 1000; this.daysSinceSleep = 0; if (this.weather.raining && Math.random() < 0.7) this.setWeather(false, false); p.sleepT = 0; this.ui.showToast('Good morning!'); }
    // autosave
    this.autosaveT++; if (this.autosaveT > 20 * 45) { this.autosaveT = 0; this.save(false); }
    // ambient cave sounds / lava
    if (Math.random() < 0.002 && w.getSky(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) < 6) this.audio.play('enderman', { volume: 0.15 });
    // End boss
    if (w.dim === 2 && !this.dragonKilled && (!this.bossEntity || this.bossEntity.removed) && Math.hypot(p.x, p.z) < 160) { this.bossEntity = this.entities.spawnMob('ender_dragon', 0, 85, -40, { noDespawn: true }); this.ui.showTitle('', 'The Ender Dragon awakens'); this.playSoundAt('dragon', 0, 85, -40); }
  }
  tickSpawner(te) {
    const p = this.player; if (this.difficulty === 0) return;
    if (Math.hypot(p.x - te.x, p.y - te.y, p.z - te.z) > 16) return;
    te.mob = te.mob || ['zombie', 'skeleton', 'spider', 'cave_spider', 'zombie'][Math.floor(Math.random() * 5)]; te.cd = (te.cd || 200) - 1;
    if (Math.random() < 0.3) this.particles.emit(te.x + 0.5, te.y + 0.5, te.z + 0.5, 'flame', 1);
    if (te.cd > 0) return; te.cd = 200 + Math.floor(Math.random() * 600);
    const near = this.entities.countMobs(e => e.type === te.mob && Math.hypot(e.x - te.x, e.z - te.z) < 8); if (near >= 6) return;
    for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) { const x = te.x + 0.5 + (Math.random() - 0.5) * 6, z = te.z + 0.5 + (Math.random() - 0.5) * 6; let y = te.y - 1; for (let k = 0; k < 4; k++) { if (this.world.getBlock(Math.floor(x), y + k, Math.floor(z)) === 0 && this.world.getBlock(Math.floor(x), y + k + 1, Math.floor(z)) === 0 && BLOCKS[this.world.getBlock(Math.floor(x), y + k - 1, Math.floor(z))].solid) { this.entities.spawnMob(te.mob, x, y + k, z); this.particles.emit(x, y + k + 1, z, 'flame', 6); break; } } }
  }
  updateTileEntitiesVisual() { }
  updateCamera() {
    const cam = this.renderer.camera, p = this.player;
    const ex = p.x, ey = p.eyeY, ez = p.z;
    cam.rotation.set(p.pitch, p.yaw, 0);
    if (this.thirdPerson === 0) { cam.position.set(ex, ey, ez); if (p.hurtTimer > 0.4) cam.rotation.z = (p.hurtTimer - 0.4) * 2; if (this.playerModel) this.playerModel.visible = false; return; }
    const d = p.lookDir; const back = this.thirdPerson === 1 ? -1 : 1; const dist = 4;
    const hit = this.world.raycast(ex, ey, ez, d[0] * back, d[1] * back, d[2] * back, dist);
    const dd = hit ? Math.max(0.3, hit.dist - 0.3) : dist;
    cam.position.set(ex + d[0] * back * dd, ey + d[1] * back * dd, ez + d[2] * back * dd);
    if (this.thirdPerson === 2) cam.rotation.set(-p.pitch, p.yaw + Math.PI, 0);
    if (!this.playerModel) { this.playerModel = humanoidModel({ skin: 0xd9a58a, hair: 0x4a2f1a, shirt: 0x2fb5c9, pants: 0x3c3a8f, sleeve: 0xd9a58a }, { key: 'player', face: (ctx) => { ctx.fillStyle = '#4a2f1a'; ctx.fillRect(0, 0, 16, 3); ctx.fillStyle = '#fff'; ctx.fillRect(3, 6, 4, 2); ctx.fillRect(9, 6, 4, 2); ctx.fillStyle = '#3a4a8a'; ctx.fillRect(5, 6, 2, 2); ctx.fillRect(9, 6, 2, 2); ctx.fillStyle = '#a06050'; ctx.fillRect(6, 11, 4, 2); } }); this.renderer.scene.add(this.playerModel); }
    const m = this.playerModel; m.visible = !p.dead && !p.spectator && dd > 1.1; m.position.set(p.x, p.y, p.z); m.rotation.y = p.yaw; m.userData.head.rotation.x = -p.pitch;
    const sp = Math.hypot(p.vx, p.vz); this.animT = (this.animT || 0) + (sp > 0.3 ? sp * 4 : 0) * 0.016; const sw = Math.sin(this.animT) * Math.min(1, sp / 3) * 0.8;
    m.userData.legs.forEach((l, i) => l.rotation.x = i ? -sw : sw); m.userData.arms.forEach((a, i) => a.rotation.x = i ? sw : -sw);
    const l = this.world.getLightLevel(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z), this.sunLevel) / 15; m.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mm => { if (!mm.userData.base) mm.userData.base = mm.color.clone(); mm.color.copy(mm.userData.base).multiplyScalar(0.2 + 0.8 * l); }); });
  }
  isDay() { const t = this.time % 24000; return t < 12550 || t > 23450; }
  updateWeather() {
    const w = this.weather;
    w.timer--;
    if (w.timer <= 0) { if (w.raining) this.setWeather(false, false); else if (Math.random() < 0.5) this.setWeather(true, Math.random() < 0.25); else w.timer = 3000 + Math.floor(Math.random() * 9000); }
    w.intensity += ((w.raining ? 1 : 0) - w.intensity) * 0.01;
    if (w.thunder && this.world.dim === 0 && Math.random() < 0.0025) { this.ui.showTitle('', ''); document.getElementById('vignette').style.background = 'rgba(255,255,255,0.7)'; setTimeout(() => document.getElementById('vignette').style.background = '', 80); setTimeout(() => this.audio.play('thunder', { volume: 0.7 }), 300 + Math.random() * 1500); if (Math.random() < 0.3) { const p = this.player; const x = Math.floor(p.x + (Math.random() - 0.5) * 60), z = Math.floor(p.z + (Math.random() - 0.5) * 60); const y = this.world.surfaceY(x, z) + 1; if (this.world.getSky(x, y, z) >= 15 && this.world.getBlock(x, y, z) === 0) { this.world.setBlock(x, y, z, B.fire); this.particles.emit(x + 0.5, y + 0.5, z + 0.5, 'flame', 20); } } }
    if (w.raining && this.world.dim === 0 && Math.random() < 0.02) { const p = this.player; const x = Math.floor(p.x + (Math.random() - 0.5) * 40), z = Math.floor(p.z + (Math.random() - 0.5) * 40); const y = this.world.surfaceY(x, z); const b = this.world.biomeAt(x, z); if (b.snow && this.world.getSky(x, y + 1, z) >= 15 && this.world.getBlock(x, y + 1, z) === 0 && BLOCKS[this.world.getBlock(x, y, z)].opaque) this.world.setBlock(x, y + 1, z, B.snow, 0); else if (this.world.getBlock(x, y + 1, z) === B.fire) this.world.setBlock(x, y + 1, z, 0); }
  }
  setWeather(rain, thunder) { const w = this.weather; w.raining = rain; w.thunder = rain && thunder; w.timer = rain ? 2400 + Math.floor(Math.random() * 9600) : 6000 + Math.floor(Math.random() * 12000); }

  // ---------- sound ----------
  playSoundAt(name, x, y, z, opts = {}) { const p = this.player; const d = Math.hypot(p.x - x, p.y - y, p.z - z); this.audio.play(name, Object.assign({ dist: d }, opts)); }

  // ---------- interactions ----------
  onMouseDown(button) {
    const p = this.player; if (p.dead || this.ui.screenOpen) return;
    if (p.sleeping) { p.sleeping = false; p.sleepT = 0; return; }
    if (button === 0) { if (p.lookEntity) p.attack(); else if (p.spectator) { } else { this.renderer.swing(); if (!p.lookHit && !p.creative) p.exhaustion += 0.01; } }
    else if (button === 2) { this.useHold = 0; p.use(); }
    else if (button === 1) { const h = p.lookHit; if (!h) return; const inv = p.inventory; const id = h.id; if (p.creative) { const i = inv.slots.findIndex((s, k) => k < 9 && s && s.id === id); if (i >= 0) inv.selected = i; else { const empty = inv.slots.findIndex((s, k) => k < 9 && !s); const slot = empty >= 0 ? empty : inv.selected; inv.slots[slot] = makeStack(id, 1); inv.selected = slot; } } else { const i = inv.slots.findIndex((s, k) => k < 9 && s && s.id === id); if (i >= 0) inv.selected = i; } }
  }
  dropHeld(all) { const p = this.player; const s = p.inventory.held; if (!s) return; const n = all ? s.count : 1; this.dropStack({ id: s.id, count: n, dmg: s.dmg }); s.count -= n; if (s.count <= 0) p.inventory.setHeld(null); this.renderer.swing(); }
  dropStack(stack) { const p = this.player; const d = p.lookDir; this.entities.dropItem(p.x + d[0] * 0.5, p.eyeY - 0.3, p.z + d[2] * 0.5, stack, false, [d[0] * 6 + p.vx, d[1] * 6 + 1, d[2] * 6 + p.vz]); this.ui.invalidateInventory(); }
  openBlockUI(kind, x, y, z) {
    const w = this.world; const def = BLOCKS[w.getBlock(x, y, z)];
    if (kind === 'crafting') this.ui.openCrafting(x, y, z);
    else if (kind === 'chest') { const te = w.getTileEntity(x, y, z); if (te.lootKind) { fillLoot(te, te.lootKind, Math.random); delete te.lootKind; } this.ui.openChest(te, def.displayName); }
    else if (kind === 'furnace') { const te = w.getTileEntity(x, y, z); this.ui.openFurnace(te, def); }
  }
  hurtPlayer(amount, source, bypassArmor = false) { return this.player.hurt(amount, source, bypassArmor ? { fall: true } : {}); }
  onPlayerDeath(cause) { this.ui.chatMessage('Player ' + cause, '#ff5555'); this.ui.showDeath(cause); if (this.hardcore) { this.meta.hardcoreDead = true; } this.save(false); }
  breakBlock(x, y, z, player, doDrops = true) {
    const w = this.world; const id = w.getBlock(x, y, z); if (!id) return; const def = BLOCKS[id]; const meta = w.getMeta(x, y, z);
    if (def.hardness < 0 && player && !player.creative) return;
    const te = w.getTileEntity(x, y, z, false);
    w.setBlock(x, y, z, 0, 0);
    if (def.onBroken) def.onBroken(w, x, y, z, meta);
    this.playSoundAt('break', x, y, z); for (let i = 0; i < 12; i++) this.particles.emit(x + Math.random(), y + Math.random(), z + Math.random(), 'block', 1, id);
    if (te && te.slots) for (const s of te.slots) if (s) this.entities.dropItem(x + 0.5, y + 0.5, z + 0.5, s, true);
    if (!doDrops || (player && player.creative)) return;
    const held = player ? player.inventory.held : null; const tool = held ? getItem(held.id)?.tool : null;
    if (player && !player.canHarvest(def)) return;
    const drops = def.drops ? def.drops(meta, tool?.type, Math.random) : [{ id, count: 1 }];
    for (const d of drops) { let did = d.id; if (typeof did === 'string') did = I[did] ?? B[did]; if (did === undefined || d.count <= 0) continue; this.entities.dropItem(x + 0.5, y + 0.5, z + 0.5, makeStack(did, d.count), true); }
    if (def.xp && player) { const n = def.xp + Math.floor(Math.random() * 3); this.entities.spawnXP(x + 0.5, y + 0.5, z + 0.5, n); }
  }
  explode(x, y, z, power, source, fire = false) {
    const w = this.world; const r = Math.ceil(power * 1.4);
    this.playSoundAt('explode', x, y, z); for (let i = 0; i < 40; i++) this.particles.emit(x, y, z, 'explosion', 1); for (let i = 0; i < 20; i++) this.particles.emit(x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4, 'smoke', 1);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      const d = Math.hypot(dx, dy, dz); if (d > power * 1.3) continue;
      const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz; const id = w.getBlock(bx, by, bz); if (!id) continue; const def = BLOCKS[id];
      if (def.hardness < 0 || def.fluid || id === B.obsidian || id === B.crying_obsidian || id === B.end_portal_frame || id === B.netherite_block || id === B.ancient_debris) continue;
      const resist = def.hardness > 20 ? 1 : def.hardness / 20; if (d + resist * 3 > power * 1.3 * (0.7 + Math.random() * 0.6)) continue;
      if (id === B.tnt) { w.setBlock(bx, by, bz, 0); this.entities.spawnTNT(bx + 0.5, by, bz + 0.5, 10 + Math.floor(Math.random() * 20)); continue; }
      const te = w.getTileEntity(bx, by, bz, false); if (te && te.slots) for (const s of te.slots) if (s) this.entities.dropItem(bx + 0.5, by + 0.5, bz + 0.5, s, true);
      w.setBlock(bx, by, bz, 0);
      if (Math.random() < 0.25 / power && def.drops) { const drops = def.drops(0, null, Math.random); for (const dd of drops) { let did = dd.id; if (typeof did === 'string') did = I[did] ?? B[did]; if (did !== undefined && dd.count > 0) this.entities.dropItem(bx + 0.5, by + 0.5, bz + 0.5, makeStack(did, dd.count), true); } } else if (Math.random() < 0.3 / power && !def.drops) this.entities.dropItem(bx + 0.5, by + 0.5, bz + 0.5, makeStack(id, 1), true);
      if (fire && Math.random() < 0.3 && w.getBlock(bx, by + 1, bz) === 0) w.setBlock(bx, by + 1, bz, B.fire);
    }
    // entities
    const hitE = (e, isPlayer) => { const d = Math.hypot(e.x - x, (e.y + (e.h || 1.8) / 2) - y, e.z - z); if (d > power * 2) return; const f = 1 - d / (power * 2); const dmg = Math.round((f * f + f) * 7 * power); const dx = e.x - x, dy = (e.y + (e.h || 1.8) / 2) - y, dz = e.z - z; const dl = Math.hypot(dx, dy, dz) || 1; if (isPlayer) { if (e.hurt(dmg, null, { explosion: true })) { e.vx += dx / dl * f * 14; e.vy += Math.abs(dy / dl) * f * 10 + f * 6; e.vz += dz / dl * f * 14; e.fallStart = e.y; } } else if (e.hurt) { e.hurt(dmg, null); e.vx += dx / dl * f * 14; e.vy += f * 8; e.vz += dz / dl * f * 14; } else if (e.vx !== undefined) { e.vx += dx / dl * f * 10; e.vy += f * 8; e.vz += dz / dl * f * 10; } };
    hitE(this.player, true); for (const e of this.entities.list) if (e !== source && !e.removed) hitE(e, false);
  }
  trySleep(x, y, z) {
    const p = this.player, w = this.world;
    if (w.dim !== 0) { w.setBlock(x, y, z, 0); this.explode(x + 0.5, y + 0.5, z + 0.5, 5, null, true); return; }
    p.bedSpawn = { x: x + 0.5, y: y + 1, z: z + 0.5, dim: 0 }; this.ui.showToast('Respawn point set');
    if (this.isDay() && !this.weather.thunder) { this.ui.showToast('You can only sleep at night'); return; }
    const hostile = this.entities.list.some(e => e instanceof Mob && e.def.hostile && !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 8 && Math.abs(e.y - p.y) < 5);
    if (hostile) { this.ui.showToast('You may not rest now, there are monsters nearby'); return; }
    p.sleeping = true; p.sleepT = 0; p.x = x + 0.5; p.z = z + 0.5; p.y = y + 0.56; p.vx = p.vy = p.vz = 0;
  }
  tryLightPortal(x, y, z) {
    const w = this.world; if (w.dim === 2) return false;
    // find the bottom-left interior corner of a 2-wide 3-tall frame containing (x,y,z), in either axis
    for (const axis of ['x', 'z']) {
      let x0 = x, z0 = z; let y0 = y;
      while (w.getBlock(x0, y0 - 1, z0) === 0 || w.getBlock(x0, y0 - 1, z0) === B.fire) { y0--; if (y - y0 > 3) break; }
      if (w.getBlock(x0, y0 - 1, z0) !== B.obsidian) continue;
      const step = axis === 'x' ? [1, 0] : [0, 1];
      while (w.getBlock(x0 - step[0], y0, z0 - step[1]) === 0 || w.getBlock(x0 - step[0], y0, z0 - step[1]) === B.fire) { x0 -= step[0]; z0 -= step[1]; if (Math.abs(x0 - x) + Math.abs(z0 - z) > 2) break; }
      if (w.getBlock(x0 - step[0], y0, z0 - step[1]) !== B.obsidian) continue;
      let ok = true;
      for (let i = 0; i < 2 && ok; i++) for (let j = 0; j < 3 && ok; j++) { const bx = x0 + step[0] * i, bz = z0 + step[1] * i; const id = w.getBlock(bx, y0 + j, bz); if (id !== 0 && id !== B.fire) ok = false; if (w.getBlock(bx, y0 - 1, bz) !== B.obsidian || w.getBlock(bx, y0 + 3, bz) !== B.obsidian) ok = false; }
      for (let j = 0; j < 3 && ok; j++) { if (w.getBlock(x0 - step[0], y0 + j, z0 - step[1]) !== B.obsidian || w.getBlock(x0 + step[0] * 2, y0 + j, z0 + step[1] * 2) !== B.obsidian) ok = false; }
      if (!ok) continue;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) w.setBlock(x0 + step[0] * i, y0 + j, z0 + step[1] * i, B.nether_portal, axis === 'x' ? 0 : 1, { noUpdate: true });
      this.playSoundAt('portal', x, y, z); return true;
    }
    return false;
  }
  tryActivateEndPortal(x, y, z) {
    const w = this.world;
    for (let cx = x - 2; cx <= x + 2; cx++) for (let cz = z - 2; cz <= z + 2; cz++) {
      let ok = true; let count = 0;
      for (let dx = -2; dx <= 2 && ok; dx++) for (let dz = -2; dz <= 2 && ok; dz++) { const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2; if (!edge) continue; if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; if (w.getBlock(cx + dx, y, cz + dz) !== B.end_portal_frame || !(w.getMeta(cx + dx, y, cz + dz) & 4)) ok = false; else count++; }
      if (ok && count === 12) { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) w.setBlock(cx + dx, y, cz + dz, B.end_portal, 0, { noUpdate: true }); this.playSoundAt('portal', x, y, z); this.ui.showTitle('', 'The End portal opens'); return true; }
    }
    return false;
  }
  async changeDimension(dim, spawnOverride = null) {
    const p = this.player; if (this.switching) return; this.switching = true;
    const from = this.world;
    // save entities in current world
    await this.save(false);
    this.entities.clear(); this.renderer.clearChunks();
    for (const c of from.chunks.values()) { if (c.state >= 2 && this.entities) { } }
    const w = this.createWorld(dim); this.world = w; p.world = w; w._lastCx = null;
    for (const c of w.chunks.values()) if (c.state >= 3) this.renderer.updateChunk(c, null) ; // will be remeshed below
    for (const c of w.chunks.values()) { if (c.state >= 3) { c.state = 2; } }
    let tx, ty, tz;
    if (spawnOverride) { tx = spawnOverride.x; ty = spawnOverride.y; tz = spawnOverride.z; }
    else if (dim === 1) { tx = p.x / 8; tz = p.z / 8; ty = 64; }
    else if (dim === 2) { tx = 45.5; ty = 62; tz = 0.5; }
    else if (from.dim === 1) { tx = p.x * 8; tz = p.z * 8; ty = 70; }
    else { const s = p.bedSpawn || p.spawn; tx = s.x; ty = s.y; tz = s.z; }
    p.x = tx; p.y = ty; p.z = tz; p.vx = p.vy = p.vz = 0; p.portalT = -3; p.fallStart = null;
    const loading = document.getElementById('loading'); loading.hidden = false; document.getElementById('loading-title').textContent = ['Entering the Overworld', 'Entering the Nether', 'Entering the End'][dim];
    await this.preload((pr, t) => { document.getElementById('loading-bar').style.width = pr * 100 + '%'; document.getElementById('loading-text').textContent = t; });
    loading.hidden = true;
    if (dim === 2) { for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { w.setBlock(45 + dx, 61, dz, B.obsidian, 0, { noUpdate: true }); for (let yy = 62; yy < 66; yy++) w.setBlock(45 + dx, yy, dz, 0, 0, { noUpdate: true }); } p.y = 62; }
    else if (dim === 1 || (dim === 0 && from.dim === 1)) { if (!spawnOverride) this.placeArrivalPortal(p); }
    else this.settleSpawn(p);
    this.ui.showTitle('', ['Overworld', 'The Nether', 'The End'][dim], 3); this.audio.play('portal');
    for (const c of w.chunks.values()) if (c.state >= 2) this.entities.populateChunk(c);
    this.switching = false; this.playerModel = this.playerModel; this.ui.invalidateInventory();
  }
  placeArrivalPortal(p) {
    const w = this.world; const bx = Math.floor(p.x), bz = Math.floor(p.z);
    // look for an existing portal nearby
    for (let r = 0; r < 24; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue; for (let y = 5; y < CY - 5; y++) if (w.getBlock(bx + dx, y, bz + dz) === B.nether_portal && w.getBlock(bx + dx, y - 1, bz + dz) !== B.nether_portal) { p.x = bx + dx + 0.5; p.y = y; p.z = bz + dz + 0.5; return; } }
    // build one: find ground
    let y;
    if (w.dim === 1) { y = -1; for (let yy = 32; yy < CY - 8; yy++) { let ok = true; for (let dx = -1; dx <= 3 && ok; dx++) for (let yy2 = 0; yy2 < 5 && ok; yy2++) if (w.getBlock(bx + dx, yy + yy2, bz) !== 0) ok = false; if (ok && BLOCKS[w.getBlock(bx, yy - 1, bz)].solid) { y = yy; break; } } if (y < 0) { y = 64; for (let dx = -2; dx <= 4; dx++) for (let dz = -2; dz <= 2; dz++) { for (let yy = y; yy < y + 6; yy++) w.setBlock(bx + dx, yy, bz + dz, 0, 0, { noUpdate: true }); w.setBlock(bx + dx, y - 1, bz + dz, B.netherrack, 0, { noUpdate: true }); } } }
    else { y = w.surfaceY(bx, bz) + 1; }
    for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 3; dy++) { const frame = dx === -1 || dx === 2 || dy === -1 || dy === 3; w.setBlock(bx + dx, y + dy, bz, frame ? B.obsidian : B.nether_portal, 0, { noUpdate: true }); if (!frame) { w.setBlock(bx + dx, y + dy, bz - 1, 0, 0, { noUpdate: true }); w.setBlock(bx + dx, y + dy, bz + 1, 0, 0, { noUpdate: true }); } }
    for (let dx = -1; dx <= 2; dx++) for (const dz of [-1, 1]) if (!BLOCKS[w.getBlock(bx + dx, y - 1, bz + dz)].solid) w.setBlock(bx + dx, y - 1, bz + dz, B.obsidian, 0, { noUpdate: true });
    p.x = bx + 0.5; p.y = y; p.z = bz + 1.5;
  }
  onDragonKilled(dragon) {
    this.dragonKilled = true; this.bossEntity = null; const w = this.world;
    this.ui.showTitle('Victory!', 'You defeated the Ender Dragon');
    this.entities.spawnXP(dragon.x, dragon.y, dragon.z, 500);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!(dx === 0 && dz === 0)) w.setBlock(dx, 60, dz, B.end_portal, 0);
    w.setBlock(0, 65, 0, B.dragon_egg, 0);
    this.stats.dragonKills = (this.stats.dragonKills || 0) + 1; this.player.score += 1000; this.save(false);
  }
  screenshot() { this.wantScreenshot = true; }

  // ---------- saving ----------
  async saveChunks(chunks) {
    const list = chunks.filter(c => c.modified && c.state >= 1).map(c => ({ cx: c.cx, cz: c.cz, blocks: c.blocks, meta: c.meta, tileEntities: [...c.tileEntities.values()], entities: this.entities ? (c.savedEntities || this.entities.serializeChunk(c)) : [], entitiesSpawned: c.entitiesSpawned }));
    for (const c of chunks) c.modified = false;
    if (!list.length) return;
    try { await SaveStore.putChunks(this.worldId, chunks[0].world ? chunks[0].world.dim : this.world.dim, list); } catch (e) { console.warn('save chunks failed', e); }
  }
  async save(full) {
    if (!this.worldId) return;
    const p = this.player;
    const meta = Object.assign({}, this.meta, { id: this.worldId, seed: this.seed, time: this.time, weather: { raining: this.weather.raining, thunder: this.weather.thunder, timer: this.weather.timer, intensity: this.weather.intensity }, difficulty: this.difficulty, cheats: this.cheats, hardcore: this.hardcore, dim: this.world.dim, player: p.serialize(), lastPlayed: Date.now(), dragonKilled: this.dragonKilled, stats: this.stats, daysSinceSleep: this.daysSinceSleep, gamemode: p.gamemode });
    this.meta = meta;
    try { await SaveStore.putWorld(meta); } catch (e) { console.warn('save meta failed', e); }
    for (const [dim, w] of this.worlds) { const chunks = [...w.chunks.values()].filter(c => c.modified); if (!chunks.length) continue; const list = chunks.map(c => ({ cx: c.cx, cz: c.cz, blocks: c.blocks, meta: c.meta, tileEntities: [...c.tileEntities.values()], entities: w === this.world ? this.entities.serializeChunk(c) : (c.savedEntities || []), entitiesSpawned: c.entitiesSpawned })); for (const c of chunks) c.modified = false; try { await SaveStore.putChunks(this.worldId, dim, list); } catch (e) { console.warn('save failed', e); } }
    if (full) this.ui.showToast('World saved');
  }
}
