// Greedy 1-ply bot. Headless (works in node for the balance sim and in the
// browser for vs-Bot mode). Deterministic when given a seeded rand.
import { CONFIG } from './config.js';
import { hexDistance, midRow, neighborCoords } from './board.js';

function findCapital(game, owner) {
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    for (let r = 0; r < CONFIG.GRID_H; r++) {
      const t = game.board[c][r].tile;
      if (t && t.capital && t.owner === owner) return { col: c, row: r };
    }
  }
  return null;
}

// Score a candidate placement by simulating it on the board.
function scoreMove(game, player, move, rand) {
  const enemy = player === 1 ? 2 : 1;
  const tile = game.hands[player][move.handIndex];
  const cell = game.board[move.col][move.row];
  const target = cell.tile;

  // Winning move: capture the enemy capital.
  if (target && target.capital) return Infinity;
  // Ward walls: spending a tile to pop a ward is occasionally right,
  // but greedy shouldn't do it while better moves exist.
  if (target && target.keywords.includes('WARD') && !target.wardConsumed) return -50 + rand();

  let score = 0;
  if (target) score += 6 + target.influence * 2; // captures are tempo + material

  // Simulate
  cell.tile = { ...tile, owner: player };
  const own = game.relativeInfluence(move.col, move.row);
  score += own; // healthy tiles are worth their influence
  if (own === 0) score -= 8; // placing into instant capturability is usually a blunder

  // Pressure: enemy neighbors pushed toward 0 (capturable next turn = huge)
  for (const [c, r] of neighborCoords(move.col, move.row)) {
    const nt = game.board[c][r].tile;
    if (nt && nt.owner === enemy) {
      const after = game.relativeInfluence(c, r);
      if (after === 0) score += nt.capital ? 40 : 8 + nt.influence;
      else score += Math.max(0, 3 - after); // squeezing counts a little
    }
  }

  // March on the enemy capital.
  const enemyCap = findCapital(game, enemy);
  if (enemyCap) score += Math.max(0, 10 - hexDistance(move.col, move.row, enemyCap.col, enemyCap.row)) * 0.5;

  // Never leave own capital capturable.
  const ownCap = findCapital(game, player);
  if (ownCap && game.relativeInfluence(ownCap.col, ownCap.row) === 0) score -= 1000;

  cell.tile = target; // revert
  return score + rand() * 0.25; // tie-break noise
}

// Decide the bot's whole turn. Returns the action it took.
// rand is required — no Math.random fallback, core stays deterministic.
export function botTakeTurn(game, player, rand) {
  if (game.phase === 'capital') {
    if (game.currentPlayer !== player) return { kind: 'not-my-turn' };
    // Aggressive-but-sane: middle column, closest legal row to the seam.
    const mid = midRow();
    const row = player === 1 ? mid - CONFIG.CAPITAL_MIN_DIST_FROM_SEAM : mid + CONFIG.CAPITAL_MIN_DIST_FROM_SEAM;
    const cols = [6, 5, 7, 4, 8, 3, 9, 2, 10, 1, 11, 0, 12];
    for (const col of cols) {
      for (const r of player === 1 ? [row, row - 1, row - 2] : [row, row + 1, row + 2]) {
        if (game.isLegalCapitalCell(player, col, r)) {
          const res = game.placeCapital(player, col, r);
          if (res.ok) return { kind: 'capital', col, row: r };
        }
      }
    }
    return { kind: 'stuck' };
  }

  if (game.phase !== 'play' || game.currentPlayer !== player) return { kind: 'not-my-turn' };

  let moves = game.legalMoves(player);
  // No moves → discard once for fresh options, then re-check.
  if (!moves.length && game.discardsLeft > 0 && game.hands[player].length) {
    game.discardRedraw(player, Math.floor(rand() * game.hands[player].length));
    moves = game.legalMoves(player);
  }
  if (!moves.length) {
    game.pass(player);
    return { kind: 'pass' };
  }

  let best = null, bestScore = -Infinity;
  for (const mv of moves) {
    const s = scoreMove(game, player, mv, rand);
    if (s > bestScore) { bestScore = s; best = mv; }
  }
  const res = game.placeFromHand(player, best.handIndex, best.col, best.row);
  return { kind: 'place', ...best, result: res };
}
