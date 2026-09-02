// Chat commands (require cheats enabled in the world).
import { B, BLOCKS } from './blocks.js';
import { I, resolveId, makeStack, getItem, itemName } from './items.js';
import { MOBS } from './entities.js';
import { GAMEMODES } from './player.js';

const HELP = [
  '/gamemode <survival|creative|adventure|spectator>  (alias /gm s|c|a|sp)', '/time set <day|noon|night|midnight|ticks> | /time add <ticks>', '/weather <clear|rain|thunder>',
  '/difficulty <peaceful|easy|normal|hard>', '/give <item> [count]', '/tp <x> <y> <z> | /tp spawn', '/summon <mob> [x y z]', '/setblock <x> <y> <z> <block>',
  '/fill <x1> <y1> <z1> <x2> <y2> <z2> <block>', '/kill [@e]', '/clear', '/xp <amount> | /xp <levels>L', '/heal', '/effect <poison|regen|fireRes|speed|strength|clear> [seconds]',
  '/spawnpoint', '/seed', '/locate <biome|village>', '/dimension <overworld|nether|end>', '/help',
];

export function runCommand(game, line) {
  const parts = line.slice(1).trim().split(/\s+/); const cmd = parts[0].toLowerCase(); const a = parts.slice(1);
  const p = game.player, w = game.world; const say = (m) => game.ui.chatMessage(m, '#ffff55'); const err = (m) => game.ui.chatMessage(m, '#ff5555');
  if (!game.cheats && !['help', 'seed', 'locate'].includes(cmd)) return err('Cheats are not enabled in this world');
  const num = (s, rel) => { if (s === undefined) return NaN; if (s[0] === '~') return rel + (s.length > 1 ? parseFloat(s.slice(1)) : 0); return parseFloat(s); };
  try {
    switch (cmd) {
      case 'help': HELP.forEach(h => say(h)); break;
      case 'gamemode': case 'gm': { const m = { s: 'survival', c: 'creative', a: 'adventure', sp: 'spectator', '0': 'survival', '1': 'creative', '2': 'adventure', '3': 'spectator' }[a[0]] || a[0]; if (!GAMEMODES.includes(m)) return err('Unknown game mode'); p.setGamemode(m); say('Set own game mode to ' + m); break; }
      case 'time': { if (a[0] === 'set') { const v = { day: 1000, noon: 6000, night: 13000, midnight: 18000, sunrise: 23000 }[a[1]] ?? parseInt(a[1]); if (isNaN(v)) return err('Bad time'); game.time = Math.floor(game.time / 24000) * 24000 + v; say('Set the time to ' + v); } else if (a[0] === 'add') { game.time += parseInt(a[1]) || 0; say('Added time'); } else if (a[0] === 'query') say('Time: ' + Math.floor(game.time % 24000) + ' (day ' + Math.floor(game.time / 24000) + ')'); else return err('Usage: /time set|add|query'); break; }
      case 'weather': { const t = a[0]; if (t === 'clear') game.setWeather(false, false); else if (t === 'rain') game.setWeather(true, false); else if (t === 'thunder') game.setWeather(true, true); else return err('clear|rain|thunder'); say('Weather set to ' + t); break; }
      case 'difficulty': { const d = { peaceful: 0, easy: 1, normal: 2, hard: 3, p: 0, e: 1, n: 2, h: 3, '0': 0, '1': 1, '2': 2, '3': 3 }[a[0]]; if (d === undefined) return err('peaceful|easy|normal|hard'); game.difficulty = d; say('Difficulty set to ' + ['Peaceful', 'Easy', 'Normal', 'Hard'][d]); break; }
      case 'give': { if (!a[0]) return err('Usage: /give <item> [count]'); let id; try { id = resolveId(a[0].replace(/^minecraft:/, '')); } catch { return err('Unknown item: ' + a[0]); } const n = parseInt(a[1]) || 1; p.give(makeStack(id, n)); say('Gave ' + n + ' ' + itemName(id)); break; }
      case 'tp': case 'teleport': { if (a[0] === 'spawn') { const s = p.bedSpawn || p.spawn; p.x = s.x; p.y = s.y; p.z = s.z; say('Teleported to spawn'); break; } const x = num(a[0], p.x), y = num(a[1], p.y), z = num(a[2], p.z); if ([x, y, z].some(isNaN)) return err('Usage: /tp <x> <y> <z>'); p.x = x; p.y = y; p.z = z; p.vx = p.vy = p.vz = 0; p.fallStart = null; say(`Teleported to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`); break; }
      case 'summon': { const t = (a[0] || '').replace(/^minecraft:/, ''); if (!MOBS[t]) return err('Unknown mob. Mobs: ' + Object.keys(MOBS).join(', ')); const x = num(a[1], p.x) || p.x + p.lookDir[0] * 3, y = num(a[2], p.y) || p.y, z = num(a[3], p.z) || p.z + p.lookDir[2] * 3; game.entities.spawnMob(t, x, y, z); say('Summoned ' + t); break; }
      case 'setblock': { const x = Math.floor(num(a[0], p.x)), y = Math.floor(num(a[1], p.y)), z = Math.floor(num(a[2], p.z)); const id = B[a[3]]; if (id === undefined) return err('Unknown block'); w.setBlock(x, y, z, id, parseInt(a[4]) || 0); say('Block placed'); break; }
      case 'fill': { const c = a.slice(0, 6).map((s, i) => Math.floor(num(s, [p.x, p.y, p.z][i % 3]))); if (c.some(isNaN)) return err('Usage: /fill x1 y1 z1 x2 y2 z2 block'); const id = B[a[6]]; if (id === undefined) return err('Unknown block'); const [x1, y1, z1, x2, y2, z2] = c; const vol = (Math.abs(x2 - x1) + 1) * (Math.abs(y2 - y1) + 1) * (Math.abs(z2 - z1) + 1); if (vol > 32768) return err('Too many blocks (max 32768)'); let n = 0; for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) { if (w.setBlock(x, y, z, id, 0, { noUpdate: true })) n++; } say('Filled ' + n + ' blocks'); break; }
      case 'kill': { if (a[0] === '@e') { let n = 0; for (const e of game.entities.list) { if (e.hurt) { e.hurt(9999, null); n++; } else e.remove(); } say('Killed ' + n + ' entities'); } else { p.health = 0; p.die(null, { void: false }); } break; }
      case 'clear': { p.inventory.clear(); game.ui.invalidateInventory(); say('Cleared inventory'); break; }
      case 'xp': case 'experience': { const s = a[0] || '0'; if (s.endsWith('L') || s.endsWith('l')) { p.setLevel(Math.max(0, p.level + parseInt(s))); say('Levels: ' + p.level); } else { p.addXP(parseInt(s) || 0); say('Gave ' + s + ' xp'); } break; }
      case 'heal': p.health = p.maxHealth; p.hunger = 20; p.saturation = 10; p.fire = 0; say('Healed'); break;
      case 'effect': { const e = a[0]; const secs = parseInt(a[1]) || 30; if (e === 'clear') { for (const k of Object.keys(p.effects)) p.effects[k] = 0; say('Effects cleared'); break; } if (!(e in p.effects)) return err('Effects: ' + Object.keys(p.effects).join(', ') + ', clear'); p.effects[e] = e === 'absorption' ? secs : secs; say('Applied ' + e); break; }
      case 'spawnpoint': p.spawn = { x: p.x, y: p.y, z: p.z, dim: w.dim }; p.bedSpawn = null; say('Spawn point set'); break;
      case 'seed': say('Seed: ' + game.seed); break;
      case 'locate': { const target = a[0]; if (!target) return err('Usage: /locate <biome name|village>'); const g = w.gen; let best = null; for (let r = 0; r < 60 && !best; r++) { for (let i = 0; i < 24; i++) { const ang = i / 24 * Math.PI * 2; const x = Math.floor(p.x + Math.cos(ang) * r * 32), z = Math.floor(p.z + Math.sin(ang) * r * 32); const bm = g.biomeAt(x, z); if (bm.id === target || (target === 'village' && bm.village && Math.random() < 0.1)) { best = [x, z]; break; } } } if (best) say(`Nearest ${target}: ${best[0]}, ~, ${best[1]}  (${Math.round(Math.hypot(best[0] - p.x, best[1] - p.z))} blocks away)`); else err('Could not find ' + target + ' nearby'); break; }
      case 'dimension': case 'dim': { const d = { overworld: 0, nether: 1, end: 2, the_end: 2 }[a[0]]; if (d === undefined) return err('overworld|nether|end'); game.changeDimension(d); break; }
      case 'fly': p.flying = !p.flying; say('Flying: ' + p.flying); break;
      case 'say': game.ui.chatMessage('[Server] ' + a.join(' ')); break;
      default: err('Unknown command. Type /help');
    }
  } catch (e) { console.error(e); err('Command failed: ' + e.message); }
}
