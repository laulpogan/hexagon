// R8/P2 — road network: linked/roadPower/loopside/loopNear + chain-slide
// surge + loop enclosure + severance. T1-T8, T11-T16 per RULES8_P2_ROADS.md
// (T9/T10 live in agents.test additions). Headless, deterministic, pins its
// own knobs (process exits after; no restore needed).
import assert from 'node:assert/strict';
import { CONFIG } from '../core/config.js';
import { Game } from '../core/game.js';
import { refreshRoads, roadPressure } from '../core/roads.js';
import { RITE_EFFECTS } from '../core/mechanics.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

CONFIG.ROAD_PRESSURE_ON = true;
CONFIG.ROAD_CHAINSLIDE_REACH = 3;
CONFIG.ROAD_MOMENTUM_DIV = 3;
CONFIG.ROAD_PRESSURE_CAP = 3;
CONFIG.LOOP_CLOSURE_MULT = 2;
CONFIG.SEAM_MAX_RINGS = 0;
CONFIG.FRONTIER_ANCHOR = false;

// Capitals at the bot-default deep-central cells: P1 (6,0), P2 (6,8).
function freshGame(seed = 'roads-test') {
  const g = new Game({ seed });
  assert.ok(g.placeCapital(1, 6, 0).ok, 'P1 capital');
  assert.ok(g.placeCapital(2, 6, CONFIG.GRID_H - 1).ok, 'P2 capital');
  return g;
}

// Test-level board surgery: drop a tile straight onto a cell, then refresh
// through the same tail real mutations use.
function put(g, owner, col, row, type = 'THICKET') {
  g.board[col][row].tile = g._makeTile(type, owner);
  g._boardMutated(owner);
}

console.log('tests/roads.test.js');

test('T1 linked flags: capital chain linked, detached island orphaned', () => {
  const g = freshGame();
  put(g, 1, 6, 1); put(g, 1, 6, 2); put(g, 1, 0, 4);
  assert.equal(g.board[6][1].linked, true);
  assert.equal(g.board[6][2].linked, true);
  assert.equal(g.board[6][0].linked, true, 'capital cell is network');
  assert.equal(g.board[0][4].linked, false, 'island is orphaned');
});

test('T2 momentum counts linked non-capital tiles only', () => {
  const g = freshGame();
  put(g, 1, 6, 1); put(g, 1, 6, 2); put(g, 1, 0, 4);
  assert.equal(g.roads.momentum[1], 2, 'island + capital excluded');
  assert.equal(g.roads.momentum[2], 0);
});

test('T3 loop = enclosure: triangle no, capital-fan no, ring around a hole yes; MULT is local', () => {
  const g = freshGame();
  // capital-fan triangle: (5,0)+(6,1) both adjacent to capital (6,0) and each other
  put(g, 1, 5, 0); put(g, 1, 6, 1);
  assert.equal(g.roads.loop[1], false, 'capital-fan encloses nothing');
  // plain triangle appendage: (6,2) adjacent to (6,1); (7,1)? build (6,2)+(7,1)
  put(g, 1, 6, 2); put(g, 1, 7, 1);
  assert.equal(g.roads.loop[1], false, 'dense clump still encloses nothing');

  // true ring around hole (6,3): neighbors (5,2),(5,3),(6,2),(6,4),(7,2),(7,3)
  const h = freshGame();
  put(h, 1, 6, 1); put(h, 1, 6, 2); // spine to ring
  for (const [c, r] of [[5, 2], [5, 3], [6, 4], [7, 2], [7, 3]]) put(h, 1, c, r);
  assert.equal(h.roads.loop[1], true, 'ring around (6,3) is a loop');
  assert.equal(h.board[6][3].tile, null, 'hole stays empty');
  assert.equal(h.board[6][4].loopside, true, 'ring cell marked');
  assert.equal(h.board[6][1].loopside, false, 'spine cell not ring');

  // MULT locality: straw off the ring, REACH pinned to 1 for a sharp boundary
  CONFIG.ROAD_CHAINSLIDE_REACH = 1;
  put(h, 1, 6, 5); put(h, 1, 6, 6); // straw (6,4)→(6,5)→(6,6)
  assert.equal(h.board[6][5].loopNear, true, '1 hop from ring cell (6,4)');
  assert.equal(h.board[6][6].loopNear, false, '2 hops: ring out of surge reach');
  // enemy adjacent ONLY to the far tip (6,6): (5,6) touches (6,6)+(6,7)
  put(h, 2, 5, 6);
  const tipPower = h.board[6][6].roadPower; // depth-1 BFS: self + (6,5)
  assert.equal(tipPower, 2);
  assert.equal(roadPressure(h, 5, 6, 2), Math.min(CONFIG.ROAD_PRESSURE_CAP,
    Math.floor(tipPower / CONFIG.ROAD_MOMENTUM_DIV)), 'no MULT at far tip');
  CONFIG.ROAD_CHAINSLIDE_REACH = 3;
});

test('T4 severance on capture: mid-chain cut orphans the tail; reconnection restores', () => {
  const g = freshGame();
  for (const r of [1, 2, 3, 4]) put(g, 1, 6, r);
  assert.equal(g.roads.momentum[1], 4);
  put(g, 2, 6, 2); // enemy takes the bridge (test surgery for a capture)
  assert.equal(g.board[6][3].linked, false, 'tail orphaned');
  assert.equal(g.board[6][4].linked, false);
  assert.equal(g.roads.momentum[1], 1, 'only (6,1) survives');
  // reconnect around the cut: (5,1)~(6,1)&(5,2); (5,2)~(6,3)
  put(g, 1, 5, 1); put(g, 1, 5, 2);
  assert.equal(g.board[6][3].linked, true, 'tail restored');
  assert.equal(g.roads.momentum[1], 5);
});

test('T5 severance on SUNDER', () => {
  const g = freshGame();
  for (const r of [1, 2, 3, 4]) put(g, 1, 6, r);
  RITE_EFFECTS.SUNDER.resolve(g, 2, 6, 2);
  assert.equal(g.board[6][2].tile, null);
  assert.equal(g.board[6][3].linked, false, 'downstream orphaned');
  assert.equal(g.roads.momentum[1], 1);
});

test('T6 surge applied, capped, REACH-limited; OFF is a numeric no-op', () => {
  const g = freshGame();
  for (const r of [1, 2, 3, 4, 5]) put(g, 1, 6, r); // 5-chain from capital
  put(g, 2, 5, 5, 'COLOSSUS'); // strong defender adjacent to tip (6,5)
  put(g, 2, 5, 6);             // friendly support so relInf stays above the clamp
  const tip = g.board[6][5];
  assert.equal(tip.roadPower, 4, 'tip + 3 within REACH (straw math)');
  assert.equal(roadPressure(g, 5, 5, 2), 1, 'floor(4/3)');
  const withP = g.relativeInfluence(5, 5);
  const noP = g.relativeInfluence(5, 5, false);
  assert.ok(noP >= 1, `defender must sit above the clamp (got ${noP})`);
  assert.equal(noP - withP, 1, 'surge subtracts exactly the pressure');
  // cap: mass BEHIND the tip (all within REACH of it) — huge contact clamps at CAP
  for (const [c, r] of [[5, 4], [5, 3], [7, 3], [5, 2], [7, 2]]) put(g, 1, c, r);
  assert.equal(roadPressure(g, 5, 5, 2), CONFIG.ROAD_PRESSURE_CAP, 'big front mass caps');
  // OFF parity at the unit level
  CONFIG.ROAD_PRESSURE_ON = false;
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    for (let r = 0; r < CONFIG.GRID_H; r++) {
      if (!g.board[c][r].tile) continue;
      assert.equal(g.relativeInfluence(c, r), g.relativeInfluence(c, r, false),
        `OFF: pressure path identical at (${c},${r})`);
    }
  }
  CONFIG.ROAD_PRESSURE_ON = true;
});

test('T7 clone copies road state, never aliases, never recomputes', () => {
  const g = freshGame();
  put(g, 1, 6, 1); put(g, 1, 6, 2);
  g.board[6][1].roadPower = 99; // stale marker — a recompute would erase it
  const c = g.clone();
  assert.equal(c.board[6][1].roadPower, 99, 'copied, not recomputed');
  assert.equal(c.board[6][2].linked, true);
  assert.deepEqual(c.roads, g.roads);
  c.roads.momentum[1] = 42;
  c.roads.loop[2] = true;
  assert.notEqual(g.roads.momentum[1], 42, 'no aliasing (momentum)');
  assert.equal(g.roads.loop[2], false, 'no aliasing (loop)');
});

test('T8 refresh determinism: identical games → identical flags', () => {
  const snap = g => JSON.stringify({
    roads: g.roads,
    cells: g.board.flat().map(x => [x.linked, x.roadPower, x.loopside, x.loopNear]),
  });
  const build = () => {
    const g = freshGame('det');
    for (const r of [1, 2, 3]) put(g, 1, 6, r);
    put(g, 2, 6, 7); put(g, 2, 6, 6);
    return g;
  };
  assert.equal(snap(build()), snap(build()));
});

test('T11 WING halves the surge', () => {
  const g = freshGame();
  // mass BEHIND the tip so the contact carries pressure ≥2 pre-WING
  for (const r of [1, 2, 3, 4, 5]) put(g, 1, 6, r);
  for (const [c, r] of [[5, 3], [7, 3], [5, 2], [7, 2]]) put(g, 1, c, r);
  const p = roadPressure(g, 5, 5, 2);
  assert.ok(p >= 2, `need pressure ≥2 to observe halving (got ${p})`);
  put(g, 2, 5, 5, 'GALEHARRIER'); // WING defender adjacent to the tip
  put(g, 2, 5, 6); put(g, 2, 4, 6); // support keeps it above the clamp
  const withP = g.relativeInfluence(5, 5);
  const noP = g.relativeInfluence(5, 5, false);
  assert.ok(noP >= Math.floor(p / 2), `defender above clamp (got ${noP})`);
  assert.equal(noP - withP, Math.floor(p / 2), 'WING halves the surge');
});

test('T12 capital-capture branch refreshes roads before phase=over', () => {
  const g = freshGame();
  // crush the P2 capital with two COLOSSUS neighbors, then really capture it
  put(g, 2, 6, 7); // give P2 a linked tile that must orphan on the fall
  put(g, 1, 5, 8, 'COLOSSUS'); put(g, 1, 7, 8, 'COLOSSUS');
  assert.ok(g.isCapturable(6, 8, 1), 'capital crushed to 0');
  g.currentPlayer = 1; g.placementsLeft = 1;
  g.hands[1] = [g._makeTile('THICKET', 1)];
  const res = g.placeFromHand(1, 0, 6, 8);
  assert.ok(res.ok && res.won);
  assert.equal(g.phase, 'over');
  assert.equal(g.roads.momentum[2], 0, 'post-game road state refreshed: P2 rootless');
  assert.equal(g.board[6][7].linked, false);
});

test('T13 WARD bounce mutates nothing — road state untouched', () => {
  const g = freshGame();
  put(g, 1, 6, 1);
  put(g, 2, 6, 2, 'PETRIFIED-ROSE'); // WARD, adjacent to P1 (6,1)
  const before = JSON.stringify(g.roads);
  g.currentPlayer = 1; g.placementsLeft = 1;
  g.hands[1] = [g._makeTile('COLOSSUS', 1)];
  const res = g.placeFromHand(1, 0, 6, 2);
  assert.ok(res.ok && res.wardBlocked);
  assert.equal(JSON.stringify(g.roads), before);
  assert.equal(g.board[6][2].tile.type, 'PETRIFIED-ROSE', 'board unchanged');
});

test('T14 roadSurgeThisTurn is transient — not cloned', () => {
  const g = freshGame();
  put(g, 1, 6, 1);
  assert.ok(g.roadSurgeThisTurn, 'cue set on mutation');
  const c = g.clone();
  assert.equal(c.roadSurgeThisTurn, undefined);
});

test('T15 SEVERANCE log: fires at drop ≥3, silent at 2, silent when OFF', () => {
  const sevLogs = g => g.log.filter(l => l.text.startsWith('SEVERANCE')).length;
  const g1 = freshGame();
  for (const r of [1, 2, 3, 4]) put(g1, 1, 6, r);
  put(g1, 2, 6, 2); // momentum 4→1, drop 3
  assert.equal(sevLogs(g1), 1);
  const g2 = freshGame();
  for (const r of [1, 2, 3]) put(g2, 1, 6, r);
  put(g2, 2, 6, 2); // 3→1, drop 2
  assert.equal(sevLogs(g2), 0);
  CONFIG.ROAD_PRESSURE_ON = false;
  const g3 = freshGame();
  for (const r of [1, 2, 3, 4]) put(g3, 1, 6, r);
  put(g3, 2, 6, 2);
  assert.equal(sevLogs(g3), 0, 'OFF arm log byte-parity');
  CONFIG.ROAD_PRESSURE_ON = true;
});

test('T16 capitals exempt from surge as defenders', () => {
  const g = freshGame();
  // full LINKED P2 column from their capital up to the P1 capital's face
  for (const r of [7, 6, 5, 4, 3, 2, 1]) put(g, 2, 6, r);
  assert.equal(g.board[6][1].linked, true, 'attacker chain is linked');
  assert.ok(roadPressure(g, 6, 0, 1) > 0, 'a non-capital here WOULD feel surge');
  assert.equal(g.relativeInfluence(6, 0), g.relativeInfluence(6, 0, false),
    'capital feels no surge');
});

test('T3b _SEV_OFF: debris never forms enclosure walls (single-axis arm)', () => {
  const g = freshGame();
  // 6 DISCONNECTED P1 tiles around hole (6,3) minus the spine — no capital link
  for (const [c, r] of [[5, 2], [5, 3], [6, 2], [6, 4], [7, 2], [7, 3]]) {
    g.board[c][r].tile = g._makeTile('THICKET', 1);
  }
  CONFIG._SEV_OFF = true;
  refreshRoads(g);
  assert.equal(g.board[5][2].linked, true, '_SEV_OFF links everything owned');
  assert.equal(g.roads.loop[1], false, 'but debris is no ring wall');
  CONFIG._SEV_OFF = undefined;
  refreshRoads(g);
  assert.equal(g.board[5][2].linked, false, 'normal rules: debris orphaned');
});

// T9/T10 — agent layer
const { moveFeatures, FEATURE_NAMES, DEFAULT_WEIGHTS } = await import('../core/agents/policy.js');
const { makeRoadRush } = await import('../core/agents/roadrush.js');
const { mulberry32, hashSeed } = await import('../core/rng.js');

test('T9 policy road features: aligned entries, knob-gated, zero on non-resolving branches', () => {
  assert.equal(FEATURE_NAMES.length, DEFAULT_WEIGHTS.length); // R8/P3: registry grew to 22
  assert.equal(DEFAULT_WEIGHTS.length, 22);
  assert.equal(FEATURE_NAMES[18], 'momentumGain');
  assert.equal(FEATURE_NAMES[19], 'severDamage');
  const g = freshGame();
  for (const r of [1, 2, 3]) put(g, 1, 6, r);
  g.hands[1] = [g._makeTile('THICKET', 1)];
  // extension move touching the linked chain
  const fExt = moveFeatures(g, 1, { handIndex: 0, col: 6, row: 4 });
  assert.equal(fExt[18], 1, 'plain extension gains 1');
  assert.equal(fExt[19], 0);
  // severance capture: P2's bridge in a P2 chain
  const h = freshGame();
  for (const r of [7, 6, 5, 4]) put(h, 2, 6, r);
  put(h, 1, 5, 4); // P1 foothold beside (6,4)... adjacency for feature calc only
  h.hands[1] = [h._makeTile('COLOSSUS', 1)];
  const fSev = moveFeatures(h, 1, { handIndex: 0, col: 6, row: 6 });
  assert.equal(fSev[19], 2, 'capturing (6,6) orphans (6,5),(6,4)');
  // WARD-blocked target → both stay 0
  const k = freshGame();
  put(k, 1, 6, 1);
  put(k, 2, 6, 2, 'PETRIFIED-ROSE');
  k.hands[1] = [k._makeTile('COLOSSUS', 1)];
  const fWard = moveFeatures(k, 1, { handIndex: 0, col: 6, row: 2 });
  assert.equal(fWard[18], 0); assert.equal(fWard[19], 0);
  // knob OFF → both 0 even for a real extension
  CONFIG.ROAD_PRESSURE_ON = false;
  const fOff = moveFeatures(g, 1, { handIndex: 0, col: 6, row: 4 });
  assert.equal(fOff[18], 0); assert.equal(fOff[19], 0);
  CONFIG.ROAD_PRESSURE_ON = true;
});

test('T10 roadrush arm: legal, deterministic given seed', () => {
  const play = () => {
    const g = new Game({ seed: 'rr-det' });
    const a = makeRoadRush({ w: 5 });
    const rand = mulberry32(hashSeed('rr-rand'));
    let guard = 200;
    while (g.phase !== 'over' && guard-- > 0) a.takeTurn(g, g.currentPlayer, rand);
    return JSON.stringify({ w: g.winner, t: g.turn, log: g.log.slice(-5) });
  };
  const one = play();
  assert.equal(one, play(), 'same seed → identical game');
});

console.log(`roads.test.js: ${passed} passed`);
