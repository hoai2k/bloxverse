// Version, update identity and the changelog shown in-game.
//
// Versioning policy:
//   * MAJOR content updates (new biomes, mobs, dimensions, big systems) bump the minor number
//     (1.0 -> 1.1), get a NAME that is shown on the title screen, and get a fresh panorama.
//   * Minor updates (features, fixes, tuning) bump the patch number (1.0 -> 1.0.1) and only
//     add a changelog entry.
// To ship a major update: add an entry with `major: true`, a `name`, and a `panorama`, then
// bump VERSION to match. Everything else (title banner, panorama, update log) follows.

export const CHANGELOG = [
  {
    version: '1.0.1', date: '2026-09-02', major: false,
    changes: [
      'Xbox / gamepad support with full in-game and menu navigation',
      'Local split-screen multiplayer for up to 4 players on one screen',
      'Command auto-complete with argument suggestions in the chat box',
      'Update log and versioning shown on the title screen',
    ],
  },
  {
    version: '1.0', date: '2026-09-01', major: true, name: 'The Foundation',
    panorama: { seed: 20240901, x: 8.5, z: 8.5, height: 9, pitch: -0.12, speed: 0.05 },
    changes: [
      'Infinite voxel world with 26 biomes, caves, ores, villages and dungeons',
      'The Nether and The End with the Ender Dragon boss fight',
      'Survival, Creative, Hardcore, Adventure and Spectator game modes',
      '337 blocks, 227 items, 350 crafting recipes, smelting and enchanting',
      '25 mob types with AI, breeding, taming and villager trading',
      'Day/night cycle, weather, sky light and block light with smooth lighting',
      'Multiple saved worlds in the browser, no downloads and no build step',
    ],
  },
];

export const VERSION = CHANGELOG[0].version;

// The most recent MAJOR update defines the current update name and panorama.
const currentMajor = CHANGELOG.find(c => c.major) || CHANGELOG[CHANGELOG.length - 1];
export const UPDATE_NAME = currentMajor.name || null;
export const UPDATE_VERSION = currentMajor.version;
export const PANORAMA = currentMajor.panorama || { seed: 20240901, x: 8.5, z: 8.5, height: 9, pitch: -0.12, speed: 0.05 };

// True when the running version is newer than the last one the player saw (used to flag the log).
export function hasUnreadUpdate() {
  try { return localStorage.getItem('craftverse.seenVersion') !== VERSION; } catch { return false; }
}
export function markUpdateSeen() { try { localStorage.setItem('craftverse.seenVersion', VERSION); } catch { } }
