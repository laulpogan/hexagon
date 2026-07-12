# RULES-8 build ledger — "LIMEN: CROSSING" full core rework

Operator chose (2026-07-11): **Full RULES-8 core**, one mechanic per sim round, each
Fun-Index-gated. Multi-session. This ledger is the compaction-safe backbone — re-anchor
here each session. Design spec: `DESIGN_ROUND_8.md`. Instrument + gate: `tools/metrics.js`
funIndex (RULES-7 baseline **38.1/100**, U-late-tension **0.18** = the drag to beat).

Build-loop tier: **HIGH** every phase (core rules · retrain · output-quality-is-the-product).
Cap 2–3 rounds/phase → STOP + BLOCKERS.md. Every phase: `npm run train` + seed-paired
re-sweep vs RULES-7 baseline AND prior phase. Determinism: NO Math.random/Date.now in core/sim.

## Phase sequence + gates (from DESIGN_ROUND_8 §v — build IN THIS ORDER)

| Phase | Ships | Gate | Status |
|---|---|---|---|
| **P0** instrument | Fun Index + baseline | computes from log, A/B stable ±1.0, baseline recorded | ✅ DONE (38.1) |
| **P1** dead opening | Seam Advances + frontier-anchored road legality (connectivity only, NO chain-slide) | first-cap median ≤6 · zero-cap ≤5% · ply 25-45 · P1 48-52% | ⚠️ BUILT, GATE FAILED → ships OFF. Seed-paired n=300 + arena n=120×3: seam+frontier crush comeback (19→8% greedy, 33→13% policy), firstCap unmoved/worse, Fun 38.2→34.3. Squeeze helps the leader; comeback lever (severance) is P2. Machinery+tests+UI live behind knobs (SEAM_MAX_RINGS:0, FRONTIER_ANCHOR:false); RE-EVALUATE INSIDE P2 with severance present. Retrained (18-feat, fitness .688). OFF-parity proven (38.1 = baseline). |
| **P2** roads full | chain-slide + loop-closure×2 + severance + road-rush bot arm | road-rush bot 42-58% · captures ≥ RULES-7 · Killer+Permanence up · ply held | ⚠️ BUILT, GATE FAILED → ships OFF (ROAD_PRESSURE_ON:false). w10 road-rush 68.8%/72.5% vs tuned greedy/policy, 67-70% even at weakest knobs — momentum-as-blob-count structurally rewards pure expansion (risk #3). Mirror = 0.5-capture turtle-farm; K down every pairing. BUT severance lifted comeback 23.3→27.5% (lever works). Machinery/tests/UI live behind knob. Fix target for a future round: shape-sensitive momentum (frontline-only or longest-path). Seam re-test WITH severance: comeback still crushed (16.3%/11.3%) — seam stays OFF. |
| **P3** action stages | Cascade + Vanguard (multi-placement) | median placements/turn >1 · SkillDepth into 65-85% · ply/balance held | ▫ (draft plan: RULES8_PHASE1_CASCADE.md — RENAME, it's P3 not P1) |
| **P4** traps & telegraphs | Wards (face-down capture-trap) + Sagas/On-Reveal | Fun Index ↑ vs P3 · comeback ↑ · balance 48-52% · flag hidden-info ranked blocker | ▫ |
| **P5** interaction & climax | Threshold beat (capture-only FAST window) + escalating collapse + sudden-death | MP relay replay-identical · silent-ending share ≪70% · U-late ↑ · ply held | ▫ |

**Whole-round acceptance (charter #2):** RULES-8 beats RULES-7 on Fun Index; no regression to
balance / 25-45 ply band; first-cap ≤6; zero-cap ≤5%; median placements/turn >1; every headline
mechanic has a signature animation.

## New CONFIG knobs to add + sweep (design §vi)
SEAM_ADVANCE_START, SEAM_ADVANCE_CADENCE (P1 — co-tune vs first-cap≤6 AND ply 25-45);
ROAD_CHAINSLIDE_REACH_CAP, LOOP_CLOSURE_MULT=2, severance orphan rule (P2); CASCADE_MAX + grant
count (P3); WARD_COST / Sapper-Feint density (P4); SAGA_CHAPTER_POWER (P4); THRESHOLD_BEAT_SCOPE,
RIFT_STIRS_ESCALATION, Cataclysm radius, sudden-death threshold (P5).

## Standing risks (design §vi)
1. Sim recalibration non-negotiable — P1 (Seam) is the largest single perturbation attempted; own round.
2. Road reach = the exploit class patched twice (SCOUT rush, capture-from-anywhere) → ships heartland-gated,
   must clear the dedicated road-rush bot arm (P2 gate), not a mirror-winrate check.
3. Momentum snowball → severance is the comeback lever; comeback-rate must be MEASURED (Fun ComebackRate).

## Candidate mechanics (unscheduled — each needs own gated round)
Civ 6 steals (`analysis/civ6_adjacency_steals.md`). LOYALTY (the system Limen's core IS —
operator, 2026-07-11): **L1 Waver** (gradual telegraphed flips — candidate to contest P4's
slot; directly attacks U-late 0.18) · L2 Unbound neutral state (pairs w/ P2 severance) ·
L4 momentum-as-age-factor (fold into P2 as `MOMENTUM_PRESSURE_SCALE` knob) · L3 pressure
radius (expensive, unscheduled). Adjacency layer: S1 adjacency+pressure preview UX
(UI-only, ship anytime — also loyalty's #1 documented failure is opacity; one overlay
serves both) · S2 Attunement pairs (~P3.5) · S3 Resonance rite (P4/P5 filler) · S4 ley
nodes (unscheduled).

## Status log
- 2026-07-11: operator chose full-core. Ledger created; sequence re-anchored (P1=Seam, not Cascade).
  Campaign P1 (separate meta-feature) done + browser-verified. Starting P1 Seam Advances build next.
- 2026-07-11: P1 plan gate #1 ran (4 Sonnet personas): 5 BLOCKERs 7 MAJORs → all folded into
  RULES8_P1_SEAM.md rev 2 (knobs 8/6→5/5, ghost-ring ban, SCOUT rear-gate, capital ring floor,
  backfill clause, seam-blind agent feature, BOT_RIFT_NUDGE freeze item). Fold-verification
  pass in flight. Cascade plan renamed → RULES8_P3_CASCADE.md. Civ 6 loyalty/adjacency steals
  researched (operator ask) → analysis/civ6_adjacency_steals.md + candidates section above.
- 2026-07-11 (later): gate #1 ran 3 rounds (cap). Rev 2 folded panel; rev 3 fixed verifier's
  NEW-1/2/3 (capital aura replaces ring floor). Round-3 verdict NOT CLEAR: SCOUT-gate no-op
  BLOCKER + ghost-window & T8 MAJORs → STOPPED per cap rule, escalated. Open items +
  proposed fixes: BLOCKERS.md 2026-07-11 entry. P1 build NOT started.
- 2026-07-11 (P1 round CLOSED): built → measured → gate FAILED honestly → ships OFF behind
  knobs; gate #2 two-reviewer pass done, all findings fixed (incl. f[17] OFF-leak +
  misleading UI copy). Reusable instrument: tools/sweep_seam.mjs + tools/arena_seam.mjs.
  85/85 tests; OFF-parity 38.2; both paths browser-verified. NEXT: P2 roads round —
  chain-slide + loop-closure + severance + road-rush bot arm; re-test SEAM_* + FRONTIER_
  ANCHOR arms INSIDE P2 (severance = the missing comeback lever). P2 TODO carried from P1:
  R4/R5/R6 sim checks (bank-the-lead, lateral-share, per-tick parity) as committed metrics.
- 2026-07-11 (P2 round OPEN): plan RULES8_P2_ROADS.md rev 1 → gate #1 panel (4 Sonnet
  personas) 4× NOT CLEAR — convergent root: global-momentum + E≥V loop degenerate
  (capital-fan loop on placement 2; rear-farm severance-immune; capital snipe; pressure
  leaking into influence tally) + determinism holes (roads init, capital-capture branch,
  OFF log leak). Rev 2 folded: LOCAL roadPower (REACH-bounded), enclosure loops,
  capital exemption, tally pressure-free, uniform refresh rule, exact-BFS features.
  Baseline pinned (seed 'p2base' n=300): fun 39.1 · K .541 · P .880 · capt 5.5.
  Round 2 fold-verification in flight. Build NOT started.
- 2026-07-11 (P2 round CLOSED): gate #1 cleared rev 3 (3 rounds) → built (core/roads.js,
  102/102 tests, f[18]/f[19] retrain, roadrush arm, sweep_p2/arena_p2, knob-gated UI,
  browser-verified both states) → measured → GATE FAILED structurally (see P2 row) →
  ships OFF, retrained at defaults (.625), OFF-parity byte-exact (39.1). Committed
  89131c3 (build) + 9c84030 (flip) → pushed limen-design (operator go). Learnings
  carried: severance = real comeback lever; momentum formula must be shape-sensitive;
  greedy mirrors are road-blind (tuned-agent arena is the real instrument).
  NEXT: P3 Cascade + Vanguard — the multi-placement round (median placements/turn >1),
  the operator's felt-experience ask (2026-07-11: "tight multi-tile combat").
- 2026-07-11 (P2 gate #2 CLOSED): both reviewers back — OFF-parity PASS zero findings
  (byte-identical RULES-7, n=300 exact baseline reproduce); ON-wiring CLEAR 0 BLOCKERs,
  verdict upheld (knob confirmed ON at measurement commit via git history). 1 MAJOR
  fixed: arena_p2/sweep_p2 ON arms now patch ROAD_PRESSURE_ON:true explicitly (were
  ambient-default → inert from HEAD; landmine for the future shape-sensitive-momentum
  round). 2 MINORs fixed (doc arg-shape, looped% label). 102/102. P2 fully closed.
- 2026-07-11 (P3 round OPEN, gate #1 CLEAR after 3 rounds): rev 1 (Cascade +
  restriction-Vanguard) → 4-persona panel ~10 BLOCKERs (turn=ply not round; restriction-
  Vanguard structurally unfair + gates win condition + two legality choke points +
  SUNDER/TRAMPLE mislabeled as captures; search bestReply cascade-blind; funIndex
  sample-indexing corrupt under multi-placement; SkillDepth ladder broken at HEAD —
  policy* 40% vs greedy live-measured; comeback arm unfalsifiable; deck OFF-parity
  confound). Rev 2 folded all; Vanguard REDESIGNED restriction→bounty (holder's own
  first capture of round draws 1 card — no legality gating). Round-2 verifier NOT CLEAR
  (branch-scoping mechanismless; metrics keyed post-action; bounty had P1-spoiler race)
  → rev 3 fixed (fireOnPlacement branch param; pre-action turnBefore keying; holder-own-
  capture semantics). Round-3 scoped verifier CLEAR + 1 MAJOR folded (hand-exhausted
  turn-end clause). Plan: RULES8_P3_CASCADE.md rev 3. BUILD IN PROGRESS.
