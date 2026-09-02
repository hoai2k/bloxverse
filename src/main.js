// Title screen, world management and boot.
import { Game } from './game.js';
import { SaveStore, Settings } from './save.js';
import { buildOptions } from './ui.js';
import { hashString } from './noise.js';
import { B, BLOCKS } from './blocks.js';
import { I, ITEMS } from './items.js';
import { Renderer } from './renderer.js';
import { World } from './world.js';
import { VERSION, UPDATE_NAME, UPDATE_VERSION, CHANGELOG, PANORAMA, hasUnreadUpdate, markUpdateSeen } from './version.js';

const $ = (s) => document.querySelector(s);
const settings = Settings.load();
const canvas = document.getElementById('game');
let game = null; let selectedWorld = null;
// ---------- live world panorama behind the title screen ----------
let pano = null;
function startPanorama() {
  try {
    if (!pano) {
      const renderer = game ? game.renderer : new Renderer(canvas);
      const world = new World({ seed: PANORAMA.seed, dim: 0, worldType: 'default', renderDistance: 4 });
      world.onMesh = (c, d) => { if (pano && pano.world === world) renderer.updateChunk(c, d); };
      world.onUnload = (c) => renderer.removeChunk(c);
      const h = world.gen.heightAt(Math.floor(PANORAMA.x), Math.floor(PANORAMA.z));
      pano = { renderer, world, t: 0, cam: [PANORAMA.x, Math.max(h, 63) + (PANORAMA.height || 9), PANORAMA.z], running: false };
      if (renderer.views[0]) renderer.setHandVisible(renderer.views[0], false);
      renderer.rain.visible = false;
    }
    if (pano.running) return; pano.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!pano || !pano.running) return; requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now; pano.t += dt;
      const r = pano.renderer; pano.world.update(pano.cam[0], pano.cam[2], 8);
      const cam = r.views[0].camera;
      cam.position.set(pano.cam[0], pano.cam[1], pano.cam[2]); cam.rotation.set(PANORAMA.pitch ?? -0.12, pano.t * (PANORAMA.speed ?? 0.05), 0);
      r.updateSky(4000 + pano.t * 25, cam.position, 0); r.render();
    };
    requestAnimationFrame(loop);
  } catch (e) { console.warn('panorama unavailable', e); pano = null; }
}
function stopPanorama() { if (!pano) return null; pano.running = false; pano.world.dispose(); pano.renderer.clearChunks(); const r = pano.renderer; pano = null; return r; }

// ---------- gamepad navigation of the title menu ----------
const menuPad = { idx: 0, prev: {}, };
function menuButtons() { const page = [...document.querySelectorAll('.menu-page')].find(p => !p.hidden); if (!page) return []; return [...page.querySelectorAll('button, .world-item')].filter(b => !b.disabled && b.offsetParent !== null); }
function pollMenuPad() {
  requestAnimationFrame(pollMenuPad);
  if (!$('#menu').hidden === false) return;
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; let pad = null;
  for (const g of pads) if (g && g.connected) { pad = g; break; }
  if (!pad) return;
  const btns = menuButtons(); if (!btns.length) return;
  const down = (i) => pad.buttons[i] && pad.buttons[i].pressed;
  const ax = pad.axes[1] || 0;
  const nav = { up: down(12) || ax < -0.55, down: down(13) || ax > 0.55, sel: down(0), back: down(1) };
  for (const k of ['up', 'down', 'sel', 'back']) {
    const was = menuPad.prev[k]; menuPad.prev[k] = nav[k];
    if (!nav[k] || was) continue;
    if (k === 'up') menuPad.idx = (menuPad.idx - 1 + btns.length) % btns.length;
    if (k === 'down') menuPad.idx = (menuPad.idx + 1) % btns.length;
    if (k === 'sel') { const b = btns[Math.min(menuPad.idx, btns.length - 1)]; if (b) { b.click(); menuPad.idx = 0; } }
    if (k === 'back') { const b = [...document.querySelectorAll('.menu-page:not([hidden]) button')].find(x => /back|cancel|done/i.test(x.textContent)); if (b) b.click(); }
  }
  btns.forEach((b, i) => b.classList.toggle('gp-focus', i === Math.min(menuPad.idx, btns.length - 1)));
}
requestAnimationFrame(pollMenuPad);
const SPLASHES = ['Blocks all the way down!', 'Now with 100% more cubes!', 'Procedurally yours!', 'No assets were harmed', 'Also try touching grass!', 'Creepers gonna creep', 'Dig deep, build high', 'Rendered with love and shaders', 'Punch trees to begin', 'The dragon is waiting'];
$('.splash').textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
$('#version-line').innerHTML = `Craftverse <b>${VERSION}</b> · runs entirely in your browser`;
if (UPDATE_NAME) {
  const b = $('#update-banner'); b.hidden = false;
  b.querySelector('.ub-name').textContent = UPDATE_NAME;
  b.querySelector('.ub-ver').textContent = 'Version ' + UPDATE_VERSION;
}
if (hasUnreadUpdate()) { const btn = document.querySelector('[data-page="updatelog"]'); if (btn) btn.textContent = 'Update Log  •'; }
function renderChangelog() {
  const list = $('#changelog'); list.innerHTML = '';
  for (const c of CHANGELOG) {
    const entry = document.createElement('div'); entry.className = 'log-entry' + (c.major ? ' major' : '');
    const head = document.createElement('div'); head.className = 'log-head';
    head.innerHTML = `<span class="log-ver">${c.version}${c.version === VERSION ? ' (current)' : ''}</span>` + (c.name ? `<span class="log-name">${escapeHtml(c.name)}</span>` : '') + `<span class="log-date">${c.date}</span>`;
    entry.appendChild(head);
    const ul = document.createElement('ul');
    for (const ch of c.changes) { const li = document.createElement('li'); li.textContent = ch; ul.appendChild(li); }
    entry.appendChild(ul); list.appendChild(entry);
  }
  markUpdateSeen();
  const btn = document.querySelector('[data-page="updatelog"]'); if (btn) btn.textContent = 'Update Log';
}

function showPage(name) { for (const p of document.querySelectorAll('.menu-page')) p.hidden = p.id !== 'menu-' + name; if (name === 'worlds') refreshWorlds(); if (name === 'updatelog') renderChangelog(); if (name === 'options') buildOptions($('#options-body'), settings, (s) => { Settings.save(s); }); }
for (const b of document.querySelectorAll('[data-page]')) b.addEventListener('click', () => showPage(b.dataset.page));
for (const b of document.querySelectorAll('.cycle')) { b.addEventListener('click', () => { const vals = b.dataset.values.split(','); const label = b.textContent.split(':')[0]; const cur = b.textContent.split(': ')[1]; const i = (vals.indexOf(cur) + 1) % vals.length; b.textContent = label + ': ' + vals[i]; }); }

async function refreshWorlds() {
  const list = $('#world-list'); list.innerHTML = ''; selectedWorld = null; $('#btn-play-world').disabled = true; $('#btn-delete-world').disabled = true;
  let worlds = []; try { worlds = await SaveStore.listWorlds(); } catch (e) { list.appendChild(Object.assign(document.createElement('div'), { className: 'world-item', textContent: 'Storage unavailable: ' + e.message })); return; }
  if (!worlds.length) { const d = document.createElement('div'); d.className = 'world-item'; d.innerHTML = '<div class="name">No worlds yet</div><div class="info">Create a new world to get started</div>'; list.appendChild(d); }
  for (const w of worlds) {
    const d = document.createElement('div'); d.className = 'world-item';
    const mode = w.hardcore ? 'Hardcore' : (w.gamemode || 'survival'); const days = Math.floor((w.time || 0) / 24000);
    d.innerHTML = `<div class="name">${escapeHtml(w.name)} ${w.hardcoreDead ? '(dead)' : ''}</div><div class="info">${new Date(w.lastPlayed || 0).toLocaleString()} · ${mode} · ${w.worldType || 'default'} · day ${days} · seed ${w.seed}${w.cheats ? ' · cheats' : ''}</div>`;
    d.onclick = () => { for (const x of list.children) x.classList.remove('selected'); d.classList.add('selected'); selectedWorld = w; $('#btn-play-world').disabled = false; $('#btn-delete-world').disabled = false; };
    d.ondblclick = () => { selectedWorld = w; playWorld(w); };
    list.appendChild(d);
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
$('#btn-play-world').onclick = () => selectedWorld && playWorld(selectedWorld);
$('#btn-delete-world').onclick = async () => { if (!selectedWorld) return; if (!confirm(`Delete world "${selectedWorld.name}"? This cannot be undone.`)) return; await SaveStore.deleteWorld(selectedWorld.id); refreshWorlds(); };
$('#btn-create-world').onclick = async () => {
  const name = $('#cw-name').value.trim() || 'New World';
  const seedStr = $('#cw-seed').value.trim(); let seed; if (!seedStr) seed = (Math.random() * 4294967296) >>> 0; else if (/^-?\d+$/.test(seedStr)) seed = (parseInt(seedStr) >>> 0); else seed = hashString(seedStr);
  const modeText = $('#cw-mode').textContent.split(': ')[1]; const hardcore = modeText === 'Hardcore'; const gamemode = hardcore ? 'survival' : modeText.toLowerCase();
  const difficulty = { Peaceful: 0, Easy: 1, Normal: 2, Hard: 3 }[$('#cw-diff').textContent.split(': ')[1]];
  const worldType = { Default: 'default', Superflat: 'superflat', Amplified: 'amplified', 'Large Biomes': 'large_biomes' }[$('#cw-type').textContent.split(': ')[1]];
  const cheats = $('#cw-cheats').textContent.endsWith('ON') || gamemode === 'creative';
  const bonusChest = $('#cw-bonus').textContent.endsWith('ON');
  const meta = { id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, seed, gamemode, hardcore, difficulty: hardcore ? 3 : difficulty, worldType, cheats, bonusChest, created: Date.now(), lastPlayed: Date.now(), time: 1000, dim: 0 };
  await SaveStore.putWorld(meta);
  playWorld(meta);
};
async function playWorld(meta) {
  if (meta.hardcoreDead && !meta.player?.gamemode) { }
  $('#menu').hidden = true;
  const pr = stopPanorama();
  if (!game) { game = new Game(canvas, settings); game.panoramaRenderer = pr; game.onQuit = () => { $('#menu').hidden = false; showPage('worlds'); startPanorama(); }; window.game = game; }
  game.settings = settings;
  try { await game.start(meta); } catch (e) { console.error(e); alert('Failed to start world: ' + e.message); $('#menu').hidden = false; $('#loading').hidden = true; }
}
window.addEventListener('beforeunload', () => { if (game && game.running) game.save(false); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.running) game.save(false); });
showPage('main');
if (!location.search.includes('quick')) startPanorama();
window.CV = { B, I, BLOCKS, ITEMS, SaveStore, playWorld, settings };
// Allow ?world=<name> quick start for testing: creates a throwaway creative world
if (location.search.includes('quick')) { const params = new URLSearchParams(location.search); if (params.get('rd')) settings.renderDistance = parseInt(params.get('rd')); playWorld({ id: 'quick', name: 'Quick World', seed: parseInt(params.get('seed')) || 12345, gamemode: params.get('mode') || 'creative', difficulty: 2, worldType: params.get('type') || 'default', cheats: true, created: Date.now(), time: parseInt(params.get('time')) || 1000, dim: parseInt(params.get('dim')) || 0 }); }
