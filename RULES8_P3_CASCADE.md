# RULES-8 P3 — Cascade + Vanguard Bounty (action stages, kills single-placement)

Build-loop tier: **HIGH**. Goal-drift anchor — survives compaction. **Rev 3** (2026-07-11):
rev 2 folded the 4-persona panel's ~10 BLOCKERs (markers ⟲); rev 3 folds the round-2
verifier's findings on the fold itself (markers ⟲⟲).

## Why (operator, verbatim intent)
"Get rid of the single tile a turn placement... dynamic long interactive turns." Post-P2:
"this was not the tight multi tile and card draw a turn combat i was told to expect."
The felt-experience round — changes action economy directly, not an invisible formula.

## Mechanic 1 — Cascade (multi-placement)
Base 1 placement/turn unchanged (`PLACEMENTS_PER_TURN: 1` untouched). A tile with the
`CASCADE` keyword grants +1 placement on place (`placementsLeft++`), capped by
`MAX_PLACEMENTS_PER_TURN: 3` total actions/turn. Chains of 2–3 drops.

**Pins (⟲ panel):**
- ⟲ `placementsThisTurn` increments **unconditionally next to every `placementsLeft--`**
  (both `placeFromHand` — covering ALL 4 exit branches incl. WARD-bounce + capital-capture
  — and `castRite`). Cap = total actions consuming placementsLeft. Scalar; cloned; reset in
  `_beginTurn`.
- ⟲⟲ CASCADE grant mechanism (rev-3 fix — rev 2 stated the outcome, no mechanism:
  `fireOnPlacement(game,tile,col,row,captured)` gets `captured=null` on BOTH self-ascend
  and empty-cell placement, indistinguishable): extend the signature with a `branch`
  param — game.js:452 site passes `'place'`, game.js:397 self-ascend site passes
  `'ascend'`; existing hooks ignore it. CASCADE hook first lines: knob check → `branch
  === 'place'` → cap check. Kills one-turn SUMMIT rush (reachable: TIER_MAX 3 =
  SUMMIT_HEIGHT_THRESHOLD 3 = MAX_PLACEMENTS 3). NOT on WARD-bounce (inherent —
  fireOnPlacement unreached; pinned as deliberate anti-cascade counterplay, in help).
- ⟲ Hook is a COMPLETE no-op when `CASCADE_ON:false` — knob check is the first line; no
  log, no state read/write (P1/P2 named OFF-leak bug class).
- ⟲ CASCADE tiles = **promote 2–4 existing filler tiles IN PLACE**: identical stat body,
  identical count, keyword-only diff (OFF-parity else breaks — deck is fixed at 20 and
  additions displace tiles in BOTH arms). CASCADE never stacks with a COMPOUNDING/
  OFFENSIVE keyword (SIEGE/FLANK/TRAMPLE/RALLY/SUSTAIN/SCOUT — each strengthens the
  next drop in the same chain; red-team combo findings). Defensive carriers (WARD/
  WING) are permitted — as-built deviation red-teamed post-hoc (gate #2): keyword-
  isolation probe at matched density showed identical chain fuel, captures SUPPRESSED
  (5.8 vs 6.9 all-vanilla), balance closer to 50%; no exploit window at any density.
- ⟲⟲ Turn end with unused grants: if `placementsThisTurn ≥ 1` and no legal action remains,
  the turn ends WITHOUT `consecutivePasses++` (a turn that acted is not a pass; prevents
  cascade-induced spurious double-pass game-end). Rev-3 pin: "no legal action" =
  `legalMoves()` empty AND no castable rite in hand (`legalRiteTargets` — legalMoves
  skips rite cards, game.js:297) AND no discard available = `discardsLeft === 0 ||
  hands[player].length === 0` (⟲⟲⟲ round-3 verifier: discardRedraw also needs a hand
  tile, game.js:524; bot.js:113 already encodes the combined check — a hand emptied
  mid-cascade would otherwise fall through to pass() and reopen the bug). Lives in
  `_afterAction()` as a new branch beside the `placementsLeft<=0` check. Test must
  include the hand-exhausted-mid-cascade case. (Existing `pass()` gate has the same
  rite-blind-spot pre-P3; left as-is, noted.) Genuine no-action turns still route via
  `pass()` — stall detection unchanged.
- ⟲ Draw stays 1/turn. Cascade turns net-spend hand — natural chain brake, intended.
  Exhaustion-ending share tracked as diagnostic (hand-economy confound, instrument panel).
- ⟲ Discards never touch placementsLeft (verified) — stated, not implicit.
- ⟲ Same-turn combo compression (e.g. drop-2 TRAMPLE softens, drop-3 captures) is the
  POINT of the round — accepted risk, caught by gates 3/4/6 if degenerate, not banned.
- ⟲ Naming: `MAX_PLACEMENTS_PER_TURN` supersedes design-doc's `CASCADE_MAX` (semantic =
  total per turn incl. base, not chain length). Ledger knob line updated at close.

## Mechanic 2 — Vanguard **Bounty** (⟲ REDESIGNED — rev-1 restriction killed by panel)
Rev-1 Vanguard (non-holder capture-ban + first-capture unlock) was structurally unfair:
fixed turn order + unlock-propagation makes the second mover's capture access a strict
superset every round regardless of start-holder; it also gated lethal capital captures
(win-condition override) and needed two legality choke points (SUNDER's bespoke
`isLegalTarget` never calls `isCapturable`). Not tunable — replaced with a carrot:

**Rule:** `round = Math.ceil(game.turn / 2)` (⟲ `game.turn` is a PLY counter — verified;
rev-1's "turn counts rounds" was false). Holder alternates by round; **round 1 holder =
P1** (baseline already favors P2 59/41 pre-tiebreak; giving P2 the first bounty would
compound it — ⟲ red-team; sweep arm: P2-start). ⟲⟲ Rev-3 fix (round-2 verifier B1:
"round's first capture" recreated a fixed-turn-order race — P1 moves first every round
and could spoil P2-holder rounds by capturing first): the bounty triggers on **the
HOLDER's own first capture of the round**, independent of anything the opponent does.
No race, no spoiler, zero turn-order coupling. When it triggers, holder draws 1 card
via plain `_draw()` (⟲⟲ HAND_MAX does not exist in the codebase and is not being
invented — no play-time hand cap exists today; growth is bounded by captures made and
deck size; hand-size distribution tracked as a diagnostic in arm 5). No legality
change anywhere — no choke points, no dead rounds, no capital override, agents need no
move filter. Attacks the dead opening by paying for early aggression (P1 seam failed by
punishing the trailer; bounty rewards the fighter).

**Pins:**
- "Capture" = ownership-transfer via placeFromHand capture branches ONLY. ⟲ SUNDER
  destroys (no transfer, no stats.captured) — NOT a capture, earns no bounty; TRAMPLE is
  a keyword not a rite and never captures (rev-1's definition was wrong).
- State: single scalar `bountyClaimedThisRound` (⟲⟲ holder-own-capture semantics need no
  opponent-visible first-capture flag); cloned (scalar copy — ⟲ NOT "two-level", that
  language was borrowed from roads' nested shape); reset ONLY at round boundary =
  `_beginTurn` entering an odd `game.turn` (⟲ NOT every onTurnStart — the per-ply reset
  pattern would wipe it mid-round). Replay-safe: maintained state driven by deterministic
  actions; MP action-log replay unchanged.
- `VANGUARD_ON:false` → hardcoded early return, zero reads (OFF-leak discipline).
- Capital captures, ascension, rites: all untouched by Vanguard (no gating exists).

## Knobs (all flat scalars; campaign snapshotConfig auto-covers)
`CASCADE_ON:false` · `VANGUARD_ON:false` · `MAX_PLACEMENTS_PER_TURN:3` ·
`CASCADE_TILE_COUNT` (2–4 sweep, via promotion set) · `VANGUARD_START_HOLDER:1`.
⟲ Instrument rule: EVERY sim/arena arm patches EVERY knob it depends on explicitly —
each gate arm below states its `{CASCADE_ON, VANGUARD_ON}` patch. Never ambient defaults.

## Instrument fixes REQUIRED BEFORE measurement (⟲ instrument panel — all three would
have invalidated the round's numbers)
- **metrics turn-dedupe:** funIndex U/K/P/lcRate assume one influence sample per real
  turn; cascade injects multiple same-turn samples (K/P inflate mechanically, lc dilutes,
  U/comeback percentile drift). Fix: collapse `influenceSamples` to the LAST sample per
  pre-action turn id (see keying fix below) before U/K/P/lc computation. At 1
  placement/turn this is identity ⇒ P2 baseline (fun 39.1) must reproduce EXACTLY after
  the change — that's its own parity test.
- **`placementRows` gains `turn` field** — ⟲⟲ keyed on a PRE-ACTION snapshot: the
  harness loop reads `turnBefore = game.turn` before dispatching `takeTurn`/`botTakeTurn`
  and passes it to `recordPly` (rev-2's "read game.turn in recordPly" was wrong: a
  turn-ending action has already run `_endTurn→_beginTurn→turn++` synchronously, so the
  final placement of a cascade turn would log the NEXT turn's id and dedupe would keep
  an incomplete mid-cascade board state). With pre-action keying, all N placements of a
  turn share one id and last-sample-per-id = the true end-of-turn state. Same keying for
  the influence-sample dedupe. Rites counted as actions (charter #4 says
  "placements/actions per turn"; rites consume placementsLeft). Gate arm 1 computes
  median ACTIONS/turn from `(player, turnBefore)` groups.
- **search.js cascade fix (correctness, not perf):** `bestReply()` applies one placement
  and assumes the ply ends — under Cascade it (a) scores incomplete opponent turns and
  (b) worse, spends the search agent's OWN granted placement via the cheap default-weight
  heuristic instead of its real evaluation. Fix: reply/self-completion loops until
  `currentPlayer` changes or phase over. Plus a knob-gated cascade term in `evaluate()`.
  Without this, the SkillDepth gate measures a self-degraded agent — unfalsifiable.
- **SkillDepth ladder re-pin:** live arena (n=25 pairs) shows `policy*` LOSES to greedy
  (40%) — the `greedy < policy < search2` ladder is broken at HEAD (policy regression
  post-P2-retrain: separate issue, logged). Canonical strong-vs-weak = **search2 vs
  greedy (verified 100%)**; policy pairings reported as diagnostics only until retrain
  re-orders the ladder (re-verify empirically at baseline pin, never assume).

## Falsifiable gate (seed-paired; arena n≥120/side; sim n≥300; arm 5 n≥600)
1. **Median actions/turn > 1** — `{CASCADE_ON:true, VANGUARD_ON:false}`.
2. **SkillDepth:** search2-vs-greedy pulled from 100% into **65–85%** — measured ONLY
   post-retrain + post-search-fix — `{CASCADE_ON:true, VANGUARD_ON:false}`.
3. **Held bands:** P1 48–52% (tiebreak re-sweep post-retrain), ply 25–45, completion
   ≥.90, zero-cap ≤5%, no stalls, AND ⟲ **first-capture median ≤6 as a HARD gate**
   (charter #3 restored; rev 1 had demoted it to "should") — full-ON arm
   `{CASCADE_ON:true, VANGUARD_ON:true}`. ⟲⟲ Diagnostic: per-player bounty-claim share
   (must not hide a turn-order skew inside a compensated aggregate band).
4. **Adversarial arm** — `core/agents/cascaderush.js` (⟲ named deliverable): greedy base
   score + w×(cascade-fire + chain progress this turn), i.e. maximize actions/turn.
   Band 42–58% vs tuned greedy AND policy at w sweep; mirror captures ≥ 5.5 (no
   turtle-farm). Diagnostic: chain-frequency per CASCADE_TILE_COUNT (low density may
   underpower the arm — report, don't hide). `{CASCADE_ON:true, VANGUARD_ON:false}`.
5. **Vanguard isolation** — `{CASCADE_ON:false, VANGUARD_ON:true}`, sim n≥600 (⟲
   comeback is a rare-event proportion; n=120 CI ±7.5pp is blind): **ComebackRate ≥ 18%
   hard floor** (base 22.7%, CI ~±3.3pp at n=600) AND first-cap median ≤6 hard.
   ⟲⟲ Diagnostics: per-player bounty-claim share + hand-size distribution (unbounded
   growth check — no play-time hand cap exists).
6. **Compound nova-check** — `{CASCADE_ON:true, VANGUARD_ON:true}`: captures-per-turn
   burst distribution + multi-capture-turn share (⟲ red-team's bank-then-nova exploit:
   quiet rounds then 3-captures-in-one-turn) + ⟲⟲ per-player bounty-claim share;
   balance band held. If nova share dominates wins, the compound ships split or not
   at all.
7. **OFF-parity byte-exact:** both knobs false ⇒ fun 39.1 / capt 5.5 on 'p2base' n=300
   (post metrics-dedupe, which must be identity at 1/turn).
8. **Tests** (⟲ use `neighborCoords()`, never hand-rolled offsets): cascade grant/cap/
   no-turn-flip; no grant on self-ascend; no grant on WARD-bounce; unused-grant turn-end
   does NOT increment consecutivePasses; vanguard bounty both players/rounds, round-
   boundary reset (P2's turn must not wipe it), SUNDER earns no bounty (named case);
   clone copies scalars; determinism; OFF = zero reads both knobs; search completes
   full turns under cascade (the silent-bug test).
9. **Retrain sequencing:** retrain (new features: f[20] cascade value, f[21] bounty-
   available×capture, knob-gated exact) BEFORE arms 2/4/6; if gate passes and knobs flip
   ON, retrain again at shipped defaults (P1/P2 discipline).

## Build deliverables (each with its live caller — no shelf-ware)
Core: config knobs; game.js (`placementsThisTurn`, bounty state, round derivation, clone,
turn-end rule); mechanics.js (CASCADE hook, branch-scoped); tiles.js (keyword metadata +
promotions). Agents: search fix + evaluate term; policy f[20]/f[21]; cascaderush.js.
Instruments: metrics dedupe + placementRows.turn + actions-median; `tools/arena_p3.mjs` +
`tools/sweep_p3.mjs` (⟲ named; P2 pattern, explicit knob patches per arm). UI (knob-gated,
pre-P3 else-paths): ⟲ `ui/hud.js:107` "draw 1, place 1" copy → dynamic; ⟲ `index.html`
how-to-play "one action" section rewrite + new Vanguard prose section (no registry hook —
hand-written, like THE RIFT section); `main.js` hint branch for cascade-granted state;
transient `game.cascadeFiredThisPly` cue (P2 roadSurge pattern: set on grant, reset
onTurnStart, never cloned... reset EVERY ply is correct here, it's per-ply UI cue);
comet-trail = NEW traveling primitive (lerp glow between cell centers — ⟲ no existing
traveling effect; P2's "chain race" is actually a simultaneous flash) — name it
`_chainTrailAnims` (⟲ `_cascadeAnims` already exists = unrelated V4 badge-tick feature);
Vanguard banner + bounty chime. Sounds via existing sound.js pattern.

## Known risks (updated)
- R1 leader-accelerant: extra actions worth more when ahead (more legal cells/targets).
  Gates 3/5/6 (comeback floor + balance) are the detectors; mitigation lever if failed:
  MAX 2, or cascade grant only when behind on tiles (last resort, adds asymmetry).
- R2 nova compound (gate 6 owns it).
- R3 search wall-clock after the completion fix: full-turn simulation multiplies branch
  cost — budget check before n=500; degrade to sampled continuations if needed (document).
- R4 policy regression at HEAD (loses to greedy) — investigate during retrain; if
  training can't re-order the ladder, SkillDepth rests on search2-vs-greedy alone.
- R5 hand exhaustion shift: exhaustion-ending share diagnostic on every arm.

## Loop
This file = rev 3 (round cap REACHED — if the round-3 scoped verifier is not clear,
STOP + BLOCKERS.md + escalate to operator; no round 4). Determinism: NO
Math.random/Date.now in core/sim. Commits on limen-design only; operator go before
pushing gameplay changes live.

## Status
- 2026-07-11: rev 1 (Cascade + restriction-Vanguard) → gate #1 panel (4 Sonnet: red-team,
  determinism/state, instrument validity, completeness). Convergent kills: game.turn is a
  ply counter (all four); restriction-Vanguard structurally unfair + gates the win
  condition + needs two legality choke points + SUNDER/TRAMPLE "capture" definition
  factually wrong (red-team + determinism + completeness); search bestReply cascade-blind
  corrupts SkillDepth (three reviewers); funIndex sample-indexing corrupted by multi-
  placement; SkillDepth ladder empirically broken at HEAD (policy* 40% vs greedy, live
  n=25); comeback arm unfalsifiable (no floor, n underpowered); deck-composition OFF-
  parity confound; fireOnPlacement misses 2 of 4 branches; spurious double-pass end;
  self-ascend/SUMMIT rush; UI copy + how-to-play + _cascadeAnims collision + no traveling
  primitive; first-cap gate demotion; missing named instruments. ALL folded → rev 2:
  Vanguard redesigned restriction→bounty (design call, documented above); Cascade pinned
  branch-scoped; metrics dedupe + search fix promoted to pre-measurement requirements;
  gates rewritten with explicit knob patches + hard thresholds + n=600 comeback arm.
  Fold-verification round 2 next.
- 2026-07-11 (round 2 → rev 3): fold verifier NOT CLEAR — 2 BLOCKERs + 1 MAJOR, all new
  material exposed by rev-2's own fixes (10 of 12 rev-1 folds verified correct, SkillDepth
  numbers independently reproduced live). C1: CASCADE branch-scoping had no mechanism
  (`captured` is null on both self-ascend and empty-cell placement) → rev 3 pins a
  `branch` param on fireOnPlacement ('place'/'ascend'). C2: metrics dedupe keyed on
  post-action `game.turn` (turn-ending action already incremented it → dedupe would keep
  incomplete mid-cascade state) → rev 3 keys on pre-action harness snapshot `turnBefore`.
  B1: "round's first capture" bounty recreated a fixed-turn-order race (P1 moves first
  every round, could spoil P2-holder rounds) → rev 3: bounty = HOLDER's OWN first capture
  of the round, opponent-independent; per-player claim-share diagnostic added to arms
  3/5/6. MINORs: HAND_MAX doesn't exist → plain _draw(), no invented cap, hand-size
  diagnostic; turn-end "no legal action" check now includes rites + discards explicitly.
  Round-3 SCOPED verification next (cap reached — not clear ⇒ STOP + escalate).
- 2026-07-11 (round 3 — GATE #1 CLEAR): scoped verifier CLEAR; all 5 rev-3 deltas
  verified mechanically sound against real code (both fireOnPlacement sites confirmed,
  hooks inert to new arg, pre-action keying math traced, round-boundary algebra exact,
  no hand cap exists, whole-file contradiction scan clean). 1 MAJOR folded verbatim
  (⟲⟲⟲): turn-end discard clause needs `|| hands[player].length === 0` (hand emptied
  mid-cascade would reopen the double-pass bug); assigned to _afterAction with the
  hand-exhausted test case named. BUILD starts.
- 2026-07-11 (BUILT + MEASURED — verdict to operator): core+agents+instruments+tests
  (115/115, OFF-parity byte-exact 39.1/5.5/32.1 re-verified after every layer) +
  retrain at full-ON (22 weights, fitness .719 — ladder restored: policy* 56.3% vs
  greedy) + knob-gated UI browser-verified both states (UI agent also caught+fixed a
  post-action-turn-read staleness bug in the chain trail — same class as C2).
  MEASUREMENTS (sim n=300 'p2base' + arena n=120):
  • CASCADE only: fun 41.9 (+2.8, best R8 result), K .541→.633, capt 5.8, turns 27.5,
    P1 49.3%, comeback 22.3%, multi-action turns 14% (mean 1.16), burst 11%. Density 4:
    fun 42.7, multi 18%. FULL ON: 42.2, comeback 24.3%, claims 285/292 symmetric,
    maxHand 9. VANGUARD only (n=600): fun 38.4, comeback 20% (≥18% floor ✓), firstCap
    unmoved. Start-holder probe: no asymmetry either way.
  • Arena: policy mirror FULL capt 5.0 vs 4.5 OFF (real agents fight MORE);
    comeback 35%; search2 mirror FULL comeback 32.5%; no nova dominance (burst 9-12%).
  GATE LETTERS FAILED (all four look mis-specified rather than mechanic failures —
  operator ruling required, NOT self-graded):
  1. median actions/turn = 1 (structural: can't cross 1 below ~50% deck density;
     mean 1.16-1.22, multi 14-18% is the honest distribution).
  2. SkillDepth: search2 vs greedy 97.1%→95.8% (CASCADE)→93.8% (FULL) — direction
     right, nowhere near 65-85% (14% multi-turns ≠ enough branching to blunt depth-2).
  3. cascrush band 42-58%: reads 25-32.5% at every w — the exploit strategy LOSES
     (band was designed to catch dominance; red-team predicted exactly this tail).
     Mirror capt 1.8 < 5.5 letter-fails but is an artifact of the weak bot — real-agent
     mirrors show captures UP.
  4. firstCap T9 vs ≤6 hard — unmoved by any mechanic ever measured (standing charter
     debt; P1's dedicated round also failed it; T10 at baseline).
  RECOMMENDATION: ship CASCADE_ON:true + VANGUARD_ON:true (density 3 shipped; 4 as
  operator taste — fun 42.7 vs 41.9, multi 18% vs 14%). Every metric with a real
  baseline improved or held; adversarial arm shows no exploit; UI verified. Weights
  file already trained at full-ON (held out of commit until decision). Gate #2
  built-thing review dispatched. AWAITING OPERATOR: ship-ON go / gate-letter rulings.
- 2026-07-11 (GATE #2 CLOSED — ship-ON recommendation UPHELD by both reviewers +
  scoped red-team): Reviewer 1 (OFF-parity) found 1 BLOCKER + 1 MAJOR, both FIXED:
  (a) search.js completeTurn refactor modeled a phantom extra ply at OFF — campaign
  bosses played differently than pre-P3 (instrumented: 2 bestReply calls where 1
  intended; live-reachable via campaign) → fixed with a currentPlayer guard; C14
  regression test pins the 100% strong-vs-weak OFF baseline (10-0, passing); post-fix
  re-measure: SkillDepth OFF 98.8 / CASCADE 96.7 / FULL 99.2 (n=240 each — gate
  letter 2 still decisively unmet, cleaner data, same conclusion; ship-basis arms
  never used search). (b) CASCADE keyword badge/tooltip leaked at OFF in deckbuilder/
  collection/campaign-draft/hand-HUD/board-tooltips/help-glossary → visibleKeywords()
  helper in data/tiles.js wired through all six surfaces; repo swept, no unguarded
  .keywords render remains. MINOR: medianFirstCapture diagnostic shifted 11→10 by the
  pre-action keying (semantically more correct; re-pin baselines against new keying).
  Reviewer 2 (ON-wiring/evidence) independently REPRODUCED every headline number
  byte-exact (sweep to the decimal; own cascrush harness 22.9-30% confirms exploit
  loses; bounty telemetry pipeline traced end-to-end — 285/292 symmetry is real,
  ~1.9 claims/game plausible; deck trim deterministic+symmetric, keeps THICKET+
  PETRIFIED-ROSE+1 POLLENCLOUD). Verdict: no finding overturns fun +2.8 / no-exploit
  / claim symmetry / OFF-parity. Its open MAJOR (WARD/WING carrier deviation skipped
  review) sent to a scoped red-team → CLEAR with keyword-isolation evidence (chain
  fuel identical; defensive carriers suppress captures 5.8 vs 6.9, sit closer to 50%;
  cascrush loses at every density) — pin wording narrowed to compounding/offensive
  keywords. MINORs: loadTrainedPolicy now warns loudly on fallback; chain-trail
  pass-edge cosmetic staleness documented, not fixed (visual only). 116/116 tests.
  STILL AWAITING OPERATOR: ship-ON (density 3 or 4) / ship-OFF / gate-letter rulings.
