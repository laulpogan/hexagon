# Limen Arena + Mechanics-Mining Plan (2026-07-10, build-loop HIGH tier)

Goal: a modular agent arena (greedy vs search vs RL-class) that survives rule
changes, a 1000-card DeepSeek-generated pool, a deck-meta loop, and design
rounds that mine MTG-analog mechanics into an evergreen Limen base set.

## Success criteria (runnable)
1. `npm run arena` → seed-paired matchup matrix: greedy × mcts × policy, starter decks.
2. Rule change test: flip a config knob + retrain policy agent via `npm run train`
   → arena reruns with NO arena-code edits (adaptable-agents requirement).
3. `tools/gen_cards.py` → data/cards_gen.json with ~1000 cards, 100% schema-valid,
   keywords ⊆ engine registry, names deduped.
4. Deck-meta round: sampled/evolved decks over the pool → per-card impact stats
   (win-rate delta when present) → top/bottom cards surfaced.
5. Design round 1 report: each candidate mechanic keep/kill with sim metrics
   (win split, captures/match, game length, deck diversity).

## Constraints (don't drift)
- Core stays renderer-free, deterministic, seeded (clone() must not carry RNG).
- Balance knobs only in core/config.js + data/*.js.
- Keywords become a REGISTRY with hooks (no new hardcoded ifs in game.js).
- New card category allowed: 'rite' (spell-like, targeted removal etc.) — must
  flow through the same action-log MP relay (kind:'rite').
- Shipped game must stay playable at every commit (tests green + smoke).
- "A*" ask = adversarial search agent (MCTS/UCT); "RL" ask = self-play-trained
  policy (evolution strategies over feature weights — retrainable per rules rev).

## Iteration counter (bump each design round; cap 3 per session)
Round: 3 COMPLETE (2026-07-10) — session cap reached

## Round 1 verdicts (arena: 967-card pool, 4 PSRO rounds, ~1150 games)
- All success criteria 1-5 met (arena matrix, retrain-without-arena-edits,
  967 validated cards, per-card impact, this report).
- Agent ladder: search2 > greedy; trained policy* ties search2, beats greedy
  (13-11). Styles diverge (search2 hyper-aggro 6.5 cap/game).
- Keyword meta band 48.9%–57.3% — NO degenerate keyword, NO dead keyword.
  **All 11 keywords confirmed evergreen.** Rites live in engine + shipped UI.
- Tune next gen round: RALLY hot (57.0% @ 5288g → raise gen power cost
  1.5→2.0); SCOUT cold (48.9% @ 5800g, most-played → drop cost 1.0→0.5);
  vanilla premium healthy (59.5% — the budget system rewards clean stats).
- Deck-meta diversity: inverse-Simpson 24.3/32 (flat, healthy; no archetype
  lock-in at this sample size).
- Card-gen validator skewed rarity to 73/16/10 (target 55/30/15) — loosen
  uncommon/rare budgets or retry rejected cards next round.
- Round 2 backlog: WING + MENACE (anti-aggro pair — gate on captures/match
  staying up), BREACH/UNMAKE/BLOCKADE/FLARE rites (FLARE needs a duration
  subsystem), RIFT-FALL trigger design, bot rift-hunt vision, per-card
  Clopper-Pearson CIs in meta.js, Nash-averaging over archetype clusters.

## MTG → Limen analog candidates (seed list for design rounds)
- Targeted removal (bolt/murder) → 'rite': destroy enemy tile w/ relInf ≤ X
- Flying → IGNORES enemy neighbor penalties from non-flying? or placement over?
- Deathtouch → FLANK: capture at relInf ≤ 1 when ≥2 attackers (designer #3)
- First strike → ward-like pre-capture immunity vs weaker tiles
- Trample → excess siege pressure splashes to a second neighbor
- Vigilance/defender → PACIFIST: high influence, cannot capture
- Menace → must be attacked by 2+ or uncapturable
- Landfall/rift-fall → triggers on rift-adjacent placement
- Equipment/aura → rite that buffs a friendly tile permanently

## Round 2 verdicts (1150-card pool, WING/MENACE live, retuned gen costs)
- WING debut 54.4% (250g) — healthy, keep. MENACE 51.0% (206g) after the
  RALLY cap — keep, watch.
- **Degenerate axis found and fixed:** RALLY-stack archetype hit 64.2% @
  5330g (PSRO population collapsed onto triple-RALLY aura cores; diversity
  21.7). Fix: RALLY_STACK_CAP=2 (max total aura per tile). After: RALLY
  58.3%, diversity back to 24.1, shipped baseline unchanged (148/151,
  0 stalls, 3.9 cap/match, 38 tests green).
- Wilson CIs live in meta.js (flaggedOver/Under in data/meta_report.json).
- Round 3 backlog: FLANK cold (43.0% @ 1340g — buff threshold or cost),
  TRAMPLE hot on thin sample (63.0% @ 246g — needs exposure), UNTOUCHABLE
  sagging (44.2%), regenerate pool fully under retuned costs, archetype
  clustering + Nash-averaging, human playtest calibration vs bot meta.

## Round 3 verdicts — Ascension (stacking)
- Mechanic: place onto your own non-capital tile → tower (cap 3 high, +1
  influence per buried tier, only the top face's keywords active). Captures
  PEEL one tier (attacker card bounces) — sieges are wars of turns now.
- Search agent exploits towers hard (20-0 vs greedy) — deep tactical
  texture; greedy/policy undervalue them (round-4: tower features for ES).
- Post-ascension paired sweep re-locked INFLUENCE_TIEBREAK_BONUS_P1=0
  (152/146). Meta band compressed to 47.0–55.9% — healthiest yet, no
  degenerate axis. Captures 3.8→~3 (towers absorb aggression — watch).
- Verified in shipped UI: tier-3 tower built, peel path, dormant-keyword
  rule (buried RALLY stops buffing), capital stacking blocked. 42 tests.
- Round 4 backlog: tower-aware policy features, FLANK/UNTOUCHABLE cold,
  tower-themed keywords (e.g. 'SUMMIT: active while tier-2+'), rite that
  topples a tier, art for stack sides, human playtest of tall-vs-wide.
