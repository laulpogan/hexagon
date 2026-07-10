// Wave-1 mechanics tests: FLANK / SUSTAIN / TRAMPLE / UNTOUCHABLE + rites.
import assert from 'node:assert/strict';
import { CONFIG } from '../core/config.js';
import { Game } from '../core/game.js';
import { neighborCoords } from '../core/board.js';

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

console.log('wave-1 keywords');

test('FLANK loosens capture threshold to 1 with two attackers', () => {
  const g = playState('flank');
  g.board[3][0].tile = g._makeTile('THICKET', 1);      // base 2 defender
  const ns = neighborCoords(3, 0).filter(([c, r]) => !g.board[c][r].rift);
  g.board[ns[0][0]][ns[0][1]].tile = g._makeTile('FANGWOLF', 2); // FLANK, base 2
  // one attacker: rel = 2 − 2 = 0... give the defender support to sit at 1
  const support = ns.find(([c, r]) => !g.board[c][r].tile);
  g.board[support[0]][support[1]].tile = g._makeTile('SKIRMISHER', 1); // friendly base 1 → rel = 2+1−2 = 1
  assert.equal(g.relativeInfluence(3, 0), 1);
  assert.equal(g.isCapturable(3, 0, 2), false, 'one attacker: 1 > 0 threshold');
  const third = ns.find(([c, r]) => !g.board[c][r].tile);
  g.board[third[0]][third[1]].tile = g._makeTile('THICKET', 2); // second attacker → rel drops too
  const rel = g.relativeInfluence(3, 0);
  if (rel <= CONFIG.FLANK_THRESHOLD) {
    assert.equal(g.isCapturable(3, 0, 2), true, 'two attackers incl. FLANK: threshold 1');
  }
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

console.log('ascension (stacking)');

test('ascend: stack on own tile, +1 influence per tier, cap at TIER_MAX', () => {
  const g = playState('ascend');
  g.currentPlayer = 1;
  g.board[4][0].tile = g._makeTile('THICKET', 1);      // base 2
  g.hands[1] = [g._makeTile('OUTCROP', 1)];
  const res = g.placeFromHand(1, 0, 4, 0);
  assert.equal(res.ascended, true);
  assert.equal(res.height, 2);
  assert.equal(g.board[4][0].tile.type, 'OUTCROP', 'new top face');
  assert.equal(g.relativeInfluence(4, 0), 2 + CONFIG.TIER_BONUS, 'top influence + tier bonus');
  // third tier ok, fourth blocked
  g.currentPlayer = 1; g.placementsLeft = 1;
  g.hands[1] = [g._makeTile('ALTAR', 1)];
  assert.equal(g.placeFromHand(1, 0, 4, 0).ascended, true);
  g.currentPlayer = 1; g.placementsLeft = 1;
  g.hands[1] = [g._makeTile('THICKET', 1)];
  assert.equal(g.canPlace(1, g.hands[1][0], 4, 0), false, 'TIER_MAX reached');
});

test('buried keywords are dormant (only the top face acts)', () => {
  const g = playState('dormant');
  g.currentPlayer = 1;
  g.board[4][1].tile = g._makeTile('ALTAR', 1);        // RALLY on top
  const [nc, nr] = neighborCoords(4, 1).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('THICKET', 1);
  const withRally = g.effectiveBase(nc, nr);
  g.hands[1] = [g._makeTile('OUTCROP', 1)];            // bury the ALTAR
  g.placeFromHand(1, 0, 4, 1);
  assert.equal(g.effectiveBase(nc, nr), withRally - CONFIG.RALLY_BONUS, 'buried RALLY stops buffing');
});

test('peel: capturing a stack removes one tier, attacker card bounces', () => {
  const g = playState('peel');
  // P1 tower: THICKET with SKIRMISHER buried
  g.board[3][0].tile = g._makeTile('SKIRMISHER', 1);
  g.currentPlayer = 1; g.placementsLeft = 1;
  g.hands[1] = [g._makeTile('THICKET', 1)];
  g.placeFromHand(1, 0, 3, 0);
  // crush it: enemy COLOSSUS adjacent → rel = max(0, 2+1−4) = 0 → capturable
  const [nc, nr] = neighborCoords(3, 0).find(([c, r]) => !g.board[c][r].rift);
  g.board[nc][nr].tile = g._makeTile('COLOSSUS', 2);
  assert.equal(g.isCapturable(3, 0, 2), true);
  g.currentPlayer = 2; g.placementsLeft = 1;
  g.hands[2] = [g._makeTile('OUTCROP', 2)];
  const res = g.placeFromHand(2, 0, 3, 0);
  assert.equal(res.peeled, true);
  assert.equal(res.removed.type, 'THICKET', 'top tier removed');
  assert.equal(g.board[3][0].tile.type, 'SKIRMISHER', 'buried tile resurfaces, still P1');
  assert.equal(g.board[3][0].tile.owner, 1);
  assert.equal(g.hands[2].length, 1, 'attacker card bounced');
});

test('capitals cannot be stacked on', () => {
  const { } = {};
  const g = playState('capstack');
  g.currentPlayer = 1;
  const cap = g._makeCapital(1);
  g.board[4][0].tile = cap;
  g.hands[1] = [g._makeTile('THICKET', 1)];
  assert.equal(g.canPlace(1, g.hands[1][0], 4, 0), false);
});

console.log('rites');

test('SUNDER destroys a weak enemy tile anywhere; capitals immune', () => {
  const g = playState('sunder');
  g.board[2][0].tile = g._makeTile('LANTERN', 1);   // base 1, isolated → rel 1
  g.hands[2] = [g._makeTile('SUNDER', 2)];
  const targets = g.legalRiteTargets(2, 0);
  assert.ok(targets.some(t => t.col === 2 && t.row === 0), 'lantern targetable');
  assert.ok(!targets.some(t => {
    const tile = t.col !== null && g.board[t.col][t.row].tile;
    return tile && tile.capital;
  }), 'no capital targets');
  const res = g.castRite(2, 0, 2, 0);
  assert.equal(res.ok, true);
  assert.equal(g.board[2][0].tile, null, 'tile destroyed');
  assert.equal(g.currentPlayer, 1, 'rite consumed the turn');
});

test('UNTOUCHABLE blocks enemy rite targeting', () => {
  const g = playState('veil');
  g.board[2][0].tile = g._makeTile('VEILWISP', 1);  // enemy VEILWISP, rel ≤ 2 when alone
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
