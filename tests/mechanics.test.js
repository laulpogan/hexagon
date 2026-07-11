// RULES-7 mechanics tests: wave-1 keywords + R1-R7/A1-A14 (bury-capture,
// adjacency-gated captures, high ground, trophy-only ascension, Riftlight,
// THE RIFT STIRS, rubble) + rites.
import assert from 'node:assert/strict';
import { CONFIG } from '../core/config.js';
import { Game } from '../core/game.js';
import { neighborCoords } from '../core/board.js';
import { riftStirsState } from '../core/mechanics.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { console.error(`  ✗ ${name}`); console.error(err); process.exitCode = 1; }
}

function playState(seed) {
  const g = new Game({ seed });
  g.phase = 'play'; g.currentPlayer = 2; g.turn = 1;
  g.placementsLeft = 1; g.discardsLeft = 1;
  return g;
}

function findCell(g, pred) {
  for (let c = 0; c < CONFIG.GRID_W; c++) {
    for (let r = 0; r < CONFIG.GRID_H; r++) {
      if (pred(g.board[c][r])) return g.board[c][r];
    }
  }
  return null;
}

console.log('wave-1 keywords');

test('FLANK loosens capture threshold to 2 for a lone flanking attacker', () => {
  const g = playState('flank');
  g.board[3][0].tile = g._makeTile('THICKET', 1);      // base 2 defender
  const ns = neighborCoords(3, 0).filter(([c, r]) => !g.board[c][r].rift);
  g.board[ns[0][0]][ns[0][1]].tile = g._makeTile('THICKET', 2); // non-FLANK attacker, base 2
  // give the defender support so it sits at rel 1 — above the base threshold
  const support = ns.find(([c, r]) => !g.board[c][r].tile);
  g.board[support[0]][support[1]].tile = g._makeTile('SKIRMISHER', 1); // friendly base 1 → rel = 2+1−2 = 1
  assert.equal(g.relativeInfluence(3, 0), 1);
  assert.equal(g.isCapturable(3, 0, 2), false, 'no FLANK adjacent: 1 > 0 threshold');
  g.board[ns[0][0]][ns[0][1]].tile = g._makeTile('FANGWOLF', 2); // swap in FLANK, base 2
  assert.equal(g.isCapturable(3, 0, 2), true, 'lone FLANK attacker: threshold 2');
  // more support → rel 3 escapes even the FLANK gate
  const extra = ns.find(([c, r]) => !g.board[c][r].tile);
  g.board[extra[0]][extra[1]].tile = g._makeTile('OUTCROP', 1); // friendly base 2 → rel = 3
  assert.equal(g.relativeInfluence(3, 0), 3);
  assert.equal(g.isCapturable(3, 0, 2), false, 'rel 3 > FLANK threshold 2');
});

test('SUSTAIN grows on capture; TRAMPLE splashes the weakest other enemy', () => {
  const g = playState('sustain');
  // defender at 0 next to a big enemy
  g.board[5][0].tile = g._makeTile('SKIRMISHER', 1);
  const ns = neighborCoords(5, 0).filter(([c, r]) => !g.board[c][r].rift);
  g.board[ns[0][0]][ns[0][1]].tile = g._makeTile('COLOSSUS', 2);
  assert.equal(g.isCapturable(5, 0, 2), true);
  const leech = g._makeTile('LEECHSPRITE', 2);
  g.hands[2] = [leech];
  g.placeFromHand(2, 0, 5, 0);
  assert.equal(leech.influence, 1 + CONFIG.SUSTAIN_BONUS, 'sustain fed');

  const g2 = playState('trample');
  g2.board[5][0].tile = g2._makeTile('SKIRMISHER', 1);           // capture target
  const n2 = neighborCoords(5, 0).filter(([c, r]) => !g2.board[c][r].rift);
  g2.board[n2[0][0]][n2[0][1]].tile = g2._makeTile('COLOSSUS', 2); // makes target capturable
  const bystander = g2._makeTile('THICKET', 1);                   // second P1 tile adjacent
  g2.board[n2[1][0]][n2[1][1]].tile = bystander;
  if (g2.isCapturable(5, 0, 2)) {
    g2.hands[2] = [g2._makeTile('JUGGERNAUT', 2)];
    g2.placeFromHand(2, 0, 5, 0);
    assert.equal(bystander.influence, Math.max(0, 1 - CONFIG.TRAMPLE_SPLASH) + 0 || 0, 'trample dented the bystander');
  }
});

console.log('round-2 keywords');

test('WING halves incoming enemy pressure from non-WING tiles', () => {
  const g = playState('wing');
  g.board[5][0].tile = g._makeTile('GALEHARRIER', 1);   // WING, base 2
  const ns = neighborCoords(5, 0).filter(([c, r]) => !g.board[c][r].rift);
  g.board[ns[0][0]][ns[0][1]].tile = g._makeTile('COLOSSUS', 2); // enemy base 4
  // incoming 4 → halved to 2; rel = 2 − 2 = 0
  assert.equal(g.relativeInfluence(5, 0), 2 - Math.floor(4 / 2));
  // same spot without WING would be max(0, 2−4) = 0 either way, so check a
  // weaker attacker where the halving visibly matters:
  g.board[ns[0][0]][ns[0][1]].tile = g._makeTile('THICKET', 2); // enemy base 2 → halved 1
  assert.equal(g.relativeInfluence(5, 0), 2 - 1);
});

test('MENACE blocks capture with fewer than two adjacent attackers', () => {
  const g = playState('menace');
  g.board[5][0].tile = g._makeTile('DREADMAW', 1);      // MENACE, base 2
  const ns = neighborCoords(5, 0).filter(([c, r]) => !g.board[c][r].rift);
  g.board[ns[0][0]][ns[0][1]].tile = g._makeTile('COLOSSUS', 2); // rel = max(0, 2−4) = 0
  assert.equal(g.relativeInfluence(5, 0), 0);
  assert.equal(g.isCapturable(5, 0, 2), false, 'one attacker: menace holds');
  g.board[ns[1][0]][ns[1][1]].tile = g._makeTile('THICKET', 2);  // second attacker
  assert.equal(g.isCapturable(5, 0, 2), true, 'two attackers: menace broken');
});

console.log('R1/A1/A5 — capture caps the stack, no liberation, bounded trophies');

test('self-ascend grants height, NOT influence (R4 trophy-only)', () => {
  const g = playState('ascend');
  g.currentPlayer = 1;
  g.board[4][0].tile = g._makeTile('THICKET', 1);      // base 2
  g.hands[1] = [g._makeTile('OUTCROP', 1)];
  const saved = CONFIG.ASCEND_VARIANT;
  CONFIG.ASCEND_VARIANT = 'A'; // this test is about R4's formula, not the A9 legality gate
  try {
    const res = g.placeFromHand(1, 0, 4, 0);
    assert.equal(res.ascended, true);
    assert.equal(res.height, 2);
    assert.equal(g.board[4][0].tile.type, 'OUTCROP', 'new top face');
    assert.equal(g.cellHeight(4, 0), 2, 'height grew');
    assert.equal(g.relativeInfluence(4, 0), 2, 'self-stacking a same-owner tile grants NO influence bonus');
    // third tier ok, fourth blocked
    g.currentPlayer = 1; g.placementsLeft = 1;
    g.hands[1] = [g._makeTile('ALTAR', 1)];
    assert.equal(g.placeFromHand(1, 0, 4, 0).ascended, true);
    g.currentPlayer = 1; g.placementsLeft = 1;
    g.hands[1] = [g._makeTile('THICKET', 1)];
    assert.equal(g.canPlace(1, g.hands[1][0], 4, 0), false, 'TIER_MAX reached');
  } finally { CONFIG.ASCEND_VARIANT = saved; }
});

test('buried keywords are dormant (only the top face acts)', () => {
  const g = playState('dormant');
  g.currentPlayer = 1;
  g.board[4][1].tile = g._makeTile('ALTAR', 1);        // RALLY on top
  const [nc, nr] = neighborCoords(4, 1).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('THICKET', 1);
  const withRally = g.effectiveBase(nc, nr);
  const saved = CONFIG.ASCEND_VARIANT;
  CONFIG.ASCEND_VARIANT = 'A';
  try {
    g.hands[1] = [g._makeTile('OUTCROP', 1)];            // bury the ALTAR
    g.placeFromHand(1, 0, 4, 1);
    assert.equal(g.effectiveBase(nc, nr), withRally - CONFIG.RALLY_BONUS, 'buried RALLY stops buffing');
  } finally { CONFIG.ASCEND_VARIANT = saved; }
});

test('capitals cannot be stacked on', () => {
  const g = playState('capstack');
  g.currentPlayer = 1;
  const cap = g._makeCapital(1);
  g.board[4][0].tile = cap;
  g.hands[1] = [g._makeTile('THICKET', 1)];
  assert.equal(g.canPlace(1, g.hands[1][0], 4, 0), false);
});

test('capture caps the stack (R1): the old top is buried, never resurfaced, attacker ALWAYS spends the card', () => {
  const g = playState('bury');
  // P1 tower: THICKET crowning a buried SKIRMISHER
  g.board[3][0].tile = g._makeTile('SKIRMISHER', 1);
  g.currentPlayer = 1; g.placementsLeft = 1;
  g.hands[1] = [g._makeTile('THICKET', 1)];
  g.placeFromHand(1, 0, 3, 0);
  assert.equal(g.cellHeight(3, 0), 2);
  // crush it: enemy COLOSSUS adjacent (R2: capture needs adjacency, satisfied here)
  const [nc, nr] = neighborCoords(3, 0).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('COLOSSUS', 2);
  assert.equal(g.isCapturable(3, 0, 2), true);
  g.currentPlayer = 2; g.placementsLeft = 1;
  g.hands[2] = [g._makeTile('OUTCROP', 2)];
  const before = g.hands[2].length;
  const res = g.placeFromHand(2, 0, 3, 0);
  assert.equal(res.captured.type, 'THICKET', 'top face captured');
  assert.equal(g.board[3][0].tile.type, 'OUTCROP', 'attacker crowns the stack');
  assert.equal(g.board[3][0].tile.owner, 2);
  assert.equal(g.cellHeight(3, 0), 3, 'height grew — the stack IS the terrain (no peel, no shrink)');
  assert.equal(g.hands[2].length, before - 1, 'the attacking card is ALWAYS spent — no bounce, no free peel');
  assert.deepEqual(g.board[3][0].stack.map(t => t.type), ['SKIRMISHER', 'THICKET'], 'buried tiles never resurface (A1)');
});

test('recapture stacking: repeated trades keep growing the cell, mixed-owner stack bottom to top', () => {
  const g = playState('recapture');
  g.board[5][0].tile = g._makeTile('THICKET', 1); // P1
  const [nc, nr] = neighborCoords(5, 0).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('COLOSSUS', 2); // P2, makes (5,0) capturable
  g.currentPlayer = 2; g.placementsLeft = 1;
  g.hands[2] = [g._makeTile('OUTCROP', 2)];
  g.placeFromHand(2, 0, 5, 0); // P2 takes it, height 2
  assert.equal(g.cellHeight(5, 0), 2);
  // give P1 an overwhelming neighbor so it can recapture regardless of the
  // trophy bonus and P2's own friendly COLOSSUS support at (5,0)
  const other = neighborCoords(5, 0).find(([c, r]) => !g.board[c][r].rift && !(c === nc && r === nr));
  const p1atk = g._makeTile('COLOSSUS', 1);
  p1atk.influence = 20;
  g.board[other[0]][other[1]].tile = p1atk; // P1
  assert.equal(g.isCapturable(5, 0, 1), true);
  g.currentPlayer = 1; g.placementsLeft = 1;
  g.hands[1] = [g._makeTile('ALTAR', 1)];
  g.placeFromHand(1, 0, 5, 0);
  assert.equal(g.cellHeight(5, 0), 3, 'height keeps growing through trades');
  assert.equal(g.board[5][0].tile.owner, 1);
  assert.deepEqual(g.board[5][0].stack.map(t => t.owner), [1, 2], 'mixed-owner stack, bottom to top');
});

test('trophy value stays bounded under 6 alternating captures on one cell (A5)', () => {
  const g = playState('trophy-cap');
  g.board[6][0].tile = g._makeTile('THICKET', 1);
  const [nc, nr] = neighborCoords(6, 0).find(([c, r]) => !g.board[c][r].rift);
  let attacker = 2;
  for (let i = 0; i < 6; i++) {
    const atk = g._makeTile('COLOSSUS', attacker);
    atk.influence = 12; // overwhelming, independent of the growing height/trophy defense
    g.board[nc][nr].tile = atk;
    assert.equal(g.isCapturable(6, 0, attacker), true, `capture ${i} should be legal`);
    g.currentPlayer = attacker; g.placementsLeft = 1;
    g.hands[attacker] = [g._makeTile('OUTCROP', attacker)];
    assert.equal(g.placeFromHand(attacker, 0, 6, 0).ok, true, `capture ${i} should succeed`);
    attacker = attacker === 1 ? 2 : 1;
  }
  assert.ok(g.trophyValue(6, 0) <= CONFIG.TROPHY_CAP, 'trophy value never exceeds the cap');
  assert.ok(g.cellAt(6, 0).stack.length <= CONFIG.HEIGHT_CRUSH_CAP - 1, 'crush-out kept the live stack at the height ceiling');
});

test('crush-out (A5): height holds at HEIGHT_CRUSH_CAP; overflow leaves the array and adds rubble', () => {
  const g = playState('crush');
  const cell = g.board[7][0];
  cell.tile = g._makeTile('THICKET', 1);
  for (let i = 0; i < CONFIG.HEIGHT_CRUSH_CAP - 1; i++) cell.stack.push(g._makeTile('OUTCROP', i % 2 === 0 ? 2 : 1));
  assert.equal(g.cellHeight(7, 0), CONFIG.HEIGHT_CRUSH_CAP, 'set up already at the ceiling');
  const [nc, nr] = neighborCoords(7, 0).find(([c, r]) => !g.board[c][r].rift);
  const atk = g._makeTile('COLOSSUS', 2);
  atk.influence = 20; // overwhelm the trophy bonus + height defense the tall stack has built up
  g.board[nc][nr].tile = atk;
  assert.equal(g.isCapturable(7, 0, 2), true);
  const rubbleBefore = cell.rubble;
  g.currentPlayer = 2; g.placementsLeft = 1; g.hands[2] = [g._makeTile('OUTCROP', 2)];
  g.placeFromHand(2, 0, 7, 0);
  assert.equal(g.cellHeight(7, 0), CONFIG.HEIGHT_CRUSH_CAP, 'height held at the ceiling, did not grow past it');
  assert.equal(cell.rubble, rubbleBefore + 2, 'both the capture scar and the crush-out add rubble');
});

test('capture and SUNDER both add rubble (R7 — render-only, no gameplay drain)', () => {
  const g = playState('rubble-sources');
  const cell = g.board[5][0];
  cell.tile = g._makeTile('THICKET', 1);
  const ns = neighborCoords(5, 0).filter(([c, r]) => !g.board[c][r].rift);
  g.board[ns[0][0]][ns[0][1]].tile = g._makeTile('COLOSSUS', 2);
  assert.equal(g.isCapturable(5, 0, 2), true);
  g.hands[2] = [g._makeTile('OUTCROP', 2)];
  g.placeFromHand(2, 0, 5, 0);
  assert.equal(cell.rubble, 1, 'capture scars');
  assert.equal(cell.stack[cell.stack.length - 1].type, 'THICKET', 'the old top is buried, not removed');
  const relWithRubble = g.relativeInfluence(5, 0);
  const savedRubble = cell.rubble;
  cell.rubble = 0;
  assert.equal(g.relativeInfluence(5, 0), relWithRubble, 'rubble never touches the influence math (R7)');
  cell.rubble = savedRubble;

  const g2 = playState('rubble-sunder');
  g2.board[2][0].tile = g2._makeTile('LANTERN', 1);
  const [nc2, nr2] = neighborCoords(2, 0).find(([c, r]) => !g2.board[c][r].rift);
  g2.board[nc2][nr2].tile = g2._makeTile('THICKET', 2); // A2: SUNDER needs adjacency now
  g2.hands[2] = [g2._makeTile('SUNDER', 2)];
  g2.castRite(2, 0, 2, 0);
  assert.equal(g2.board[2][0].rubble, 1, 'sunder scars too');
});

console.log('R2/A2 — adjacency-gated captures');

test('R2: captures require the attacker to already hold a tile adjacent to the target', () => {
  const g = playState('r2-adjacency');
  const rift = findCell(g, (c) => c.rift);
  const [nc, nr] = neighborCoords(rift.col, rift.row).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('LANTERN', 1); // base 1, rift-adjacent → rel 0, capturable with ZERO enemy neighbors
  assert.equal(g.relativeInfluence(nc, nr), 0);
  assert.equal(g.isCapturable(nc, nr, 2), true, 'weak by rift proximity alone — no enemy neighbor needed for that');
  const farAwayP2 = g._makeTile('COLOSSUS', 2);
  assert.equal(g.canPlace(2, farAwayP2, nc, nr), false, 'P2 has no tile anywhere adjacent — illegal under R2 even though it is capturable by the numbers');
});

test('R2: once the attacker has an adjacent tile, the same capturable target becomes legal', () => {
  const g = playState('r2-adjacency-ok');
  const rift = findCell(g, (c) => c.rift);
  const [nc, nr] = neighborCoords(rift.col, rift.row).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('LANTERN', 1);
  const second = neighborCoords(nc, nr).find(([c, r]) => !g.board[c][r].rift && !(c === rift.col && r === rift.row));
  g.board[second[0]][second[1]].tile = g._makeTile('COLOSSUS', 2); // now P2 IS adjacent
  assert.equal(g.canPlace(2, g._makeTile('OUTCROP', 2), nc, nr), true);
});

console.log('R3/A4 — high ground');

test('R3 x WING: height bonus is folded in BEFORE WING halves incoming pressure (A4 order)', () => {
  const g = playState('r3-wing');
  const defender = g._makeTile('GALEHARRIER', 1); // WING
  defender.influence = 6;
  g.board[5][0].tile = defender;
  const [nc, nr] = neighborCoords(5, 0).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('COLOSSUS', 2); // attacker top face inf 4, height 1
  g.currentPlayer = 2; g.placementsLeft = 1; g.hands[2] = [g._makeTile('COLOSSUS', 2)];
  g.placeFromHand(2, 0, nc, nr); // self-ascend (enemy-adjacent — safe under any A9 variant), height 2
  g.currentPlayer = 2; g.placementsLeft = 1; g.hands[2] = [g._makeTile('COLOSSUS', 2)];
  g.placeFromHand(2, 0, nc, nr); // height 3
  assert.equal(g.cellHeight(nc, nr), 3);
  assert.equal(g.effectiveBase(nc, nr), 4, 'top face is COLOSSUS; self-stacking grants no influence (R4)');
  // correct order: floor((4 + HIGH_CAP) / 2); the wrong order would give floor(4/2) + HIGH_CAP instead
  const correct = Math.floor((4 + CONFIG.HIGH_CAP) / 2);
  assert.equal(g.relativeInfluence(5, 0), 6 - correct);
});

test('R3 x MENACE: height/influence advantage never substitutes for the 2-attacker gate', () => {
  const g = playState('r3-menace');
  g.board[5][0].tile = g._makeTile('DREADMAW', 1); // MENACE, base 2
  const [nc, nr] = neighborCoords(5, 0).find(([c, r]) => !g.board[c][r].rift);
  const tall = g._makeTile('COLOSSUS', 2);
  tall.influence = 20; // overwhelming, still just ONE attacker
  g.board[nc][nr].tile = tall;
  assert.equal(g.relativeInfluence(5, 0), 0, 'crushed to 0 by raw influence');
  assert.equal(g.isCapturable(5, 0, 2), false, 'MENACE holds: one attacker is one attacker, no matter how tall');
});

test('R3 x FLANK: the loosened threshold is compared against height-inclusive relative influence', () => {
  const g = playState('r3-flank');
  g.board[3][0].tile = g._makeTile('THICKET', 1); // base 2 defender, height 1
  const ns = neighborCoords(3, 0).filter(([c, r]) => !g.board[c][r].rift);
  g.board[ns[0][0]][ns[0][1]].tile = g._makeTile('FANGWOLF', 2); // FLANK attacker, base 2, height 1 (dH=0)
  const support = ns.find(([c, r]) => !g.board[c][r].tile);
  g.board[support[0]][support[1]].tile = g._makeTile('SKIRMISHER', 1); // friendly +1 → rel = 2+1−2 = 1
  assert.equal(g.relativeInfluence(3, 0), 1);
  assert.equal(g.isCapturable(3, 0, 2), true, 'FLANK threshold 2 covers rel 1');
  g.currentPlayer = 2; g.placementsLeft = 1; g.hands[2] = [g._makeTile('FANGWOLF', 2)];
  g.placeFromHand(2, 0, ns[0][0], ns[0][1]); // self-ascend (enemy-adjacent), height 2, dH=1
  assert.equal(g.relativeInfluence(3, 0), 0, 'height bonus pressed it down further');
  assert.equal(g.isCapturable(3, 0, 2), true, 'still inside the FLANK gate — height was folded in before the threshold check');
});

console.log('A8 — corner hill-king block');

test('capitals are forbidden on cells with fewer than 3 neighbors', () => {
  const g = new Game({ seed: 'corner' });
  assert.equal(neighborCoords(0, 0).length, 2, 'sanity: (0,0) is a true corner');
  assert.equal(g.isLegalCapitalCell(1, 0, 0), false, 'corner cell rejected regardless of side/distance');
  assert.equal(g.isLegalCapitalCell(1, 0, 1), true, 'a normal edge cell with 3+ neighbors is fine');
});

console.log('A9 — ascension variants');

test('variant B: self-ascend illegal without an enemy-adjacent tower', () => {
  const g = playState('variant-b');
  g.currentPlayer = 1;
  g.board[4][0].tile = g._makeTile('THICKET', 1); // no enemy nearby
  const saved = CONFIG.ASCEND_VARIANT;
  CONFIG.ASCEND_VARIANT = 'B';
  try {
    assert.equal(g.canPlace(1, g._makeTile('OUTCROP', 1), 4, 0), false, 'no enemy adjacent — blocked');
    const [nc, nr] = neighborCoords(4, 0).find(([c, r]) => !g.board[c][r].rift);
    g.board[nc][nr].tile = g._makeTile('THICKET', 2); // now enemy-adjacent
    assert.equal(g.canPlace(1, g._makeTile('OUTCROP', 1), 4, 0), true, 'enemy adjacent — legal');
  } finally { CONFIG.ASCEND_VARIANT = saved; }
});

test('variant C: self-ascend forces a discard alongside the placement', () => {
  const g = playState('variant-c');
  g.currentPlayer = 1;
  g.board[4][0].tile = g._makeTile('THICKET', 1);
  const saved = CONFIG.ASCEND_VARIANT;
  CONFIG.ASCEND_VARIANT = 'C';
  try {
    g.hands[1] = [g._makeTile('OUTCROP', 1), g._makeTile('LANTERN', 1)];
    const before = g.hands[1].length;
    const res = g.placeFromHand(1, 0, 4, 0);
    assert.equal(res.ascended, true);
    assert.equal(g.hands[1].length, before - 2, 'the placed card AND a discard both left the hand');
    assert.equal(g.stats[1].discarded, 1, 'the discard was recorded as a real cost');
  } finally { CONFIG.ASCEND_VARIANT = saved; }
});

console.log('R5/A6 — Riftlight');

test('Riftlight never leaks into relativeInfluence/capturability — boardSummary-only (A6)', () => {
  const g = new Game({ seed: 'riftlight-isolated' });
  const rift = findCell(g, (c) => c.rift);
  const [nc, nr] = neighborCoords(rift.col, rift.row).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('THICKET', 1); // rift-adjacent P1 tile, base 2
  const before = g.relativeInfluence(nc, nr);
  const s = g.boardSummary();
  assert.ok(s[1].riftlight > 0, 'riftlight accrued in the summary');
  assert.equal(g.relativeInfluence(nc, nr), before, 'boardSummary() must not mutate relativeInfluence — no accidental defense buff');
  const second = neighborCoords(nc, nr).find(([c, r]) => !g.board[c][r].rift && !(c === rift.col && r === rift.row));
  g.board[second[0]][second[1]].tile = g._makeTile('COLOSSUS', 2); // enemy crushes it to 0 regardless of riftlight
  assert.equal(g.relativeInfluence(nc, nr), 0);
  assert.equal(g.isCapturable(nc, nr, 2), true, 'riftlight cannot rescue a capturable tile');
});

console.log('R6/A7 — THE RIFT STIRS');

test('THE RIFT STIRS fires every RIFT_STIRS_INTERVAL plies, telegraphed 2 plies ahead', () => {
  const interval = CONFIG.RIFT_STIRS_INTERVAL;
  for (let t = 1; t <= interval * 2 + 2; t++) {
    const s = riftStirsState(t);
    if (t === interval - 2) assert.equal(s.upcoming, true, `turn ${t} should telegraph the turn-${interval} firing`);
    if (t === interval || t === interval + 1) assert.equal(s.active, true, `turn ${t} should be inside the 2-ply active window`);
    if (t === interval + 2) assert.equal(s.active, false, 'window closes after 2 plies');
  }
});

test('the pulse hits rift-adjacent tiles only while active; ATTUNED inverts it', () => {
  const g = new Game({ seed: 'stirs-pulse' });
  const rift = findCell(g, (c) => c.rift);
  const [nc, nr] = neighborCoords(rift.col, rift.row).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('THICKET', 1); // base 2, rift-adjacent
  g.riftStirs = { active: false };
  const quiet = g.relativeInfluence(nc, nr);
  g.riftStirs = { active: true, pulseStrength: 1 };
  assert.equal(g.relativeInfluence(nc, nr), Math.max(0, quiet - 1), 'active pulse drains 1 more (clamped at 0)');
  g.board[nc][nr].tile = g._makeTile('RIFTWALKER', 1); // ATTUNED
  g.riftStirs = { active: false };
  const attunedQuiet = g.relativeInfluence(nc, nr);
  g.riftStirs = { active: true, pulseStrength: 1 };
  assert.equal(g.relativeInfluence(nc, nr), attunedQuiet + 1, 'ATTUNED feeds on the pulse instead');
});

console.log('rites');

test('SUNDER (A2): may only target a tile adjacent to one of the caster\'s own tiles', () => {
  const g = playState('sunder-adjacency');
  g.board[2][0].tile = g._makeTile('LANTERN', 1); // P1, isolated, weak → rel 1
  g.hands[2] = [g._makeTile('SUNDER', 2)];
  let targets = g.legalRiteTargets(2, 0);
  assert.ok(!targets.some(t => t.col === 2 && t.row === 0), 'no P2 tile adjacent yet — illegal target');
  const [nc, nr] = neighborCoords(2, 0).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('THICKET', 2); // now P2 has an adjacent tile
  targets = g.legalRiteTargets(2, 0);
  assert.ok(targets.some(t => t.col === 2 && t.row === 0), 'now adjacent — legal target');
  const res = g.castRite(2, 0, 2, 0);
  assert.equal(res.ok, true);
  assert.equal(g.board[2][0].tile, null, 'the whole cell is unmade (A1: no resurface path)');
});

test('UNTOUCHABLE blocks enemy rite targeting', () => {
  const g = playState('veil');
  g.board[2][0].tile = g._makeTile('VEILWISP', 1);  // enemy VEILWISP, rel ≤ 2 when alone
  const [nc, nr] = neighborCoords(2, 0).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('THICKET', 2); // A2 adjacency, so the ONLY reason it's untargetable is UNTOUCHABLE
  g.hands[2] = [g._makeTile('SUNDER', 2)];
  const targets = g.legalRiteTargets(2, 0);
  assert.ok(!targets.some(t => t.col === 2 && t.row === 0), 'veilwisp untargetable');
});

test('RALLYING_CRY permanently buffs neighbors; FORESIGHT cycles', () => {
  const g = playState('cry');
  g.currentPlayer = 1;
  g.board[4][1].tile = g._makeTile('THICKET', 1);
  const [nc, nr] = neighborCoords(4, 1).find(([c, r]) => !g.board[c][r].rift);
  const buddy = g._makeTile('ALTAR', 1);
  g.board[nc][nr].tile = buddy;
  g.hands[1] = [g._makeTile('RALLYING_CRY', 1)];
  const res = g.castRite(1, 0, 4, 1);
  assert.equal(res.ok, true);
  assert.equal(buddy.influence, 2, 'neighbor permanently +1');

  const g2 = playState('foresight');
  g2.hands[2] = [g2._makeTile('FORESIGHT', 2), g2._makeTile('LANTERN', 2), g2._makeTile('COLOSSUS', 2)];
  const before = g2.decks[2].length;
  const res2 = g2.castRite(2, 0);
  assert.equal(res2.ok, true);
  assert.equal(g2.decks[2].length, before - 2, 'drew 2');
  assert.ok(g2.hands[2].some(t => t.type === 'COLOSSUS'), 'kept the strong tile');
});

test('rites are excluded from placement moves and cannot be placed', () => {
  const g = playState('kinds');
  g.currentPlayer = 1;
  g.board[4][0].tile = g._makeTile('THICKET', 1);
  g.hands[1] = [g._makeTile('SUNDER', 1)];
  assert.equal(g.legalMoves(1).length, 0, 'rite yields no placements');
  const [nc, nr] = neighborCoords(4, 0)[0];
  assert.equal(g.placeFromHand(1, 0, nc, nr).ok, false);
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (WITH FAILURES)' : ''}`);
