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
Round: 6 COMPLETE (2026-07-10 night)

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

## Round 3.5 amendment — mixed stacks (subjugation/liberation)
- Captures now bury the enemy tile under the conqueror (mixed stacks);
  peel resurfaces buried tiles to their ORIGINAL owner (liberation).
  SUNDER on a tower pops one tier. 44 tests green.
- Tiebreak re-swept: -2 (P2 side) = 148/151 paired. KOs up (43→45),
  captures 2.9.
- Meta band 39.0–57.1%: MENACE cold (39% @ 118g, thin) — round-4 item.
- Arena: search2 19-1 over retrained policy* — search's edge GROWS with
  stacking depth; policy needs tower/subjugation features (round 4).

## Round 4-5 (visual/audio, 2026-07-10 late)
- Persona visual panel (art director 4/10 / juice designer / stream viewer
  "wouldn't stop scrolling") drove round-1 fixes: visible backdrop world,
  rift dark-fill + magenta rims (not candy), contact shadows + owner glow
  pools under sprites, badge-chip influence numbers, crown cone retired.
- Juice: capture hit-flash + camera kick, landing squash + shockwave ring,
  badge punch-in on value change. Backlog: rift mote bursts, win-moment
  camera, per-realm sprite rim light, style-unify pass.
- 2D→3D SOTA (Spark): Hunyuan3D-2.1 Docker (dr-vij port) CONFIRMED on GB10,
  faster than TRELLIS.2 there; Mesh2Motion (browser, MIT) for rigging —
  skips ARM dependency hell entirely; LTX-2.3 on GB10 for animated loop
  fallback (180s/5s@720p warm). spconv-dependent tools (UniRig/SAM3D) =
  Dell. Next session: batch 23 sprites → GLB popouts.
- MusicGen-small ran NATIVELY on Spark sm_121 (PYTHONNOUSERSITE=1 trap).

## Round 6 verdicts — tower/ruins policy features + FLANK buff (2026-07-10 night)
- **Policy features 11 → 15** (core/agents/policy.js): `ascendHeight` (resulting
  tower height), `ruinsUnder` (ruin drain the placed face will suffer, incl. the
  capture scar), `peelExposure` (ascend: adjacent enemies that can peel),
  `towerPeel` (material removed peeling an enemy tower). moveFeatures also got
  three accuracy fixes: ascends now score their pressure on enemy neighbors
  (was ownRel only), peels are their own branch (were scored as full captures),
  and capture sims scar the cell (ruins+1) before reading ownRelAfter.
  loadTrainedPolicy rejects a stale weights file on feature-count mismatch.
- **Retrain**: `npm run train -- 24 24 8` (CLI args only, up from 12/16/8
  defaults; ~7 min). Fitness 0.781 vs greedy+anchor. ES turned ascendHeight
  slightly negative (-0.78 — towers cost tempo) and kept towerPeel ~+2.
- **Arena, 30 seed-pairs per pairing** (60 games each):
  policy* 39-21 over greedy (65%; stale 11-dim weights lost this 3-7 pre-round);
  search2 59-1 over policy*; search2 56-4 over greedy. Gap vs search2 NOT
  closed — search2 shares moveFeatures/DEFAULT_WEIGHTS, so the feature work
  lifted it too. Negative result logged: adding search2 to the ES fitness mix
  (4 games/eval, 10 gens, pop 14) transferred nothing (2-58) and cost the
  greedy matchup (65% → 52%); reverted. Verdict: the gap is structural —
  myopic linear policy vs depth-2 adversarial lookahead. Round-7 options:
  distill search2 trajectories into the policy, buy a real search-opponent
  training budget, or ship search2 as the "hard" bot.
- **FLANK buff sweep** (seed-paired, policy agent; FLANK-hybrid deck = starter
  shell with its uncommon slots as 6 pure-FLANK bodies, vs starter; 800 pairs
  = 1600 games/arm; mirror = same deck both sides):

  | arm | knobs | duel WR | mirror P1 (400g) |
  |---|---|---|---|
  | baseline | thr 1, min-att 2 | 45.1% | 49.3% |
  | A | min-att 1 | 45.7% | 47.5% |
  | B | thr 2 | 47.1% | 47.3% |
  | C | +1 thr per ally > 2 | 45.4% | 49.0% |
  | **D = A+B** | **min-att 1, thr 2** | **48.2%** | 46.5% |
  | E = A + per-ally | min-att 1, +1/ally | 45.9% | 47.5% |

  Large mirror (1200g decisive): baseline 47.0 / B 46.8 / D 46.2 — the buff
  moves P1/P2 <1pt. Captures/match flat (~6.4) in every arm. **Applied D**:
  FLANK_THRESHOLD 2, new knobs FLANK_MIN_ATTACKERS=1, FLANK_PER_ALLY=0.
  New card text: "Enemy tiles adjacent to this are capturable at 2 influence
  or less." Mechanics test rewritten to the new gate.
- **Methodology trap** (for future sweeps): decks stacked with weak 1-influence
  FLANK commons and no SCOUT turtle into ZERO-capture policy mirrors — both
  sides build towers at home and never make contact. Useless for measuring a
  capture-gate mechanic. Starter-shell hybrids restored contact (6-8 cap/game).
- **Tiebreak re-check**: FLANK knobs can't move starter-deck balance (starter
  carries no FLANK cards). Data-only paired sweep (shipped bot, n=300/arm):
  -4 → 146/153, -3 → 149/151, **-2 → 152/148**, -1 → 155/144, 0 → 157/143.
  INFLUENCE_TIEBREAK_BONUS_P1 stays -2. (The default 'sim' seed prefix reads
  162/137 at the same knob — seed-set noise, worth remembering.)
- **Meta** (6 rounds × pop 32 × 4 games, 1150-card pool): FLANK 47.9% @ 3280
  card-games, up from 46.6% pre-buff. (A quick 3×24×3 run read 57.2% @ 612g —
  thin-sample mirage; don't trust keyword deltas under ~2000 card-games.)
  Keyword band 45.2–54.6, diversity 27.9/32 (healthiest yet). MENACE 45.2% @
  166g — thin, cold-ish, NOT drifting OVER. FLANK card flags: 1 OVER / 5 UNDER
  — normal spread, no degenerate FLANK core.
- 45 tests green.
- Watch items: FLANK still a hair under 50 (gen-pool costs were priced for the
  weak FLANK — recheck after next pool regen); MENACE sample starvation;
  policy-vs-search2 structural gap (round-7 item above).
