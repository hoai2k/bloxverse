// Player: movement (walk/sprint/sneak/swim/climb/fly/noclip), survival stats, mining, item use, combat.
import { BLOCKS, B, isSoil, WOODS } from './blocks.js';
import { I, getItem, isBlockItem, makeStack, TOOL_MATERIALS, maxStack } from './items.js';
import { Inventory } from './inventory.js';
import { moveEntity, GRAVITY, fluidState, intersectsSolid } from './physics.js';
import { placementFor, applyBoneMeal, igniteTNT } from './blocklogic.js';
import { CY } from './chunk.js';
import { enchantLevel } from './enchant.js';
import { Mob } from './entities.js';

export const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'];

export class Player {
  constructor(game, index = 0, input = null) {
    this.game = game; this.world = game.world;
    this.index = index; this.input = input; this.view = null; this.hud = null;
    this.name = index === 0 ? 'Player' : 'Player ' + (index + 1);
    this.screen = null; this.chatOpen = false;
    this.x = 0; this.y = 80; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.w = 0.6; this.h = 1.8;
    this.yaw = 0; this.pitch = 0; this.onGround = false; this.type = 'player';
    this.inventory = new Inventory();
    this.health = 20; this.maxHealth = 20; this.hunger = 20; this.saturation = 5; this.exhaustion = 0; this.air = 300; this.fire = 0;
    this.xp = 0; this.level = 0; this.xpProgress = 0; this.score = 0;
    this.effects = { poison: 0, regen: 0, absorption: 0, fireRes: 0, speed: 0, strength: 0 };
    this.dead = false; this.deadT = 0; this.gamemode = 'survival'; this.flying = false; this.noclip = false; this.thirdPerson = 0; this.isPlayer = true; this.model = null; this.useHold = 0;
    this.sneaking = false; this.sprinting = false; this.inWater = false; this.headInWater = false; this.inLava = false; this.onLadder = false; this.gliding = false;
    this.spawn = null; this.bedSpawn = null;
    this.breaking = null; this.breakProgress = 0; this.breakCd = 0; this.attackCd = 0; this.useCd = 0; this.eating = 0; this.bowCharge = -1; this.fishing = null;
    this.hurtTimer = 0; this.regenT = 0; this.starveT = 0; this.poisonT = 0; this.fallStart = null; this.lastAttacker = null; this.lastAttackerT = 0; this.lastTarget = null; this.lastTargetT = 0;
    this.jumpCd = 0; this.lastJumpTap = 0; this.stepT = 0; this.sleeping = false; this.sleepT = 0; this.portalT = 0; this.reach = 4.5; this.selectedBox = null; this.lookHit = null; this.lookEntity = null;
    this.stats = { blocksMined: 0, blocksPlaced: 0, distance: 0, deaths: 0 };
  }
  get screenOpen() { return !!this.screen || this.chatOpen; }
  get hasControl() { return !this.screenOpen && (this.input ? this.input.kind !== 'keyboard' || this.game.input.locked : false); }
  swing() { if (this.view) this.game.renderer.swing(this.view); }
  showBreak(x, y, z, stage) { if (this.view) this.game.renderer.showBreak(this.view, x, y, z, stage); }
  get eyeHeight() { return this.sneaking && !this.flying ? 1.27 : (this.gliding ? 0.6 : 1.62); }
  get eyeY() { return this.y + this.eyeHeight; }
  get lookDir() { const c = Math.cos(this.pitch); return [-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c]; }
  get creative() { return this.gamemode === 'creative'; }
  get spectator() { return this.gamemode === 'spectator'; }
  get invulnerable() { return this.creative || this.spectator; }
  get canBuild() { return this.gamemode !== 'spectator' && this.gamemode !== 'adventure'; }

  setGamemode(m) {
    this.gamemode = m; this.game.ui.showToastFor(this, 'Game mode: ' + m[0].toUpperCase() + m.slice(1));
    if (m === 'spectator') { this.flying = true; this.noclip = true; } else { this.noclip = false; if (m !== 'creative') this.flying = false; }
    if (this.view) this.game.renderer.setHandVisible(this.view, m !== 'spectator');
    this.reach = m === 'creative' ? 5 : 4.5;
  }
  give(stack) { const left = this.inventory.add(stack); if (left > 0) this.game.entities.dropItem(this.x, this.y + 1, this.z, makeStack(stack.id, left, stack.dmg), true); this.game.ui.invalidateInventory(); }

  // ---------- update ----------
  update(dt) {
    const g = this.game, w = this.world = g.world, inp = this.input;
    if (this.dead) this.deadT += dt; else this.deadT = 0;
    this.hurtTimer = Math.max(0, this.hurtTimer - dt); this.attackCd = Math.max(0, this.attackCd - dt); this.useCd = Math.max(0, this.useCd - dt); this.jumpCd = Math.max(0, this.jumpCd - dt); this.breakCd = Math.max(0, this.breakCd - dt);
    if (this.dead) return;
    if (!Number.isFinite(this.x + this.y + this.z + this.yaw + this.pitch)) { console.warn('player state invalid, resetting'); if (!Number.isFinite(this.yaw)) this.yaw = 0; if (!Number.isFinite(this.pitch)) this.pitch = 0; if (!Number.isFinite(this.x + this.y + this.z)) { const sp = this.bedSpawn || this.spawn || { x: 0.5, y: 80, z: 0.5 }; this.x = sp.x; this.y = sp.y; this.z = sp.z; } this.vx = this.vy = this.vz = 0; }
    if (this.sleeping) { this.sleepT += dt; return; }
    const uiOpen = this.screenOpen;
    const mv = uiOpen ? { fwd: 0, strafe: 0 } : inp.move();
    const fwd = mv.fwd, strafe = mv.strafe;
    const jump = !uiOpen && inp.down('jump'), sneakKey = !uiOpen && inp.down('sneak'), sprintKey = !uiOpen && inp.down('sprint');
    const fs = fluidState(w, this, this.eyeY);
    this.inWater = fs.water; this.inLava = fs.lava; this.headInWater = fs.head; this.headInLava = fs.headLava;
    const blockAt = w.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)), blockAtDef = BLOCKS[blockAt];
    const blockAt2 = w.getBlock(Math.floor(this.x), Math.floor(this.y + 1), Math.floor(this.z));
    this.onLadder = !this.flying && (blockAtDef.ladder || BLOCKS[blockAt2].ladder) && !this.noclip;
    const inWeb = blockAtDef.web || BLOCKS[blockAt2].web;
    // double-tap space toggles flight in creative
    if (jump && !this._jumpHeld) { if (this.creative && g.time - this.lastJumpTap < 6) { this.flying = !this.flying; this.vy = 0; } this.lastJumpTap = g.time; }
    this._jumpHeld = jump;
    if (this.spectator) this.flying = true;
    if (this.flying && this.onGround && !this.spectator && !jump) { /* landing cancels flight */ if (this.vy <= 0 && this.creative) this.flying = false; }
    // sneak / sprint
    this.sneaking = sneakKey && !this.flying;
    const wantSprint = (sprintKey || this._sprintToggle) && fwd > 0 && (this.hunger > 6 || this.creative) && !this.sneaking && !inWeb;
    if (fwd > 0.9 && !this._fwdWas) { if (g.time - (this._lastW || -100) < 6) this._sprintToggle = true; this._lastW = g.time; }
    this._fwdWas = fwd > 0.9;
    if (fwd <= 0 || this.sneaking) this._sprintToggle = false;
    this.sprinting = wantSprint;
    // eating / bow / fishing hold states
    this.updateUse(dt);
    // movement
    let speed = 4.317; if (this.sprinting) speed *= 1.3; if (this.sneaking) speed *= 0.3; if (this.effects.speed > 0) speed *= 1.2; if (inWeb) speed *= 0.15; if (blockAt === B.soul_sand || w.getBlock(Math.floor(this.x), Math.floor(this.y - 0.01), Math.floor(this.z)) === B.soul_sand) speed *= 0.4;
    if (this.flying) speed = this.sprinting ? 21.8 : 10.9;
    if ((this.inWater || this.inLava) && !this.flying) { speed = this.sprinting ? 4.4 : 2.2; const ds = enchantLevel(this.inventory.armor[3], 'depth_strider'); speed *= 1 + ds * 0.4; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = (-sin * fwd + cos * strafe), mz = (-cos * fwd - sin * strafe);
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const moving = ml > 0.01;
    this.moving = moving;
    if (this.noclip) {
      const up = (jump ? 1 : 0) - (sneakKey ? 1 : 0);
      const tx = mx * speed, tz = mz * speed, ty = up * speed;
      this.vx += (tx - this.vx) * Math.min(1, dt * 8); this.vz += (tz - this.vz) * Math.min(1, dt * 8); this.vy += (ty - this.vy) * Math.min(1, dt * 8);
      this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt; this.onGround = false;
    } else if (this.flying) {
      const up = (jump ? 1 : 0) - (sneakKey ? 1 : 0);
      this.vx += (mx * speed - this.vx) * Math.min(1, dt * 6); this.vz += (mz * speed - this.vz) * Math.min(1, dt * 6); this.vy += (up * speed * 0.7 - this.vy) * Math.min(1, dt * 6);
      const r = moveEntity(w, this, this.vx * dt, this.vy * dt, this.vz * dt, 0); if (r.hitY) this.vy = 0; this.onGround = r.onGround;
      if (r.hitX) this.vx = 0; if (r.hitZ) this.vz = 0;
    } else if (this.gliding) {
      // elytra: pitch controls dive/climb
      const d = this.lookDir; const sp = Math.hypot(this.vx, this.vy, this.vz);
      this.vy -= GRAVITY * 0.12 * dt; const lift = Math.max(0, -d[1]) * 0.5;
      this.vx += d[0] * (8 + sp * 0.2) * dt; this.vz += d[2] * (8 + sp * 0.2) * dt; this.vy += (d[1] * 6 + lift * sp * 0.5) * dt;
      const f = Math.pow(0.99, dt * 20); this.vx *= f; this.vz *= f; this.vy *= Math.pow(0.985, dt * 20);
      const r = moveEntity(w, this, this.vx * dt, this.vy * dt, this.vz * dt, 0);
      if ((r.hitX || r.hitZ) && sp > 8) this.hurt(Math.floor(sp - 6), null, { nature: true });
      if (r.hitY) this.vy = 0; this.onGround = r.onGround; if (this.onGround || this.inWater || sneakKey) this.gliding = false;
    } else if (this.inWater || this.inLava) {
      const g2 = this.inLava ? 6 : 8; this.vy -= g2 * dt;
      if (jump) this.vy += (this.inLava ? 14 : 26) * dt; if (sneakKey) this.vy -= 10 * dt;
      this.vy = Math.max(-4, Math.min(4, this.vy)); if (!jump && !sneakKey && this.vy < 0) this.vy *= Math.pow(0.85, dt * 20); if (this.vy > 0 && !jump) this.vy *= Math.pow(0.9, dt * 20);
      this.vx += (mx * speed - this.vx) * Math.min(1, dt * 5); this.vz += (mz * speed - this.vz) * Math.min(1, dt * 5);
      const r = moveEntity(w, this, this.vx * dt, this.vy * dt, this.vz * dt, 0.6); if (r.hitY) this.vy = 0; this.onGround = r.onGround;
      if (r.hitX) this.vx = 0; if (r.hitZ) this.vz = 0;
      // climb out of water onto a block
      if ((r.hitX || r.hitZ) && jump && fwd > 0) this.vy = Math.max(this.vy, 3.5);
      this.fallStart = null;
      if (this.inWater && Math.random() < dt * 3) g.particles.emit(this.x, this.eyeY, this.z, 'bubble', 1);
    } else if (this.onLadder) {
      const up = fwd > 0 || jump ? 2.35 : (sneakKey ? 0 : -2.4);
      if (this.pitch < -0.6 && fwd > 0 && !jump) this.vy = -2.4; else this.vy = up;
      this.vx += (mx * speed * 0.5 - this.vx) * Math.min(1, dt * 10); this.vz += (mz * speed * 0.5 - this.vz) * Math.min(1, dt * 10);
      const r = moveEntity(w, this, this.vx * dt, this.vy * dt, this.vz * dt, 0); if (r.hitY) this.vy = 0; this.onGround = r.onGround || (this.vy <= 0);
      if (r.hitX) this.vx = 0; if (r.hitZ) this.vz = 0;
      this.fallStart = null;
    } else {
      // ground / air
      const acc = this.onGround ? 10 : 2.5;
      this.vx += (mx * speed - this.vx) * Math.min(1, dt * acc); this.vz += (mz * speed - this.vz) * Math.min(1, dt * acc);
      if (this.onGround && !moving) { const f = Math.pow(0.5, dt * 20); this.vx *= f; this.vz *= f; }
      const belowId = w.getBlock(Math.floor(this.x), Math.floor(this.y - 0.05), Math.floor(this.z));
      if (this.onGround && BLOCKS[belowId].slippery && !moving) { const f = Math.pow(0.98, dt * 20); this.vx /= Math.pow(0.5, dt * 20); this.vz /= Math.pow(0.5, dt * 20); this.vx *= f; this.vz *= f; }
      this.vy -= GRAVITY * dt; this.vy = Math.max(this.vy, -78);
      if (jump && this.onGround && this.jumpCd <= 0) { this.vy = 9.2 + (BLOCKS[blockAt].name === 'honey_block' ? -4 : 0); this.jumpCd = 0.25; if (this.sprinting) { this.vx += mx * 2; this.vz += mz * 2; } this.exhaustion += this.sprinting ? 0.2 : 0.05; this.onGround = false; }
      if (jump && !this.onGround && this.vy < 0 && !this.gliding && this.hasElytra() && !this._jumpHeldGlide) { this.gliding = true; this._jumpHeldGlide = true; }
      if (!jump) this._jumpHeldGlide = false;
      const ox = this.x, oz = this.z;
      const r = moveEntity(w, this, this.vx * dt, this.vy * dt, this.vz * dt, 0.6);
      // sneaking edge guard
      if (this.sneaking && this.onGround && !r.onGround) { const supported = intersectsSolid(w, this.x - this.w / 2, this.y - 0.2, this.z - this.w / 2, this.x + this.w / 2, this.y, this.z + this.w / 2); if (!supported) { const nx = this.x, nz = this.z; this.x = ox; if (!intersectsSolid(w, this.x - this.w / 2, this.y - 0.2, this.z - this.w / 2, this.x + this.w / 2, this.y, this.z + this.w / 2)) { this.z = oz; } else { /* keep z */ } this.vx = 0; this.vz = 0; r.onGround = true; if (!intersectsSolid(w, this.x - this.w / 2, this.y - 0.2, this.z - this.w / 2, this.x + this.w / 2, this.y, this.z + this.w / 2)) { this.x = ox; this.z = oz; } } }
      if (r.hitY) { if (this.vy < 0 && BLOCKS[belowId].bouncy && !sneakKey && this.vy < -6) { this.vy = -this.vy * 0.8; } else this.vy = 0; }
      if (r.hitX) this.vx = 0; if (r.hitZ) this.vz = 0;
      const wasOnGround = this.onGround; this.onGround = r.onGround;
      if ((r.hitX || r.hitZ) && this.onGround && moving && g.settings.autoJump !== false && this.jumpCd <= 0 && !this.sneaking) {
        const ax = Math.floor(this.x + mx * 0.7), az = Math.floor(this.z + mz * 0.7), ay = Math.floor(this.y + 0.1);
        if (BLOCKS[w.getBlock(ax, ay, az)].solid && !BLOCKS[w.getBlock(ax, ay + 1, az)].solid && !BLOCKS[w.getBlock(ax, ay + 2, az)].solid && !BLOCKS[w.getBlock(Math.floor(this.x), ay + 2, Math.floor(this.z))].solid) { this.vy = 9.4; this.vx = mx * speed * 0.9; this.vz = mz * speed * 0.9; this.jumpCd = 0.35; this.onGround = false; this.fallStart = this.y; }
      }
      if (!this.onGround && this.fallStart === null && this.vy < 0) this.fallStart = this.y + (wasOnGround ? 0 : 0);
      if (this.vy > 0) this.fallStart = Math.max(this.fallStart ?? this.y, this.y);
      if (this.onGround && this.fallStart !== null) {
        const dist = this.fallStart - this.y - 3;
        if (dist > 0 && !this.invulnerable) { const soft = BLOCKS[belowId].softLanding || BLOCKS[belowId].bouncy || belowId === B.water; if (!soft) { const dmg = Math.floor(dist * (belowId === B.mud ? 0.5 : 1)); if (dmg > 0) { this.hurt(dmg, null, { fall: true }); } } }
        this.fallStart = null;
      }
      if (this.inWater) this.fallStart = null;
    }
    // stats & sounds
    const moved = Math.hypot(this.x - (this._px ?? this.x), this.z - (this._pz ?? this.z)); this._px = this.x; this._pz = this.z; this.stats.distance += moved;
    if (this.onGround && moved > 0.01) { this.stepT += moved * (this.sprinting ? 1.1 : 1); if (this.stepT > 1.9) { this.stepT = 0; const b = BLOCKS[w.getBlock(Math.floor(this.x), Math.floor(this.y - 0.1), Math.floor(this.z))]; if (b.id) g.audio.play('step_' + (b.sound || 'stone'), { volume: this.sneaking ? 0.3 : 0.9 }); } }
    if (this.sprinting) this.exhaustion += moved * 0.1; else if (this.inWater) this.exhaustion += moved * 0.01;
    // hazards
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    for (let dy = 0; dy <= 1; dy++) { const id = w.getBlock(bx, by + dy, bz); if (id === B.fire) { this.fire = Math.max(this.fire, 8); if (Math.random() < dt * 2) this.hurt(1, null, { fire: true }); } if (id === B.magma_block || id === B.campfire) { if (!this.sneaking && Math.random() < dt * 2) this.hurt(1, null, { fire: true }); } if (id === B.sweet_berry_bush) { } }
    const belowBlock = w.getBlock(bx, Math.floor(this.y - 0.05), bz); if (belowBlock === B.magma_block && !this.sneaking && Math.random() < dt * 2) this.hurt(1, null, { fire: true });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) { const cx = Math.floor(this.x + dx * 0.4), cz = Math.floor(this.z + dz * 0.4); for (let dy = 0; dy <= 1; dy++) if (w.getBlock(cx, by + dy, cz) === B.cactus && Math.random() < dt * 2) this.hurt(1, null, { nature: true }); }
    if (this.inLava && !this.invulnerable) { this.fire = 15; if (Math.random() < dt * 2.5) this.hurt(4, null, { fire: true }); }
    if (this.fire > 0) { this.fire -= dt; this._fireT = (this._fireT || 0) + dt; if (this._fireT > 1) { this._fireT = 0; if (!this.effects.fireRes) this.hurt(1, null, { fire: true }); } if (this.inWater || g.weather.raining && w.getSky(bx, by + 2, bz) >= 15) this.fire = 0; if (this.invulnerable) this.fire = 0; }
    if (this.headInWater && !this.invulnerable) { this.air -= dt * 20 / (1 + enchantLevel(this.inventory.armor[0], 'respiration')); if (this.air <= 0) { this.air = 0; this._drownT = (this._drownT || 0) + dt; if (this._drownT > 1) { this._drownT = 0; this.hurt(2, null, { drown: true }); } } } else this.air = Math.min(300, this.air + dt * 80);
    if (this.y < -10) { this._voidT = (this._voidT || 0) + dt; if (this._voidT > 0.5) { this._voidT = 0; this.hurt(4, null, { void: true }); } }
    // hunger, regen, effects
    this.updateStats(dt);
    // portals
    if (blockAt === B.nether_portal || blockAt2 === B.nether_portal) { this.portalT += dt; if (this.portalT > (this.creative ? 0.1 : 4)) { this.portalT = -2; g.changeDimension(w.dim === 1 ? 0 : 1, null, this); } } else if (this.portalT > 0) this.portalT = Math.max(0, this.portalT - dt * 2); else this.portalT = Math.min(0, this.portalT + dt);
    if (blockAt === B.end_portal) { g.changeDimension(w.dim === 2 ? 0 : 2, null, this); }
    // look target
    this.updateLook();
  }
  hasElytra() { const c = this.inventory.armor[1]; return c && getItem(c.id)?.armor?.elytra; }
  updateStats(dt) {
    const g = this.game;
    if (this.invulnerable) { this.hunger = 20; return; }
    if (this.exhaustion > 4) { this.exhaustion -= 4; if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1); else if (g.difficulty > 0) this.hunger = Math.max(0, this.hunger - 1); }
    const heal = (n) => { if (this.health < this.maxHealth) { this.health = Math.min(this.maxHealth, this.health + n); this.exhaustion += 6 * n; } };
    if (this.hunger >= 20 && this.saturation > 0) { this.regenT += dt; if (this.regenT > 0.5) { this.regenT = 0; heal(1); } }
    else if (this.hunger >= 18) { this.regenT += dt; if (this.regenT > 4) { this.regenT = 0; heal(1); } }
    else if (this.hunger <= 0) { this.starveT += dt; if (this.starveT > 4) { this.starveT = 0; const min = g.difficulty === 1 ? 10 : g.difficulty === 2 ? 1 : 0; if (this.health > min) this.hurt(1, null, { starve: true }); } }
    if (this.effects.poison > 0) { this.effects.poison -= dt; this.poisonT += dt; if (this.poisonT > 1.25) { this.poisonT = 0; if (this.health > 1) this.hurt(1, null, { poison: true }); } }
    if (this.effects.regen > 0) { this.effects.regen -= dt; this._regenE = (this._regenE || 0) + dt; if (this._regenE > 2.5) { this._regenE = 0; if (this.health < this.maxHealth) this.health++; } }
    for (const k of ['fireRes', 'speed', 'strength']) if (this.effects[k] > 0) this.effects[k] -= dt;
    if (this.effects.absorption > 0 && this._absT !== undefined) { }
  }
  updateLook() {
    const g = this.game, w = this.world; const d = this.lookDir;
    const reach = this.reach;
    const hit = this.spectator ? null : w.raycast(this.x, this.eyeY, this.z, d[0], d[1], d[2], reach, this.holdingBucket());
    const eh = this.spectator ? null : g.entities.raycastEntities(this.x, this.eyeY, this.z, d[0], d[1], d[2], hit ? Math.min(hit.dist, reach) : reach - 1.5);
    this.lookEntity = eh ? eh.entity : null;
    this.lookHit = hit;
    if (hit && !this.lookEntity) {
      const def = BLOCKS[hit.id]; const meta = w.getMeta(hit.x, hit.y, hit.z);
      let boxes = def.render === 'cross' ? [[0.1, 0, 0.1, 0.9, def.crop ? 0.6 : 0.8, 0.9]] : def.fluid ? [[0, 0, 0, 1, 0.875, 1]] : (def.renderShape || def.shape)(meta, { get: (a, b, c) => w.getBlock(hit.x + a, hit.y + b, hit.z + c) });
      if (!boxes.length) boxes = [[0, 0, 0, 1, 1, 1]];
      let x0 = 1, y0 = 1, z0 = 1, x1 = 0, y1 = 0, z1 = 0; for (const b of boxes) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]); }
      this.selectedBox = [hit.x + x0, hit.y + y0, hit.z + z0, hit.x + x1, hit.y + y1, hit.z + z1];
    } else this.selectedBox = null;
  }
  holdingBucket() { const s = this.inventory.held; return !!(s && getItem(s.id)?.bucket === 'empty'); }

  // ---------- mining ----------
  breakTimeFor(def, meta) {
    if (def.hardness < 0) return Infinity; if (this.creative) return 0;
    const held = this.inventory.held; const tool = held ? getItem(held.id)?.tool : null;
    const toolType = tool?.type; const tier = tool?.tier ?? -1;
    const correctType = def.tool && toolType === def.tool || (def.tool === 'shears' && toolType === 'shears') || (def.web && toolType === 'sword') || (def.leaves && (toolType === 'shears' || toolType === 'hoe' || toolType === 'sword')) || (def.name.endsWith('_wool') && toolType === 'shears');
    const canHarvest = !def.needsTool || (correctType && tier >= (def.minTier || 0));
    let speed = 1;
    if (correctType) { speed = tool.speed || 1; if (def.needsTool && tier < (def.minTier || 0)) speed = 1; if (def.web && toolType === 'sword') speed = 15; if (def.leaves && (toolType === 'sword')) speed = 1.5; }
    if (def.hardness === 0) return 0.05;
    let t = def.hardness * (canHarvest ? 1.5 : 5) / speed;
    if (this.headInWater) t *= 5; if (!this.onGround && !this.flying && !this.inWater) t *= 5;
    if (this.effects.haste) t /= 1.2;
    const eff = held ? enchantLevel(held, 'efficiency') : 0; if (eff && correctType) t /= 1 + eff * 0.45;
    if (this.headInWater && enchantLevel(this.inventory.armor[0], 'aqua_affinity')) t /= 5;
    return t;
  }
  canHarvest(def) { if (!def.needsTool) return true; const held = this.inventory.held; const tool = held ? getItem(held.id)?.tool : null; if (!tool) return false; const ok = tool.type === def.tool || (def.leaves && tool.type === 'shears') || (def.web && (tool.type === 'sword' || tool.type === 'shears')); return ok && tool.tier >= (def.minTier || 0); }
  mine(dt, active) {
    const g = this.game, w = this.world;
    if (!active || !this.lookHit || this.lookEntity || !this.canBuild) { if (this.breaking) { this.breaking = null; this.breakProgress = 0; this.showBreak(0, 0, 0, -1); } return; }
    const h = this.lookHit; const def = BLOCKS[h.id];
    if (def.fluid) return;
    if (!this.breaking || this.breaking.x !== h.x || this.breaking.y !== h.y || this.breaking.z !== h.z) { this.breaking = { x: h.x, y: h.y, z: h.z }; this.breakProgress = 0; }
    if (this.creative) { if (this.breakCd <= 0) { this.breakCd = 0.22; g.breakBlock(h.x, h.y, h.z, this, false); this.swing(); } return; }
    const t = this.breakTimeFor(def, w.getMeta(h.x, h.y, h.z));
    if (t === Infinity) return;
    this.breakProgress += dt / Math.max(0.05, t);
    if (Math.random() < dt * 6) { g.particles.emit(h.px, h.py, h.pz, 'block', 1, h.id); }
    this._digSound = (this._digSound || 0) + dt; if (this._digSound > 0.25) { this._digSound = 0; g.audio.play('dig', { volume: 0.4 }); this.swing(); }
    if (this.breakProgress >= 1) {
      g.breakBlock(h.x, h.y, h.z, this, true); this.breaking = null; this.breakProgress = 0; this.showBreak(0, 0, 0, -1); this.exhaustion += 0.005; this.stats.blocksMined++;
      if (def.hardness > 0) { const held = this.inventory.held; if (held && getItem(held.id)?.tool && getItem(held.id).tool.type !== 'bow') { if (this.inventory.damageHeld(1)) g.audio.play('break'); } }
    } else this.showBreak(h.x, h.y, h.z, Math.floor(this.breakProgress * 10));
  }

  // ---------- attack ----------
  attack() {
    const g = this.game; if (!this.canBuild && this.gamemode !== 'adventure') return; if (this.attackCd > 0) return;
    const e = this.lookEntity; if (!e) return;
    const held = this.inventory.held; const item = held ? getItem(held.id) : null;
    let dmg = item?.tool?.damage ?? 1; if (this.effects.strength > 0) dmg += 3;
    const sharp = enchantLevel(held, 'sharpness'); if (sharp) dmg += 0.5 + sharp * 0.5; const smite = enchantLevel(held, 'smite'); if (smite && e.def && (e.def.burns || e.type === 'zombie' || e.type === 'husk' || e.type === 'drowned')) dmg += smite * 2.5;
    const kb = enchantLevel(held, 'knockback'); if (enchantLevel(held, 'fire_aspect')) e.fire = Math.max(e.fire || 0, 4 * enchantLevel(held, 'fire_aspect'));
    const crit = this.vy < 0 && !this.onGround && !this.inWater && !this.flying && !this.sprinting;
    if (crit) { dmg *= 1.5; g.particles.emit(e.x, e.y + e.h, e.z, 'crit', 8); }
    this.attackCd = item?.tool?.type === 'axe' ? 1 : item?.tool?.type === 'sword' ? 0.6 : 0.5;
    e.hurt(Math.round(dmg * 2) / 2, this, (this.sprinting ? 1 : 0.5) + (kb || 0) * 0.6); if (enchantLevel(held, 'looting')) e.looting = enchantLevel(held, 'looting');
    if (item?.tool?.type === 'sword' || item?.tool?.type === 'axe') { if (e.dead) { for (const o of g.entities.list) if (o instanceof Mob && o !== e && !o.dead && o.distTo(e) < 1.5 && item.tool.type === 'sword') o.hurt(1, this, 0.3); } }
    this.lastTarget = e; this.lastTargetT = g.time;
    if (item?.tool && !this.creative && item.tool.type !== 'bow') this.inventory.damageHeld(item.tool.type === 'sword' || item.tool.type === 'axe' ? 1 : 2);
    this.exhaustion += 0.1; this.swing(); g.audio.play('hit');
    if (this.sprinting) this.sprinting = false;
  }

  // ---------- item use ----------
  updateUse(dt) {
    const g = this.game, inp = this.input; const using = inp.down('use') && !this.screenOpen;
    const held = this.inventory.held; const item = held ? getItem(held.id) : null;
    if (this.eating > 0) {
      if (!using || !item?.food) { this.eating = 0; return; }
      this.eating += dt; if (Math.random() < dt * 6) g.audio.play('eat', { volume: 0.4 });
      if (this.eating > 1.6) { this.eating = 0; this.consumeFood(held, item); }
      return;
    }
    if (this.bowCharge >= 0) {
      if (!using || item?.tool?.type !== 'bow') { if (this.bowCharge > 0.2) this.shootBow(this.bowCharge); this.bowCharge = -1; return; }
      this.bowCharge = Math.min(1.2, this.bowCharge + dt); return;
    }
    if (using && item?.food && (this.hunger < 20 || item.food.milk || item.food.regen || item.food.teleport) && this.useCd <= 0) { this.eating = 0.001; return; }
    if (using && item?.tool?.type === 'bow' && (this.inventory.has(I.arrow) || this.creative) && this.useCd <= 0) { this.bowCharge = 0; return; }
  }
  consumeFood(held, item) {
    const g = this.game; const f = item.food;
    if (f.milk) { for (const k of Object.keys(this.effects)) this.effects[k] = 0; if (!this.creative) { this.inventory.consumeHeld(1); this.give(makeStack(I.bucket, 1)); } g.audio.play('drink'); return; }
    this.eat(f.hunger, f.saturation);
    if (f.poison && Math.random() < f.poison) this.effects.poison = 4 + f.poison * 4;
    if (f.regen) { this.effects.regen = f.regen; this.effects.absorption = f.absorption || 4; this.effects.fireRes = f.absorption ? 300 : 0; }
    if (f.teleport) { this.x += (Math.random() - 0.5) * 16; this.z += (Math.random() - 0.5) * 16; this.y = g.world.surfaceY(Math.floor(this.x), Math.floor(this.z)) + 1; g.audio.play('teleport'); }
    if (!this.creative) { this.inventory.consumeHeld(1); if (held.id === I.mushroom_stew || held.id === I.rabbit_stew || held.id === I.beetroot_soup) this.give(makeStack(I.bowl, 1)); if (held.id === I.honey_bottle) this.give(makeStack(I.glass_bottle, 1)); }
    g.audio.play('burp'); this.useCd = 0.3; g.ui.invalidateInventory(this);
  }
  eat(h, s) { if (this.hunger >= 20 && h > 0 && !this.creative && s <= 0) return false; this.hunger = Math.min(20, this.hunger + h); this.saturation = Math.min(this.hunger, this.saturation + s); return true; }
  shootBow(charge) {
    const g = this.game; const p = Math.min(1, charge / 1); const held = this.inventory.held; const a = g.entities.spawnArrow(this, null, 0.4 + p * 1.1, Math.round(2 + p * 6));
    a.damage = (2 + Math.round(p * 6)) * (1 + enchantLevel(held, 'power') * 0.25); if (p >= 1) a.crit = true; if (enchantLevel(held, 'flame')) a.flaming = true; a.punch = enchantLevel(held, 'punch');
    if (!this.creative) { if (!enchantLevel(held, 'infinity')) this.inventory.remove(I.arrow, 1); this.inventory.damageHeld(1); }
    g.audio.play('bow'); g.ui.invalidateInventory(this);
  }
  // Right click
  use() {
    const g = this.game, w = this.world; if (this.useCd > 0 || this.spectator) return;
    const held = this.inventory.held; const item = held ? getItem(held.id) : null;
    // entity interaction
    if (this.lookEntity) { if (this.lookEntity.interact(this, held)) { this.useCd = 0.25; this.swing(); g.ui.invalidateInventory(this); } return; }
    const hit = this.lookHit;
    if (hit) {
      const def = BLOCKS[hit.id]; const meta = w.getMeta(hit.x, hit.y, hit.z);
      if (!this.sneaking || !held) {
        if (def.interact && def.interact !== 'bed' && def.interact !== 'cake' && def.interact !== 'note') { g.openBlockUI(def.interact, hit.x, hit.y, hit.z, this); this.useCd = 0.3; return; }
        if (def.onInteract && def.onInteract(w, hit.x, hit.y, hit.z, meta, this)) { this.useCd = 0.25; this.swing(); return; }
        if (def.name === 'spawner' && item?.spawnEgg) { const te = w.getTileEntity(hit.x, hit.y, hit.z); te.mob = item.spawnEgg; this.useCd = 0.3; g.ui.showToastFor(this, 'Spawner set to ' + item.spawnEgg); return; }
      }
      if (!this.canBuild) return;
      if (!item) return;
      const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][hit.face] || [0, 1, 0];
      const ax = hit.x + n[0], ay = hit.y + n[1], az = hit.z + n[2];
      // tools with block interactions
      if (item.tool?.type === 'hoe' && (hit.id === B.grass_block || hit.id === B.dirt || hit.id === B.dirt_path) && hit.face === 2 && w.getBlock(hit.x, hit.y + 1, hit.z) === 0) { w.setBlock(hit.x, hit.y, hit.z, B.farmland, 0); this.toolUsed(); g.audio.play('step_gravel'); return; }
      if (item.tool?.type === 'hoe' && (hit.id === B.coarse_dirt || hit.id === B.rooted_dirt)) { w.setBlock(hit.x, hit.y, hit.z, B.dirt, 0); this.toolUsed(); return; }
      if (item.tool?.type === 'shovel' && hit.id === B.grass_block && hit.face === 2 && w.getBlock(hit.x, hit.y + 1, hit.z) === 0) { w.setBlock(hit.x, hit.y, hit.z, B.dirt_path, 0); this.toolUsed(); g.audio.play('step_gravel'); return; }
      if (item.tool?.type === 'shovel' && hit.id === B.campfire) { w.setBlock(hit.x, hit.y, hit.z, 0); g.entities.dropItem(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, makeStack(B.campfire, 1)); this.toolUsed(); return; }
      if (item.tool?.type === 'axe' && hit.id === B.oak_log) { w.setBlock(hit.x, hit.y, hit.z, B.stripped_oak_log, 0); this.toolUsed(); g.audio.play('step_wood'); return; }
      if (item.tool?.type === 'shears' && hit.id === B.pumpkin) { w.setBlock(hit.x, hit.y, hit.z, B.carved_pumpkin, (hit.face === 4 ? 0 : hit.face === 1 ? 1 : hit.face === 5 ? 2 : 3)); this.give(makeStack(I.pumpkin_seeds, 4)); this.toolUsed(); g.audio.play('shear'); return; }
      if (item.tool?.type === 'igniter') {
        if (hit.id === B.tnt) { igniteTNT(w, hit.x, hit.y, hit.z); this.toolUsed(); return; }
        if (hit.id === B.obsidian && g.tryLightPortal(ax, ay, az)) { this.toolUsed(); g.audio.play('fire'); return; }
        if (hit.id === B.campfire) { this.toolUsed(); return; }
        if (w.getBlock(ax, ay, az) === 0 && (def.opaque || def.flammable || hit.face === 2)) { w.setBlock(ax, ay, az, B.fire, 0); this.toolUsed(); g.audio.play('fire'); return; }
      }
      if (item.bonemeal) { if (applyBoneMeal(w, hit.x, hit.y, hit.z, Math.random)) { if (!this.creative) this.inventory.consumeHeld(1); g.particles.emit(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 'happy', 10); this.useCd = 0.25; g.ui.invalidateInventory(this); } return; }
      if (item.bucket) return this.useBucket(item, hit, ax, ay, az);
      if (item.spawnEgg) { g.entities.spawnMob(item.spawnEgg, ax + 0.5, ay, az + 0.5); if (!this.creative) this.inventory.consumeHeld(1); this.useCd = 0.2; g.ui.invalidateInventory(this); return; }
      if (item.place) { const bid = B[item.place]; const pl = placementFor(w, { id: bid }, hit, this); if (pl) { for (const p of pl) w.setBlock(p.x, p.y, p.z, p.id, p.meta); if (!this.creative) this.inventory.consumeHeld(1); this.useCd = 0.2; g.audio.play('step_grass'); this.swing(); g.ui.invalidateInventory(this); } return; }
      if (item.id === I.ender_eye && hit.id === B.end_portal_frame && !(meta & 4)) { w.setMeta(hit.x, hit.y, hit.z, meta | 4); if (!this.creative) this.inventory.consumeHeld(1); g.tryActivateEndPortal(hit.x, hit.y, hit.z); this.useCd = 0.3; return; }
      if (isBlockItem(held.id)) return this.placeBlock(held, hit);
    }
    // no block hit: throwables, bucket into water at range, ender pearl etc.
    if (!item) return;
    if (item.throwable || item.id === I.egg || item.id === I.ender_pearl) { g.entities.throwItem(this, item.id === I.egg ? 'egg' : item.id === I.ender_pearl ? 'ender_pearl' : 'snowball'); if (!this.creative) this.inventory.consumeHeld(1); this.useCd = 0.25; g.audio.play('bow', { volume: 0.4 }); this.swing(); g.ui.invalidateInventory(this); return; }
    if (item.tool?.type === 'fishing_rod') return this.fish();
    if (item.id === I.firework_rocket && this.gliding) { const d = this.lookDir; this.vx += d[0] * 15; this.vy += d[1] * 15; this.vz += d[2] * 15; if (!this.creative) this.inventory.consumeHeld(1); this.useCd = 0.3; g.particles.emit(this.x, this.y, this.z, 'flame', 10); return; }
    if (item.id === I.ender_eye) { const d = this.lookDir; g.particles.emit(this.x + d[0] * 2, this.eyeY, this.z + d[2] * 2, 'portal', 20); g.ui.showToastFor(this, w.dim === 0 ? 'The eye points toward the End portal... use it on an End Portal Frame' : 'Nothing happens'); this.useCd = 0.5; return; }
    if (item.bucket && item.bucket !== 'empty') { const d = this.lookDir; const hit2 = w.raycast(this.x, this.eyeY, this.z, d[0], d[1], d[2], this.reach, true); if (hit2) { const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][hit2.face] || [0, 1, 0]; return this.useBucket(item, hit2, hit2.x + n[0], hit2.y + n[1], hit2.z + n[2]); } }
  }
  toolUsed() { const g = this.game; if (!this.creative) this.inventory.damageHeld(1); this.useCd = 0.25; this.swing(); g.ui.invalidateInventory(this); }
  useBucket(item, hit, ax, ay, az) {
    const g = this.game, w = this.world;
    if (item.bucket === 'empty') {
      const id = w.getBlock(hit.x, hit.y, hit.z);
      if ((id === B.water || id === B.lava) && (w.getMeta(hit.x, hit.y, hit.z) & 7) === 0) { w.setBlock(hit.x, hit.y, hit.z, 0, 0); if (!this.creative) { this.inventory.consumeHeld(1); this.give(makeStack(id === B.water ? I.water_bucket : I.lava_bucket, 1)); } g.audio.play('bucket'); this.useCd = 0.3; g.ui.invalidateInventory(this); return; }
      return;
    }
    const target = BLOCKS[w.getBlock(hit.x, hit.y, hit.z)].replaceable ? [hit.x, hit.y, hit.z] : [ax, ay, az];
    const cur = w.getBlock(...target); if (cur !== 0 && !BLOCKS[cur].replaceable) return;
    if (item.bucket === 'water' && w.dim === 1) { g.particles.emit(target[0] + 0.5, target[1] + 0.5, target[2] + 0.5, 'smoke', 10); g.audio.play('fire'); if (!this.creative) { this.inventory.consumeHeld(1); this.give(makeStack(I.bucket, 1)); } this.useCd = 0.3; return; }
    w.setBlock(target[0], target[1], target[2], item.bucket === 'water' ? B.water : B.lava, 0);
    if (!this.creative) { this.inventory.consumeHeld(1); this.give(makeStack(I.bucket, 1)); }
    g.audio.play('bucket'); this.useCd = 0.3; g.ui.invalidateInventory(this);
  }
  fish() {
    const g = this.game; if (this.fishing) { const waited = g.time - this.fishing.t; this.fishing = null; this.useCd = 0.3; if (waited > 100 + this.fishing_wait) { const r = Math.random(); const item = r < 0.6 ? I.cod : r < 0.85 ? I.salmon : r < 0.9 ? I.pufferfish : r < 0.95 ? I.tropical_fish : r < 0.98 ? I.string : I.enchanted_book; this.give(makeStack(item, 1)); g.entities.spawnXP(this.x, this.y, this.z, 1 + Math.floor(Math.random() * 6)); g.audio.play('splash'); if (!this.creative) this.inventory.damageHeld(1); g.ui.showToastFor(this, 'You caught something!'); } else g.ui.showToastFor(this, 'Nothing on the line...'); return; }
    const d = this.lookDir; const hit = this.world.raycast(this.x, this.eyeY, this.z, d[0], d[1], d[2], 12, true);
    if (hit && hit.id === B.water) { this.fishing = { t: g.time, x: hit.x, y: hit.y, z: hit.z }; this.fishing_wait = 100 + Math.random() * 400; this.useCd = 0.3; g.audio.play('splash', { volume: 0.4 }); g.ui.showToastFor(this, 'Fishing... right-click again when it bites'); setTimeout(() => { if (this.fishing) g.particles.emit(this.fishing.x + 0.5, this.fishing.y + 0.9, this.fishing.z + 0.5, 'water', 10); }, (100 + this.fishing_wait) * 50); }
  }
  placeBlock(held, hit) {
    const g = this.game, w = this.world;
    const pl = placementFor(w, held, hit, this); if (!pl) return;
    for (const p of pl) { const d = BLOCKS[p.id]; if (d.solid) { const boxes = d.shape(p.meta, null); for (const b of boxes) { if (this.x + this.w / 2 > p.x + b[0] && this.x - this.w / 2 < p.x + b[3] && this.y + this.h > p.y + b[1] && this.y < p.y + b[4] && this.z + this.w / 2 > p.z + b[2] && this.z - this.w / 2 < p.z + b[5]) return; } for (const e of g.entities.list) if (e instanceof Mob && !e.dead && e.x + e.w / 2 > p.x && e.x - e.w / 2 < p.x + 1 && e.y + e.h > p.y && e.y < p.y + 1 && e.z + e.w / 2 > p.z && e.z - e.w / 2 < p.z + 1) return; } }
    for (const p of pl) w.setBlock(p.x, p.y, p.z, p.id, p.meta);
    const d = BLOCKS[pl[0].id];
    if (d.container || d.name === 'spawner') { const te = w.getTileEntity(pl[0].x, pl[0].y, pl[0].z); if (held.te) Object.assign(te, held.te); }
    if (!this.creative) this.inventory.consumeHeld(1);
    this.stats.blocksPlaced++; this.useCd = 0.2; g.audio.play('place'); this.swing(); g.ui.invalidateInventory(this);
  }

  // ---------- damage / death ----------
  hurt(amount, source, opts = {}) {
    const g = this.game;
    if (this.dead || this.invulnerable && !opts.void) return false;
    if (this.hurtTimer > 0 && !opts.void) return false;
    if (this.effects.fireRes > 0 && opts.fire) return false;
    if (source && !opts.fall && !opts.fire && !opts.poison && !opts.starve && !opts.drown) { const armor = this.inventory.armorValue(); amount *= 1 - Math.min(20, armor) / 25; this.inventory.damageArmor(1); if (g.difficulty === 1) amount *= 0.75; else if (g.difficulty === 3) amount *= 1.5;
      let prot = 0; for (const a of this.inventory.armor) { prot += enchantLevel(a, 'protection'); if (opts.explosion) prot += enchantLevel(a, 'blast_protection') * 2; if (source && source.kind) prot += enchantLevel(a, 'projectile_protection') * 2; } amount *= Math.max(0.2, 1 - Math.min(20, prot) * 0.04);
      const thorns = this.inventory.armor.reduce((n, a) => n + enchantLevel(a, 'thorns'), 0); if (thorns && source && source.hurt && Math.random() < thorns * 0.15) source.hurt(1 + Math.floor(Math.random() * 3), null); }
    if (opts.fall) { const ff = enchantLevel(this.inventory.armor[3], 'feather_falling'); amount *= Math.max(0, 1 - ff * 0.12); const pr = this.inventory.armor.reduce((n, a) => n + enchantLevel(a, 'protection'), 0); amount *= Math.max(0.2, 1 - pr * 0.04); amount = Math.round(amount); if (amount <= 0) return false; }
    if (opts.fire) { let fp = 0; for (const a of this.inventory.armor) fp += enchantLevel(a, 'fire_protection') * 2 + enchantLevel(a, 'protection'); amount *= Math.max(0.2, 1 - fp * 0.04); if (amount < 0.5) return false; }
    if (this.blocking && source) amount *= 0.3;
    amount = Math.max(0, amount);
    if (this.effects.absorption > 0) { const a = Math.min(this.effects.absorption, amount); this.effects.absorption -= a; amount -= a; }
    this.health -= amount; this.hurtTimer = 0.5;
    if (source && source.x !== undefined) { const dx = this.x - source.x, dz = this.z - source.z, d = Math.hypot(dx, dz) || 1; this.vx += dx / d * 5; this.vz += dz / d * 5; this.vy += 3; this.lastAttacker = source; this.lastAttackerT = g.time; }
    g.audio.play('hurt'); g.ui.damageFlash(this);
    if (this.health <= 0) {
      const totem = (this.inventory.held && this.inventory.held.id === I.totem_of_undying) ? this.inventory.held : (this.inventory.offhand[0] && this.inventory.offhand[0].id === I.totem_of_undying ? this.inventory.offhand[0] : null);
      if (totem) { totem.count--; if (totem.count <= 0) { if (this.inventory.held === totem) this.inventory.setHeld(null); else this.inventory.offhand[0] = null; } this.health = 1; this.effects.regen = 40; this.effects.absorption = 8; this.effects.fireRes = 40; g.audio.play('totem'); g.ui.showTitle('', 'The Totem of Undying saved you', 4, this); g.ui.invalidateInventory(this); return true; }
      this.die(source, opts);
    }
    return true;
  }
  die(source, opts = {}) {
    const g = this.game; this.dead = true; this.health = 0; this.stats.deaths++;
    this.eating = 0; this.bowCharge = -1; this.breaking = null; this.showBreak(0, 0, 0, -1);
    let cause = 'died';
    if (opts.fall) cause = 'fell from a high place'; else if (opts.fire) cause = 'burned to death'; else if (opts.drown) cause = 'drowned'; else if (opts.starve) cause = 'starved to death'; else if (opts.void) cause = 'fell out of the world'; else if (opts.poison) cause = 'was poisoned'; else if (opts.explosion) cause = 'blew up'; else if (source && source.type) cause = 'was slain by ' + (source.def ? source.def.displayName || source.type.replace(/_/g, ' ') : source.type);
    if (!this.creative) { for (let i = 0; i < 36; i++) { const s = this.inventory.slots[i]; if (s) g.entities.dropItem(this.x, this.y + 0.5, this.z, s, true); this.inventory.slots[i] = null; } for (let i = 0; i < 4; i++) { const s = this.inventory.armor[i]; if (s) g.entities.dropItem(this.x, this.y + 0.5, this.z, s, true); this.inventory.armor[i] = null; } if (this.inventory.offhand[0]) { g.entities.dropItem(this.x, this.y + 0.5, this.z, this.inventory.offhand[0], true); this.inventory.offhand[0] = null; } g.entities.spawnXP(this.x, this.y + 0.5, this.z, Math.min(100, this.level * 7)); }
    g.audio.play('death'); g.onPlayerDeath(cause, this);
  }
  respawn() {
    const g = this.game; this.dead = false; this.health = this.maxHealth; this.hunger = 20; this.saturation = 5; this.exhaustion = 0; this.air = 300; this.fire = 0; this.xp = 0; this.level = 0; this.xpProgress = 0; for (const k of Object.keys(this.effects)) this.effects[k] = 0;
    this.vx = this.vy = this.vz = 0; this.fallStart = null; this.gliding = false; this.effects.absorption = 0;
    const sp = this.bedSpawn || this.spawn || { x: 0.5, y: 80, z: 0.5, dim: 0 };
    if (sp.dim !== undefined && sp.dim !== g.world.dim) { g.changeDimension(sp.dim, sp); return; }
    this.x = sp.x; this.z = sp.z; this.y = sp.y;
    g.settleSpawn(this);
  }
  // ---------- XP ----------
  xpForLevel(l) { return l < 16 ? 2 * l + 7 : l < 31 ? 5 * l - 38 : 9 * l - 158; }
  addXP(n) { n = this.inventory.mend(n); if (n <= 0) return; this.xp += n; this.score += n; let need = this.xpForLevel(this.level); this.xpProgress += n; while (this.xpProgress >= need) { this.xpProgress -= need; this.level++; need = this.xpForLevel(this.level); this.game.audio.play('levelup'); } }
  setLevel(l) { this.level = l; this.xpProgress = 0; }

  serialize() { return { index: this.index, x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, health: this.health, hunger: this.hunger, saturation: this.saturation, xp: this.xp, level: this.level, xpProgress: this.xpProgress, gamemode: this.gamemode, flying: this.flying, inventory: this.inventory.serialize(), spawn: this.spawn, bedSpawn: this.bedSpawn, effects: this.effects, stats: this.stats, score: this.score, air: this.air }; }
  deserialize(d) { if (!d) return; Object.assign(this, { x: d.x, y: d.y, z: d.z, yaw: d.yaw || 0, pitch: d.pitch || 0, health: d.health ?? 20, hunger: d.hunger ?? 20, saturation: d.saturation ?? 5, xp: d.xp || 0, level: d.level || 0, xpProgress: d.xpProgress || 0, flying: !!d.flying, spawn: d.spawn || null, bedSpawn: d.bedSpawn || null, score: d.score || 0, air: d.air ?? 300 }); if (d.effects) Object.assign(this.effects, d.effects); if (d.stats) Object.assign(this.stats, d.stats); this.inventory.deserialize(d.inventory); this.setGamemode(d.gamemode || 'survival'); }
}
