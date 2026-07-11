# RULES-8 P1 — Seam Advances + frontier-anchored legality (dead-opening killer) — rev 2

Build-loop tier: **HIGH** (core rules · biggest single sim perturbation attempted · retrain +
seed-paired Fun-Index re-sweep). Gate #1 (plan panel) RAN 2026-07-11: 4 Sonnet personas
(balance skeptic · exploit hunter · determinism engineer · completeness critic) → 5 BLOCKERs
7 MAJORs folded into rev 2; fold-verifier then found rev 2's ring floor was itself a bug
(NEW-1/NEW-2) + a backfill loophole (NEW-3) → rev 3 (capital AURA replaces ring floor;
backfill narrowed to capital-adjacent). Round 3 verifier: SCOUT-gate no-op BLOCKER +
ghost-window/T8 MAJORs → STOPPED at cap, escalated; operator authorized ONE bounded rev-4
fold (2026-07-11) + final scoped verify. Iteration count: **4 (operator-extended, final)**.
Open BLOCKERs: none (all folded — pending final scoped verify).

## Why
Fun Index 38.1/100; dominant drag U(late-tension)=0.18 — games decided early, dead opening
(first capture T9-10). Bot-nudge sweeps already failed (BLOCKERS.md); the fix must be
**geometric**. P1 attacks it from two directions at once (DESIGN_ROUND_8 §2 + §v P1 row).
**Causal-weight correction (panel):** the seam — not frontier-anchor — owns the contact
clock; knobs set accordingly. "Contact by ~ply 6-8" recalibrated to **~6-10, sweepable**.

## Mechanic 1 — The Seam Advances (collapsing frontier)
**Rule:** From ply `SEAM_ADVANCE_START`, every `SEAM_ADVANCE_CADENCE` plies the outermost
ring of **empty** hexes is consumed by the Rift and removed from play, up to
`SEAM_MAX_RINGS`. Occupied cells survive and stay capturable. **Ghost window (rev 4,
operator-blessed):** a ring is "doomed" from the moment it becomes next-to-fall — ring 0
from turn 1, ring N from the tick that ate ring N−1. Placement on a doomed cell is illegal
for every path when the cell is empty and NOT capital-aura-protected (`ghosted ∧ empty ∧
¬aura`). Rev 3's 1-ply ghost left a 3-ply-per-ring open garrison window (verifier round 3);
the full inter-tick window closes it. Consequence accepted: ring 0 is unbuildable from
turn 1 except aura pockets — the board effectively opens at 77 cells + aura, and the ghost
visual persists on the whole doomed ring (pulse hardens as the tick nears — better
readability than a 1-ply flash). **Capital aura (rev 3):
cells adjacent to either capital are NEVER consumed** (and never ghost-banned) — stranding
is fixed by protection,
not by capital-placement prohibition (rev 2's ring floor was a code-verified bug: at
MAX_RINGS=3 it left ZERO legal capital cells — capital zone needs row ≤2/≥6, floor demanded
rows 3-5, disjoint → capital-phase deadlock; at MAX_RINGS=2 it locked both bots to a single
cell (6,2)/(6,6)). The aura leaves deterministic holes in eaten rings near capitals — fine:
consumption predicate is `!cell.tile && !ghost-protected`, per-cell, still clock-pure.
The doomed ring is telegraphed the whole inter-tick window (Into the Breach-style, but the
window is the FULL span defined above, NOT one tick — rev 4 reconciliation; round-4
verifier caught the stale 1-ply sentence coexisting here) — **and placement on any doomed
empty non-aura cell is ILLEGAL for every path including SCOUT** (panel: else the telegraph
is a "garrison here free" signal — the deterministic clock lets a player pre-fill doomed
cells; EMBERSLINGER/SCOUT ships in the starter deck. Telegraph = information, not shelter).

**ASSUMPTION A1 (design ambiguity):** §2 says both "outermost ring" (symmetric) and
"advances one row toward the further capital" (asymmetric). P1 = **symmetric ring**
(battle-royale source, cheapest deterministic geometry). Asymmetric deferred — flagged: if
it ever ships, it reopens the park-your-capital-far exploit and needs its own gate.
**ASSUMPTION A3 (panel):** ring = array-boundary ring `ringIndex(col,row) =
min(col, 12−col, row, 8−row)`, NOT `hexDistance()`-concentric. The board is stored 13×9
rectangular; edge-of-array is what the Rift eats.

**Ring math:** 117 → 77 (ring 0 gone) → 45 (ring 1) → 21 cells. `SEAM_MAX_RINGS: 2`
(deeper collapse is P5). Sweep 1–3.

**Knobs (rev 2 — panel recalibration):** `SEAM_ADVANCE_START: 5`, `SEAM_ADVANCE_CADENCE: 5`
→ ticks at plies 5, 10; 9×5 arena by ply 10. START=8 could not causally produce early
contact (first tick fired after the window). **Parity note (panel):** tick lands on one
player's `onTurnStart` — with even START it is ALWAYS P2 who moves first into the shrunk
board. Sweep must A/B odd vs even START and check the P1-winrate split; confound with
INFLUENCE_TIEBREAK_BONUS_P1 must be measured, not assumed away.

**State (deterministic, clock-driven, PRIMITIVES ONLY — panel):**
- `cell.consumed: false` in the `createBoard` cell literal (board.js:35).
- `game.seam = { ringsConsumed }` — that is the WHOLE object. `nextAdvanceOnPly` is
  DERIVED (`START + ringsConsumed*CADENCE`), never stored (drift-proof under clone).
  Ghost (doomed) membership derived in consumers: `ringIndex(c,r) === ringsConsumed &&
  ringsConsumed < SEAM_MAX_RINGS` — the next-to-fall ring is doomed for its ENTIRE
  inter-tick window (rev 4: round-4 verifier caught a stale `&& upcoming-tick within 1`
  qualifier here that silently reinstated the rejected 1-ply window; removed). Never a
  stored coordinate list (a Set/array on `seam` would alias across every search2 candidate
  clone via `{...spread}` — silent cross-branch corruption).
- Advance in `onTurnStart` (mechanics.js:120, beside `riftStirsState`): one-shot on
  `turn === nextAdvanceOnPly`, guarded `ringsConsumed < SEAM_MAX_RINGS` — the stop-guard is
  an EXPLICIT TESTED INVARIANT (without it, ring 3 fires at ply ~26, inside the mandatory
  25-45 band, aggravating R1).
- `clone()` copies `consumed` per cell (game.js:532-537 allowlist) + `g.seam = {...this.seam}`
  (safe: primitives only). Clone-isolation unit test required.

## Mechanic 2 — Frontier-anchored legality (rev 2 redesign)
Panel verdict on rev 1: no-retreat was **too weak** (unlimited lateral walling — a player
can wall their own row all opening, zero forward progress; contradicts design §288's
"development marches at the enemy") AND **too strong** (rear-backfill permanently illegal
once the frontier passes — capital-depth became a one-way ratchet on your own defensive
footprint; loyalty's documented "expansion punishment" failure imported wholesale).

**Rev 3 rule:** empty-cell placement legal iff adjacent to a friendly tile (as today) AND
(a) at least one adjacent anchor has `seamDistance(anchor) >= seamDistance(placed)` (no
retreat past your line), **OR (b) the placed cell is adjacent to your own capital** (the
capital is a standing rear anchor — home defense always buildable; kills the ratchet).
Rev 2's "(b) = within 1 ROW of capital's row" spanned the whole row laterally and legalized
garrisoning consumable ring-1 cells with ordinary tiles (verifier NEW-3) — rev 3 narrows
(b) to capital-adjacent cells, which the capital aura already protects from consumption, so
backfill there carries zero seam-immunity arbitrage. `FRONTIER_BACKFILL_DEPTH` knob dropped.
- Lateral stays legal; walling is expected to LOSE ON TEMPO now that the seam eats rings
  from ply 5 and ghost-ring placement is banned — this is a measured bet, not an
  assumption: sim adds an edge-fill/lateral-share metric (below), and the 4-arm A/B
  (seam/frontier/both/neither via `FRONTIER_ANCHOR` + `SEAM_MAX_RINGS:0`) decides whether
  frontier-anchor earns its P1 slot at all.
- **SCOUT (panel BLOCKER; rev 4 fix):** loses full exemption. SCOUT keeps non-adjacent
  placement + heartland ban, gains the consumed/ghost-cell guard AND an ABSOLUTE
  rear-garrison gate: `seamDistance(placed) <= CAPITAL_MIN_DIST_FROM_SEAM` (=2, rows 2-6).
  Rev 3's relative gate (`<= seamDistance(ownCapitalRow)`) was a no-op at deep capitals —
  row 0/8 gives seamDistance 4 = board max, gate always true (verifier round 3). The
  absolute anchor binds at every capital depth: SCOUT is a mid-board deployment tool,
  never a rear/corner garrison, regardless of where the capital sits.
- Exemptions unchanged: captures, self-ascend, capital placement (own rule below).

**Capital legality (rev 3):** `isLegalCapitalCell` gains ONLY the `cell.consumed` guard —
NO ring floor (rev 2's floor was the NEW-1/NEW-2 bug above). The stranding threat (bot
heuristic bot.js:94-106 / policy.js:132-144 parks capitals at (6,0)/(6,8) = ring 0, first
eaten) is neutralized by the capital aura instead: those capitals' neighbors survive every
tick, so the network always has a live root. Row choice becomes a real tradeoff again
(deep = seam-sheltered pocket, shallow = center control) rather than rows 0-1 being
strictly dominated (panel M2) or artificially banned (rev 2).

**ASSUMPTION A2:** `seamDistance = |row − midRow|`, ignoring rift jitter (±1 wobble,
RIFT_JITTER_CHANCE 0.4). Panel: acceptable teachability tradeoff, symmetric between
players; revisit only if sweep shows column-position winrate bias.

## Exact code seams (rev 2, line-verified by panel)
| File | Change |
|---|---|
| `core/config.js` | ADD `SEAM_ADVANCE_START: 5`, `SEAM_ADVANCE_CADENCE: 5`, `SEAM_MAX_RINGS: 2`, `FRONTIER_ANCHOR: true` |
| `core/board.js:35` | cell literal gains `consumed: false`; ADD `ringIndex(col,row)` helper |
| `core/mechanics.js:120` | seam advance in `onTurnStart` beside `riftStirsState`; one-shot, MAX_RINGS-guarded; consumption predicate: `!cell.tile && !capitalAdjacent(c,r)` (capital aura) |
| `core/game.js:196` | `isLegalCapitalCell`: `\|\| cell.consumed` only (no ring floor — rev 2 bug) |
| `core/game.js:216` | `canPlace` (null-check is :215, not :212): reject `consumed` AND ghosted-ring cells for ALL paths; frontier check (a)/(b) in the empty+adjacent branch; SCOUT rear-garrison gate; **differentiated `reason` codes** (`consumed`/`ghosted`/`retreat` — not one generic 'illegal placement'; anti-opacity, loyalty lesson #1) |
| `core/game.js:528` | clone: `consumed` in cell allowlist + `g.seam = {...this.seam}` |
| `core/game.js` constructor | init `this.seam = { ringsConsumed: 0 }` |
| `core/agents/policy.js` + `search.js evaluate()` | ADD ring-distance-to-consumption term/feature (`ringIndex − ringsConsumed`) — panel: both agents are seam-BLIND today; retrain reweights existing features, it cannot invent the missing signal; arena numbers untrustworthy without it |
| `core/bot.js` | `BOT_RIFT_NUDGE` re-sweep or explicit freeze POST-seam, named line item before the gate is read (the gate instrument is greedy-vs-greedy; stale nudge tuning + new legality = artifact risk) |
| `render/scene.js` | consumed + ghost membership recomputed EVERY `syncBoard()` (:894-902 rubble-darkening loop is the precedent) — NOT a static `_buildBoard` flag (`riftAdjacent` pattern is build-time-only; ring membership is dynamic). Ring-eat animation: hex-by-hex ignite + screen-shake scaled to hexes consumed (§2 — P1 acceptance) |
| `main.js` | `updateBoardTip` (:288-330): consumed/ghosted tooltip states; static hint strings (:350, :438) updated for the new legality axis; rejection hints surface the differentiated reason codes |
| `ui/sound.js` | seam-tick cue (decision: yes — bigger perceptual beat than the silent rift-stirs precedent; cheap) |
| `tools/metrics.js` | concrete `tracker.seamAdvanceTurn` field (no existing riftStirs precedent to mirror — verify at gate #2 it actually lands) |
| `tests/seam.test.js` | T1 tick fires at START, consumes only empties · T2 occupied survive · T3 consumed+ghosted reject placement/capital (incl. SCOUT) · T4 MAX_RINGS invariant (never exceeded; no ring ≥ MAX ever consumed) · T5 frontier: retreat illegal, lateral legal, capital-adjacent backfill legal · T6 clone isolation (`sim.seam.ringsConsumed++` doesn't leak) · T7 same-seed determinism byte-identical · T8 (decoupling regression guard, single config): capital phase completes with ≥8 legal cells per player at shipped defaults — relabeled per verifier: legality no longer reads SEAM_MAX_RINGS, sweeping it would run identical code 3× · T9 capital-adjacent cells never consumed AND never ghost-banned at any tick · T10 ghost window: empty non-aura ring-0 cell rejects placement (incl. SCOUT) at turn 1; same cell aura-protected accepts |

**Touch-point audit (panel-verified):** rift cells are placeable terrain → `consumed` stays
a distinct flag; D1 (rift=true persists on consumed rift cells) confirmed zero-code-safe
(riftNeighborCount/boardSummary/SEAMBOUND/policy-f15 all keyed off `.rift`+`.tile` only).
`legalMoves` funnels every consumer (greedy/search/policy/UI hover main.js:140,360) through
`canPlace` — one guard covers all. Campaign wraps the same `Game` + CONFIG snapshot
deep-clones new SEAM_* keys — inherits automatically, zero edits. MP relay
(net/supabase.js + main.js:211-230 applyRemoteAction) replays actions through the
deterministic core — seam recomputed identically both ends, zero protocol change.
`isLegalCapitalCell` consumed-guard is unreachable today (capitals precede first tick) —
kept as belt+suspenders, noted so nobody reads it as load-bearing.

## Risks (rev 2)
- **R1 ply-band collapse:** shrinking space → forced passes → early resolve. Gate: ply
  25-45 + completion ≥0.90. Named tripwire: `tests/bot.test.js:40-45` (stalls===0).
- **R2 stranding:** mostly defused by the capital ring floor; residual (ring-1 neighbors of
  row-2 capitals) measured via stall/zero-cap.
- **R3 frontier over-constraint:** backfill clause (b) is the pressure valve; if winrate
  skews or stalls rise → widen FRONTIER_BACKFILL_DEPTH or knob off (4-arm A/B decides).
- **R4 bank-the-lead stalling (panel):** influence leader may play for the 2-pass resolve.
  NEW sim check: of games ending by double-pass, what share does the pre-pass influence
  leader win? Disproportionate → the incentive is real, needs a cost on passing.
- **R5 edge-fill/lateral walling (panel):** NEW sim metric: share of placements that are
  lateral/rear vs forward, and ring-0/1 occupancy at tick time. Walling showing up as a
  winning line = frontier rule failed its bet.
- **R6 parity bias (panel, reframed by verifier):** tick parity = whoever's `onTurnStart`
  fires the shrink reacts first. With odd CADENCE (5) parity ALTERNATES per tick (ply 5 =
  P1's turn, ply 10 = P2's); constant one-sided bias only occurs when CADENCE is even.
  Sweep odd-vs-even START and read the bias PER TICK; watch P1-winrate vs the tiebreak
  correction.
- **R8 rift attrition (verifier):** cols 0/12 force ringIndex=0, so tick 1 always eats the
  two outermost rift hexes if empty — riftlight supply shrinks slightly. Immaterial-until-
  measured; noted as D1 corollary.
- **R9 early-tick squeeze (verifier):** START=5 lands after only 2-3 placements per side.
  Sweep report includes a ply-5 board-state snapshot, not just aggregate ply-band.
- **R10 FORTIFIED viability (round-4 verifier, accepted):** ringIndex 0 is set-identical to
  `isEdge()`, so under the full-window ghost ban a non-aura edge cell is never freshly
  buildable, and the post-shrink arena's boundary is NOT `isEdge` (that checks original
  13×9 bounds). FORTIFIED (+2 on edge) triggers only in aura pockets touching the original
  edge — possibly zero cells depending on capital column. ACCEPTED for P1: neither
  FORTIFIED tile (PALISADE, BASTION) ships in the starter deck (count 0); impact confined
  to deckbuilder/campaign decks. Sim round logs FORTIFIED play/winrate; if dead, redefine
  the keyword (e.g. "+2 while adjacent to consumed/rift cells" — the new edge) as tile-data
  in this round or park for P2.
- **R7 discard-lock (panel MINOR, accepted):** stuck player burns their single discard as
  the only unstick. Candidate mercy: free discards at zero legal moves — deferred unless
  sim shows real frequency.

## Gate (falsifiable, seed-paired n≥500 vs RULES-7 baseline 38.1)
1. first-capture median ≤ 6 · 2. zero-capture ≤ 5% · 3. ply 25-45 held · 4. P1 winrate
48-52% (checked at odd AND even START) · 5. completion ≥ 0.90 · 6. Fun Index ↑ vs 38.1
(U-late up) · 7. `npm test` green incl. tests/seam.test.js T1-T10 · 8. capital-phase
liveness — measured by T8/T9 (unit tests), NOT the sim batch (rev 4: tools/sim.js has no
capital-liveness fields; the earlier wording implied instrumentation that doesn't exist)
(replaced "histogram not degenerate": deterministic first-fit bots yield no
distribution to read; a histogram gate was un-satisfiable by construction) · 9. R4/R5
checks clean · 10. retrain + BOT_RIFT_NUDGE sweep/freeze + tiebreak re-sweep BEFORE any
gate number is read.
Runnable: `npm test` · `node tools/sim.js` 4-arm A/B (seam/frontier/both/neither).

## Status
- 2026-07-11: rev 1 written (Fable). Gate #1 panel (4 Sonnet personas): 5 BLOCKERs, 7
  MAJORs, 8 MINORs — all folded into rev 2. Key changes: knobs 8/6→5/5 · ghost-ring
  placement ban (all paths) · SCOUT rear-garrison gate · capital ring floor · backfill
  clause (b) · seam-blind agent feature · BOT_RIFT_NUDGE line item · dynamic render
  membership · reason codes · seam state minimized to one primitive. Panel verified sound:
  ring math, D1, clone/replay determinism, campaign+MP inheritance, no-RNG.
- 2026-07-11 (later): fold-verifier: 7 RESOLVED, B1 PARTIAL-by-design (lateral walling =
  instrumented bet, R5 metric + 4-arm A/B arbitrate), M2→NEW-2 inverted, NEW-1 capital
  deadlock @MAX_RINGS=3, NEW-3 backfill garrison → rev 3: capital aura (protection, not
  prohibition), clause (b) = capital-adjacent, gate #8 replaced, T8/T9 added, R6 reframed
  per-tick, R8/R9 noted. Line refs verified 8/8 by verifier.
- 2026-07-11 (round 3): scoped verifier — FIX-1 aura RESOLVED (ordering race none, viable
  root structurally guaranteed, no corridor chaining, harbor non-exploit). FIX-2 PARTIAL:
  **BLOCKER** SCOUT gate vacuous at deep capitals (seamDistance(row 0/8)=4=max → no-op);
  **MAJOR** ghost-ban = 1 ply, open garrison window = 3 plies/ring. FIX-3 PARTIAL:
  **MAJOR** T8 vacuous + gate-8 runnable mismatch. → AT CAP: STOPPED per governance;
  open items written to BLOCKERS.md; operator decides (proposed fixes recorded there).
- 2026-07-11 (round 4, operator-authorized): PIN-1 SCOUT absolute gate RESOLVED (bands rows
  2-5 / 3-6, symmetric, non-degenerate) · PIN-2 openings RESOLVED (turn-1 = 3 aura cells;
  FORTIFIED gap → R10 accepted) · PIN-3 T8/T9 RESOLVED; T10 caught stale 1-ply formula
  coexisting with full-window prose → reconciled (doomed = `ringIndex===ringsConsumed`,
  whole inter-tick window). Verifier sign-off conditions applied verbatim → **gate #1
  CLEAR. BUILD STARTED** (core → tests → agents → render/UI → sim).
- 2026-07-11 (BUILD + MEASURE): core+agents+tests+render/UI built; retrained (18 features,
  fitness 0.688); 85 tests green. GATE RESULT: **FAIL — mechanic pair is anti-fun in every
  instrument.** Seed-paired n=300 greedy 4-arm: OFF 38.2/U .18/comeback 18.7% → BOTH
  34.3/U .13/comeback 8.3%; firstCap T10 unmoved (responds only to BOT_RIFT_NUDGE = value,
  not geometry). Arena n=120/arm: policy-mirror comeback 33.3→13.3%, firstCap T9.5→T12.5;
  policy-v-greedy comeback 19.2→3.3%. Parity bias real (even START 46.3% vs odd 50%).
  Cadence outcome-inert. MECHANISM: squeeze removes trailing player's counterplay; the
  designed comeback lever (severance) is P2. DECISION (documented, reversible): ship knobs
  OFF (SEAM_MAX_RINGS 0, FRONTIER_ANCHOR false; SCOUT band + doomed-ban knob-gated too);
  OFF-parity proven (n=200 sim = 38.1 = recorded baseline). Machinery stays as the P2
  round's A/B arms — re-test seam WITH severance/chain-slide per design §"four directions
  at once". Gate #2 (built-diff panel) next.
- 2026-07-11 (GATE #2 CLOSED): two fresh-eyes reviewers over the built diff. ON-path:
  conditional pass, no blocker; fixed its MAJOR (retreat reason code now surfaced in
  main.js) + minors (f[17] set before early-returns; sweep/arena harnesses committed as
  tools/sweep_seam.mjs + tools/arena_seam.mjs). OFF-path: found the f[17] positional-signal
  leak into shipped defaults (BLOCKER — fixed: knob-gated + retrained at defaults, fitness
  0.656) and proved the rules layer byte-identical to pre-diff over 21 seeded games; fixed
  its MAJOR (seam hint copy knob-gated) + minors (search.js explicit knob guard; _animate
  doomed loop gated). FINAL: 85/85 tests · n=300 OFF-parity Fun 38.2 = baseline · browser
  ON-path (tick T5, 34 eaten, ghost/aura/log/render verified, 0 errors) and OFF-path (no
  seam copy, no flags, 0 errors) both in-situ verified. P1 round COMPLETE: negative result,
  machinery shipped OFF as P2's A/B arms. All work uncommitted pending operator go.
