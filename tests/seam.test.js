// R8/P1 — THE SEAM ADVANCES + frontier-anchored legality. Headless, seeded,
// deterministic; plain-node style matching tests/core.test.js. T1-T10 per
// RULES8_P1_SEAM.md (gate criterion #7).
import assert from 'node:assert/strict';
import { CONFIG } from '../core/config.js';
import { Game } from '../core/game.js';
import { ringIndex, midRow, neighborCoords } from '../core/board.js';
import { tileTemplate } from '../data/tiles.js';

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

// The mechanic SHIPS OFF (P1 gate result, config.js) — these tests exercise
// it regardless by pinning their own knobs. Test process exits after; no
// restore needed (never runs in the same process as a live game).
CONFIG.SEAM_ADVANCE_START = 5;
CONFIG.SEAM_ADVANCE_CADENCE = 5;
CONFIG.SEAM_MAX_RINGS = 2;
CONFIG.FRONTIER_ANCHOR = true;
const START = CONFIG.SEAM_ADVANCE_START;
const CADENCE = CONFIG.SEAM_ADVANCE_CADENCE;
const MAX = CONFIG.SEAM_MAX_RINGS;

// Helpers ------------------------------------------------------------------
// Fresh game with both capitals placed at fixed, legal, mirrored cells.
function freshGame(seed = 'seam-test') {
  const g = new Game({ seed });
  const mid = midRow();
  // deep central capitals, the bot-default geometry: (6,0) / (6,8)
  assert.ok(g.placeCapital(1, 6, 0).ok, 'P1 capital');
  assert.ok(g.placeCapital(2, 6, CONFIG.GRID_H - 1).ok, 'P2 capital');
  assert.equal(g.phase, 'play');
  void mid;
  return g;
}

// Advance plies by passing/discarding without placing: use pass() when legal
// moves exist we still want to skip — pass() requires 0 legal moves, so
// instead we advance by placing nothing: call _endTurn directly (test-only,
// deterministic; mirrors how sim drives plies without UI).
function advancePly(g, n = 1) {
  for (let i = 0; i < n; i++) g._endTurn();
}

function countConsumed(g, ring = null) {
  let n = 0;
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    for (let r = 0; r < CONFIG.GRID_H; r++) {
      const cell = g.board[c][r];
      if (cell.consumed && (ring === null || ringIndex(c, r) === ring)) n++;
    }
  }
  return n;
}

function firstHandTile(g, player, { keyword = null, noKeyword = null } = {}) {
  const hand = g.hands[player];
  for (const t of hand) {
    if (t.kind === 'rite') continue;
    if (keyword && !t.keywords.includes(keyword)) continue;
    if (noKeyword && t.keywords.includes(noKeyword)) continue;
    return t;
  }
  return null;
}

console.log('seam — consumption clock');

test('T1: tick fires exactly at START and consumes only empty ring-0 cells', () => {
  const g = freshGame();
  // turn is 1 after _startPlay; advance until just before START
  advancePly(g, START - g.turn - 1);
  assert.equal(g.turn, START - 1);
  assert.equal(countConsumed(g), 0, 'nothing consumed before START');
  advancePly(g, 1);
  assert.equal(g.turn, START);
  assert.equal(g.seam.ringsConsumed, 1, 'one ring consumed at START');
  const eaten = countConsumed(g, 0);
  assert.ok(eaten > 0, 'ring 0 cells consumed');
  assert.equal(countConsumed(g), eaten, 'only ring 0 consumed');
  // every consumed cell is empty and ring 0
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    for (let r = 0; r < CONFIG.GRID_H; r++) {
      const cell = g.board[c][r];
      if (cell.consumed) {
        assert.equal(cell.tile, null, 'consumed cells are empty');
        assert.equal(ringIndex(c, r), 0);
      }
    }
  }
});

test('T2: occupied cells survive consumption (capitals on ring 0 live)', () => {
  const g = freshGame();
  advancePly(g, START - g.turn);
  assert.equal(g.seam.ringsConsumed, 1);
  assert.ok(g.board[6][0].tile?.capital, 'P1 capital survives on ring 0');
  assert.equal(g.board[6][0].consumed, false);
  assert.ok(g.board[6][CONFIG.GRID_H - 1].tile?.capital, 'P2 capital survives');
});

test('T3: consumed and doomed cells reject placement, incl. SCOUT; capital legality rejects consumed', () => {
  const g = freshGame();
  // At turn 1, ring 0 is doomed (full inter-tick window). Non-aura ring-0
  // empty cell, e.g. (0,4)... ring 0, mid row — may be rift; pick (2,0):
  // ringIndex=0, not adjacent to capital at (6,0).
  const plain = { ...tileTemplate('THICKET'), id: 't', owner: 1 };
  assert.equal(g.canPlace(1, plain, 2, 0), false, 'doomed ring-0 cell rejects ordinary placement');
  const scout = { ...tileTemplate('LANTERN'), id: 's', owner: 1 };
  assert.equal(g.canPlace(1, scout, 2, 0), false, 'doomed ring-0 cell rejects SCOUT');
  // after the tick the same cell is consumed and still rejects
  advancePly(g, START - g.turn);
  assert.equal(g.board[2][0].consumed, true, 'cell consumed at tick');
  assert.equal(g.canPlace(1, plain, 2, 0), false, 'consumed rejects placement');
  // isLegalCapitalCell consumed guard (belt+suspenders — pre-play it is dead code)
  assert.equal(g.isLegalCapitalCell(1, 2, 0), false);
});

test('T4: MAX_RINGS invariant — never exceeded, no ring ≥ MAX consumed', () => {
  const g = freshGame();
  advancePly(g, START + CADENCE * (MAX + 2)); // well past all ticks
  assert.equal(g.seam.ringsConsumed, MAX, 'ringsConsumed capped at MAX');
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    for (let r = 0; r < CONFIG.GRID_H; r++) {
      if (g.board[c][r].consumed) assert.ok(ringIndex(c, r) < MAX, `ring ${ringIndex(c, r)} cell consumed beyond MAX`);
    }
  }
});

console.log('seam — frontier-anchored legality');

test('T5: retreat illegal, lateral legal, capital-adjacent backfill legal', () => {
  const g = freshGame();
  // P1 capital (6,0). Build a forward chain: (6,1) is capital-adjacent (legal
  // via clause b AND non-retreat off the capital anchor).
  const t1 = firstHandTile(g, 1, { noKeyword: 'SCOUT' });
  assert.ok(t1, 'P1 has a placeable tile');
  assert.equal(g.canPlace(1, t1, 6, 1), true, 'forward off capital legal');
  const idx1 = g.hands[1].indexOf(t1);
  assert.ok(g.placeFromHand(1, idx1, 6, 1).ok);
  advancePly(g, 1); // P2 passes their action (endTurn) → back to P1
  // Forward again: (6,2) anchored on (6,1) (SD (6,2)=2 ≤ SD (6,1)=3) — legal.
  const t2 = firstHandTile(g, 1, { noKeyword: 'SCOUT' });
  assert.equal(g.canPlace(1, t2, 6, 2), true, 'forward march legal');
  const idx2 = g.hands[1].indexOf(t2);
  assert.ok(g.placeFromHand(1, idx2, 6, 2).ok);
  advancePly(g, 1);
  // Lateral off (6,2): (5,2) SD=2 == anchor SD=2 → legal.
  const t3 = firstHandTile(g, 1, { noKeyword: 'SCOUT' });
  assert.equal(g.canPlace(1, t3, 5, 2), true, 'lateral extension legal');
  // Retreat: (5,1) — neighbors with own tiles? (5,1) EVEN? col5 odd →
  // neighbors incl (5,2)? ODD_COL offsets for col 5: (4,1),(4,2),(5,0),(5,2),(6,1),(6,2).
  // Anchors: (6,1) SD=3 ≥ SD(5,1)=3 → legal (lateral-equal, not retreat).
  // True retreat: (7,1) col7 odd: neighbors (6,1),(6,2),(7,0),(7,2),(8,1),(8,2).
  // Anchors: (6,1) SD3 ≥ SD(7,1)=3 → still legal. Retreat needs a cell whose
  // ONLY anchor is strictly closer to the seam: (5,3) col5: neighbors
  // (4,3),(4,4),(5,2),(5,4),(6,3),(6,4) — anchor (5,2) SD2 >= SD(5,3)=1 → legal.
  // Backward cell behind a forward-only anchor: place (6,3) first? Instead
  // assert the rule directly: a cell whose only friendly anchor is STRICTLY
  // nearer the seam is illegal. Craft it: (6,3) anchored on (6,2): SD(6,3)=1
  // ≤ SD(6,2)=2 → forward, legal. Then from (6,3), the cell (7,2): col7 odd,
  // neighbors (6,2),(6,3),(7,1),(7,3),(8,2),(8,3): anchors (6,2) SD2 ≥
  // SD(7,2)=2 → legal. Hard to reach a pure-retreat cell adjacent ONLY to a
  // forward tile early; simulate mid-board: temporarily lift the capital
  // anchor by testing a synthetic pocket instead.
  const g2 = freshGame('seam-retreat');
  // Manually seat a lone P1 tile at (4,4) (mid row, SD 0) with no capital nearby.
  g2.board[4][4].tile = { ...tileTemplate('THICKET'), id: 'x1', owner: 1, capital: false };
  // (4,3): col4 even → neighbors (3,3),(3,4),(4,2),(4,4),(5,3),(5,4).
  // Only anchor is (4,4) SD 0 < SD(4,3)=1 → RETREAT → illegal.
  const t4 = firstHandTile(g2, 1, { noKeyword: 'SCOUT' });
  assert.equal(g2.canPlace(1, t4, 4, 3), false, 'pure retreat off a forward anchor illegal');
  // Same cell WITH FRONTIER_ANCHOR off → legal (knob isolates the mechanic).
  const saved = CONFIG.FRONTIER_ANCHOR;
  CONFIG.FRONTIER_ANCHOR = false;
  assert.equal(g2.canPlace(1, t4, 4, 3), true, 'knob off restores plain adjacency');
  CONFIG.FRONTIER_ANCHOR = saved;
});

test('T5b: SCOUT absolute band — mid-board only, rear/corner garrison dies', () => {
  const g = freshGame();
  const scout = { ...tileTemplate('LANTERN'), id: 's2', owner: 1 };
  assert.ok(scout.keywords.includes('SCOUT'));
  // rear corner (0,0): seamDistance 4 > 2 → illegal regardless of ghost state
  assert.equal(g.canPlace(1, scout, 0, 0), false, 'rear corner garrison illegal');
  // own rear row 1: SD 3 > 2 → illegal
  assert.equal(g.canPlace(1, scout, 3, 1), false, 'rear row garrison illegal');
  // mid-board band row 3 (SD 1), ring ≥ 1 … ring of (4,3) = min(4,8,3,5)=3 → not doomed
  const cell = g.board[4][3];
  if (!cell.rift) {
    assert.equal(g.canPlace(1, scout, 4, 3), true, 'mid-board SCOUT hop legal');
  }
  // enemy heartland row 7 (SD 3) fails band anyway; row 6 (SD 2) in-band but heartland → illegal
  assert.equal(g.canPlace(1, scout, 4, 6), false, 'heartland ban still binds');
});

console.log('seam — state integrity');

test('T6: clone isolation — seam state and consumed flags do not alias', () => {
  const g = freshGame();
  advancePly(g, START - g.turn); // one ring consumed
  const c = g.clone();
  c.seam.ringsConsumed++;
  assert.equal(g.seam.ringsConsumed, 1, 'clone seam mutation must not leak');
  c.board[3][0].consumed = !c.board[3][0].consumed;
  assert.notEqual(g.board[3][0].consumed, c.board[3][0].consumed, 'cell consumed flag independent');
  // clone carries consumed forward
  const c2 = g.clone();
  assert.equal(countConsumed(c2), countConsumed(g), 'clone preserves consumed set');
});

test('T7: same seed → byte-identical seam evolution', () => {
  const run = (seed) => {
    const g = freshGame(seed);
    advancePly(g, START + CADENCE + 2);
    const cells = [];
    for (let c = 0; c < CONFIG.GRID_W; c++)
      for (let r = 0; r < CONFIG.GRID_H; r++)
        if (g.board[c][r].consumed) cells.push(`${c},${r}`);
    return JSON.stringify({ rings: g.seam.ringsConsumed, cells });
  };
  assert.equal(run('det-a'), run('det-a'), 'identical seeds identical seam');
});

test('T8: capital phase completes with ≥8 legal cells per player (decoupling regression, shipped config)', () => {
  const g = new Game({ seed: 'cap-count' });
  let p1 = 0, p2 = 0;
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    for (let r = 0; r < CONFIG.GRID_H; r++) {
      if (g.isLegalCapitalCell(1, c, r)) p1++;
      if (g.isLegalCapitalCell(2, c, r)) p2++;
    }
  }
  assert.ok(p1 >= 8, `P1 legal capital cells ${p1} < 8`);
  assert.ok(p2 >= 8, `P2 legal capital cells ${p2} < 8`);
});

test('T9: capital-adjacent cells are never consumed and never doomed', () => {
  const g = freshGame();
  advancePly(g, START + CADENCE * MAX + 2); // all ticks done
  const capCells = [[6, 0], [6, CONFIG.GRID_H - 1]];
  for (const [cc, cr] of capCells) {
    for (const [c, r] of neighborCoords(cc, cr)) {
      assert.equal(g.board[c][r].consumed, false, `aura cell (${c},${r}) consumed`);
      assert.equal(g._seamDoomed(c, r), false, `aura cell (${c},${r}) doomed`);
    }
  }
});

test('T10: ghost window — empty non-aura ring-0 rejects at turn 1; aura cell accepts', () => {
  const g = freshGame();
  assert.equal(g.turn, 1);
  const plain = { ...tileTemplate('THICKET'), id: 'g1', owner: 1 };
  // (2,0): ring 0, empty, non-aura → doomed from turn 1 → reject
  assert.equal(g._seamDoomed(2, 0), true, 'ring 0 doomed from turn 1');
  assert.equal(g.canPlace(1, plain, 2, 0), false);
  // aura cell beside P1 capital: (5,0) or (7,0) — ring 0, but aura-protected.
  // Adjacent to capital → clause (b) also grants frontier legality.
  assert.equal(g._seamDoomed(5, 0), false, 'aura cell not doomed');
  assert.equal(g.canPlace(1, plain, 5, 0), true, 'aura ring-0 cell placeable at turn 1');
});

console.log(`\n${passed} seam tests passed${process.exitCode ? ' (WITH FAILURES)' : ''}`);
