// Headless rules-engine tests. Run: npm test (plain node, no framework).
import assert from 'node:assert/strict';
import { CONFIG } from '../core/config.js';
import { Game, validateDeck } from '../core/game.js';
import { neighborCoords, midRow } from '../core/board.js';
import { defaultDeckComposition } from '../data/tiles.js';

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

// Helper: fresh game with both capitals placed, ready for normal play.
function startedGame(seed = 'test-seed') {
  const g = new Game({ seed });
  const mid = midRow();
  const p1Cell = findCell(g, (c) => g.isLegalCapitalCell(1, c.col, c.row));
  assert.equal(g.placeCapital(1, p1Cell.col, p1Cell.row).ok, true);
  const p2Cell = findCell(g, (c) => g.isLegalCapitalCell(2, c.col, c.row));
  assert.equal(g.placeCapital(2, p2Cell.col, p2Cell.row).ok, true);
  assert.equal(g.phase, 'play');
  return { g, p1Cell, p2Cell, mid };
}

function findCell(g, pred) {
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    for (let r = 0; r < CONFIG.GRID_H; r++) {
      if (pred(g.board[c][r])) return g.board[c][r];
    }
  }
  return null;
}

console.log('board generation');

test('one rift hex per column, near the mid row', () => {
  const g = new Game({ seed: 'abc' });
  const mid = midRow();
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    const riftRows = [];
    for (let r = 0; r < CONFIG.GRID_H; r++) if (g.board[c][r].rift) riftRows.push(r);
    assert.equal(riftRows.length, 1, `column ${c} should have exactly 1 rift hex`);
    assert.ok(Math.abs(riftRows[0] - mid) <= 1, `rift in column ${c} within 1 of mid`);
  }
});

test('same seed → identical board and deck order (MP determinism)', () => {
  const a = new Game({ seed: 'room-XYZ' });
  const b = new Game({ seed: 'room-XYZ' });
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    for (let r = 0; r < CONFIG.GRID_H; r++) {
      assert.equal(a.board[c][r].rift, b.board[c][r].rift);
    }
  }
  assert.deepEqual(a.decks[1].map(t => t.type), b.decks[1].map(t => t.type));
});

test('default deck is exactly DECK_SIZE and passes validation', () => {
  const g = new Game({ seed: 'x' });
  assert.equal(g.decks[1].length, CONFIG.DECK_SIZE);
  assert.equal(g.decks[2].length, CONFIG.DECK_SIZE);
  const check = validateDeck(defaultDeckComposition());
  assert.deepEqual(check.errors, []);
  assert.equal(check.valid, true);
});

console.log('capital phase');

test('capital must be on own side, off the rift, away from the seam', () => {
  const g = new Game({ seed: 'caps' });
  const mid = midRow();
  assert.equal(g.isLegalCapitalCell(1, 0, mid + 2), false, 'P1 cannot place on P2 side');
  assert.equal(g.isLegalCapitalCell(2, 0, mid - 2), false, 'P2 cannot place on P1 side');
  assert.equal(g.isLegalCapitalCell(1, 0, mid - 1), false, 'too close to seam');
  const riftCell = findCell(g, (c) => c.rift);
  assert.equal(g.isLegalCapitalCell(1, riftCell.col, riftCell.row), false, 'never on a rift hex');
  assert.equal(g.isLegalCapitalCell(1, 0, 0), true);
});

test('capital placement alternates players then starts play with hands dealt', () => {
  const { g } = startedGame();
  assert.equal(g.currentPlayer, 1);
  assert.equal(g.turn, 1);
  // P1 dealt HAND_SIZE then drew 1 for their first turn.
  assert.equal(g.hands[1].length, CONFIG.HAND_SIZE + 1);
  assert.equal(g.hands[2].length, CONFIG.HAND_SIZE);
});

console.log('influence math');

test('lone tile far from rift = base influence', () => {
  const { g } = startedGame();
  const cell = findCell(g, (c) => !c.tile && !c.rift && c.row === 0 && c.col === 5);
  cell.tile = g._makeTile('THICKET', 1); // base 2
  const riftAdj = neighborCoords(cell.col, cell.row).some(([c, r]) => g.board[c][r].rift);
  assert.equal(riftAdj, false);
  assert.equal(g.relativeInfluence(cell.col, cell.row), 2);
});

test('friendly neighbors add, enemy neighbors subtract, clamped at 0', () => {
  const g = new Game({ seed: 'inf' });
  // Build an isolated cluster at top-left, far from the rift.
  g.board[2][0].tile = g._makeTile('THICKET', 1);       // base 2
  const neigh = neighborCoords(2, 0).map(([c, r]) => g.board[c][r]).filter(c => !c.rift);
  neigh[0].tile = g._makeTile('THICKET', 1);            // friendly +2
  neigh[1].tile = g._makeTile('COLOSSUS', 2);           // enemy −4
  // 2 + 2 − 4 = 0 → capturable by player 2
  assert.equal(g.relativeInfluence(2, 0), 0);
  assert.equal(g.isCapturable(2, 0, 2), true);
  assert.equal(g.isCapturable(2, 0, 1), false, 'owner cannot capture own tile');
});

test('RALLY boosts adjacent friendly effective base', () => {
  const g = new Game({ seed: 'rally' });
  g.board[4][1].tile = g._makeTile('THICKET', 1);       // base 2
  const [nc, nr] = neighborCoords(4, 1).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('ALTAR', 1);       // RALLY, base 1
  // THICKET: eff base 2+1(rally)=3, + neighbor ALTAR contribution 1 → 4
  assert.equal(g.effectiveBase(4, 1), 2 + CONFIG.RALLY_BONUS);
  assert.equal(g.relativeInfluence(4, 1), 3 + 1);
});

test('FORTIFIED gets edge bonus only on the edge', () => {
  const g = new Game({ seed: 'fort' });
  g.board[0][0].tile = g._makeTile('PALISADE', 1);      // base 1, FORTIFIED, on edge
  g.board[5][3].tile = g._makeTile('PALISADE', 1);      // interior
  assert.equal(g.effectiveBase(0, 0), 1 + CONFIG.FORTIFIED_BONUS);
  assert.equal(g.effectiveBase(5, 3), 1);
});

test('SIEGE penalizes adjacent ENEMIES (not itself — original bug fixed)', () => {
  const g = new Game({ seed: 'siege' });
  g.board[6][0].tile = g._makeTile('COLOSSUS', 1);      // base 4, no keywords
  const [nc, nr] = neighborCoords(6, 0).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('SKIRMISHER', 2);  // enemy SIEGE, base 1
  // COLOSSUS: 4 − (1 + SIEGE_BONUS 2) = 1
  assert.equal(g.relativeInfluence(6, 0), 4 - 1 - CONFIG.SIEGE_BONUS);
  // The SIEGE tile itself takes no extra self-penalty: 1 − 4 → clamped 0
  assert.equal(g.relativeInfluence(nc, nr), 0);
});

test('DOUBLESTRIKE contributes twice to neighbors', () => {
  const g = new Game({ seed: 'ds' });
  g.board[8][0].tile = g._makeTile('THICKET', 1);       // base 2
  const [nc, nr] = neighborCoords(8, 0).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('ECHO', 1);        // friendly DOUBLESTRIKE base 2
  assert.equal(g.relativeInfluence(8, 0), 2 + 2 * 2);
});

test('rift aura: −1 per adjacent rift hex, +1 if ATTUNED', () => {
  const g = new Game({ seed: 'rift-aura' });
  const rift = findCell(g, (c) => c.rift && c.col === 6);
  const [nc, nr] = neighborCoords(rift.col, rift.row).find(([c, r]) => !g.board[c][r].rift);
  const n = g.board[nc][nr];
  const riftCount = neighborCoords(nc, nr).filter(([c, r]) => g.board[c][r].rift).length;
  n.tile = g._makeTile('THICKET', 1);                   // base 2
  assert.equal(g.relativeInfluence(nc, nr), Math.max(0, 2 - riftCount));
  n.tile = g._makeTile('RIFTWALKER', 1);                // ATTUNED base 2
  assert.equal(g.relativeInfluence(nc, nr), 2 + riftCount);
});

console.log('placement + capture');

test('normal placement requires friendly adjacency; SCOUT does not', () => {
  const { g, p1Cell } = startedGame();
  const plain = g._makeTile('THICKET', 1);
  const scout = g._makeTile('LANTERN', 1);
  const farCell = findCell(g, (c) => !c.tile && !c.rift &&
    neighborCoords(c.col, c.row).every(([cc, rr]) => !g.board[cc][rr].tile));
  assert.equal(g.canPlace(1, plain, farCell.col, farCell.row), false);
  assert.equal(g.canPlace(1, scout, farCell.col, farCell.row), true);
  const adj = neighborCoords(p1Cell.col, p1Cell.row)
    .map(([c, r]) => g.board[c][r]).find(c => !c.tile && !c.rift);
  assert.equal(g.canPlace(1, plain, adj.col, adj.row), true);
});

test('placing ends the turn; next player draws', () => {
  const { g, p1Cell } = startedGame();
  const adj = neighborCoords(p1Cell.col, p1Cell.row)
    .map(([c, r]) => g.board[c][r]).find(c => !c.tile && !c.rift);
  const h2Before = g.hands[2].length;
  const res = g.placeFromHand(1, 0, adj.col, adj.row);
  assert.equal(res.ok, true);
  assert.equal(g.currentPlayer, 2);
  assert.equal(g.turn, 2);
  assert.equal(g.hands[2].length, h2Before + 1, 'P2 drew their turn card');
  assert.equal(g.placementsLeft, CONFIG.PLACEMENTS_PER_TURN);
});

test('capture: placing onto a 0-influence enemy tile takes it', () => {
  const g = new Game({ seed: 'cap' });
  // Hand-build a play state: P1 tile crushed by adjacent enemy.
  g.phase = 'play'; g.currentPlayer = 2; g.turn = 1;
  g.placementsLeft = 1; g.discardsLeft = 1;
  g.board[3][0].tile = g._makeTile('SKIRMISHER', 1);    // P1, base 1
  const [nc, nr] = neighborCoords(3, 0).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('COLOSSUS', 2);    // P2 base 4 → P1 tile at 0
  assert.equal(g.isCapturable(3, 0, 2), true);
  g.hands[2] = [g._makeTile('THICKET', 2)];
  const res = g.placeFromHand(2, 0, 3, 0);
  assert.equal(res.ok, true);
  assert.equal(res.captured.type, 'SKIRMISHER');
  assert.equal(g.board[3][0].tile.owner, 2);
  assert.equal(g.stats[2].captured, 1);
});

test('WARD absorbs the first capture attempt; attacker tile is spent', () => {
  const g = new Game({ seed: 'ward' });
  g.phase = 'play'; g.currentPlayer = 2; g.turn = 1;
  g.placementsLeft = 1; g.discardsLeft = 1;
  g.board[3][0].tile = g._makeTile('WARDSTONE', 1);     // P1 WARD, base 1
  const [nc, nr] = neighborCoords(3, 0).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('COLOSSUS', 2);
  g.hands[2] = [g._makeTile('THICKET', 2)];
  const res = g.placeFromHand(2, 0, 3, 0);
  assert.equal(res.wardBlocked, true);
  assert.equal(g.board[3][0].tile.type, 'WARDSTONE', 'defender survives');
  assert.equal(g.board[3][0].tile.wardConsumed, true);
  assert.equal(g.hands[2].length, 0, 'attacker tile spent');
  assert.equal(g.currentPlayer, 1, 'turn still ends');
});

test('capturing the enemy capital wins the game', () => {
  const g = new Game({ seed: 'win' });
  g.phase = 'play'; g.currentPlayer = 2; g.turn = 1;
  g.placementsLeft = 1; g.discardsLeft = 1;
  const cap = g._makeCapital(1);
  g.board[3][0].tile = cap;
  const [nc, nr] = neighborCoords(3, 0).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('COLOSSUS', 2);    // capital 2 − 4 → 0
  assert.equal(g.isCapturable(3, 0, 2), true);
  g.hands[2] = [g._makeTile('THICKET', 2)];
  const res = g.placeFromHand(2, 0, 3, 0);
  assert.equal(res.won, true);
  assert.equal(g.winner, 2);
  assert.equal(g.phase, 'over');
  assert.equal(g.placeFromHand(1, 0, 0, 0).ok, false, 'no moves after game over');
});

console.log('turn utilities');

test('discard-and-redraw once per turn', () => {
  const { g } = startedGame();
  const handBefore = g.hands[1].length;
  const first = g.discardRedraw(1, 0);
  assert.equal(first.ok, true);
  assert.equal(g.hands[1].length, handBefore, 'discard then draw keeps hand size');
  assert.equal(g.discardRedraw(1, 0).ok, false, 'second discard refused');
});

test('pass hands the turn over', () => {
  const { g } = startedGame();
  g.pass(1);
  assert.equal(g.currentPlayer, 2);
  assert.equal(g.turn, 2);
});

test('legalMoves returns placements for the active player only', () => {
  const { g } = startedGame();
  assert.ok(g.legalMoves(1).length > 0);
  assert.equal(g.legalMoves(2).length, 0);
});

console.log('deck validation');

test('tier caps enforced', () => {
  const tooManyRares = { THICKET: 3, OUTCROP: 3, LANTERN: 2, PALISADE: 2, ALTAR: 2, SKIRMISHER: 2,
    WARDSTONE: 1, ECHO: 1, HERALD: 1, RIFTWALKER: 1, COLOSSUS: 1, MIRRORSAINT: 1 };
  const res = validateDeck(tooManyRares);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('rare')));
  const wrongSize = { THICKET: 3 };
  assert.equal(validateDeck(wrongSize).valid, false);
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (WITH FAILURES)' : ''}`);
