// ============================================================
// BLOXVERSE engine — SFX: everything synthesized with WebAudio.
// No audio files, no downloads — retro-arcade original sounds.
// ============================================================

class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.5;
    this._noiseBuf = null;
    // resume/creation must happen on a user gesture
    const boot = () => { this.#ensure(); };
    window.addEventListener('pointerdown', boot, { once: true });
    window.addEventListener('keydown', boot, { once: true });
    window.addEventListener('touchstart', boot, { once: true });
  }

  #ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  #env(gain, t0, attack, peak, decay) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  #osc(type, freq, t0, dur, peak = 0.3, freqEnd = null, dest = null) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    this.#env(g, t0, 0.005, peak, dur);
    o.connect(g).connect(dest || this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  #noise(t0, dur, peak = 0.3, filterFreq = 1000, type = 'lowpass', freqEnd = null) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t0);
    if (freqEnd != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + dur);
    const g = this.ctx.createGain();
    this.#env(g, t0, 0.004, peak, dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  play(name, opt = {}) {
    if (!this.#ensure()) return;
    const t = this.ctx.currentTime + 0.001;
    const v = opt.volume ?? 1;
    switch (name) {
      case 'click': this.#osc('square', 880, t, 0.05, 0.12 * v); break;
      case 'hover': this.#osc('sine', 660, t, 0.04, 0.06 * v); break;
      case 'punch': {
        this.#noise(t, 0.09, 0.5 * v, 420, 'lowpass', 90);
        this.#osc('sine', 150, t, 0.09, 0.45 * v, 55);
        break;
      }
      case 'whoosh': this.#noise(t, 0.16, 0.22 * v, 900, 'bandpass', 2400); break;
      case 'hit': { // taking damage
        this.#osc('square', 220, t, 0.1, 0.2 * v, 110);
        this.#noise(t, 0.08, 0.3 * v, 800, 'lowpass', 200);
        break;
      }
      case 'oof': { // the downfall sting
        this.#osc('triangle', 480, t, 0.16, 0.35 * v, 180);
        this.#osc('triangle', 240, t + 0.05, 0.2, 0.3 * v, 90);
        break;
      }
      case 'shoot_ar': {
        this.#noise(t, 0.07, 0.4 * v, 2600, 'bandpass', 400);
        this.#osc('square', 190, t, 0.05, 0.28 * v, 80);
        break;
      }
      case 'shoot_shotgun': {
        this.#noise(t, 0.22, 0.6 * v, 1400, 'lowpass', 120);
        this.#osc('sawtooth', 120, t, 0.16, 0.4 * v, 45);
        break;
      }
      case 'shoot_sniper': {
        this.#noise(t, 0.3, 0.5 * v, 3200, 'bandpass', 200);
        this.#osc('sawtooth', 220, t, 0.24, 0.35 * v, 50);
        break;
      }
      case 'shoot_pistol': {
        this.#noise(t, 0.06, 0.35 * v, 2000, 'bandpass', 500);
        this.#osc('square', 260, t, 0.04, 0.22 * v, 120);
        break;
      }
      case 'reload': {
        this.#osc('square', 500, t, 0.04, 0.14 * v);
        this.#osc('square', 380, t + 0.16, 0.04, 0.14 * v);
        this.#osc('square', 640, t + 0.34, 0.05, 0.16 * v);
        break;
      }
      case 'explosion': {
        this.#noise(t, 0.7, 0.8 * v, 900, 'lowpass', 60);
        this.#osc('sine', 90, t, 0.55, 0.6 * v, 30);
        break;
      }
      case 'dash': this.#noise(t, 0.2, 0.3 * v, 600, 'bandpass', 3000); break;
      case 'charge': this.#osc('sawtooth', 140, t, 0.7, 0.2 * v, 800); break;
      case 'blast': {
        this.#osc('sawtooth', 700, t, 0.35, 0.4 * v, 90);
        this.#noise(t, 0.4, 0.5 * v, 2200, 'lowpass', 150);
        break;
      }
      case 'awaken': {
        this.#osc('sawtooth', 80, t, 1.2, 0.35 * v, 500);
        this.#osc('sine', 160, t + 0.2, 1.0, 0.3 * v, 640);
        this.#noise(t + 0.3, 0.9, 0.25 * v, 400, 'bandpass', 4000);
        break;
      }
      case 'jump': this.#noise(t, 0.05, 0.06 * v, 500, 'bandpass', 1200); break;
      case 'coin': {
        this.#osc('square', 990, t, 0.07, 0.18 * v);
        this.#osc('square', 1320, t + 0.07, 0.16, 0.18 * v);
        break;
      }
      case 'cash': {
        this.#osc('square', 1050, t, 0.05, 0.16 * v);
        this.#osc('square', 1400, t + 0.06, 0.05, 0.16 * v);
        this.#osc('square', 1870, t + 0.12, 0.12, 0.18 * v);
        break;
      }
      case 'buy': {
        this.#osc('triangle', 520, t, 0.08, 0.22 * v);
        this.#osc('triangle', 780, t + 0.09, 0.14, 0.22 * v);
        break;
      }
      case 'error': this.#osc('square', 160, t, 0.18, 0.25 * v, 120); break;
      case 'checkpoint': {
        this.#osc('triangle', 620, t, 0.09, 0.25 * v);
        this.#osc('triangle', 930, t + 0.1, 0.09, 0.25 * v);
        this.#osc('triangle', 1240, t + 0.2, 0.2, 0.28 * v);
        break;
      }
      case 'win': {
        [523, 659, 784, 1046].forEach((f, i) => this.#osc('triangle', f, t + i * 0.13, 0.22, 0.25 * v));
        break;
      }
      case 'lose': {
        [392, 330, 262, 196].forEach((f, i) => this.#osc('triangle', f, t + i * 0.16, 0.24, 0.22 * v));
        break;
      }
      case 'growl': {
        this.#osc('sawtooth', 90 + Math.random() * 40, t, 0.5, 0.2 * v, 60);
        this.#noise(t, 0.4, 0.15 * v, 300, 'lowpass', 100);
        break;
      }
      case 'zombiehit': {
        this.#noise(t, 0.12, 0.4 * v, 500, 'lowpass', 100);
        this.#osc('sawtooth', 130, t, 0.1, 0.25 * v, 60);
        break;
      }
      case 'headshot': {
        this.#osc('square', 1200, t, 0.06, 0.2 * v);
        this.#osc('square', 1800, t + 0.04, 0.08, 0.18 * v);
        break;
      }
      case 'kill': {
        this.#osc('triangle', 880, t, 0.08, 0.22 * v);
        this.#osc('triangle', 1174, t + 0.08, 0.14, 0.22 * v);
        break;
      }
      case 'place': this.#osc('square', 340, t, 0.07, 0.2 * v, 500); break;
      case 'rotate': this.#osc('square', 520, t, 0.04, 0.12 * v); break;
      case 'sell': this.#osc('square', 500, t, 0.12, 0.18 * v, 250); break;
      case 'eat': {
        this.#noise(t, 0.08, 0.18 * v, 700, 'lowpass');
        this.#noise(t + 0.14, 0.08, 0.18 * v, 600, 'lowpass');
        break;
      }
      case 'sleep': this.#osc('sine', 300, t, 0.5, 0.12 * v, 200); break;
      case 'shower': this.#noise(t, 0.6, 0.12 * v, 3000, 'highpass'); break;
      case 'doorbell': {
        this.#osc('sine', 660, t, 0.25, 0.2 * v);
        this.#osc('sine', 520, t + 0.25, 0.35, 0.2 * v);
        break;
      }
      case 'tick': this.#osc('square', 1000, t, 0.025, 0.1 * v); break;
      case 'firework': {
        this.#noise(t, 0.5, 0.4 * v, 2500, 'lowpass', 200);
        this.#osc('triangle', 1500 + Math.random() * 800, t + 0.05, 0.3, 0.15 * v, 300);
        break;
      }
      case 'wave': {
        this.#osc('sawtooth', 110, t, 0.9, 0.28 * v, 220);
        this.#osc('sawtooth', 165, t + 0.15, 0.8, 0.2 * v, 330);
        break;
      }
      case 'medkit': {
        this.#osc('triangle', 700, t, 0.1, 0.2 * v);
        this.#osc('triangle', 1050, t + 0.12, 0.18, 0.2 * v);
        break;
      }
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
}

export const sfx = new SFX();
