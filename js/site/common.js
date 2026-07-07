// ============================================================
// BLOXVERSE — shared site shell: user account, header, storage
// ============================================================
import { GAMES, fmtCount, livePlaying } from './catalog.js';

const LS_KEY = 'bloxverse_user_v1';

export const DEFAULT_AVATAR = {
  skin: '#f5cd30',
  shirt: '#0f7abd',
  pants: '#2a9e35',
  hat: 'none',
  face: 'smile',
};

// ---------------- user store ----------------
export function getUser() {
  try {
    const u = JSON.parse(localStorage.getItem(LS_KEY));
    if (u && u.name) {
      u.avatar = { ...DEFAULT_AVATAR, ...(u.avatar || {}) };
      u.owned = u.owned || ['none'];
      u.blux = u.blux ?? 250;
      u.votes = u.votes || {};
      u.favs = u.favs || [];
      u.recent = u.recent || [];
      return u;
    }
  } catch (e) { /* corrupted -> re-create */ }
  return null;
}

export function saveUser(u) {
  localStorage.setItem(LS_KEY, JSON.stringify(u));
}

export function ensureUser() {
  let u = getUser();
  if (u) return Promise.resolve(u);
  return showSignup();
}

function showSignup() {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'bv-modal-back';
    back.innerHTML = `
      <div class="bv-modal">
        <div class="tilt-big">B</div>
        <h2>Join Bloxverse</h2>
        <p>Pick a username to start playing. Everything saves on this device.</p>
        <input id="bv-uname" maxlength="20" placeholder="Username" autocomplete="off" />
        <div class="err" id="bv-uerr"></div>
        <button id="bv-ugo">Let's Go!</button>
      </div>`;
    document.body.appendChild(back);
    const input = back.querySelector('#bv-uname');
    const err = back.querySelector('#bv-uerr');
    const go = () => {
      const name = input.value.trim();
      if (name.length < 3) { err.textContent = 'Username must be at least 3 characters.'; return; }
      if (!/^[\w]+$/.test(name)) { err.textContent = 'Letters, numbers and _ only.'; return; }
      const u = {
        name, blux: 250, avatar: { ...DEFAULT_AVATAR },
        owned: ['none'], votes: {}, favs: [], recent: [],
        joined: new Date().toISOString(),
      };
      saveUser(u);
      back.remove();
      resolve(u);
    };
    back.querySelector('#bv-ugo').addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => input.focus(), 50);
  });
}

export function addBlux(amount) {
  const u = getUser();
  if (!u) return 0;
  u.blux = Math.max(0, (u.blux || 0) + amount);
  saveUser(u);
  const el = document.querySelector('.bv-blux b');
  if (el) el.textContent = fmtCount(u.blux);
  return u.blux;
}

export function markRecent(gameId) {
  const u = getUser();
  if (!u) return;
  u.recent = [gameId, ...u.recent.filter((g) => g !== gameId)].slice(0, 6);
  saveUser(u);
}

// ---------------- avatar headshot (canvas) ----------------
export function drawHeadshot(canvas, avatar, size = 68) {
  canvas.width = size; canvas.height = size;
  const c = canvas.getContext('2d');
  c.fillStyle = '#3a3c3e';
  c.fillRect(0, 0, size, size);
  const s = size / 68;
  // torso
  c.fillStyle = avatar.shirt;
  roundRect(c, 12 * s, 46 * s, 44 * s, 26 * s, 6 * s); c.fill();
  // head
  c.fillStyle = avatar.skin;
  roundRect(c, 16 * s, 10 * s, 36 * s, 34 * s, 9 * s); c.fill();
  // face
  c.fillStyle = '#1c1c1c';
  const eye = (x) => { c.beginPath(); c.ellipse(x * s, 24 * s, 2.6 * s, 4 * s, 0, 0, Math.PI * 2); c.fill(); };
  eye(27); eye(41);
  c.strokeStyle = '#1c1c1c'; c.lineWidth = 2.4 * s; c.lineCap = 'round';
  c.beginPath();
  if (avatar.face === 'angry') { c.moveTo(28 * s, 37 * s); c.lineTo(40 * s, 37 * s); }
  else { c.arc(34 * s, 32 * s, 7 * s, 0.25 * Math.PI, 0.75 * Math.PI); }
  c.stroke();
  // hat hint
  if (avatar.hat && avatar.hat !== 'none') {
    c.fillStyle = avatar.hat === 'halo' ? '#ffd94a' : avatar.hat === 'crown' ? '#ffb400' : '#222426';
    if (avatar.hat === 'halo') { c.beginPath(); c.ellipse(34 * s, 8 * s, 14 * s, 4 * s, 0, 0, Math.PI * 2); c.fill(); }
    else roundRect(c, 14 * s, 2 * s, 40 * s, 10 * s, 4 * s), c.fill();
  }
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ---------------- header / shell ----------------
export async function initShell(activeTab) {
  const user = await ensureUser();

  const header = document.createElement('header');
  header.className = 'bv-header';
  header.innerHTML = `
    <a class="bv-logo" href="index.html"><span class="tilt">B</span><span class="wordmark">BLOXVERSE</span></a>
    <nav class="bv-nav">
      <a href="index.html" data-tab="home">Discover</a>
      <a href="avatar.html" data-tab="avatar">Avatar</a>
    </nav>
    <div class="bv-search">
      <svg class="mag" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
      <input id="bv-search-input" placeholder="Search Bloxverse" autocomplete="off" />
      <div class="bv-search-results" id="bv-search-results"></div>
    </div>
    <div class="bv-spacer"></div>
    <div class="bv-right">
      <a class="bv-blux" href="avatar.html" title="Blux — earn it by playing!"><span class="coin"></span><b>${fmtCount(user.blux)}</b></a>
      <a class="bv-avatar-chip" href="avatar.html">
        <canvas width="68" height="68"></canvas>
        <span class="uname">${escapeHtml(user.name)}</span>
      </a>
    </div>`;
  document.body.prepend(header);

  header.querySelectorAll('.bv-nav a').forEach((a) => {
    if (a.dataset.tab === activeTab) a.classList.add('active');
  });
  drawHeadshot(header.querySelector('.bv-avatar-chip canvas'), user.avatar);

  // mobile tab bar
  const tabbar = document.createElement('nav');
  tabbar.className = 'bv-tabbar';
  tabbar.innerHTML = `
    <a href="index.html" data-tab="home"><span class="ticon">🏠</span>Home</a>
    <a href="avatar.html" data-tab="avatar"><span class="ticon">🧍</span>Avatar</a>
    <a href="index.html#top-rated" data-tab="charts"><span class="ticon">📈</span>Charts</a>`;
  tabbar.querySelectorAll('a').forEach((a) => { if (a.dataset.tab === activeTab) a.classList.add('active'); });
  document.body.appendChild(tabbar);

  initSearch(header);
  return user;
}

function initSearch(header) {
  const input = header.querySelector('#bv-search-input');
  const results = header.querySelector('#bv-search-results');
  const render = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.classList.remove('open'); return; }
    const hits = GAMES.filter((g) =>
      g.name.toLowerCase().includes(q) || g.genre.toLowerCase().includes(q) || g.creator.toLowerCase().includes(q));
    results.innerHTML = hits.length
      ? hits.map((g) => `<a href="game.html?g=${g.id}"><img src="${g.thumb}" alt=""/><span><b>${escapeHtml(g.name)}</b><br/><small style="color:var(--text-3)">${g.genre} · ${fmtCount(livePlaying(g))} playing</small></span></a>`).join('')
      : `<a><span style="color:var(--text-3)">No results for "${escapeHtml(q)}"</span></a>`;
    results.classList.add('open');
  };
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  document.addEventListener('click', (e) => {
    if (!header.querySelector('.bv-search').contains(e.target)) results.classList.remove('open');
  });
}

// ---------------- helpers ----------------
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function toast(msg) {
  let t = document.querySelector('.bv-toast');
  if (!t) { t = document.createElement('div'); t.className = 'bv-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

export function gameTile(g) {
  const a = document.createElement('a');
  a.className = 'bv-tile';
  a.href = `game.html?g=${g.id}`;
  a.innerHTML = `
    <div class="thumb"><img loading="lazy" src="${g.thumb}" alt="${escapeHtml(g.name)}"/></div>
    <div class="tname">${escapeHtml(g.name)}</div>
    <div class="tmeta"><span class="thumb-up">👍 ${g.rating}%</span> · <span>${fmtCount(livePlaying(g))} playing</span></div>`;
  return a;
}

export function footer() {
  const f = document.createElement('footer');
  f.className = 'bv-footer';
  f.innerHTML = `BLOXVERSE is a fan-made, browser-only sandbox platform built for fun.<br/>
  Not affiliated with, endorsed by, or connected to Roblox Corporation or any game studio. All code, art and audio are original.`;
  return f;
}
