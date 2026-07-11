// Policy agent — the "RL" class. A linear policy over hand-crafted move
// features, trained by evolution-strategies self-play (tools/train.js).
// Retraining after any rules change is `npm run train` — this is what makes
// the arena survive mechanics revisions (adaptable agents).
import { CONFIG } from '../config.js';
import { neighborCoords, hexDistance, midRow, ringIndex } from '../board.js';

// A12 (RULES-7 rework): 'ruinsUnder' and 'towerPeel' are dead — R7 removed
// ruin decay and R1 removed peel entirely (captures always bury now, there
// is nothing left to "peel off for free"). Replaced with the R3/R4/R5
// signals the new ruleset actually rewards: height-delta, trophy-gain,
// riftlight-gain, bury depth. 'peelExposure' is renamed (same defensive
// idea — enemies that could hit straight back — just no longer peel-specific).
export const FEATURE_NAMES = [
  'bias',
  'ownRelAfter',         // tile's relative influence once placed
  'selfZero',            // lands instantly capturable
  'captureValue',        // captured tile influence (0 if none)
  'capitalCapture',      // winning move
  'pressureKills',       // enemy neighbors pushed to 0
  'pressureDrop',        // total enemy relInf reduction
  'capitalMarch',        // closeness to enemy capital
  'riftAttunement',      // rift neighbors × (ATTUNED ? 1 : -1)
  'homeDefense',         // raises own capital's influence while it is low
  'wardPop',             // attacking an unbroken ward (A3: the one surviving bounce)
  'ascendHeight',        // resulting tower height when self-ascending
  'heightDelta',         // R3: resulting height minus the tallest adjacent enemy
  'recaptureExposure',   // enemies adjacent that could immediately strike back
  'trophyGain',          // R4/A5: trophy value (buried enemy tiers) this move achieves
  'riftlightGain',       // R5: Riftlight this held cell would contribute
  'buryDepth',           // resulting stack depth grown by a capture
  'seamSafety',          // R8/P1: ring-distance to consumption (rings past the doomed one)
  // R8/P2 road-network features ("surge" mechanic — distinct from the R3
  // height-pressure features pressureKills/pressureDrop above). Computed only
  // where a placement actually resolves on the board; WARD-blocked, capital-
  // capture, and ascend branches stay 0 (a bounce changes nothing — a phantom
  // severDamage there is an unlearnable signal for a linear policy).
  'momentumGain',        // R8/P2: own linked-network growth incl. reconnected orphans
  'severDamage',         // R8/P2: enemy tiles this capture cuts from their capital
];

// Default weights approximate the greedy heuristic — a sane untrained start.
export const DEFAULT_WEIGHTS = [0, 1, -8, 8, 1000, 9, 1, 0.5, 1, 4, -12, 0.3, 1.5, -0.5, 2, 1.5, 0.5, 0.5, 0.5, 2];

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
  // R8/P1: seam-awareness — set BEFORE the early-return branches (gate-#2
  // reviewer: capture/ward/ascend paths returned with f[17] stuck at 0,
  // reading as "about to be eaten" for deep safe moves). Zero while the seam
  // is OFF: ring position is not a signal without consumption, and the OFF
  // path must not carry a live positional feature the old policy lacked.
  f[17] = CONFIG.SEAM_MAX_RINGS > 0
    ? Math.min(2, Math.max(0, ringIndex(move.col, move.row) - game.seam.ringsConsumed))
    : 0;

  if (target && target.owner !== player) {
    if (target.capital) { f[4] = 1; return f; }
    if (target.keywords.includes('WARD') && !target.wardConsumed) { f[10] = 1; return f; }
  }

  const enemyBefore = neighborCoords(move.col, move.row)
    .map(([c, r]) => ({ c, r, t: game.board[c][r].tile }))
    .filter(n => n.t && n.t.owner === enemy)
    .map(n => ({ ...n, rel: game.relativeInfluence(n.c, n.r) }));

  if (target && target.owner === player) {
    // Self-ascend: resulting height + the pressure the taller face exerts.
    // R4: self-stacking grants no influence — ES has to learn this buys
    // POSITION (height-delta, R3), not power.
    cell.stack.push(target);
    cell.tile = { ...tile, owner: player };
    f[1] = game.relativeInfluence(move.col, move.row);
    f[2] = f[1] === 0 ? 1 : 0;
    for (const n of enemyBefore) {
      const after = game.relativeInfluence(n.c, n.r);
      if (after === 0 && n.rel > 0) f[5] += n.t.capital ? 4 : 1;
      f[6] += Math.max(0, n.rel - after);
    }
    const myHeight = cell.stack.length + 1;
    f[11] = myHeight;
    const tallestEnemy = enemyBefore.reduce((m, n) => Math.max(m, game.cellHeight(n.c, n.r)), 0);
    f[12] = myHeight - tallestEnemy;
    f[13] = enemyBefore.length;
    cell.tile = target;
    cell.stack.pop();
    return f;
  }

  const prev = cell.tile;
  const prevStackLen = cell.stack.length;
  // R1: a capture buries the old top under the new one — simulate the bury
  // so trophy/height reads reflect what actually happens on placeFromHand.
  if (target) cell.stack.push(target);
  cell.tile = { ...tile, owner: player };
  f[1] = game.relativeInfluence(move.col, move.row);
  f[2] = f[1] === 0 ? 1 : 0;
  f[3] = target ? target.influence : 0;
  for (const n of enemyBefore) {
    const after = game.relativeInfluence(n.c, n.r);
    if (after === 0 && n.rel > 0) f[5] += n.t.capital ? 4 : 1;
    f[6] += Math.max(0, n.rel - after);
  }
  const myHeight = cell.stack.length + 1;
  const tallestEnemy = enemyBefore.reduce((m, n) => Math.max(m, game.cellHeight(n.c, n.r)), 0);
  f[12] = myHeight - tallestEnemy;
  f[13] = enemyBefore.length; // recapture exposure
  if (target) {
    f[14] = game.trophyValue(move.col, move.row); // R4/A5 trophy-gain
    f[16] = cell.stack.length;                    // bury depth
  }
  const enemyCap = findCapital(game, enemy);
  if (enemyCap) f[7] = Math.max(0, 10 - hexDistance(move.col, move.row, enemyCap.col, enemyCap.row));
  let riftN = 0;
  for (const [c, r] of neighborCoords(move.col, move.row)) if (game.board[c][r].rift) riftN++;
  f[8] = riftN * (tile.keywords.includes('ATTUNED') ? 1 : -1);
  f[15] = (riftN > 0 || game.board[move.col][move.row].rift) ? CONFIG.RIFTLIGHT_PER_CELL : 0; // R5 riftlight-gain
  const ownCap = findCapital(game, player);
  if (ownCap && hexDistance(move.col, move.row, ownCap.col, ownCap.row) === 1) {
    const capRel = game.relativeInfluence(ownCap.col, ownCap.row);
    if (capRel <= 2) f[9] = 3 - capRel;
  }
  // R8/P2 road features — exact bounded BFS on the sim state (gate-#1: a local
  // recount is blind to reconnection/severance, the exact moves these reward).
  // Linked flags are start-of-turn (the sim never re-runs refreshRoads); the
  // resulting one-tile staleness in f[1]/f[5]/f[6]'s surge reads is accepted
  // heuristic noise — documented, not silent.
  if (CONFIG.ROAD_PRESSURE_ON) {
    // momentumGain: does the placed cell touch the linked network (capital
    // cell counts — it is linked)? Then 1 + every own orphan it reconnects.
    const linksUp = neighborCoords(move.col, move.row).some(([c, r]) => {
      const n = game.board[c][r];
      return n.linked && n.tile?.owner === player;
    });
    if (linksUp) {
      let gain = 1;
      const seen = new Set([`${move.col},${move.row}`]);
      const queue = [[move.col, move.row]];
      while (queue.length) {
        const [qc, qr] = queue.shift();
        for (const [c, r] of neighborCoords(qc, qr)) {
          const key = `${c},${r}`;
          if (seen.has(key)) continue;
          const n = game.board[c][r];
          if (n.tile && n.tile.owner === player && !n.linked && !n.tile.capital) {
            seen.add(key);
            queue.push([c, r]);
            gain++;
          }
        }
      }
      f[18] = gain;
    }
    // severDamage: enemy linked non-capital count (flags; captured cell already
    // owner-flipped in the sim, so it self-excludes) minus what their capital
    // still reaches on the post-move board.
    if (target) {
      let before = 0;
      let enemyCap = null;
      for (let c = 0; c < CONFIG.GRID_W; c++) {
        for (let r = 0; r < CONFIG.GRID_H; r++) {
          const n = game.board[c][r];
          if (n.linked && n.tile?.owner === enemy && !n.tile.capital) before++;
          if (n.tile?.capital && n.tile.owner === enemy) enemyCap = [c, r];
        }
      }
      if (enemyCap) {
        const seen = new Set([`${enemyCap[0]},${enemyCap[1]}`]);
        const queue = [enemyCap];
        let after = 0;
        while (queue.length) {
          const [qc, qr] = queue.shift();
          for (const [c, r] of neighborCoords(qc, qr)) {
            const key = `${c},${r}`;
            if (seen.has(key)) continue;
            const n = game.board[c][r];
            if (n.tile && n.tile.owner === enemy) {
              seen.add(key);
              queue.push([c, r]);
              if (!n.tile.capital) after++;
            }
          }
        }
        f[19] = Math.max(0, before - after);
      }
    }
  }
  cell.tile = prev;
  cell.stack.length = prevStackLen;
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
