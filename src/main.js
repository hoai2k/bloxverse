// Title screen, world management and boot.
import { Game } from './game.js';
import { SaveStore, Settings } from './save.js';
import { buildOptions } from './ui.js';
import { hashString } from './noise.js';
import { B, BLOCKS } from './blocks.js';
import { I, ITEMS } from './items.js';

const $ = (s) => document.querySelector(s);
const settings = Settings.load();
const canvas = document.getElementById('game');
let game = null; let selectedWorld = null;
const SPLASHES = ['Blocks all the way down!', 'Now with 100% more cubes!', 'Procedurally yours!', 'No assets were harmed', 'Also try touching grass!', 'Creepers gonna creep', 'Dig deep, build high', 'Rendered with love and shaders', 'Punch trees to begin', 'The dragon is waiting'];
$('.splash').textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];

function showPage(name) { for (const p of document.querySelectorAll('.menu-page')) p.hidden = p.id !== 'menu-' + name; if (name === 'worlds') refreshWorlds(); if (name === 'options') buildOptions($('#options-body'), settings, (s) => { Settings.save(s); }); }
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
  if (!game) { game = new Game(canvas, settings); game.onQuit = () => { $('#menu').hidden = false; showPage('worlds'); }; window.game = game; }
  game.settings = settings;
  try { await game.start(meta); } catch (e) { console.error(e); alert('Failed to start world: ' + e.message); $('#menu').hidden = false; $('#loading').hidden = true; }
}
window.addEventListener('beforeunload', () => { if (game && game.running) game.save(false); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.running) game.save(false); });
showPage('main');
window.CV = { B, I, BLOCKS, ITEMS, SaveStore, playWorld, settings };
// Allow ?world=<name> quick start for testing: creates a throwaway creative world
if (location.search.includes('quick')) { const params = new URLSearchParams(location.search); playWorld({ id: 'quick', name: 'Quick World', seed: parseInt(params.get('seed')) || 12345, gamemode: params.get('mode') || 'creative', difficulty: 2, worldType: params.get('type') || 'default', cheats: true, created: Date.now(), time: parseInt(params.get('time')) || 1000, dim: parseInt(params.get('dim')) || 0 }); }
