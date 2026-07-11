// R8/P2 road-rush adversarial bot arm — SIM-ONLY (never shipped in game UI).
// The dedicated exploit arm the P2 gate requires: greedy policy base score +
// w × (own momentum gain + enemy momentum destroyed) + a loop-closure bonus,
// with every road delta computed FOR REAL via clone + placeFromHand (which
// runs refreshRoads) — no approximation, so the arm can actually express
// loop-closing and severance lines (gate-#1 red-team M4). Deterministic
// given a seeded rand.
import { CONFIG } from '../config.js';
import { midRow } from '../board.js';
import { moveFeatures, DEFAULT_WEIGHTS } from './policy.js';

export function makeRoadRush({ w = 5, loopBonus = 6, name = null } = {}) {
  return {
    name: name || `roadrush-w${w}`,
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
      const enemy = player === 1 ? 2 : 1;

      let best = null, bestScore = -Infinity;
      for (const mv of moves) {
        const f = moveFeatures(game, player, mv);
        let s = 0;
        for (let i = 0; i < DEFAULT_WEIGHTS.length; i++) s += DEFAULT_WEIGHTS[i] * f[i];
        const sim = game.clone();
        const res = sim.placeFromHand(player, mv.handIndex, mv.col, mv.row);
        if (res.ok) {
          const dM = sim.roads.momentum[player] - game.roads.momentum[player];
          const dE = game.roads.momentum[enemy] - sim.roads.momentum[enemy];
          const closed = !game.roads.loop[player] && sim.roads.loop[player];
          s += w * (dM + dE) + (closed ? loopBonus : 0);
        }
        s += rand() * 0.01;
        if (s > bestScore) { bestScore = s; best = { kind: 'place', ...mv }; }
      }

      // Rites compete in the same argmax — SUNDER scored as a severance tool.
      game.hands[player].forEach((card, handIndex) => {
        if (card.kind !== 'rite') return;
        for (const t of game.legalRiteTargets(player, handIndex)) {
          let s = 0.3;
          if (card.type === 'SUNDER' && t.col !== null) {
            const sim = game.clone();
            const res = sim.castRite(player, handIndex, t.col, t.row);
            if (res.ok) {
              const dE = game.roads.momentum[enemy] - sim.roads.momentum[enemy];
              s = 3 + w * dE;
            }
          }
          s += rand() * 0.01;
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
