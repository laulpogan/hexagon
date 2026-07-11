# Round 8 charter — "make it a 10/10"

Goal-drift anchor (build-loop, HIGH tier: output-quality-is-the-product + rip-up-the-core).
Survives compaction. Re-anchor on this each round. Iteration counter lives here.

## Operator directive (verbatim intent)
- Mine deepest reaches of the web for hex placement / capture / map-building ideas.
- Reincorporate ROADS as **pre-inscribed paths on tiles** (place multiple, multi-action turns).
- Critique the CENTRAL STRUCTURE — splashier, more fun, quicker-moving.
- Add **action stages** (or equivalent) → push-and-pull, dynamic long interactive turns.
- **Trap tiles**: flip if taken, capture the attacker's piece instead.
- Tiles with **on-placement effects** (draw tiles, destroy tiles).
- **Instants & sorceries** equivalent — actions that change the flow / alter rules.
- Reasons to strategically FIGHT over one place vs another.
- KILL single-tile-per-turn placement.
- Resource economy earlier → **massive late turns**.
- Process: plan → counterplan → revision → thesis → synthesis (dialectic).
- Add **FUN** to the simulator (SOTA agent-based fun measurement) and use it to gauge every iteration.
- Target: **fun score 10/10.** "I don't care what you have to change."

## Success criteria (falsifiable, sim-gated)
1. Fun Index metric lands in tools/metrics.js, computable from the deterministic game log, seed-paired A/B-able.
2. RULES-8 synthesis beats RULES-7 baseline on Fun Index AND does not regress balance (first-player winrate in band) or turn-length target (25–45 plies) in seed-paired sweeps.
3. Dead opening dies: first-capture median ply ≤ 6 (was T9–10), zero-capture rate stays ≤ 5%.
4. Multi-action turns real: median placements/actions per turn > 1.
5. Every headline mechanic has a signature animation specced.

## Constraints (hard)
- Deterministic core only (seeded rng; NO Math.random/Date.now in core or sims).
- Retrain (`npm run train`) + seed-paired tiebreak re-sweep after ANY rules change.
- Never commit/merge to main (Pages serves `limen-design`). Branch discipline holds.
- Reviewer personas = Sonnet; only final synthesis = Opus.
- Don't loop media/cordial-jasper in unless operator asks — this is a rules-design run.

## Iteration counter
GATE_DESIGN_ROUNDS: 0
GATE_BUILT_ROUNDS: 0
Cap: 2–3 rounds per gate, then STOP + escalate (write open blockers to BLOCKERS.md).

## RULES-7 baselines (the bar RULES-8 must beat, seed-paired)
- **sim.js greedy-mirror n=500:** Drama 78.2 · P1 53.4% (267/500, slightly hot vs 48–52) · avg 31.6 plies · captures/match 6.1 · medianFirstCapture **T10** · comeback 15% · zeroCap 3.6% · stall 0% · mutualTurtle 0%.
- **arena skill-depth n=12 pairs:** greedy vs search2 **0–24** (depth-2 100%); greedy vs policy 8–16 (67%); search2 vs policy **24–0** (100%). READ: 2-ply lookahead solves placement → shallow/solvable. RULES-8 target = pull strong-vs-weak into a healthy 65–85% band (not 100%), proving mixed-strategy depth.
- **Fun Index baseline RULES-7 = 38.1/100** (tools/metrics.js funIndex, Browne-grounded, live 2026-07-11).
  Sub: U(uncertainty-late) **0.18** [band .55-.85 → the dominant gap, weight .30], K 0.514, P 0.886, C 1.0,
  LC_excess 0.368 (rate 0.158 vs target 0.25), Dur_dev 0.218. **RULES-8 must drag U toward ~0.70** while
  holding gates. Calibration: LEAD_CHANGE_TARGET=0.25 (RULES-7 sits at 0.158; target set above baseline to
  reward more dynamism — the un-fun baseline should NOT define the target). M_PREF=35. skillDepthNorm from
  arena = 1.0 (solved). Old dramaIndex kept as legacy diagnostic; it rewarded leadChanges with wrong sign.

## Workstreams in flight (2026-07-11, ultra mode)
BACKGROUND (harness-tracked, will notify):
- wpns7qqo4 — RULES-8 dialectic workflow → DESIGN_ROUND_8.md + analysis/fun_metric_spec.md
- a25ba481 — last30days pulse on agentic game-dev skills (delegated form)
- af83ac15 — repo review dim1: architecture
- a3a9d0e5 — repo review dim2: systems & balance
- a53e78d7 — repo review dim3: determinism & performance
- aa7172df — repo review dim4: content pipeline & consistency
- ad558522 — repo review dim5-7: testability / debt / gate
PENDING SYNTHESIS (me, when agents land):
- [DONE] GAME_REVIEW.md — gate CONCERNS (ship-safe, no BLOCKER). 2 HIGH = card power-creep (8 dominated cards, 4 in starter); determinism+perf PASS; fixes HELD until RULES-8 (starter change would invalidate baseline; pool changes anyway).
- [DONE] game-dev skill pick: Donchitos review-gates (distilled → game-dev-review skill); +render_game_to_text() verify pattern. game-creator overtaken/no-license.
- Implement Fun Index in tools/metrics.js from fun_metric_spec.md; baseline RULES-7; then iterate RULES-8 seed-paired vs baselines  ← ONLY REMAINING, waits on wpns7qqo4
- Post-RULES-8 fix batch (from GAME_REVIEW ranked list): popout.js:98 encode, projectedInfluence, card domination, accumulator caps, net/decks, progress tests.

## Deliverables done this session
- dotfiles-claude/skills/psychographic-eval/SKILL.md (general + game lens) ✓
- dotfiles-claude/skills/game-dev-review/SKILL.md (7-dim rubric, Donchitos-distilled) ✓
- analysis/limen_psychographic_eval.md (finding: serves Melvin/Vorthos, starves Timmy/Johnny/Spike → why fun=6/10) ✓
- SOTA check on game-dev skills: winner Donchitos/Claude-Code-Game-Studios (MIT, 22.8k★); game-creator has NO license, don't build on it ✓

## Campaign workstream (separate feature, ruleset-agnostic — survives RULES-8)
- CAMPAIGN_DESIGN.md written (workflow wpzexnaph). "Descent" roguelite: wraps bot duel via 4 seams
  (startGame / agent iface / mutable CONFIG / public Game API), ZERO fork of game.js. Relics =
  apply(cfg)/restore(cfg) knob-mutators + relicHooks registry; difficulty = scheduleBot agent swap;
  seeded off one run seed. Top risk: CONFIG restore-leak into hotseat/MP → try/finally + snapshot-restore.
- Phase-1 BUILT (agent ad25069b, 2026-07-11). Files: NEW core/campaign.js (pure, deterministic DAG gen +
  opponent-comp gen + run-state reducer + CONFIG snapshot/restore + relic-hook stubs), NEW ui/campaign.js
  (pre-run/map/reward/summary screens), NEW tests/campaign.test.js (13 tests), EDIT main.js (+96/-8, all
  mode==='campaign'-guarded), EDIT core/config.js (CONFIG.CAMPAIGN block), EDIT index.html (Descent button +
  #campaignOverlay + .cmp-* CSS), EDIT package.json (test wired). game.js NEVER forked (no trust-flag needed).
- Deviations from spec: (1) reward = validity-preserving SWAP not deck-grow (keeps runDeck a legal 20; deck-
  grow + player-side validateDeck bypass deferred); (2) ships ONE act (entry + 3 branching cols + Boss), not 3.
- MECHANICAL GATE GREEN (verified by me, real output 2026-07-11): npm test 74 pass (61 existing unchanged +13
  campaign); generateMap byte-identical twice (DAG 3890B, linear 1406B) + seed-sensitive; 53/53 opponent decks
  across 5 seeds×2 layouts pass validateDeck; sim n=20 clean 0 stalls (bot flow unbroken).
- SEMANTIC GATE #2 IN FLIGHT: 3 Sonnet fresh-eyes reviewers over the diff — (A) core determinism+CONFIG-leak,
  (B) main.js wiring+regression, (C) test rigor+ui soundness. Awaiting findings before calling P1 done.
- Deferred to later phases: 24 relics (registry seam in place), shop/events, Motes meta, Patrons, Ascension,
  Scars, boss rule-warps, realm music, net/campaign.js persistence, full 3-act content.

## Status log
- 2026-07-11: round8 workflow + baselines; built psychographic-eval + game-dev-review skills; psychographic
  eval of Limen; SOTA + 30-day pulse on game-dev skills; 5-agent repo review → GAME_REVIEW.md (gate CONCERNS);
  RULES-8 design (DESIGN_ROUND_8.md); Fun Index implemented + baselined (RULES-7=38.1); bought game-creator
  skill; campaign design (CAMPAIGN_DESIGN.md) + phase-1 build dispatched. UNCOMMITTED across repo + dotfiles.
