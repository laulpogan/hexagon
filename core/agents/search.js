// Search agent — deterministic depth-2 adversarial lookahead ("the A* ask").
// For each of my actions: opponent answers with its best policy-scored reply,
// then the position is statically evaluated. Exact, no sampling noise —
// random-rollout UCT lost 9-1 to greedy here (40 actions / 160 iters = 4
// noisy samples each). Revisit real ISMCTS only if hidden info ever lands.
import { CONFIG } from '../config.js';
import { moveFeatures, DEFAULT_WEIGHTS } from './policy.js';

function legalActions(game) {
  const p = game.currentPlayer;
  if (game.phase === 'capital') {
    const acts = [];
    for (let c = 0; c < CONFIG.GRID_W; c++) {
      for (let r = 0; r < CONFIG.GRID_H; r++) {
        if (game.isLegalCapitalCell(p, c, r)) acts.push({ kind: 'capital', col: c, row: r });
      }
    }
    return acts;
  }
  const moves = game.legalMoves(p).map(m => ({ kind: 'place', ...m }));
  game.hands[p].forEach((card, handIndex) => {
    if (card.kind !== 'rite') return;
    for (const t of game.legalRiteTargets(p, handIndex)) {
      moves.push({ kind: 'rite', handIndex, col: t.col, row: t.row });
    }
  });
  return moves.length ? moves : [{ kind: 'pass' }];
}

function applyAction(game, action) {
  const p = game.currentPlayer;
  if (action.kind === 'capital') return game.placeCapital(p, action.col, action.row);
  if (action.kind === 'place') return game.placeFromHand(p, action.handIndex, action.col, action.row);
  if (action.kind === 'rite') return game.castRite(p, action.handIndex, action.col, action.row);
  return game.pass(p);
}

// Opponent response model: argmax of the shared feature policy (cheap, strong).
function bestReply(game, rand) {
  const p = game.currentPlayer;
  if (game.phase !== 'play') return;
  const moves = game.legalMoves(p);
  if (!moves.length) { game.pass(p); return; }
  let best = null, bestScore = -Infinity;
  for (const mv of moves) {
    const f = moveFeatures(game, p, mv);
    let s = 0;
    for (let i = 0; i < DEFAULT_WEIGHTS.length; i++) s += DEFAULT_WEIGHTS[i] * f[i];
    if (s > bestScore) { bestScore = s; best = mv; }
  }
  game.placeFromHand(p, best.handIndex, best.col, best.row);
}

function evaluate(game, player) {
  if (game.phase === 'over') {
    if (game.winner === player) return 10000;
    if (game.winner === null) return 0;
    return -10000;
  }
  const enemy = player === 1 ? 2 : 1;
  const s = game.boardSummary();
  let lead = s[player].influence - s[enemy].influence;
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    for (let r = 0; r < CONFIG.GRID_H; r++) {
      const t = game.board[c][r].tile;
      if (t?.capital && game.relativeInfluence(c, r) === 0) {
        lead += t.owner === player ? -30 : 30;
      }
    }
  }
  return lead;
}

export function makeSearch({ depth = 2 } = {}) {
  return {
    name: `search${depth}`,
    takeTurn(game, player, rand) {
      if (game.phase === 'over' || game.currentPlayer !== player) return { kind: 'not-my-turn' };
      const actions = legalActions(game);
      if (actions.length === 1) { applyAction(game, actions[0]); return actions[0]; }

      let best = null, bestScore = -Infinity;
      for (const a of actions) {
        const sim = game.clone();
        applyAction(sim, a);
        // opponent best reply, then (depth-2) my policy reply, then eval
        for (let d = 1; d < depth && sim.phase === 'play'; d++) bestReply(sim, rand);
        const score = evaluate(sim, player) + rand() * 0.01;
        if (score > bestScore) { bestScore = score; best = a; }
      }
      applyAction(game, best);
      return best;
    },
  };
}
