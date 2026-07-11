// Policy agent — the "RL" class. A linear policy over hand-crafted move
// features, trained by evolution-strategies self-play (tools/train.js).
// Retraining after any rules change is `npm run train` — this is what makes
// the arena survive mechanics revisions (adaptable agents).
import { CONFIG } from '../config.js';
import { neighborCoords, hexDistance, midRow } from '../board.js';

export const FEATURE_NAMES = [
  'bias',
  'ownRelAfter',        // tile's relative influence once placed
  'selfZero',           // lands instantly capturable
  'captureValue',       // captured tile influence (0 if none)
  'capitalCapture',     // winning move
  'pressureKills',      // enemy neighbors pushed to 0
  'pressureDrop',       // total enemy relInf reduction
  'capitalMarch',       // closeness to enemy capital
  'riftAttunement',     // rift neighbors × (ATTUNED ? 1 : -1)
  'homeDefense',        // raises own capital's influence while it is low
  'wardPop',            // attacking an unbroken ward
  'ascendHeight',       // resulting tower height when ascending (round 6)
  'ruinsUnder',         // ruin drain the placed face will suffer (post-scar)
  'peelExposure',       // ascend: adjacent enemies that could peel the tower
  'towerPeel',          // material removed by peeling an enemy tower (card bounces)
];

// Default weights approximate the greedy heuristic — a sane untrained start.
export const DEFAULT_WEIGHTS = [0, 1, -8, 8, 1000, 9, 1, 0.5, 1, 4, -12, 0.5, -0.5, -0.3, 2];

function findCapital(game, owner) {
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    for (let r = 0; r < CONFIG.GRID_H; r++) {
      const t = game.board[c][r].tile;
      if (t && t.capital && t.owner === owner) return { col: c, row: r };
    }
  }
  return null;
}

export function moveFeatures(game, player, move) {
  const enemy = player === 1 ? 2 : 1;
  const tile = game.hands[player][move.handIndex];
  const cell = game.board[move.col][move.row];
  const target = cell.tile;
  const f = new Array(FEATURE_NAMES.length).fill(0);
  f[0] = 1;

  if (target && target.owner !== player) {
    if (target.capital) { f[4] = 1; return f; }
    if (target.keywords.includes('WARD') && !target.wardConsumed) { f[10] = 1; return f; }
    if (cell.stack.length > 0) {
      // Peel: pops the top tier, scars the cell, the card bounces back.
      f[14] = target.influence + CONFIG.TIER_BONUS;
      return f;
    }
  }

  const enemyBefore = neighborCoords(move.col, move.row)
    .map(([c, r]) => ({ c, r, t: game.board[c][r].tile }))
    .filter(n => n.t && n.t.owner === enemy)
    .map(n => ({ ...n, rel: game.relativeInfluence(n.c, n.r) }));

  if (target && target.owner === player) {
    // Ascend: resulting tower influence + the pressure the taller face exerts
    cell.stack.push(target);
    cell.tile = { ...tile, owner: player };
    f[1] = game.relativeInfluence(move.col, move.row);
    f[2] = f[1] === 0 ? 1 : 0;
    for (const n of enemyBefore) {
      const after = game.relativeInfluence(n.c, n.r);
      if (after === 0 && n.rel > 0) f[5] += n.t.capital ? 4 : 1;
      f[6] += Math.max(0, n.rel - after);
    }
    f[11] = cell.stack.length + 1;
    if (!tile.keywords.includes('ATTUNED')) {
      f[12] = Math.min(cell.ruins, CONFIG.RUIN_CAP) * CONFIG.RUIN_PENALTY;
    }
    f[13] = enemyBefore.length;
    cell.tile = target;
    cell.stack.pop();
    return f;
  }

  const prev = cell.tile;
  cell.tile = { ...tile, owner: player };
  if (target) cell.ruins++; // a capture scars the ground under the new tile
  f[1] = game.relativeInfluence(move.col, move.row);
  f[2] = f[1] === 0 ? 1 : 0;
  f[3] = target ? target.influence : 0;
  for (const n of enemyBefore) {
    const after = game.relativeInfluence(n.c, n.r);
    if (after === 0 && n.rel > 0) f[5] += n.t.capital ? 4 : 1;
    f[6] += Math.max(0, n.rel - after);
  }
  if (!tile.keywords.includes('ATTUNED')) {
    f[12] = Math.min(cell.ruins, CONFIG.RUIN_CAP) * CONFIG.RUIN_PENALTY;
  }
  const enemyCap = findCapital(game, enemy);
  if (enemyCap) f[7] = Math.max(0, 10 - hexDistance(move.col, move.row, enemyCap.col, enemyCap.row));
  let riftN = 0;
  for (const [c, r] of neighborCoords(move.col, move.row)) if (game.board[c][r].rift) riftN++;
  f[8] = riftN * (tile.keywords.includes('ATTUNED') ? 1 : -1);
  const ownCap = findCapital(game, player);
  if (ownCap && hexDistance(move.col, move.row, ownCap.col, ownCap.row) === 1) {
    const capRel = game.relativeInfluence(ownCap.col, ownCap.row);
    if (capRel <= 2) f[9] = 3 - capRel;
  }
  if (target) cell.ruins--;
  cell.tile = prev;
  return f;
}

export function makePolicy({ weights = null, name = 'policy' } = {}) {
  const w = weights || DEFAULT_WEIGHTS;
  return {
    name,
    weights: w,
    takeTurn(game, player, rand) {
      if (game.phase === 'capital') {
        // deep + central, like the tuned greedy
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
        for (let i = 0; i < w.length; i++) s += w[i] * f[i];
        s += rand() * 0.01;
        if (s > bestScore) { bestScore = s; best = { kind: 'place', ...mv }; }
      }

      // Rites compete in the same argmax (fixed heuristic values — removal is
      // worth roughly a capture, buffs scale with targets hit).
      game.hands[player].forEach((card, handIndex) => {
        if (card.kind !== 'rite') return;
        for (const t of game.legalRiteTargets(player, handIndex)) {
          let s = 0.3; // FORESIGHT-class floor
          if (card.type === 'SUNDER' && t.col !== null) {
            s = 5 + (game.board[t.col][t.row].tile?.influence || 0) * 2;
          } else if (card.type === 'RALLYING_CRY' && t.col !== null) {
            let friends = 0;
            for (const [c, r] of neighborCoords(t.col, t.row)) {
              const nt = game.board[c][r].tile;
              if (nt && nt.owner === player && !nt.capital) friends++;
            }
            s = friends * 1.3;
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
