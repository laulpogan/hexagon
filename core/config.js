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

  // Ascension — stacking (design round 3). Place onto a friendly non-capital
  // tile to build upward. Captures peel one tier (attacker card bounces).
  TIER_MAX: 3,          // total height cap (base + 2)
  TIER_BONUS: 1,        // influence per buried tier

  // Ruins (round 4): every destroyed tile scars its cell. Tiles standing on
  // scarred ground lose 1 influence per ruin layer (capped) — recapture
  // ping-pong decays naturally. ATTUNED feeds on scars and is immune.
  RUIN_PENALTY: 1,
  RUIN_CAP: 2,
};
