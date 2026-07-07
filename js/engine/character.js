// ============================================================
// BLOXVERSE engine — R15 blocky character rig
// Procedurally built 15-part avatar with joint animation,
// faces, hats, name tags, chat bubbles, ragdoll & break-apart.
// ============================================================
import * as THREE from 'three';

export const CHAR_HEIGHT = 5.2;

// ---------- geometry helpers ----------
const geoCache = new Map();
function box(w, h, d, r = 0.06) {
  const key = `${w}|${h}|${d}|${r}`;
  if (!geoCache.has(key)) geoCache.set(key, roundedBox(w, h, d, r, 2));
  return geoCache.get(key);
}
// Minimal rounded box: a BoxGeometry with vertices pushed toward rounded corners.
function roundedBox(w, h, d, radius, seg) {
  const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = geo.attributes.position;
  const half = new THREE.Vector3(w / 2 - radius, h / 2 - radius, d / 2 - radius);
  const v = new THREE.Vector3(), clamped = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    clamped.set(
      Math.max(-half.x, Math.min(half.x, v.x)),
      Math.max(-half.y, Math.min(half.y, v.y)),
      Math.max(-half.z, Math.min(half.z, v.z)),
    );
    v.sub(clamped).setLength(radius).add(clamped);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------- face textures ----------
const faceCache = new Map();
export function makeFaceTexture(face, skinHex) {
  const key = face + skinHex;
  if (faceCache.has(key)) return faceCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = skinHex;
  c.fillRect(0, 0, 128, 128);
  c.fillStyle = '#1a1a1a';
  c.strokeStyle = '#1a1a1a';
  c.lineCap = 'round';
  const eye = (x, y, rx = 6, ry = 11) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); };
  switch (face) {
    case 'angry':
      eye(46, 58, 7, 9); eye(82, 58, 7, 9);
      c.lineWidth = 7;
      c.beginPath(); c.moveTo(32, 40); c.lineTo(56, 50); c.stroke();
      c.beginPath(); c.moveTo(96, 40); c.lineTo(72, 50); c.stroke();
      c.lineWidth = 6;
      c.beginPath(); c.arc(64, 102, 16, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke();
      break;
    case 'sad':
      eye(46, 54); eye(82, 54);
      c.lineWidth = 6;
      c.beginPath(); c.arc(64, 104, 15, 1.2 * Math.PI, 1.8 * Math.PI); c.stroke();
      break;
    case 'chill': // shades
      c.lineWidth = 5;
      c.fillRect(30, 46, 26, 16); c.fillRect(72, 46, 26, 16);
      c.beginPath(); c.moveTo(56, 52); c.lineTo(72, 52); c.moveTo(30, 50); c.lineTo(20, 46); c.moveTo(98, 50); c.lineTo(108, 46); c.stroke();
      c.lineWidth = 6;
      c.beginPath(); c.arc(64, 84, 15, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
      break;
    case 'silly':
      eye(46, 54); eye(82, 54);
      c.lineWidth = 6;
      c.beginPath(); c.arc(64, 78, 18, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
      c.fillStyle = '#e2504c';
      c.beginPath(); c.roundRect(58, 92, 14, 18, 6); c.fill();
      break;
    case 'happy':
      eye(46, 54); eye(82, 54);
      c.lineWidth = 6; c.fillStyle = '#1a1a1a';
      c.beginPath(); c.arc(64, 76, 20, 0.08 * Math.PI, 0.92 * Math.PI); c.closePath(); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 74, 14, 0.15 * Math.PI, 0.85 * Math.PI); c.closePath(); c.fill();
      break;
    case 'zombie':
      c.lineWidth = 6;
      c.beginPath(); c.moveTo(38, 46); c.lineTo(54, 62); c.moveTo(54, 46); c.lineTo(38, 62); c.stroke();
      eye(82, 54, 8, 8);
      c.beginPath(); c.moveTo(44, 96); c.lineTo(88, 92); c.stroke();
      c.lineWidth = 3;
      for (let x = 50; x <= 82; x += 8) { c.beginPath(); c.moveTo(x, 88); c.lineTo(x, 100); c.stroke(); }
      break;
    default: // 'smile' — the classic
      eye(46, 54); eye(82, 54);
      c.lineWidth = 6;
      c.beginPath(); c.arc(64, 76, 18, 0.12 * Math.PI, 0.88 * Math.PI); c.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(key, tex);
  return tex;
}

// ---------- name/bubble sprites ----------
function makeTextSprite(draw, w, h, scale) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), cv);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(scale * (w / h), scale, 1);
  sp.renderOrder = 20;
  return sp;
}

// ---------- hats ----------
function buildHat(kind) {
  const g = new THREE.Group();
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  if (kind === 'cap') {
    const m = lam('#c22f2f');
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
    dome.scale.y = 0.72;
    const brim = new THREE.Mesh(box(0.8, 0.09, 0.55, 0.03), m);
    brim.position.set(0, 0.02, -0.62);
    g.add(dome, brim);
  } else if (kind === 'tophat') {
    const m = lam('#1d1d21');
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.85, 14), m);
    tube.position.y = 0.48;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.08, 14), m);
    brim.position.y = 0.06;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 14), lam('#b03030'));
    band.position.y = 0.2;
    g.add(tube, brim, band);
  } else if (kind === 'halo') {
    const m = new THREE.MeshBasicMaterial({ color: '#ffd94a' });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 22), m);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.55;
    g.add(ring);
    g.userData.float = true;
  } else if (kind === 'headphones') {
    const m = lam('#2c2c31');
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 8, 18, Math.PI), m);
    arc.position.y = 0.1;
    const capL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10), lam('#e2504c'));
    capL.rotation.z = Math.PI / 2;
    capL.position.set(-0.62, 0.02, 0);
    const capR = capL.clone(); capR.position.x = 0.62;
    g.add(arc, capL, capR);
    g.userData.lower = 0.35;
  } else if (kind === 'crown') {
    const m = lam('#ffb400');
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.28, 10), m);
    base.position.y = 0.12;
    g.add(base);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), m);
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.45, 0.38, Math.sin(a) * 0.45);
      g.add(spike);
    }
  }
  return g;
}

export const HATS = ['none', 'cap', 'headphones', 'tophat', 'halo', 'crown'];
export const HAT_PRICES = { none: 0, cap: 100, headphones: 250, tophat: 500, halo: 1000, crown: 2500 };
export const FACES = ['smile', 'happy', 'chill', 'silly', 'angry', 'sad'];

const NAME_COLORS = ['#fd2943', '#01a2ff', '#02b857', '#a75cff', '#ff8c1a', '#f5cd30', '#ff69b4', '#75d1e8'];
export function nameColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(h, 33) + name.charCodeAt(i)) | 0;
  return NAME_COLORS[Math.abs(h) % NAME_COLORS.length];
}

// module-level debris (break-apart pieces)
const debris = [];
export function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const p = debris[i];
    p.life -= dt;
    p.vel.y -= 120 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += p.spin.x * dt;
    p.mesh.rotation.y += p.spin.y * dt;
    if (p.mesh.position.y < p.floor) { p.mesh.position.y = p.floor; p.vel.y *= -0.35; p.vel.x *= 0.7; p.vel.z *= 0.7; }
    if (p.life < 0.6) p.mesh.material.opacity = Math.max(0, p.life / 0.6);
    if (p.life <= 0) { p.mesh.parent?.remove(p.mesh); debris.splice(i, 1); }
  }
}

// ============================================================
export class R15Character {
  constructor(opts = {}) {
    this.name = opts.name || 'Player';
    this.avatar = {
      skin: '#f5cd30', shirt: '#0f7abd', pants: '#2a9e35',
      hat: 'none', face: 'smile', ...(opts.avatar || {}),
    };
    this.group = new THREE.Group();       // origin at feet
    this.group.name = 'R15:' + this.name;
    this.body = new THREE.Group();        // hip root — lean/bob applied here
    this.group.add(this.body);

    this.joints = {};
    this.parts = {};
    this.animT = Math.random() * 10;
    this.state = 'idle';
    this.action = null;                    // one-shot overlay
    this.holdPose = null;                  // 'rifle' | 'pistol' | 'sword' | null
    this.aimPitch = 0;
    this.ragdolling = false;
    this.emote = null;
    this.speedFactor = 0;
    this._targets = {};
    this._bubbleTimer = 0;
    this.maxHealth = opts.maxHealth || 100;
    this.health = this.maxHealth;

    this.#build(opts);
    if (opts.nameTag !== false) this.#buildNameTag(opts.nameTagColor);
  }

  // ---------- rig construction ----------
  #build(opts) {
    const A = this.avatar;
    const matSkin = new THREE.MeshLambertMaterial({ color: A.skin });
    const matShirt = new THREE.MeshLambertMaterial({ color: A.shirt });
    const matPants = new THREE.MeshLambertMaterial({ color: A.pants });
    this.mats = { skin: matSkin, shirt: matShirt, pants: matPants };
    const mesh = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      return m;
    };
    const LEG = 2.1, LT_H = 0.45, UT_H = 1.5;
    this.hipY = LEG;
    this.body.position.y = LEG;

    // lower torso
    const lowerTorso = mesh(box(1.9, LT_H, 1.0), matPants);
    lowerTorso.position.y = LT_H / 2;
    this.body.add(lowerTorso);
    this.parts.lowerTorso = lowerTorso;

    // waist joint -> upper torso
    const waist = new THREE.Group();
    waist.position.y = LT_H;
    this.body.add(waist);
    const upperTorso = mesh(box(1.9, UT_H, 1.0), matShirt);
    upperTorso.position.y = UT_H / 2;
    waist.add(upperTorso);
    this.parts.upperTorso = upperTorso;
    this.joints.waist = waist;

    // neck -> head (with face on front)
    const neck = new THREE.Group();
    neck.position.y = UT_H + 0.02;
    waist.add(neck);
    const faceTex = makeFaceTexture(A.face, A.skin);
    const headMats = [matSkin, matSkin, matSkin, matSkin,
      new THREE.MeshLambertMaterial({ map: faceTex }), matSkin];
    const head = mesh(box(1.15, 1.15, 1.15, 0.22), headMats);
    head.position.y = 0.62;
    neck.add(head);
    this.parts.head = head;
    this.joints.neck = neck;

    // hat
    if (A.hat && A.hat !== 'none') {
      const hat = buildHat(A.hat);
      hat.position.y = 1.16 - (hat.userData.lower || 0);
      if (hat.userData.float) hat.position.y = 1.35;
      neck.add(hat);
      this.hat = hat;
    }

    // arms
    const armX = 1.25;
    const shoulderY = UT_H - 0.25;
    const mkArm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(armX * side, shoulderY, 0);
      waist.add(sh);
      const upper = mesh(box(0.6, 0.95, 0.7), matShirt);
      upper.position.y = -0.45;
      sh.add(upper);
      const el = new THREE.Group();
      el.position.y = -0.93;
      sh.add(el);
      const lower = mesh(box(0.58, 0.8, 0.66), matSkin);
      lower.position.y = -0.4;
      el.add(lower);
      const wrist = new THREE.Group();
      wrist.position.y = -0.8;
      el.add(wrist);
      const hand = mesh(box(0.56, 0.32, 0.64), matSkin);
      hand.position.y = -0.16;
      wrist.add(hand);
      return { sh, el, wrist, upper, lower, hand };
    };
    const la = mkArm(-1), ra = mkArm(1);
    this.joints.lShoulder = la.sh; this.joints.lElbow = la.el;
    this.joints.rShoulder = ra.sh; this.joints.rElbow = ra.el;
    this.joints.rWrist = ra.wrist; this.joints.lWrist = la.wrist;
    this.parts.lUpperArm = la.upper; this.parts.lLowerArm = la.lower; this.parts.lHand = la.hand;
    this.parts.rUpperArm = ra.upper; this.parts.rLowerArm = ra.lower; this.parts.rHand = ra.hand;

    // legs
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0.5 * side, 0.05, 0);
      this.body.add(hip);
      const upper = mesh(box(0.85, 0.95, 0.9), matPants);
      upper.position.y = -0.48;
      hip.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -0.98;
      hip.add(knee);
      const lower = mesh(box(0.8, 0.82, 0.85), matPants);
      lower.position.y = -0.4;
      knee.add(lower);
      const ankle = new THREE.Group();
      ankle.position.y = -0.82;
      knee.add(ankle);
      const foot = mesh(box(0.8, 0.3, 1.0), new THREE.MeshLambertMaterial({
        color: new THREE.Color(A.pants).multiplyScalar(0.7),
      }));
      foot.position.set(0, -0.15, -0.06);
      ankle.add(foot);
      return { hip, knee, ankle, upper, lower, foot };
    };
    const ll = mkLeg(-1), rl = mkLeg(1);
    this.joints.lHip = ll.hip; this.joints.lKnee = ll.knee; this.joints.lAnkle = ll.ankle;
    this.joints.rHip = rl.hip; this.joints.rKnee = rl.knee; this.joints.rAnkle = rl.ankle;
    this.parts.lUpperLeg = ll.upper; this.parts.lLowerLeg = ll.lower; this.parts.lFoot = ll.foot;
    this.parts.rUpperLeg = rl.upper; this.parts.rLowerLeg = rl.lower; this.parts.rFoot = rl.foot;
  }

  #buildNameTag(color) {
    this.nameTagColor = color || '#ffffff';
    this.nameSprite = makeTextSprite((c, cv) => this.#drawNameTag(c, cv), 512, 128, 1.05);
    this.nameSprite.position.y = 6.35;
    this.group.add(this.nameSprite);
  }
  #drawNameTag(c, cv) {
    c.clearRect(0, 0, cv.width, cv.height);
    c.font = '700 52px system-ui, Arial';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.35)';
    const tw = Math.min(500, c.measureText(this.name).width + 36);
    c.beginPath(); c.roundRect(256 - tw / 2, 6, tw, 66, 12); c.fill();
    c.fillStyle = this.nameTagColor;
    c.fillText(this.name, 256, 55, 470);
    // health bar
    const frac = Math.max(0, this.health / this.maxHealth);
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.roundRect(156, 84, 200, 22, 8); c.fill();
    c.fillStyle = frac > 0.5 ? '#3fc679' : frac > 0.25 ? '#ffb400' : '#f74d59';
    if (frac > 0) { c.beginPath(); c.roundRect(159, 87, 194 * frac, 16, 6); c.fill(); }
  }
  refreshNameTag() {
    if (!this.nameSprite) return;
    const cv = this.nameSprite.material.map.image;
    this.#drawNameTag(cv.getContext('2d'), cv);
    this.nameSprite.material.map.needsUpdate = true;
  }
  setHealth(h) {
    this.health = Math.max(0, Math.min(this.maxHealth, h));
    this.refreshNameTag();
  }

  // ---------- chat bubble ----------
  say(text, duration = 5) {
    if (this.bubble) { this.group.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); }
    const lines = wrapText(text, 24).slice(0, 3);
    const W = 512, LH = 46, H = 40 + lines.length * LH + 26;
    this.bubble = makeTextSprite((c) => {
      c.fillStyle = 'rgba(255,255,255,0.96)';
      c.beginPath(); c.roundRect(8, 8, W - 16, H - 34, 20); c.fill();
      c.beginPath(); c.moveTo(W / 2 - 14, H - 27); c.lineTo(W / 2 + 14, H - 27); c.lineTo(W / 2, H - 6); c.closePath(); c.fill();
      c.fillStyle = '#1c1e20';
      c.font = '600 34px system-ui, Arial';
      c.textAlign = 'center';
      lines.forEach((ln, i) => c.fillText(ln, W / 2, 56 + i * LH, W - 60));
    }, W, H, 0.85 + lines.length * 0.5);
    this.bubble.position.y = 7.1 + (lines.length - 1) * 0.25;
    this.group.add(this.bubble);
    this._bubbleTimer = duration;
  }

  // ---------- tools ----------
  holdItem(mesh, pose = 'rifle') {
    this.clearItem();
    this.item = mesh;
    this.holdPose = pose;
    this.joints.rWrist.add(mesh);
  }
  clearItem() {
    if (this.item) { this.joints.rWrist.remove(this.item); this.item = null; }
    this.holdPose = null;
  }

  // ---------- ragdoll & death ----------
  setRagdoll(on, impulse) {
    this.ragdolling = on;
    if (on) {
      this.ragVel = impulse ? impulse.clone() : new THREE.Vector3();
      this.ragSpin = (Math.random() - 0.5) * 9;
      this.ragPhase = Math.random() * 10;
      this.ragT = 0;
    } else {
      this.body.rotation.set(0, 0, 0);
      this.body.position.set(0, this.hipY, 0);
    }
  }

  breakApart(scene, floorY = 0) {
    const partList = Object.values(this.parts);
    for (const src of partList) {
      const world = new THREE.Vector3();
      src.getWorldPosition(world);
      const m = new THREE.Mesh(src.geometry, Array.isArray(src.material)
        ? src.material.map((mm) => mm.clone())
        : src.material.clone());
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mm) => { mm.transparent = true; });
      m.position.copy(world);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      m.castShadow = true;
      scene.add(m);
      debris.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 16, 10 + Math.random() * 14, (Math.random() - 0.5) * 16),
        spin: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 0),
        life: 1.6 + Math.random() * 0.5,
        floor: floorY + 0.3,
      });
    }
    this.group.visible = false;
  }
  respawnVisual() {
    this.group.visible = true;
    this.setRagdoll(false);
    this.health = this.maxHealth;
    this.refreshNameTag();
  }

  // ---------- animation ----------
  playAction(name, dur = 0.4) {
    this.action = { name, t: 0, dur };
  }
  setEmote(name) { this.emote = name; }

  update(dt, info = {}) {
    this.animT += dt;
    const t = this.animT;
    if (this._bubbleTimer > 0) {
      this._bubbleTimer -= dt;
      if (this._bubbleTimer <= 0 && this.bubble) {
        this.group.remove(this.bubble);
        this.bubble.material.map.dispose(); this.bubble.material.dispose();
        this.bubble = null;
      }
    }
    if (this.hat?.userData.float) this.hat.position.y = 1.35 + Math.sin(t * 2) * 0.08;

    if (this.ragdolling) { this.#updateRagdoll(dt); return; }

    const speed = info.speed ?? 0;
    const grounded = info.grounded ?? true;
    const velY = info.velY ?? 0;
    this.speedFactor += ((speed > 0.5 ? 1 : 0) - this.speedFactor) * Math.min(1, dt * 10);

    const T = this._targets;
    for (const k in this.joints) { T[k] = T[k] || [0, 0, 0]; T[k][0] = T[k][1] = T[k][2] = 0; }
    let bodyY = this.hipY, bodyLean = 0;

    if (!grounded) {
      if (velY > 2) { // jump
        T.lShoulder[2] = -0.5; T.rShoulder[2] = 0.5;
        T.lShoulder[0] = T.rShoulder[0] = -0.4;
        T.lHip[0] = -0.5; T.rHip[0] = 0.25;
        T.lKnee[0] = 0.7; T.rKnee[0] = 0.4;
      } else { // fall
        const f = Math.min(1, -velY / 40);
        T.lShoulder[0] = T.rShoulder[0] = -2.6 * (0.4 + f * 0.6);
        T.lShoulder[2] = -0.25; T.rShoulder[2] = 0.25;
        T.lHip[0] = -0.3; T.rHip[0] = -0.15;
        T.lKnee[0] = 0.45; T.rKnee[0] = 0.3;
      }
    } else if (info.sitting) {
      T.lHip[0] = T.rHip[0] = -1.5;
      T.lKnee[0] = T.rKnee[0] = 1.5;
      bodyY -= 1.15;
    } else if (this.emote && speed < 0.5) {
      this.#emoteAnim(t, T);
    } else if (speed > 0.5) {
      const run = speed > 19;
      const freq = (run ? 11 : 8.5) * Math.min(1.4, speed / 16);
      const amp = run ? 1.0 : 0.8;
      const s = Math.sin(t * freq);
      const zombie = this.holdPose === 'zombie';
      T.lHip[0] = s * amp; T.rHip[0] = -s * amp;
      T.lKnee[0] = Math.max(0, -s) * amp * 0.9 + 0.12;
      T.rKnee[0] = Math.max(0, s) * amp * 0.9 + 0.12;
      T.lAnkle[0] = s * 0.25; T.rAnkle[0] = -s * 0.25;
      if (!zombie) {
        T.lShoulder[0] = -s * amp * 0.85; T.rShoulder[0] = s * amp * 0.85;
        T.lElbow[0] = -0.15; T.rElbow[0] = -0.15;
      }
      T.waist[1] = s * 0.06;
      bodyLean = run ? 0.16 : 0.05;
      bodyY += Math.abs(Math.cos(t * freq)) * (run ? 0.14 : 0.08);
    } else {
      // idle — subtle breathing + arm sway
      const b = Math.sin(t * 1.7);
      T.lShoulder[2] = -0.045 - b * 0.02; T.rShoulder[2] = 0.045 + b * 0.02;
      T.lElbow[0] = T.rElbow[0] = -0.06;
      T.neck[1] = Math.sin(t * 0.55) * 0.12;
      bodyY += b * 0.03;
    }

    // hold poses (override arms)
    this.#applyHoldPose(T, t, speed);
    // one-shot actions (override)
    if (this.action) this.#applyAction(T, dt);

    // apply with smoothing
    const k = Math.min(1, dt * 14);
    for (const jn in this.joints) {
      const j = this.joints[jn], tg = T[jn];
      j.rotation.x += (tg[0] - j.rotation.x) * k;
      j.rotation.y += (tg[1] - j.rotation.y) * k;
      j.rotation.z += (tg[2] - j.rotation.z) * k;
    }
    this.body.position.y += (bodyY - this.body.position.y) * k;
    this.body.rotation.x += (bodyLean - this.body.rotation.x) * k;
    this.body.rotation.z *= 1 - k;
  }

  #applyHoldPose(T, t, speed) {
    const p = this.holdPose;
    if (!p) return;
    if (p === 'rifle') {
      T.rShoulder[0] = -1.45 - this.aimPitch; T.rShoulder[1] = -0.32;
      T.rElbow[0] = -0.25;
      T.lShoulder[0] = -1.2 - this.aimPitch; T.lShoulder[1] = 0.65;
      T.lElbow[0] = -0.55;
    } else if (p === 'pistol') {
      T.rShoulder[0] = -1.5 - this.aimPitch;
      T.rElbow[0] = -0.1;
    } else if (p === 'sword') {
      T.rShoulder[0] = -0.3; T.rShoulder[2] = 0.5;
      T.rElbow[0] = -0.5;
    } else if (p === 'zombie') {
      T.lShoulder[0] = T.rShoulder[0] = -1.5 + Math.sin(t * 2.1) * 0.1;
      T.lElbow[0] = -0.12; T.rElbow[0] = -0.18;
    } else if (p === 'carry') {
      T.lShoulder[0] = T.rShoulder[0] = -0.9;
      T.lElbow[0] = T.rElbow[0] = -0.9;
    }
  }

  #applyAction(T, dt) {
    const a = this.action;
    a.t += dt;
    const p = Math.min(1, a.t / a.dur);
    const punch = (side, prog) => {
      const ext = Math.sin(prog * Math.PI);
      T[side + 'Shoulder'][0] = -1.6 * ext;
      T[side + 'Shoulder'][1] = side === 'r' ? -0.2 * ext : 0.2 * ext;
      T[side + 'Elbow'][0] = -0.9 * (1 - ext);
      T.waist[1] = (side === 'r' ? -0.45 : 0.45) * ext;
    };
    switch (a.name) {
      case 'punchR': punch('r', p); break;
      case 'punchL': punch('l', p); break;
      case 'kick': {
        const ext = Math.sin(p * Math.PI);
        T.rHip[0] = -1.7 * ext; T.rKnee[0] = 0.4 * (1 - ext);
        T.waist[0] = -0.25 * ext;
        T.lShoulder[0] = -0.5 * ext; T.rShoulder[0] = 0.5 * ext;
        break;
      }
      case 'slam': {
        const up = Math.min(1, p * 2.2), down = Math.max(0, (p - 0.45) * 2.4);
        T.lShoulder[0] = T.rShoulder[0] = -3.1 * up + 3.4 * down;
        T.waist[0] = -0.2 * up + 0.5 * down;
        break;
      }
      case 'cast': {
        const ext = Math.sin(Math.min(1, p * 1.4) * Math.PI / 2);
        T.rShoulder[0] = -1.65 * ext; T.rShoulder[1] = -0.15;
        T.lShoulder[0] = -0.7 * ext; T.lShoulder[2] = -0.3 * ext;
        T.waist[1] = -0.35 * ext;
        break;
      }
      case 'slash': {
        const ext = Math.sin(p * Math.PI);
        T.rShoulder[0] = -2.6 + p * 2.6;
        T.rShoulder[2] = 0.9 * ext;
        T.waist[1] = -0.5 * ext;
        break;
      }
      case 'recoil': {
        const ext = 1 - p;
        T.rShoulder[0] += 0.22 * ext;
        if (this.holdPose === 'rifle') T.lShoulder[0] += 0.18 * ext;
        break;
      }
      case 'barrage': {
        const s = Math.sin(a.t * 34);
        T.rShoulder[0] = -1.6 + s * 0.25;
        T.lShoulder[0] = -1.6 - s * 0.25;
        T.rElbow[0] = T.lElbow[0] = -0.15;
        T.waist[1] = s * 0.12;
        break;
      }
      case 'block': {
        T.lShoulder[0] = T.rShoulder[0] = -1.35;
        T.lElbow[0] = T.rElbow[0] = -1.5;
        T.lShoulder[1] = 0.4; T.rShoulder[1] = -0.4;
        break;
      }
      case 'eat': {
        const s = Math.sin(a.t * 9);
        T.rShoulder[0] = -1.9 + s * 0.3;
        T.rElbow[0] = -1.6;
        break;
      }
      case 'wave': {
        T.rShoulder[0] = -2.9;
        T.rElbow[2] = Math.sin(a.t * 8) * 0.45;
        break;
      }
    }
    if (a.t >= a.dur && a.name !== 'block') this.action = null;
    if (a.name === 'block' && a.t >= a.dur) this.action = null;
  }

  #emoteAnim(t, T) {
    if (this.emote === 'dance') {
      const s = Math.sin(t * 6), c = Math.cos(t * 6);
      T.lShoulder[0] = -1.4 + s * 0.8; T.rShoulder[0] = -1.4 - s * 0.8;
      T.lShoulder[2] = -0.5; T.rShoulder[2] = 0.5;
      T.waist[1] = s * 0.3; T.waist[2] = c * 0.1;
      T.lHip[2] = -0.1 + s * 0.08; T.rHip[2] = 0.1 + s * 0.08;
    } else if (this.emote === 'wave') {
      T.rShoulder[0] = -2.9;
      T.rElbow[2] = Math.sin(t * 8) * 0.45;
    } else if (this.emote === 'sleep') {
      T.lShoulder[2] = -0.1; T.rShoulder[2] = 0.1;
      T.neck[0] = 0.35;
    }
  }

  #updateRagdoll(dt) {
    this.ragT += dt;
    const damp = Math.max(0, 1 - this.ragT * 0.8);
    this.body.rotation.x += this.ragSpin * dt * damp;
    this.body.position.y = Math.max(1.0, this.body.position.y - 3 * dt);
    const wob = (ph, amp) => Math.sin(this.ragT * 13 + ph) * amp * damp;
    this.joints.lShoulder.rotation.x = wob(0, 1.4);
    this.joints.rShoulder.rotation.x = wob(2, 1.4);
    this.joints.lHip.rotation.x = wob(4, 1.1);
    this.joints.rHip.rotation.x = wob(1, 1.1);
    this.joints.lKnee.rotation.x = Math.abs(wob(3, 1));
    this.joints.rKnee.rotation.x = Math.abs(wob(5, 1));
    this.joints.neck.rotation.z = wob(2.5, 0.5);
  }

  dispose() {
    this.group.parent?.remove(this.group);
  }
}

function wrapText(text, maxChars) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      if (cur) lines.push(cur.trim());
      cur = w;
      while (cur.length > maxChars) { lines.push(cur.slice(0, maxChars)); cur = cur.slice(maxChars); }
    } else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
