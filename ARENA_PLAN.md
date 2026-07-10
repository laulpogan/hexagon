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
Round: 0 (substrate)

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
