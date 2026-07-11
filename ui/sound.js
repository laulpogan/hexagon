// WebAudio synth SFX — carried from the original game (music cut from v1).
class SoundSystem {
  constructor() {
    this.enabled = true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.ctx = null;
      this.enabled = false;
    }
    try {
      if (localStorage.getItem('limen_sound') === 'false') this.enabled = false;
    } catch {}
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('limen_sound', String(this.enabled)); } catch {}
    return this.enabled;
  }

  _ok() {
    if (!this.enabled || !this.ctx) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  tone(freq, dur, type = 'sine', vol = 0.08) {
    if (!this._ok()) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.type = type;
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + dur);
  }

  chord(freqs, dur, vol = 0.06) {
    freqs.forEach((f, i) => setTimeout(() => this.tone(f, dur, 'sine', vol), i * 50));
  }

  place()      { this.tone(800, 0.1, 'square', 0.05); setTimeout(() => this.tone(1000, 0.1, 'square', 0.03), 50); }
  capture()    { this.tone(600, 0.2, 'sawtooth', 0.07); setTimeout(() => this.tone(400, 0.2, 'sawtooth', 0.05), 100); setTimeout(() => this.tone(300, 0.2, 'sawtooth', 0.03), 200); }
  turnSwitch() { this.chord([523.25, 659.25, 783.99], 0.3, 0.05); }
  error()      { this.tone(200, 0.3, 'sawtooth', 0.04); }
  ward()       { this.chord([880, 1108.7], 0.25, 0.05); }
  rift()       { this.tone(140, 0.5, 'sawtooth', 0.04); this.tone(147, 0.5, 'sawtooth', 0.04); }
  unlock()     { this.chord([659.25, 830.61, 987.77, 1318.51], 0.4, 0.06); }
  victory()    {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'sine', 0.08), i * 150));
    setTimeout(() => this.chord([1046.5, 1318.51, 1567.98], 0.5, 0.06), 600);
  }
}

export const sound = new SoundSystem();
