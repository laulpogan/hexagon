# C3 render agent — patch notes for the shell agent (main.js/hud.js/sound.js)

I own render/scene.js exclusively tonight. Everything below is a hookup I need
but can't land myself (file ownership). scene.js feature-detects every one of
these — none is required for the renderer to run without errors; each just
goes unused until wired.

## 1. V3 placement preview — `renderer.setPreviewTile(tile)`

Needed so the hover-preview (floating delta chips, would-become-capturable
rings, resulting-number badge) knows which hand card is selected. Call it
wherever the selected hand index changes — in main.js that's inside
`hud.onSelectTile`, right where `hud.selectedIndex` is set:

```js
hud.onSelectTile = (i) => {
  hud.selectedIndex = i;
  const card = i !== null && game.hands[game.currentPlayer][i];
  renderer.setPreviewTile(card && card.kind !== 'rite' ? card : null);
  ...
```

Also clear it when a placement resolves (selection already gets nulled in
`handleClick` right after a successful placement) — add one line next to
`hud.selectedIndex = null;` in `handleClick`:

```js
hud.selectedIndex = null;
renderer.setPreviewTile(null);
```

Without this call, scene.js just never previews — no error, no dead code path
hit. `tile` should be the raw object from `game.hands[...]` (needs `.id`,
matched against the clone's hand by id — do not pass a copy).

## 2. V8 — `sound.perfectCapture()` chime

scene.js calls `this.onWow && this.onWow(kind)` from render/scene.js's
`_animate()` drop-landing handler, where `kind` is `'first-blood'` (the
game's very first capture) or `'multi-capture'` (a capture that flips ≥2
enemy badges to capturable in the same action). Right now `renderer.onWow`
is `null` — nothing fires until you wire it. Suggested hookup, next to the
other `renderer.on*` assignments in `startGame()`:

```js
renderer.onWow = (kind) => sound.perfectCapture();
```

And in ui/sound.js, a new method alongside the existing ones (I'd suggest a
single bright ascending chime, distinct from `capture()`'s descending
sawtooth — it should read as *rare*, not routine):

```js
perfectCapture() { this.chord([784, 987.77, 1318.51, 1567.98], 0.35, 0.07); }
```

One rare, unmistakable spike per spec (V8/Dorfromantik steal) — don't call it
from anywhere else.

## 3. Win-screen reward strip

Nothing needed from me — B11/NIGHT_PLAN confirms `ui/hud.js` (shell-owned)
already has `showRewardStrip`. No render hookup exists or is planned.

## 4. HUD banner text for THE RIFT STIRS

`game.riftStirs` (`{active, upcoming, pulseStrength, nextFireTurn,
firedAtTurn}`, from core/mechanics.js `onTurnStart`) is the source of truth.
scene.js reads it directly for the 3D telegraph/eruption — it doesn't own any
HUD text. If you want a banner ("THE RIFT STIRS — 2 turns" / "THE RIFT
STIRS!"), read the same field from `hud.render()` or wherever hud.js pulls
per-turn state; no scene.js API needed for this, `game.riftStirs` is already
public.

## 5. V6/V7 environment manifest contract (for whoever writes it — media or C2)

scene.js feature-detects `./assets/models/env/manifest.json` on boot (one
fetch, cached module-wide). Absent tonight — confirmed via `ls
assets/models/env/` (directory doesn't exist) — so every prop is the
primitive fallback (deterministic dark cone shards for rubble; no perimeter
GLBs attempted, per C2v "V7 FIRST CUT"). If the manifest lands later, this is
the shape scene.js expects:

```json
{ "rubble": ["shard_a.glb", "shard_b.glb", ...] }
```

Paths are resolved as `./assets/models/env/<entry>`, loaded via the already-
vendored `vendor/jsm/loaders/GLTFLoader.js` (L2), and picked deterministically
per cell (hash of col/row, no `Math.random`). A `perimeter` key isn't
consumed yet — V7 perimeter props were cut for time (see report); the close
backdrop band (`assets/backdrop_close.jpg`) shipped instead. If perimeter
GLBs show up, they're not wired — flag it and I (or whoever picks this back
up) can add the scatter using the same GLTFLoader path already vendored.

## 6. Nothing else needed

`render/scene.js` reads `core/game.js`/`core/config.js`/`core/mechanics.js`
directly (already-public API: `Game.clone()`, `relativeInfluence()`,
`isCapturable()`, `riftStirs`, `cell.stack`/`cell.rubble`) — no other core or
main.js changes are required for anything I built tonight.
