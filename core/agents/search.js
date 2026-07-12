// Search agent — deterministic depth-2 adversarial lookahead ("the A* ask").
// For each of my actions: opponent answers with its best policy-scored reply,
// then the position is statically evaluated. Exact, no sampling noise —
// random-rollout UCT lost 9-1 to greedy here (40 actions / 160 iters = 4
// noisy samples each). Revisit real ISMCTS only if hidden info ever lands.
import { CONFIG } from '../config.js';
import { neighborCoords } from '../board.js';
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

// R8/P3: complete the CURRENT player's whole turn. Under Cascade a single
// placement can leave the turn open (placementsLeft > 0) — evaluating there
// scores a half-finished turn, and worse, the old depth loop would spend the
// SEARCHER's own granted placement as if it were the opponent's ply. The
// guard is belt-and-suspenders: MAX_PLACEMENTS_PER_TURN already bounds it.
function completeTurn(game, rand) {
  const mover = game.currentPlayer;
  let guard = 0;
  while (game.phase === 'play' && game.currentPlayer === mover && guard++ < 8) {
    bestReply(game, rand);
  }
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
      // R8/P1: seam-awareness (panel: evaluate was seam-blind). Tiles whose
      // empty neighbors sit in the doomed ring lose future mobility — small
      // nudge so depth-2 anticipates the shrink instead of walking into it.
      if (t && !t.capital && CONFIG.SEAM_MAX_RINGS > 0) {
        const doomedN = neighborCoords(c, r).filter(([nc, nr]) =>
          !game.board[nc][nr].tile && game._seamDoomed(nc, nr)).length;
        lead += (t.owner === player ? -0.3 : 0.3) * doomedN;
      }
    }
  }
  // R8/P2: road-network differential, CAPPED at the point of mechanical
  // relevance (gate-#1 balance M6: an uncapped term rewards stacking momentum
  // past where the pressure cap stops caring).
  if (CONFIG.ROAD_PRESSURE_ON) {
    const capM = CONFIG.ROAD_MOMENTUM_DIV * CONFIG.ROAD_PRESSURE_CAP;
    lead += 0.2 * (Math.min(game.roads.momentum[player], capM) -
                   Math.min(game.roads.momentum[enemy], capM));
  }
  // R8/P3: cascade-awareness — a CASCADE card in hand is stored tempo.
  if (CONFIG.CASCADE_ON) {
    const inHand = p2 => game.hands[p2].filter(t => t.keywords.includes('CASCADE')).length;
    lead += 0.3 * (inHand(player) - inHand(enemy));
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
        // R8/P3: finish MY turn only if a cascade grant left it open — the
        // guard is load-bearing (gate-#2 BLOCKER: an unconditional call here
        // consumed the opponent's reply and the depth loop then modeled a
        // phantom extra own-ply, changing search2's play even at OFF). Then
        // each depth step models one FULL turn of whoever moves next.
        if (sim.phase === 'play' && sim.currentPlayer === player) completeTurn(sim, rand);
        for (let d = 1; d < depth && sim.phase === 'play'; d++) completeTurn(sim, rand);
        const score = evaluate(sim, player) + rand() * 0.01;
        if (score > bestScore) { bestScore = score; best = a; }
      }
      applyAction(game, best);
      return best;
    },
  };
}
