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
  // Ward pops cost a turn (the card bounces back to hand) — cheap but rarely
  // better than developing; mildly negative so it happens only when quiet.
  if (target && target.keywords.includes('WARD') && !target.wardConsumed) return -12 + rand();

  // Ascend moves: simulate the stack, value the tower minus a tempo tax
  // (expanding usually beats building tall — search/policy explore the rest).
  if (target && target.owner === player) {
    cell.stack.push(target);
    cell.tile = { ...tile, owner: player };
    const own = game.relativeInfluence(move.col, move.row);
    cell.tile = target;
    cell.stack.pop();
    return own - 2.5 + rand() * 0.25;
  }

  let score = 0;
  if (target) score += 6 + target.influence * 2; // captures are tempo + material

  // Simulate. R1: a capture BURIES the old top under the new one — the
  // stack must grow here too, or the trophy bonus (R4/A5) is invisible to
  // the heuristic and every capture looks weaker than it actually lands.
  const prevStackLen = cell.stack.length;
  if (target) cell.stack.push(target);
  cell.tile = { ...tile, owner: player };
  const own = game.relativeInfluence(move.col, move.row);
  score += own; // healthy tiles are worth their influence (now incl. trophies)
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

  // R5: a small pull toward the seam. Riftlight only pays off at the
  // boardSummary/victory level (A6), which this 1-ply heuristic never looks
  // at — without a nudge here it only ever sees the RIFT_AURA combat penalty
  // and never approaches, the exact "nothing rewards going near the rift"
  // failure tumble-dry's F3 diagnosed. Small and flat: a taste of the
  // Riftlight payoff, not a substitute for actually holding the ground.
  if (game.board[move.col][move.row].rift ||
      neighborCoords(move.col, move.row).some(([c, r]) => game.board[c][r].rift)) {
    score += 3;
  }

  // Never leave own capital capturable.
  const ownCap = findCapital(game, player);
  if (ownCap && game.relativeInfluence(ownCap.col, ownCap.row) === 0) score -= 1000;

  cell.tile = target; // revert
  cell.stack.length = prevStackLen;
  return score + rand() * 0.25; // tie-break noise
}

// Decide the bot's whole turn. Returns the action it took.
// rand is required — no Math.random fallback, core stays deterministic.
export function botTakeTurn(game, player, rand) {
  if (game.phase === 'capital') {
    if (game.currentPlayer !== player) return { kind: 'not-my-turn' };
    // Deep and central: back row first (shallow capitals were the exploitable
    // 30%-KO diet — 2026-07-10 balance round), middle columns preferred.
    const mid = midRow();
    const deep = player === 1 ? 0 : CONFIG.GRID_H - 1;
    const shallow = player === 1 ? mid - CONFIG.CAPITAL_MIN_DIST_FROM_SEAM : mid + CONFIG.CAPITAL_MIN_DIST_FROM_SEAM;
    const cols = [6, 5, 7, 4, 8, 3, 9, 2, 10, 1, 11, 0, 12];
    for (const col of cols) {
      for (const r of player === 1 ? [deep, deep + 1, shallow] : [deep, deep - 1, shallow]) {
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
