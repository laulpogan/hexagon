// Cinematics — intro + win cinematic players. Self-contained DOM; no scene.js
// dependency. Never blocks input the game needs: intro is click-to-begin and
// skippable; win cine is a decorative side panel (rematch stays clickable).
// Hookups in INTEGRATION_NOTES.md.

const INTRO_SRC = './assets/video/intro.mp4';
const WIN_SRC = { 1: './assets/video/win_verdant.mp4', 2: './assets/video/win_umbral.mp4' };

const CSS = `
#introOverlay { position: fixed; inset: 0; z-index: 200; background: #07080c;
  display: flex; justify-content: center; align-items: center; }
#introOverlay video { max-width: 100vw; max-height: 100vh; width: 100%; object-fit: contain; }
#introSkip { position: absolute; bottom: 26px; right: 30px; padding: 9px 20px;
  background: rgba(18,20,28,0.8); color: #cfd6e4; border: 1px solid #3a4152;
  border-radius: 8px; cursor: pointer; font-size: 13px; letter-spacing: 1px; }
#introSkip:hover { border-color: #f2c14e; color: #fff; }
#introBegin { padding: 16px 44px; font-size: 18px; letter-spacing: 3px;
  background: #1d222e; color: #e8e8ee; border: 1px solid #f2c14e; border-radius: 10px; cursor: pointer; }
#winCine { position: fixed; left: 22px; bottom: 90px; width: 300px; z-index: 90;
  border-radius: 12px; overflow: hidden; border: 1px solid #3a4152;
  box-shadow: 0 10px 34px rgba(0,0,0,0.6); opacity: 0; transition: opacity 1.2s; pointer-events: none; }
#winCine.on { opacity: 1; }
#winCine video { display: block; width: 100%; }
`;

let styled = false;
function ensureStyle() {
  if (styled) return;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
  styled = true;
}

// Probe once per src so a missing asset degrades to a silent no-op.
async function available(src) {
  try { return (await fetch(src, { method: 'HEAD' })).ok; } catch { return false; }
}

export const cinematics = {
  // Click-to-begin (autoplay-policy-safe: audio starts on the gesture).
  // onDone always fires exactly once (end, skip, or missing asset).
  async playIntro(onDone) {
    ensureStyle();
    if (!(await available(INTRO_SRC))) { onDone?.(); return; }
    const el = document.createElement('div');
    el.id = 'introOverlay';
    el.innerHTML = `<button id="introBegin">▶ &nbsp;THE MEETING</button>`;
    document.body.appendChild(el);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const v = el.querySelector('video');
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
      el.remove();
      onDone?.();
    };
    el.querySelector('#introBegin').onclick = () => {
      el.innerHTML = `<video src="${INTRO_SRC}" playsinline preload="auto"></video>
        <button id="introSkip">SKIP ▸</button>`;
      const v = el.querySelector('video');
      v.onended = finish;
      v.onerror = finish;
      el.querySelector('#introSkip').onclick = finish;
      v.play().catch(finish);
    };
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esc); finish(); }
    });
  },

  // Decorative side panel next to the win overlay. Muted (no gesture
  // guarantee), looped, pointer-events none — rematch button never waits.
  async playWin(winner) {
    ensureStyle();
    const src = WIN_SRC[winner];
    if (!src || !(await available(src))) return;
    this.stopWin();
    const el = document.createElement('div');
    el.id = 'winCine';
    el.innerHTML = `<video src="${src}" muted loop playsinline autoplay></video>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
  },

  stopWin() {
    const old = document.getElementById('winCine');
    if (old) {
      const v = old.querySelector('video');
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
      old.remove();
    }
  },
};
