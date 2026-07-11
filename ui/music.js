// Soundtrack — MusicGen-small tracks generated on the DGX Spark (2026-07-10).
// menu / verdant / umbral, ~30s seamless-ish loops. Browser autoplay policy
// means playback starts on the first user gesture.
const TRACKS = { menu: './assets/music/menu.mp3', verdant: './assets/music/verdant.mp3', umbral: './assets/music/umbral.mp3' };

class Music {
  constructor() {
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.volume = 0.35;
    this.current = null;
    this.enabled = true;
    try { if (localStorage.getItem('limen_music') === 'false') this.enabled = false; } catch {}
  }

  play(name) {
    this.current = name;
    if (!this.enabled || !TRACKS[name]) return;
    if (!this.audio.src.endsWith(TRACKS[name].slice(1))) this.audio.src = TRACKS[name];
    this.audio.play().catch(() => {}); // pre-gesture rejection is fine — retried on next play()
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('limen_music', String(this.enabled)); } catch {}
    if (!this.enabled) this.audio.pause();
    else if (this.current) this.play(this.current);
    return this.enabled;
  }
}

export const music = new Music();
