# RULES-8 phase-1 — multi-action turns (CASCADE) · the dynamism core

Build-loop tier: **HIGH** (core rules rip-up · output-quality-is-the-product · retrain +
seed-paired Fun-Index re-sweep required). Goal-drift anchor — survives compaction.

## Why (operator, verbatim intent)
"Get rid of the single tile a turn placement... gearing up for larger much more massive
turns using the resource economies... dynamic long interactive turns." The campaign wraps
the current 1-action duel and does NOT touch this. This is the headline fun fix. Measured
gap: Fun Index 38.1/100, dominant drag U(late-tension)=0.18 (games decided early).

## The mechanic (DESIGN_ROUND_8 §3, mechanic #3 — Cascade)
A `CASCADE` keyword: placing a Cascade tile grants an EXTRA placement this turn
(`placementsLeft++`), bounded by a per-turn cap so chains can't run away. Turns become
multi-action; the median placements/turn rises above 1 (charter success #4). The global
`PLACEMENTS_PER_TURN=1` calibration is NOT changed — extra placements are tile-driven and
bounded, so the pacing valve stays intact.

## Exact seams (verified against HEAD)
- `core/config.js:11` `PLACEMENTS_PER_TURN: 1` — unchanged. ADD `CASCADE_BONUS: 1`,
  `MAX_PLACEMENTS_PER_TURN: 3` (hard cap on total placements/turn incl. cascades).
- `core/game.js:302 _beginTurn()` sets `placementsLeft = PLACEMENTS_PER_TURN`; ADD a
  per-turn counter `this.placementsThisTurn = 0` (or track granted cascades) reset here.
- `core/game.js:321 placeFromHand` decrements `placementsLeft` (line 333) then the resolve
  path fires placement effects; `game.js:513` calls `_endTurn()` when `placementsLeft<=0`.
- `core/mechanics.js:100 fireOnPlacement(game, tile, col, row, captured)` iterates
  `tile.keywords` — ADD `case 'CASCADE'`: `if (game.placementsThisTurn < CONFIG.MAX_PLACEMENTS_PER_TURN) game.placementsLeft++;`
  (net: the Cascade tile's own placement is refunded, up to the per-turn cap). Confirm the
  decrement/fire ORDER so the cap math is right (count placements made this turn, not raw ++).
- `data/tiles.js` — ADD `KEYWORDS.CASCADE` metadata (name + desc) and give 1–2 tiles the
  CASCADE keyword (new tile or promote an existing filler); ensure they're in a deck the
  sim/starter can draw so the mechanic actually fires.
- `core/bot.js:89 botTakeTurn` places once per call off `game.currentPlayer`; the turn only
  flips when the game hits `placementsLeft==0`, so the sim loop + scheduleBot re-entrancy
  consume extra placements automatically. Verify no infinite loop (cap guarantees it).
- `core/game.js:545` clone copies `placementsLeft` — also copy `placementsThisTurn`.

## Falsifiable gate (seed-paired, N≥500 vs RULES-7 baseline 38.1)
1. **Median placements/turn > 1** with cascade tiles in play (charter #4) — the mechanic fires.
2. **Fun Index rises** over 38.1 (esp. U toward >0.18) in seed-paired A/B (cascade-pool vs no-cascade).
3. **No balance/pacing regression:** P1 winrate stays 48–52%, ply band 25–45, completion ≥0.90,
   zero-cap ≤5%, no stalls.
4. `npm test` stays green (add a game.js test: a CASCADE placement grants an extra placement,
   capped at MAX_PLACEMENTS_PER_TURN, and the turn does NOT flip until the cap/empty).
5. Retrain (`npm run train`) + seed-paired tiebreak re-sweep (INFLUENCE_TIEBREAK_BONUS_P1=-1) after the change.

## Loop (build-loop HIGH)
Plan (this file) → surgical edits → node test + seed-paired Fun-Index A/B (evidence, not
assertion) → retrain → gate #2 fresh-eyes review of the built diff → iterate ≤2–3 rounds,
else STOP + BLOCKERS.md. Determinism constraint holds: NO Math.random/Date.now in core/sim.

## Status
- 2026-07-11: plan written. Campaign P1 done + browser-verified (separate feature). Starting
  CASCADE edits next.
