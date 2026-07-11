# BLOCKERS — RULES-7 (C1 core-rules, 2026-07-11 overnight)

Per A13: targets that missed after real tuning attempts, shipped as best-achieved
rather than reverted or endlessly re-chased. Everything else in R9's acceptance
list is met — see ARENA_PLAN.md's round entry for the full before/after.

## R9: median first-capture turn — target ≤T8, achieved T9-10

Swept `CONFIG.BOT_RIFT_NUDGE` (the greedy bot's rift-approach pull) across
3/5/8/12 at n=1000 each: zero-capture rate moved a lot (26.5%→3%) but median
first-capture turn held at T9-10 at every strength tried. Read as a geometric
floor, not a remaining tuning knob: `CAPITAL_MIN_DIST_FROM_SEAM=2` on a 9-row
board puts capitals at row ≤2 / ≥6 (mid=4) — reaching adjacency-range contact
from a standing start takes several turns of expansion on each side no matter
how eager either bot is to fight. Baseline was T11 (greedy) / T28 (search2);
shipped is T9-10 (greedy) / T25 (search2) — real improvement, not the T8 target.

**If revisited**: the lever is board geometry (`CAPITAL_MIN_DIST_FROM_SEAM`,
board height, or the rift's row position), not bot tuning. That's a resim-heavy
change (ARENA_PLAN's round-6 notes flag `CAPITAL_MIN_DIST_FROM_SEAM` as
already-tuned-once against a 30% turn-1-KO exploit) — treat as its own sim
round, not a quick follow-up.

## A8: corner-turtle bot arm — target 42-58% winrate, achieved 1.6-8.6%

Built a diagnostic-only "corner turtle" agent (capital placed at the legal
cell nearest an actual corner, all placements constrained to a small radius
of its own capital, never advances) and ran it seed-paired vs the shipped
greedy bot, n=1000 pairs (2000 games). Two variants tried:
- Naive (always ascend, never expand): 1.6% winrate, 44% zero-capture.
- Locally-smart (reuses greedy's own scoring, just radius-constrained,
  radius 3-6 all tried): 7.5-8.6% winrate, 64-65% zero-capture.

The corner-capital ban (A8's actual fix) demonstrably works — turtling isn't
exploitable, which was the underlying design concern. But the sim's specific
42-58%-winrate acceptance band assumed a turtle that's merely *unrewarding
to engage*, not one that's this comprehensively losing. Root cause: a bot
that never advances generates zero pressure on its opponent, so the opponent
wins on the influence clock long before it needs to travel to the corner —
correct game-design behavior (turtling should lose to active play), just not
the specific number the gate named.

**If revisited**: either recalibrate the target band (the qualitative bar —
"not exploitable" — is met) or design a more sophisticated turtle (e.g. one
that still plays WARD/MENACE defensively and contests contact when the
opponent finally arrives, rather than refusing all forward pressure) to
re-measure against a fairer opponent model.

## Gate #2 fun-score judge — 6/10 (playtest, 2026-07-11)

Fresh-eyes judge played two full live bot games. RULES-7 verified working in
actual play: 7 and 5 captures across two 41-turn games (vs a baseline where
>50% had none), war-strata towers and the RIFT STIRS telegraph land as real
visual identity. Scores: tension 6, agency 6, spectacle 7, one-more-game 6.
- BLOCKER it found — V3 delta chips rendered inside the influence-badge sprite
  extent, garbling both numbers on every occupied cell — FIXED (commit
  06248bd: chips moved above-and-beside the badge; capturable cells get an
  elevated ⚔ marker). Judge re-verify confirmed chips readable ("−5, −5, +1")
  before it hit a model usage limit; the ⚔ sits at the same confirmed height.
- MAJOR (round 8): the opening 6-7 plies still have no stakes before armies
  reach contact — midgame is transformed, the opening isn't. Same geometric
  floor as the first-capture miss above; fix is board geometry, not tuning.
- MINOR: capture-warning ring was too subtle — addressed by the ⚔ marker.

## Not a blocker, logged for awareness

- `core/agents/search.js`'s `evaluate()` was named in A12 for rework but
  needed none — it reads `game.boardSummary()`, which already folds in
  Riftlight (A6) and every relativeInfluence change (R3/R4 height & trophy
  math) automatically. No code change, verified via arena.
- policy* vs search2 stays a lopsided 1-2% winrate for policy* — this is the
  same structural gap ARENA_PLAN's round 6 already flagged (myopic 1-ply
  linear policy vs depth-2 adversarial lookahead) and explicitly deferred to
  a future round ("distill search2 trajectories into the policy, buy a real
  search-opponent training budget, or ship search2 as the hard bot"). A12's
  ask tonight was the feature rework + retrain for the new rules, which is
  done (policy* now beats greedy 60.8%, up from an untrained 0.3xx fitness
  baseline on this ruleset) — closing the search2 gap is a separate,
  larger effort.

## 2026-07-11 — RULES8 P1 plan gate #1 hit iteration cap (3 rounds) — OPEN, operator decision needed
Plan: RULES8_P1_SEAM.md rev 3. Round-3 scoped verifier: capital aura RESOLVED, but:
1. **BLOCKER — SCOUT rear-garrison gate is a no-op at deep capitals.** Gate is
   `seamDistance(placed) <= seamDistance(ownCapitalRow)`; bot/default capitals sit at
   row 0/8 where seamDistance=4=board max → gate always true → SCOUT still teleports to
   ring-0 corners turn 1 and garrisons cells the seam should eat. Proposed fix: absolute
   anchor — `seamDistance(placed) <= CAPITAL_MIN_DIST_FROM_SEAM` (=2).
2. **MAJOR — ghost-ban window is 1 ply; open garrison window is 3 plies per ring**
   (ring 0: plies 1-3 unghosted, ordinary lateral placement reaches it legally). Proposed
   fix: pin "ghosted" to the FULL inter-tick window (ring is doomed from the moment it
   becomes next-to-fall; ban = ghosted ∧ ¬capital-aura ∧ empty). Consequence: ring 0
   effectively unbuildable from turn 1 (board opens ~77 cells + aura pockets) — a real
   design shift the operator should bless.
3. **MAJOR — T8 vacuous** (sweeps a knob the legality path no longer reads) + Gate #8
   runnable-line mismatch (sim harness has no capital-liveness fields). Proposed fix:
   T8 → single-config decoupling regression; T9 carries the invariant; Gate #8 wording
   points at tests, or add tracker instrumentation.
Cap rule: only the operator clears/downgrades. Recommended: authorize ONE bounded rev-4
fold of the three fixes above + final scoped verify limited to them.
→ RESOLVED 2026-07-11: operator authorized bounded rev-4 (AskUserQuestion). Fixes folded
into RULES8_P1_SEAM.md rev 4: (1) SCOUT gate anchored absolute to CAPITAL_MIN_DIST_FROM_SEAM;
(2) ghost-ban = full inter-tick window (ring 0 unbuildable from turn 1 except aura pockets —
operator-blessed design shift); (3) T8 relabeled decoupling regression, T10 added, gate #8
points at unit tests not sim. Final scoped verify in flight; build on CLEAR.
