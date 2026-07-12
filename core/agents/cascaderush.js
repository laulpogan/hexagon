// R8/P3 cascade-rush adversarial bot arm — SIM-ONLY (never shipped in game UI).
// The dedicated exploit arm the P3 gate requires: greedy policy base score +
// w × (this placement fires a cascade grant) + chainBonus × actions already
// taken this turn — i.e. maximize actions/turn and chain depth over board
// value. The grant test is REAL: clone + placeFromHand, then read whether
// placementsLeft survived the spend (the hook ran for real, cap included).
// Deterministic given a seeded rand.
import { CONFIG } from '../config.js';
import { midRow } from '../board.js';
import { moveFeatures, DEFAULT_WEIGHTS } from './policy.js';

export function makeCascadeRush({ w = 5, chainBonus = 2, name = null } = {}) {
  return {
    name: name || `cascrush-w${w}`,
    takeTurn(game, player, rand) {
      if (game.phase === 'capital') {
        // deep + central, same heuristic as policy
        const mid = midRow();
        const deep = player === 1 ? 0 : CONFIG.GRID_H - 1;
        const shallow = player === 1 ? mid - CONFIG.CAPITAL_MIN_DIST_FROM_SEAM : mid + CONFIG.CAPITAL_MIN_DIST_FROM_SEAM;
        for (const col of [6, 5, 7, 4, 8, 3, 9, 2, 10, 1, 11, 0, 12]) {
          for (const r of player === 1 ? [deep, deep + 1, shallow] : [deep, deep - 1, shallow]) {
            if (game.isLegalCapitalCell(player, col, r) && game.placeCapital(player, col, r).ok) {
              return { kind: 'capital', col, row: r };
            }
          }
        }
        return { kind: 'stuck' };
      }
      if (game.phase !== 'play' || game.currentPlayer !== player) return { kind: 'not-my-turn' };

      let moves = game.legalMoves(player);
      if (!moves.length && game.discardsLeft > 0 && game.hands[player].length) {
        game.discardRedraw(player, Math.floor(rand() * game.hands[player].length));
        moves = game.legalMoves(player);
      }

      let best = null, bestScore = -Infinity;
      for (const mv of moves) {
        const f = moveFeatures(game, player, mv);
        let s = 0;
        for (let i = 0; i < DEFAULT_WEIGHTS.length; i++) s += DEFAULT_WEIGHTS[i] * f[i];
        const sim = game.clone();
        const res = sim.placeFromHand(player, mv.handIndex, mv.col, mv.row);
        if (res.ok) {
          // grant fired iff the turn is still open after spending a placement
          const granted = sim.phase === 'play' && sim.currentPlayer === player &&
            sim.placementsLeft >= game.placementsLeft;
          s += (granted ? w : 0) + chainBonus * game.placementsThisTurn;
        }
        s += rand() * 0.01;
        if (s > bestScore) { bestScore = s; best = { kind: 'place', ...mv }; }
      }

      // Rites compete in the same argmax (flat prior — rites never cascade).
      game.hands[player].forEach((card, handIndex) => {
        if (card.kind !== 'rite') return;
        for (const t of game.legalRiteTargets(player, handIndex)) {
          const s = 0.3 + rand() * 0.01;
          if (s > bestScore) { bestScore = s; best = { kind: 'rite', handIndex, col: t.col, row: t.row }; }
        }
      });

      if (!best) { game.pass(player); return { kind: 'pass' }; }
      if (best.kind === 'rite') {
        const res = game.castRite(player, best.handIndex, best.col, best.row);
        return { ...best, result: res };
      }
      const res = game.placeFromHand(player, best.handIndex, best.col, best.row);
      return { ...best, result: res };
    },
  };
}
