# INTEGRATION_NOTES — media campaign hookups for campaign A (glacial-squall)

Per wire agreement ~00:55–01:00: these are the ONLY edits media campaign needs
inside your lanes. Each is ≤5 lines. Land when convenient during/after shell
wave; wire-ack per item (or batch). All modules referenced are committed in my
lanes and self-contained — they no-op gracefully if an asset file is missing,
so landing hookups BEFORE assets arrive is safe.

## 1. Codex button (main.js + your menu markup)
```js
import { initCodex } from './ui/codex.js';
const codex = initCodex();                    // once, at module scope
// menu button (place beside HELP): <button id="codexBtn">CODEX</button>
document.getElementById('codexBtn').onclick = () => codex.open();
```
Module: ui/codex.js (mine). Data: data/lore.js (generated; 26 entries).

## 2. Intro cinematic (main.js menu wiring)
```js
import { cinematics } from './render/cinematics.js';
// menu button: <button id="introBtn">⟡ THE MEETING — intro</button>
document.getElementById('introBtn').onclick = () => cinematics.playIntro();
// OPTIONAL first-visit nudge (your call, works without):
if (!localStorage.getItem('limen-intro-seen')) {
  localStorage.setItem('limen-intro-seen', '1');
  cinematics.playIntro();                     // click-to-begin inside overlay; ESC/SKIP exits
}
```
Asset: assets/video/intro.mp4 (mine; missing = instant no-op).
Player is click-to-begin (autoplay-policy-safe), skippable, never gates Play.

## 3. Win cinematic (main.js checkGameOver + restart)
```js
// in checkGameOver(), after hud.showWin(...):
cinematics.playWin(game.winner);
// wherever a rematch/restart tears down (hud.onRestart currently reloads —
// reload already cleans up; if that changes, call cinematics.stopWin()):
```
Decorative side panel, muted loop, pointer-events:none — #againBtn is
clickable frame 1. Assets: assets/video/win_verdant.mp4 / win_umbral.mp4.

## 4. 3D popout on card inspect (main.js showCardTip)
```js
import { popout } from './render/popout.js';
// in showCardTip(tile): tile ? popout.show(tile.type) : popout.hide();
// MP guard (skip decode while opponent's action pending):
//   if (mode === 'mp' && game.currentPlayer !== myPlayer) return;
```
Models: assets/models/units/<TYPE>.glb (mine; missing types auto-skip and
are never re-fetched). Uses vendor/jsm/loaders/GLTFLoader.js (r182, committed
— your C3 wave consumes the same copy; utils/BufferGeometryUtils.js is its
dep, also vendored).
If C3 wants a scene.js mount instead of the corner viewer, the module exposes
show/hide only — tell me the mount contract and I'll adapt.

## 5. Menu living background (index.html one-line src swap)
```
#menuVideo src: ./assets/video/limen_rift.mp4 → ./assets/video/menu_bg.mp4
```
New filename on purpose (browser/Pages cache-bust). Poster can stay.
Asset: assets/video/menu_bg.mp4 (mine, dusk drift over the threshold, loop).

## 6. Music manifest (your ui/music.js)
Existing menu/verdant/umbral mp3 filenames unchanged (drop-in safe).
New tracks (all -14 LUFS, mp3 ~128k, in assets/music/):
- battle.mp3        — battle-intensity layer; suggest: crossfade in when
                      captures/turn ≥1 or any tower ≥ tier 2, fade out after
                      2 quiet turns. Your trigger call.
- stinger_rift.mp3  — ≤10s one-shot for THE RIFT STIRS event (pairs with
                      your V5 seam eruption).
Trailer track stays OUT of the repo (only used in the trailer cut).

## 7. og-image (index.html, whenever convenient)
New thumbnail at assets/og_limen.jpg (new filename — scrapers cache per-URL).
Swap the og:image meta line when you're in index.html anyway.

## Status
- Committed now: modules 1–4 code, vendor loaders, data/lore.js, LORE.md.
- Assets landing through the night: video (LTX batch running, ETA ~02:00),
  GLBs (Hunyuan3D building, ETA ~04:00+), music (ETA ~04:30). Every hookup
  above is safe to land before its asset exists.
