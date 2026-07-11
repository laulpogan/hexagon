# Limen — game-dev-review pass (RULES-7, 2026-07-11)

Run of the `game-dev-review` skill (Donchitos-distilled 7-dimension rubric) over the whole repo, one
fresh-eyes reviewer per dimension. Verdicts: PASS / CONCERNS / FAIL. Overall gate = weakest dimension.
Built incrementally as reviewers land (compaction-safe). **Findings are review output, not yet fixed.**

| Dimension | Verdict |
|---|---|
| 1 · Code architecture | **CONCERNS** |
| 2 · Systems & balance | **CONCERNS** (2 HIGH) |
| 3 · Determinism & performance | **PASS / PASS** |
| 4 · Content pipeline & consistency | **CONCERNS** |
| 5 · Testability / debt / gate | **CONCERNS / PASS / PASS** |
| **Overall gate** | **CONCERNS** — no BLOCKER; 2 HIGH balance + 3 MAJOR arch. Ship-safe, fix-list below. |

---

## Dimension 1 — Code architecture: CONCERNS

Core is structurally sound: `core/*` imports only `core/`+`data/` (zero render/ui/net leakage),
`mechanics.js` uses dependency injection (receives `game`, never imports it → no game↔mechanics cycle),
`board`/`config` are leaf modules, `progress↔auth` cycle documented and avoided, renderer reads state
read-only (its one mutation confined to a `clone()`). No circular deps. Debt is at the UI/net boundary
and in `scene.js` size.

| Sev | Location | Defect | Fix |
|---|---|---|---|
| MAJOR | `ui/deckbuilder.js:11,45,141` + `net/auth.js:109-110` | UI issues raw `sb().from('decks')` queries; `decks` logic duplicated in auth; no `net/decks.js` repo. Two sites already diverge. | Add `net/decks.js` (load/save/migrate); callers use it, never `sb().from()` directly. |
| MAJOR | `render/scene.js` (class 244-1405; `_animate` 1192-1404; `_makeTileGroup` 460-598) | `BoardRenderer` god-object; `_animate()` ~210-line inline method running ~10 mutable animation subsystems. | Extract animator registry (`{update(now,dt)}` list) + `TileGroupFactory`; `_animate` = loop over registered systems. |
| MAJOR | `main.js:70-77 projectedInfluence` | **Mutates the live game board** (`cell.tile={...}` then restores) to compute ghost preview — reach-in write; duplicates scene.js:1022-1052 clone-based `_updatePreview`. If `relativeInfluence` throws mid-projection, board keeps the ghost tile → corrupted state. | Delete it; derive ghost from renderer's clone-based preview, or add pure `game.projectInfluence(tile,c,r)` that clones internally. |
| MINOR | `mechanics.js:204,182,83` | Balance magnitudes hardcoded in rules logic vs the "knobs in config only" rule: MENACE min-att `2`, RALLYING_CRY `+1`, FORESIGHT cycle `2` inline (while FLANK is config). | Add `MENACE_MIN_ATTACKERS`, `RALLYING_CRY_BONUS`, `FORESIGHT_CYCLE` to CONFIG. |
| MINOR | `core/bot.js` weights | Greedy heuristic weights all hardcoded; only `BOT_RIFT_NUDGE` extracted (half-done refactor). | Group into `BOT_WEIGHTS` config block or document the boundary. |
| MINOR | `ui/hud.js`,`deckbuilder.js`,`collection.js`,`main.js` | Duplicated `RARITY_COLOR` ×3, `escapeHtml` ×2, `today()` ×2, keyword-chip HTML ×4. | Hoist to `ui/shared.js` + a util `today()`. |
| MINOR | `main.js:151,326,327` | Controller writes HUD fields directly (`hud.selectedIndex=`…); HUD imports `net/progress` despite receiving `prog` as a param. | Give HUD setters; pass progression in as params. |

---

## Dimensions 5-7 — Testability CONCERNS · Debt PASS · Gate PASS

`npm test` = **61 ✓ / 0 ✗** (re-run 3×, exit 0). Internals are testable by design (`new Game({seed,decks})`
seed-injectable, pure `mechanics.js`, seeded RNG, `window.__limen` browser hook). Gameplay coverage
strong incl. **all RULES-7 additions** (high-ground, Riftlight, RIFT STIRS, bury/trophy, crush-out).
Tech debt clean: zero TODO/FIXME in first-party code, `cell.ruins→rubble` migration complete, no
shelf-ware (rubble/env/music/glb all wired). Gate: playable end-to-end per code (menu→deckbuild→match→
win→reward), chain-of-verification passed.

| Sev | Location | Defect | Fix |
|---|---|---|---|
| MEDIUM | `net/progress.js` | Mote economy + unlock ladder (pure/deterministic) has **zero tests** | Add `tests/progress.test.js` over `computeMotePrices`/`nextUnlock`/`starterCollection` |
| MEDIUM | `net/supabase.js`, `main.js:169-188` | MP action-log relay + `applyRemoteAction` **desync path untested** | Headless test replaying an action log against two seeded `Game`s (core already deterministic) |
| LOW | `assets/music/*.wav` (3×3.7 MB) + `battle.mp3`,`stinger_rift.mp3` | ~11.6 MB assets referenced by no live code (music.js loads only 3 mp3s) | Delete, or wire `battle`/`stinger_rift` into music.js (the known-pending music trigger) |
| LOW | `harness.html`,`integ_harness.html`,`glb_test.html`,`_poptest.html`,`console-errors.txt` | Dev scaffolding + stale log at repo root, ship in static deploy | Move to `dev/` or delete |
| INFO | `net/client.js:6-7` | Supabase URL+publishable key hardcoded | Acceptable (publishable/anon, RLS-gated, client-safe by design) |

---

## Dimension 3 — Determinism PASS · Performance PASS (zero blockers)

**Determinism airtight** — the balancing pipeline can trust it. Grep of core+sim for
`Math.random|Date.now|new Date|performance.now|crypto` → only `arena.js:91,98` (wall-clock benchmark
print) + `train.js:58` (weights metadata) — neither read into game state. RNG seeded+threaded
(`mulberry32(hashSeed)`, every agent takes `rand` as a param). `Game.clone()` (game.js:528-560) verified
a correct independent deep copy field-by-field (fresh `keywords` arrays, `riftStirs` flat-primitive copy,
`g.rand=null` safe — no in-play action touches `rand`). Cosmetic `Math.random` in scene.js drives only
motes/particles/camera-kick; rubble uses deterministic `hashCoord`. Note: bot/policy transiently mutate
the live game then restore (safe under JS single-thread; flag for any future async refactor).

**Performance clean** — no leaks, no unbounded accumulation. `syncBoard` diffs by `tile.id`, dead tiles
disposed (geometry+materials+non-shared maps, shared caches protected); rubble/embers/ghost/highlights/
preview all have matching disposal; composer chain renders once/frame; camera-kick add-before/sub-after
render (no drift). Only LOW micro-opts:

| Sev | Location | Defect | Fix |
|---|---|---|---|
| LOW | scene.js:1263-1324 (6 sites) | `filter()` allocates a new array every frame even when source empty (~360/s idle) | Guard `if(list.length)` or swap-pop compact |
| LOW | scene.js:1193 | `requestAnimationFrame(()=>this._animate())` allocates a closure per frame | Bind once: `this._boundAnimate = this._animate.bind(this)` |
| LOW | scene.js:610-619 | Cascade `_paintBadge` mints a fresh 256² canvas+CanvasTexture per intermediate value (bounded, disposed) | Cache CanvasTextures by `(num,ring,color)` |
| LOW | scene.js:180-184 | `hexGeometry(h)` builds a new CylinderGeometry per tile group (disposed w/ group, no leak) | Cache shared geometry per height as `sharedAsset` |

---

## Dimension 4 — Content pipeline & consistency: CONCERNS

42 tiles: **42/42 have art + lore**, 17/17 keywords implemented *and* used (zero dead content), all
design↔code↔data knobs reconcile (trophy 3, crush 5, riftlight 2/8, RIFT STIRS 12/2, TIER_MAX 3).
`DOMINION/RIFTBORN/REMEMBRANCE` absent from code — correct, doc marks them deferred.

| Sev | File | Defect | Fix |
|---|---|---|---|
| MED | `assets/models/units/`+manifest | **5 non-rite cards unmodeled** (LANTERN/PALISADE/ALTAR/SKIRMISHER/RIFTWARDEN — all `count:0`); 8 unmodeled total (not 4). Incomplete media pass (OUTCROP, also count:0, *is* modeled). | Author 5 GLBs + manifest, or document as intentionally 2D. |
| LOW | `render/popout.js:98` | `.glb` URL built with **raw `${type}`, no `encodeURIComponent`** — art path encodes but model path doesn't → WILL-O'-WISP model 404s on strict hosts (caught, silent). | `encodeURIComponent(type)` at line 98 (matches the art-path fix). **Quick win.** |
| INFO | `GAME_DESIGN.md:84` | Superseded "Threshold slate" cites RIFT STIRS "every 6th turn" (stale vs 12-ply) | Section labelled SUPERSEDED; leave or annotate. |

---

## Dimension 2 — Systems & balance: CONCERNS (2 HIGH)

No runaway, no stall-lock (anti-turtle knobs hold: `CAPITAL_MIN_NEIGHBORS=3`, Riftlight forces center,
no-pass-with-legal-moves, corner-turtle 1.6-8.6% = loses). Keyword win-rates band cleanly (42-58% @
n≥1500). **The failure is at the CARD level, which aggregate keyword bands hide** — and Limen has no
mana/cost axis, so same-rarity = same slot cost → strict domination is unmitigated.

| Sev | Location | Defect | Fix |
|---|---|---|---|
| **HIGH** | `tiles.js:47-101` | **8 strictly-dominated cards** (same rarity, ≥infl loser, keyword subset, no cost tradeoff): LANTERN<EMBERSLINGER, PALISADE<RIFT-WALL, ECHO<FOXGLOVE, VEILWISP<VEILWALKER, LEECHSPRITE<SOUL-ENGINE, WARDSTONE<BASTION, COLOSSUS<TEAR-ESSENCE, THICKET/OUTCROP<any keyworded inf-2. Deckbuild is "solved". | Differentiate base cards (distinct upside, not just lower infl) OR upgrade-*replaces*-base at collection level. **Ties to RULES-8: new roles (roads/traps/on-place) are the differentiation.** |
| **HIGH** | `tiles.js:47,56,63,69,100` | **Starter ships 4 dominated cards** (THICKET×1, ECHO×1, LEECHSPRITE×2, COLOSSUS×1); THICKET dominated by EMBERSLINGER/RIFT-WALL **in the same starter** — live in-deck mistake (bot always runs default). | Swap THICKET→RIFT-WALL/EMBERSLINGER now; move ECHO/LEECHSPRITE/COLOSSUS to upgrades. **Quick win.** |
| MED | `config.js:43` | P1 tiebreak equalizer is **tiebreak-only** (not on capital-capture wins); fresh n=500 = 53.4% (>52 band). | 53.4%@500 within noise of 49.55%@2000 — **resample n≥2000 on current starter** before acting. |
| MED | `config.js:27` | **Dead opening** T9-10 vs ≤T8: geometric floor (`CAPITAL_MIN_DIST_FROM_SEAM=2` + adjacency-capture + 1 place/turn). Nudge can't reach it. | Geometry lever only: trial `DIST 2→1` or seed mid-board contact tiles (sim-gate rush). **RULES-8 core target.** |
| MED | `mechanics.js:34,67,204` | **Uncapped accumulators** SUSTAIN/TIDEBOUND/RALLYING_CRY (only unbounded influence sources; all others capped). Soft-bounded by ply count, theoretically runaway. | Add per-tile growth cap (~+5). Cheap insurance. |
| LOW | `tiles.js:73,74,100` | Under-powered inf-2 rares (GALEHARRIER/DREADMAW/APEXWARDEN) — never worth a scarce `MAX_RARE=2` slot; APEXWARDEN in starter. | Bump inf-2 rares→3, or drop APEXWARDEN from default. |
| LOW | `config.js:57` | TRAMPLE 62.7% but only n=150 (>58 band, under 1500 floor). | Re-sim n≥1500; if hot, `TRAMPLE_SPLASH 2→1`. |

---

## Overall gate verdict: CONCERNS — ship-safe, disciplined codebase, one real balance failure

Determinism, performance, tech-debt, and the ship-gate all PASS; the code is clean and the balancing
pipeline is trustworthy. **No BLOCKER/CRITICAL.** The two HIGH findings are both the *collectible layer*:
strict card domination + a dominated starter. Architecture debt (net/decks repo, scene.js god-object,
the live-board-mutating preview) is MAJOR-maintainability, not correctness — except `main.js:70-77`
which is a latent state-corruption risk worth fixing.

### Ranked fix list
**Quick wins (trivial, safe, do in a batch):**
1. `popout.js:98` → `encodeURIComponent(type)` (WILL-O'-WISP model 404).
2. Swap THICKET out of the starter (dominated by its own deckmates).
3. Extract MENACE/RALLYING_CRY/FORESIGHT magnitudes to CONFIG (consistency).
4. Delete ~11.6 MB orphan `.wav`/mp3 + move dev-scaffold HTML to `dev/`.

**Correctness (MAJOR):**
5. `main.js:70-77` — kill the live-board-mutating `projectedInfluence`; use the clone-based preview.

**Balance (needs sim-gate + retrain):**
6. Card power-creep: differentiate the 8 dominated cards OR upgrade-replaces-base. **Fold into RULES-8** —
   the new mechanics (roads/traps/on-place effects) are exactly the distinct roles that undominate them.
7. Uncapped accumulator caps (SUSTAIN/TIDEBOUND); TRAMPLE + P1 resample at n≥1500-2000.
8. Dead opening — geometry lever (`CAPITAL_MIN_DIST_FROM_SEAM`) — **the RULES-8 core problem.**

**Architecture (MAJOR-maintainability, schedule):**
9. `net/decks.js` repository; scene.js animator-registry refactor; UI shared-util hoist.

**Testing (MEDIUM):**
10. `tests/progress.test.js` (Mote economy); headless MP action-log replay test.

### Thread to RULES-8 (the review confirms the redesign is aimed right)
Three review findings are the *same problem* the round-8 redesign and the psychographic eval target:
**dead opening** (dim 2 MED = the geometric floor), **shallow/solvable placement** (arena: search2
100%), and **no meaningful deckbuild** (dim 2 HIGH strict domination = kills Johnny). RULES-8's new
roles differentiate the dominated cards *for free* as a side effect of giving cards distinct jobs —
so the balance fix and the fun fix are the same work. Do the RULES-8 mechanics; re-run this balance
pass after, because the card pool changes.

