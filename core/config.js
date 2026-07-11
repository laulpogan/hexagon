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

  // Deck construction (the pacing valve — replaces resource costs)
  DECK_SIZE: 20,
  MAX_RARE: 2,
  MAX_UNCOMMON: 6,
  COPY_CAP: { common: 3, uncommon: 2, rare: 1 },

  // Capital
  CAPITAL_INFLUENCE: 2,
  CAPITAL_MIN_DIST_FROM_SEAM: 2, // rows between capital and board mid-line
  CAPITAL_MIN_NEIGHBORS: 3, // A8: corner hill-king block — capitals need ≥3 neighbors

  // Keyword magnitudes
  FORTIFIED_BONUS: 2,
  RALLY_BONUS: 1,
  RALLY_STACK_CAP: 2,  // round 2: RALLY-stack archetype hit 64.2% @ 5330g —
                       // a tile now gains at most +2 total from adjacent RALLY
  SIEGE_BONUS: 5,   // 2→5 (2026-07-10 balance round): at 2, aggression never paid.
                    // Seed-paired sim n=300: captures/match 2.5→3.8, split unmoved.

  // Influence-victory equalizer. After this round's structural fixes (deep bot
  // capitals, scout heartland ban, stuck-only pass) the old 41/59 P2 edge is
  // gone on its own — seed-paired n=300: T0 143/154, T1 147/149 (even). Keep 1
  // as a hair of first-mover compensation; re-sweep if tiles change.
  INFLUENCE_TIEBREAK_BONUS_P1: -2, // signed; re-swept post-subjugation: -2 = 148/151 paired (P2 side gets it now)

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

  // R8 pool: the 4 new R3/R5-showcase keywords (analysis/pool40.json).
  SUMMIT_HEIGHT_THRESHOLD: 3,  // SUMMIT: bonus while this cell's height is at least this tall
  SUMMIT_BONUS: 2,
  SEAMBOUND_BONUS: 3,          // SEAMBOUND: bonus while standing directly on a rift hex
  TIDEBOUND_BONUS: 1,          // TIDEBOUND: permanent influence gain per rift-adjacent capture
};
