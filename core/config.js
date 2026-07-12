// Limen — all balance knobs live here and in data/tiles.js. Nowhere else.
export const CONFIG = {
  // Board
  GRID_W: 13,
  GRID_H: 9,
  RIFT_JITTER_CHANCE: 0.4,   // chance a seam hex shifts ±1 row off center
  RIFT_AURA: 1,              // influence penalty per adjacent rift hex (bonus if ATTUNED)

  // Turn structure
  HAND_SIZE: 5,
  PLACEMENTS_PER_TURN: 1,
  DISCARDS_PER_TURN: 1,

  // Deck construction (the pacing valve — replaces resource costs). A10 sim
  // gate (seed-paired, n=600, greedy mirror, RULES-7): 24-card median length
  // 46 plies, 72% of games over the 45-ply ceiling — FAILS. 20-card median
  // 38, comfortably inside 25-45 — PASSES. Ships 20 per the binding gate,
  // not the R8 proposal's "modest 20→24" (A13: honor what the sim actually
  // supports). Rarity caps still per R8 spec (2 rare / 8 uncommon per deck).
  DECK_SIZE: 20,
  MAX_RARE: 2,
  MAX_UNCOMMON: 8,
  COPY_CAP: { common: 3, uncommon: 2, rare: 1 },

  // Capital
  CAPITAL_INFLUENCE: 2,
  CAPITAL_MIN_DIST_FROM_SEAM: 2, // rows between capital and board mid-line
  CAPITAL_MIN_NEIGHBORS: 3, // A8: corner hill-king block — capitals need ≥3 neighbors

  // R8/P1: THE SEAM ADVANCES — collapsing frontier. From ply SEAM_ADVANCE_START,
  // every SEAM_ADVANCE_CADENCE plies the outermost ring of empty, non-capital-
  // adjacent hexes is consumed, up to SEAM_MAX_RINGS (0 disables — the A/B arm).
  // The next-to-fall ring is "doomed" for its whole inter-tick window: empty
  // non-aura doomed cells reject placement (telegraph = information, not shelter).
  //
  // SHIPPED OFF (2026-07-11 P1 gate result): seed-paired n=300 greedy + n=120×3
  // arena all agree — seam+frontier CRUSH comeback (19%→8% greedy, 33%→13%
  // policy mirror), leave firstCap unmoved-or-worse, and drop Fun 38.2→34.3.
  // The squeeze helps the leader convert; the designed comeback lever
  // (severance) is a P2 mechanic. Re-evaluate these knobs INSIDE the P2 round.
  // Machinery + tests + UI stay live behind the knobs (they are the A/B arms).
  SEAM_ADVANCE_START: 5,
  SEAM_ADVANCE_CADENCE: 5,
  SEAM_MAX_RINGS: 0,
  // R8/P1: frontier-anchored legality — empty placement needs an adjacent anchor
  // at equal-or-greater seam distance (no retreat) OR adjacency to your capital.
  FRONTIER_ANCHOR: false,

  // R8/P2: ROADS — chain-slide surge pressure + loop-closure + severance.
  // The road network is DERIVED (capital-connected same-owner adjacency; no new
  // action, no protocol change). Enemy tiles adjacent to a linked cell feel
  // min(CAP, floor(contactRoadPower / DIV)) extra pressure in combat only —
  // never in the influence-victory tally (boardSummary passes pressure-free;
  // the Riftlight discipline in reverse). Capitals exempt as defenders until
  // P5's response window exists. Severance is structural: tiles cut from their
  // capital stop counting (comeback lever). Gate verdict: RULES8_P2_ROADS.md.
  //
  // SHIPPED OFF (2026-07-11 P2 gate result): the dedicated road-rush arm broke
  // the 42-58% band structurally — a w10 momentum-maximizer beats tuned greedy
  // 68.8% and the retrained policy 72.5%, and still reads 67-70% at the WEAKEST
  // pressure knobs (DIV 4 / CAP 2), so no swept knob fixes it. Roadrush mirror
  // degenerates to a 0.5-captures/game turtle-farm; K (killer moves) regresses
  // in every ON-vs-OFF pairing. The exploit is momentum-as-connected-tile-count
  // rewarding pure expansion (design risk #3, momentum snowball) — not pressure
  // magnitude. Positive carried forward: severance DID lift comeback (23.3→
  // 27.5% policy mirror) — the lever works; the momentum formula is what fails.
  // Machinery + tests + UI stay live behind the knob (future rounds' A/B arms;
  // candidate fix: shape-sensitive momentum — frontline-only or longest-path).
  ROAD_PRESSURE_ON: false,    // master A/B knob (false = byte-identical RULES-7)
  ROAD_CHAINSLIDE_REACH: 3,   // hops the surge travels through the network
  ROAD_MOMENTUM_DIV: 3,       // local roadPower per pressure point
  ROAD_PRESSURE_CAP: 3,       // max surge pressure per defender
  LOOP_CLOSURE_MULT: 2,       // roadPower multiplier near a true enclosure

  // Keyword magnitudes
  FORTIFIED_BONUS: 2,
  RALLY_BONUS: 1,
  RALLY_STACK_CAP: 2,  // round 2: RALLY-stack archetype hit 64.2% @ 5330g —
                       // a tile now gains at most +2 total from adjacent RALLY
  SIEGE_BONUS: 5,   // 2→5 (2026-07-10 balance round): at 2, aggression never paid.
                    // Seed-paired sim n=300: captures/match 2.5→3.8, split unmoved.

  // Influence-victory equalizer. RULES-7 re-sweep (greedy mirror, this
  // round's starter deck): noisy at n<=1200 (readings for -1 ranged
  // 49.1-52.5% across different seed sets/n), so decided on the largest
  // stable sample — n=2000 at -1 read 49.55% P1, solidly inside the 48-52%
  // band. (0 trended high ~52%, -4 trended low ~45.5%.)
  INFLUENCE_TIEBREAK_BONUS_P1: -1, // signed; RULES-7 re-sweep, n=2000: 49.55% P1

  // Scouts may ignore adjacency anywhere EXCEPT the enemy heartland (the
  // opponent's capital-zone rows) — kills the turn-1 scout capital rush.
  SCOUT_HEARTLAND_BAN: true,

  // Wave-1 mechanics (2026-07-10 design round 1 — MTG analogs)
  FLANK_THRESHOLD: 2,   // deathtouch-ish: enemies beside a FLANK tile capturable at ≤2.
                        // Round 6 buff (was ≤1 needing 2+ attackers): FLANK sat cold at
                        // 43–47%; seed-paired sweep n=1600/arm picked min-att 1 + thr 2
                        // (+3.1pts, captures/match flat, mirror P1 shift <1pt).
  FLANK_MIN_ATTACKERS: 1, // attackers (incl. the FLANK tile) needed to open the gate
  FLANK_PER_ALLY: 0,    // extra threshold per attacker beyond 2 (pack-hunter scaling)
  SUSTAIN_BONUS: 1,     // lifelink-ish: permanent growth per capture
  TRAMPLE_SPLASH: 2,    // trample: permanent dent on one extra adjacent enemy per capture
  SUNDER_MAX_INF: 2,    // targeted removal ceiling (non-capital only)

  // Ascension — stacking (RULES-7 R4/A9). Self-ascend stacks onto your own
  // non-capital tile up to TIER_MAX high; self-stacked tiers grant NO
  // influence (R4 — trophy-only scoring, see TROPHY_CAP below). ASCEND_VARIANT
  // picks which extra legality/cost gate applies to self-ascend (A9 sim
  // knob): 'A' = none (R4 as written), 'B' = legal only when enemy-adjacent,
  // 'C' = costs placement + 1 forced discard.
  TIER_MAX: 3,           // self-stack height cap (base + 2)
  TIER_BONUS: 1,         // influence per trophy (buried ENEMY tier), see TROPHY_CAP
  ASCEND_VARIANT: 'A',   // 'A' | 'B' | 'C' — A9 sim picks the shipped value

  // R1/A5: capture caps the stack — buried tiles persist (mixed-owner stacks,
  // no liberation, A1). Cell height = stack.length + 1, uncapped except for
  // the absolute crush-out ceiling below. Trophy value = live-stack ENEMY
  // tiers (capped) — this is what feeds TIER_BONUS in effectiveBase().
  TROPHY_CAP: 3,          // A5: max trophy tiers counted per cell
  HEIGHT_CRUSH_CAP: 5,    // A5: total height ceiling; overflow crushes the bottom tier to rubble

  // R3/A4: high ground. Height difference between adjacent enemy tiles presses
  // asymmetrically — taller presses harder, shorter presses weaker — composed
  // into the pressure sum BEFORE WING halving (A4).
  HIGH_CAP: 2,

  // R5/A6: Riftlight — a SEPARATE accumulator folded into boardSummary()'s
  // influence tally only, never into relativeInfluence() (else rift cells get
  // an accidental defense buff). Every rift-or-rift-adjacent cell you hold
  // counts toward it, capped per player.
  RIFTLIGHT_PER_CELL: 2,
  RIFTLIGHT_CAP: 8,

  // R6/A7: THE RIFT STIRS — periodic seam pulse, telegraphed 2 plies ahead.
  // Fires every RIFT_STIRS_INTERVAL plies (a "ply" = one player's turn, so
  // 12 = 6 turns each). ESCALATION is the anti-mutual-turtle fallback knob
  // (0 = flat pulse forever; >0 = each firing hits harder).
  RIFT_STIRS_INTERVAL: 12,
  RIFT_STIRS_ESCALATION: 0,

  // Greedy bot only (core/bot.js): a small flat score pull toward placing
  // on/adjacent to the rift. The 1-ply heuristic never sees Riftlight's
  // boardSummary-only payoff (A6), so without this it only sees the
  // RIFT_AURA combat penalty and never approaches. R9 sweep (n=1000): 3→26.5%
  // zero-capture, 5→11.3%, 8→4.6% (clears the <10% target), 12→3% (P1 drifts
  // to 53.5%, unnecessary). 8 is the sweet spot: zero-capture 4.6%, P1 51.5%,
  // avg length 32 — all three targets clear; median first capture stays T9-10
  // at every nudge strength tried, a geometric floor from starting capital
  // distance (CAPITAL_MIN_DIST_FROM_SEAM), not something this knob reaches.
  BOT_RIFT_NUDGE: 8,

  // R8 pool: the 4 new R3/R5-showcase keywords (analysis/pool40.json).
  SUMMIT_HEIGHT_THRESHOLD: 3,  // SUMMIT: bonus while this cell's height is at least this tall
  SUMMIT_BONUS: 2,
  SEAMBOUND_BONUS: 3,          // SEAMBOUND: bonus while standing directly on a rift hex
  TIDEBOUND_BONUS: 1,          // TIDEBOUND: permanent influence gain per rift-adjacent capture

  // ─── Campaign / Descent roguelite (core/campaign.js — CAMPAIGN_DESIGN.md) ──
  // All campaign tuning lives here, same all-knobs-in-config discipline the
  // rest of the file holds. The Descent map is a deterministic branching DAG
  // generated from a run seed; these knobs shape it. Per-node opponent AGENT
  // and TIER (skirmish=greedy/1, warden=policy/2, boss=search2/3) are
  // structural and live in campaign.js, not here. This block is plain data —
  // the per-match CONFIG snapshot/restore (leak-safety, §10) copies it whole.
  CAMPAIGN: {
    STARTING_LIVES: 3,
    LOSS_PARTIAL_BANK: 1,      // placeholder partial reward banked on a lost duel (Motes: phase 4)
    DRAFT_SIZE: 3,             // card-pick offers shown per reward
    PRE_BOSS_COLUMNS: 3,       // branching columns between the entry Skirmish and the Boss sink
    COL_MIN_NODES: 2,          // min nodes in a branching column
    COL_MAX_NODES: 3,          // max nodes in a branching column
    // Node-type weights for the branching middle columns. The entry column is
    // always a single Skirmish; the final column is always a single Boss.
    TYPE_WEIGHTS: { skirmish: 5, warden: 2, 'rift-cache': 3 },
    // Opponent deck strength by node tier — distinct copies added per rarity
    // before commons fill to DECK_SIZE. Indexed by tier (1..3); index 0 unused.
    OPP_RARES_BY_TIER: [0, 0, 1, 2],
    OPP_UNCOMMONS_BY_TIER: [0, 3, 5, 7],
  },
};
