// R8/P2: the road network — derived state over the placed board, nothing more.
// refreshRoads() is called after every topology mutation (any branch that
// assigns cell.tile; see game._boardMutated) and NEVER during eval/clone hot
// paths — clone copies the flags. All scans are fixed-order (col-major +
// neighborCoords order), so the result is deterministic and MP-replay-safe.
//
// Naming note: "surge"/"road pressure" here is the P2 network mechanic —
// distinct from the pre-existing height-pressure policy features
// (pressureKills/pressureDrop) and the R3 high-ground pressure sum.
import { CONFIG } from './config.js';
import { neighborCoords } from './board.js';

function eachCell(game, fn) {
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    for (let r = 0; r < CONFIG.GRID_H; r++) fn(game.board[c][r]);
  }
}

// Capital-rooted BFS over same-owner adjacency. Returns the reached cell set
// (as "c,r" keys) including the capital cell itself.
function capitalComponent(game, player) {
  const reached = new Set();
  let start = null;
  eachCell(game, cell => {
    if (cell.tile?.capital && cell.tile.owner === player) start = cell;
  });
  if (!start) return reached;
  const queue = [start];
  reached.add(`${start.col},${start.row}`);
  while (queue.length) {
    const cur = queue.shift();
    for (const [c, r] of neighborCoords(cur.col, cur.row)) {
      const key = `${c},${r}`;
      if (reached.has(key)) continue;
      const nt = game.board[c][r].tile;
      if (nt && nt.owner === player) {
        reached.add(key);
        queue.push(game.board[c][r]);
      }
    }
  }
  return reached;
}

// Enclosure test (A4): flood-fill every in-play cell NOT in the wall set from
// the board boundary; unreached cells are enclosed. Triangles/capital-fans
// enclose nothing; only a true ring around ≥1 hex registers. Consumed cells
// are passable void. Returns the enclosed cell keys.
function enclosedCells(game, wallSet) {
  const W = CONFIG.GRID_W, H = CONFIG.GRID_H;
  const seen = new Set();
  const queue = [];
  const seed = (c, r) => {
    const key = `${c},${r}`;
    if (seen.has(key) || wallSet.has(key)) return;
    seen.add(key);
    queue.push([c, r]);
  };
  for (let c = 0; c < W; c++) { seed(c, 0); seed(c, H - 1); }
  for (let r = 0; r < H; r++) { seed(0, r); seed(W - 1, r); }
  while (queue.length) {
    const [c, r] = queue.shift();
    for (const [nc, nr] of neighborCoords(c, r)) seed(nc, nr);
  }
  const enclosed = new Set();
  for (let c = 0; c < W; c++) {
    for (let r = 0; r < H; r++) {
      const key = `${c},${r}`;
      if (!wallSet.has(key) && !seen.has(key)) enclosed.add(key);
    }
  }
  return enclosed;
}

export function refreshRoads(game) {
  const prevMomentum = { 1: game.roads.momentum[1], 2: game.roads.momentum[2] };
  const prevLoop = { 1: game.roads.loop[1], 2: game.roads.loop[2] };
  eachCell(game, cell => {
    cell.linked = false; cell.roadPower = 0;
    cell.loopside = false; cell.loopNear = false;
  });

  for (const p of [1, 2]) {
    // The real capital-rooted component ALWAYS drives the enclosure wall set
    // (round-3 FOLD-1d: the _SEV_OFF harness arm must not let disconnected
    // debris register as ring walls — severance stays a single-axis A/B).
    const trueComponent = capitalComponent(game, p);

    // linked flags: real component, or (harness-only _SEV_OFF arm) every
    // owned tile — capital-rootedness off IS the severance-off rule.
    if (CONFIG._SEV_OFF) {
      eachCell(game, cell => { if (cell.tile?.owner === p) cell.linked = true; });
    } else {
      for (const key of trueComponent) {
        const [c, r] = key.split(',').map(Number);
        game.board[c][r].linked = true;
      }
    }

    // Loop = true enclosure. loopside marks the ring cells themselves.
    const enclosed = enclosedCells(game, trueComponent);
    game.roads.loop[p] = enclosed.size > 0;
    for (const key of enclosed) {
      const [c, r] = key.split(',').map(Number);
      for (const [nc, nr] of neighborCoords(c, r)) {
        const wall = game.board[nc][nr];
        if (wall.tile?.owner === p && trueComponent.has(`${nc},${nr}`)) wall.loopside = true;
      }
    }
  }

  // roadPower + loopNear: bounded BFS per linked cell through linked
  // same-owner cells, depth ≤ ROAD_CHAINSLIDE_REACH. The surge a defender
  // feels is the mass standing at the contact point, nothing global.
  const reach = CONFIG.ROAD_CHAINSLIDE_REACH;
  eachCell(game, cell => {
    if (!cell.linked) return;
    const owner = cell.tile.owner;
    const seen = new Set([`${cell.col},${cell.row}`]);
    let frontier = [cell];
    let count = 1;
    let loopNear = cell.loopside;
    for (let d = 0; d < reach; d++) {
      const next = [];
      for (const cur of frontier) {
        for (const [c, r] of neighborCoords(cur.col, cur.row)) {
          const key = `${c},${r}`;
          if (seen.has(key)) continue;
          const n = game.board[c][r];
          if (n.linked && n.tile.owner === owner) {
            seen.add(key);
            next.push(n);
            count++;
            if (n.loopside) loopNear = true;
          }
        }
      }
      frontier = next;
    }
    cell.roadPower = count;
    cell.loopNear = loopNear;
  });

  // Momentum (HUD/agent stat): linked non-capital tile count.
  const momentum = { 1: 0, 2: 0 };
  eachCell(game, cell => {
    if (cell.linked && !cell.tile.capital) momentum[cell.tile.owner]++;
  });
  game.roads.momentum = momentum;

  // Severance cue — knob-gated (OFF arm must stay byte-identical, incl. log).
  if (CONFIG.ROAD_PRESSURE_ON) {
    for (const p of [1, 2]) {
      const drop = prevMomentum[p] - momentum[p];
      if (drop >= 3) game._log(0, `SEVERANCE — ${drop} tiles cut from P${p}'s network`);
    }
  }
  return { prevLoop };
}

// The chain-slide surge felt by the defender at (col,row). Reads only cached
// flags — no graph walk per eval. Caller handles the capital exemption (A6)
// and WING halving; boardSummary calls relativeInfluence pressure-free (A7).
export function roadPressure(game, col, row, defenderOwner) {
  if (!CONFIG.ROAD_PRESSURE_ON) return 0;
  const e = defenderOwner === 1 ? 2 : 1;
  let contact = 0;
  for (const [c, r] of neighborCoords(col, row)) {
    const cell = game.board[c][r];
    if (cell.linked && cell.tile?.owner === e) {
      const power = cell.roadPower * (cell.loopNear ? CONFIG.LOOP_CLOSURE_MULT : 1);
      if (power > contact) contact = power;
    }
  }
  return Math.min(CONFIG.ROAD_PRESSURE_CAP, Math.floor(contact / CONFIG.ROAD_MOMENTUM_DIV));
}
