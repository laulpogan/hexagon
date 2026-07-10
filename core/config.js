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
  SIEGE_BONUS: 5,   // 2→5 (2026-07-10 balance round): at 2, aggression never paid.
                    // Seed-paired sim n=300: captures/match 2.5→3.8, split unmoved.

  // Influence-victory equalizer. After this round's structural fixes (deep bot
  // capitals, scout heartland ban, stuck-only pass) the old 41/59 P2 edge is
  // gone on its own — seed-paired n=300: T0 143/154, T1 147/149 (even). Keep 1
  // as a hair of first-mover compensation; re-sweep if tiles change.
  INFLUENCE_TIEBREAK_BONUS_P1: 1,

  // Scouts may ignore adjacency anywhere EXCEPT the enemy heartland (the
  // opponent's capital-zone rows) — kills the turn-1 scout capital rush.
  SCOUT_HEARTLAND_BAN: true,
};
