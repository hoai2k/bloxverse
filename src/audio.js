// Procedural WebAudio sound effects (no audio files).
export class Audio {
  constructor() { this.ctx = null; this.volume = 0.6; this.musicVolume = 0.3; this.enabled = true; this.lastStep = 0; this.musicTimer = 0; }
  ensure() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination); } catch (e) { this.enabled = false; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  noise(dur, freq, q, gain, type = 'bandpass', decay = true) {
    if (!this.enabled || !this.ctx) return; const c = this.ctx;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, c.currentTime); if (decay) g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(); src.stop(c.currentTime + dur);
  }
  tone(freq, dur, type = 'square', gain = 0.1, slide = 0) {
    if (!this.enabled || !this.ctx) return; const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, c.currentTime); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur);
  }
  play(name, opts = {}) {
    if (!this.enabled || !this.ctx) return; if (this.ctx.state === 'suspended') this.ctx.resume();
    const vol = (opts.volume ?? 1);
    const dist = opts.dist ?? 0; const att = Math.max(0, 1 - dist / 24); if (att <= 0) return;
    const g = vol * att;
    switch (name) {
      case 'step_stone': this.noise(0.08, 900 + Math.random() * 300, 1, 0.25 * g); break;
      case 'step_grass': this.noise(0.1, 500 + Math.random() * 200, 0.8, 0.22 * g, 'lowpass'); break;
      case 'step_wood': this.tone(180 + Math.random() * 40, 0.07, 'triangle', 0.15 * g); this.noise(0.05, 700, 1, 0.1 * g); break;
      case 'step_sand': case 'step_gravel': this.noise(0.12, 1800 + Math.random() * 400, 0.5, 0.2 * g, 'highpass'); break;
      case 'step_snow': case 'step_cloth': this.noise(0.1, 400, 0.5, 0.15 * g, 'lowpass'); break;
      case 'step_glass': case 'step_metal': this.tone(1200 + Math.random() * 300, 0.05, 'sine', 0.08 * g); break;
      case 'step_water': this.noise(0.15, 1200, 0.7, 0.15 * g); break;
      case 'dig': this.noise(0.06, 600 + Math.random() * 400, 1.2, 0.12 * g); break;
      case 'break': this.noise(0.18, 400 + Math.random() * 300, 0.8, 0.35 * g, 'lowpass'); this.noise(0.1, 2000, 1, 0.15 * g, 'highpass'); break;
      case 'place': this.noise(0.08, 500 + Math.random() * 200, 1, 0.3 * g, 'lowpass'); this.tone(120, 0.06, 'triangle', 0.1 * g); break;
      case 'hurt': this.tone(220, 0.15, 'sawtooth', 0.15 * g, -120); this.noise(0.1, 800, 1, 0.1 * g); break;
      case 'death': this.tone(200, 0.6, 'sawtooth', 0.2 * g, -150); break;
      case 'hit': this.noise(0.08, 300, 1, 0.3 * g, 'lowpass'); this.tone(90, 0.1, 'square', 0.1 * g); break;
      case 'eat': this.noise(0.12, 900, 0.6, 0.15 * g, 'bandpass'); break;
      case 'burp': this.tone(120, 0.25, 'sawtooth', 0.12 * g, -40); break;
      case 'pop': this.tone(600, 0.06, 'sine', 0.12 * g, 400); break;
      case 'levelup': this.tone(660, 0.12, 'square', 0.08 * g); setTimeout(() => this.tone(880, 0.12, 'square', 0.08 * g), 90); setTimeout(() => this.tone(1320, 0.25, 'square', 0.08 * g), 180); break;
      case 'orb': this.tone(1400 + Math.random() * 800, 0.08, 'sine', 0.06 * g); break;
      case 'click': this.tone(800, 0.03, 'square', 0.06 * g); break;
      case 'explode': this.noise(0.9, 150, 0.5, 0.9 * g, 'lowpass'); this.tone(60, 0.5, 'sine', 0.4 * g, -40); break;
      case 'fuse': this.noise(0.2, 3000, 2, 0.15 * g, 'highpass'); break;
      case 'bow': this.noise(0.15, 1500, 1, 0.2 * g, 'bandpass'); this.tone(400, 0.08, 'triangle', 0.05 * g, 200); break;
      case 'arrow_hit': this.tone(700, 0.05, 'square', 0.08 * g); break;
      case 'zombie': this.tone(90 + Math.random() * 30, 0.5, 'sawtooth', 0.12 * g, -30); break;
      case 'zombie_hurt': this.tone(140, 0.25, 'sawtooth', 0.12 * g, -60); break;
      case 'skeleton': this.noise(0.15, 2500, 3, 0.15 * g, 'bandpass'); setTimeout(() => this.noise(0.1, 3000, 3, 0.12 * g), 80); break;
      case 'creeper': this.noise(1.2, 4000, 1, 0.25 * g, 'highpass', false); break;
      case 'spider': this.noise(0.2, 1800, 2, 0.12 * g, 'bandpass'); break;
      case 'enderman': this.tone(300, 0.3, 'sine', 0.1 * g, -200); this.noise(0.3, 200, 1, 0.1 * g); break;
      case 'cow': this.tone(140, 0.5, 'sawtooth', 0.12 * g, 30); break;
      case 'pig': this.tone(320, 0.18, 'square', 0.08 * g, -100); break;
      case 'sheep': this.tone(420, 0.35, 'sawtooth', 0.08 * g, 60); break;
      case 'chicken': this.tone(900, 0.1, 'square', 0.06 * g, -300); break;
      case 'wolf': this.tone(500, 0.15, 'sawtooth', 0.1 * g, -200); break;
      case 'villager': this.tone(250, 0.2, 'triangle', 0.1 * g, 80); break;
      case 'ghast': this.tone(600, 0.8, 'sine', 0.12 * g, -300); break;
      case 'slime': this.noise(0.15, 300, 0.7, 0.2 * g, 'lowpass'); break;
      case 'splash': this.noise(0.3, 1000, 0.6, 0.35 * g, 'bandpass'); break;
      case 'lava': this.noise(0.3, 200, 0.5, 0.2 * g, 'lowpass'); break;
      case 'fire': this.noise(0.4, 2500, 0.5, 0.06 * g, 'highpass'); break;
      case 'door': this.tone(200, 0.08, 'square', 0.1 * g); this.noise(0.05, 900, 1, 0.1 * g); break;
      case 'chest': this.tone(160, 0.12, 'triangle', 0.12 * g, 40); break;
      case 'thunder': this.noise(1.5, 120, 0.5, 0.7 * g, 'lowpass'); break;
      case 'portal': this.tone(200, 1.2, 'sine', 0.15 * g, 400); break;
      case 'anvil': this.tone(1500, 0.3, 'sine', 0.15 * g); break;
      case 'shear': this.noise(0.1, 4000, 2, 0.15 * g, 'highpass'); break;
      case 'bucket': this.noise(0.2, 700, 0.8, 0.25 * g, 'bandpass'); break;
      case 'furnace': this.noise(0.15, 800, 0.5, 0.05 * g, 'lowpass'); break;
      case 'note': this.tone(opts.freq || 440, 0.4, 'triangle', 0.15 * g); break;
      case 'teleport': this.tone(800, 0.25, 'sine', 0.12 * g, -600); break;
      case 'drink': this.noise(0.25, 600, 0.6, 0.12 * g); break;
      case 'totem': this.tone(440, 0.4, 'square', 0.1 * g, 300); setTimeout(() => this.tone(880, 0.5, 'square', 0.1 * g), 200); break;
      case 'dragon': this.tone(80, 1.2, 'sawtooth', 0.25 * g, 60); this.noise(1, 300, 0.5, 0.2 * g, 'lowpass'); break;
      default: break;
    }
  }
  // Gentle ambient music: random arpeggios in a pentatonic scale
  updateMusic(dt, night) {
    if (!this.enabled || !this.ctx || this.musicVolume <= 0) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 3 + Math.random() * 6;
    const scale = night ? [220, 261.6, 293.7, 349.2, 392] : [261.6, 293.7, 329.6, 392, 440, 523.3];
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) setTimeout(() => this.tone(scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.3 ? 0.5 : 1), 2.5, 'sine', 0.03 * this.musicVolume), i * 450);
  }
}
