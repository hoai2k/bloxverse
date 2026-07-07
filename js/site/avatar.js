// BLOXVERSE — avatar editor page (3D preview + customization + hat shop)
import * as THREE from 'three';
import { initShell, footer, getUser, saveUser, drawHeadshot, toast } from './common.js';
import { fmtCount } from './catalog.js';
import { R15Character, HATS, HAT_PRICES, FACES } from '../engine/character.js';

const SKINS = ['#f5cd30', '#fdc180', '#e0a370', '#a05a2c', '#6d4229', '#d5d8dd', '#9aa0a6', '#f2b8c6', '#8ad06a', '#7fb8e8'];
const SHIRTS = ['#0f7abd', '#c22f2f', '#2a9e35', '#7b3fd4', '#e88b12', '#22262a', '#f2f4f5', '#ff69b4', '#01655c', '#5c3a21'];
const PANTS = ['#2a9e35', '#22262a', '#274a8a', '#6d4229', '#7b3fd4', '#9aa0a6', '#c22f2f', '#e0e3e7', '#e88b12', '#0f7abd'];
const HAT_LABELS = { none: 'None', cap: 'Red Cap', headphones: 'Headphones', tophat: 'Top Hat', halo: 'Golden Halo', crown: 'Blox Crown' };
const FACE_LABELS = { smile: 'Classic Smile', happy: 'Super Happy', chill: 'Chill Shades', silly: 'Silly', angry: 'Grrr', sad: 'Sad' };

async function boot() {
  const user = await initShell('avatar');
  const cfg = { ...user.avatar };
  const main = document.getElementById('main');

  const wrap = document.createElement('div');
  wrap.className = 'av-wrap';
  wrap.innerHTML = `
    <div class="av-preview"><canvas id="avCanvas"></canvas><div class="hint">Drag to rotate</div></div>
    <div class="av-panel">
      <h3>Avatar Editor</h3>
      <div class="sub">Your look carries into every Bloxverse game. Blux: <b style="color:var(--gold)" id="avBlux">${fmtCount(user.blux)}</b></div>
      <div class="av-section"><h4>Skin Tone</h4><div class="swatches" id="swSkin"></div></div>
      <div class="av-section"><h4>Shirt</h4><div class="swatches" id="swShirt"></div></div>
      <div class="av-section"><h4>Pants</h4><div class="swatches" id="swPants"></div></div>
      <div class="av-section"><h4>Face</h4><div class="chips" id="chFace"></div></div>
      <div class="av-section"><h4>Hats <span style="color:var(--text-3);font-weight:400;text-transform:none">— buy with Blux earned in games</span></h4><div class="chips" id="chHat"></div></div>
      <button class="av-save" id="avSave">Save Avatar</button>
    </div>`;
  main.appendChild(wrap);
  main.appendChild(footer());

  // ---------- 3D preview ----------
  const canvas = document.getElementById('avCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  cam.position.set(0, 4.2, 11.5);
  cam.lookAt(0, 3.2, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(4, 9, 6);
  sun.castShadow = true;
  scene.add(sun);
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 3.0, 0.5, 36),
    new THREE.MeshLambertMaterial({ color: 0x3a3d40 }));
  pedestal.position.y = -0.25;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  let char = null;
  function rebuild() {
    if (char) char.dispose();
    char = new R15Character({ name: user.name, avatar: cfg, nameTag: false });
    scene.add(char.group);
  }
  rebuild();

  let yaw = 0.4, dragging = false, lastX = 0, spinVel = 0;
  const onDown = (e) => { dragging = true; lastX = (e.touches ? e.touches[0] : e).clientX; };
  const onMove = (e) => {
    if (!dragging) return;
    const x = (e.touches ? e.touches[0] : e).clientX;
    spinVel = (x - lastX) * 0.011;
    yaw += spinVel;
    lastX = x;
  };
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('mouseup', () => dragging = false);
  window.addEventListener('touchend', () => dragging = false);

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    const box = canvas.parentElement.getBoundingClientRect();
    if (canvas.width !== Math.floor(box.width) || canvas.height !== Math.floor(box.height)) {
      renderer.setSize(box.width, box.height, false);
      renderer.setPixelRatio(Math.min(2, devicePixelRatio));
      cam.aspect = box.width / box.height;
      cam.updateProjectionMatrix();
    }
    if (!dragging) { spinVel *= 0.95; yaw += spinVel + dt * 0.15; }
    if (char) {
      char.group.rotation.y = yaw;
      char.update(dt, { speed: 0, grounded: true });
    }
    renderer.render(scene, cam);
  }
  frame();

  // ---------- controls ----------
  function swatchRow(el, colors, key) {
    colors.forEach((col) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (cfg[key] === col ? ' on' : '');
      b.style.background = col;
      b.addEventListener('click', () => {
        cfg[key] = col;
        el.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on'));
        b.classList.add('on');
        rebuild(); dirty();
      });
      el.appendChild(b);
    });
  }
  swatchRow(document.getElementById('swSkin'), SKINS, 'skin');
  swatchRow(document.getElementById('swShirt'), SHIRTS, 'shirt');
  swatchRow(document.getElementById('swPants'), PANTS, 'pants');

  const chFace = document.getElementById('chFace');
  FACES.forEach((f) => {
    const b = document.createElement('button');
    b.className = 'chip' + (cfg.face === f ? ' on' : '');
    b.textContent = FACE_LABELS[f];
    b.addEventListener('click', () => {
      cfg.face = f;
      chFace.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
      b.classList.add('on');
      rebuild(); dirty();
    });
    chFace.appendChild(b);
  });

  const chHat = document.getElementById('chHat');
  function renderHats() {
    chHat.innerHTML = '';
    HATS.forEach((h) => {
      const owned = user.owned.includes(h);
      const b = document.createElement('button');
      b.className = 'chip' + (cfg.hat === h ? ' on' : '') + (owned ? '' : ' locked');
      b.innerHTML = owned ? HAT_LABELS[h] : `🔒 ${HAT_LABELS[h]} <span class="price">◆ ${HAT_PRICES[h]}</span>`;
      b.addEventListener('click', () => {
        if (!owned) {
          if (user.blux < HAT_PRICES[h]) { toast(`Not enough Blux! Earn more by playing games.`); return; }
          user.blux -= HAT_PRICES[h];
          user.owned.push(h);
          saveUser(user);
          document.getElementById('avBlux').textContent = fmtCount(user.blux);
          document.querySelector('.bv-blux b').textContent = fmtCount(user.blux);
          toast(`Purchased ${HAT_LABELS[h]}!`);
        }
        cfg.hat = h;
        rebuild(); dirty(); renderHats();
      });
      chHat.appendChild(b);
    });
  }
  renderHats();

  const saveBtn = document.getElementById('avSave');
  function dirty() { saveBtn.classList.remove('saved'); saveBtn.textContent = 'Save Avatar'; }
  saveBtn.addEventListener('click', () => {
    user.avatar = { ...cfg };
    saveUser(user);
    drawHeadshot(document.querySelector('.bv-avatar-chip canvas'), user.avatar);
    saveBtn.classList.add('saved');
    saveBtn.textContent = '✓ Saved!';
    toast('Avatar saved — it will appear in all games.');
  });
}

boot();
