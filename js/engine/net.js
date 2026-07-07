// ============================================================
// BLOXVERSE engine — net: online multiplayer via InstantDB.
//
// Design: presence-based sync (each client owns its character and
// publishes state ~10Hz into a per-game room), topics for events
// (chat / damage / deaths), victim-authoritative damage, and a
// host-authoritative co-op horde for Zombies.
//
// Everything here is OPTIONAL and guarded: if the network, the
// vendored SDK, or InstantDB itself is unavailable, every call
// resolves to a safe offline fallback and the games run exactly
// as before (bots only, localStorage accounts).
//
// A BroadcastChannel "mock" transport (localStorage flag
// `bloxverse_netmock`) lets two tabs on the same device play
// together with zero network — used by the automated tests.
// ============================================================

const APP_ID = '96e3e93f-4644-4596-a02f-40e8ae915138';
const PROFILE_CACHE_KEY = 'bloxverse_profiles_cache_v1';
const MOCK_FLAG = 'bloxverse_netmock';
const CONNECT_TIMEOUT = 4000;
const QUERY_TIMEOUT = 3500;

function mockMode() {
  try { return localStorage.getItem(MOCK_FLAG) === '1'; } catch { return false; }
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise((res) => setTimeout(() => res(fallback), ms)),
  ]);
}

// ---------------- connection singleton ----------------
let _initPromise = null;
let _db = null;
let _sdk = null;

export function initNet() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (mockMode()) return { ok: true, mock: true };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false };
    try {
      _sdk = await withTimeout(import('../../vendor/instantdb.js'), CONNECT_TIMEOUT, null);
      if (!_sdk || !_sdk.init) return { ok: false };
      _db = _sdk.init({ appId: APP_ID });
      return { ok: true, mock: false };
    } catch {
      return { ok: false };
    }
  })();
  return _initPromise;
}

export async function netAvailable() {
  const s = await initNet();
  return !!s.ok;
}

// ---------------- profiles (username accounts) ----------------
// Cloud namespace `profiles`: { id, name, avatar (json), blux, createdAt, updatedAt }

function cacheProfiles(list) {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(list.map((p) => ({ id: p.id, name: p.name })))); } catch { }
}
export function cachedProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY)) || []; } catch { return []; }
}

// mock profiles live in localStorage so two tabs share them
function mockProfilesRead() {
  try { return JSON.parse(localStorage.getItem('bv_mock_profiles')) || []; } catch { return []; }
}
function mockProfilesWrite(list) {
  try { localStorage.setItem('bv_mock_profiles', JSON.stringify(list)); } catch { }
}

export async function listProfiles() {
  const s = await initNet();
  if (!s.ok) return { online: false, profiles: cachedProfiles() };
  if (s.mock) return { online: true, profiles: mockProfilesRead() };
  const resp = await withTimeout(_db.queryOnce({ profiles: {} }), QUERY_TIMEOUT, null);
  if (!resp || !resp.data) return { online: false, profiles: cachedProfiles() };
  const profiles = (resp.data.profiles || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  cacheProfiles(profiles);
  return { online: true, profiles };
}

export async function getProfile(name) {
  const s = await initNet();
  if (!s.ok) return null;
  if (s.mock) return mockProfilesRead().find((p) => p.name === name) || null;
  const resp = await withTimeout(
    _db.queryOnce({ profiles: { $: { where: { name } } } }), QUERY_TIMEOUT, null);
  return resp?.data?.profiles?.[0] || null;
}

export async function createProfile(name, data = {}) {
  const s = await initNet();
  if (!s.ok) return { ok: false, offline: true };
  const existing = await getProfile(name);
  if (existing) return { ok: false, taken: true };
  if (s.mock) {
    const list = mockProfilesRead();
    const p = { id: 'm' + Math.random().toString(36).slice(2), name, ...data, createdAt: Date.now() };
    list.push(p);
    mockProfilesWrite(list);
    return { ok: true, profile: p };
  }
  try {
    const pid = _sdk.id();
    await _db.transact(_db.tx.profiles[pid].update({ name, ...data, createdAt: Date.now(), updatedAt: Date.now() }));
    return { ok: true, profile: { id: pid, name, ...data } };
  } catch {
    return { ok: false };
  }
}

export async function deleteProfile(name) {
  const s = await initNet();
  if (!s.ok) return false;
  if (s.mock) {
    mockProfilesWrite(mockProfilesRead().filter((p) => p.name !== name));
    return true;
  }
  const p = await getProfile(name);
  if (!p) return false;
  try {
    await _db.transact(_db.tx.profiles[p.id].delete());
    cacheProfiles(cachedProfiles().filter((c) => c.name !== name));
    return true;
  } catch { return false; }
}

// Debounced fire-and-forget profile save (avatar + blux follow you across devices)
let _saveTimer = null;
export function pushProfile(user) {
  if (!user?.name) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const s = await initNet();
    if (!s.ok) return;
    const payload = { avatar: user.avatar, blux: user.blux, updatedAt: Date.now() };
    if (s.mock) {
      const list = mockProfilesRead();
      const p = list.find((x) => x.name === user.name);
      if (p) { Object.assign(p, payload); mockProfilesWrite(list); }
      return;
    }
    try {
      const p = await getProfile(user.name);
      if (p) await _db.transact(_db.tx.profiles[p.id].update(payload));
    } catch { /* best effort */ }
  }, 1200);
}

// ---------------- rooms ----------------
// NetRoom: uniform facade over real InstantDB rooms and the mock transport.
//   publishState(obj)          - throttled presence write (own player state)
//   onPeers(cb)                - cb(Map peerId -> presenceData) on every change
//   sendTopic(name, data)      - fire event to everyone else in the room
//   onTopic(name, cb)          - cb(data, peerId)
//   peerId                     - stable id for this connection
//   peers                      - latest Map
//   leave()

const PUBLISH_HZ = 10;

class RealRoom {
  constructor(db, roomId) {
    this.peerId = 'p' + Math.random().toString(36).slice(2, 10);
    this.room = db.joinRoom('bloxverse', roomId);
    this.peers = new Map();
    this._peerCbs = [];
    this._lastPub = 0;
    this._pending = null;
    this._unsubs = [];
    const un = this.room.subscribePresence({}, (presence) => {
      const map = new Map();
      for (const [k, v] of Object.entries(presence.peers || {})) {
        if (v && v.pid && v.pid !== this.peerId) map.set(v.pid, v);
      }
      this.peers = map;
      this._peerCbs.forEach((cb) => cb(map));
    });
    if (typeof un === 'function') this._unsubs.push(un);
  }
  publishState(obj) {
    const now = performance.now();
    obj.pid = this.peerId;
    if (now - this._lastPub < 1000 / PUBLISH_HZ) { this._pending = obj; return; }
    this._lastPub = now;
    this._pending = null;
    try { this.room.publishPresence(obj); } catch { }
  }
  flushPending() {
    if (this._pending) this.publishState(this._pending);
  }
  onPeers(cb) { this._peerCbs.push(cb); cb(this.peers); }
  sendTopic(name, data) {
    try { this.room.publishTopic(name, { ...data, _from: this.peerId }); } catch { }
  }
  onTopic(name, cb) {
    try {
      const un = this.room.subscribeTopic(name, (event) => cb(event, event?._from));
      if (typeof un === 'function') this._unsubs.push(un);
    } catch { }
  }
  leave() {
    this._unsubs.forEach((u) => { try { u(); } catch { } });
    try { this.room.leaveRoom(); } catch { }
  }
}

// Mock transport: BroadcastChannel between tabs on the same origin.
class MockRoom {
  constructor(roomId) {
    this.peerId = 'p' + Math.random().toString(36).slice(2, 10);
    this.peers = new Map();
    this._peerCbs = [];
    this._topicCbs = new Map();
    this._lastSeen = new Map();
    this._lastPub = 0;
    this._state = null;
    this.ch = new BroadcastChannel('bv-room-' + roomId);
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (!m || m.pid === this.peerId) return;
      if (m.kind === 'presence') {
        this._lastSeen.set(m.pid, performance.now());
        this.peers.set(m.pid, m.data);
        this._notify();
      } else if (m.kind === 'leave') {
        this.peers.delete(m.pid);
        this._notify();
      } else if (m.kind === 'topic') {
        // match the real transport: sender id rides inside the payload
        const data = { ...m.data, _from: m.pid };
        (this._topicCbs.get(m.name) || []).forEach((cb) => cb(data, m.pid));
      } else if (m.kind === 'hello' && this._state) {
        // a new peer asked who's here — answer with our latest state
        this.ch.postMessage({ kind: 'presence', pid: this.peerId, data: this._state });
      }
    };
    this.ch.postMessage({ kind: 'hello', pid: this.peerId });
    // heartbeat + peer timeout
    this._hb = setInterval(() => {
      if (this._state) this.ch.postMessage({ kind: 'presence', pid: this.peerId, data: this._state });
      const now = performance.now();
      let changed = false;
      for (const [pid, t] of this._lastSeen) {
        if (now - t > 3500) { this._lastSeen.delete(pid); this.peers.delete(pid); changed = true; }
      }
      if (changed) this._notify();
    }, 700);
    window.addEventListener('beforeunload', () => this.leave());
  }
  _notify() { this._peerCbs.forEach((cb) => cb(this.peers)); }
  publishState(obj) {
    obj.pid = this.peerId;
    this._state = obj;
    const now = performance.now();
    if (now - this._lastPub < 1000 / PUBLISH_HZ) return;
    this._lastPub = now;
    this.ch.postMessage({ kind: 'presence', pid: this.peerId, data: obj });
  }
  flushPending() { }
  onPeers(cb) { this._peerCbs.push(cb); cb(this.peers); }
  sendTopic(name, data) { this.ch.postMessage({ kind: 'topic', name, pid: this.peerId, data }); }
  onTopic(name, cb) {
    if (!this._topicCbs.has(name)) this._topicCbs.set(name, []);
    this._topicCbs.get(name).push(cb);
  }
  leave() {
    clearInterval(this._hb);
    try { this.ch.postMessage({ kind: 'leave', pid: this.peerId }); this.ch.close(); } catch { }
  }
}

// Join the shared room for a game. Returns null when offline.
export async function joinGameRoom(gameId) {
  const s = await initNet();
  if (!s.ok) return null;
  try {
    if (s.mock) return new MockRoom('game-' + gameId);
    return new RealRoom(_db, 'game-' + gameId);
  } catch {
    return null;
  }
}

// Stable hash for deterministic things like team assignment
export function nameHash(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}
