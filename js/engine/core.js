// ============================================================
// BLOXVERSE engine — GameApp core: renderer, camera rig,
// lighting, particle effects, main loop.
// ============================================================
import * as THREE from 'three';
import { World } from './physics.js';
import { Input } from './input.js';
import { GameUI } from './ui.js';
import { updateDebris } from './character.js';
import { updateGunFx } from './guns.js';
import { skyDome } from './world.js';

export class GameApp {
  constructor(opts) {
    this.root = opts.root;
    this.root.classList.add('game-root');

    // renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = opts.shadows !== false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.root.appendChild(this.renderer.domElement);

    // scene & camera
    this.scene = new THREE.Scene();
    if (opts.sky !== false) skyDome(this.scene, opts.skyTop || '#7ec8f2', opts.skyBottom || '#dff1fb');
    if (opts.fog) this.scene.fog = new THREE.Fog(opts.fog.color, opts.fog.near, opts.fog.far);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1200);
    this.camera.position.set(0, 10, 20);

    // lights
    const hemi = new THREE.HemisphereLight(opts.hemiSky || 0xcfe8ff, opts.hemiGround || 0x8a9a7a, opts.hemiIntensity ?? 1.0);
    this.scene.add(hemi);
    this.hemi = hemi;
    const amb = new THREE.AmbientLight(0xffffff, opts.ambient ?? 0.35);
    this.scene.add(amb);
    this.ambient = amb;
    const sun = new THREE.DirectionalLight(0xfff2d8, opts.sunIntensity ?? 2.2);
    sun.position.set(60, 110, 40);
    sun.castShadow = this.renderer.shadowMap.enabled;
    const S = opts.shadowArea ?? 130;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.camera.far = 400;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.sun = sun;

    // systems
    this.world = new World();
    this.input = new Input(this.root);
    this.ui = new GameUI(this.root, {
      gameName: opts.title,
      gameId: opts.gameId,
      input: this.input,
      onChatSend: (t) => this._chatSend && this._chatSend(t),
      onRespawn: () => this._respawn && this._respawn(),
    });

    // camera rig
    this.camMode = 'orbit';                // 'orbit' | 'shooter'
    this.camYaw = opts.camYaw ?? 0;
    this.camPitch = opts.camPitch ?? -0.32;
    this.camDist = opts.camDist ?? 14;
    this.camMin = 4; this.camMax = 45;
    this.camTargetY = 4.4;
    this.followTarget = null;              // Object3D or {position}
    this._shake = 0;

    this._updates = [];
    this._clock = new THREE.Clock();
    this._running = false;
    this.time = 0;

    this._effects = [];

    window.addEventListener('resize', () => this.#resize());
    this.#resize();
  }

  #resize() {
    const w = this.root.clientWidth || innerWidth;
    const h = this.root.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onUpdate(fn) { this._updates.push(fn); }
  onChatSend(fn) { this._chatSend = fn; }
  onRespawnRequest(fn) { this._respawn = fn; }

  setCameraMode(mode) {
    this.camMode = mode;
    this.input.lockOnClick = (mode === 'shooter') && !this.input.isTouch;
    this.ui.crosshair(mode === 'shooter');
  }

  // world-space movement dir from input, relative to camera yaw
  moveWorld(out) {
    const mv = this.input.readMove();
    const len = Math.hypot(mv.x, mv.z);
    if (len < 0.001) { out.set(0, 0, 0); return out; }
    const nx = mv.x / Math.max(1, len), nz = mv.z / Math.max(1, len);
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    out.set(nx * cos - nz * sin, 0, -nz * cos - nx * sin);
    // preserve analog magnitude (joystick)
    if (len < 1) out.multiplyScalar(len);
    return out;
  }

  screenShake(amount) { this._shake = Math.min(1.6, this._shake + amount); }

  updateCamera(dt) {
    const look = this.input.consumeLook();
    const wheel = this.input.consumeWheel();
    const active = this.camMode === 'shooter' || this.input.rotating || this.input.isTouch;
    if (active) {
      this.camYaw -= look.x * 0.0042;
      this.camPitch -= look.y * 0.0042;
      this.camPitch = Math.max(-1.35, Math.min(1.4, this.camPitch));
    }
    if (wheel) {
      this.camDist = Math.max(this.camMin, Math.min(this.camMax, this.camDist + wheel * 0.02));
    }
    const t = this.followTarget;
    if (!t) return;
    const tp = t.position || t;
    const focus = new THREE.Vector3(tp.x, tp.y + this.camTargetY, tp.z);
    let dist = this.camDist;
    const dir = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      -Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch));
    // camera occlusion: pull in when a wall is between target and camera
    const hit = this.world.raycast(focus, dir, dist + 1);
    if (hit) dist = Math.max(this.camMin * 0.4, hit.dist - 1);
    this.camera.position.copy(focus).addScaledVector(dir, dist);
    if (this._shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this._shake;
      this.camera.position.y += (Math.random() - 0.5) * this._shake;
      this._shake *= Math.max(0, 1 - dt * 7);
    }
    this.camera.lookAt(focus);
  }

  // forward direction of the camera on the XZ plane
  camForward(out) {
    out.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    return out;
  }
  // full 3D aim ray from camera through crosshair
  aimRay() {
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(dir);
    return { origin, dir };
  }

  // ---------------- particle / mesh effects ----------------
  burst(pos, { color = '#ffcc55', count = 14, speed = 18, size = 0.28, life = 0.5, gravity = 60, spread = 1 } = {}) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vels = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
      vels.push(new THREE.Vector3(
        (Math.random() - 0.5) * speed * spread,
        Math.random() * speed * 0.8,
        (Math.random() - 0.5) * speed * spread));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 1, depthWrite: false });
    const pts = new THREE.Points(geo, m);
    this.scene.add(pts);
    let age = 0;
    this._effects.push((dt) => {
      age += dt;
      const arr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        vels[i].y -= gravity * dt;
        arr[i * 3] += vels[i].x * dt;
        arr[i * 3 + 1] += vels[i].y * dt;
        arr[i * 3 + 2] += vels[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      m.opacity = Math.max(0, 1 - age / life);
      if (age >= life) {
        this.scene.remove(pts); geo.dispose(); m.dispose();
        return false;
      }
      return true;
    });
  }

  ring(pos, { color = '#ffffff', maxR = 10, life = 0.45, y = 0.15 } = {}) {
    const geo = new THREE.RingGeometry(0.6, 1, 32);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(geo, m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + y, pos.z);
    this.scene.add(ring);
    let age = 0;
    this._effects.push((dt) => {
      age += dt;
      const f = age / life;
      ring.scale.setScalar(1 + f * maxR);
      m.opacity = Math.max(0, 0.9 * (1 - f));
      if (f >= 1) { this.scene.remove(ring); geo.dispose(); m.dispose(); return false; }
      return true;
    });
  }

  addEffect(fn) { this._effects.push(fn); }

  start() {
    if (this._running) return;
    this._running = true;
    this._clock.start();
    const loop = () => {
      if (!this._running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, this._clock.getDelta());
      this.time += dt;
      for (const fn of this._updates) fn(dt, this.time);
      for (let i = this._effects.length - 1; i >= 0; i--) {
        if (this._effects[i](dt) === false) this._effects.splice(i, 1);
      }
      updateDebris(dt);
      updateGunFx(dt);
      this.updateCamera(dt);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop() { this._running = false; }
}
