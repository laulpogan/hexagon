# RULES-8 P2 — Roads full: chain-slide pressure + loop-closure + severance

**Rev 3** (2026-07-11) — rev 2 + round-2 fold-verifier fixes (1 BLOCKER, 2 MAJOR,
4 MINOR — see status log). Deltas from rev 2 marked ⟲⟲. Build-loop tier HIGH.
Spec: `DESIGN_ROUND_8.md` §iii.1 + §v P2 row. Carried from P1: re-test SEAM_*/FRONTIER
arms inside this round; R4/R5/R6 as committed metrics.

## Verdict targets (the P2 gate)

- Road-rush adversarial bot arm winrate **42–58%** vs tuned greedy AND vs policy.
- ⟲ Road-rush diagnostics are pass/fail, not just winrate (red-team M4/M6): report
  **capital-capture share + ply-of-capital-capture distribution**, **median ply roadPower
  first hits CAP**, **rear-farm share** (% of winner's final momentum from tiles never
  enemy-adjacent). A degenerate line hiding inside a healthy winrate band fails the gate.
- Captures/match **≥ baseline 5.5** · **K > .541 and P > .880** (seed-paired vs the
  recorded 'p2base' OFF arm) · LC_excess ≤ .359 · ply 25–45 · ⟲ **firstCap ≤ T11
  explicit pass/fail** (capital-rush watch, balance M4).
- Standing: P1 48–52% (tiebreak re-sweep n=2000 on winning arm) · completion ≥.90 ·
  zeroCap ≤5% · OFF-parity byte-identical (system-level sim + unit-level tests tied, see T6).

## Assumptions — updated after panel

- **A1 — No printed edge-stubs, no rotation** (unchanged). Road NETWORK = same-owner
  adjacency graph. Zero action-space change; MP relay untouched (see touch-point audit).
  ⟲ Corrected premise: FRONTIER_ANCHOR ships OFF today (red-team M7) — frontier is a
  sweep arm here, not an inherited discipline. Rev-2's locality redesign (A3) is what
  kills the rear-farm, not frontier.
- **A2 — Momentum (HUD stat) = capital-connected non-capital tile count.** Longest-path
  stays rejected (exponential). ⟲ But momentum is now DISPLAY + agent-feature only — it
  no longer feeds the pressure term (see A3). Blob-size snowball critique lands on a
  number that no longer drives combat.
- **A3 ⟲ REDESIGNED — Chain-slide pressure is LOCAL, not global** (red-team B2, balance
  B2/B3). The surge a defender feels = the network mass standing AT the contact point,
  not the whole-board count: `roadPower(cell)` = linked same-owner tiles within
  `ROAD_CHAINSLIDE_REACH` hops of that cell THROUGH the linked network (incl. itself).
  A rear blob projects nothing through a 1-wide straw (straw tip roadPower ≈ REACH+1);
  pressing hard requires mass at the front — which is adjacent, capturable, severable.
  This also restores the ledger's `ROAD_CHAINSLIDE_REACH_CAP` knob (completeness M10:
  rev-1 silently dropped it).
- **A4 ⟲ REDESIGNED — Loop = true enclosure, not E≥V** (balance B1, red-team B1: any
  3-clump/capital-fan is a triangle; E≥V is an always-on density trigger, closable on
  placement 2). New test: flood-fill all in-play cells NOT part of p's linked network
  from the board boundary (consumed cells count as passable void); any unreached cell is
  ENCLOSED → loop(p) = true. Triangles and capital-fans enclose nothing. A real ring
  (≥6 tiles around ≥1 hex) is a deliberate build. No edge-counting (kills determinism
  reviewer's double-count trap M6 entirely). Capital may serve as ring wall (it IS
  network) but cannot make a loop by fan geometry.
- **A5 — Severance derived, not a permanent dent** (unchanged mechanism, new teeth):
  orphaned tiles (cut from capital) drop out of linked → their roadPower contribution
  vanishes → local pressure collapses where the cut happened. ⟲ Balance B3's
  articulation-point paradox dissolves under locality: you no longer need a rare bridge
  capture — capturing ANY front-mass tile deletes local roadPower directly. Bridge cuts
  are the jackpot, not the only lever.
- **A6 ⟲ NEW — Capitals are EXEMPT from road pressure as defenders** (red-team B3,
  balance M4): SIEGE(5) + free network 3 vs CAPITAL_INFLUENCE 2 forced a no-response
  snipe. Exemption holds until P5's Threshold beat gives defenders a response window;
  revisit then. Roads still enable capital capture the honest way (pressure the escorts).
- **A7 ⟲ NEW — Pressure stays OUT of the influence-victory tally** (red-team M5: passive
  score deflation double-dip; Riftlight precedent in reverse). `relativeInfluence` gains
  an options arg `{roadPressure:true}`; `boardSummary()` passes false. Combat feels
  pressure; the ~70%-of-games silent tally does not. Consequence (noted, accepted): K/P
  read severance only through the captures it enables, not through roadPower swings —
  the gate measures outcomes, not intermediates.

## The mechanics (rules layer)

### 1. Road network (derived state)
Per player: BFS from capital over same-owner adjacency. `cell.linked` bool per occupied
cell. ⟲ `game.roads = { momentum:{1,2}, loop:{1,2} }` **initialized in the Game
constructor** to `{momentum:{1:0,2:0}, loop:{1:false,2:false}}` (determinism B1: search
clones during the capital phase, before any placement).

`refreshRoads(game)`:
1. ⟲ reset `linked=false` on every cell first (determinism M9 — no stale-true after severance),
2. BFS per player from capital → set linked,
3. flood-fill enclosure test per player (A4) → loop flags (HUD/closure-cue only) +
   ⟲⟲ mark enclosed hexes, then set `cell.loopside = true` on linked cells adjacent to
   ≥1 enclosed hex (the ring itself). ⟲⟲⟲ Wall set for THIS step = the REAL
   capital-rooted BFS result, always — never the `_SEV_OFF`-overridden linked flags
   (round-3 FOLD-1d: disconnected debris must not register as enclosure walls in the
   severance-off arm; keeps arm 3 a single-axis isolation),
4. bounded BFS per linked cell → `cell.roadPower` (count of linked same-owner cells
   within ROAD_CHAINSLIDE_REACH hops through linked cells, incl. self) + ⟲⟲
   `cell.loopNear` (true iff the BFS visited ≥1 loopside cell — the loop must stand
   within surge reach of THIS contact point),
5. momentum = linked non-capital count (HUD/features only),
6. ⟲ SEVERANCE log — **knob-gated on ROAD_PRESSURE_ON** (determinism B3: rev-1 leaked
   it into the OFF arm's game.log, breaking byte-parity) — fires on net momentum drop ≥3.

⟲ Call sites (determinism B2/M7, completeness B2): one uniform rule — **every branch
that assigns `cell.tile` or clears it calls `refreshRoads` before returning**: placeFromHand
ascend branch, capital-capture branch (mutates board then sets phase='over' and returns
early — named explicitly; win-screen/metrics read post-game state), capture/plain branch,
SUNDER resolve. WARD bounce assigns nothing → no call (tested). placeCapital → no call
needed pre-play but harmless; skip (momentum excludes capitals, constructor init covers
clone). seamAdvance eats empty cells only → no call. ⟲⟲ Influence-only mutators need
no refresh (linked/roadPower depend on topology, never on influence values): SUSTAIN,
TRAMPLE, RALLYING_CRY, **TIDEBOUND** (round-2 MINOR-2 — list now complete).
⟲⟲ createBoard() cell literal gains `linked: false, roadPower: 0, loopside: false,
loopNear: false` (round-2 MINOR-1 — no undefined-as-falsy reliance; matches clone's
explicit-field style). ⟲⟲ Code comments must disambiguate the new term as "surge/road
pressure" vs the pre-existing f[5]/f[6] height-pressure features (round-2 MINOR-3). To prevent future missed sites,
placeFromHand's mutating branches route through a shared `_boardMutated()` tail helper.

⟲ Perf budget (completeness M12): refreshRoads ≈ 2 BFS (O(117) ea) + 2 flood-fills
(O(117) ea) + roadPower bounded BFS (~40 linked × ~20 visited ≈ 800) ≈ ~1.3k ops,
ONCE per real board mutation (~1/ply). `clone()` **copies** `cell.linked`,
`cell.roadPower`, and a two-level copy of `game.roads` — **never recomputes**
(determinism M5/M8: clone is the hot path; flags are correct by invariant).

### 2. Chain-slide pressure (the surge) ⟲
In `relativeInfluence(col,row,{roadPressure=true})` for defender d, enemy e:
```
contact  = max over e-owned linked cells n adjacent to (col,row) of
           ( n.roadPower × (n.loopNear ? LOOP_CLOSURE_MULT : 1) ), else 0
raw      = floor(contact / ROAD_MOMENTUM_DIV)
pressure = min(ROAD_PRESSURE_CAP, raw)
```
⟲⟲ MULT is per-contact-cell via `loopNear` (round-2 BLOCKER-1: a global `roads.loop[e]`
gate let one safe rear ring double pressure at every front forever — the rear-farm
relocated into the multiplier). Now the ring must stand within REACH of the contact
to amplify it — same locality principle as roadPower itself, same BFS, no new pass.
`roads.loop` stays for HUD + the closure-moment animation cue only.
Subtract before final clamp. Gated: 0 when `ROAD_PRESSURE_ON` false or opts false.
⟲ WING interaction decided (red-team M8): pressure counts as non-WING aggression —
**a WING defender halves it** (floor(pressure/2)), preserving WING's anti-aggro role
against the new vector. Tested (T11).
⟲ Capitals exempt as defenders (A6). Reads only cached fields — no BFS per eval.
Heartland note (completeness M3): pressure reaches enemy heartland only via linked
tiles standing there, which requires capture-chains (legal, KEPT) — an earned, severable
foothold, not action-at-distance; the road-rush arm + capital diagnostics gate it.

Transient render cue: `game.roadSurgeThisTurn = {player, momentum, closedLoop}` reset
each onTurnStart, never cloned (P1 pattern; clone-exclusion tested — completeness M9c).

### 3. Loop closure — see A4. Closure moment (flag false→true) = white-ring snap + bell.

### 4. Severance — see A5. Orphans render grey; reconnection restores (both directions).

## Config knobs

```js
ROAD_PRESSURE_ON: true,      // master A/B knob (false = byte-identical RULES-7)
ROAD_CHAINSLIDE_REACH: 3,    // surge travel distance (ledger's REACH_CAP, restored) — sweep {2,3,4}
ROAD_MOMENTUM_DIV: 3,        // local roadPower per pressure point — sweep {2,3,4}
ROAD_PRESSURE_CAP: 3,        // sweep {2,3,4}
LOOP_CLOSURE_MULT: 2,        // sweep {1,2}
```
⟲ Ledger deviation noted (completeness M6): "severance orphan rule" ships structural
(no knob) — the A/B isolation arm uses harness-only `CONFIG._SEV_OFF` (undocumented,
default undefined): when truthy, refreshRoads marks ALL owned non-capital tiles linked
(capital-rootedness off — that IS the severance rule, one axis). ⟲ It is a live-play
flag (determinism M10): it changes refreshRoads during the arm's real games, not a
post-hoc metric.

## Agents

- **policy.js**: ⟲⟲ f[18] 'momentumGain', f[19] 'severDamage' (round-2 MAJOR-1: rev-2's
  f[19]/f[20] labels implied 21 weights; FEATURE_NAMES has 18 entries ending at
  seamSafety[17] — new features land at 18/19, DEFAULT_WEIGHTS → 20 exactly) — ⟲
  computed by EXACT bounded BFS, not local recount (determinism M4, red-team M4):
  momentumGain = 1 + size of any orphaned own components the placed cell reconnects;
  severDamage = defender-component BFS from their capital excluding the captured cell →
  newly-orphaned count. O(component) per candidate. ⟲⟲ Branch semantics (round-2
  MAJOR-2 — NOT the f[17] hoist pattern): both features force-zeroed at top (knob OFF
  → stay 0), then computed ONLY in the branch where a placement/capture actually
  resolves on the board; WARD-blocked, capital-capture, and ascend branches return
  explicit 0 (a WARD bounce changes nothing — a phantom severDamage there feeds the
  linear policy an unlearnable signal).
  ⟲ Staleness note broadened (completeness B1): pre-existing features f[1]/f[5]/f[6]
  read relativeInfluence whose pressure term uses start-of-turn linked flags during
  moveFeatures' direct-mutation sim — bounded one-tile underestimate, documented in code
  as accepted heuristic noise (the alternative, refreshRoads per candidate×feature, is
  the hot path).
- **search.js evaluate()**: ⟲ momentum-diff term CAPPED (balance M6): use
  min(momentum, ROAD_MOMENTUM_DIV × ROAD_PRESSURE_CAP) per side × 0.2, knob-gated —
  eval stops rewarding stacking past mechanical relevance.
- **roadrush arm** (`core/agents/roadrush.js`, sim-only): ⟲ computes road deltas via
  clone + apply + refreshRoads per candidate (red-team M4 — the arm must SEE loop
  closures and severance exactly; no approximation). Score = greedy base + ROADRUSH_W ×
  (momentumGain + severDamage + LOOP_BONUS on closure). ⟲ ROADRUSH_W ∈ {2,5,10} swept;
  arena reports per-W. Deterministic given seed.

## Sweep + arena instrument (tools/sweep_p2.mjs + tools/arena_p2.mjs)

Seed-paired n=300 greedy-mirror arms (seed prefix 'p2base'):
1. OFF (parity: must equal recorded baseline fun 39.1 / K .541 / P .880 / capt 5.5 exactly)
2. ROADS defaults · 3. ROADS `_SEV_OFF` · 4. ROADS+SEAM(3) · 5. ROADS+SEAM+FRONTIER · 6. ROADS+FRONTIER
Knob grid on arm 2: REACH × DIV × CAP × MULT (pruned grid), ⟲ per-cell **pressure-saturation
rate** reported (balance M5: saturated cells are behaviorally identical — don't burn sim on them),
⟲⟲ plus **% of plies with pressure ≥1 on either side** (round-2 MINOR-4: pressure-1 floor
at roadPower ≥ DIV is near-always-on midgame — report it, don't average it away).
⟲ Committed metrics per arm — R4 RESTORED to its P1 definition (completeness M4):
**R4 bank-the-lead = of games ending by double-pass, share won by the pre-pass influence
leader**; R5 lateral-share; R6 per-tick parity (seam arms). Plus funIndex block, captures,
comeback, K, P, LC_excess, ⟲ loop-first-ply + %-of-game-looped (balance B1 instrument),
⟲ FLANK×pressure capture share (red-team M9).

Arena (n=120/pairing, both seats): policy ON/OFF · search2 ON/OFF · roadrush vs greedy ·
roadrush vs policy (the 42–58% gate) · roadrush mirror with the M4/M6 diagnostics as
pass/fail. Retrain before arena; tiebreak re-sweep n=2000 on the winning arm.

## Render/UI (agent-built, knob-gated — P1 lessons)

- ⟲ Momentum HUD scoped honestly (completeness M8): NO existing per-player influence
  readout exists — this is a NEW small persistent element (one number per player,
  index.html HUD container + main.js update loop), knob-gated, shown only when
  ROAD_PRESSURE_ON. Build order treats it as its own deliverable.
- Gold pulse along linked network on placement; loop-closure white ring + bell
  (sound.loop()); severance grey-out + falling tone (sound.sever()). Tooltip: linked/
  orphaned + felt pressure on hover. All copy knob-gated with original else-branch.

## Touch-point audit ⟲ (completeness M7 — P1 pattern restored)

- **MP relay (net/supabase.js)**: zero protocol change — roads are derived state,
  recomputed identically on both clients by action replay through the core.
- **Campaign (core/campaign.js)**: snapshotConfig()/restoreConfig() JSON round-trips the
  whole CONFIG — 5 new flat knobs auto-covered. Warden/boss agents get retrained
  20-weight policy: OFF-path features are 0 by knob-gate, weights re-fit at defaults.
- **Deckbuilder/tiles**: no new tiles, no change. **ui/sound.js**: +loop(), +sever().
- **tools/metrics.js**: recordPly reads game.roads for the new committed metrics
  (momentum trajectory, loop plies); tracker fields added.
- **Win screen**: unchanged this round (momentum not added to stats table — HUD covers it).

## Tests (tests/roads.test.js, pins own knobs — P1 lesson)

T1 linked flags (chain linked; island orphaned). T2 momentum count, capital excluded.
T3 ⟲ loop = enclosure: 3-clump triangle → NO loop; capital-fan → NO loop; 6-ring around
a hole → loop; ⟲⟲ MULT locality: rear ring + distant front contact (> REACH apart) →
pressure NOT multiplied; ring within REACH of contact → multiplied. T4 severance on capture (mid-chain cut
orphans tail, roadPower collapses locally, reconnect restores). T5 severance on SUNDER.
T6 pressure applied/capped/REACH-limited (rear blob + straw → tip pressure 1) + OFF
parity: relativeInfluence numerically identical to pre-diff at OFF, ⟲ tied to the
system-level sim parity claim (both asserted, completeness M11). T7 clone copies
linked/roadPower/roads, no aliasing, ⟲ never recomputes (spy/counter). T8 refresh
determinism (identical games → identical flags). T9 policy features knob-gated 0 at OFF,
set on early-return paths. T10 roadrush legal+deterministic. ⟲ T11 WING halves pressure.
⟲ T12 capital-capture branch refreshes roads before phase='over' (post-game read
correct). ⟲ T13 WARD bounce → no refresh needed/no state change. ⟲ T14
roadSurgeThisTurn not cloned. ⟲ T15 SEVERANCE log: fires at drop ≥3, silent at 2,
SILENT at OFF. ⟲ T16 capital exempt from pressure as defender. Existing 85 stay green.

## Build order

1. core: constructor init + refreshRoads (+_boardMutated tail) + pressure term + clone copy.
2. tests T1–T8, T11–T16 green.
3. agents: features (exact BFS) + search cap + roadrush + T9–T10. Retrain.
4. instrument: sweep_p2 + arena_p2 (committed, relative imports).
5. measure → gate verdict → knobs ON or OFF.
6. HUD element (new) + render/UI layer (agent) + browser in-situ both paths.
7. gate #2 two-reviewer pass → close round.

## Status log
- 2026-07-11: rev 1 written. Panel dispatched.
- 2026-07-11: RULES-7 baseline recorded (seed 'p2base', n=300 greedy mirror, knobs OFF):
  fun 39.1 · U .191 · K .541 · P .880 · C 1.0 · LC_excess .359 · captures 5.5 ·
  firstCap T11 · comeback 22.7% · ply 32.1 · P1 47.3%. Gate deltas seed-paired vs THIS.
- 2026-07-11: gate #1 round 1 — 4 Sonnet personas, 4× NOT CLEAR. Convergent root cause:
  global momentum + E≥V loop = degenerate (capital-fan loop on placement 2, cap
  saturation at ~5 tiles, rear-farm severance-immune, capital snipe, tally double-dip)
  + mechanical determinism holes (roads init, capital-capture branch, OFF log leak).
  ALL folded → rev 2: LOCAL roadPower pressure (REACH-bounded), enclosure-based loops,
  capital pressure exemption, tally kept pressure-free, uniform _boardMutated refresh
  rule, exact-BFS features, roadrush arm computes deltas for real, diagnostics
  promoted to pass/fail. Round 2 = scoped fold-verification next.
- 2026-07-11: gate #1 round 2 (fold verifier) — A–N: 11 RESOLVED, 3 PARTIAL, 0 NOT
  RESOLVED; NOT CLEAR on 1 new BLOCKER + 2 MAJOR + 4 MINOR, all localized:
  BLOCKER-1 global loop flag = rear-ring doubles pressure at every front (fixed rev 3:
  per-contact `loopNear` within REACH — MULT localized into the same BFS);
  MAJOR-1 feature indices f[19]/f[20] → f[18]/f[19] (20 weights exactly);
  MAJOR-2 severDamage/momentumGain computed only where a placement resolves — WARD/
  capital/ascend branches explicit 0 (phantom-signal fix); MINORs: createBoard field
  init, TIDEBOUND in no-refresh list, pressure-naming comment, %-plies-pressure≥1
  metric. Round 3 = final verify scoped to these folds ONLY (cap).
- 2026-07-11: gate #1 round 3 (scoped verifier) — FOLD-1 a/b/c RESOLVED (rear-ring
  closed; straw residue bounded 2<cap and severable — intended per T3; ordering clean),
  FOLD-2/FOLD-3 RESOLVED against real policy.js (18 features today, branches (i)-(iv)
  exhaustive, zero-by-fill(0) correct), 4 MINORs present. ONE new MAJOR (no BLOCKERs):
  FOLD-1d `_SEV_OFF` would let disconnected debris form enclosure walls, confounding
  sweep arm 3 — harness-only, zero live-gameplay impact. Fix folded above (⟲⟲⟲:
  enclosure wall set always uses the real capital-rooted BFS). **GATE #1 CLEAR after
  3 rounds** (0 open BLOCKERs; the MAJOR folded with verifier's own minimal fix).
  BUILD starts.
- 2026-07-11 (BUILD + first measurements): core (roads.js + game/mechanics/board grafts) +
  17 new tests (102/102 green) + agents (f[18]/f[19], search cap term, roadrush arm) +
  retrain (20 weights, fitness 0.625) + instrument (sweep_p2/arena_p2, committed).
  System OFF-parity EXACT (39.1/.541/.880/5.5 = baseline). Greedy-mirror sweep n=300:
  ROADS fun 38.9 (−0.2), captures 6.7 (+1.2 ✓), K .523 (−.018), P .884 (+.004),
  comeback 20.3 (−2.4), P1 43% (roads favor the second player — tiebreak re-sweep
  needed if shipping ON). Knob grid FLAT (fun 38.6–39.3 across R×D×CAP×MULT).
  True loops nearly never occur in greedy play (0.1–0.4% of plies) → LOOP_CLOSURE_MULT
  measurement-invisible in mirrors. Seam re-test WITH severance present: comeback still
  crushed (ROADS+SEAM 16.3%, +FRONTIER 11.3% vs 22.7 base) — P1's "severance rescues
  the seam" hypothesis NOT confirmed in road-blind mirrors. R4: 98–100% pre-pass-leader
  wins everywhere (lead is sticky at baseline too). Decisive gate = tuned/adversarial
  arena n=120 (in flight): roadrush band + policy/search ON-vs-OFF.
