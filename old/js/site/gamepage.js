// BLOXVERSE — game detail page
import { GAMES, getGame, fmtCount, livePlaying } from './catalog.js';
import { initShell, gameTile, footer, getUser, saveUser, escapeHtml, toast } from './common.js';

const main = document.getElementById('main');
const params = new URLSearchParams(location.search);
const game = getGame(params.get('g')) || GAMES[0];

async function boot() {
  await initShell(null);
  document.title = `${game.name} — BLOXVERSE`;
  const user = getUser();

  const wrap = document.createElement('div');
  wrap.className = 'gp-wrap';
  wrap.innerHTML = `
    <div class="gp-media"><img src="${game.thumb}" alt="${escapeHtml(game.name)}"/></div>
    <div class="gp-info">
      <h1>${escapeHtml(game.name)}</h1>
      <div class="gp-creator">By <b>${escapeHtml(game.creator)}</b> &nbsp;·&nbsp; ${escapeHtml(game.genre)}</div>
      <button class="gp-play" id="playBtn">▶&nbsp; Play</button>
      <div class="gp-vote">
        <div class="gp-vote-bar"><div id="voteFill" style="width:${game.rating}%"></div></div>
        <div class="gp-vote-row">
          <button class="vbtn" id="upBtn">👍 <span id="upCount"></span></button>
          <button class="vbtn down" id="downBtn">👎 <span id="downCount"></span></button>
        </div>
      </div>
      <button class="gp-fav" id="favBtn">⭐ <span>Favorite</span></button>
    </div>`;
  main.appendChild(wrap);

  // -------- votes / favorites (persisted) --------
  const baseUp = Math.round(game.basePlaying * 7.3);
  const baseDown = Math.round(baseUp * (100 - game.rating) / game.rating);
  const upBtn = wrap.querySelector('#upBtn');
  const downBtn = wrap.querySelector('#downBtn');
  const favBtn = wrap.querySelector('#favBtn');
  const renderVotes = () => {
    const v = user.votes[game.id];
    upBtn.classList.toggle('on', v === 1);
    downBtn.classList.toggle('on', v === -1);
    wrap.querySelector('#upCount').textContent = fmtCount(baseUp + (v === 1 ? 1 : 0));
    wrap.querySelector('#downCount').textContent = fmtCount(baseDown + (v === -1 ? 1 : 0));
    const up = baseUp + (v === 1 ? 1 : 0), down = baseDown + (v === -1 ? 1 : 0);
    wrap.querySelector('#voteFill').style.width = `${Math.round(up / (up + down) * 100)}%`;
    const faved = user.favs.includes(game.id);
    favBtn.classList.toggle('on', faved);
    favBtn.querySelector('span').textContent = faved ? 'Favorited' : 'Favorite';
  };
  upBtn.addEventListener('click', () => { user.votes[game.id] = user.votes[game.id] === 1 ? 0 : 1; saveUser(user); renderVotes(); });
  downBtn.addEventListener('click', () => { user.votes[game.id] = user.votes[game.id] === -1 ? 0 : -1; saveUser(user); renderVotes(); });
  favBtn.addEventListener('click', () => {
    if (user.favs.includes(game.id)) user.favs = user.favs.filter((f) => f !== game.id);
    else { user.favs.push(game.id); toast('Added to favorites!'); }
    saveUser(user); renderVotes();
  });
  renderVotes();

  wrap.querySelector('#playBtn').addEventListener('click', () => {
    location.href = `play.html?g=${game.id}`;
  });

  // -------- tabs --------
  const tabs = document.createElement('div');
  tabs.className = 'gp-tabs';
  tabs.innerHTML = `<button class="on" data-t="about">About</button><button data-t="servers">Servers</button>`;
  main.appendChild(tabs);

  const about = document.createElement('div');
  about.innerHTML = `
    <div class="gp-about">${escapeHtml(game.desc)}</div>
    <div class="gp-stats">
      <div class="stat"><div class="k">Active</div><div class="v">${fmtCount(livePlaying(game))}</div></div>
      <div class="stat"><div class="k">Visits</div><div class="v">${game.visits}</div></div>
      <div class="stat"><div class="k">Created</div><div class="v">${game.created}</div></div>
      <div class="stat"><div class="k">Updated</div><div class="v">${game.updated}</div></div>
      <div class="stat"><div class="k">Server Size</div><div class="v">${game.serverSize}</div></div>
      <div class="stat"><div class="k">Genre</div><div class="v">${game.genre}</div></div>
    </div>
    <div class="gp-controls">
      <h4>Controls</h4>
      <table>${game.controls.map(([k, v]) => `<tr><td class="key"><kbd>${escapeHtml(k)}</kbd></td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
      <p style="margin-top:10px;color:var(--text-3);font-size:13px">📱 On mobile: virtual joystick to move, drag to look, plus on-screen buttons for every action.</p>
    </div>`;
  main.appendChild(about);

  const servers = document.createElement('div');
  servers.style.display = 'none';
  const svCount = 3 + Math.floor(Math.random() * 3);
  let svHtml = '';
  for (let i = 0; i < svCount; i++) {
    const n = 2 + Math.floor(Math.random() * (game.serverSize - 2));
    svHtml += `
      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--stroke);border-radius:10px;padding:14px 16px;margin-bottom:10px">
        <div>
          <div style="font-weight:800">${n} of ${game.serverSize} players</div>
          <div style="color:var(--text-3);font-size:12px;margin-top:2px">${'🟩'.repeat(n)}${'⬛'.repeat(game.serverSize - n)}</div>
        </div>
        <button class="hero-play" style="background:var(--green);color:#fff;border:none;border-radius:8px;font-weight:800;padding:9px 22px" onclick="location.href='play.html?g=${game.id}'">Join</button>
      </div>`;
  }
  servers.innerHTML = `<div style="padding:20px 0">${svHtml}</div>`;
  main.appendChild(servers);

  tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    tabs.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    about.style.display = b.dataset.t === 'about' ? '' : 'none';
    servers.style.display = b.dataset.t === 'servers' ? '' : 'none';
  }));

  // -------- recommended --------
  const rec = document.createElement('section');
  rec.className = 'bv-row';
  rec.style.marginTop = '34px';
  rec.innerHTML = `<div class="bv-row-head"><h3>Recommended</h3></div>`;
  const tiles = document.createElement('div');
  tiles.className = 'bv-tiles scroll';
  GAMES.filter((g) => g.id !== game.id).forEach((g) => tiles.appendChild(gameTile(g)));
  rec.appendChild(tiles);
  main.appendChild(rec);
  main.appendChild(footer());
}

boot();
