// BLOXVERSE — home / discover page
import { GAMES, getGame, livePlaying } from './catalog.js';
import { initShell, gameTile, footer, getUser, escapeHtml } from './common.js';

const main = document.getElementById('main');

function row(title, games, id) {
  if (!games.length) return null;
  const sec = document.createElement('section');
  sec.className = 'bv-row';
  if (id) sec.id = id;
  sec.innerHTML = `<div class="bv-row-head"><h3>${escapeHtml(title)}</h3></div>`;
  const tiles = document.createElement('div');
  tiles.className = 'bv-tiles scroll';
  games.forEach((g) => tiles.appendChild(gameTile(g)));
  sec.appendChild(tiles);
  return sec;
}

async function boot() {
  await initShell('home');
  const user = getUser();

  // Hero banner — featured game
  const featured = getGame('jujutsu');
  const hero = document.createElement('a');
  hero.className = 'bv-hero';
  hero.href = `game.html?g=${featured.id}`;
  hero.innerHTML = `
    <img src="assets/thumbs/banner.svg" alt="${escapeHtml(featured.name)}"/>
    <div class="hero-overlay">
      <h2>${escapeHtml(featured.name)}</h2>
      <p>${escapeHtml(featured.tagline)} Now with Awakenings, ragdolls and the saltiest lobby on Bloxverse.</p>
      <span class="hero-play">▶&nbsp; Play Now</span>
    </div>`;
  main.appendChild(hero);

  // Continue playing
  const recents = (user.recent || []).map(getGame).filter(Boolean);
  const cont = row('Continue Playing', recents, 'continue');
  if (cont) main.appendChild(cont);

  // Rows
  main.appendChild(row('Recommended For You', [...GAMES].sort(() => 0.5 - hash01(user.name)), 'recommended'));
  main.appendChild(row('Top Rated', [...GAMES].sort((a, b) => b.rating - a.rating), 'top-rated'));
  main.appendChild(row('Most Popular', [...GAMES].sort((a, b) => livePlaying(b) - livePlaying(a)), 'popular'));
  main.appendChild(row('Fighting & Action', GAMES.filter((g) => ['Fighting', 'Shooter', 'Survival'].includes(g.genre))));
  main.appendChild(row('Chill & Creative', GAMES.filter((g) => ['Town & City', 'Obby / Platformer'].includes(g.genre))));

  main.appendChild(footer());
}

function hash01(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

boot();
